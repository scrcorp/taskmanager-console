/**
 * Multi-type Report (issue 등) React Query 훅.
 *
 * 기존 daily는 useDailyReports.ts 유지. 신규 통합 API는 이쪽.
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
import { useMutationResult } from "@/lib/mutationResult";
import type {
  IssueReportCreateRequest,
  PaginatedResponse,
  Report,
  ReportComment,
  ReportFilters,
} from "@/types";

/** Reports 목록 (type, 필터). */
export const useReports = (
  filters: ReportFilters = {},
): UseQueryResult<PaginatedResponse<Report>, Error> => {
  return useQuery({
    queryKey: ["reports", filters],
    queryFn: async () => {
      const params: Record<string, string | number | boolean> = {};
      if (filters.type) params.type = filters.type;
      if (filters.store_id) params.store_id = filters.store_id;
      if (filters.date_from) params.date_from = filters.date_from;
      if (filters.date_to) params.date_to = filters.date_to;
      if (filters.status) params.status = filters.status;
      if (filters.show_all) params.show_all = true;
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

/** Report 단건. */
export const useReport = (
  reportId: string,
): UseQueryResult<Report, Error> => {
  return useQuery({
    queryKey: ["report", reportId],
    queryFn: async () => {
      const res: AxiosResponse<Report> = await api.get(`/console/reports/${reportId}`);
      return res.data;
    },
    enabled: !!reportId,
  });
};

/** Issue 생성 (console에서도 가능). */
export const useCreateIssueReport = (): UseMutationResult<
  Report,
  Error,
  IssueReportCreateRequest
> => {
  const qc = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<Report, Error, IssueReportCreateRequest>({
    mutationFn: async (data) => {
      const res: AxiosResponse<Report> = await api.post("/console/reports", data);
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reports"] });
      success("Issue created.");
    },
    onError: error("Couldn't create issue"),
  });
};

/** Issue 상태 전이 (open → in_progress → closed). */
export const useTransitionIssue = (): UseMutationResult<
  Report,
  Error,
  { reportId: string; status: string }
> => {
  const qc = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<Report, Error, { reportId: string; status: string }>({
    mutationFn: async ({ reportId, status }) => {
      const res: AxiosResponse<Report> = await api.post(
        `/console/reports/${reportId}/transition`,
        { status },
      );
      return res.data;
    },
    onSuccess: (_, { reportId }) => {
      qc.invalidateQueries({ queryKey: ["reports"] });
      qc.invalidateQueries({ queryKey: ["report", reportId] });
      success("Status updated.");
    },
    onError: error("Couldn't change status"),
  });
};

/** Report 댓글. */
export const useAddReportComment = (): UseMutationResult<
  ReportComment,
  Error,
  { reportId: string; content: string }
> => {
  const qc = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<ReportComment, Error, { reportId: string; content: string }>({
    mutationFn: async ({ reportId, content }) => {
      const res: AxiosResponse<ReportComment> = await api.post(
        `/console/reports/${reportId}/comments`,
        { content },
      );
      return res.data;
    },
    onSuccess: (_, { reportId }) => {
      qc.invalidateQueries({ queryKey: ["report", reportId] });
      success("Comment posted.");
    },
    onError: error("Couldn't post comment"),
  });
};

/** Report 본문 수정 (작성자 또는 GM+). */
export const useUpdateReport = (): UseMutationResult<
  Report,
  Error,
  { reportId: string; data: { title?: string; payload?: Record<string, unknown> } }
> => {
  const qc = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<
    Report,
    Error,
    { reportId: string; data: { title?: string; payload?: Record<string, unknown> } }
  >({
    mutationFn: async ({ reportId, data }) => {
      const res: AxiosResponse<Report> = await api.put(
        `/console/reports/${reportId}`,
        data,
      );
      return res.data;
    },
    onSuccess: (_, { reportId }) => {
      qc.invalidateQueries({ queryKey: ["reports"] });
      qc.invalidateQueries({ queryKey: ["report", reportId] });
      success("Report updated.");
    },
    onError: error("Couldn't update report"),
  });
};

/** Report 삭제 (admin). */
export const useDeleteReport = (): UseMutationResult<void, Error, string> => {
  const qc = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<void, Error, string>({
    mutationFn: async (reportId) => {
      await api.delete(`/console/reports/${reportId}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reports"] });
      success("Report deleted.");
    },
    onError: error("Couldn't delete report"),
  });
};

// ── Link Picker용 — 매장 schedule/checklist instance 최근 N일 ─────

import type { Schedule, ChecklistInstance } from "@/types";

interface DateRange {
  daysBack?: number;
}

// LinkPicker 검색용 schedule fetch — default 90 days. 사용자가 더 과거 schedule
// 도 link 할 수 있어야 하므로 충분히 넓은 범위.
export const useStoreSchedulesForLink = (
  storeId: string | null | undefined,
  range: DateRange = { daysBack: 90 },
): UseQueryResult<PaginatedResponse<Schedule>, Error> => {
  const today = new Date().toISOString().slice(0, 10);
  const back = new Date(Date.now() - (range.daysBack ?? 90) * 86400000)
    .toISOString()
    .slice(0, 10);
  return useQuery({
    queryKey: ["store-schedules-link", storeId, back, today],
    queryFn: async () => {
      const res: AxiosResponse<PaginatedResponse<Schedule>> = await api.get(
        "/console/schedules",
        {
          params: {
            store_id: storeId,
            date_from: back,
            date_to: today,
            per_page: 100,
          },
        },
      );
      return res.data;
    },
    enabled: !!storeId,
  });
};

export const useStoreChecklistInstancesForLink = (
  storeId: string | null | undefined,
  range: DateRange = { daysBack: 14 },
): UseQueryResult<PaginatedResponse<ChecklistInstance>, Error> => {
  const today = new Date().toISOString().slice(0, 10);
  return useQuery({
    queryKey: ["store-checklist-instances-link", storeId, range.daysBack, today],
    queryFn: async () => {
      const res: AxiosResponse<PaginatedResponse<ChecklistInstance>> = await api.get(
        "/console/checklist-instances",
        {
          params: {
            store_id: storeId,
            per_page: 100,
          },
        },
      );
      return res.data;
    },
    enabled: !!storeId,
  });
};

// ── Report Templates (multi-type) ─────────────────────────────────

export interface ReportTemplate {
  id: string;
  type: string;
  organization_id: string | null;
  store_id: string | null;
  name: string;
  is_default: boolean;
  is_active: boolean;
  payload: Record<string, unknown>;
  created_at?: string;
}

/** Effective template lookup: store → org → system default. */
export const useLookupReportTemplate = (
  type: string,
  storeId: string | null | undefined,
  enabled = true,
): UseQueryResult<ReportTemplate, Error> => {
  return useQuery({
    queryKey: ["report-template-lookup", type, storeId],
    queryFn: async () => {
      const params: Record<string, string> = { type };
      if (storeId) params.store_id = storeId;
      const res: AxiosResponse<ReportTemplate> = await api.get(
        "/console/report-templates/lookup",
        { params },
      );
      return res.data;
    },
    enabled,
  });
};

/** List templates by type/store. */
export const useReportTemplates = (
  type?: string,
  storeId?: string,
): UseQueryResult<{ items: ReportTemplate[] }, Error> => {
  return useQuery({
    queryKey: ["report-templates", type, storeId],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (type) params.type = type;
      if (storeId) params.store_id = storeId;
      const res: AxiosResponse<{ items: ReportTemplate[] }> = await api.get(
        "/console/report-templates",
        { params },
      );
      return res.data;
    },
  });
};

/** Create or update a template (store-specific issue form). */
export const useSaveReportTemplate = (): UseMutationResult<
  ReportTemplate,
  Error,
  { id?: string; type: string; name: string; store_id?: string | null; payload: Record<string, unknown> }
> => {
  const qc = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<
    ReportTemplate,
    Error,
    { id?: string; type: string; name: string; store_id?: string | null; payload: Record<string, unknown> }
  >({
    mutationFn: async (data) => {
      if (data.id) {
        const res: AxiosResponse<ReportTemplate> = await api.put(
          `/console/report-templates/${data.id}`,
          { name: data.name, payload: data.payload },
        );
        return res.data;
      }
      const res: AxiosResponse<ReportTemplate> = await api.post(
        "/console/report-templates",
        {
          type: data.type,
          name: data.name,
          store_id: data.store_id ?? null,
          is_default: false,
          payload: data.payload,
        },
      );
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["report-templates"] });
      qc.invalidateQueries({ queryKey: ["report-template-lookup"] });
      success("Template saved.");
    },
    onError: error("Couldn't save template"),
  });
};

/** Delete a report template by id. */
export const useDeleteReportTemplate = (): UseMutationResult<
  void,
  Error,
  string
> => {
  const qc = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<void, Error, string>({
    mutationFn: async (id) => {
      await api.delete(`/console/report-templates/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["report-templates"] });
      qc.invalidateQueries({ queryKey: ["report-template-lookup"] });
      success("Template removed. Now using organization defaults.");
    },
    onError: error("Couldn't remove template"),
  });
};
