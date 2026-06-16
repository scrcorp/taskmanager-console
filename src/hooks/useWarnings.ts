/**
 * Staff Warning React Query hooks (v1).
 *
 * Backs the warnings feature against `/api/v1/console/warnings`:
 *  - Warnings: list / detail / create / update (edit + resolve) / delete (soft).
 *  - Warnable users: direction-filtered employee picker (strictly-lower
 *    authority), optionally scoped to a store; each candidate carries stores[].
 *  - Counts: per-employee {total, active} for the Staff list column.
 *
 * Mutation result modals fire from `useMutationResult`; callers must NOT
 * re-show success/error.
 */
import {
  useQuery,
  useMutation,
  useQueryClient,
  useInfiniteQuery,
  keepPreviousData,
  type UseQueryResult,
  type UseMutationResult,
  type UseInfiniteQueryResult,
  type InfiniteData,
} from "@tanstack/react-query";
import type { AxiosResponse } from "axios";
import api from "@/lib/api";
import { useMutationResult } from "@/lib/mutationResult";
import type {
  Warning,
  WarningCreate,
  WarningUpdate,
  WarningFilters,
  WarnableUser,
  WarnableUsersPage,
  WarningCount,
  WarningSignRequest,
  WarningSignatureMethod,
  MySignatureResponse,
  SignatureStrokes,
  PaginatedResponse,
} from "@/types";

// ─── Query keys ─────────────────────────────────────────────────────────────
const KEYS = {
  list: (filters: WarningFilters) => ["warnings", filters] as const,
  detail: (id: string) => ["warning", id] as const,
  warnable: (storeId?: string) => ["warnable-users", storeId ?? null] as const,
  counts: ["warning-counts"] as const,
  mySignature: ["warning-my-signature"] as const,
};

/** Invalidate every warning list + counts + the detail after a mutation. */
function invalidateWarnings(
  qc: ReturnType<typeof useQueryClient>,
  warningId?: string,
): void {
  qc.invalidateQueries({ queryKey: ["warnings"] });
  qc.invalidateQueries({ queryKey: KEYS.counts });
  if (warningId) qc.invalidateQueries({ queryKey: KEYS.detail(warningId) });
}

// === Warnable users (picker) =================================================

/**
 * Users the current user may warn (strictly-lower authority, active).
 * Pass a `storeId` to restrict to that store's assignees. Each candidate
 * carries `stores[]` so the Store dropdown can be limited to their stores.
 *
 * Flat variant — first page (up to 30). Adequate for v1; a search/infinite
 * picker is a follow-up when an org has many staff.
 */
export const useWarnableUsers = (
  storeId?: string,
): UseQueryResult<WarnableUser[], Error> => {
  return useQuery({
    queryKey: KEYS.warnable(storeId),
    queryFn: async () => {
      const res: AxiosResponse<WarnableUsersPage> = await api.get(
        "/console/warnings/warnable-users",
        { params: { limit: 100, ...(storeId ? { store_id: storeId } : {}) } },
      );
      return res.data.items;
    },
  });
};

const WARNABLE_PAGE_SIZE = 30;

/**
 * Paginated + server-searched warnable users for the employee picker.
 * Mirrors the evaluations picker: scroll loads the next page; a debounced query
 * is sent to the server (use what's loaded, else fetch). Avoids the old flat
 * 100-cap that truncated the list alphabetically.
 */
export const useInfiniteWarnableUsers = (
  q: string,
  storeId?: string,
): UseInfiniteQueryResult<InfiniteData<WarnableUsersPage>, Error> => {
  return useInfiniteQuery<WarnableUsersPage, Error>({
    queryKey: ["warnable-users-infinite", { q, storeId: storeId ?? null }],
    queryFn: async ({ pageParam }): Promise<WarnableUsersPage> => {
      const params: Record<string, string | number> = {
        page: (pageParam as number) ?? 1,
        limit: WARNABLE_PAGE_SIZE,
      };
      if (q) params.q = q;
      if (storeId) params.store_id = storeId;
      const res: AxiosResponse<WarnableUsersPage> = await api.get(
        "/console/warnings/warnable-users",
        { params },
      );
      return res.data;
    },
    initialPageParam: 1,
    getNextPageParam: (last) => (last.has_more ? last.page + 1 : undefined),
    placeholderData: keepPreviousData,
  });
};

// === Counts (Staff list column) ==============================================

/** Per-employee warning counts (total/active), store-scoped server-side. */
export const useWarningCounts = (
  enabled: boolean = true,
): UseQueryResult<WarningCount[], Error> => {
  return useQuery({
    queryKey: KEYS.counts,
    queryFn: async () => {
      const res: AxiosResponse<WarningCount[]> = await api.get("/console/warnings/counts");
      return res.data;
    },
    enabled,
  });
};

// === Warnings ================================================================

/** Warning list (org-scoped, soft-deleted excluded, created_at DESC). */
export const useWarnings = (
  filters: WarningFilters = {},
): UseQueryResult<PaginatedResponse<Warning>, Error> => {
  return useQuery({
    queryKey: KEYS.list(filters),
    queryFn: async () => {
      const params: Record<string, string | number> = {};
      if (filters.store_id) params.store_id = filters.store_id;
      if (filters.status) params.status = filters.status;
      if (filters.category) params.category = filters.category;
      if (filters.subject_user_id) params.subject_user_id = filters.subject_user_id;
      params.page = filters.page ?? 1;
      params.per_page = filters.per_page ?? 20;
      const res: AxiosResponse<PaginatedResponse<Warning>> = await api.get(
        "/console/warnings/",
        { params },
      );
      return res.data;
    },
    placeholderData: (prev) => prev,
  });
};

/** Single warning by id. */
export const useWarning = (
  warningId: string | undefined,
): UseQueryResult<Warning, Error> => {
  return useQuery({
    queryKey: KEYS.detail(warningId ?? ""),
    queryFn: async () => {
      const res: AxiosResponse<Warning> = await api.get(`/console/warnings/${warningId}`);
      return res.data;
    },
    enabled: !!warningId,
  });
};

/** Issue a new warning. */
export const useCreateWarning = (): UseMutationResult<Warning, Error, WarningCreate> => {
  const qc = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<Warning, Error, WarningCreate>({
    mutationFn: async (data) => {
      const res: AxiosResponse<Warning> = await api.post("/console/warnings/", data);
      return res.data;
    },
    onSuccess: (warning) => {
      invalidateWarnings(qc, warning.id);
      success("Warning recorded.");
    },
    onError: error("Couldn't record warning"),
  });
};

/** Update a warning (edit fields and/or resolve via `status`). */
export const useUpdateWarning = (): UseMutationResult<
  Warning,
  Error,
  { warningId: string; data: WarningUpdate }
> => {
  const qc = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<Warning, Error, { warningId: string; data: WarningUpdate }>({
    mutationFn: async ({ warningId, data }) => {
      const res: AxiosResponse<Warning> = await api.put(`/console/warnings/${warningId}`, data);
      return res.data;
    },
    onSuccess: (warning) => {
      invalidateWarnings(qc, warning.id);
      success(warning.status === "withdrawn" ? "Warning withdrawn." : "Warning updated.");
    },
    onError: error("Couldn't update warning"),
  });
};

/** Soft-delete a warning. */
export const useDeleteWarning = (): UseMutationResult<void, Error, string> => {
  const qc = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<void, Error, string>({
    mutationFn: async (warningId) => {
      await api.delete(`/console/warnings/${warningId}`);
    },
    onSuccess: (_data, warningId) => {
      invalidateWarnings(qc, warningId);
      success("Warning deleted.");
    },
    onError: error("Couldn't delete warning"),
  });
};

// === Manager sign-off ========================================================

/**
 * Sign a warning as its manager. The server enforces signer == issued_by_id
 * (a non-issuer GM, and even an Owner who isn't the issuer, get 403) — the UI
 * gates this too so 403 shouldn't normally surface, but the hook still reports
 * any error via the result modal.
 */
export const useSignWarning = (): UseMutationResult<
  Warning,
  Error,
  { warningId: string; data: WarningSignRequest }
> => {
  const qc = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<Warning, Error, { warningId: string; data: WarningSignRequest }>({
    mutationFn: async ({ warningId, data }) => {
      const res: AxiosResponse<Warning> = await api.post(
        `/console/warnings/${warningId}/sign`,
        data,
      );
      return res.data;
    },
    onSuccess: (warning, { data }) => {
      invalidateWarnings(qc, warning.id);
      // A freshly drawn signature saved as default invalidates the cached one.
      if (data.save_as_default) qc.invalidateQueries({ queryKey: KEYS.mySignature });
      success("Signed as manager.");
    },
    onError: error("Couldn't sign this warning"),
  });
};

// === Manager's reusable saved signature ======================================

/** The current manager's reusable saved signature (users.signature_strokes). */
export const useMySignature = (
  enabled: boolean = true,
): UseQueryResult<SignatureStrokes | null, Error> => {
  return useQuery({
    queryKey: KEYS.mySignature,
    queryFn: async () => {
      const res: AxiosResponse<MySignatureResponse> = await api.get(
        "/console/warnings/my-signature",
      );
      return res.data.signature;
    },
    enabled,
  });
};

/** Save/replace the manager's reusable signature. */
export const useSaveMySignature = (): UseMutationResult<
  SignatureStrokes | null,
  Error,
  SignatureStrokes
> => {
  const qc = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<SignatureStrokes | null, Error, SignatureStrokes>({
    mutationFn: async (signature) => {
      const res: AxiosResponse<MySignatureResponse> = await api.put(
        "/console/warnings/my-signature",
        signature,
      );
      return res.data.signature;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.mySignature });
      success("Signature saved.");
    },
    onError: error("Couldn't save signature"),
  });
};

// === Wet sign (physical paper → scanned PDF) =================================

/**
 * Switch a warning's signature method (digital ↔ wet). When signatures or a
 * scanned PDF already exist the server invalidates them and sends a re-sign
 * notice — a destructive action the UI confirms with a danger dialog.
 */
export const useSwitchWarningMethod = (): UseMutationResult<
  Warning,
  Error,
  { warningId: string; method: WarningSignatureMethod }
> => {
  const qc = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<Warning, Error, { warningId: string; method: WarningSignatureMethod }>({
    mutationFn: async ({ warningId, method }) => {
      const res: AxiosResponse<Warning> = await api.put(
        `/console/warnings/${warningId}/method`,
        { method },
      );
      return res.data;
    },
    onSuccess: (warning) => {
      invalidateWarnings(qc, warning.id);
      success(
        warning.signature_method === "wet"
          ? "Switched to wet signature."
          : "Switched to digital signature.",
      );
    },
    onError: error("Couldn't switch signature method"),
  });
};

/**
 * Upload a wet-signed scanned PDF for a warning (multipart). `signedOn` is the
 * date the document was physically signed (defaults server-side to the upload
 * date). Server gates: the issuing manager (own warnings) OR an owner/holder of
 * `warnings:upload` (any warning).
 */
export const useUploadSignedPdf = (): UseMutationResult<
  Warning,
  Error,
  { warningId: string; file: File; signedOn?: string }
> => {
  const qc = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<Warning, Error, { warningId: string; file: File; signedOn?: string }>({
    mutationFn: async ({ warningId, file, signedOn }) => {
      const fd = new FormData();
      fd.append("file", file);
      if (signedOn) fd.append("signed_on", signedOn);
      const res: AxiosResponse<Warning> = await api.post(
        `/console/warnings/${warningId}/signed-pdf`,
        fd,
        { headers: { "Content-Type": "multipart/form-data" } },
      );
      return res.data;
    },
    onSuccess: (warning) => {
      invalidateWarnings(qc, warning.id);
      success("Signed PDF uploaded.");
    },
    onError: error("Couldn't upload signed PDF"),
  });
};

/**
 * Fetch the wet-signed PDF as an object URL. The endpoint streams the bytes and
 * requires the auth header (so it can't go straight into an <iframe src>) — we
 * fetch via the authed axios client with responseType "blob" and wrap it in a
 * blob: URL the caller revokes when done. Not a hook; call imperatively.
 */
export async function fetchSignedPdfUrl(warningId: string): Promise<string> {
  const res = await api.get(`/console/warnings/${warningId}/signed-pdf`, {
    responseType: "blob",
  });
  const blob = new Blob([res.data as BlobPart], { type: "application/pdf" });
  return URL.createObjectURL(blob);
}
