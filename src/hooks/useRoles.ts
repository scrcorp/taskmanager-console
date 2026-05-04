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
import { useMutationResult } from "@/lib/mutationResult";
import type { Role } from "@/types";

/**
 * 역할 목록 조회 훅 -- React Query 기반으로 모든 역할을 가져옵니다.
 *
 * Custom hook to fetch the list of all roles via React Query.
 *
 * @returns 역할 목록 쿼리 결과 (Role list query result)
 */
export const useRoles = (): UseQueryResult<Role[], Error> => {
  return useQuery<Role[], Error>({
    queryKey: ["roles"],
    queryFn: async (): Promise<Role[]> => {
      const response: AxiosResponse<Role[]> = await api.get("/admin/roles");
      return response.data;
    },
  });
};

/** 역할 생성 요청 데이터 타입 (Role creation request data type) */
interface CreateRoleData {
  name: string;
  priority: number;
}

/**
 * 역할 생성 훅 -- 새 역할을 생성하고 목록을 갱신합니다.
 *
 * Mutation hook to create a new role and invalidate the roles list.
 *
 * @returns 역할 생성 뮤테이션 결과 (Role creation mutation result)
 */
export const useCreateRole = (): UseMutationResult<
  Role,
  Error,
  CreateRoleData
> => {
  const queryClient: QueryClient = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<Role, Error, CreateRoleData>({
    mutationFn: async (data: CreateRoleData): Promise<Role> => {
      const response: AxiosResponse<Role> = await api.post(
        "/admin/roles",
        data,
      );
      return response.data;
    },
    onSuccess: (newRole: Role): void => {
      queryClient.setQueryData<Role[]>(["roles"], (old) =>
        old ? [...old, newRole] : [newRole],
      );
      success("Role created.");
    },
    onError: error("Couldn't create role"),
  });
};

/** 역할 수정 요청 데이터 타입 (Role update request data type) */
interface UpdateRoleData {
  id: string;
  name?: string;
  priority?: number;
}

/**
 * 역할 수정 훅 -- 기존 역할 정보를 수정하고 목록을 갱신합니다.
 *
 * Mutation hook to update an existing role and invalidate the roles list.
 *
 * @returns 역할 수정 뮤테이션 결과 (Role update mutation result)
 */
export const useUpdateRole = (): UseMutationResult<
  Role,
  Error,
  UpdateRoleData
> => {
  const queryClient: QueryClient = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<Role, Error, UpdateRoleData>({
    mutationFn: async ({ id, ...data }: UpdateRoleData): Promise<Role> => {
      const response: AxiosResponse<Role> = await api.put(
        `/admin/roles/${id}`,
        data,
      );
      return response.data;
    },
    onSuccess: (updated: Role, variables: UpdateRoleData): void => {
      queryClient.setQueryData<Role[]>(["roles"], (old) =>
        old?.map((r) => (r.id === variables.id ? updated : r)),
      );
      success("Role updated.");
    },
    onError: error("Couldn't update role"),
  });
};

/**
 * 역할 삭제 훅 -- 역할을 삭제하고 목록을 갱신합니다.
 *
 * Mutation hook to delete a role and invalidate the roles list.
 *
 * @returns 역할 삭제 뮤테이션 결과 (Role deletion mutation result)
 */
export const useDeleteRole = (): UseMutationResult<void, Error, string> => {
  const queryClient: QueryClient = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<void, Error, string>({
    mutationFn: async (id: string): Promise<void> => {
      await api.delete(`/admin/roles/${id}`);
    },
    onSuccess: (_: void, id: string): void => {
      queryClient.setQueryData<Role[]>(["roles"], (old) =>
        old?.filter((r) => r.id !== id),
      );
      success("Role deleted.");
    },
    onError: error("Couldn't delete role"),
  });
};
