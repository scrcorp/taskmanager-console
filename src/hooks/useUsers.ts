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
import { useMutationToast } from "@/lib/mutationToast";
import type { User, Store, UserStoreAssignment } from "@/types";

/** 사용자 목록 필터 타입 (User list filter type) */
interface UserFilters {
  store_id?: string;
  store_ids?: string[];
  role_id?: string;
  is_active?: boolean;
}

/**
 * 사용자 목록 조회 훅 -- 필터를 적용하여 사용자 목록을 가져옵니다.
 *
 * Custom hook to fetch the list of users with optional filters.
 *
 * @param filters - 선택적 필터 (Optional filters for store, role, active status)
 * @returns 사용자 목록 쿼리 결과 (User list query result)
 */
export const useUsers = (
  filters?: UserFilters,
): UseQueryResult<User[], Error> => {
  return useQuery<User[], Error>({
    queryKey: ["users", filters],
    queryFn: async (): Promise<User[]> => {
      const params: Record<string, string | boolean> = {};
      if (filters?.store_ids && filters.store_ids.length > 0) {
        params.store_ids = filters.store_ids.join(",");
      } else if (filters?.store_id) {
        params.store_id = filters.store_id;
      }
      if (filters?.role_id) params.role_id = filters.role_id;
      if (filters?.is_active !== undefined)
        params.is_active = filters.is_active;

      const response: AxiosResponse<User[]> = await api.get("/console/users", {
        params,
      });
      return response.data;
    },
  });
};

/**
 * 사용자 상세 조회 훅 -- 특정 사용자의 상세 정보를 가져옵니다.
 *
 * Custom hook to fetch a single user's detail.
 *
 * @param id - 사용자 ID (User ID)
 * @returns 사용자 상세 쿼리 결과 (User detail query result)
 */
export const useUser = (
  id: string | undefined,
): UseQueryResult<User, Error> => {
  return useQuery<User, Error>({
    queryKey: ["users", id],
    queryFn: async (): Promise<User> => {
      const response: AxiosResponse<User> = await api.get(
        `/console/users/${id}`,
      );
      return response.data;
    },
    enabled: !!id,
  });
};

/** 사용자 생성 요청 데이터 타입 (User creation request data type) */
interface CreateUserData {
  username: string;
  password: string;
  /** 이름 — first 필수, middle/last 선택. full_name 은 서버가 합성 */
  first_name: string;
  middle_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  role_id: string;
  store_ids?: string[];
  hourly_rate?: number | null;
  /** FOH/BOH 분류 — null/생략 시 미지정 */
  department?: "FOH" | "BOH" | null;
  /** 생성 직후 Store Assignment 상세 (각 매장별 Manager/Work 플래그) */
  store_assignments?: { store_id: string; is_manager: boolean; is_work_assignment: boolean }[];
}

/**
 * 사용자 생성 훅 -- 새 사용자를 생성하고 목록을 갱신합니다.
 *
 * Mutation hook to create a new user and invalidate the users list.
 *
 * @returns 사용자 생성 뮤테이션 결과 (User creation mutation result)
 */
export const useCreateUser = (): UseMutationResult<
  User,
  Error,
  CreateUserData
> => {
  const queryClient: QueryClient = useQueryClient();
  const { success, error } = useMutationToast();
  return useMutation<User, Error, CreateUserData>({
    mutationFn: async (data: CreateUserData): Promise<User> => {
      const { store_assignments, ...body } = data;
      const response: AxiosResponse<User> = await api.post("/console/users", body);
      const user = response.data;
      if (store_assignments && store_assignments.length > 0) {
        await api.put(`/console/users/${user.id}/stores`, { assignments: store_assignments });
      }
      return user;
    },
    onSuccess: (newUser: User): void => {
      queryClient.setQueriesData<User[]>(
        { queryKey: ["users"] },
        (old) => {
          if (!old || !Array.isArray(old)) return old;
          return [...old, newUser];
        },
      );
      success("Staff added.");
    },
    onError: error("Failed to add staff"),
  });
};

/** 사용자 수정 요청 데이터 타입 (User update request data type) */
interface UpdateUserData {
  id: string;
  username?: string;
  full_name?: string;
  email?: string;
  phone?: string;
  role_id?: string;
  password?: string;
  hourly_rate?: number | null;
  /** FOH/BOH 분류 — null이면 미지정으로 해제 */
  department?: "FOH" | "BOH" | null;
  /** 사번 — org 내 유일. null이면 해제, 생략 시 변경 없음 */
  employee_no?: string | null;
}

/**
 * 사용자 수정 훅 -- 기존 사용자 정보를 수정하고 관련 쿼리를 갱신합니다.
 *
 * Mutation hook to update an existing user and invalidate related queries.
 *
 * @returns 사용자 수정 뮤테이션 결과 (User update mutation result)
 */
export const useUpdateUser = (): UseMutationResult<
  User,
  Error,
  UpdateUserData
> => {
  const queryClient: QueryClient = useQueryClient();
  const { success, error } = useMutationToast();
  return useMutation<User, Error, UpdateUserData>({
    mutationFn: async ({ id, ...data }: UpdateUserData): Promise<User> => {
      const response: AxiosResponse<User> = await api.put(
        `/console/users/${id}`,
        data,
      );
      return response.data;
    },
    onSuccess: (updated: User, variables: UpdateUserData): void => {
      queryClient.setQueriesData<User[]>(
        { queryKey: ["users"] },
        (old) => {
          if (!old || !Array.isArray(old)) return old;
          return old.map((u) => (u.id === variables.id ? updated : u));
        },
      );
      queryClient.setQueryData<User>(["users", variables.id], updated);
      success("Staff updated.");
    },
    onError: error("Failed to update staff"),
  });
};

/** 일괄 변경 요청 데이터 (Bulk update request) — 보낸 필드만 적용됨 */
interface BulkUpdateUsersData {
  user_ids: string[];
  /** FOH/BOH/null(미지정 해제) — 키가 있으면 적용 */
  department?: "FOH" | "BOH" | null;
  /** 활성/비활성 일괄 — 키가 있으면 적용 */
  is_active?: boolean;
  /** 시급 일괄 — null 이면 상속으로 해제 */
  hourly_rate?: number | null;
}

/**
 * 직원 필드 일괄 변경 훅 -- 여러 직원의 여러 필드를 한 번에 변경.
 *
 * Mutation hook to bulk-update fields for multiple users (only sent fields apply).
 */
export const useBulkUpdateUsers = (): UseMutationResult<
  { updated_count: number },
  Error,
  BulkUpdateUsersData
> => {
  const queryClient: QueryClient = useQueryClient();
  const { success, error } = useMutationToast();
  return useMutation<{ updated_count: number }, Error, BulkUpdateUsersData>({
    mutationFn: async (data: BulkUpdateUsersData): Promise<{ updated_count: number }> => {
      const response: AxiosResponse<{ updated_count: number }> = await api.patch(
        "/console/users/bulk",
        data,
      );
      return response.data;
    },
    onSuccess: (res: { updated_count: number }): void => {
      queryClient.invalidateQueries({ queryKey: ["users"] });
      success(`Updated department for ${res.updated_count} staff.`);
    },
    onError: error("Failed to update staff"),
  });
};

/** 사용자 활성 상태 토글 요청 데이터 타입 (User active status toggle request data type) */
interface ToggleUserActiveData {
  id: string;
  is_active: boolean;
}

/**
 * 사용자 활성 상태 토글 훅 -- 사용자의 활성/비활성 상태를 전환합니다.
 *
 * Mutation hook to toggle a user's active/inactive status.
 *
 * @returns 사용자 활성 상태 토글 뮤테이션 결과 (User active toggle mutation result)
 */
export const useToggleUserActive = (): UseMutationResult<
  void,
  Error,
  ToggleUserActiveData
> => {
  const queryClient: QueryClient = useQueryClient();
  const { success, error } = useMutationToast();
  return useMutation<void, Error, ToggleUserActiveData>({
    mutationFn: async ({
      id,
      is_active,
    }: ToggleUserActiveData): Promise<void> => {
      await api.patch(`/console/users/${id}/active`, { is_active });
    },
    onSuccess: (_: void, variables: ToggleUserActiveData): void => {
      queryClient.setQueriesData<User[]>(
        { queryKey: ["users"] },
        (old) => {
          if (!old || !Array.isArray(old)) return old;
          return old.map((u) =>
            u.id === variables.id ? { ...u, is_active: variables.is_active } : u,
          );
        },
      );
      queryClient.setQueryData<User>(["users", variables.id], (old) =>
        old ? { ...old, is_active: variables.is_active } : undefined,
      );
      success(variables.is_active ? "Staff activated." : "Staff deactivated.");
    },
    onError: error("Failed to update active status"),
  });
};

/**
 * 사용자 삭제 훅 -- 사용자를 삭제하고 목록을 갱신합니다.
 *
 * Mutation hook to delete a user and invalidate the users list.
 *
 * @returns 사용자 삭제 뮤테이션 결과 (User deletion mutation result)
 */
export const useDeleteUser = (): UseMutationResult<void, Error, string> => {
  const queryClient: QueryClient = useQueryClient();
  const { success, error } = useMutationToast();
  return useMutation<void, Error, string>({
    mutationFn: async (id: string): Promise<void> => {
      await api.delete(`/console/users/${id}`);
    },
    onSuccess: (_: void, id: string): void => {
      queryClient.setQueriesData<User[]>(
        { queryKey: ["users"] },
        (old) => {
          if (!old || !Array.isArray(old)) return old;
          return old.filter((u) => u.id !== id);
        },
      );
      success("Staff deleted.");
    },
    onError: error("Failed to delete staff"),
  });
};

/**
 * 사용자 소속 매장 목록 조회 훅 -- 특정 사용자의 매장 목록을 가져옵니다.
 *
 * Custom hook to fetch the list of stores assigned to a specific user.
 *
 * @param userId - 사용자 ID (User ID)
 * @returns 사용자 매장 목록 쿼리 결과 (User stores query result)
 */
export const useUserStores = (
  userId: string | undefined,
): UseQueryResult<UserStoreAssignment[], Error> => {
  return useQuery<UserStoreAssignment[], Error>({
    queryKey: ["users", userId, "stores"],
    queryFn: async (): Promise<UserStoreAssignment[]> => {
      const response: AxiosResponse<UserStoreAssignment[]> = await api.get(
        `/console/users/${userId}/stores`,
      );
      return response.data;
    },
    enabled: !!userId,
  });
};

/** 사용자 매장 추가 요청 데이터 타입 (User store addition request data type) */
interface AddUserStoreData {
  userId: string;
  storeId: string;
}

/**
 * 사용자 매장 추가 훅 -- 사용자에게 매장을 할당합니다.
 *
 * Mutation hook to assign a store to a user.
 *
 * @returns 사용자 매장 추가 뮤테이션 결과 (User store addition mutation result)
 */
export const useAddUserStore = (): UseMutationResult<
  void,
  Error,
  AddUserStoreData
> => {
  const queryClient: QueryClient = useQueryClient();
  return useMutation<void, Error, AddUserStoreData>({
    mutationFn: async ({
      userId,
      storeId,
    }: AddUserStoreData): Promise<void> => {
      await api.post(`/console/users/${userId}/stores/${storeId}`);
    },
    onSuccess: (_: void, variables: AddUserStoreData): void => {
      const stores = queryClient.getQueryData<Store[]>(["stores"]);
      const store = stores?.find((s) => s.id === variables.storeId);
      if (store) {
        queryClient.setQueryData<Store[]>(
          ["users", variables.userId, "stores"],
          (old) => (old ? [...old, store] : [store]),
        );
      }
    },
  });
};

/** 사용자 매장 제거 요청 데이터 타입 (User store removal request data type) */
interface RemoveUserStoreData {
  userId: string;
  storeId: string;
}

/**
 * 사용자 매장 제거 훅 -- 사용자에서 매장 할당을 해제합니다.
 *
 * Mutation hook to remove a store assignment from a user.
 *
 * @returns 사용자 매장 제거 뮤테이션 결과 (User store removal mutation result)
 */
export const useRemoveUserStore = (): UseMutationResult<
  void,
  Error,
  RemoveUserStoreData
> => {
  const queryClient: QueryClient = useQueryClient();
  return useMutation<void, Error, RemoveUserStoreData>({
    mutationFn: async ({
      userId,
      storeId,
    }: RemoveUserStoreData): Promise<void> => {
      await api.delete(`/console/users/${userId}/stores/${storeId}`);
    },
    onSuccess: (_: void, variables: RemoveUserStoreData): void => {
      queryClient.setQueryData<UserStoreAssignment[]>(
        ["users", variables.userId, "stores"],
        (old) => old?.filter((s) => s.id !== variables.storeId),
      );
    },
  });
};

/** 매장 배정 일괄 저장 요청 데이터 */
interface SyncUserStoresData {
  userId: string;
  assignments: {
    store_id: string;
    is_manager: boolean;
    is_work_assignment: boolean;
  }[];
}

/** 매장 배정 일괄 저장 훅 */
export const useSyncUserStores = (): UseMutationResult<
  UserStoreAssignment[],
  Error,
  SyncUserStoresData
> => {
  const queryClient: QueryClient = useQueryClient();
  return useMutation<UserStoreAssignment[], Error, SyncUserStoresData>({
    mutationFn: async ({
      userId,
      assignments,
    }: SyncUserStoresData): Promise<UserStoreAssignment[]> => {
      const response: AxiosResponse<UserStoreAssignment[]> = await api.put(
        `/console/users/${userId}/stores`,
        { assignments },
      );
      return response.data;
    },
    onSuccess: (
      data: UserStoreAssignment[],
      variables: SyncUserStoresData,
    ): void => {
      queryClient.setQueryData<UserStoreAssignment[]>(
        ["users", variables.userId, "stores"],
        data,
      );
    },
  });
};
