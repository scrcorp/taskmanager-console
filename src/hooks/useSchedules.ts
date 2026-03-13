import { useQuery, useMutation, useQueryClient, type UseQueryResult, type UseMutationResult } from "@tanstack/react-query";
import type { AxiosResponse } from "axios";
import api from "@/lib/api";
import type { Schedule, ScheduleCreate, ScheduleUpdate, PaginatedResponse } from "@/types";

export const useSchedules = (
  filters: { period_id?: string; store_id?: string; user_id?: string; date_from?: string; date_to?: string; status?: string; page?: number; per_page?: number } = {},
): UseQueryResult<PaginatedResponse<Schedule>, Error> => {
  const params: Record<string, string | number> = {};
  if (filters.period_id) params.period_id = filters.period_id;
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
