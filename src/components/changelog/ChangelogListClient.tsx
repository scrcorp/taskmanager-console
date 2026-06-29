"use client";

import React, { useState } from "react";
import { Search } from "lucide-react";
import { Input, Pagination, EmptyState, LoadingSpinner } from "@/components/ui";
import { useDebounce } from "@/hooks/useDebounce";
import { useChangelogList } from "@/hooks/useChangelog";
import { ChangelogCard } from "./ChangelogCard";
import {
  CHANGELOG_CATEGORIES,
  CHANGELOG_CATEGORY_LABELS,
  type ChangelogCategory,
} from "@/types/changelog";

const PER_PAGE = 20;

type TabKey = "all" | ChangelogCategory;

/**
 * 변경 이력 목록 (검색 + 카테고리 탭 + 페이지네이션).
 *
 * 공개 홈페이지와 대시보드 "What's New" 뷰가 공유한다.
 *
 * @param basePath - 상세 링크 베이스 경로 ("/changelog" 또는 "/whats-new")
 * @param fixedCategory - 지정 시 해당 카테고리로 고정 (탭 숨김 — 대시보드 console 뷰)
 */
export function ChangelogListClient({
  basePath,
  fixedCategory,
}: {
  basePath: string;
  fixedCategory?: ChangelogCategory;
}): React.ReactElement {
  const [tab, setTab] = useState<TabKey>(fixedCategory ?? "all");
  const [page, setPage] = useState<number>(1);
  const [searchInput, setSearchInput] = useState<string>("");
  const q = useDebounce(searchInput, 300);

  const category: ChangelogCategory | undefined =
    fixedCategory ?? (tab === "all" ? undefined : tab);

  const { data, isLoading, isError } = useChangelogList(
    category,
    q,
    page,
    PER_PAGE,
  );

  const items = data?.items ?? [];
  const totalPages = data?.pages ?? 1;
  const showCategoryBadge = !fixedCategory;

  const tabs: { key: TabKey; label: string }[] = [
    { key: "all", label: "All" },
    ...CHANGELOG_CATEGORIES.map((c) => ({
      key: c as TabKey,
      label: CHANGELOG_CATEGORY_LABELS[c],
    })),
  ];

  const handleTabChange = (key: TabKey): void => {
    setTab(key);
    setPage(1);
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Search */}
      <div className="relative max-w-md">
        <Search
          size={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
        />
        <Input
          value={searchInput}
          placeholder="Search updates..."
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
            setSearchInput(e.target.value);
            setPage(1);
          }}
          className="pl-9"
        />
      </div>

      {/* Category tabs (hidden when a fixed category is enforced) */}
      {!fixedCategory && (
        <div className="flex flex-wrap gap-2">
          {tabs.map((t) => {
            const active = tab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => handleTabChange(t.key)}
                className={
                  active
                    ? "rounded-full bg-accent px-3.5 py-1.5 text-sm font-medium text-white transition-colors"
                    : "rounded-full border border-border bg-card px-3.5 py-1.5 text-sm font-medium text-text-secondary transition-colors hover:text-accent"
                }
              >
                {t.label}
              </button>
            );
          })}
        </div>
      )}

      {/* List */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <LoadingSpinner />
        </div>
      ) : isError ? (
        <EmptyState message="Couldn't load updates. Please try again later." />
      ) : items.length === 0 ? (
        <EmptyState message="No updates yet. Check back soon." />
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((item) => (
            <ChangelogCard
              key={item.slug}
              item={item}
              href={`${basePath}/${item.slug}`}
              showCategory={showCategoryBadge}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-2 flex justify-center">
          <Pagination
            page={page}
            totalPages={totalPages}
            onPageChange={setPage}
          />
        </div>
      )}
    </div>
  );
}
