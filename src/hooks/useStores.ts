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
import type { Store, StoreDetail } from "@/types";

/**
 * 매장 목록 조회 훅 -- React Query 기반으로 모든 매장을 가져옵니다.
 *
 * Custom hook to fetch the list of all stores via React Query.
 *
 * @returns 매장 목록 쿼리 결과 (Store list query result)
 */
export const useStores = (): UseQueryResult<Store[], Error> => {
  return useQuery<Store[], Error>({
    queryKey: ["stores"],
    queryFn: async (): Promise<Store[]> => {
      const response: AxiosResponse<Store[]> = await api.get("/admin/stores");
      return response.data;
    },
  });
};

/**
 * 매장 상세 조회 훅 -- 특정 매장의 상세 정보를 가져옵니다.
 *
 * Custom hook to fetch a single store's detail (includes shifts and positions).
 *
 * @param id - 매장 ID (Store ID)
 * @returns 매장 상세 쿼리 결과 (Store detail query result)
 */
export const useStore = (
  id: string | undefined,
): UseQueryResult<StoreDetail, Error> => {
  return useQuery<StoreDetail, Error>({
    queryKey: ["stores", id],
    queryFn: async (): Promise<StoreDetail> => {
      const response: AxiosResponse<StoreDetail> = await api.get(
        `/admin/stores/${id}`,
      );
      return response.data;
    },
    enabled: !!id,
  });
};

/** 매장 생성 요청 데이터 타입 (Store creation request data type) */
interface CreateStoreData {
  name: string;
  address?: string;
  timezone?: string | null;
}

/**
 * 매장 생성 훅 -- 새 매장을 생성하고 목록을 갱신합니다.
 *
 * Mutation hook to create a new store and invalidate the stores list.
 *
 * @returns 매장 생성 뮤테이션 결과 (Store creation mutation result)
 */
export const useCreateStore = (): UseMutationResult<
  Store,
  Error,
  CreateStoreData
> => {
  const queryClient: QueryClient = useQueryClient();
  return useMutation<Store, Error, CreateStoreData>({
    mutationFn: async (data: CreateStoreData): Promise<Store> => {
      const response: AxiosResponse<Store> = await api.post(
        "/admin/stores",
        data,
      );
      return response.data;
    },
    onSuccess: (newStore: Store): void => {
      queryClient.setQueryData<Store[]>(["stores"], (old) =>
        old ? [...old, newStore] : [newStore],
      );
    },
  });
};

/** 매장 수정 요청 데이터 타입 (Store update request data type) */
interface UpdateStoreData {
  id: string;
  name?: string;
  address?: string;
  is_active?: boolean;
  max_work_hours_weekly?: number | null;
  timezone?: string | null;
  default_hourly_rate?: number | null;
}

/**
 * 매장 수정 훅 -- 기존 매장 정보를 수정하고 관련 쿼리를 갱신합니다.
 *
 * Mutation hook to update an existing store and invalidate related queries.
 *
 * @returns 매장 수정 뮤테이션 결과 (Store update mutation result)
 */
export const useUpdateStore = (): UseMutationResult<
  Store,
  Error,
  UpdateStoreData
> => {
  const queryClient: QueryClient = useQueryClient();
  return useMutation<Store, Error, UpdateStoreData>({
    mutationFn: async ({ id, ...data }: UpdateStoreData): Promise<Store> => {
      const response: AxiosResponse<Store> = await api.put(
        `/admin/stores/${id}`,
        data,
      );
      return response.data;
    },
    onSuccess: (updated: Store, variables: UpdateStoreData): void => {
      queryClient.setQueryData<Store[]>(["stores"], (old) =>
        old?.map((s) => (s.id === variables.id ? updated : s)),
      );
      queryClient.setQueryData<StoreDetail>(["stores", variables.id], (old) =>
        old ? { ...old, ...updated } : undefined,
      );
    },
  });
};

/**
 * 매장 삭제 훅 -- 매장을 삭제하고 목록을 갱신합니다.
 *
 * Mutation hook to delete a store and invalidate the stores list.
 *
 * @returns 매장 삭제 뮤테이션 결과 (Store deletion mutation result)
 */
export const useDeleteStore = (): UseMutationResult<void, Error, string> => {
  const queryClient: QueryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: async (id: string): Promise<void> => {
      await api.delete(`/admin/stores/${id}`);
    },
    onSuccess: (_: void, id: string): void => {
      queryClient.setQueryData<Store[]>(["stores"], (old) =>
        old?.filter((s) => s.id !== id),
      );
    },
  });
};
