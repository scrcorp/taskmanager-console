/**
 * Changelog (product update history) 타입 정의.
 *
 * 전역(조직 무관) 공개 데이터로, 인증 없이 `/public/changelog/` 엔드포인트에서 제공된다.
 * 공개 홈페이지(hermesops.site/changelog)와 콘솔 대시보드 "What's New" 뷰가 동일한 타입을 공유한다.
 */

/** 변경 이력이 속한 제품 표면 (4종). */
export type ChangelogCategory =
  | "staff_app"
  | "attendance_app"
  | "console"
  | "homepage";

/** 카테고리 표시 라벨 (UI 영문). */
export const CHANGELOG_CATEGORY_LABELS: Record<ChangelogCategory, string> = {
  staff_app: "Staff App",
  attendance_app: "Attendance App",
  console: "Console",
  homepage: "Homepage",
};

/** 탭/필터 순서대로 나열된 카테고리. */
export const CHANGELOG_CATEGORIES: ChangelogCategory[] = [
  "staff_app",
  "attendance_app",
  "console",
  "homepage",
];

/** 목록 항목 — body 없음 (의도적). */
export interface ChangelogListItem {
  slug: string;
  category: ChangelogCategory;
  title: string;
  summary: string | null;
  cover_image_url: string | null;
  tags: string[];
  published_at: string;
}

/** 상세 항목 — markdown body 포함. */
export interface ChangelogDetail {
  slug: string;
  category: ChangelogCategory;
  title: string;
  summary: string | null;
  body: string;
  cover_image_url: string | null;
  tags: string[];
  published_at: string;
}

/** 페이지네이션 응답 — 서버가 `pages` 를 포함해 반환한다. */
export interface ChangelogPaginatedResponse {
  items: ChangelogListItem[];
  total: number;
  page: number;
  per_page: number;
  pages: number;
}
