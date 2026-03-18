import { useQuery, useMutation, useQueryClient, type UseQueryResult, type UseMutationResult } from "@tanstack/react-query";
import type { AxiosResponse } from "axios";
import api from "@/lib/api";
import type { BreakRule, BreakRuleUpsert } from "@/types";

export const useBreakRule = (storeId: string | undefined): UseQueryResult<BreakRule | null, Error> => {
  return useQuery<BreakRule | null, Error>({
    queryKey: ["break-rules", storeId],
    queryFn: async (): Promise<BreakRule | null> => {
      const res: AxiosResponse<BreakRule | null> = await api.get(`/admin/stores/${storeId}/break-rules`);
      return res.data;
    },
    enabled: !!storeId,
  });
};

export const useUpsertBreakRule = (): UseMutationResult<BreakRule, Error, { storeId: string; data: BreakRuleUpsert }> => {
  const qc = useQueryClient();
  return useMutation<BreakRule, Error, { storeId: string; data: BreakRuleUpsert }>({
    mutationFn: async ({ storeId, data }) => {
      const res: AxiosResponse<BreakRule> = await api.put(`/admin/stores/${storeId}/break-rules`, data);
      return res.data;
    },
    onSuccess: (_, { storeId }) => { qc.invalidateQueries({ queryKey: ["break-rules", storeId] }); },
  });
};
