import { useQuery, useMutation, useQueryClient, type UseQueryResult, type UseMutationResult } from "@tanstack/react-query";
import type { AxiosResponse } from "axios";
import api from "@/lib/api";
import type { WorkRole, WorkRoleCreate, WorkRoleUpdate } from "@/types";

export const useWorkRoles = (storeId: string | undefined): UseQueryResult<WorkRole[], Error> => {
  return useQuery<WorkRole[], Error>({
    queryKey: ["work-roles", storeId],
    queryFn: async (): Promise<WorkRole[]> => {
      const res: AxiosResponse<WorkRole[]> = await api.get(`/admin/stores/${storeId}/work-roles`);
      return res.data;
    },
    enabled: !!storeId,
  });
};

export const useCreateWorkRole = (): UseMutationResult<WorkRole, Error, { storeId: string; data: WorkRoleCreate }> => {
  const qc = useQueryClient();
  return useMutation<WorkRole, Error, { storeId: string; data: WorkRoleCreate }>({
    mutationFn: async ({ storeId, data }) => {
      const res: AxiosResponse<WorkRole> = await api.post(`/admin/stores/${storeId}/work-roles`, data);
      return res.data;
    },
    onSuccess: (_, { storeId }) => { qc.invalidateQueries({ queryKey: ["work-roles", storeId] }); },
  });
};

export const useUpdateWorkRole = (): UseMutationResult<WorkRole, Error, { id: string; data: WorkRoleUpdate; storeId: string }> => {
  const qc = useQueryClient();
  return useMutation<WorkRole, Error, { id: string; data: WorkRoleUpdate; storeId: string }>({
    mutationFn: async ({ id, data }) => {
      const res: AxiosResponse<WorkRole> = await api.put(`/admin/work-roles/${id}`, data);
      return res.data;
    },
    onSuccess: (_, { storeId }) => { qc.invalidateQueries({ queryKey: ["work-roles", storeId] }); },
  });
};

export const useDeleteWorkRole = (): UseMutationResult<void, Error, { id: string; storeId: string }> => {
  const qc = useQueryClient();
  return useMutation<void, Error, { id: string; storeId: string }>({
    mutationFn: async ({ id }) => { await api.delete(`/admin/work-roles/${id}`); },
    onSuccess: (_, { storeId }) => { qc.invalidateQueries({ queryKey: ["work-roles", storeId] }); },
  });
};

export const useReorderWorkRoles = (): UseMutationResult<WorkRole[], Error, { storeId: string; items: { id: string; sort_order: number }[] }> => {
  const qc = useQueryClient();
  return useMutation<WorkRole[], Error, { storeId: string; items: { id: string; sort_order: number }[] }>({
    mutationFn: async ({ storeId, items }) => {
      const res: AxiosResponse<WorkRole[]> = await api.put(`/admin/stores/${storeId}/work-roles/reorder`, { items });
      return res.data;
    },
    onSuccess: (_, { storeId }) => { qc.invalidateQueries({ queryKey: ["work-roles", storeId] }); },
  });
};
