"use client";

/**
 * 체크리스트 인스턴스 상세 컴포넌트 -- 인스턴스 정보, 진행률, 체크리스트 아이템을 표시합니다.
 * Review 버튼으로 리뷰 모드 진입, batch save로 변경된 리뷰만 서버에 저장합니다.
 * 인라인 코멘트 사진은 presigned URL로 업로드 후 리뷰와 함께 저장됩니다.
 */

import React, { useState, useCallback, useMemo } from "react";
import { ClipboardCheck, Camera, FileText, CheckCircle, AlertTriangle, RotateCcw } from "lucide-react";
import { Card, Badge, Button, EmptyState } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { formatFixedDate, parseApiError } from "@/lib/utils";
import { ChecklistItemRow, type LocalReview } from "./ChecklistItemRow";
import { useUpsertItemReview, usePresignedUrl } from "@/hooks/useChecklistInstances";
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
  const presignedUrl = usePresignedUrl();

  const percentage =
    instance.total_items > 0
      ? Math.round((instance.completed_items / instance.total_items) * 100)
      : 0;

  const snapshot = instance.snapshot ?? [];

  // Evidence summary
  const evidenceSummary = useMemo(() => {
    let photos = 0;
    let notes = 0;
    let reviewed = 0;
    let missing = 0;
    let pendingReReview = 0;

    for (const item of snapshot) {
      if (item.photo_url) photos++;
      if (item.note) notes++;
      if (item.review) {
        if (item.review.result === "pending_re_review") {
          pendingReReview++;
        } else {
          reviewed++;
        }
      }
      if (!item.is_completed && item.verification_type !== "none") missing++;
    }

    return { photos, notes, reviewed, missing, pendingReReview };
  }, [snapshot]);

  // Review mode
  const [isReviewMode, setIsReviewMode] = useState(false);
  const [localReviews, setLocalReviews] = useState<Map<number, LocalReview>>(new Map());
  const [isSaving, setIsSaving] = useState(false);

  /** 기존 리뷰에서 localReviews 초기화 */
  const enterReviewMode = useCallback(() => {
    const map = new Map<number, LocalReview>();
    for (const item of snapshot) {
      if (item.review) {
        map.set(item.item_index, { result: item.review.result });
      }
    }
    setLocalReviews(map);
    setIsReviewMode(true);
  }, [snapshot]);

  const exitReviewMode = useCallback(() => {
    // Clean up any object URLs
    for (const [, review] of localReviews) {
      if (review.commentPhotoPreview) URL.revokeObjectURL(review.commentPhotoPreview);
    }
    setIsReviewMode(false);
    setLocalReviews(new Map());
  }, [localReviews]);

  const handleReviewChange = useCallback(
    (itemIndex: number, review: LocalReview | null) => {
      setLocalReviews((prev) => {
        const next = new Map(prev);
        if (review) {
          next.set(itemIndex, review);
        } else {
          // Clean up object URL
          const old = prev.get(itemIndex);
          if (old?.commentPhotoPreview) URL.revokeObjectURL(old.commentPhotoPreview);
          next.delete(itemIndex);
        }
        return next;
      });
    },
    [],
  );

  /** 변경된 리뷰만 서버로 전송 (사진 먼저 업로드, 그 다음 리뷰 저장) */
  const handleSave = useCallback(async () => {
    const changes: {
      itemIndex: number;
      result: string;
      comment_text?: string;
      comment_photo_url?: string;
    }[] = [];

    for (const [itemIndex, local] of localReviews) {
      if (!local.result) continue;

      const item = snapshot.find((s) => s.item_index === itemIndex);
      const existing = item?.review;

      const hasResultChange = !existing || existing.result !== local.result;
      const hasComment = !!local.commentText || !!local.commentPhotoFile;

      if (hasResultChange || hasComment) {
        changes.push({
          itemIndex,
          result: local.result,
          comment_text: local.commentText,
          // photo URL will be filled after upload
        });
      }
    }

    if (changes.length === 0) {
      toast({ type: "info", message: "No changes to save." });
      exitReviewMode();
      return;
    }

    setIsSaving(true);
    try {
      // 1. Upload comment photos first
      for (const ch of changes) {
        const local = localReviews.get(ch.itemIndex);
        if (local?.commentPhotoFile) {
          const { upload_url, file_url } = await presignedUrl.mutateAsync({
            filename: local.commentPhotoFile.name,
            content_type: local.commentPhotoFile.type,
          });
          await fetch(upload_url, {
            method: "PUT",
            body: local.commentPhotoFile,
            headers: { "Content-Type": local.commentPhotoFile.type },
          });
          ch.comment_photo_url = file_url;
        }
      }

      // 2. Save reviews sequentially
      for (const ch of changes) {
        await upsertReview.mutateAsync({
          instanceId: instance.id,
          itemIndex: ch.itemIndex,
          result: ch.result,
          comment_text: ch.comment_text,
          comment_photo_url: ch.comment_photo_url,
        });
      }
      toast({ type: "success", message: `${changes.length} review(s) saved.` });
      exitReviewMode();
    } catch (err) {
      toast({ type: "error", message: parseApiError(err, "Failed to save reviews.") });
    } finally {
      setIsSaving(false);
    }
  }, [localReviews, snapshot, instance.id, upsertReview, presignedUrl, toast, exitReviewMode]);

  const hasAnyEvidence = evidenceSummary.photos > 0 || evidenceSummary.notes > 0 || evidenceSummary.reviewed > 0 || evidenceSummary.missing > 0 || evidenceSummary.pendingReReview > 0;

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

        {/* Evidence Summary */}
        {hasAnyEvidence && (
          <div className="flex flex-wrap items-center gap-4 mt-3 pt-3 border-t border-border">
            {evidenceSummary.photos > 0 && (
              <span className="flex items-center gap-1.5 text-xs text-text-secondary">
                <Camera size={13} className="text-accent" />
                {evidenceSummary.photos}
              </span>
            )}
            {evidenceSummary.notes > 0 && (
              <span className="flex items-center gap-1.5 text-xs text-text-secondary">
                <FileText size={13} className="text-warning" />
                {evidenceSummary.notes}
              </span>
            )}
            {evidenceSummary.reviewed > 0 && (
              <span className="flex items-center gap-1.5 text-xs text-text-secondary">
                <CheckCircle size={13} className="text-success" />
                {evidenceSummary.reviewed}
              </span>
            )}
            {evidenceSummary.pendingReReview > 0 && (
              <span className="flex items-center gap-1.5 text-xs text-text-secondary">
                <RotateCcw size={13} className="text-accent" />
                {evidenceSummary.pendingReReview} 재검토
              </span>
            )}
            {evidenceSummary.missing > 0 && (
              <span className="flex items-center gap-1.5 text-xs text-text-secondary">
                <AlertTriangle size={13} className="text-danger" />
                {evidenceSummary.missing} pending
              </span>
            )}
          </div>
        )}
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
                instanceId={instance.id}
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
