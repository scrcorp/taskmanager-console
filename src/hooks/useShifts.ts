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
import type { Shift, StoreDetail } from "@/types";

/**
 * 시프트 목록 조회 훅 -- 특정 매장의 시프트 목록을 가져옵니다.
 *
 * Custom hook to fetch shifts for a specific store via React Query.
 *
 * @param storeId - 매장 ID (Store ID to fetch shifts for)
 * @returns 시프트 목록 쿼리 결과 (Shift list query result)
 */
export const useShifts = (
  storeId: string | undefined,
): UseQueryResult<Shift[], Error> => {
  return useQuery<Shift[], Error>({
    queryKey: ["shifts", storeId],
    queryFn: async (): Promise<Shift[]> => {
      const response: AxiosResponse<Shift[]> = await api.get(
        `/console/stores/${storeId}/shifts`,
      );
      return response.data;
    },
    enabled: !!storeId,
  });
};

/** 시프트 생성 요청 데이터 타입 (Shift creation request data type) */
interface CreateShiftData {
  storeId: string;
  name: string;
  sort_order?: number;
}

/**
 * 시프트 생성 훅 -- 새 시프트를 생성하고 관련 쿼리를 갱신합니다.
 *
 * Mutation hook to create a new shift and invalidate related queries.
 *
 * @returns 시프트 생성 뮤테이션 결과 (Shift creation mutation result)
 */
export const useCreateShift = (): UseMutationResult<
  Shift,
  Error,
  CreateShiftData
> => {
  const queryClient: QueryClient = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<Shift, Error, CreateShiftData>({
    mutationFn: async ({
      storeId,
      ...data
    }: CreateShiftData): Promise<Shift> => {
      const response: AxiosResponse<Shift> = await api.post(
        `/console/stores/${storeId}/shifts`,
        data,
      );
      return response.data;
    },
    onSuccess: (newShift: Shift, variables: CreateShiftData): void => {
      queryClient.setQueryData<Shift[]>(
        ["shifts", variables.storeId],
        (old) => (old ? [...old, newShift] : [newShift]),
      );
      queryClient.setQueryData<StoreDetail>(
        ["stores", variables.storeId],
        (old) =>
          old ? { ...old, shifts: [...old.shifts, newShift] } : undefined,
      );
      success("Shift created.");
    },
    onError: error("Couldn't create shift"),
  });
};

/** 시프트 수정 요청 데이터 타입 (Shift update request data type) */
interface UpdateShiftData {
  storeId: string;
  id: string;
  name?: string;
  sort_order?: number;
}

/**
 * 시프트 수정 훅 -- 기존 시프트 정보를 수정하고 관련 쿼리를 갱신합니다.
 *
 * Mutation hook to update an existing shift and invalidate related queries.
 *
 * @returns 시프트 수정 뮤테이션 결과 (Shift update mutation result)
 */
export const useUpdateShift = (): UseMutationResult<
  Shift,
  Error,
  UpdateShiftData
> => {
  const queryClient: QueryClient = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<Shift, Error, UpdateShiftData>({
    mutationFn: async ({
      storeId,
      id,
      ...data
    }: UpdateShiftData): Promise<Shift> => {
      const response: AxiosResponse<Shift> = await api.put(
        `/console/stores/${storeId}/shifts/${id}`,
        data,
      );
      return response.data;
    },
    onSuccess: (updated: Shift, variables: UpdateShiftData): void => {
      queryClient.setQueryData<Shift[]>(
        ["shifts", variables.storeId],
        (old) => old?.map((s) => (s.id === variables.id ? updated : s)),
      );
      queryClient.setQueryData<StoreDetail>(
        ["stores", variables.storeId],
        (old) =>
          old
            ? {
                ...old,
                shifts: old.shifts.map((s) =>
                  s.id === variables.id ? updated : s,
                ),
              }
            : undefined,
      );
      success("Shift updated.");
    },
    onError: error("Couldn't update shift"),
  });
};

/** 시프트 삭제 요청 데이터 타입 (Shift deletion request data type) */
interface DeleteShiftData {
  storeId: string;
  id: string;
}

/**
 * 시프트 삭제 훅 -- 시프트를 삭제하고 관련 쿼리를 갱신합니다.
 *
 * Mutation hook to delete a shift and invalidate related queries.
 *
 * @returns 시프트 삭제 뮤테이션 결과 (Shift deletion mutation result)
 */
export const useDeleteShift = (): UseMutationResult<
  void,
  Error,
  DeleteShiftData
> => {
  const queryClient: QueryClient = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<void, Error, DeleteShiftData>({
    mutationFn: async ({ storeId, id }: DeleteShiftData): Promise<void> => {
      await api.delete(`/console/stores/${storeId}/shifts/${id}`);
    },
    onSuccess: (_: void, variables: DeleteShiftData): void => {
      queryClient.setQueryData<Shift[]>(
        ["shifts", variables.storeId],
        (old) => old?.filter((s) => s.id !== variables.id),
      );
      queryClient.setQueryData<StoreDetail>(
        ["stores", variables.storeId],
        (old) =>
          old
            ? { ...old, shifts: old.shifts.filter((s) => s.id !== variables.id) }
            : undefined,
      );
      success("Shift deleted.");
    },
    onError: error("Couldn't delete shift"),
  });
};
