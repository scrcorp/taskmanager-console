/**
 * Evaluation React Query hooks (v1).
 *
 * Backs the evaluations feature against `/api/v1/console/evaluations`:
 *  - Templates (read-only): the single org-wide Basic Performance Evaluation.
 *  - Evaluations: list / detail / create / update / delete (soft).
 *  - Evaluatable users: direction-filtered employee picker (strictly-lower
 *    authority), optionally scoped to a store.
 *
 * Submit is not a separate action — pass `status: "submitted"` on create/update
 * (the submit-gate is enforced server-side). Mutation result modals fire from
 * `useMutationResult`; callers must NOT re-show success/error.
 */
import {
  useQuery,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  keepPreviousData,
  type UseQueryResult,
  type UseInfiniteQueryResult,
  type InfiniteData,
  type UseMutationResult,
} from "@tanstack/react-query";
import type { AxiosResponse } from "axios";
import api from "@/lib/api";
import { useMutationResult } from "@/lib/mutationResult";
import type {
  EvalTemplate,
  Evaluation,
  EvaluationCreate,
  EvaluationUpdate,
  EvaluationFilters,
  EvaluatableUser,
  EvaluatableUsersPage,
  PaginatedResponse,
} from "@/types";

// ─── Query keys ─────────────────────────────────────────────────────────────
const KEYS = {
  templates: ["eval-templates"] as const,
  template: (id: string) => ["eval-template", id] as const,
  list: (filters: EvaluationFilters) => ["evaluations", filters] as const,
  detail: (id: string) => ["evaluation", id] as const,
  evaluatable: (storeId?: string) => ["evaluatable-users", storeId ?? null] as const,
  evaluatableInfinite: (q: string, storeId?: string) =>
    ["evaluatable-users", { q, storeId: storeId ?? null }] as const,
};

const EVALUATABLE_PAGE_SIZE = 30;

/** Invalidate every evaluation list + the dashboard summary after a mutation. */
function invalidateEvaluations(
  qc: ReturnType<typeof useQueryClient>,
  evaluationId?: string,
): void {
  qc.invalidateQueries({ queryKey: ["evaluations"] });
  qc.invalidateQueries({ queryKey: ["dashboard", "evaluation-summary"] });
  if (evaluationId) qc.invalidateQueries({ queryKey: KEYS.detail(evaluationId) });
}

// === Templates (read-only) ===================================================

/** The org's evaluation templates — v1 returns exactly the one Basic. */
export const useEvalTemplates = (): UseQueryResult<EvalTemplate[], Error> => {
  return useQuery({
    queryKey: KEYS.templates,
    queryFn: async () => {
      const res: AxiosResponse<EvalTemplate[]> = await api.get(
        "/console/evaluations/templates",
      );
      return res.data;
    },
  });
};

/** Single evaluation template by id. */
export const useEvalTemplate = (
  templateId: string | undefined,
): UseQueryResult<EvalTemplate, Error> => {
  return useQuery({
    queryKey: KEYS.template(templateId ?? ""),
    queryFn: async () => {
      const res: AxiosResponse<EvalTemplate> = await api.get(
        `/console/evaluations/templates/${templateId}`,
      );
      return res.data;
    },
    enabled: !!templateId,
  });
};

// === Evaluatable users (picker) ==============================================

/**
 * Users the current user may evaluate (strictly-lower authority, active).
 * Pass a `storeId` to restrict to that store's assignees (and prefill).
 *
 * Flat variant — fetches the first page only (legacy callers that need a small
 * list without paging). The employee picker uses the infinite variant below.
 */
export const useEvaluatableUsers = (
  storeId?: string,
): UseQueryResult<EvaluatableUser[], Error> => {
  return useQuery({
    queryKey: KEYS.evaluatable(storeId),
    queryFn: async () => {
      const res: AxiosResponse<EvaluatableUsersPage> = await api.get(
        "/console/evaluations/evaluatable-users",
        { params: storeId ? { store_id: storeId } : undefined },
      );
      return res.data.items;
    },
  });
};

/**
 * Paginated + server-searched evaluatable users for the employee picker.
 * First page loads fast; the modal fetches more on scroll and re-queries on a
 * debounced search term. Direction filtering + org scoping stay server-side.
 */
export const useInfiniteEvaluatableUsers = (
  q: string,
  storeId?: string,
): UseInfiniteQueryResult<InfiniteData<EvaluatableUsersPage>, Error> => {
  return useInfiniteQuery<EvaluatableUsersPage, Error>({
    queryKey: KEYS.evaluatableInfinite(q, storeId),
    queryFn: async ({ pageParam }): Promise<EvaluatableUsersPage> => {
      const params: Record<string, string | number> = {
        page: (pageParam as number) ?? 1,
        limit: EVALUATABLE_PAGE_SIZE,
      };
      if (q) params.q = q;
      if (storeId) params.store_id = storeId;
      const res: AxiosResponse<EvaluatableUsersPage> = await api.get(
        "/console/evaluations/evaluatable-users",
        { params },
      );
      return res.data;
    },
    initialPageParam: 1,
    getNextPageParam: (last) => (last.has_more ? last.page + 1 : undefined),
    placeholderData: keepPreviousData,
  });
};

// === Evaluations =============================================================

/** Evaluation list (org-scoped, soft-deleted excluded, created_at DESC). */
export const useEvaluations = (
  filters: EvaluationFilters = {},
): UseQueryResult<PaginatedResponse<Evaluation>, Error> => {
  return useQuery({
    queryKey: KEYS.list(filters),
    queryFn: async () => {
      const params: Record<string, string | number> = {};
      if (filters.store_id) params.store_id = filters.store_id;
      if (filters.status) params.status = filters.status;
      if (filters.evaluatee_id) params.evaluatee_id = filters.evaluatee_id;
      params.page = filters.page ?? 1;
      params.per_page = filters.per_page ?? 20;
      const res: AxiosResponse<PaginatedResponse<Evaluation>> = await api.get(
        "/console/evaluations",
        { params },
      );
      return res.data;
    },
    placeholderData: (prev) => prev,
  });
};

/** Single evaluation by id. */
export const useEvaluation = (
  evaluationId: string | undefined,
): UseQueryResult<Evaluation, Error> => {
  return useQuery({
    queryKey: KEYS.detail(evaluationId ?? ""),
    queryFn: async () => {
      const res: AxiosResponse<Evaluation> = await api.get(
        `/console/evaluations/${evaluationId}`,
      );
      return res.data;
    },
    enabled: !!evaluationId,
  });
};

/** Create an evaluation (status "draft" or "submitted"). */
export const useCreateEvaluation = (): UseMutationResult<
  Evaluation,
  Error,
  EvaluationCreate
> => {
  const qc = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<Evaluation, Error, EvaluationCreate>({
    mutationFn: async (data) => {
      const res: AxiosResponse<Evaluation> = await api.post(
        "/console/evaluations",
        data,
      );
      return res.data;
    },
    onSuccess: (evaluation) => {
      invalidateEvaluations(qc, evaluation.id);
      success(
        evaluation.status === "submitted"
          ? "Evaluation submitted."
          : "Draft saved.",
      );
    },
    onError: error("Couldn't save evaluation"),
  });
};

/** Update an evaluation (draft → submitted transition via `status`). */
export const useUpdateEvaluation = (): UseMutationResult<
  Evaluation,
  Error,
  { evaluationId: string; data: EvaluationUpdate }
> => {
  const qc = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<
    Evaluation,
    Error,
    { evaluationId: string; data: EvaluationUpdate }
  >({
    mutationFn: async ({ evaluationId, data }) => {
      const res: AxiosResponse<Evaluation> = await api.put(
        `/console/evaluations/${evaluationId}`,
        data,
      );
      return res.data;
    },
    onSuccess: (evaluation) => {
      invalidateEvaluations(qc, evaluation.id);
      success(
        evaluation.status === "submitted"
          ? "Evaluation submitted."
          : "Draft saved.",
      );
    },
    onError: error("Couldn't update evaluation"),
  });
};

/** Soft-delete an evaluation. */
export const useDeleteEvaluation = (): UseMutationResult<void, Error, string> => {
  const qc = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<void, Error, string>({
    mutationFn: async (evaluationId) => {
      await api.delete(`/console/evaluations/${evaluationId}`);
    },
    onSuccess: (_data, evaluationId) => {
      invalidateEvaluations(qc, evaluationId);
      success("Evaluation deleted.");
    },
    onError: error("Couldn't delete evaluation"),
  });
};
