/**
 * 일일 보고서 템플릿 React Query 훅 모음.
 *
 * Daily report template CRUD hooks.
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
  DailyReportTemplate,
  DailyReportTemplateCreate,
  DailyReportTemplateUpdate,
} from "@/types";

/** 일일 보고서 템플릿 목록 조회 */
export const useTemplates = (
  storeId?: string,
): UseQueryResult<DailyReportTemplate[], Error> => {
  return useQuery({
    queryKey: ["daily-report-templates", storeId],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (storeId) params.store_id = storeId;
      const res: AxiosResponse<DailyReportTemplate[]> = await api.get(
        "/console/daily-report-templates",
        { params },
      );
      return res.data;
    },
  });
};

/** 일일 보고서 템플릿 단건 조회 */
export const useTemplate = (
  templateId: string,
): UseQueryResult<DailyReportTemplate, Error> => {
  return useQuery({
    queryKey: ["daily-report-template", templateId],
    queryFn: async () => {
      const res: AxiosResponse<DailyReportTemplate> = await api.get(
        `/console/daily-report-templates/${templateId}`,
      );
      return res.data;
    },
    enabled: !!templateId,
  });
};

/** 일일 보고서 템플릿 생성 */
export const useCreateTemplate = (): UseMutationResult<
  DailyReportTemplate,
  Error,
  DailyReportTemplateCreate
> => {
  const qc = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<DailyReportTemplate, Error, DailyReportTemplateCreate>({
    mutationFn: async (data: DailyReportTemplateCreate) => {
      const res: AxiosResponse<DailyReportTemplate> = await api.post(
        "/console/daily-report-templates",
        data,
      );
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["daily-report-templates"] });
      success("Template created.");
    },
    onError: error("Couldn't create template"),
  });
};

/** 일일 보고서 템플릿 수정 */
export const useUpdateTemplate = (): UseMutationResult<
  DailyReportTemplate,
  Error,
  { id: string; data: DailyReportTemplateUpdate }
> => {
  const qc = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<DailyReportTemplate, Error, { id: string; data: DailyReportTemplateUpdate }>({
    mutationFn: async ({ id, data }: { id: string; data: DailyReportTemplateUpdate }) => {
      const res: AxiosResponse<DailyReportTemplate> = await api.put(
        `/console/daily-report-templates/${id}`,
        data,
      );
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["daily-report-templates"] });
      success("Template updated.");
    },
    onError: error("Couldn't update template"),
  });
};

/** 일일 보고서 템플릿 삭제 */
export const useDeleteTemplate = (): UseMutationResult<void, Error, string> => {
  const qc = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<void, Error, string>({
    mutationFn: async (id: string) => {
      await api.delete(`/console/daily-report-templates/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["daily-report-templates"] });
      success("Template deleted.");
    },
    onError: error("Couldn't delete template"),
  });
};

/** Excel 파일로 템플릿 생성 */
export const useUploadTemplateExcel = (): UseMutationResult<
  DailyReportTemplate,
  Error,
  { file: File; name: string; store_id?: string }
> => {
  const qc = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<
    DailyReportTemplate,
    Error,
    { file: File; name: string; store_id?: string }
  >({
    mutationFn: async ({ file, name, store_id }) => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("name", name);
      if (store_id) formData.append("store_id", store_id);
      const res: AxiosResponse<DailyReportTemplate> = await api.post(
        "/console/daily-report-templates/upload-excel",
        formData,
        { headers: { "Content-Type": "multipart/form-data" } },
      );
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["daily-report-templates"] });
      success("Import complete.");
    },
    onError: error("Couldn't upload Excel file"),
  });
};

/** 샘플 Excel 파일 다운로드 */
export const downloadSampleExcel = async (): Promise<void> => {
  const res = await api.get("/console/daily-report-templates/excel/sample", {
    responseType: "blob",
  });
  const url = window.URL.createObjectURL(new Blob([res.data]));
  const a = document.createElement("a");
  a.href = url;
  a.download = "daily_report_template_sample.xlsx";
  a.click();
  window.URL.revokeObjectURL(url);
};
