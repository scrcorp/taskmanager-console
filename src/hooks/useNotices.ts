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
import { useResultModal } from "@/components/ui/ResultModal";
import { parseApiError } from "@/lib/utils";
import type { Notice, PaginatedResponse } from "@/types";

/**
 * 공지사항 목록 조회 훅 -- 페이지네이션을 지원하는 공지사항 목록을 가져옵니다.
 *
 * Custom hook to fetch paginated notices.
 *
 * @param page - 페이지 번호 (Page number, 1-based)
 * @param perPage - 페이지당 항목 수 (Items per page)
 * @returns 공지사항 목록 쿼리 결과 (Paginated notice list query result)
 */
export const useNotices = (
  page: number = 1,
  perPage: number = 20,
): UseQueryResult<PaginatedResponse<Notice>, Error> => {
  return useQuery<PaginatedResponse<Notice>, Error>({
    queryKey: ["notices", page, perPage],
    queryFn: async (): Promise<PaginatedResponse<Notice>> => {
      const response: AxiosResponse<PaginatedResponse<Notice>> =
        await api.get("/console/notices", {
          params: { page, per_page: perPage },
        });
      return response.data;
    },
  });
};

/**
 * 공지사항 상세 조회 훅 -- 특정 공지사항의 상세 정보를 가져옵니다.
 *
 * Custom hook to fetch a single notice detail.
 *
 * @param id - 공지사항 ID (Notice ID)
 * @returns 공지사항 상세 쿼리 결과 (Notice detail query result)
 */
export const useNotice = (
  id: string | undefined,
): UseQueryResult<Notice, Error> => {
  return useQuery<Notice, Error>({
    queryKey: ["notices", id],
    queryFn: async (): Promise<Notice> => {
      const response: AxiosResponse<Notice> = await api.get(
        `/console/notices/${id}`,
      );
      return response.data;
    },
    enabled: !!id,
  });
};

/** 공지사항 생성 요청 데이터 타입 (Notice creation request data type) */
interface CreateNoticeData {
  title: string;
  content: string;
  store_id?: string | null;
}

/**
 * 공지사항 생성 훅 -- 새 공지사항을 생성하고 목록을 갱신합니다.
 *
 * Mutation hook to create a new notice and invalidate the list.
 *
 * @returns 공지사항 생성 뮤테이션 결과 (Notice creation mutation result)
 */
export const useCreateNotice = (): UseMutationResult<
  Notice,
  Error,
  CreateNoticeData
> => {
  const queryClient: QueryClient = useQueryClient();
  const { showSuccess, showError } = useResultModal();
  return useMutation<Notice, Error, CreateNoticeData>({
    mutationFn: async (
      data: CreateNoticeData,
    ): Promise<Notice> => {
      const response: AxiosResponse<Notice> = await api.post(
        "/console/notices",
        data,
      );
      return response.data;
    },
    onSuccess: (newAnn: Notice): void => {
      queryClient.setQueriesData<PaginatedResponse<Notice>>(
        { queryKey: ["notices"] },
        (old) => {
          if (!old || !Array.isArray(old?.items)) return old;
          return { ...old, items: [newAnn, ...old.items], total: old.total + 1 };
        },
      );
      showSuccess("Notice posted.");
    },
    onError: (err) => {
      showError(parseApiError(err, "Unexpected error"), { title: "Couldn't post notice" });
    },
  });
};

/** 공지사항 수정 요청 데이터 타입 (Notice update request data type) */
interface UpdateNoticeData {
  id: string;
  title?: string;
  content?: string;
  store_id?: string | null;
}

/**
 * 공지사항 수정 훅 -- 기존 공지사항을 수정하고 관련 쿼리를 갱신합니다.
 *
 * Mutation hook to update an existing notice and invalidate related queries.
 *
 * @returns 공지사항 수정 뮤테이션 결과 (Notice update mutation result)
 */
export const useUpdateNotice = (): UseMutationResult<
  Notice,
  Error,
  UpdateNoticeData
> => {
  const queryClient: QueryClient = useQueryClient();
  const { showSuccess, showError } = useResultModal();
  return useMutation<Notice, Error, UpdateNoticeData>({
    mutationFn: async ({
      id,
      ...data
    }: UpdateNoticeData): Promise<Notice> => {
      const response: AxiosResponse<Notice> = await api.put(
        `/console/notices/${id}`,
        data,
      );
      return response.data;
    },
    onSuccess: (updated: Notice, variables: UpdateNoticeData): void => {
      queryClient.setQueriesData<PaginatedResponse<Notice>>(
        { queryKey: ["notices"] },
        (old) => {
          if (!old || !Array.isArray(old?.items)) return old;
          return { ...old, items: old.items.map((a) => (a.id === variables.id ? updated : a)) };
        },
      );
      queryClient.setQueryData<Notice>(["notices", variables.id], updated);
      showSuccess("Notice updated.");
    },
    onError: (err) => {
      showError(parseApiError(err, "Unexpected error"), { title: "Couldn't update notice" });
    },
  });
};

/**
 * 공지사항 삭제 훅 -- 공지사항을 삭제하고 목록을 갱신합니다.
 *
 * Mutation hook to delete an notice and invalidate the list.
 *
 * @returns 공지사항 삭제 뮤테이션 결과 (Notice deletion mutation result)
 */
export const useDeleteNotice = (): UseMutationResult<
  void,
  Error,
  string
> => {
  const queryClient: QueryClient = useQueryClient();
  const { showSuccess, showError } = useResultModal();
  return useMutation<void, Error, string>({
    mutationFn: async (id: string): Promise<void> => {
      await api.delete(`/console/notices/${id}`);
    },
    onSuccess: (_: void, id: string): void => {
      queryClient.setQueriesData<PaginatedResponse<Notice>>(
        { queryKey: ["notices"] },
        (old) => {
          if (!old || !Array.isArray(old?.items)) return old;
          return { ...old, items: old.items.filter((a) => a.id !== id), total: old.total - 1 };
        },
      );
      showSuccess("Notice deleted.");
    },
    onError: (err) => {
      showError(parseApiError(err, "Unexpected error"), { title: "Couldn't delete notice" });
    },
  });
};

/** 공지사항 읽음 상태 항목 타입 (Notice read status entry type) */
interface NoticeRead {
  user_id: string;
  user_name: string;
  read_at: string;
}

/**
 * 공지사항 읽음 상태 조회 훅 -- 특정 공지사항을 읽은 사용자 목록을 가져옵니다.
 *
 * Custom hook to fetch the list of users who read a specific notice.
 *
 * @param noticeId - 공지사항 ID (Notice ID)
 * @returns 읽음 상태 목록 쿼리 결과 (Read status list query result)
 */
export function useNoticeReads(noticeId: string): UseQueryResult<NoticeRead[], Error> {
  return useQuery<NoticeRead[], Error>({
    queryKey: ["noticeReads", noticeId],
    queryFn: async (): Promise<NoticeRead[]> => {
      const response: AxiosResponse<NoticeRead[]> = await api.get(
        `/console/notices/${noticeId}/reads`,
      );
      return response.data;
    },
    enabled: !!noticeId,
  });
}
