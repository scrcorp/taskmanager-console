/**
 * 일일 보고서 React Query 훅 모음.
 *
 * Unified report API (`/console/reports`, type=daily) 기반. legacy
 * `/console/daily-reports*` 는 더 이상 사용하지 않는다. 목록/단건은 통합 `Report`
 * 타입을 반환한다 (period/sections 는 `report.payload` 안에 들어있음).
 */
import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
  type UseMutationResult,
} from "@tanstack/react-query";
import type { AxiosResponse } from "axios";
import api from "@/lib/api";
import { useMutationToast } from "@/lib/mutationToast";
import type {
  DailyReportFilters,
  PaginatedResponse,
  Report,
  ReportComment,
} from "@/types";

const DAILY = "daily";

/** 일일 보고서 목록 조회 (필터 + 페이지네이션) — 통합 reports 엔드포인트. */
export const useDailyReports = (
  filters: DailyReportFilters = {},
): UseQueryResult<PaginatedResponse<Report>, Error> => {
  return useQuery({
    queryKey: ["daily-reports", filters],
    queryFn: async () => {
      const params: Record<string, string | number | boolean> = { type: DAILY };
      if (filters.store_id) params.store_id = filters.store_id;
      if (filters.date_from) params.date_from = filters.date_from;
      if (filters.date_to) params.date_to = filters.date_to;
      if (filters.period) params.period = filters.period;
      if (filters.status) params.status = filters.status;
      params.page = filters.page ?? 1;
      params.per_page = filters.per_page ?? 20;
      const res: AxiosResponse<PaginatedResponse<Report>> = await api.get(
        "/console/reports",
        { params },
      );
      return res.data;
    },
  });
};

/** 일일 보고서 단건 조회 — 통합 reports 엔드포인트. */
export const useDailyReport = (
  reportId: string,
): UseQueryResult<Report, Error> => {
  return useQuery({
    queryKey: ["daily-report", reportId],
    queryFn: async () => {
      const res: AxiosResponse<Report> = await api.get(
        `/console/reports/${reportId}`,
      );
      return res.data;
    },
    enabled: !!reportId,
  });
};

/** 일일 보고서 삭제. */
export const useDeleteDailyReport = (): UseMutationResult<void, Error, string> => {
  const qc = useQueryClient();
  const { success, error } = useMutationToast();
  return useMutation<void, Error, string>({
    mutationFn: async (reportId: string) => {
      await api.delete(`/console/reports/${reportId}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["daily-reports"] });
      success("Report deleted.");
    },
    onError: error("Failed to delete report"),
  });
};

/** 일일 보고서 댓글 추가. */
export const useAddDailyReportComment = (): UseMutationResult<
  ReportComment,
  Error,
  { reportId: string; content: string }
> => {
  const qc = useQueryClient();
  const { success, error } = useMutationToast();
  return useMutation<ReportComment, Error, { reportId: string; content: string }>({
    mutationFn: async ({ reportId, content }) => {
      const res: AxiosResponse<ReportComment> = await api.post(
        `/console/reports/${reportId}/comments`,
        { content },
      );
      return res.data;
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: ["daily-report", variables.reportId] });
      success("Comment posted.");
    },
    onError: error("Failed to post comment"),
  });
};
