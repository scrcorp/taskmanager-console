/**
 * 시급 변경(rate change) 훅 — Payroll v1 R4.
 *
 * 개인 시급 변경은 단순 필드 수정이 아니라 이력(hourly_rate_history)이 canonical.
 * 콘솔은 이 훅으로 변경 등록(POST) / 이력 조회(GET)를 수행한다.
 *
 * Server: POST/GET /api/v1/console/users/{user_id}/rate-changes
 * (users:update / users:read + cost visibility GM+ — 403 below GM)
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

/** YYYY-MM-DD 문자열 생성 (로컬 기준, TZ 시프트 없음) */
function toYMD(year: number, monthIndex: number, day: number): string {
  const mm = String(monthIndex + 1).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

/**
 * 다음 급여기간 시작일 — 오늘 기준으로 다가오는 1일 또는 16일 (semi-monthly).
 * (오늘이 1~15일이면 이번 달 16일, 16일 이후면 다음 달 1일)
 */
export function nextPayPeriodStart(today: Date = new Date()): string {
  const y = today.getFullYear();
  const m = today.getMonth();
  if (today.getDate() < 16) return toYMD(y, m, 16);
  return m === 11 ? toYMD(y + 1, 0, 1) : toYMD(y, m + 1, 1);
}

/** 시급 변경 이력 1건 (hourly_rate_history 행) */
export interface RateChangeEntry {
  id: string;
  /** 변경 전 시급 — null = 최초 기록 */
  old_rate: number | null;
  new_rate: number;
  /** 적용 시작일 (YYYY-MM-DD) */
  effective_date: string;
  /** 적용일 도래 여부 — false = pending (미래 예약) */
  applied: boolean;
  reason: string | null;
  changed_by: string | null;
  changed_by_name: string | null;
  created_at: string;
}

/** 시급 변경 등록 요청 */
export interface RateChangeCreateData {
  userId: string;
  /** 새 시급 — 0 이하면 서버 400 */
  new_rate: number;
  /** 적용 시작일 (YYYY-MM-DD). 생략 시 서버가 오늘(UTC)로 적용 */
  effective_date?: string;
  reason?: string;
}

/** 시급 변경 등록 결과 — 같은 값 재등록은 no-op (recorded=false) */
export interface RateChangeResult {
  recorded: boolean;
  entry: RateChangeEntry | null;
}

/**
 * 시급 변경 이력 조회 훅 (최신 우선 — effective_date DESC, created_at DESC).
 *
 * @param userId - 대상 사용자 ID
 * @param enabled - 호출 게이트 — cost visibility 없는 뷰어(GM 미만)는 서버가
 *   403을 내므로 호출 자체를 막는 용도 (don't add new exposure)
 */
export const useRateChanges = (
  userId: string | undefined,
  enabled: boolean = true,
): UseQueryResult<RateChangeEntry[], Error> => {
  return useQuery<RateChangeEntry[], Error>({
    queryKey: ["users", userId, "rate-changes"],
    queryFn: async (): Promise<RateChangeEntry[]> => {
      const response: AxiosResponse<RateChangeEntry[]> = await api.get(
        `/console/users/${userId}/rate-changes`,
      );
      return response.data;
    },
    enabled: !!userId && enabled,
  });
};

/**
 * 시급 변경 등록 훅 — 이력 기록 + 즉시 적용(오늘 이전 effective_date)이면
 * 현재 시급도 갱신되므로 user 상세/목록 쿼리를 함께 무효화한다.
 */
export const useCreateRateChange = (): UseMutationResult<
  RateChangeResult,
  Error,
  RateChangeCreateData
> => {
  const queryClient: QueryClient = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<RateChangeResult, Error, RateChangeCreateData>({
    mutationFn: async ({
      userId,
      ...body
    }: RateChangeCreateData): Promise<RateChangeResult> => {
      const response: AxiosResponse<RateChangeResult> = await api.post(
        `/console/users/${userId}/rate-changes`,
        body,
      );
      return response.data;
    },
    onSuccess: (result: RateChangeResult): void => {
      // 이력 + user 상세/목록 모두 ["users", ...] 프리픽스 아래에 있음
      queryClient.invalidateQueries({ queryKey: ["users"] });
      if (result.recorded) {
        success(
          result.entry && !result.entry.applied
            ? "Rate change scheduled."
            : "Rate change saved.",
        );
      } else {
        success("No change recorded — the rate is already the same on that date.");
      }
    },
    onError: error("Couldn't save rate change"),
  });
};
