import { useQuery, useMutation, useQueryClient, type UseQueryResult, type UseMutationResult } from "@tanstack/react-query";
import type { AxiosResponse } from "axios";
import api from "@/lib/api";
import type {
  ScheduleRequestItem,
  ScheduleRequestAdminCreate,
  ScheduleRequestAdminUpdate,
  ScheduleConfirmRequest,
  ScheduleConfirmResult,
  ScheduleConfirmPreview,
  PaginatedResponse,
} from "@/types";

export const useScheduleRequests = (
  filters: { store_id?: string; date_from?: string; date_to?: string; page?: number; per_page?: number } = {},
): UseQueryResult<PaginatedResponse<ScheduleRequestItem>, Error> => {
  const params: Record<string, string | number> = {};
  if (filters.store_id) params.store_id = filters.store_id;
  if (filters.date_from) params.date_from = filters.date_from;
  if (filters.date_to) params.date_to = filters.date_to;
  if (filters.page) params.page = filters.page;
  if (filters.per_page) params.per_page = filters.per_page;
  return useQuery<PaginatedResponse<ScheduleRequestItem>, Error>({
    queryKey: ["schedule-requests", params],
    queryFn: async () => {
      const res: AxiosResponse<PaginatedResponse<ScheduleRequestItem>> = await api.get("/admin/schedule-requests", { params });
      return res.data;
    },
  });
};

export const useAdminCreateRequest = (): UseMutationResult<ScheduleRequestItem, Error, ScheduleRequestAdminCreate> => {
  const qc = useQueryClient();
  return useMutation<ScheduleRequestItem, Error, ScheduleRequestAdminCreate>({
    mutationFn: async (data) => {
      const res: AxiosResponse<ScheduleRequestItem> = await api.post("/admin/schedule-requests", data);
      return res.data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["schedule-requests"] }); },
  });
};

export const useAdminUpdateRequest = (): UseMutationResult<ScheduleRequestItem, Error, { id: string; data: ScheduleRequestAdminUpdate }> => {
  const qc = useQueryClient();
  return useMutation<ScheduleRequestItem, Error, { id: string; data: ScheduleRequestAdminUpdate }>({
    mutationFn: async ({ id, data }) => {
      const res: AxiosResponse<ScheduleRequestItem> = await api.patch(`/admin/schedule-requests/${id}`, data);
      return res.data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["schedule-requests"] }); },
  });
};

export const useUpdateRequestStatus = (): UseMutationResult<ScheduleRequestItem, Error, { id: string; status: string; rejection_reason?: string | null }> => {
  const qc = useQueryClient();
  return useMutation<ScheduleRequestItem, Error, { id: string; status: string; rejection_reason?: string | null }>({
    mutationFn: async ({ id, status, rejection_reason }) => {
      const body: Record<string, string | null> = { status };
      if (rejection_reason !== undefined) body.rejection_reason = rejection_reason;
      const res: AxiosResponse<ScheduleRequestItem> = await api.patch(`/admin/schedule-requests/${id}/status`, body);
      return res.data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["schedule-requests"] }); },
  });
};

export const useRevertRequest = (): UseMutationResult<ScheduleRequestItem, Error, string> => {
  const qc = useQueryClient();
  return useMutation<ScheduleRequestItem, Error, string>({
    mutationFn: async (id) => {
      const res: AxiosResponse<ScheduleRequestItem> = await api.post(`/admin/schedule-requests/${id}/revert`);
      return res.data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["schedule-requests"] }); },
  });
};

export const useDeleteRequest = (): UseMutationResult<void, Error, string> => {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: async (id) => {
      await api.delete(`/admin/schedule-requests/${id}`);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["schedule-requests"] }); },
  });
};

export const useConfirmRequests = (): UseMutationResult<ScheduleConfirmResult, Error, ScheduleConfirmRequest> => {
  const qc = useQueryClient();
  return useMutation<ScheduleConfirmResult, Error, ScheduleConfirmRequest>({
    mutationFn: async (data) => {
      const res: AxiosResponse<ScheduleConfirmResult> = await api.post("/admin/schedule-requests/confirm", data);
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["schedule-requests"] });
      qc.invalidateQueries({ queryKey: ["schedules"] });
      qc.invalidateQueries({ queryKey: ["schedule-periods"] });
    },
  });
};

export const useConfirmPreview = (): UseMutationResult<ScheduleConfirmPreview, Error, ScheduleConfirmRequest> => {
  return useMutation<ScheduleConfirmPreview, Error, ScheduleConfirmRequest>({
    mutationFn: async (data) => {
      const res: AxiosResponse<ScheduleConfirmPreview> = await api.post("/admin/schedule-requests/confirm/preview", data);
      return res.data;
    },
  });
};
