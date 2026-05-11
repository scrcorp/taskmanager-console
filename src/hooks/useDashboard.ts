/**
 * 대시보드 React Query 훅 모음.
 *
 * 대시보드 페이지에서 사용하는 4개의 요약 데이터 훅:
 * - useChecklistCompletion: 체크리스트 완료율
 * - useAttendanceSummary: 출석 현황
 * - useOvertimeSummary: 초과근무 현황
 * - useEvaluationSummary: 평가 현황
 */

import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import type { ChecklistCompletion, AttendanceSummary, OvertimeSummary, EvaluationSummary } from "@/types";

/** URL 쿼리 파라미터 빌드 — null/undefined 값은 제외 */
function buildParams(params: Record<string, string | undefined | null>) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v) sp.set(k, v);
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

/** 체크리스트 완료율 조회 — 날짜 범위와 매장으로 필터링 */
export function useChecklistCompletion(dateFrom?: string, dateTo?: string, storeId?: string) {
  return useQuery<ChecklistCompletion>({
    queryKey: ["dashboard", "checklist-completion", dateFrom, dateTo, storeId],
    queryFn: () =>
      api.get(`/console/dashboard/checklist-completion${buildParams({ date_from: dateFrom, date_to: dateTo, store_id: storeId })}`).then((r) => r.data),
  });
}

/** 출석 현황 요약 조회 — 날짜 범위와 매장으로 필터링 */
export function useAttendanceSummary(dateFrom?: string, dateTo?: string, storeId?: string) {
  return useQuery<AttendanceSummary>({
    queryKey: ["dashboard", "attendance-summary", dateFrom, dateTo, storeId],
    queryFn: () =>
      api.get(`/console/dashboard/attendance-summary${buildParams({ date_from: dateFrom, date_to: dateTo, store_id: storeId })}`).then((r) => r.data),
  });
}

/** 초과근무 현황 요약 조회 — 주간 날짜와 매장으로 필터링 */
export function useOvertimeSummary(weekDate?: string, storeId?: string) {
  return useQuery<OvertimeSummary>({
    queryKey: ["dashboard", "overtime-summary", weekDate, storeId],
    queryFn: () =>
      api.get(`/console/dashboard/overtime-summary${buildParams({ week_date: weekDate, store_id: storeId })}`).then((r) => r.data),
  });
}

/** 평가 현황 요약 조회 — 전체 조직의 평가 통계 */
export function useEvaluationSummary() {
  return useQuery<EvaluationSummary>({
    queryKey: ["dashboard", "evaluation-summary"],
    queryFn: () =>
      api.get("/console/dashboard/evaluation-summary").then((r) => r.data),
  });
}
