import { useQuery, useMutation, useQueryClient, type UseQueryResult, type UseMutationResult } from "@tanstack/react-query";
import type { AxiosResponse } from "axios";
import api from "@/lib/api";
import { useMutationResult } from "@/lib/mutationResult";
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
      const res: AxiosResponse<PaginatedResponse<ScheduleRequestItem>> = await api.get("/console/schedule-requests", { params });
      return res.data;
    },
  });
};

export const useAdminCreateRequest = (): UseMutationResult<ScheduleRequestItem, Error, ScheduleRequestAdminCreate> => {
  const qc = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<ScheduleRequestItem, Error, ScheduleRequestAdminCreate>({
    mutationFn: async (data) => {
      const res: AxiosResponse<ScheduleRequestItem> = await api.post("/console/schedule-requests", data);
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["schedule-requests"] });
      success("Schedule request created.");
    },
    onError: error("Couldn't create schedule request"),
  });
};

export const useAdminUpdateRequest = (): UseMutationResult<ScheduleRequestItem, Error, { id: string; data: ScheduleRequestAdminUpdate }> => {
  const qc = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<ScheduleRequestItem, Error, { id: string; data: ScheduleRequestAdminUpdate }>({
    mutationFn: async ({ id, data }) => {
      const res: AxiosResponse<ScheduleRequestItem> = await api.patch(`/console/schedule-requests/${id}`, data);
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["schedule-requests"] });
      success("Schedule request updated.");
    },
    onError: error("Couldn't update schedule request"),
  });
};

export const useUpdateRequestStatus = (): UseMutationResult<ScheduleRequestItem, Error, { id: string; status: string; rejection_reason?: string | null }> => {
  const qc = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<ScheduleRequestItem, Error, { id: string; status: string; rejection_reason?: string | null }>({
    mutationFn: async ({ id, status, rejection_reason }) => {
      const body: Record<string, string | null> = { status };
      if (rejection_reason !== undefined) body.rejection_reason = rejection_reason;
      const res: AxiosResponse<ScheduleRequestItem> = await api.patch(`/console/schedule-requests/${id}/status`, body);
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["schedule-requests"] });
      success("Status updated.");
    },
    onError: error("Couldn't update status"),
  });
};

export const useRevertRequest = (): UseMutationResult<ScheduleRequestItem, Error, string> => {
  const qc = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<ScheduleRequestItem, Error, string>({
    mutationFn: async (id) => {
      const res: AxiosResponse<ScheduleRequestItem> = await api.post(`/console/schedule-requests/${id}/revert`);
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["schedule-requests"] });
      success("Request reverted.");
    },
    onError: error("Couldn't revert request"),
  });
};

export const useDeleteRequest = (): UseMutationResult<void, Error, string> => {
  const qc = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<void, Error, string>({
    mutationFn: async (id) => {
      await api.delete(`/console/schedule-requests/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["schedule-requests"] });
      success("Schedule request deleted.");
    },
    onError: error("Couldn't delete schedule request"),
  });
};

export const useConfirmRequests = (): UseMutationResult<ScheduleConfirmResult, Error, ScheduleConfirmRequest> => {
  const qc = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<ScheduleConfirmResult, Error, ScheduleConfirmRequest>({
    mutationFn: async (data) => {
      const res: AxiosResponse<ScheduleConfirmResult> = await api.post("/console/schedule-requests/confirm", data);
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["schedule-requests"] });
      qc.invalidateQueries({ queryKey: ["schedules"] });
      qc.invalidateQueries({ queryKey: ["schedule-periods"] });
      success("Requests confirmed.");
    },
    onError: error("Couldn't confirm requests"),
  });
};

export const useConfirmPreview = (): UseMutationResult<ScheduleConfirmPreview, Error, ScheduleConfirmRequest> => {
  const { error } = useMutationResult();
  return useMutation<ScheduleConfirmPreview, Error, ScheduleConfirmRequest>({
    mutationFn: async (data) => {
      const res: AxiosResponse<ScheduleConfirmPreview> = await api.post("/console/schedule-requests/confirm/preview", data);
      return res.data;
    },
    onError: error("Couldn't load confirmation preview"),
  });
};
