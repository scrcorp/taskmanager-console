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
import { useMutationResult } from "@/lib/mutationResult";
import type { Alert, PaginatedResponse } from "@/types";

/**
 * 알림 목록 조회 훅 -- 페이지네이션을 지원하는 알림 목록을 가져옵니다.
 *
 * Custom hook to fetch paginated alerts.
 *
 * @param page - 페이지 번호 (Page number, 1-based)
 * @param perPage - 페이지당 항목 수 (Items per page)
 * @returns 알림 목록 쿼리 결과 (Paginated alert list query result)
 */
export const useAlerts = (
  page: number = 1,
  perPage: number = 20,
): UseQueryResult<PaginatedResponse<Alert>, Error> => {
  return useQuery<PaginatedResponse<Alert>, Error>({
    queryKey: ["alerts", page, perPage],
    queryFn: async (): Promise<PaginatedResponse<Alert>> => {
      const response: AxiosResponse<PaginatedResponse<Alert>> =
        await api.get("/admin/alerts", {
          params: { page, per_page: perPage },
        });
      return response.data;
    },
  });
};

/** 읽지 않은 알림 수 응답 타입 (Unread count response type) */
interface UnreadCountResponse {
  unread_count: number;
}

/**
 * 읽지 않은 알림 수 조회 훅 -- 읽지 않은 알림의 수를 가져옵니다.
 *
 * Custom hook to fetch the count of unread alerts.
 * Automatically refetches every 30 seconds.
 *
 * @returns 읽지 않은 알림 수 쿼리 결과 (Unread alert count query result)
 */
export const useUnreadCount = (): UseQueryResult<number, Error> => {
  return useQuery<number, Error>({
    queryKey: ["alerts", "unread-count"],
    queryFn: async (): Promise<number> => {
      const response: AxiosResponse<UnreadCountResponse> = await api.get(
        "/admin/alerts/unread-count",
      );
      return response.data.unread_count;
    },
    refetchInterval: 30000,
  });
};

/**
 * 알림 읽음 처리 훅 -- 특정 알림을 읽음 상태로 변경합니다.
 *
 * Mutation hook to mark a specific alert as read.
 *
 * @returns 알림 읽음 처리 뮤테이션 결과 (Mark-as-read mutation result)
 */
export const useMarkRead = (): UseMutationResult<void, Error, string> => {
  const queryClient: QueryClient = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<void, Error, string>({
    mutationFn: async (id: string): Promise<void> => {
      await api.patch(`/admin/alerts/${id}/read`);
    },
    onSuccess: (_: void, id: string): void => {
      queryClient.setQueriesData<PaginatedResponse<Alert>>(
        { queryKey: ["alerts"] },
        (old) => {
          if (!old || !Array.isArray(old?.items)) return old;
          return {
            ...old,
            items: old.items.map((n) =>
              n.id === id ? { ...n, is_read: true } : n,
            ),
          };
        },
      );
      queryClient.setQueryData<number>(
        ["alerts", "unread-count"],
        (old) => (old !== undefined ? Math.max(0, old - 1) : 0),
      );
      success("Marked as read.");
    },
    onError: error("Couldn't mark as read"),
  });
};

/**
 * 전체 알림 읽음 처리 훅 -- 모든 알림을 읽음 상태로 변경합니다.
 *
 * Mutation hook to mark all alerts as read.
 *
 * @returns 전체 읽음 처리 뮤테이션 결과 (Mark-all-read mutation result)
 */
export const useMarkAllRead = (): UseMutationResult<void, Error, void> => {
  const queryClient: QueryClient = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<void, Error, void>({
    mutationFn: async (): Promise<void> => {
      await api.patch("/admin/alerts/read-all");
    },
    onSuccess: (): void => {
      queryClient.setQueriesData<PaginatedResponse<Alert>>(
        { queryKey: ["alerts"] },
        (old) => {
          if (!old || !Array.isArray(old?.items)) return old;
          return {
            ...old,
            items: old.items.map((n) => ({ ...n, is_read: true })),
          };
        },
      );
      queryClient.setQueryData<number>(["alerts", "unread-count"], 0);
      success("Marked as read.");
    },
    onError: error("Couldn't mark all as read"),
  });
};
