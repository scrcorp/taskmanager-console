"use client";

import React from "react";
import Link from "next/link";
import { Badge } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import {
  CHANGELOG_CATEGORY_LABELS,
  type ChangelogListItem,
} from "@/types/changelog";

/**
 * 변경 이력 카드 — 목록의 단일 항목.
 *
 * @param item - 변경 이력 목록 항목
 * @param href - 상세 페이지 링크
 * @param showCategory - 카테고리 뱃지 표시 여부 (단일 카테고리 뷰에서는 숨김)
 */
export function ChangelogCard({
  item,
  href,
  showCategory = true,
}: {
  item: ChangelogListItem;
  href: string;
  showCategory?: boolean;
}): React.ReactElement {
  return (
    <Link
      href={href}
      className="group block rounded-xl border border-border bg-card p-5 transition-colors hover:border-accent/50 hover:bg-surface-hover"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:gap-5">
        {item.cover_image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.cover_image_url}
            alt=""
            className="h-32 w-full shrink-0 rounded-lg object-cover sm:h-24 sm:w-40"
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            {showCategory && (
              <Badge variant="accent">
                {CHANGELOG_CATEGORY_LABELS[item.category] ?? item.category}
              </Badge>
            )}
            <span className="text-xs text-text-muted">
              {formatDate(item.published_at)}
            </span>
          </div>
          <h3 className="text-base font-semibold text-text transition-colors group-hover:text-accent">
            {item.title}
          </h3>
          {item.summary && (
            <p className="mt-1 line-clamp-2 text-sm text-text-secondary">
              {item.summary}
            </p>
          )}
          {item.tags.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {item.tags.map((tag: string) => (
                <span
                  key={tag}
                  className="rounded-full bg-surface px-2 py-0.5 text-xs text-text-muted"
                >
                  #{tag}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
