"use client";

/**
 * 체크리스트 인스턴스 상세 컴포넌트 -- 인스턴스 정보, 진행률, 체크리스트 아이템을 표시합니다.
 * Review 버튼으로 리뷰 모드 진입, batch save로 변경된 리뷰만 서버에 저장합니다.
 */

import React, { useState, useCallback } from "react";
import { ClipboardCheck } from "lucide-react";
import { Card, Badge, Button, EmptyState } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { formatFixedDate, parseApiError } from "@/lib/utils";
import { ChecklistItemRow, type LocalReview } from "./ChecklistItemRow";
import { useUpsertItemReview } from "@/hooks/useChecklistInstances";
import type { ChecklistInstance } from "@/types";

/** 인스턴스 상태에 따른 뱃지 변형 매핑 */
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
}

export function ChecklistInstanceDetail({
  instance,
}: ChecklistInstanceDetailProps): React.ReactElement {
  const { toast } = useToast();
  const upsertReview = useUpsertItemReview();

  const percentage =
    instance.total_items > 0
      ? Math.round((instance.completed_items / instance.total_items) * 100)
      : 0;

  const snapshot = instance.snapshot ?? [];

  // Review mode
  const [isReviewMode, setIsReviewMode] = useState(false);
  const [localReviews, setLocalReviews] = useState<Map<number, LocalReview>>(new Map());
  const [isSaving, setIsSaving] = useState(false);

  /** 기존 리뷰에서 localReviews 초기화 */
  const enterReviewMode = useCallback(() => {
    const map = new Map<number, LocalReview>();
    for (const item of snapshot) {
      if (item.review) {
        map.set(item.item_index, {
          result: item.review.result,
          comment: item.review.comment,
          photo_url: item.review.photo_url,
        });
      }
    }
    setLocalReviews(map);
    setIsReviewMode(true);
  }, [snapshot]);

  const exitReviewMode = useCallback(() => {
    setIsReviewMode(false);
    setLocalReviews(new Map());
  }, []);

  const handleReviewChange = useCallback(
    (itemIndex: number, review: LocalReview | null) => {
      setLocalReviews((prev) => {
        const next = new Map(prev);
        if (review) {
          next.set(itemIndex, review);
        } else {
          next.delete(itemIndex);
        }
        return next;
      });
    },
    [],
  );

  /** 변경된 리뷰만 서버로 전송 (result가 없는 항목은 스킵) */
  const handleSave = useCallback(async () => {
    const changes: { itemIndex: number; result: string; comment: string | null; photo_url: string | null }[] = [];

    for (const [itemIndex, local] of localReviews) {
      if (!local.result) continue; // result 없으면 스킵

      const item = snapshot.find((s) => s.item_index === itemIndex);
      const existing = item?.review;

      if (!existing) {
        changes.push({ itemIndex, result: local.result, comment: local.comment, photo_url: local.photo_url });
      } else if (
        existing.result !== local.result ||
        existing.comment !== local.comment ||
        existing.photo_url !== local.photo_url
      ) {
        changes.push({ itemIndex, result: local.result, comment: local.comment, photo_url: local.photo_url });
      }
    }

    if (changes.length === 0) {
      toast({ type: "info", message: "No changes to save." });
      exitReviewMode();
      return;
    }

    setIsSaving(true);
    try {
      for (const ch of changes) {
        await upsertReview.mutateAsync({
          instanceId: instance.id,
          itemIndex: ch.itemIndex,
          result: ch.result,
          comment: ch.comment,
          photo_url: ch.photo_url,
        });
      }
      toast({ type: "success", message: `${changes.length} review(s) saved.` });
      exitReviewMode();
    } catch (err) {
      toast({ type: "error", message: parseApiError(err, "Failed to save reviews.") });
    } finally {
      setIsSaving(false);
    }
  }, [localReviews, snapshot, instance.id, upsertReview, toast, exitReviewMode]);

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
            <p className="text-sm font-medium text-text">{instance.store_name ?? "-"}</p>
          </div>
          <div>
            <p className="text-xs text-text-muted mb-1">Staff</p>
            <p className="text-sm font-medium text-text">{instance.user_name ?? "-"}</p>
          </div>
          <div>
            <p className="text-xs text-text-muted mb-1">Date</p>
            <p className="text-sm font-medium text-text">{formatFixedDate(instance.work_date)}</p>
          </div>
          <div>
            <p className="text-xs text-text-muted mb-1">Status</p>
            <Badge variant={statusBadgeVariant[instance.status] ?? "default"}>
              {statusLabel[instance.status] ?? instance.status}
            </Badge>
          </div>
        </div>
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
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-text">Checklist Items</h2>
          {!isReviewMode ? (
            <Button variant="ghost" size="sm" onClick={enterReviewMode}>
              <ClipboardCheck size={14} />
              Review
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={exitReviewMode} disabled={isSaving}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleSave} disabled={isSaving}>
                {isSaving ? "Saving..." : "Save Reviews"}
              </Button>
            </div>
          )}
        </div>
        {snapshot.length === 0 ? (
          <EmptyState message="No checklist items available." />
        ) : (
          <div className="space-y-3">
            {snapshot.map((item, index) => (
              <ChecklistItemRow
                key={item.item_index}
                item={item}
                index={index}
                workDate={instance.work_date}
                reviewMode={isReviewMode}
                localReview={localReviews.get(item.item_index) ?? null}
                onReviewChange={(r) => handleReviewChange(item.item_index, r)}
              />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
