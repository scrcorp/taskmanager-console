import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
  type UseMutationResult,
} from "@tanstack/react-query";
import type { AxiosResponse } from "axios";
import api from "@/lib/api";
import type {
  ChecklistInstance,
  ChecklistInstanceFilters,
  ChecklistItemReview,
  PaginatedResponse,
  ReviewContent,
} from "@/types";

/**
 * 체크리스트 인스턴스 목록 조회 훅 -- 필터와 페이지네이션을 지원하는 인스턴스 목록을 가져옵니다.
 *
 * Custom hook to fetch paginated checklist instances with optional filters.
 *
 * @param filters - 선택적 필터 (Optional filters for store, date, status, pagination)
 * @returns 체크리스트 인스턴스 목록 쿼리 결과 (Checklist instance list query result)
 */
export const useChecklistInstances = (
  filters: ChecklistInstanceFilters = {},
): UseQueryResult<PaginatedResponse<ChecklistInstance>, Error> => {
  const params: Record<string, string | number> = {};
  if (filters.store_id) params.store_id = filters.store_id;
  if (filters.work_date) params.work_date = filters.work_date;
  if (filters.status) params.status = filters.status;
  if (filters.page) params.page = filters.page;
  if (filters.per_page) params.per_page = filters.per_page;

  return useQuery<PaginatedResponse<ChecklistInstance>, Error>({
    queryKey: ["checklist-instances", params],
    queryFn: async (): Promise<PaginatedResponse<ChecklistInstance>> => {
      const response: AxiosResponse<PaginatedResponse<ChecklistInstance>> =
        await api.get("/admin/checklist-instances", { params });
      return response.data;
    },
  });
};

export interface ReviewSummary {
  total_items: number;
  completed_items: number;
  reviewed_items: number;
  pass: number;
  fail: number;
  caution: number;
  pending_re_review: number;
  unreviewed: number;
  total_assignments: number;
  fully_approved_assignments: number;
}

export const useReviewSummary = (
  filters: { store_id?: string; date_from?: string; date_to?: string } = {},
): UseQueryResult<ReviewSummary, Error> => {
  const params: Record<string, string> = {};
  if (filters.store_id) params.store_id = filters.store_id;
  if (filters.date_from) params.date_from = filters.date_from;
  if (filters.date_to) params.date_to = filters.date_to;
  return useQuery<ReviewSummary, Error>({
    queryKey: ["review-summary", params],
    queryFn: async () => {
      const res: AxiosResponse<ReviewSummary> = await api.get("/admin/checklist-instances/review-summary", { params });
      return res.data;
    },
  });
};

/**
 * 체크리스트 인스턴스 상세 조회 훅 -- 특정 인스턴스의 상세 정보를 가져옵니다.
 *
 * Custom hook to fetch a single checklist instance detail (includes completions).
 *
 * @param id - 인스턴스 ID (Instance ID)
 * @returns 체크리스트 인스턴스 상세 쿼리 결과 (Checklist instance detail query result)
 */
export const useChecklistInstance = (
  id: string | undefined,
): UseQueryResult<ChecklistInstance, Error> => {
  return useQuery<ChecklistInstance, Error>({
    queryKey: ["checklist-instances", id],
    queryFn: async (): Promise<ChecklistInstance> => {
      const response: AxiosResponse<ChecklistInstance> = await api.get(
        `/admin/checklist-instances/${id}`,
      );
      return response.data;
    },
    enabled: !!id,
  });
};

/**
 * 스케줄 ID로 체크리스트 인스턴스 조회
 */
export const useChecklistInstanceBySchedule = (
  scheduleId: string | undefined,
): UseQueryResult<ChecklistInstance, Error> => {
  return useQuery<ChecklistInstance, Error>({
    queryKey: ["checklist-instances", "by-schedule", scheduleId],
    queryFn: async (): Promise<ChecklistInstance> => {
      const response: AxiosResponse<ChecklistInstance> = await api.get(
        `/admin/checklist-instances/by-schedule/${scheduleId}`,
      );
      return response.data;
    },
    enabled: !!scheduleId,
  });
};

/**
 * 아이템 리뷰 upsert 훅 -- 체크리스트 아이템에 리뷰를 생성/수정합니다 (result만).
 *
 * Custom hook to upsert a review on a checklist item (result only).
 */
export function useUpsertItemReview(): UseMutationResult<
  ChecklistItemReview,
  Error,
  {
    instanceId: string;
    itemIndex: number;
    result: string;
    comment_text?: string;
    comment_photo_url?: string;
  }
> {
  const queryClient = useQueryClient();
  return useMutation<
    ChecklistItemReview,
    Error,
    {
      instanceId: string;
      itemIndex: number;
      result: string;
      comment_text?: string;
      comment_photo_url?: string;
    }
  >({
    mutationFn: async ({
      instanceId,
      itemIndex,
      result,
      comment_text,
      comment_photo_url,
    }): Promise<ChecklistItemReview> => {
      const body: Record<string, string> = { result };
      if (comment_text) body.comment_text = comment_text;
      if (comment_photo_url) body.comment_photo_url = comment_photo_url;
      const response: AxiosResponse<ChecklistItemReview> = await api.put(
        `/admin/checklist-instances/${instanceId}/items/${itemIndex}/review`,
        body,
      );
      return response.data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["checklist-instances", variables.instanceId],
      });
    },
  });
}

/**
 * 아이템 리뷰 삭제 훅.
 *
 * Custom hook to delete a review on a checklist item.
 */
export function useDeleteItemReview(): UseMutationResult<
  void,
  Error,
  { instanceId: string; itemIndex: number }
> {
  const queryClient = useQueryClient();
  return useMutation<
    void,
    Error,
    { instanceId: string; itemIndex: number }
  >({
    mutationFn: async ({ instanceId, itemIndex }): Promise<void> => {
      await api.delete(
        `/admin/checklist-instances/${instanceId}/items/${itemIndex}/review`,
      );
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["checklist-instances", variables.instanceId],
      });
    },
  });
}

/**
 * 리뷰 콘텐츠 추가 훅 -- 리뷰에 텍스트/사진/영상을 추가합니다.
 *
 * Custom hook to add content (text/photo/video) to a review.
 */
export function useAddReviewContent(): UseMutationResult<
  ReviewContent,
  Error,
  { instanceId: string; itemIndex: number; type: string; content: string }
> {
  const queryClient = useQueryClient();
  return useMutation<
    ReviewContent,
    Error,
    { instanceId: string; itemIndex: number; type: string; content: string }
  >({
    mutationFn: async ({
      instanceId,
      itemIndex,
      type,
      content,
    }): Promise<ReviewContent> => {
      const response: AxiosResponse<ReviewContent> = await api.post(
        `/admin/checklist-instances/${instanceId}/items/${itemIndex}/review/contents`,
        { type, content },
      );
      return response.data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["checklist-instances", variables.instanceId],
      });
    },
  });
}

/**
 * 리뷰 콘텐츠 삭제 훅.
 *
 * Custom hook to delete a review content item.
 */
export function useDeleteReviewContent(): UseMutationResult<
  void,
  Error,
  { instanceId: string; itemIndex: number; contentId: string }
> {
  const queryClient = useQueryClient();
  return useMutation<
    void,
    Error,
    { instanceId: string; itemIndex: number; contentId: string }
  >({
    mutationFn: async ({ instanceId, itemIndex, contentId }): Promise<void> => {
      await api.delete(
        `/admin/checklist-instances/${instanceId}/items/${itemIndex}/review/contents/${contentId}`,
      );
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["checklist-instances", variables.instanceId],
      });
    },
  });
}

/**
 * Presigned URL 발급 훅 -- S3 업로드용 presigned URL을 생성합니다.
 *
 * Custom hook to generate a presigned upload URL for S3.
 */
export function usePresignedUrl(): UseMutationResult<
  { upload_url: string; file_url: string; key: string },
  Error,
  { filename: string; content_type: string }
> {
  return useMutation({
    mutationFn: async ({
      filename,
      content_type,
    }): Promise<{ upload_url: string; file_url: string; key: string }> => {
      const response = await api.post("/admin/storage/presigned-url", {
        filename,
        content_type,
      });
      return response.data;
    },
  });
}
