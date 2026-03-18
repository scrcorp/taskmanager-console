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
  ChecklistItemMessage,
  PaginatedResponse,
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
  { review_result: "pass" | "fail" | "pending_re_review" | null; reviewer_id: string | null; reviewer_name: string | null; reviewed_at: string | null },
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
  return useMutation({
    mutationFn: async ({
      instanceId,
      itemIndex,
      result,
      comment_text,
      comment_photo_url,
    }) => {
      const body: Record<string, string> = { result };
      if (comment_text) body.comment_text = comment_text;
      if (comment_photo_url) body.comment_photo_url = comment_photo_url;
      const response: AxiosResponse<{ review_result: "pass" | "fail" | "pending_re_review" | null; reviewer_id: string | null; reviewer_name: string | null; reviewed_at: string | null }> = await api.put(
        `/admin/checklist-instances/${instanceId}/items/${itemIndex}/review`,
        body,
      );
      return response.data;
    },
    onSuccess: (data, variables) => {
      // Optimistic patch for instant O/X feedback — no refetch needed
      queryClient.setQueryData<ChecklistInstance>(
        ["checklist-instances", variables.instanceId],
        (prev) => {
          if (!prev) return prev;
          const newItems = prev.items.map((item) => {
            if (item.item_index !== variables.itemIndex) return item;
            return {
              ...item,
              review_result: data.review_result,
              reviewer_id: data.reviewer_id,
              reviewer_name: data.reviewer_name,
              reviewed_at: data.reviewed_at,
            };
          });
          return { ...prev, items: newItems };
        },
      );
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
      // Optimistic patch for instant O/X feedback — no refetch needed
      queryClient.setQueryData<ChecklistInstance>(
        ["checklist-instances", variables.instanceId],
        (prev) => {
          if (!prev) return prev;
          const newItems = prev.items.map((item) => {
            if (item.item_index !== variables.itemIndex) return item;
            return { ...item, review_result: null, reviewer_id: null, reviewer_name: null, reviewed_at: null };
          });
          return { ...prev, items: newItems };
        },
      );
    },
  });
}

/**
 * 리뷰 메시지 추가 훅 -- 아이템에 텍스트 메시지를 추가합니다.
 *
 * Custom hook to add a message (text/photo) to a checklist item.
 */
export function useAddReviewContent(): UseMutationResult<
  ChecklistItemMessage,
  Error,
  { instanceId: string; itemIndex: number; type: string; content: string }
> {
  const queryClient = useQueryClient();
  return useMutation<
    ChecklistItemMessage,
    Error,
    { instanceId: string; itemIndex: number; type: string; content: string }
  >({
    mutationFn: async ({
      instanceId,
      itemIndex,
      type,
      content,
    }): Promise<ChecklistItemMessage> => {
      const response: AxiosResponse<ChecklistItemMessage> = await api.post(
        `/admin/checklist-instances/${instanceId}/items/${itemIndex}/review/contents`,
        { type, content },
      );
      return response.data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["checklist-instances"],
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
        queryKey: ["checklist-instances"],
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

/**
 * 인스턴스 점수 업데이트 훅 -- 체크리스트 인스턴스에 점수와 메모를 저장합니다.
 *
 * Custom hook to PATCH score and score_note on a checklist instance.
 */
export function useUpdateScore(): UseMutationResult<
  ChecklistInstance,
  Error,
  { instanceId: string; score: number | null; score_note?: string }
> {
  const queryClient = useQueryClient();
  return useMutation<
    ChecklistInstance,
    Error,
    { instanceId: string; score: number | null; score_note?: string }
  >({
    mutationFn: async ({ instanceId, score, score_note }): Promise<ChecklistInstance> => {
      const response: AxiosResponse<ChecklistInstance> = await api.patch(
        `/admin/checklist-instances/${instanceId}/score`,
        { score, score_note },
      );
      return response.data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["checklist-instances"],
      });
    },
  });
}

/**
 * 일괄 리뷰 훅 -- 여러 아이템을 한 번에 pass/fail로 처리합니다.
 *
 * Custom hook to bulk-review multiple checklist items at once.
 */
export function useBulkReview(): UseMutationResult<
  { updated: number },
  Error,
  { instanceId: string; item_indexes: number[]; result: string }
> {
  const queryClient = useQueryClient();
  return useMutation<
    { updated: number },
    Error,
    { instanceId: string; item_indexes: number[]; result: string }
  >({
    mutationFn: async ({ instanceId, item_indexes, result }): Promise<{ updated: number }> => {
      const response: AxiosResponse<{ updated: number }> = await api.post(
        `/admin/checklist-instances/${instanceId}/items/bulk-review`,
        { item_indexes, result },
      );
      return response.data;
    },
    onSuccess: (_data, variables) => {
      // Instant feedback via setQueryData — no refetch needed
      queryClient.setQueryData<ChecklistInstance>(
        ["checklist-instances", variables.instanceId],
        (prev) => {
          if (!prev) return prev;
          const resultValue = variables.result as "pass" | "fail" | "pending_re_review" | null;
          const newItems = prev.items.map((item) =>
            variables.item_indexes.includes(item.item_index)
              ? { ...item, review_result: resultValue }
              : item,
          );
          return { ...prev, items: newItems };
        },
      );
    },
  });
}

/**
 * 리포트 전송 훅 -- 체크리스트 인스턴스 리포트를 전송합니다.
 *
 * Custom hook to send a report for a checklist instance.
 */
export function useSendReport(): UseMutationResult<
  void,
  Error,
  { instanceId: string }
> {
  return useMutation<void, Error, { instanceId: string }>({
    mutationFn: async ({ instanceId }): Promise<void> => {
      await api.post(`/admin/checklist-instances/${instanceId}/report`);
    },
  });
}
