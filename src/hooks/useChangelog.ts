import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import type { AxiosResponse } from "axios";
import api from "@/lib/api";
import type {
  ChangelogCategory,
  ChangelogDetail,
  ChangelogPaginatedResponse,
} from "@/types/changelog";

/**
 * 변경 이력 목록 조회 훅 — 전역 공개 changelog 목록을 가져온다.
 *
 * Public changelog list. Trailing slash on `/public/changelog/` is required
 * (prod 307 → CORS downgrade otherwise).
 *
 * @param category - 카테고리 필터 (생략 시 전체)
 * @param q - 제목/본문 검색어
 * @param page - 페이지 번호 (1-based)
 * @param perPage - 페이지당 항목 수
 */
export const useChangelogList = (
  category?: ChangelogCategory,
  q?: string,
  page: number = 1,
  perPage: number = 20,
): UseQueryResult<ChangelogPaginatedResponse, Error> => {
  return useQuery<ChangelogPaginatedResponse, Error>({
    queryKey: ["changelog", "list", category ?? "all", q ?? "", page, perPage],
    queryFn: async (): Promise<ChangelogPaginatedResponse> => {
      const params: Record<string, string | number> = {
        page,
        per_page: perPage,
      };
      if (category) params.category = category;
      if (q && q.trim()) params.q = q.trim();
      const response: AxiosResponse<ChangelogPaginatedResponse> = await api.get(
        "/public/changelog/",
        { params },
      );
      return response.data;
    },
  });
};

/**
 * 변경 이력 상세 조회 훅 — slug 로 단일 항목(markdown body 포함)을 가져온다.
 *
 * Public changelog detail. Drafts return 404. Trailing slash required.
 *
 * @param slug - 변경 이력 slug
 */
export const useChangelogDetail = (
  slug: string | undefined,
): UseQueryResult<ChangelogDetail, Error> => {
  return useQuery<ChangelogDetail, Error>({
    queryKey: ["changelog", "detail", slug],
    queryFn: async (): Promise<ChangelogDetail> => {
      const response: AxiosResponse<ChangelogDetail> = await api.get(
        `/public/changelog/${slug}/`,
      );
      return response.data;
    },
    enabled: !!slug,
  });
};
