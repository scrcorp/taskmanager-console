"use client";

/**
 * 체크리스트 아이템 행 컴포넌트.
 *
 * - 기본 모드: completion 상태 + 리뷰 뱃지 + 말풍선 아이콘(항상, 콘텐츠 수 뱃지)
 * - 리뷰 모드: O/△/X 버튼만 (콘텐츠는 채팅 모달에서)
 * - 자체 저장 없음 — 부모가 batch save 처리
 */

import React, { useState } from "react";
import { Check, X, Clock, Camera, FileText, MapPin, MessageCircle, Film } from "lucide-react";
import { Badge, Lightbox } from "@/components/ui";
import { cn, formatActionTime } from "@/lib/utils";
import { ReviewChatModal } from "./ReviewChatModal";
import type { ChecklistInstanceSnapshotItem } from "@/types";

export interface LocalReview {
  result: string;
}

interface ChecklistItemRowProps {
  item: ChecklistInstanceSnapshotItem;
  index: number;
  workDate: string;
  instanceId: string;
  reviewMode?: boolean;
  localReview?: LocalReview | null;
  onReviewChange?: (review: LocalReview | null) => void;
  expandAllNotes?: boolean;
}

const REVIEW_OPTIONS = [
  { value: "pass", label: "O", color: "success" },
  { value: "caution", label: "△", color: "warning" },
  { value: "fail", label: "X", color: "danger" },
] as const;

const NOTE_TRUNCATE_LENGTH = 150;

function isVideo(url: string): boolean {
  return /\.(mp4|mov|webm|avi|mkv)(\?|$)/i.test(url);
}

export function ChecklistItemRow({
  item,
  index,
  workDate,
  instanceId,
  reviewMode = false,
  localReview,
  onReviewChange,
  expandAllNotes = false,
}: ChecklistItemRowProps): React.ReactElement {
  const isCompleted = !!item.is_completed;
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [isNoteExpanded, setIsNoteExpanded] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const review = item.review;
  const contentsCount = review?.contents?.length ?? 0;

  const noteExpanded = expandAllNotes || isNoteExpanded;
  const noteTruncated = item.note && item.note.length > NOTE_TRUNCATE_LENGTH;

  const handleResultClick = (result: string) => {
    if (!onReviewChange) return;
    if (localReview?.result === result) {
      onReviewChange(null);
    } else {
      onReviewChange({ result });
    }
  };

  const hasPhoto = !!item.photo_url;
  const hasNote = !!item.note;
  const hasBothEvidence = hasPhoto && hasNote;
  const needsEvidence = !isCompleted && item.verification_type !== "none";

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
          {/* 리뷰 뱃지 (리뷰 모드 아닐 때) */}
          {!reviewMode && review && (
            <Badge
              variant={
                review.result === "pass" ? "success" : review.result === "fail" ? "danger" : "warning"
              }
            >
              {review.result === "pass" ? "O" : review.result === "fail" ? "X" : "△"}
            </Badge>
          )}
          {/* 말풍선 아이콘 — 리뷰가 있으면 항상 표시, 클릭 시 채팅 모달 */}
          {!reviewMode && review && (
            <button
              type="button"
              onClick={() => setIsChatOpen(true)}
              className="relative p-0.5 rounded text-text-muted hover:text-accent transition-colors"
            >
              <MessageCircle size={14} />
              {contentsCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[14px] h-[14px] rounded-full bg-accent text-white text-[9px] font-bold flex items-center justify-center px-0.5">
                  {contentsCount}
                </span>
              )}
            </button>
          )}
        </div>

        {item.description && (
          <p className="text-xs text-text-secondary mt-1 ml-6">{item.description}</p>
        )}

        {/* Completion details */}
        {isCompleted && (
          <div className="mt-2 ml-6 space-y-2">
            <div className="flex items-center gap-2 text-xs text-text-muted">
              <Clock size={11} />
              <span>{formatActionTime(item.completed_at ?? "", workDate)}</span>
              {item.completed_by_name && (
                <>
                  <span>by</span>
                  <span className="text-text-secondary font-medium">{item.completed_by_name}</span>
                </>
              )}
            </div>

            {/* Evidence: photo + text */}
            {(hasPhoto || hasNote) && (
              <div className={cn(
                hasBothEvidence && "flex items-start gap-3 flex-col sm:flex-row",
              )}>
                {/* Photo thumbnail */}
                {hasPhoto && item.photo_url && (
                  <div className="relative flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => setIsLightboxOpen(true)}
                      className="block rounded-lg border border-border overflow-hidden hover:border-accent/50 transition-colors cursor-pointer"
                    >
                      {isVideo(item.photo_url) ? (
                        <div className="relative w-20 h-20 bg-surface-hover flex items-center justify-center">
                          <Film size={24} className="text-accent" />
                          <span className="absolute bottom-1 right-1 text-[9px] text-text-muted bg-black/60 px-1 rounded">
                            VIDEO
                          </span>
                        </div>
                      ) : (
                        <img
                          src={item.photo_url}
                          alt={`Verification for ${item.title}`}
                          className="w-20 h-20 object-cover"
                        />
                      )}
                    </button>
                  </div>
                )}

                {/* Text note block */}
                {hasNote && item.note && (
                  <div className="flex-1 min-w-0 border-l-2 border-accent/60 bg-surface/50 rounded-r-lg px-3 py-2">
                    <p className="text-sm text-text-secondary">
                      {noteExpanded || !noteTruncated
                        ? item.note
                        : `${item.note.slice(0, NOTE_TRUNCATE_LENGTH)}...`}
                    </p>
                    {noteTruncated && !expandAllNotes && (
                      <button
                        type="button"
                        onClick={() => setIsNoteExpanded(!isNoteExpanded)}
                        className="text-xs text-accent hover:underline mt-1 cursor-pointer"
                      >
                        {isNoteExpanded ? "Show less" : "Show more"}
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}

            {item.location && (
              <div className="flex items-center gap-2 text-xs text-text-muted">
                <MapPin size={11} className="shrink-0" />
                <span>
                  {item.location.lat.toFixed(4)}, {item.location.lng.toFixed(4)}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Incomplete + evidence required indicator */}
        {needsEvidence && (
          <div className="mt-2 ml-6 border border-dashed border-border rounded-lg px-3 py-2 flex items-center gap-2">
            {(item.verification_type === "photo" || item.verification_type === "both") && (
              <span className="flex items-center gap-1 text-xs text-text-muted italic">
                <Camera size={11} /> Photo required
              </span>
            )}
            {(item.verification_type === "text" || item.verification_type === "both") && (
              <span className="flex items-center gap-1 text-xs text-text-muted italic">
                <FileText size={11} /> Note required
              </span>
            )}
          </div>
        )}

        {/* 기존 리뷰 reviewer 표시 (리뷰 모드 아닐 때) */}
        {!reviewMode && review && (
          <div className="mt-1.5 ml-6">
            <p className="text-xs text-text-muted">Reviewed by {review.reviewer_name ?? "Unknown"}</p>
          </div>
        )}

        {/* 리뷰 모드 — O/△/X 버튼만 */}
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
            </div>
          </div>
        )}
      </div>

      {/* Lightbox */}
      {item.photo_url && (
        <Lightbox
          isOpen={isLightboxOpen}
          onClose={() => setIsLightboxOpen(false)}
          src={item.photo_url}
          alt={`Verification for ${item.title}`}
        />
      )}

      {/* 채팅 모달 */}
      {review && (
        <ReviewChatModal
          isOpen={isChatOpen}
          onClose={() => setIsChatOpen(false)}
          instanceId={instanceId}
          itemIndex={item.item_index}
          itemTitle={item.title}
          reviewResult={review.result}
          contents={review.contents ?? []}
        />
      )}
    </div>
  );
}
