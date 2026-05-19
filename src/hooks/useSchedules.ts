import { useQuery, useMutation, useQueryClient, type UseQueryResult, type UseMutationResult } from "@tanstack/react-query";
import type { AxiosResponse } from "axios";
import api from "@/lib/api";
import { useModal } from "@/components/ui/imperative-modal";
import { parseApiError } from "@/lib/utils";
import type { Schedule, ScheduleBulkCreate, ScheduleBulkResult, ScheduleCreate, ScheduleUpdate, ScheduleValidation, PaginatedResponse, BulkPreviewEntry, BulkPreviewResponse, BulkUpdateRequest, BulkUpdateResult, BulkDeleteRequest, BulkDeleteResult } from "@/types";

/** mutation 공통 onError(modal) — parseApiError 로 status code별 친화 메시지 사용 */
function useErrorToast() {
  const modal = useModal();
  return (action: string) => (err: unknown) => {
    void modal.alert({ type: "error", title: action, message: parseApiError(err, "Unexpected error") });
  };
}

/** mutation 성공 시 일관된 결과 모달 띄우는 helper — 사용자가 직접 닫아 결과를 인지 */
function useSuccessToast() {
  const modal = useModal();
  return (message: string) => {
    void modal.alert({ type: "success", message });
  };
}

export const useSchedule = (
  id: string | undefined,
): UseQueryResult<Schedule, Error> => {
  return useQuery<Schedule, Error>({
    queryKey: ["schedules", id],
    queryFn: async () => {
      const res: AxiosResponse<Schedule> = await api.get(`/console/schedules/${id}`);
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
      const res: AxiosResponse<PaginatedResponse<Schedule>> = await api.get("/console/schedules", { params });
      return res.data;
    },
    enabled: !filters.user_ids || filters.user_ids.length > 0, // user_ids 비어있으면 fetch 막음 (잘못된 전체 조회 방지)
  });
};

export const useValidateSchedule = (): UseMutationResult<ScheduleValidation, Error, ScheduleCreate> => {
  return useMutation<ScheduleValidation, Error, ScheduleCreate>({
    mutationFn: async (data) => {
      const res: AxiosResponse<ScheduleValidation> = await api.post("/console/schedules/validate", data);
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
      const res: AxiosResponse<Schedule> = await api.post("/console/schedules", data);
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["schedules"] });
      onOk("Schedule created.");
    },
    onError: onErr("Failed to create schedule"),
  });
};

export const useBulkCreateSchedules = (options?: {
  silent?: boolean;
}): UseMutationResult<ScheduleBulkResult, Error, ScheduleBulkCreate> => {
  const qc = useQueryClient();
  const onErr = useErrorToast();
  const onOk = useSuccessToast();
  return useMutation<ScheduleBulkResult, Error, ScheduleBulkCreate>({
    mutationFn: async (data) => {
      const res: AxiosResponse<ScheduleBulkResult> = await api.post("/console/schedules/bulk", data);
      return res.data;
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["schedules"] });
      if (!options?.silent) {
        const created = (result as { created?: number })?.created ?? 0;
        onOk(`${created} schedule${created === 1 ? "" : "s"} created.`);
      }
    },
    onError: options?.silent ? undefined : onErr("Failed to bulk create schedules"),
  });
};

export const useUpdateSchedule = (): UseMutationResult<Schedule, Error, { id: string; data: ScheduleUpdate }> => {
  const qc = useQueryClient();
  const onErr = useErrorToast();
  const onOk = useSuccessToast();
  return useMutation<Schedule, Error, { id: string; data: ScheduleUpdate }>({
    mutationFn: async ({ id, data }) => {
      const res: AxiosResponse<Schedule> = await api.patch(`/console/schedules/${id}`, data);
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
    mutationFn: async (id) => { await api.delete(`/console/schedules/${id}`); },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["schedules"] });
      qc.invalidateQueries({ queryKey: ["schedule-history"] });
      onOk("Schedule deleted.");
    },
    onError: onErr("Failed to delete schedule"),
  });
};

/**
 * "스케줄 삭제하시겠습니까?" confirm 모달 + delete mutation 을 하나로 묶은 흐름.
 *
 * 어디서 호출되든 confirm 메시지/톤/시스템이 동일 — Edit Modal, Detail page, Calendar view 모두 같은 UX.
 *
 * 사용:
 *   const deleteFlow = useDeleteScheduleFlow();
 *   await deleteFlow(id, () => router.push("/schedules"));
 *
 * @returns Promise<boolean> — true: 사용자가 confirm 후 mutation 시작 / false: 취소 (mutation 안 함)
 *
 * 주의: 반환값 true 는 "확정"을 의미할 뿐 mutation 성공이 아님.
 * mutation 의 결과 모달은 hook 의 onSuccess/onError 가 알아서 띄움.
 * 성공 후 페이지 이동/refetch 같은 후처리는 onDone 콜백으로.
 */
export function useDeleteScheduleFlow() {
  const modal = useModal();
  const deleteMutation = useDeleteSchedule();
  return async (id: string, onDone?: () => void): Promise<boolean> => {
    const ok = await modal.confirm({
      title: "Delete Schedule",
      message: "This schedule will be permanently deleted. This action cannot be undone.",
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return false;
    deleteMutation.mutate(id, { onSuccess: onDone });
    return true;
  };
}

export const useGenerateFromRequests = (): UseMutationResult<Schedule[], Error, string> => {
  const qc = useQueryClient();
  const onErr = useErrorToast();
  const onOk = useSuccessToast();
  return useMutation<Schedule[], Error, string>({
    mutationFn: async (periodId) => {
      const res: AxiosResponse<Schedule[]> = await api.post(`/console/schedules/generate-from-requests?period_id=${periodId}`);
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
      const res: AxiosResponse<Schedule> = await api.post(`/console/schedules/${id}/confirm`);
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
      const res: AxiosResponse<Schedule> = await api.post(`/console/schedules/${id}/reject`, { rejection_reason: rejection_reason ?? null });
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
      const res: AxiosResponse<Schedule> = await api.post(`/console/schedules/${id}/submit`);
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
      const res: AxiosResponse<Schedule> = await api.post(`/console/schedules/${id}/revert`);
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
      const res: AxiosResponse<Schedule> = await api.post(`/console/schedules/${id}/cancel`, { cancellation_reason: cancellation_reason ?? null });
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
        `/console/schedules/${id}/switch`,
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
      const res: AxiosResponse<ScheduleAuditLogEntry[]> = await api.get(`/console/schedules/${id}/audit`);
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
    mutationFn: async (logId) => { await api.delete(`/console/schedules/history/${logId}`); },
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
        await api.get("/console/schedules/history", { params });
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
      const res: AxiosResponse<BulkPreviewResponse> = await api.post("/console/schedules/bulk/preview", data);
      return res.data;
    },
    onError: onErr("Preview failed"),
  });
};

export const useBulkUpdateSchedules = (options?: {
  silent?: boolean;
}): UseMutationResult<BulkUpdateResult, Error, BulkUpdateRequest> => {
  const qc = useQueryClient();
  const onErr = useErrorToast();
  const onOk = useSuccessToast();
  return useMutation<BulkUpdateResult, Error, BulkUpdateRequest>({
    mutationFn: async (data) => {
      const res: AxiosResponse<BulkUpdateResult> = await api.patch("/console/schedules/bulk", data);
      return res.data;
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["schedules"] });
      if (!options?.silent) {
        const updated = (result as { updated?: number })?.updated ?? 0;
        onOk(`${updated} schedule${updated === 1 ? "" : "s"} updated.`);
      }
    },
    onError: options?.silent ? undefined : onErr("Bulk update failed"),
  });
};

export const useBulkDeleteSchedules = (options?: {
  silent?: boolean;
}): UseMutationResult<BulkDeleteResult, Error, BulkDeleteRequest> => {
  const qc = useQueryClient();
  const onErr = useErrorToast();
  const onOk = useSuccessToast();
  return useMutation<BulkDeleteResult, Error, BulkDeleteRequest>({
    mutationFn: async (data) => {
      const res: AxiosResponse<BulkDeleteResult> = await api.delete("/console/schedules/bulk", { data });
      return res.data;
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["schedules"] });
      if (!options?.silent) {
        const deleted = (result as { deleted?: number })?.deleted ?? 0;
        onOk(`${deleted} schedule${deleted === 1 ? "" : "s"} deleted.`);
      }
    },
    onError: options?.silent ? undefined : onErr("Bulk delete failed"),
  });
};

export const useBulkConfirmSchedules = (): UseMutationResult<{ confirmed: number; errors: string[] }, Error, { store_id: string; date_from: string; date_to: string }> => {
  const qc = useQueryClient();
  const modal = useModal();
  const onErr = useErrorToast();
  return useMutation<{ confirmed: number; errors: string[] }, Error, { store_id: string; date_from: string; date_to: string }>({
    mutationFn: async (params) => {
      const res: AxiosResponse<{ confirmed: number; errors: string[] }> = await api.post("/console/schedules/bulk-confirm", params);
      return res.data;
    },
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["schedules"] });
      const errCount = result.errors?.length ?? 0;
      if (errCount > 0) {
        // 부분 성공 — error 모달에 details 로 실패 항목들 표시
        void modal.alert({
          type: "error",
          title: "Bulk confirm finished with issues",
          message: `Confirmed ${result.confirmed} schedule${result.confirmed === 1 ? "" : "s"}, but ${errCount} failed.`,
          details: result.errors.slice(0, 5),
        });
      } else {
        void modal.alert({
          type: "success",
          title: "Confirmed",
          message: `${result.confirmed} schedule${result.confirmed === 1 ? "" : "s"} confirmed.`,
        });
      }
    },
    onError: onErr("Couldn't bulk-confirm schedules"),
  });
};
