/**
 * 체크리스트 완료 로그 React Query 훅.
 *
 * 체크리스트 아이템별 완료 기록을 조회합니다.
 * 매장, 사용자, 날짜 범위로 필터링하고 페이지네이션을 지원합니다.
 */

import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";

/** 완료 로그 항목 인터페이스 */
export interface CompletionLogEntry {
  id: string;
  instance_id: string;
  item_index: number;
  item_title: string;
  user_id: string;
  user_name: string;
  store_id: string;
  store_name: string;
  work_date: string;
  completed_at: string | null;
  completed_timezone: string | null;
  photo_url: string | null;
  note: string | null;
}

/** 완료 로그 필터 조건 */
interface CompletionLogFilters {
  store_id?: string;
  user_id?: string;
  date_from?: string;
  date_to?: string;
  page?: number;
  per_page?: number;
}

interface CompletionLogResponse {
  items: CompletionLogEntry[];
  total: number;
  page: number;
  per_page: number;
}

/** 체크리스트 완료 로그 목록 조회 — 필터 조건에 따라 페이지네이션된 결과 반환 */
export function useCompletionLog(filters: CompletionLogFilters = {}) {
  const params: Record<string, string | number> = {};
  if (filters.store_id) params.store_id = filters.store_id;
  if (filters.user_id) params.user_id = filters.user_id;
  if (filters.date_from) params.date_from = filters.date_from;
  if (filters.date_to) params.date_to = filters.date_to;
  if (filters.page) params.page = filters.page;
  if (filters.per_page) params.per_page = filters.per_page;

  return useQuery<CompletionLogResponse>({
    queryKey: ["completion-log", params],
    queryFn: () => api.get("/console/checklist-instances/completion-log", { params }).then((r) => r.data),
  });
}
