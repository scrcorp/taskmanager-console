import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
  type UseMutationResult,
  type QueryClient,
} from "@tanstack/react-query";
import type { AxiosResponse } from "axios";
import api from "@/lib/api";
import type { Organization } from "@/types";

/** 현재 조직 조회 훅 — GET /admin/organizations/me */
export const useOrganization = (): UseQueryResult<Organization, Error> => {
  return useQuery<Organization, Error>({
    queryKey: ["organization"],
    queryFn: async (): Promise<Organization> => {
      const response: AxiosResponse<Organization> = await api.get(
        "/admin/organizations/me",
      );
      return response.data;
    },
  });
};

interface UpdateOrganizationData {
  name?: string;
  timezone?: string;
  default_hourly_rate?: number | null;
}

/** 현재 조직 수정 훅 — PUT /admin/organizations/me */
export const useUpdateOrganization = (): UseMutationResult<
  Organization,
  Error,
  UpdateOrganizationData
> => {
  const queryClient: QueryClient = useQueryClient();
  return useMutation<Organization, Error, UpdateOrganizationData>({
    mutationFn: async (data: UpdateOrganizationData): Promise<Organization> => {
      const response: AxiosResponse<Organization> = await api.put(
        "/admin/organizations/me",
        data,
      );
      return response.data;
    },
    onSuccess: (updated: Organization): void => {
      queryClient.setQueryData<Organization>(["organization"], updated);
    },
  });
};
