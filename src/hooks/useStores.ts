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
import type { Store, StoreDetail, StoreStatus } from "@/types";

/**
 * 매장 목록 조회 훅 -- React Query 기반으로 모든 매장을 가져옵니다.
 *
 * Custom hook to fetch the list of all stores via React Query.
 *
 * @returns 매장 목록 쿼리 결과 (Store list query result)
 */
export const useStores = (options?: {
  includeClosed?: boolean;
}): UseQueryResult<Store[], Error> => {
  const includeClosed = options?.includeClosed ?? false;
  return useQuery<Store[], Error>({
    // includeClosed 변형은 별도 캐시 키 (기본 호출처는 영향 없음)
    queryKey: includeClosed ? ["stores", "withClosed"] : ["stores"],
    queryFn: async (): Promise<Store[]> => {
      const response: AxiosResponse<Store[]> = await api.get("/console/stores", {
        params: includeClosed ? { include_closed: true } : undefined,
      });
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
        `/console/stores/${id}`,
      );
      return response.data;
    },
    enabled: !!id,
  });
};

/** 매장 생성 요청 데이터 타입 (Store creation request data type) */
interface CreateStoreData {
  name: string;
  code?: string | null; // 비우면 서버가 이름 앞 3글자로 자동 생성
  address?: string;
  phone?: string | null;
  email?: string | null;
  status?: StoreStatus;
  timezone?: string | null;
}

/**
 * 매장 생성 훅 -- 새 매장을 생성하고 목록을 갱신합니다.
 *
 * Mutation hook to create a new store and invalidate the stores list.
 *
 * @returns 매장 생성 뮤테이션 결과 (Store creation mutation result)
 */
export const useCreateStore = (options?: {
  silent?: boolean;
}): UseMutationResult<Store, Error, CreateStoreData> => {
  const queryClient: QueryClient = useQueryClient();
  const { success, error } = useMutationToast();
  return useMutation<Store, Error, CreateStoreData>({
    mutationFn: async (data: CreateStoreData): Promise<Store> => {
      const response: AxiosResponse<Store> = await api.post(
        "/console/stores",
        data,
      );
      return response.data;
    },
    onSuccess: (newStore: Store): void => {
      queryClient.setQueryData<Store[]>(["stores"], (old) =>
        old ? [...old, newStore] : [newStore],
      );
      if (!options?.silent) success("Brand created.");
    },
    onError: options?.silent ? undefined : error("Failed to create brand"),
  });
};

/** 매장 수정 요청 데이터 타입 (Store update request data type) */
interface UpdateStoreData {
  id: string;
  name?: string;
  code?: string | null;
  address?: string;
  phone?: string | null;
  email?: string | null;
  status?: StoreStatus;
  state_code?: string | null;
  day_start_time?: Record<string, string> | null;
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
  const { success, error } = useMutationToast();
  return useMutation<Store, Error, UpdateStoreData>({
    mutationFn: async ({ id, ...data }: UpdateStoreData): Promise<Store> => {
      const response: AxiosResponse<Store> = await api.put(
        `/console/stores/${id}`,
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
      // default_hourly_rate 변경 시 server가 users에 cascade하므로 캐시 무효화
      queryClient.invalidateQueries({ queryKey: ["users"] });
      success("Brand updated.");
    },
    onError: error("Failed to update brand"),
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
  const { success, error } = useMutationToast();
  return useMutation<void, Error, string>({
    mutationFn: async (id: string): Promise<void> => {
      await api.delete(`/console/stores/${id}`);
    },
    onSuccess: (_: void, id: string): void => {
      queryClient.setQueryData<Store[]>(["stores"], (old) =>
        old?.filter((s) => s.id !== id),
      );
      success("Brand deleted.");
    },
    onError: error("Failed to delete brand"),
  });
};

/**
 * 매장 순서 변경 훅 -- 드래그로 정렬한 순서를 서버에 일괄 저장합니다.
 *
 * Mutation hook to persist a new store display order (drag reorder).
 * Optimistically reorders the cached list; toast feedback is suppressed
 * (optical reorder per design policy).
 *
 * @returns 순서 변경 뮤테이션 결과 (Reorder mutation result)
 */
export const useReorderStores = (): UseMutationResult<
  void,
  Error,
  string[]
> => {
  const queryClient: QueryClient = useQueryClient();
  const { error } = useMutationToast();
  return useMutation<void, Error, string[]>({
    mutationFn: async (storeIds: string[]): Promise<void> => {
      await api.put("/console/stores/reorder", { store_ids: storeIds });
    },
    onMutate: (storeIds: string[]): void => {
      // 낙관적 재정렬 — 요청 순서대로 캐시 즉시 갱신
      queryClient.setQueryData<Store[]>(["stores"], (old) => {
        if (!old) return old;
        const byId = new Map(old.map((s) => [s.id, s]));
        return storeIds
          .map((id) => byId.get(id))
          .filter((s): s is Store => s !== undefined);
      });
    },
    onError: (err, _vars, _ctx): void => {
      queryClient.invalidateQueries({ queryKey: ["stores"] });
      error("Failed to reorder brands")(err);
    },
  });
};
