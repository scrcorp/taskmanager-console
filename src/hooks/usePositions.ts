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
import type { Position, StoreDetail } from "@/types";

/**
 * 포지션 목록 조회 훅 -- 특정 매장의 포지션 목록을 가져옵니다.
 *
 * Custom hook to fetch positions for a specific store via React Query.
 *
 * @param storeId - 매장 ID (Store ID to fetch positions for)
 * @returns 포지션 목록 쿼리 결과 (Position list query result)
 */
export const usePositions = (
  storeId: string | undefined,
): UseQueryResult<Position[], Error> => {
  return useQuery<Position[], Error>({
    queryKey: ["positions", storeId],
    queryFn: async (): Promise<Position[]> => {
      const response: AxiosResponse<Position[]> = await api.get(
        `/console/stores/${storeId}/positions`,
      );
      return response.data;
    },
    enabled: !!storeId,
  });
};

/** 포지션 생성 요청 데이터 타입 (Position creation request data type) */
interface CreatePositionData {
  storeId: string;
  name: string;
  sort_order?: number;
}

/**
 * 포지션 생성 훅 -- 새 포지션을 생성하고 관련 쿼리를 갱신합니다.
 *
 * Mutation hook to create a new position and invalidate related queries.
 *
 * @returns 포지션 생성 뮤테이션 결과 (Position creation mutation result)
 */
export const useCreatePosition = (): UseMutationResult<
  Position,
  Error,
  CreatePositionData
> => {
  const queryClient: QueryClient = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<Position, Error, CreatePositionData>({
    mutationFn: async ({
      storeId,
      ...data
    }: CreatePositionData): Promise<Position> => {
      const response: AxiosResponse<Position> = await api.post(
        `/console/stores/${storeId}/positions`,
        data,
      );
      return response.data;
    },
    onSuccess: (newPos: Position, variables: CreatePositionData): void => {
      queryClient.setQueryData<Position[]>(
        ["positions", variables.storeId],
        (old) => (old ? [...old, newPos] : [newPos]),
      );
      queryClient.setQueryData<StoreDetail>(
        ["stores", variables.storeId],
        (old) =>
          old ? { ...old, positions: [...old.positions, newPos] } : undefined,
      );
      success("Position created.");
    },
    onError: error("Couldn't create position"),
  });
};

/** 포지션 수정 요청 데이터 타입 (Position update request data type) */
interface UpdatePositionData {
  storeId: string;
  id: string;
  name?: string;
  sort_order?: number;
}

/**
 * 포지션 수정 훅 -- 기존 포지션 정보를 수정하고 관련 쿼리를 갱신합니다.
 *
 * Mutation hook to update an existing position and invalidate related queries.
 *
 * @returns 포지션 수정 뮤테이션 결과 (Position update mutation result)
 */
export const useUpdatePosition = (): UseMutationResult<
  Position,
  Error,
  UpdatePositionData
> => {
  const queryClient: QueryClient = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<Position, Error, UpdatePositionData>({
    mutationFn: async ({
      storeId,
      id,
      ...data
    }: UpdatePositionData): Promise<Position> => {
      const response: AxiosResponse<Position> = await api.put(
        `/console/stores/${storeId}/positions/${id}`,
        data,
      );
      return response.data;
    },
    onSuccess: (updated: Position, variables: UpdatePositionData): void => {
      queryClient.setQueryData<Position[]>(
        ["positions", variables.storeId],
        (old) => old?.map((p) => (p.id === variables.id ? updated : p)),
      );
      queryClient.setQueryData<StoreDetail>(
        ["stores", variables.storeId],
        (old) =>
          old
            ? {
                ...old,
                positions: old.positions.map((p) =>
                  p.id === variables.id ? updated : p,
                ),
              }
            : undefined,
      );
      success("Position updated.");
    },
    onError: error("Couldn't update position"),
  });
};

/** 포지션 삭제 요청 데이터 타입 (Position deletion request data type) */
interface DeletePositionData {
  storeId: string;
  id: string;
}

/**
 * 포지션 삭제 훅 -- 포지션을 삭제하고 관련 쿼리를 갱신합니다.
 *
 * Mutation hook to delete a position and invalidate related queries.
 *
 * @returns 포지션 삭제 뮤테이션 결과 (Position deletion mutation result)
 */
export const useDeletePosition = (): UseMutationResult<
  void,
  Error,
  DeletePositionData
> => {
  const queryClient: QueryClient = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<void, Error, DeletePositionData>({
    mutationFn: async ({
      storeId,
      id,
    }: DeletePositionData): Promise<void> => {
      await api.delete(`/console/stores/${storeId}/positions/${id}`);
    },
    onSuccess: (_: void, variables: DeletePositionData): void => {
      queryClient.setQueryData<Position[]>(
        ["positions", variables.storeId],
        (old) => old?.filter((p) => p.id !== variables.id),
      );
      queryClient.setQueryData<StoreDetail>(
        ["stores", variables.storeId],
        (old) =>
          old
            ? {
                ...old,
                positions: old.positions.filter((p) => p.id !== variables.id),
              }
            : undefined,
      );
      success("Position deleted.");
    },
    onError: error("Couldn't delete position"),
  });
};
