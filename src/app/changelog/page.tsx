import { ChangelogListClient } from "@/components/changelog/ChangelogListClient";

/**
 * 공개 changelog 집계 페이지 — hermesops.site/changelog.
 * 모든 카테고리를 탭으로 노출한다.
 */
export default function PublicChangelogPage() {
  return (
    <div>
      <h1 className="mb-1 text-2xl font-extrabold text-text">What&apos;s New</h1>
      <p className="mb-6 text-sm text-text-secondary">
        Product updates across the HTM platform.
      </p>
      <ChangelogListClient basePath="/changelog" />
    </div>
  );
}
