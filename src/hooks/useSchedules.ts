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
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["schedules"] }); },
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

export const useRejectSchedule = (): UseMutationResult<Schedule, Error, { id: string; reason?: string }> => {
  const qc = useQueryClient();
  return useMutation<Schedule, Error, { id: string; reason?: string }>({
    mutationFn: async ({ id, reason }) => {
      const res: AxiosResponse<Schedule> = await api.post(`/admin/schedules/${id}/reject`, reason ? { reason } : undefined);
      return res.data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["schedules"] }); },
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
