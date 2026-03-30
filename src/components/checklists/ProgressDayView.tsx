"use client";

/**
 * 체크리스트 Day View 컴포넌트.
 *
 * Shows a filtered list of checklist instance cards for the selected date.
 * Handles filter tabs (All / Completed / In Progress / Pending / Needs Review).
 */

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { ProgressInstanceCard } from "./ProgressInstanceCard";
import type { ChecklistInstance } from "@/types";

type FilterTab = "all" | "completed" | "in_progress" | "pending" | "needs_review";

interface ProgressDayViewProps {
  instances: ChecklistInstance[];
  isLoading: boolean;
  searchQuery: string;
}

/** An instance "needs review" if it has completed items that are unreviewed or have fails */
function needsReview(instance: ChecklistInstance): boolean {
  const items = instance.items ?? [];
  return items.some(
    (i) => i.is_completed && (i.review_result === null || i.review_result === "fail" || i.review_result === "pending_re_review"),
  );
}

export function ProgressDayView({
  instances,
  isLoading,
  searchQuery,
}: ProgressDayViewProps): React.ReactElement {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<FilterTab>("all");

  // 검색 필터링
  const searched = useMemo(() => {
    if (!searchQuery.trim()) return instances;
    const q = searchQuery.toLowerCase();
    return instances.filter(
      (i) =>
        (i.user_name ?? "").toLowerCase().includes(q) ||
        (i.template_title ?? "").toLowerCase().includes(q) ||
        (i.store_name ?? "").toLowerCase().includes(q),
    );
  }, [instances, searchQuery]);

  // 탭별 카운트
  const counts = useMemo(() => ({
    all: searched.length,
    completed: searched.filter((i) => i.status === "completed").length,
    in_progress: searched.filter((i) => i.status === "in_progress").length,
    pending: searched.filter((i) => i.status === "pending").length,
    needs_review: searched.filter(needsReview).length,
  }), [searched]);

  // 탭 필터링 적용
  const filtered = useMemo(() => {
    let list = searched;
    if (activeTab === "completed") list = list.filter((i) => i.status === "completed");
    else if (activeTab === "in_progress") list = list.filter((i) => i.status === "in_progress");
    else if (activeTab === "pending") list = list.filter((i) => i.status === "pending");
    else if (activeTab === "needs_review") list = list.filter(needsReview);

    // 정렬: completed 먼저, 그 다음 이름 순
    return [...list].sort((a, b) => {
      const order = { completed: 0, in_progress: 1, pending: 2 };
      const diff = (order[a.status] ?? 99) - (order[b.status] ?? 99);
      if (diff !== 0) return diff;
      return (a.user_name ?? "").localeCompare(b.user_name ?? "");
    });
  }, [searched, activeTab]);

  const tabs: { key: FilterTab; label: string }[] = [
    { key: "all", label: "All" },
    { key: "completed", label: "Completed" },
    { key: "in_progress", label: "In Progress" },
    { key: "pending", label: "Pending" },
    { key: "needs_review", label: "Needs Review" },
  ];

  return (
    <div className="flex flex-col gap-3">
      {/* 필터 탭 */}
      <div className="flex items-center gap-1 p-1 bg-surface border border-border rounded-lg overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            className={cn(
              "flex items-center gap-1 px-3 py-1.5 rounded text-xs font-medium whitespace-nowrap transition-colors duration-150 cursor-pointer bg-transparent border-none",
              activeTab === tab.key
                ? "bg-accent text-white font-semibold"
                : "text-text-secondary hover:text-text hover:bg-surface-hover",
            )}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
            <span
              className={cn(
                "text-[10px] font-bold px-1 py-0.5 rounded",
                activeTab === tab.key ? "bg-white/25" : "bg-white/10",
              )}
            >
              {counts[tab.key]}
            </span>
          </button>
        ))}
      </div>

      {/* 카드 목록 */}
      {isLoading ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center text-text-muted">
          Loading…
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center text-text-muted">
          <div className="text-3xl mb-3">📋</div>
          <div className="text-sm font-semibold text-text-secondary">No checklists found</div>
          <div className="text-xs mt-1">
            {searchQuery ? "Try a different search term" : "No checklists for this date and filter"}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {filtered.map((instance) => (
            <ProgressInstanceCard
              key={instance.id}
              instance={instance}
              onClick={(id) => router.push(`/checklists/instances/${id}`)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
