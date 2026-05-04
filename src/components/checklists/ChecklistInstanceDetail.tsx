"use client";

/**
 * 체크리스트 인스턴스 상세 컴포넌트.
 *
 * Layout:
 *   SummaryCard (store/employee/date/status/progress)
 *   ReviewProgressBar (Pass N | Fail N | Unreviewed N | [Pass All])
 *   ItemList (ChecklistItemRow × N)
 *   ScoreSection (score, note, send report)
 */

import React, { useMemo } from "react";
import { Card, Badge, EmptyState } from "@/components/ui";
import { Button } from "@/components/ui/Button";
import { useResultModal } from "@/components/ui/ResultModal";
import { formatFixedDate, parseApiError } from "@/lib/utils";
import { ChecklistItemRow } from "./ChecklistItemRow";
import { ScoreSection } from "./ScoreSection";
import { useBulkReview } from "@/hooks/useChecklistInstances";
import type { ChecklistInstance } from "@/types";

const statusBadgeVariant: Record<string, "default" | "warning" | "success"> = {
  pending: "default",
  in_progress: "warning",
  completed: "success",
};
const statusLabel: Record<string, string> = {
  pending: "Pending",
  in_progress: "In Progress",
  completed: "Completed",
};

interface ChecklistInstanceDetailProps {
  instance: ChecklistInstance;
  timezone?: string;
  onRefetch?: () => void;
}

export function ChecklistInstanceDetail({
  instance,
  timezone,
  onRefetch,
}: ChecklistInstanceDetailProps): React.ReactElement {
  const { showSuccess, showError } = useResultModal();
  const bulkReview = useBulkReview();

  const items = instance.items ?? [];

  const percentage =
    instance.total_items > 0
      ? Math.round((instance.completed_items / instance.total_items) * 100)
      : 0;

  // Review stats
  const reviewStats = useMemo(() => {
    let pass = 0;
    let fail = 0;
    let unreviewed = 0;
    const unreviewedIndexes: number[] = [];

    for (const item of items) {
      if (item.review_result === "pass") {
        pass++;
      } else if (item.review_result === "fail") {
        fail++;
      } else {
        unreviewed++;
        // pending_re_review requires explicit re-review — exclude from bulk pass
        if (item.is_completed && !item.review_result) {
          unreviewedIndexes.push(item.item_index);
        }
      }
    }
    return { pass, fail, unreviewed, unreviewedIndexes };
  }, [items]);

  const handlePassAll = async () => {
    if (reviewStats.unreviewedIndexes.length === 0) return;
    try {
      await bulkReview.mutateAsync({
        instanceId: instance.id,
        item_indexes: reviewStats.unreviewedIndexes,
        result: "pass",
      });
      showSuccess(`${reviewStats.unreviewedIndexes.length} item(s) passed.`);
      onRefetch?.();
    } catch (err) {
      showError(parseApiError(err, "Failed to pass all items."));
    }
  };

  return (
    <div>
      {/* Summary Card */}
      <Card className="mb-4">
        <h1 className="text-lg font-bold text-text mb-4">
          {instance.template_title ?? "Checklist"}
        </h1>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
          <div>
            <p className="text-xs text-text-muted mb-1 uppercase tracking-wide">Store</p>
            <p className="text-sm font-medium text-text">{instance.store_name ?? "-"}</p>
          </div>
          <div>
            <p className="text-xs text-text-muted mb-1 uppercase tracking-wide">Staff</p>
            <p className="text-sm font-medium text-text">{instance.user_name ?? "-"}</p>
          </div>
          <div>
            <p className="text-xs text-text-muted mb-1 uppercase tracking-wide">Date</p>
            <p className="text-sm font-medium text-text">{formatFixedDate(instance.work_date)}</p>
          </div>
          <div>
            <p className="text-xs text-text-muted mb-1 uppercase tracking-wide">Status</p>
            <Badge variant={statusBadgeVariant[instance.status] ?? "default"}>
              {statusLabel[instance.status] ?? instance.status}
            </Badge>
          </div>
        </div>

        {/* Progress */}
        <div>
          <p className="text-xs text-text-muted mb-1.5">Completion Progress</p>
          <div className="flex items-center gap-3">
            <div className="flex-1 h-2 bg-surface-hover rounded-full overflow-hidden">
              <div
                className="h-full bg-accent rounded-full transition-all"
                style={{ width: `${percentage}%` }}
              />
            </div>
            <span className="text-sm font-medium text-text tabular-nums">
              {instance.completed_items}/{instance.total_items} ({percentage}%)
            </span>
          </div>
        </div>
      </Card>

      {/* Review Progress Bar */}
      {items.length > 0 && (
        <div className="flex items-center justify-between gap-3 flex-wrap px-4 py-3 mb-4 rounded-lg border border-border bg-card">
          <div className="flex items-center gap-4 flex-wrap text-sm">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-success" />
              <span className="text-text-secondary">{reviewStats.pass} Pass</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-danger" />
              <span className="text-text-secondary">{reviewStats.fail} Fail</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-surface-hover border border-border" />
              <span className="text-text-secondary">{reviewStats.unreviewed} Unreviewed</span>
            </span>
          </div>
          {reviewStats.unreviewed > 0 && (
            <Button
              variant="secondary"
              size="sm"
              onClick={handlePassAll}
              isLoading={bulkReview.isPending}
            >
              Pass All Unreviewed
            </Button>
          )}
        </div>
      )}

      {/* Checklist Items */}
      <Card className="mb-0">
        <h2 className="text-base font-semibold text-text mb-3">Checklist Items</h2>
        {items.length === 0 ? (
          <EmptyState message="No checklist items available." />
        ) : (
          <div className="space-y-2">
            {items.map((item) => (
              <ChecklistItemRow
                key={item.item_index}
                item={item}
                instanceId={instance.id}
                itemIndex={item.item_index}
                workDate={instance.work_date}
                timezone={timezone}
                onReviewChange={onRefetch}
              />
            ))}
          </div>
        )}
      </Card>

      {/* Score Section */}
      <ScoreSection instance={instance} />
    </div>
  );
}
