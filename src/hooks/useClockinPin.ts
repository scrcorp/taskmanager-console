/**
 * 직원 개인 6자리 PIN 조회/재발급 훅.
 *
 * 출퇴근용 태블릿(Attendance Device)에서 사용하는 개인 PIN.
 */

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
import type { ClockinPin } from "@/types";

/**
 * 직원 개인 PIN 조회 훅.
 *
 * 권한: clockin_pin:read
 * @param userId - 직원 user id
 * @param enabled - 실제 쿼리 실행 여부 (권한 없으면 false로 막음)
 */
export const useClockinPin = (
  userId: string | undefined,
  enabled: boolean = true,
): UseQueryResult<ClockinPin, Error> => {
  return useQuery<ClockinPin, Error>({
    queryKey: ["clockin-pin", userId],
    queryFn: async (): Promise<ClockinPin> => {
      const response: AxiosResponse<ClockinPin> = await api.get(
        `/console/users/${userId}/clockin-pin`,
      );
      return response.data;
    },
    enabled: !!userId && enabled,
  });
};

/**
 * 직원 개인 PIN 재발급 뮤테이션.
 *
 * 권한: clockin_pin:update
 */
export const useRegenerateClockinPin = (): UseMutationResult<
  ClockinPin,
  Error,
  string
> => {
  const queryClient: QueryClient = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<ClockinPin, Error, string>({
    mutationFn: async (userId: string): Promise<ClockinPin> => {
      const response: AxiosResponse<ClockinPin> = await api.post(
        `/console/users/${userId}/clockin-pin/regenerate`,
      );
      return response.data;
    },
    onSuccess: (newPin: ClockinPin): void => {
      queryClient.setQueryData<ClockinPin>(
        ["clockin-pin", newPin.user_id],
        newPin,
      );
      success("Regenerated.");
    },
    onError: error("Couldn't regenerate PIN"),
  });
};

interface UpdateClockinPinVars {
  userId: string;
  clockinPin: string;
}

/**
 * 직원 개인 PIN 직접 변경 뮤테이션 (관리자가 값 지정).
 *
 * 권한: clockin_pin:update. 6자리 숫자만 허용.
 */
export const useUpdateClockinPin = (): UseMutationResult<
  ClockinPin,
  Error,
  UpdateClockinPinVars
> => {
  const queryClient: QueryClient = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<ClockinPin, Error, UpdateClockinPinVars>({
    mutationFn: async ({
      userId,
      clockinPin,
    }: UpdateClockinPinVars): Promise<ClockinPin> => {
      const response: AxiosResponse<ClockinPin> = await api.put(
        `/console/users/${userId}/clockin-pin`,
        { clockin_pin: clockinPin },
      );
      return response.data;
    },
    onSuccess: (newPin: ClockinPin): void => {
      queryClient.setQueryData<ClockinPin>(
        ["clockin-pin", newPin.user_id],
        newPin,
      );
      success("PIN updated.");
    },
    onError: error("Couldn't update PIN"),
  });
};
