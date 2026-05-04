/**
 * Permission 관리 훅 — 전체 permission 목록, 역할별 permission CRUD.
 *
 * 권한 설정 페이지(/settings/roles)에서 사용.
 * 실제 권한 확인은 usePermissions 훅을 사용.
 */

import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
  type UseMutationResult,
} from "@tanstack/react-query";
import api from "@/lib/api";
import { useMutationResult } from "@/lib/mutationResult";

/** 서버에서 반환하는 Permission 객체 */
export interface PermissionItem {
  id: string;
  code: string;
  resource: string;
  action: string;
  description: string | null;
  require_priority_check: boolean;
}

/** 전체 permission 목록 조회 */
export const useAllPermissions = (): UseQueryResult<PermissionItem[], Error> => {
  return useQuery<PermissionItem[], Error>({
    queryKey: ["permissions"],
    queryFn: async () => {
      const res = await api.get("/admin/permissions");
      return res.data;
    },
  });
};

/** 역할별 permission 목록 조회 */
export const useRolePermissions = (
  roleId: string | undefined
): UseQueryResult<PermissionItem[], Error> => {
  return useQuery<PermissionItem[], Error>({
    queryKey: ["permissions", "role", roleId],
    queryFn: async () => {
      const res = await api.get(`/admin/permissions/roles/${roleId}`);
      return res.data;
    },
    enabled: !!roleId,
  });
};

/** 역할의 permission 일괄 업데이트 */
export const useUpdateRolePermissions = (): UseMutationResult<
  PermissionItem[],
  Error,
  { roleId: string; permissionCodes: string[] }
> => {
  const queryClient = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<
    PermissionItem[],
    Error,
    { roleId: string; permissionCodes: string[] }
  >({
    mutationFn: async ({ roleId, permissionCodes }) => {
      const res = await api.put(`/admin/permissions/roles/${roleId}`, {
        permission_codes: permissionCodes,
      });
      return res.data;
    },
    onSuccess: (_data, { roleId }) => {
      queryClient.invalidateQueries({ queryKey: ["permissions", "role", roleId] });
      success("Permissions updated.");
    },
    onError: error("Couldn't update permissions"),
  });
};
