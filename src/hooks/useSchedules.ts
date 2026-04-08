import { useQuery, useMutation, useQueryClient, type UseQueryResult, type UseMutationResult } from "@tanstack/react-query";
import type { AxiosResponse } from "axios";
import api from "@/lib/api";
import type { Schedule, ScheduleBulkCreate, ScheduleBulkResult, ScheduleCreate, ScheduleUpdate, PaginatedResponse } from "@/types";

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
  filters: { store_id?: string; user_id?: string; date_from?: string; date_to?: string; status?: string; page?: number; per_page?: number } = {},
): UseQueryResult<PaginatedResponse<Schedule>, Error> => {
  const params: Record<string, string | number> = {};
  if (filters.store_id) params.store_id = filters.store_id;
  if (filters.user_id) params.user_id = filters.user_id;
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
  });
};

export const useCreateSchedule = (): UseMutationResult<Schedule, Error, ScheduleCreate> => {
  const qc = useQueryClient();
  return useMutation<Schedule, Error, ScheduleCreate>({
    mutationFn: async (data) => {
      const res: AxiosResponse<Schedule> = await api.post("/admin/schedules", data);
      return res.data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["schedules"] }); },
  });
};

export const useBulkCreateSchedules = (): UseMutationResult<ScheduleBulkResult, Error, ScheduleBulkCreate> => {
  const qc = useQueryClient();
  return useMutation<ScheduleBulkResult, Error, ScheduleBulkCreate>({
    mutationFn: async (data) => {
      const res: AxiosResponse<ScheduleBulkResult> = await api.post("/admin/schedules/bulk", data);
      return res.data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["schedules"] }); },
  });
};

export const useUpdateSchedule = (): UseMutationResult<Schedule, Error, { id: string; data: ScheduleUpdate }> => {
  const qc = useQueryClient();
  return useMutation<Schedule, Error, { id: string; data: ScheduleUpdate }>({
    mutationFn: async ({ id, data }) => {
      const res: AxiosResponse<Schedule> = await api.patch(`/admin/schedules/${id}`, data);
      return res.data;
    },
    onSuccess: (updated, variables) => {
      // 개별 schedule cache 즉시 갱신 (낙관적 반영)
      qc.setQueryData(["schedules", variables.id], updated);
      // 목록 및 audit log 무효화
      qc.invalidateQueries({ queryKey: ["schedules"] });
    },
  });
};

export const useDeleteSchedule = (): UseMutationResult<void, Error, string> => {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: async (id) => { await api.delete(`/admin/schedules/${id}`); },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["schedules"] }); },
  });
};

export const useGenerateFromRequests = (): UseMutationResult<Schedule[], Error, string> => {
  const qc = useQueryClient();
  return useMutation<Schedule[], Error, string>({
    mutationFn: async (periodId) => {
      const res: AxiosResponse<Schedule[]> = await api.post(`/admin/schedules/generate-from-requests?period_id=${periodId}`);
      return res.data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["schedules"] }); },
  });
};

export const useConfirmSchedule = (): UseMutationResult<Schedule, Error, string> => {
  const qc = useQueryClient();
  return useMutation<Schedule, Error, string>({
    mutationFn: async (id) => {
      const res: AxiosResponse<Schedule> = await api.post(`/admin/schedules/${id}/confirm`);
      return res.data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["schedules"] }); },
  });
};

export const useRejectSchedule = (): UseMutationResult<Schedule, Error, { id: string; rejection_reason?: string }> => {
  const qc = useQueryClient();
  return useMutation<Schedule, Error, { id: string; rejection_reason?: string }>({
    mutationFn: async ({ id, rejection_reason }) => {
      const res: AxiosResponse<Schedule> = await api.post(`/admin/schedules/${id}/reject`, { rejection_reason: rejection_reason ?? null });
      return res.data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["schedules"] }); },
  });
};

// ─── 신규 상태 전환 (Phase 2 server) ──────────────────────────

export const useSubmitSchedule = (): UseMutationResult<Schedule, Error, string> => {
  const qc = useQueryClient();
  return useMutation<Schedule, Error, string>({
    mutationFn: async (id) => {
      const res: AxiosResponse<Schedule> = await api.post(`/admin/schedules/${id}/submit`);
      return res.data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["schedules"] }); },
  });
};

export const useRevertSchedule = (): UseMutationResult<Schedule, Error, string> => {
  const qc = useQueryClient();
  return useMutation<Schedule, Error, string>({
    mutationFn: async (id) => {
      const res: AxiosResponse<Schedule> = await api.post(`/admin/schedules/${id}/revert`);
      return res.data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["schedules"] }); },
  });
};

export const useCancelSchedule = (): UseMutationResult<Schedule, Error, { id: string; cancellation_reason?: string }> => {
  const qc = useQueryClient();
  return useMutation<Schedule, Error, { id: string; cancellation_reason?: string }>({
    mutationFn: async ({ id, cancellation_reason }) => {
      const res: AxiosResponse<Schedule> = await api.post(`/admin/schedules/${id}/cancel`, { cancellation_reason: cancellation_reason ?? null });
      return res.data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["schedules"] }); },
  });
};

export const useSwapSchedule = (): UseMutationResult<{ a: Schedule; b: Schedule }, Error, { id: string; other_schedule_id: string; reason?: string }> => {
  const qc = useQueryClient();
  return useMutation<{ a: Schedule; b: Schedule }, Error, { id: string; other_schedule_id: string; reason?: string }>({
    mutationFn: async ({ id, other_schedule_id, reason }) => {
      const res: AxiosResponse<{ a: Schedule; b: Schedule }> = await api.post(
        `/admin/schedules/${id}/swap`,
        { other_schedule_id, reason: reason ?? null },
      );
      return res.data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["schedules"] }); },
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

export const useBulkConfirmSchedules = (): UseMutationResult<{ confirmed: number; errors: string[] }, Error, { store_id: string; date_from: string; date_to: string }> => {
  const qc = useQueryClient();
  return useMutation<{ confirmed: number; errors: string[] }, Error, { store_id: string; date_from: string; date_to: string }>({
    mutationFn: async (params) => {
      const res: AxiosResponse<{ confirmed: number; errors: string[] }> = await api.post("/admin/schedules/bulk-confirm", params);
      return res.data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["schedules"] }); },
  });
};
