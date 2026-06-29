/**
 * 일일 보고서 템플릿 React Query 훅 모음.
 *
 * Unified `/console/report-templates` (type=daily) 기반. 섹션 정의는 통합
 * 템플릿의 `payload.sections` 안에 저장된다. legacy `/console/daily-report-templates`
 * 는 더 이상 사용하지 않는다. 뷰가 기대하는 `DailyReportTemplate` 모양으로 매핑한다.
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
  DailyReportTemplateSection,
  DailyReportTemplateUpdate,
} from "@/types";

const DAILY = "daily";

/** Unified report-template 응답 (raw). */
interface RawReportTemplate {
  id: string;
  type: string;
  organization_id: string | null;
  store_id: string | null;
  name: string;
  is_default: boolean;
  is_active: boolean;
  applicable_types: string[] | null;
  payload: { sections?: RawSection[] } & Record<string, unknown>;
  created_at: string | null;
}

interface RawSection {
  id?: string | null;
  title: string;
  description?: string | null;
  is_required?: boolean;
  sort_order?: number;
}

/** unified 응답 → 뷰가 기대하는 DailyReportTemplate 모양으로 매핑. */
function toDailyTemplate(t: RawReportTemplate): DailyReportTemplate {
  const rawSections = Array.isArray(t.payload?.sections) ? t.payload.sections : [];
  const sections: DailyReportTemplateSection[] = rawSections.map((s, i) => ({
    id: s.id ?? `s-${i}`,
    title: s.title,
    description: s.description ?? null,
    sort_order: s.sort_order ?? i + 1,
    is_required: s.is_required ?? false,
  }));
  return {
    id: t.id,
    organization_id: t.organization_id ?? "",
    store_id: t.store_id,
    name: t.name,
    is_default: t.is_default,
    is_active: t.is_active,
    created_at: t.created_at ?? "",
    sections,
  };
}

/** create/update 시 sections → payload.sections 변환. */
function sectionsToPayload(
  sections: { title: string; description?: string | null; sort_order: number; is_required: boolean }[],
): { sections: RawSection[] } {
  return {
    sections: sections.map((s) => ({
      title: s.title,
      description: s.description ?? null,
      sort_order: s.sort_order,
      is_required: s.is_required,
    })),
  };
}

/** 일일 보고서 템플릿 목록 조회. */
export const useTemplates = (
  storeId?: string,
): UseQueryResult<DailyReportTemplate[], Error> => {
  return useQuery({
    queryKey: ["daily-report-templates", storeId],
    queryFn: async () => {
      const params: Record<string, string> = { type: DAILY };
      if (storeId) params.store_id = storeId;
      const res: AxiosResponse<{ items: RawReportTemplate[] }> = await api.get(
        "/console/report-templates",
        { params },
      );
      return (res.data.items ?? []).map(toDailyTemplate);
    },
  });
};

/** 일일 보고서 템플릿 생성. */
export const useCreateTemplate = (): UseMutationResult<
  DailyReportTemplate,
  Error,
  DailyReportTemplateCreate
> => {
  const qc = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<DailyReportTemplate, Error, DailyReportTemplateCreate>({
    mutationFn: async (data: DailyReportTemplateCreate) => {
      const res: AxiosResponse<RawReportTemplate> = await api.post(
        "/console/report-templates",
        {
          type: DAILY,
          name: data.name,
          store_id: data.store_id ?? null,
          is_default: data.is_default ?? false,
          payload: sectionsToPayload(data.sections),
        },
      );
      return toDailyTemplate(res.data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["daily-report-templates"] });
      success("Template created.");
    },
    onError: error("Couldn't create template"),
  });
};

/** 일일 보고서 템플릿 수정. */
export const useUpdateTemplate = (): UseMutationResult<
  DailyReportTemplate,
  Error,
  { id: string; data: DailyReportTemplateUpdate }
> => {
  const qc = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<DailyReportTemplate, Error, { id: string; data: DailyReportTemplateUpdate }>({
    mutationFn: async ({ id, data }: { id: string; data: DailyReportTemplateUpdate }) => {
      const body: Record<string, unknown> = {};
      if (data.name !== undefined) body.name = data.name;
      if (data.is_default !== undefined) body.is_default = data.is_default;
      if (data.is_active !== undefined) body.is_active = data.is_active;
      if (data.sections !== undefined) body.payload = sectionsToPayload(data.sections);
      const res: AxiosResponse<RawReportTemplate> = await api.put(
        `/console/report-templates/${id}`,
        body,
      );
      return toDailyTemplate(res.data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["daily-report-templates"] });
      success("Template updated.");
    },
    onError: error("Couldn't update template"),
  });
};

/** 일일 보고서 템플릿 삭제. */
export const useDeleteTemplate = (): UseMutationResult<void, Error, string> => {
  const qc = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<void, Error, string>({
    mutationFn: async (id: string) => {
      await api.delete(`/console/report-templates/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["daily-report-templates"] });
      success("Template deleted.");
    },
    onError: error("Couldn't delete template"),
  });
};
