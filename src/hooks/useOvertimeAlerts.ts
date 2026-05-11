/**
 * 초과근무 알림 React Query 훅.
 *
 * 매장별 초과근무 알림 목록을 조회합니다.
 * 근로기준법 설정의 주간 최대 근무시간을 초과한 직원 목록을 반환합니다.
 */

import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";

/** 초과근무 알림 항목 인터페이스 */
export interface OvertimeAlert {
  id: string;
  user_id: string;
  user_name: string;
  total_hours: number;
  max_weekly: number;
  over_hours: number;
  status: string;
}

/** 매장별 초과근무 알림 목록 조회 */
export function useOvertimeAlerts(storeId: string) {
  return useQuery<OvertimeAlert[]>({
    queryKey: ["overtimeAlerts", storeId],
    queryFn: () => api.get(`/console/stores/${storeId}/overtime-alerts`).then((r) => r.data),
    enabled: !!storeId,
  });
}
