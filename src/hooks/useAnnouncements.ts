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
import type { Announcement, PaginatedResponse } from "@/types";

/**
 * 공지사항 목록 조회 훅 -- 페이지네이션을 지원하는 공지사항 목록을 가져옵니다.
 *
 * Custom hook to fetch paginated announcements.
 *
 * @param page - 페이지 번호 (Page number, 1-based)
 * @param perPage - 페이지당 항목 수 (Items per page)
 * @returns 공지사항 목록 쿼리 결과 (Paginated announcement list query result)
 */
export const useAnnouncements = (
  page: number = 1,
  perPage: number = 20,
): UseQueryResult<PaginatedResponse<Announcement>, Error> => {
  return useQuery<PaginatedResponse<Announcement>, Error>({
    queryKey: ["announcements", page, perPage],
    queryFn: async (): Promise<PaginatedResponse<Announcement>> => {
      const response: AxiosResponse<PaginatedResponse<Announcement>> =
        await api.get("/admin/announcements", {
          params: { page, per_page: perPage },
        });
      return response.data;
    },
  });
};

/**
 * 공지사항 상세 조회 훅 -- 특정 공지사항의 상세 정보를 가져옵니다.
 *
 * Custom hook to fetch a single announcement detail.
 *
 * @param id - 공지사항 ID (Announcement ID)
 * @returns 공지사항 상세 쿼리 결과 (Announcement detail query result)
 */
export const useAnnouncement = (
  id: string | undefined,
): UseQueryResult<Announcement, Error> => {
  return useQuery<Announcement, Error>({
    queryKey: ["announcements", id],
    queryFn: async (): Promise<Announcement> => {
      const response: AxiosResponse<Announcement> = await api.get(
        `/admin/announcements/${id}`,
      );
      return response.data;
    },
    enabled: !!id,
  });
};

/** 공지사항 생성 요청 데이터 타입 (Announcement creation request data type) */
interface CreateAnnouncementData {
  title: string;
  content: string;
  store_id?: string | null;
}

/**
 * 공지사항 생성 훅 -- 새 공지사항을 생성하고 목록을 갱신합니다.
 *
 * Mutation hook to create a new announcement and invalidate the list.
 *
 * @returns 공지사항 생성 뮤테이션 결과 (Announcement creation mutation result)
 */
export const useCreateAnnouncement = (): UseMutationResult<
  Announcement,
  Error,
  CreateAnnouncementData
> => {
  const queryClient: QueryClient = useQueryClient();
  const { showSuccess, showError } = useResultModal();
  return useMutation<Announcement, Error, CreateAnnouncementData>({
    mutationFn: async (
      data: CreateAnnouncementData,
    ): Promise<Announcement> => {
      const response: AxiosResponse<Announcement> = await api.post(
        "/admin/announcements",
        data,
      );
      return response.data;
    },
    onSuccess: (newAnn: Announcement): void => {
      queryClient.setQueriesData<PaginatedResponse<Announcement>>(
        { queryKey: ["announcements"] },
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

/** 공지사항 수정 요청 데이터 타입 (Announcement update request data type) */
interface UpdateAnnouncementData {
  id: string;
  title?: string;
  content?: string;
  store_id?: string | null;
}

/**
 * 공지사항 수정 훅 -- 기존 공지사항을 수정하고 관련 쿼리를 갱신합니다.
 *
 * Mutation hook to update an existing announcement and invalidate related queries.
 *
 * @returns 공지사항 수정 뮤테이션 결과 (Announcement update mutation result)
 */
export const useUpdateAnnouncement = (): UseMutationResult<
  Announcement,
  Error,
  UpdateAnnouncementData
> => {
  const queryClient: QueryClient = useQueryClient();
  const { showSuccess, showError } = useResultModal();
  return useMutation<Announcement, Error, UpdateAnnouncementData>({
    mutationFn: async ({
      id,
      ...data
    }: UpdateAnnouncementData): Promise<Announcement> => {
      const response: AxiosResponse<Announcement> = await api.put(
        `/admin/announcements/${id}`,
        data,
      );
      return response.data;
    },
    onSuccess: (updated: Announcement, variables: UpdateAnnouncementData): void => {
      queryClient.setQueriesData<PaginatedResponse<Announcement>>(
        { queryKey: ["announcements"] },
        (old) => {
          if (!old || !Array.isArray(old?.items)) return old;
          return { ...old, items: old.items.map((a) => (a.id === variables.id ? updated : a)) };
        },
      );
      queryClient.setQueryData<Announcement>(["announcements", variables.id], updated);
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
 * Mutation hook to delete an announcement and invalidate the list.
 *
 * @returns 공지사항 삭제 뮤테이션 결과 (Announcement deletion mutation result)
 */
export const useDeleteAnnouncement = (): UseMutationResult<
  void,
  Error,
  string
> => {
  const queryClient: QueryClient = useQueryClient();
  const { showSuccess, showError } = useResultModal();
  return useMutation<void, Error, string>({
    mutationFn: async (id: string): Promise<void> => {
      await api.delete(`/admin/announcements/${id}`);
    },
    onSuccess: (_: void, id: string): void => {
      queryClient.setQueriesData<PaginatedResponse<Announcement>>(
        { queryKey: ["announcements"] },
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

/** 공지사항 읽음 상태 항목 타입 (Announcement read status entry type) */
interface AnnouncementRead {
  user_id: string;
  user_name: string;
  read_at: string;
}

/**
 * 공지사항 읽음 상태 조회 훅 -- 특정 공지사항을 읽은 사용자 목록을 가져옵니다.
 *
 * Custom hook to fetch the list of users who read a specific announcement.
 *
 * @param announcementId - 공지사항 ID (Announcement ID)
 * @returns 읽음 상태 목록 쿼리 결과 (Read status list query result)
 */
export function useAnnouncementReads(announcementId: string): UseQueryResult<AnnouncementRead[], Error> {
  return useQuery<AnnouncementRead[], Error>({
    queryKey: ["announcementReads", announcementId],
    queryFn: async (): Promise<AnnouncementRead[]> => {
      const response: AxiosResponse<AnnouncementRead[]> = await api.get(
        `/admin/announcements/${announcementId}/reads`,
      );
      return response.data;
    },
    enabled: !!announcementId,
  });
}
