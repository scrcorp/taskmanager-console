"use client";

/**
 * 체크리스트 아이템 행 컴포넌트.
 *
 * - 기본 모드: completion 상태 + 기존 리뷰 뱃지 표시
 * - 리뷰 모드: O/△/X 버튼 + 💬 코멘트 토글
 * - 자체 저장 없음 — 부모가 batch save 처리
 */

import React, { useState } from "react";
import { Check, X, Clock, Camera, FileText, MapPin, MessageCircle } from "lucide-react";
import { Badge, Textarea } from "@/components/ui";
import { cn, formatActionTime } from "@/lib/utils";
import type { ChecklistInstanceSnapshotItem, ChecklistCompletion } from "@/types";

export interface LocalReview {
  result: string;
  comment: string | null;
}

interface ChecklistItemRowProps {
  item: ChecklistInstanceSnapshotItem;
  index: number;
  completion?: ChecklistCompletion;
  workDate: string;
  reviewMode?: boolean;
  localReview?: LocalReview | null;
  onReviewChange?: (review: LocalReview | null) => void;
}

const REVIEW_OPTIONS = [
  { value: "pass", label: "O", color: "success" },
  { value: "caution", label: "△", color: "warning" },
  { value: "fail", label: "X", color: "danger" },
] as const;

export function ChecklistItemRow({
  item,
  index,
  completion,
  workDate,
  reviewMode = false,
  localReview,
  onReviewChange,
}: ChecklistItemRowProps): React.ReactElement {
  const isCompleted = !!completion;
  const [isPhotoExpanded, setIsPhotoExpanded] = useState(false);
  const [showComment, setShowComment] = useState(!!localReview?.comment);
  const review = item.review;

  const handleResultClick = (result: string) => {
    if (!onReviewChange) return;
    if (localReview?.result === result) {
      // 같은 버튼 다시 클릭 → 선택 해제
      onReviewChange(null);
      setShowComment(false);
    } else {
      onReviewChange({ result, comment: localReview?.comment ?? null });
    }
  };

  const handleCommentChange = (text: string) => {
    if (!onReviewChange || !localReview) return;
    onReviewChange({ ...localReview, comment: text || null });
  };

  return (
    <div
      className={cn(
        "flex items-start gap-3 p-3 rounded-lg border border-border",
        isCompleted ? "bg-success-muted/30" : "bg-surface",
      )}
    >
      {/* Completion icon */}
      <div
        className={cn(
          "mt-0.5 flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center",
          isCompleted
            ? "bg-success text-white"
            : "bg-surface-hover text-text-muted",
        )}
      >
        {isCompleted ? <Check size={12} /> : <X size={12} />}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-text-muted">{index + 1}.</span>
          <span className="text-sm font-medium text-text">{item.title}</span>
          {item.verification_type !== "none" && (
            <Badge variant="accent">{item.verification_type}</Badge>
          )}
          {/* 기존 리뷰 뱃지 (리뷰 모드 아닐 때) */}
          {!reviewMode && review && (
            <Badge
              variant={
                review.result === "pass" ? "success" : review.result === "fail" ? "danger" : "warning"
              }
            >
              {review.result === "pass" ? "O" : review.result === "fail" ? "X" : "△"}
            </Badge>
          )}
        </div>

        {item.description && (
          <p className="text-xs text-text-secondary mt-1 ml-6">{item.description}</p>
        )}

        {/* Completion details */}
        {completion && (
          <div className="mt-2 ml-6 space-y-1.5">
            <div className="flex items-center gap-2 text-xs text-text-muted">
              <Clock size={11} />
              <span>{formatActionTime(completion.completed_at, workDate)}</span>
              {completion.user_name && (
                <>
                  <span>by</span>
                  <span className="text-text-secondary font-medium">{completion.user_name}</span>
                </>
              )}
            </div>
            {completion.photo_url && (
              <div className="flex items-start gap-2">
                <Camera size={11} className="text-accent mt-0.5 shrink-0" />
                <button
                  type="button"
                  onClick={() => setIsPhotoExpanded(!isPhotoExpanded)}
                  className="text-xs text-accent hover:underline cursor-pointer"
                >
                  {isPhotoExpanded ? "Hide photo" : "View photo"}
                </button>
              </div>
            )}
            {isPhotoExpanded && completion.photo_url && (
              <img
                src={completion.photo_url}
                alt={`Verification for ${item.title}`}
                className="max-w-[240px] rounded-lg border border-border"
              />
            )}
            {completion.note && (
              <div className="flex items-start gap-2">
                <FileText size={11} className="text-warning mt-0.5 shrink-0" />
                <p className="text-xs text-text-secondary">{completion.note}</p>
              </div>
            )}
            {completion.location && (
              <div className="flex items-center gap-2 text-xs text-text-muted">
                <MapPin size={11} className="shrink-0" />
                <span>
                  {completion.location.lat.toFixed(4)}, {completion.location.lng.toFixed(4)}
                </span>
              </div>
            )}
          </div>
        )}

        {/* 기존 리뷰 표시 (리뷰 모드 아닐 때) */}
        {!reviewMode && review && (
          <div className="mt-1.5 ml-6 text-xs text-text-muted">
            {review.comment && <p className="text-text-secondary">{review.comment}</p>}
            <span>Reviewed by {review.reviewer_name ?? "Unknown"}</span>
          </div>
        )}

        {/* 리뷰 모드 — O/△/X 버튼 + 코멘트 */}
        {reviewMode && (
          <div className="mt-2 ml-6">
            <div className="flex items-center gap-1.5">
              {REVIEW_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleResultClick(opt.value)}
                  className={cn(
                    "w-7 h-7 rounded-md text-xs font-bold border flex items-center justify-center transition-colors",
                    localReview?.result === opt.value
                      ? opt.color === "success"
                        ? "bg-success text-white border-success"
                        : opt.color === "danger"
                          ? "bg-danger text-white border-danger"
                          : "bg-warning text-white border-warning"
                      : opt.color === "success"
                        ? "border-success/40 text-success hover:bg-success/10"
                        : opt.color === "danger"
                          ? "border-danger/40 text-danger hover:bg-danger/10"
                          : "border-warning/40 text-warning hover:bg-warning/10",
                  )}
                >
                  {opt.label}
                </button>
              ))}
              {/* 코멘트 토글 아이콘 */}
              {localReview && (
                <button
                  type="button"
                  onClick={() => setShowComment(!showComment)}
                  className={cn(
                    "ml-1 p-1 rounded-md",
                    showComment || localReview.comment
                      ? "text-accent"
                      : "text-text-muted hover:text-text-secondary",
                  )}
                >
                  <MessageCircle size={14} />
                </button>
              )}
            </div>
            {/* 코멘트 입력 */}
            {showComment && localReview && (
              <Textarea
                value={localReview.comment ?? ""}
                onChange={(e) => handleCommentChange(e.target.value)}
                placeholder="Comment..."
                className="mt-1.5 text-xs min-h-[48px]"
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
