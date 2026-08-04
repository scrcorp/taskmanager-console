import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
  type QueryClient,
} from "@tanstack/react-query";
import type { AxiosResponse } from "axios";
import api from "@/lib/api";
import { useMutationResult } from "@/lib/mutationResult";

/**
 * EMPID Import hooks — legacy roster Excel → per-store empid registration.
 *
 * Flow (see /users/bulk/empid):
 *   1. usePreviewEmpidImport — upload the file, server parses and buckets rows.
 *   2. useCommitEmpidImport  — operator-checked (user, store, empid) list is applied.
 *
 * Server: app/api/console/empid_import.py (permission users:update).
 * Types are defined here (not in types/index.ts) — response shapes are local
 * to this feature and types/index.ts is being edited concurrently elsewhere.
 */

// ─── Preview types ────────────────────────────────────────────────────────────

export type EmpidEntryAction =
  | "same"
  | "rebind"
  | "new_assignment"
  | "unmatched_store"
  | "invalid"
  /** Store & number valid, but the user is unresolved (placeholder/deferred) — operator picks a user. */
  | "needs_user";

/** One person × store row from the uploaded file. */
export interface EmpidImportEntry {
  /** Matched store UUID (null = unmatched). */
  store_id: string | null;
  store_name: string | null;
  /** Raw COMPANY cell from the file. */
  company: string;
  /** Raw emp_id cell (leading zeros preserved). */
  emp_id_raw: string;
  /** Normalized integer empid (null = invalid). */
  emp_id: number | null;
  /** Current org_member_stores.empid, if any. */
  current_empid: number | null;
  /** Whether a store assignment row already exists. */
  has_assignment: boolean;
  /** Dormant assignment — the number is written but the person stays out of work assignment. */
  dormant: boolean;
  action: EmpidEntryAction;
  /** Non-blocking warning (e.g. group-scope conflict). */
  warning: string | null;
  /** Person name from the file row — per-row label for shared-email (placeholder) rows. */
  person_name: string | null;
}

/** User-picker prefill candidate (deferred bucket; placeholder has an empty list). */
export interface EmpidSimilarUser {
  user_id: string;
  full_name: string;
  email: string | null;
}

/** One person group in the preview response. */
export interface EmpidImportPerson {
  email: string | null;
  name: string;
  /** Matched console user id (null in placeholder/deferred buckets). */
  user_id: string | null;
  user_full_name: string | null;
  entries: EmpidImportEntry[];
  note: string;
  /** deferred bucket — similar-name DB user hints (display only). */
  similar: string[];
  /** placeholder bucket — people in the file sharing the dummy email. */
  members: string[];
  /** User-picker prefill candidates (deferred only; empty for placeholder). */
  similar_users: EmpidSimilarUser[];
}

export interface EmpidImportCounts {
  people: number;
  same: number;
  rebind: number;
  new_assignment: number;
  unmatched_store: number;
  invalid: number;
  needs_user: number;
  placeholder: number;
  deferred: number;
  excluded_rows: number;
  total_rows: number;
}

export interface EmpidImportPreviewResult {
  /** Matched users — actionable. */
  people: EmpidImportPerson[];
  /** Dummy/shared-email people — report only. */
  placeholder: EmpidImportPerson[];
  /** No DB match — report only. */
  deferred: EmpidImportPerson[];
  counts: EmpidImportCounts;
  excluded_rows: number;
  total_rows: number;
}

// ─── Commit types ─────────────────────────────────────────────────────────────

export interface EmpidCommitAssignment {
  user_id: string;
  store_id: string;
  /** null = clear the number (assignment row is kept, number released). */
  empid: number | null;
}

export interface EmpidCommitRequest {
  assignments: EmpidCommitAssignment[];
}

export interface EmpidCommitApplied {
  user: string;
  store: string;
  /** null = the number was cleared. */
  empid: number | null;
  created: boolean;
}

/** An existing member whose number was taken and got renumbered. */
export interface EmpidCommitRenumbered {
  user: string;
  store: string;
  old: number;
  new: number;
}

export interface EmpidCommitSkipped {
  user: string;
  store: string;
  empid: number;
  reason: string;
}

export interface EmpidCommitRejected {
  user_id: string;
  store_id: string;
  reason: string;
}

export interface EmpidCommitResult {
  applied: EmpidCommitApplied[];
  renumbered: EmpidCommitRenumbered[];
  skipped: EmpidCommitSkipped[];
  rejected: EmpidCommitRejected[];
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

/**
 * EMPID import preview — parse the legacy roster without writing anything.
 * Pass a FormData with the file under field "file" (.xlsx/.csv).
 */
/**
 * current export 필터 — mode="blank" 는 서버가 필터를 무시합니다(빈 템플릿).
 *
 * Filters for the current-roster export (server ignores them for blank).
 */
export interface EmpidTemplateFilters {
  /** Store UUIDs to include — omit for every store. */
  stores?: string[];
  /** Person scope (default all). */
  people?: "all" | "numbered" | "unnumbered";
  /** Include dormant assignments (default true). */
  include_dormant?: boolean;
  /** Include emails (default true — false blanks the Email cells). */
  include_email?: boolean;
  /** Include current numbers (default true — false blanks the emp_id cells). */
  include_numbers?: boolean;
}

/**
 * 임포트용 xlsx 다운로드 훅 — blank(빈 템플릿) / current(현황 export, 왕복 편집용).
 * current 는 filters 로 매장/사람/포함 컬럼을 좁힐 수 있습니다.
 *
 * Download the import-format workbook: a blank template or the current
 * per-store EMPID roster (edit and re-upload for a round trip). For
 * mode="current", filters narrow the stores/people/columns included.
 */
export const useDownloadEmpidTemplate = (): ((
  mode: "blank" | "current",
  filters?: EmpidTemplateFilters,
) => Promise<void>) => {
  return async (
    mode: "blank" | "current",
    filters?: EmpidTemplateFilters,
  ): Promise<void> => {
    const { stores, ...rest } = filters ?? {};
    const response: AxiosResponse<Blob> = await api.get(
      "/console/empid-import/template",
      {
        params: {
          mode,
          ...rest,
          // 전체 매장이면 stores 생략 (서버 기본) / omit for every store
          ...(stores && stores.length > 0 ? { stores: stores.join(",") } : {}),
        },
        responseType: "blob",
      },
    );
    const url = URL.createObjectURL(response.data);
    const a = document.createElement("a");
    a.href = url;
    a.download = mode === "current" ? "empid_export.xlsx" : "empid_import_template.xlsx";
    a.click();
    URL.revokeObjectURL(url);
  };
};

export const usePreviewEmpidImport = (): UseMutationResult<
  EmpidImportPreviewResult,
  Error,
  FormData
> => {
  const { error } = useMutationResult();
  return useMutation<EmpidImportPreviewResult, Error, FormData>({
    mutationFn: async (formData: FormData): Promise<EmpidImportPreviewResult> => {
      const response: AxiosResponse<EmpidImportPreviewResult> = await api.post(
        "/console/empid-import/preview",
        formData,
        { headers: { "Content-Type": "multipart/form-data" } },
      );
      return response.data;
    },
    onError: error("Couldn't preview EMPID import"),
  });
};

/**
 * EMPID import commit — apply the operator-checked assignments.
 * Existing members holding a taken number may be renumbered by the server.
 */
export const useCommitEmpidImport = (): UseMutationResult<
  EmpidCommitResult,
  Error,
  EmpidCommitRequest
> => {
  const queryClient: QueryClient = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<EmpidCommitResult, Error, EmpidCommitRequest>({
    mutationFn: async (data): Promise<EmpidCommitResult> => {
      const response: AxiosResponse<EmpidCommitResult> = await api.post(
        "/console/empid-import/commit",
        data,
      );
      return response.data;
    },
    onSuccess: (result): void => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      // 삭제(cleared)·재채번(renumbered) 부수효과까지 요약 — 결과 패널을 못 봐도 알 수 있게
      const applied = result.applied ?? [];
      const cleared = applied.filter((a) => a.empid === null).length;
      const written = applied.length - cleared;
      const renumbered = result.renumbered?.length ?? 0;
      const parts: string[] = [];
      if (written > 0) parts.push(`${written} applied`);
      if (cleared > 0) parts.push(`${cleared} cleared`);
      if (renumbered > 0) parts.push(`${renumbered} renumbered`);
      success(parts.length > 0 ? `${parts.join(", ")}.` : "No changes applied.");
    },
    onError: error("Couldn't apply EMPID import"),
  });
};
