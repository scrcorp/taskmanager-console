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
import type { ChecklistTemplate, ChecklistItem, ExcelImportResponse } from "@/types";

/** 체크리스트 템플릿 필터 타입 (Checklist template filter type) */
interface ChecklistTemplateFilters {
  shift_id?: string;
  position_id?: string;
}

/** 전체 체크리스트 템플릿 필터 타입 (All checklist template filter type) */
interface AllChecklistTemplateFilters {
  store_id?: string;
  shift_id?: string;
  position_id?: string;
}

/**
 * 전체 체크리스트 템플릿 조회 훅 -- 조직 전체의 체크리스트 템플릿을 가져옵니다.
 *
 * Custom hook to fetch all checklist templates across stores with optional filters.
 *
 * @param filters - 선택적 필터 (Optional store/shift/position filters)
 * @returns 체크리스트 템플릿 목록 쿼리 결과 (Checklist template list query result)
 */
export const useAllChecklistTemplates = (
  filters?: AllChecklistTemplateFilters,
): UseQueryResult<ChecklistTemplate[], Error> => {
  return useQuery<ChecklistTemplate[], Error>({
    queryKey: ["all-checklist-templates", filters],
    queryFn: async (): Promise<ChecklistTemplate[]> => {
      const params: Record<string, string> = {};
      if (filters?.store_id) params.store_id = filters.store_id;
      if (filters?.shift_id) params.shift_id = filters.shift_id;
      if (filters?.position_id) params.position_id = filters.position_id;

      const response: AxiosResponse<ChecklistTemplate[]> = await api.get(
        "/admin/checklist-templates",
        { params },
      );
      return response.data;
    },
  });
};

/**
 * 체크리스트 템플릿 목록 조회 훅 -- 특정 매장의 체크리스트 템플릿을 가져옵니다.
 *
 * Custom hook to fetch checklist templates for a specific store with optional filters.
 *
 * @param storeId - 매장 ID (Store ID)
 * @param filters - 선택적 필터 (Optional shift/position filters)
 * @returns 체크리스트 템플릿 목록 쿼리 결과 (Checklist template list query result)
 */
export const useChecklistTemplates = (
  storeId: string | undefined,
  filters?: ChecklistTemplateFilters,
): UseQueryResult<ChecklistTemplate[], Error> => {
  return useQuery<ChecklistTemplate[], Error>({
    queryKey: ["checklist-templates", storeId, filters],
    queryFn: async (): Promise<ChecklistTemplate[]> => {
      const params: Record<string, string> = {};
      if (filters?.shift_id) params.shift_id = filters.shift_id;
      if (filters?.position_id) params.position_id = filters.position_id;

      const response: AxiosResponse<ChecklistTemplate[]> = await api.get(
        `/admin/stores/${storeId}/checklist-templates`,
        { params },
      );
      return response.data;
    },
    enabled: !!storeId,
  });
};

/**
 * 체크리스트 템플릿 상세 조회 훅 -- 특정 체크리스트 템플릿의 상세 정보를 가져옵니다.
 *
 * Custom hook to fetch a single checklist template's detail.
 *
 * @param templateId - 템플릿 ID (Template ID)
 * @returns 체크리스트 템플릿 상세 쿼리 결과 (Checklist template detail query result)
 */
export const useChecklistTemplate = (
  templateId: string | undefined,
): UseQueryResult<ChecklistTemplate, Error> => {
  return useQuery<ChecklistTemplate, Error>({
    queryKey: ["checklist-templates", "detail", templateId],
    queryFn: async (): Promise<ChecklistTemplate> => {
      const response: AxiosResponse<ChecklistTemplate> = await api.get(
        `/admin/checklist-templates/${templateId}`,
      );
      return response.data;
    },
    enabled: !!templateId,
  });
};

/** 체크리스트 템플릿 생성 요청 데이터 타입 (Checklist template creation request data type) */
interface CreateChecklistTemplateData {
  storeId: string;
  shift_id: string;
  position_id: string;
  title?: string;
}

/**
 * 체크리스트 템플릿 생성 훅 -- 새 체크리스트 템플릿을 생성하고 관련 쿼리를 갱신합니다.
 *
 * Mutation hook to create a new checklist template and invalidate related queries.
 *
 * @returns 체크리스트 템플릿 생성 뮤테이션 결과 (Checklist template creation mutation result)
 */
export const useCreateChecklistTemplate = (): UseMutationResult<
  ChecklistTemplate,
  Error,
  CreateChecklistTemplateData
> => {
  const queryClient: QueryClient = useQueryClient();
  return useMutation<ChecklistTemplate, Error, CreateChecklistTemplateData>({
    mutationFn: async ({
      storeId,
      ...data
    }: CreateChecklistTemplateData): Promise<ChecklistTemplate> => {
      const response: AxiosResponse<ChecklistTemplate> = await api.post(
        `/admin/stores/${storeId}/checklist-templates`,
        data,
      );
      return response.data;
    },
    onSuccess: (
      _newTemplate: ChecklistTemplate,
      variables: CreateChecklistTemplateData,
    ): void => {
      queryClient.invalidateQueries({
        queryKey: ["checklist-templates", variables.storeId],
      });
      queryClient.invalidateQueries({
        queryKey: ["all-checklist-templates"],
      });
    },
  });
};

/** 체크리스트 템플릿 수정 요청 데이터 타입 (Checklist template update request data type) */
interface UpdateChecklistTemplateData {
  id: string;
  title?: string;
  shift_id?: string;
  position_id?: string;
}

/**
 * 체크리스트 템플릿 수정 훅 -- 기존 체크리스트 템플릿을 수정하고 관련 쿼리를 갱신합니다.
 *
 * Mutation hook to update an existing checklist template and invalidate related queries.
 *
 * @returns 체크리스트 템플릿 수정 뮤테이션 결과 (Checklist template update mutation result)
 */
export const useUpdateChecklistTemplate = (): UseMutationResult<
  ChecklistTemplate,
  Error,
  UpdateChecklistTemplateData
> => {
  const queryClient: QueryClient = useQueryClient();
  return useMutation<ChecklistTemplate, Error, UpdateChecklistTemplateData>({
    mutationFn: async ({
      id,
      ...data
    }: UpdateChecklistTemplateData): Promise<ChecklistTemplate> => {
      const response: AxiosResponse<ChecklistTemplate> = await api.put(
        `/admin/checklist-templates/${id}`,
        data,
      );
      return response.data;
    },
    onSuccess: (
      _updated: ChecklistTemplate,
      _variables: UpdateChecklistTemplateData,
    ): void => {
      queryClient.invalidateQueries({
        queryKey: ["checklist-templates"],
      });
      queryClient.invalidateQueries({
        queryKey: ["all-checklist-templates"],
      });
    },
  });
};

/**
 * 체크리스트 템플릿 삭제 훅 -- 체크리스트 템플릿을 삭제하고 관련 쿼리를 갱신합니다.
 *
 * Mutation hook to delete a checklist template and invalidate related queries.
 *
 * @returns 체크리스트 템플릿 삭제 뮤테이션 결과 (Checklist template deletion mutation result)
 */
export const useDeleteChecklistTemplate = (): UseMutationResult<
  void,
  Error,
  string
> => {
  const queryClient: QueryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: async (id: string): Promise<void> => {
      await api.delete(`/admin/checklist-templates/${id}`);
    },
    onSuccess: (): void => {
      queryClient.invalidateQueries({
        queryKey: ["checklist-templates"],
      });
      queryClient.invalidateQueries({
        queryKey: ["all-checklist-templates"],
      });
    },
  });
};

/**
 * 체크리스트 항목 목록 조회 훅 -- 특정 템플릿의 체크리스트 항목을 가져옵니다.
 *
 * Custom hook to fetch checklist items for a specific template.
 *
 * @param templateId - 템플릿 ID (Template ID)
 * @returns 체크리스트 항목 목록 쿼리 결과 (Checklist item list query result)
 */
export const useChecklistItems = (
  templateId: string | undefined,
): UseQueryResult<ChecklistItem[], Error> => {
  return useQuery<ChecklistItem[], Error>({
    queryKey: ["checklist-items", templateId],
    queryFn: async (): Promise<ChecklistItem[]> => {
      const response: AxiosResponse<ChecklistItem[]> = await api.get(
        `/admin/checklist-templates/${templateId}/items`,
      );
      return response.data;
    },
    enabled: !!templateId,
  });
};

/** 체크리스트 항목 생성 요청 데이터 타입 (Checklist item creation request data type) */
interface CreateChecklistItemData {
  templateId: string;
  title: string;
  description?: string;
  verification_type?: string;
  min_photos?: number;
  recurrence_type?: "daily" | "weekly";
  recurrence_days?: number[] | null;
  sort_order?: number;
}

/**
 * 체크리스트 항목 생성 훅 -- 새 체크리스트 항목을 생성하고 관련 쿼리를 갱신합니다.
 *
 * Mutation hook to create a new checklist item and invalidate related queries.
 *
 * @returns 체크리스트 항목 생성 뮤테이션 결과 (Checklist item creation mutation result)
 */
export const useCreateChecklistItem = (): UseMutationResult<
  ChecklistItem,
  Error,
  CreateChecklistItemData
> => {
  const queryClient: QueryClient = useQueryClient();
  return useMutation<ChecklistItem, Error, CreateChecklistItemData>({
    mutationFn: async ({
      templateId,
      ...data
    }: CreateChecklistItemData): Promise<ChecklistItem> => {
      const response: AxiosResponse<ChecklistItem> = await api.post(
        `/admin/checklist-templates/${templateId}/items`,
        data,
      );
      return response.data;
    },
    onSuccess: (
      newItem: ChecklistItem,
      variables: CreateChecklistItemData,
    ): void => {
      queryClient.setQueryData<ChecklistItem[]>(
        ["checklist-items", variables.templateId],
        (old) => (old ? [...old, newItem] : [newItem]),
      );
      queryClient.setQueriesData<ChecklistTemplate[]>(
        { queryKey: ["checklist-templates"] },
        (old) => {
          if (!old || !Array.isArray(old)) return old;
          return old.map((t) =>
            t.id === variables.templateId
              ? { ...t, item_count: (t.item_count ?? 0) + 1 }
              : t,
          );
        },
      );
    },
  });
};

/** 체크리스트 항목 일괄 생성 요청 데이터 타입 (Checklist bulk item creation request data type) */
interface BulkCreateChecklistItemData {
  templateId: string;
  items: Array<{
    title: string;
    description?: string;
    verification_type?: string;
    recurrence_type?: "daily" | "weekly";
    recurrence_days?: number[] | null;
    sort_order?: number;
  }>;
}

/**
 * 체크리스트 항목 일괄 생성 훅 -- 여러 항목을 단일 요청으로 생성합니다.
 *
 * Mutation hook to bulk-create checklist items in a single atomic request.
 *
 * @returns 체크리스트 항목 일괄 생성 뮤테이션 결과 (Bulk creation mutation result)
 */
export const useBulkCreateChecklistItems = (): UseMutationResult<
  ChecklistItem[],
  Error,
  BulkCreateChecklistItemData
> => {
  const queryClient: QueryClient = useQueryClient();
  return useMutation<ChecklistItem[], Error, BulkCreateChecklistItemData>({
    mutationFn: async ({
      templateId,
      items,
    }: BulkCreateChecklistItemData): Promise<ChecklistItem[]> => {
      const response: AxiosResponse<ChecklistItem[]> = await api.post(
        `/admin/checklist-templates/${templateId}/items/bulk`,
        { items },
      );
      return response.data;
    },
    onSuccess: (
      newItems: ChecklistItem[],
      variables: BulkCreateChecklistItemData,
    ): void => {
      queryClient.setQueryData<ChecklistItem[]>(
        ["checklist-items", variables.templateId],
        (old) => (old ? [...old, ...newItems] : newItems),
      );
      queryClient.setQueriesData<ChecklistTemplate[]>(
        { queryKey: ["checklist-templates"] },
        (old) => {
          if (!old || !Array.isArray(old)) return old;
          return old.map((t) =>
            t.id === variables.templateId
              ? { ...t, item_count: (t.item_count ?? 0) + newItems.length }
              : t,
          );
        },
      );
    },
  });
};

/** 체크리스트 항목 수정 요청 데이터 타입 (Checklist item update request data type) */
interface UpdateChecklistItemData {
  id: string;
  templateId: string;
  title?: string;
  description?: string;
  verification_type?: string;
  min_photos?: number;
  recurrence_type?: "daily" | "weekly";
  recurrence_days?: number[] | null;
  sort_order?: number;
}

/**
 * 체크리스트 항목 수정 훅 -- 기존 체크리스트 항목을 수정하고 관련 쿼리를 갱신합니다.
 *
 * Mutation hook to update an existing checklist item and invalidate related queries.
 *
 * @returns 체크리스트 항목 수정 뮤테이션 결과 (Checklist item update mutation result)
 */
export const useUpdateChecklistItem = (): UseMutationResult<
  ChecklistItem,
  Error,
  UpdateChecklistItemData
> => {
  const queryClient: QueryClient = useQueryClient();
  return useMutation<ChecklistItem, Error, UpdateChecklistItemData>({
    mutationFn: async ({
      id,
      templateId: _templateId,
      ...data
    }: UpdateChecklistItemData): Promise<ChecklistItem> => {
      const response: AxiosResponse<ChecklistItem> = await api.put(
        `/admin/checklist-template-items/${id}`,
        data,
      );
      return response.data;
    },
    onSuccess: (
      updated: ChecklistItem,
      variables: UpdateChecklistItemData,
    ): void => {
      queryClient.setQueryData<ChecklistItem[]>(
        ["checklist-items", variables.templateId],
        (old) => old?.map((item) => (item.id === variables.id ? updated : item)),
      );
    },
  });
};

/** 체크리스트 항목 삭제 요청 데이터 타입 (Checklist item deletion request data type) */
interface DeleteChecklistItemData {
  id: string;
  templateId: string;
}

/**
 * 체크리스트 항목 삭제 훅 -- 체크리스트 항목을 삭제하고 관련 쿼리를 갱신합니다.
 *
 * Mutation hook to delete a checklist item and invalidate related queries.
 *
 * @returns 체크리스트 항목 삭제 뮤테이션 결과 (Checklist item deletion mutation result)
 */
export const useDeleteChecklistItem = (): UseMutationResult<
  void,
  Error,
  DeleteChecklistItemData
> => {
  const queryClient: QueryClient = useQueryClient();
  return useMutation<void, Error, DeleteChecklistItemData>({
    mutationFn: async ({ id }: DeleteChecklistItemData): Promise<void> => {
      await api.delete(`/admin/checklist-template-items/${id}`);
    },
    onSuccess: (_: void, variables: DeleteChecklistItemData): void => {
      queryClient.setQueryData<ChecklistItem[]>(
        ["checklist-items", variables.templateId],
        (old) => old?.filter((item) => item.id !== variables.id),
      );
      queryClient.setQueriesData<ChecklistTemplate[]>(
        { queryKey: ["checklist-templates"] },
        (old) => {
          if (!old || !Array.isArray(old)) return old;
          return old.map((t) =>
            t.id === variables.templateId
              ? { ...t, item_count: Math.max(0, (t.item_count ?? 1) - 1) }
              : t,
          );
        },
      );
    },
  });
};

// === Excel Import/Export ===

/** Excel 임포트 요청 데이터 타입 (Excel import request data type) */
interface ImportChecklistData {
  file: File;
  duplicate_action?: "skip" | "overwrite" | "append";
}

/**
 * 체크리스트 Excel 임포트 훅 -- Excel 파일에서 템플릿을 일괄 생성합니다.
 *
 * Mutation hook to import checklist templates from an Excel file.
 *
 * @returns Excel 임포트 뮤테이션 결과 (Excel import mutation result)
 */
export const useImportChecklistTemplates = (): UseMutationResult<
  ExcelImportResponse,
  Error,
  ImportChecklistData
> => {
  const queryClient: QueryClient = useQueryClient();
  return useMutation<ExcelImportResponse, Error, ImportChecklistData>({
    mutationFn: async ({
      file,
      duplicate_action = "skip",
    }: ImportChecklistData): Promise<ExcelImportResponse> => {
      const formData = new FormData();
      formData.append("file", file);

      const response: AxiosResponse<ExcelImportResponse> = await api.post(
        `/admin/checklist-templates/import?duplicate_action=${duplicate_action}`,
        formData,
        { headers: { "Content-Type": "multipart/form-data" } },
      );
      return response.data;
    },
    onSuccess: (): void => {
      queryClient.invalidateQueries({
        queryKey: ["checklist-templates"],
      });
      queryClient.invalidateQueries({
        queryKey: ["all-checklist-templates"],
      });
    },
  });
};

/**
 * 샘플 Excel 다운로드 함수 -- 샘플 Excel 템플릿을 다운로드합니다.
 *
 * Download the sample Excel template for checklist import.
 */
export const downloadSampleExcel = async (): Promise<void> => {
  const response: AxiosResponse<Blob> = await api.get(
    "/admin/checklist-templates/import/sample",
    { responseType: "blob" },
  );
  const url = window.URL.createObjectURL(response.data);
  const link = document.createElement("a");
  link.href = url;
  link.download = "checklist_template_sample.xlsx";
  link.click();
  window.URL.revokeObjectURL(url);
};
