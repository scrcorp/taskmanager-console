/**
 * 직원 개인 4~6자리 PIN 조회/재발급 훅.
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
import api, { getErrorCode } from "@/lib/api";
import { useMutationResult } from "@/lib/mutationResult";
import type {
  ClockinPin,
  ClockinPinDirectory,
  ClockinPinLookup,
  ClockinPinSuggestion,
} from "@/types";

/**
 * pin_conflict 409 detail 에서 서버 사유 문장(message) 추출.
 * 계약: {"detail": {"code": "pin_conflict", "reason": ..., "message": "..."}}
 */
function getPinConflictMessage(err: unknown): string | undefined {
  const detail = (
    err as { response?: { data?: { detail?: { message?: unknown } } } }
  )?.response?.data?.detail;
  const message = detail?.message;
  return typeof message === "string" ? message : undefined;
}

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
 * 권한: clockin_pin:update. 4~6자리 숫자만 허용 (서버 검증 ^\d{4,6}$).
 */
export const useUpdateClockinPin = (): UseMutationResult<
  ClockinPin,
  Error,
  UpdateClockinPinVars
> => {
  const queryClient: QueryClient = useQueryClient();
  const { success, error, rawError } = useMutationResult();
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
      // PIN 도구가 열려 있으면 목록/가용성 판정이 방금 바뀐 값 기준으로 갱신돼야 한다.
      void queryClient.invalidateQueries({ queryKey: ["clockin-pin-directory"] });
      void queryClient.invalidateQueries({ queryKey: ["clockin-pin-lookup"] });
      success("PIN updated.");
    },
    onError: (err: Error): void => {
      // 409 pin_conflict — 서버 사유 문장 + 다음 행동 안내 (payroll 패턴: 모달 한 번만).
      if (getErrorCode(err) === "pin_conflict") {
        const reason =
          getPinConflictMessage(err) ??
          "This PIN is already in use by another employee.";
        rawError(`${reason} Try a different number.`, {
          title: "Couldn't update PIN",
        });
        return;
      }
      error("Couldn't update PIN")(err);
    },
  });
};

// ── PIN 찾기 도구 (Staff 페이지 PIN 버튼) ────────────────────────────────

/**
 * PIN 배정 가능 여부 조회 훅.
 *
 * 권한: clockin_pin:read. 저장 경로와 같은 판정(정확 일치)을 쓰므로
 * available=true 면 그대로 저장해도 409 가 나지 않는다.
 *
 * @param pin - 4~6자리 숫자. 형식이 안 맞으면 요청하지 않는다.
 */
export const useClockinPinLookup = (
  pin: string,
): UseQueryResult<ClockinPinLookup, Error> => {
  const valid: boolean = /^\d{4,6}$/.test(pin);
  return useQuery<ClockinPinLookup, Error>({
    queryKey: ["clockin-pin-lookup", pin],
    queryFn: async (): Promise<ClockinPinLookup> => {
      const response: AxiosResponse<ClockinPinLookup> = await api.get(
        "/console/users/clockin-pin/lookup",
        { params: { pin } },
      );
      return response.data;
    },
    enabled: valid,
  });
};

/**
 * 이름 또는 PIN 앞자리로 직원 + 현재 PIN 목록 조회 훅.
 *
 * 권한: clockin_pin:read.
 * @param q - 검색어 (빈 문자열이면 상위 목록)
 * @param includeInactive - 비활성 직원 포함 여부
 * @param enabled - 모달이 닫혀 있을 때 쿼리를 막기 위한 스위치
 */
export const useClockinPinDirectory = (
  q: string,
  includeInactive: boolean = false,
  enabled: boolean = true,
): UseQueryResult<ClockinPinDirectory, Error> => {
  return useQuery<ClockinPinDirectory, Error>({
    queryKey: ["clockin-pin-directory", q, includeInactive],
    queryFn: async (): Promise<ClockinPinDirectory> => {
      const response: AxiosResponse<ClockinPinDirectory> = await api.get(
        "/console/users/clockin-pin/directory",
        { params: { q: q || undefined, include_inactive: includeInactive } },
      );
      return response.data;
    },
    enabled,
  });
};

/**
 * 안 쓰이는 PIN 추천 훅 (배정은 하지 않는다).
 *
 * 권한: clockin_pin:read. 자릿수 공간이 꽉 차면 `pin: null`.
 * 버튼을 누를 때만 돌도록 기본 enabled=false — `refetch()` 로 호출한다.
 */
export const useSuggestClockinPin = (
  length: number = 4,
): UseQueryResult<ClockinPinSuggestion, Error> => {
  return useQuery<ClockinPinSuggestion, Error>({
    queryKey: ["clockin-pin-suggest", length],
    queryFn: async (): Promise<ClockinPinSuggestion> => {
      const response: AxiosResponse<ClockinPinSuggestion> = await api.get(
        "/console/users/clockin-pin/suggest",
        { params: { length } },
      );
      return response.data;
    },
    enabled: false,
    gcTime: 0,
  });
};

/**
 * PIN 제거 뮤테이션 — 번호를 비워 다시 쓸 수 있게 만든다.
 *
 * 권한: clockin_pin:update. PIN 이 없는 직원은 키오스크에서 PIN 출퇴근을 못 한다.
 */
export const useClearClockinPin = (): UseMutationResult<
  ClockinPin,
  Error,
  string
> => {
  const queryClient: QueryClient = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<ClockinPin, Error, string>({
    mutationFn: async (userId: string): Promise<ClockinPin> => {
      const response: AxiosResponse<ClockinPin> = await api.delete(
        `/console/users/${userId}/clockin-pin`,
      );
      return response.data;
    },
    onSuccess: (cleared: ClockinPin): void => {
      queryClient.setQueryData<ClockinPin>(
        ["clockin-pin", cleared.user_id],
        cleared,
      );
      void queryClient.invalidateQueries({ queryKey: ["clockin-pin-directory"] });
      void queryClient.invalidateQueries({ queryKey: ["clockin-pin-lookup"] });
      success("PIN removed.");
    },
    onError: error("Couldn't remove PIN"),
  });
};
