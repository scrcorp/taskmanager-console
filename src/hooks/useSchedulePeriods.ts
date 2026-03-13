import { useQuery, useMutation, useQueryClient, type UseQueryResult, type UseMutationResult } from "@tanstack/react-query";
import type { AxiosResponse } from "axios";
import api from "@/lib/api";
import type { SchedulePeriod, SchedulePeriodCreate, SchedulePeriodUpdate, PaginatedResponse } from "@/types";

export const useSchedulePeriods = (
  filters: { store_id?: string; status?: string; page?: number; per_page?: number } = {},
): UseQueryResult<PaginatedResponse<SchedulePeriod>, Error> => {
  const params: Record<string, string | number> = {};
  if (filters.store_id) params.store_id = filters.store_id;
  if (filters.status) params.status = filters.status;
  if (filters.page) params.page = filters.page;
  if (filters.per_page) params.per_page = filters.per_page;
  return useQuery<PaginatedResponse<SchedulePeriod>, Error>({
    queryKey: ["schedule-periods", params],
    queryFn: async () => {
      const res: AxiosResponse<PaginatedResponse<SchedulePeriod>> = await api.get("/admin/schedule-periods", { params });
      return res.data;
    },
  });
};

export const useCreateSchedulePeriod = (): UseMutationResult<SchedulePeriod, Error, SchedulePeriodCreate> => {
  const qc = useQueryClient();
  return useMutation<SchedulePeriod, Error, SchedulePeriodCreate>({
    mutationFn: async (data) => {
      const res: AxiosResponse<SchedulePeriod> = await api.post("/admin/schedule-periods", data);
      return res.data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["schedule-periods"] }); },
  });
};

export const useUpdateSchedulePeriod = (): UseMutationResult<SchedulePeriod, Error, { id: string; data: SchedulePeriodUpdate }> => {
  const qc = useQueryClient();
  return useMutation<SchedulePeriod, Error, { id: string; data: SchedulePeriodUpdate }>({
    mutationFn: async ({ id, data }) => {
      const res: AxiosResponse<SchedulePeriod> = await api.patch(`/admin/schedule-periods/${id}`, data);
      return res.data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["schedule-periods"] }); },
  });
};

export const useTransitionPeriod = (): UseMutationResult<SchedulePeriod, Error, { id: string; action: string }> => {
  const qc = useQueryClient();
  return useMutation<SchedulePeriod, Error, { id: string; action: string }>({
    mutationFn: async ({ id, action }) => {
      const res: AxiosResponse<SchedulePeriod> = await api.post(`/admin/schedule-periods/${id}/${action}`);
      return res.data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["schedule-periods"] }); },
  });
};
