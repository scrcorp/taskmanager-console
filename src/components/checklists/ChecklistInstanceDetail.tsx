"use client";

/**
 * 체크리스트 인스턴스 상세 컴포넌트 -- 인스턴스 정보, 진행률, 완료 항목을 표시합니다.
 *
 * Checklist instance detail component showing instance info, progress bar,
 * and individual checklist items with completion data.
 */

import React, { useMemo } from "react";
import { Card, Badge, EmptyState } from "@/components/ui";
import { formatFixedDate } from "@/lib/utils";
import { ChecklistItemRow } from "./ChecklistItemRow";
import type {
  ChecklistInstance,
  ChecklistCompletion,
} from "@/types";

/** 인스턴스 상태에 따른 뱃지 변형 매핑 (Status to badge variant mapping) */
const statusBadgeVariant: Record<string, "default" | "warning" | "success"> = {
  pending: "default",
  in_progress: "warning",
  completed: "success",
};

/** 인스턴스 상태 라벨 매핑 (Status label mapping) */
const statusLabel: Record<string, string> = {
  pending: "Pending",
  in_progress: "In Progress",
  completed: "Completed",
};

interface ChecklistInstanceDetailProps {
  instance: ChecklistInstance;
}

export function ChecklistInstanceDetail({
  instance,
}: ChecklistInstanceDetailProps): React.ReactElement {
  const percentage: number =
    instance.total_items > 0
      ? Math.round((instance.completed_items / instance.total_items) * 100)
      : 0;

  /** item_index -> completion 매핑 (Map completions by item_index) */
  const completionMap: Map<number, ChecklistCompletion> = useMemo(() => {
    const map = new Map<number, ChecklistCompletion>();
    for (const c of instance.completions ?? []) {
      map.set(c.item_index, c);
    }
    return map;
  }, [instance.completions]);

  const snapshot = instance.snapshot ?? [];

  return (
    <div>
      {/* Summary Card */}
      <Card className="mb-6">
        <h1 className="text-xl font-bold text-text mb-4">
          {instance.template_title ?? "Checklist"}
        </h1>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <div>
            <p className="text-xs text-text-muted mb-1">Store</p>
            <p className="text-sm font-medium text-text">
              {instance.store_name ?? "-"}
            </p>
          </div>
          <div>
            <p className="text-xs text-text-muted mb-1">Staff</p>
            <p className="text-sm font-medium text-text">
              {instance.user_name ?? "-"}
            </p>
          </div>
          <div>
            <p className="text-xs text-text-muted mb-1">Date</p>
            <p className="text-sm font-medium text-text">
              {formatFixedDate(instance.work_date)}
            </p>
          </div>
          <div>
            <p className="text-xs text-text-muted mb-1">Status</p>
            <Badge
              variant={statusBadgeVariant[instance.status] ?? "default"}
            >
              {statusLabel[instance.status] ?? instance.status}
            </Badge>
          </div>
        </div>

        {/* Progress bar */}
        <div>
          <p className="text-xs text-text-muted mb-1">Progress</p>
          <div className="flex items-center gap-3">
            <div className="flex-1 h-2 bg-surface rounded-full overflow-hidden">
              <div
                className="h-full bg-accent rounded-full transition-all"
                style={{ width: `${percentage}%` }}
              />
            </div>
            <span className="text-sm font-medium text-text">
              {instance.completed_items}/{instance.total_items} ({percentage}%)
            </span>
          </div>
        </div>
      </Card>

      {/* Checklist Items */}
      <Card>
        <h2 className="text-lg font-semibold text-text mb-4">
          Checklist Items
        </h2>
        {snapshot.length === 0 ? (
          <EmptyState message="No checklist items available." />
        ) : (
          <div className="space-y-3">
            {snapshot.map((item, index) => (
              <ChecklistItemRow
                key={item.item_index}
                item={item}
                index={index}
                completion={completionMap.get(item.item_index)}
                workDate={instance.work_date}
                instanceId={instance.id}
              />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
