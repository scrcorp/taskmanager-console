import { useQuery, useMutation, useQueryClient, type UseQueryResult, type UseMutationResult } from "@tanstack/react-query";
import type { AxiosResponse } from "axios";
import api from "@/lib/api";
import { useResultModal } from "@/components/ui/ResultModal";
import { parseApiError } from "@/lib/utils";
import type { Schedule, ScheduleBulkCreate, ScheduleBulkResult, ScheduleCreate, ScheduleUpdate, ScheduleValidation, PaginatedResponse, BulkPreviewEntry, BulkPreviewResponse, BulkUpdateRequest, BulkUpdateResult, BulkDeleteRequest, BulkDeleteResult } from "@/types";

/** mutation에 공통 onError(modal) 부착 — parseApiError 로 status code별 친화 메시지 사용 */
function useErrorToast() {
  const { showError } = useResultModal();
  return (action: string) => (err: unknown) => {
    showError(parseApiError(err, "Unexpected error"), { title: action });
  };
}

/** mutation 성공 시 일관된 결과 모달 띄우는 helper — 사용자가 직접 닫아 결과를 인지 */
function useSuccessToast() {
  const { showSuccess } = useResultModal();
  return (message: string) => {
    showSuccess(message);
  };
}

export const useSchedule = (
  id: string | undefined,
): UseQueryResult<Schedule, Error> => {
  return useQuery<Schedule, Error>({
    queryKey: ["schedules", id],
    queryFn: async () => {
      const res: AxiosResponse<Schedule> = await api.get(`/admin/schedules/${id}`);
      return res.data;
    },
    enabled: !!id,
  });
};

export const useSchedules = (
  filters: { store_id?: string; user_id?: string; user_ids?: string[]; date_from?: string; date_to?: string; status?: string; page?: number; per_page?: number } = {},
): UseQueryResult<PaginatedResponse<Schedule>, Error> => {
  const params: Record<string, string | number> = {};
  if (filters.store_id) params.store_id = filters.store_id;
  if (filters.user_id) params.user_id = filters.user_id;
  if (filters.user_ids && filters.user_ids.length > 0) params.user_ids = filters.user_ids.join(",");
  if (filters.date_from) params.date_from = filters.date_from;
  if (filters.date_to) params.date_to = filters.date_to;
  if (filters.status) params.status = filters.status;
  if (filters.page) params.page = filters.page;
  if (filters.per_page) params.per_page = filters.per_page;
  return useQuery<PaginatedResponse<Schedule>, Error>({
    queryKey: ["schedules", params],
    queryFn: async () => {
      const res: AxiosResponse<PaginatedResponse<Schedule>> = await api.get("/admin/schedules", { params });
      return res.data;
    },
    enabled: !filters.user_ids || filters.user_ids.length > 0, // user_ids 비어있으면 fetch 막음 (잘못된 전체 조회 방지)
  });
};

export const useValidateSchedule = (): UseMutationResult<ScheduleValidation, Error, ScheduleCreate> => {
  return useMutation<ScheduleValidation, Error, ScheduleCreate>({
    mutationFn: async (data) => {
      const res: AxiosResponse<ScheduleValidation> = await api.post("/admin/schedules/validate", data);
      return res.data;
    },
  });
};

export const useCreateSchedule = (): UseMutationResult<Schedule, Error, ScheduleCreate> => {
  const qc = useQueryClient();
  const onErr = useErrorToast();
  const onOk = useSuccessToast();
  return useMutation<Schedule, Error, ScheduleCreate>({
    mutationFn: async (data) => {
      const res: AxiosResponse<Schedule> = await api.post("/admin/schedules", data);
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["schedules"] });
      onOk("Schedule created.");
    },
    onError: onErr("Failed to create schedule"),
  });
};

export const useBulkCreateSchedules = (): UseMutationResult<ScheduleBulkResult, Error, ScheduleBulkCreate> => {
  const qc = useQueryClient();
  const onErr = useErrorToast();
  const onOk = useSuccessToast();
  return useMutation<ScheduleBulkResult, Error, ScheduleBulkCreate>({
    mutationFn: async (data) => {
      const res: AxiosResponse<ScheduleBulkResult> = await api.post("/admin/schedules/bulk", data);
      return res.data;
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["schedules"] });
      const created = (result as { created?: number })?.created ?? 0;
      onOk(`${created} schedule${created === 1 ? "" : "s"} created.`);
    },
    onError: onErr("Failed to bulk create schedules"),
  });
};

export const useUpdateSchedule = (): UseMutationResult<Schedule, Error, { id: string; data: ScheduleUpdate }> => {
  const qc = useQueryClient();
  const onErr = useErrorToast();
  const onOk = useSuccessToast();
  return useMutation<Schedule, Error, { id: string; data: ScheduleUpdate }>({
    mutationFn: async ({ id, data }) => {
      const res: AxiosResponse<Schedule> = await api.patch(`/admin/schedules/${id}`, data);
      return res.data;
    },
    onSuccess: (updated, variables) => {
      qc.setQueryData(["schedules", variables.id], updated);
      qc.invalidateQueries({ queryKey: ["schedules"] });
      qc.invalidateQueries({ queryKey: ["schedules", variables.id, "audit"] });
      qc.invalidateQueries({ queryKey: ["schedule-history"] });
      onOk("Schedule updated.");
    },
    onError: onErr("Failed to update schedule"),
  });
};

export const useDeleteSchedule = (): UseMutationResult<void, Error, string> => {
  const qc = useQueryClient();
  const onErr = useErrorToast();
  const onOk = useSuccessToast();
  return useMutation<void, Error, string>({
    mutationFn: async (id) => { await api.delete(`/admin/schedules/${id}`); },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["schedules"] });
      qc.invalidateQueries({ queryKey: ["schedule-history"] });
      onOk("Schedule deleted.");
    },
    onError: onErr("Failed to delete schedule"),
  });
};

export const useGenerateFromRequests = (): UseMutationResult<Schedule[], Error, string> => {
  const qc = useQueryClient();
  const onErr = useErrorToast();
  const onOk = useSuccessToast();
  return useMutation<Schedule[], Error, string>({
    mutationFn: async (periodId) => {
      const res: AxiosResponse<Schedule[]> = await api.post(`/admin/schedules/generate-from-requests?period_id=${periodId}`);
      return res.data;
    },
    onSuccess: (created) => {
      qc.invalidateQueries({ queryKey: ["schedules"] });
      onOk(`${created.length} schedule${created.length === 1 ? "" : "s"} generated.`);
    },
    onError: onErr("Failed to generate schedules"),
  });
};

export const useConfirmSchedule = (): UseMutationResult<Schedule, Error, string> => {
  const qc = useQueryClient();
  const onErr = useErrorToast();
  const onOk = useSuccessToast();
  return useMutation<Schedule, Error, string>({
    mutationFn: async (id) => {
      const res: AxiosResponse<Schedule> = await api.post(`/admin/schedules/${id}/confirm`);
      return res.data;
    },
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ["schedules"] });
      qc.invalidateQueries({ queryKey: ["schedules", id, "audit"] });
      qc.invalidateQueries({ queryKey: ["schedule-history"] });
      onOk("Schedule confirmed.");
    },
    onError: onErr("Failed to confirm schedule"),
  });
};

export const useRejectSchedule = (): UseMutationResult<Schedule, Error, { id: string; rejection_reason?: string }> => {
  const qc = useQueryClient();
  const onErr = useErrorToast();
  const onOk = useSuccessToast();
  return useMutation<Schedule, Error, { id: string; rejection_reason?: string }>({
    mutationFn: async ({ id, rejection_reason }) => {
      const res: AxiosResponse<Schedule> = await api.post(`/admin/schedules/${id}/reject`, { rejection_reason: rejection_reason ?? null });
      return res.data;
    },
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ["schedules"] });
      qc.invalidateQueries({ queryKey: ["schedules", id, "audit"] });
      qc.invalidateQueries({ queryKey: ["schedule-history"] });
      onOk("Schedule rejected.");
    },
    onError: onErr("Failed to reject schedule"),
  });
};

// ─── 신규 상태 전환 (Phase 2 server) ──────────────────────────

export const useSubmitSchedule = (): UseMutationResult<Schedule, Error, string> => {
  const qc = useQueryClient();
  const onErr = useErrorToast();
  const onOk = useSuccessToast();
  return useMutation<Schedule, Error, string>({
    mutationFn: async (id) => {
      const res: AxiosResponse<Schedule> = await api.post(`/admin/schedules/${id}/submit`);
      return res.data;
    },
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ["schedules"] });
      qc.invalidateQueries({ queryKey: ["schedules", id, "audit"] });
      qc.invalidateQueries({ queryKey: ["schedule-history"] });
      onOk("Submitted for approval.");
    },
    onError: onErr("Failed to submit schedule"),
  });
};

export const useRevertSchedule = (): UseMutationResult<Schedule, Error, string> => {
  const qc = useQueryClient();
  const onErr = useErrorToast();
  const onOk = useSuccessToast();
  return useMutation<Schedule, Error, string>({
    mutationFn: async (id) => {
      const res: AxiosResponse<Schedule> = await api.post(`/admin/schedules/${id}/revert`);
      return res.data;
    },
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ["schedules"] });
      qc.invalidateQueries({ queryKey: ["schedules", id, "audit"] });
      qc.invalidateQueries({ queryKey: ["schedule-history"] });
      onOk("Reverted to draft.");
    },
    onError: onErr("Failed to revert schedule"),
  });
};

export const useCancelSchedule = (): UseMutationResult<Schedule, Error, { id: string; cancellation_reason?: string }> => {
  const qc = useQueryClient();
  const onErr = useErrorToast();
  const onOk = useSuccessToast();
  return useMutation<Schedule, Error, { id: string; cancellation_reason?: string }>({
    mutationFn: async ({ id, cancellation_reason }) => {
      const res: AxiosResponse<Schedule> = await api.post(`/admin/schedules/${id}/cancel`, { cancellation_reason: cancellation_reason ?? null });
      return res.data;
    },
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: ["schedules"] });
      qc.invalidateQueries({ queryKey: ["schedules", id, "audit"] });
      qc.invalidateQueries({ queryKey: ["schedule-history"] });
      onOk("Schedule cancelled.");
    },
    onError: onErr("Failed to cancel schedule"),
  });
};

export const useSwitchSchedule = (): UseMutationResult<{ a: Schedule; b: Schedule }, Error, { id: string; other_schedule_id: string; reason?: string }> => {
  const qc = useQueryClient();
  return useMutation<{ a: Schedule; b: Schedule }, Error, { id: string; other_schedule_id: string; reason?: string }>({
    mutationFn: async ({ id, other_schedule_id, reason }) => {
      const res: AxiosResponse<{ a: Schedule; b: Schedule }> = await api.post(
        `/admin/schedules/${id}/switch`,
        { other_schedule_id, reason: reason ?? null },
      );
      return res.data;
    },
    onSuccess: (_, { id, other_schedule_id }) => {
      qc.invalidateQueries({ queryKey: ["schedules"] });
      qc.invalidateQueries({ queryKey: ["schedules", id, "audit"] });
      qc.invalidateQueries({ queryKey: ["schedules", other_schedule_id, "audit"] });
      qc.invalidateQueries({ queryKey: ["schedule-history"] });
    },
    // Errors are surfaced inline in SwapModal via callsite onError. No default toast.
  });
};

// ─── Audit log ────────────────────────────────────────────────

export interface ScheduleAuditLogEntry {
  id: string;
  schedule_id: string;
  event_type: string;
  actor_id: string | null;
  actor_name: string | null;
  actor_role: string | null;
  timestamp: string;
  description: string | null;
  reason: string | null;
  diff: Record<string, { old: unknown; new: unknown }> | null;
}

export const useScheduleAuditLog = (
  id: string | undefined,
): UseQueryResult<ScheduleAuditLogEntry[], Error> => {
  return useQuery<ScheduleAuditLogEntry[], Error>({
    queryKey: ["schedules", id, "audit"],
    queryFn: async () => {
      const res: AxiosResponse<ScheduleAuditLogEntry[]> = await api.get(`/admin/schedules/${id}/audit`);
      return res.data;
    },
    enabled: !!id,
  });
};

// ─── Aggregated history (GM+ only) ─────────────────────────────

export interface ScheduleHistoryItem {
  id: string;
  schedule_id: string;
  event_type: string;
  actor_id: string | null;
  actor_name: string | null;
  actor_role: string | null;
  timestamp: string;
  description: string | null;
  reason: string | null;
  diff: Record<string, { old: unknown; new: unknown }> | null;
  // schedule snapshot
  work_date: string;
  start_time: string | null;
  end_time: string | null;
  user_id: string;
  user_name: string | null;
  store_id: string;
  store_name: string | null;
  schedule_status: string;
  work_role_name: string | null;
}

export interface ScheduleHistoryFilters {
  store_id?: string;
  user_id?: string;
  actor_id?: string;
  event_type?: string;
  date_from?: string;
  date_to?: string;
  page?: number;
  per_page?: number;
}

export const useDeleteScheduleHistoryEntry = (): UseMutationResult<void, Error, string> => {
  const qc = useQueryClient();
  const onErr = useErrorToast();
  const onOk = useSuccessToast();
  return useMutation<void, Error, string>({
    mutationFn: async (logId) => { await api.delete(`/admin/schedules/history/${logId}`); },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["schedule-history"] });
      qc.invalidateQueries({ queryKey: ["schedules"] });
      onOk("History entry deleted.");
    },
    onError: onErr("Failed to delete history entry"),
  });
};

export const useScheduleHistory = (
  filters: ScheduleHistoryFilters = {},
): UseQueryResult<{ items: ScheduleHistoryItem[]; total: number; page: number; per_page: number }, Error> => {
  const params: Record<string, string | number> = {};
  if (filters.store_id) params.store_id = filters.store_id;
  if (filters.user_id) params.user_id = filters.user_id;
  if (filters.actor_id) params.actor_id = filters.actor_id;
  if (filters.event_type) params.event_type = filters.event_type;
  if (filters.date_from) params.date_from = filters.date_from;
  if (filters.date_to) params.date_to = filters.date_to;
  if (filters.page) params.page = filters.page;
  if (filters.per_page) params.per_page = filters.per_page;
  return useQuery({
    queryKey: ["schedule-history", params],
    queryFn: async () => {
      const res: AxiosResponse<{ items: ScheduleHistoryItem[]; total: number; page: number; per_page: number }> =
        await api.get("/admin/schedules/history", { params });
      return res.data;
    },
    // 페이지 재진입 시 항상 최신 history 가져오기 (변경이 자주 일어나는 데이터)
    refetchOnMount: "always",
  });
};

export const useBulkPreviewSchedules = (): UseMutationResult<BulkPreviewResponse, Error, { entries: BulkPreviewEntry[] }> => {
  const onErr = useErrorToast();
  return useMutation<BulkPreviewResponse, Error, { entries: BulkPreviewEntry[] }>({
    mutationFn: async (data) => {
      const res: AxiosResponse<BulkPreviewResponse> = await api.post("/admin/schedules/bulk/preview", data);
      return res.data;
    },
    onError: onErr("Preview failed"),
  });
};

export const useBulkUpdateSchedules = (): UseMutationResult<BulkUpdateResult, Error, BulkUpdateRequest> => {
  const qc = useQueryClient();
  const onErr = useErrorToast();
  const onOk = useSuccessToast();
  return useMutation<BulkUpdateResult, Error, BulkUpdateRequest>({
    mutationFn: async (data) => {
      const res: AxiosResponse<BulkUpdateResult> = await api.patch("/admin/schedules/bulk", data);
      return res.data;
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["schedules"] });
      const updated = (result as { updated?: number })?.updated ?? 0;
      onOk(`${updated} schedule${updated === 1 ? "" : "s"} updated.`);
    },
    onError: onErr("Bulk update failed"),
  });
};

export const useBulkDeleteSchedules = (): UseMutationResult<BulkDeleteResult, Error, BulkDeleteRequest> => {
  const qc = useQueryClient();
  const onErr = useErrorToast();
  const onOk = useSuccessToast();
  return useMutation<BulkDeleteResult, Error, BulkDeleteRequest>({
    mutationFn: async (data) => {
      const res: AxiosResponse<BulkDeleteResult> = await api.delete("/admin/schedules/bulk", { data });
      return res.data;
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["schedules"] });
      const deleted = (result as { deleted?: number })?.deleted ?? 0;
      onOk(`${deleted} schedule${deleted === 1 ? "" : "s"} deleted.`);
    },
    onError: onErr("Bulk delete failed"),
  });
};

export const useBulkConfirmSchedules = (): UseMutationResult<{ confirmed: number; errors: string[] }, Error, { store_id: string; date_from: string; date_to: string }> => {
  const qc = useQueryClient();
  const { showSuccess, showError } = useResultModal();
  const onErr = useErrorToast();
  return useMutation<{ confirmed: number; errors: string[] }, Error, { store_id: string; date_from: string; date_to: string }>({
    mutationFn: async (params) => {
      const res: AxiosResponse<{ confirmed: number; errors: string[] }> = await api.post("/admin/schedules/bulk-confirm", params);
      return res.data;
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["schedules"] });
      const errCount = result.errors?.length ?? 0;
      if (errCount > 0) {
        // 부분 성공 — error 모달에 details 로 실패 항목들 표시
        showError(
          `Confirmed ${result.confirmed} schedule${result.confirmed === 1 ? "" : "s"}, but ${errCount} failed.`,
          { title: "Bulk confirm finished with issues", details: result.errors.slice(0, 5) },
        );
      } else {
        showSuccess(
          `${result.confirmed} schedule${result.confirmed === 1 ? "" : "s"} confirmed.`,
          { title: "Confirmed" },
        );
      }
    },
    onError: onErr("Couldn't bulk-confirm schedules"),
  });
};
