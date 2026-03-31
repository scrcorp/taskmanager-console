"use client";

/**
 * 체크리스트 인스턴스 카드 컴포넌트.
 *
 * Displays a single checklist instance with status stripe, staff info,
 * progress bar, and review badges. Clickable to navigate to the detail page.
 */

import React from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChecklistInstance } from "@/types";

interface ProgressInstanceCardProps {
  instance: ChecklistInstance;
  onClick: (id: string) => void;
}

function getStatusStripe(status: ChecklistInstance["status"]): string {
  switch (status) {
    case "completed": return "bg-[var(--color-success)]";
    case "in_progress": return "bg-accent";
    case "pending": return "bg-text-muted";
  }
}

function getStatusBadge(status: ChecklistInstance["status"]): { label: string; className: string } {
  switch (status) {
    case "completed":
      return { label: "Completed", className: "bg-[var(--color-success-muted)] text-[var(--color-success)]" };
    case "in_progress":
      return { label: "In Progress", className: "bg-accent-muted text-accent" };
    case "pending":
      return { label: "Pending", className: "bg-surface-hover text-text-muted" };
  }
}

function getProgressFill(status: ChecklistInstance["status"]): string {
  switch (status) {
    case "completed": return "bg-[var(--color-success)]";
    case "in_progress": return "bg-accent";
    case "pending": return "bg-text-muted";
  }
}

/** Returns true if the instance has any failed review items */
function hasFails(instance: ChecklistInstance): boolean {
  return instance.items?.some((item) => item.review_result === "fail") ?? false;
}

/** Counts items by review result */
function countReviews(instance: ChecklistInstance) {
  const items = instance.items ?? [];
  return {
    pass: items.filter((i) => i.review_result === "pass").length,
    fail: items.filter((i) => i.review_result === "fail").length,
    pendingReReview: items.filter((i) => i.review_result === "pending_re_review").length,
    unreviewed: items.filter((i) => i.is_completed && i.review_result === null).length,
  };
}

export function ProgressInstanceCard({
  instance,
  onClick,
}: ProgressInstanceCardProps): React.ReactElement {
  const total = instance.total_items;
  const completed = instance.completed_items;
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
  const statusBadge = getStatusBadge(instance.status);
  const hasFail = hasFails(instance);
  const reviews = countReviews(instance);

  return (
    <div
      className={cn(
        "flex items-stretch bg-card border rounded-xl overflow-hidden cursor-pointer transition-all duration-150",
        hasFail
          ? "border-[var(--color-danger)] hover:border-[var(--color-danger)] hover:shadow-[0_2px_8px_rgba(255,107,107,0.15)]"
          : "border-border hover:border-accent hover:shadow-[0_2px_8px_rgba(108,92,231,0.1)]",
      )}
      onClick={() => onClick(instance.id)}
    >
      {/* 상태 스트라이프 */}
      <div className={cn("w-1 shrink-0", getStatusStripe(instance.status))} />

      {/* 카드 본문 */}
      <div className="flex-1 flex items-center gap-4 px-4 py-3 min-w-0">
        {/* 직원 정보 */}
        <div className="min-w-[130px]">
          <div className="text-[13px] font-bold text-text truncate">
            {instance.user_name ?? "—"}
          </div>
          <div className="text-[11px] text-text-muted mt-0.5 truncate">
            {instance.store_name ?? "—"}
          </div>
        </div>

        {/* 템플릿 이름 */}
        <div className="min-w-[100px] hidden sm:block">
          <div className="text-[11px] text-text-secondary truncate">
            {instance.template_title ?? "No template"}
          </div>
          <div className="text-[10px] text-text-muted mt-0.5">
            {instance.work_date}
          </div>
        </div>

        {/* 진행률 */}
        <div className="flex-1 min-w-[130px]">
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 rounded-full bg-border overflow-hidden">
              <div
                className={cn("h-full rounded-full transition-[width] duration-300", getProgressFill(instance.status))}
                style={{ width: `${percentage}%` }}
              />
            </div>
            <span className="text-[11px] font-semibold text-text-secondary whitespace-nowrap">
              {completed}/{total} ({percentage}%)
            </span>
          </div>
        </div>

        {/* 리뷰 배지 */}
        <div className="flex items-center gap-1 flex-wrap justify-end min-w-[110px]">
          {reviews.pass > 0 && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-[var(--color-success-muted)] text-[var(--color-success)]">
              ✓ {reviews.pass}
            </span>
          )}
          {reviews.fail > 0 && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-[var(--color-danger-muted)] text-[var(--color-danger)]">
              ✗ {reviews.fail}
            </span>
          )}
          {reviews.pendingReReview > 0 && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-[var(--color-warning-muted)] text-[var(--color-warning)]">
              ↻ {reviews.pendingReReview}
            </span>
          )}
          {reviews.unreviewed > 0 && (
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-bold bg-surface-hover text-text-muted">
              ? {reviews.unreviewed}
            </span>
          )}
          <span className={cn("inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold ml-1", statusBadge.className)}>
            {statusBadge.label}
          </span>
        </div>
      </div>

      {/* 화살표 */}
      <div className="flex items-center px-3 shrink-0">
        <ChevronRight size={16} className="text-text-muted opacity-50 group-hover:opacity-100 group-hover:text-accent transition-all" />
      </div>
    </div>
  );
}
