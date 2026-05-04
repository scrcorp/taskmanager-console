/**
 * 일일 보고서 React Query 훅 모음.
 *
 * Daily report list, detail, and comment hooks.
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
  DailyReport,
  DailyReportComment,
  DailyReportFilters,
  PaginatedResponse,
} from "@/types";

/** 일일 보고서 목록 조회 (필터 + 페이지네이션) */
export const useDailyReports = (
  filters: DailyReportFilters = {},
): UseQueryResult<PaginatedResponse<DailyReport>, Error> => {
  return useQuery({
    queryKey: ["daily-reports", filters],
    queryFn: async () => {
      const params: Record<string, string | number> = {};
      if (filters.store_id) params.store_id = filters.store_id;
      if (filters.date_from) params.date_from = filters.date_from;
      if (filters.date_to) params.date_to = filters.date_to;
      if (filters.period) params.period = filters.period;
      if (filters.status) params.status = filters.status;
      params.page = filters.page ?? 1;
      params.per_page = filters.per_page ?? 20;
      const res: AxiosResponse<PaginatedResponse<DailyReport>> = await api.get(
        "/admin/daily-reports",
        { params },
      );
      return res.data;
    },
  });
};

/** 일일 보고서 단건 조회 */
export const useDailyReport = (
  reportId: string,
): UseQueryResult<DailyReport, Error> => {
  return useQuery({
    queryKey: ["daily-report", reportId],
    queryFn: async () => {
      const res: AxiosResponse<DailyReport> = await api.get(
        `/admin/daily-reports/${reportId}`,
      );
      return res.data;
    },
    enabled: !!reportId,
  });
};

/** 일일 보고서 삭제 */
export const useDeleteDailyReport = (): UseMutationResult<void, Error, string> => {
  const qc = useQueryClient();
  const { success, error } = useMutationToast();
  return useMutation<void, Error, string>({
    mutationFn: async (reportId: string) => {
      await api.delete(`/admin/daily-reports/${reportId}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["daily-reports"] });
      success("Report deleted.");
    },
    onError: error("Failed to delete report"),
  });
};

/** 일일 보고서 댓글 추가 */
export const useAddDailyReportComment = (): UseMutationResult<
  DailyReportComment,
  Error,
  { reportId: string; content: string }
> => {
  const qc = useQueryClient();
  const { success, error } = useMutationToast();
  return useMutation<DailyReportComment, Error, { reportId: string; content: string }>({
    mutationFn: async ({ reportId, content }) => {
      const res: AxiosResponse<DailyReportComment> = await api.post(
        `/admin/daily-reports/${reportId}/comments`,
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
