"use client";

import React from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Badge, EmptyState, LoadingSpinner } from "@/components/ui";
import { formatDate } from "@/lib/utils";
import { useChangelogDetail } from "@/hooks/useChangelog";
import { Markdown } from "./Markdown";
import { CHANGELOG_CATEGORY_LABELS } from "@/types/changelog";

/**
 * 변경 이력 상세 — 커버 이미지 + 메타 + markdown body 렌더.
 *
 * 공개 홈페이지와 대시보드 "What's New" 뷰가 공유한다.
 *
 * @param slug - 변경 이력 slug
 * @param backPath - "Back" 링크 경로 (목록)
 */
export function ChangelogDetailClient({
  slug,
  backPath,
}: {
  slug: string;
  backPath: string;
}): React.ReactElement {
  const { data, isLoading, isError } = useChangelogDetail(slug);

  return (
    <article className="mx-auto w-full max-w-3xl">
      <Link
        href={backPath}
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-text-secondary transition-colors hover:text-accent"
      >
        <ArrowLeft size={16} />
        Back to updates
      </Link>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <LoadingSpinner />
        </div>
      ) : isError || !data ? (
        <EmptyState message="This update could not be found." />
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <Badge variant="accent">
              {CHANGELOG_CATEGORY_LABELS[data.category] ?? data.category}
            </Badge>
            <span className="text-xs text-text-muted">
              {formatDate(data.published_at)}
            </span>
          </div>

          <h1 className="text-2xl font-extrabold text-text sm:text-3xl">
            {data.title}
          </h1>

          {data.summary && (
            <p className="mt-3 text-base text-text-secondary">{data.summary}</p>
          )}

          {data.tags.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-1.5">
              {data.tags.map((tag: string) => (
                <span
                  key={tag}
                  className="rounded-full bg-surface px-2 py-0.5 text-xs text-text-muted"
                >
                  #{tag}
                </span>
              ))}
            </div>
          )}

          {data.cover_image_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={data.cover_image_url}
              alt=""
              className="mt-6 w-full rounded-xl object-cover"
            />
          )}

          <Markdown content={data.body} className="mt-8" />
        </>
      )}
    </article>
  );
}
