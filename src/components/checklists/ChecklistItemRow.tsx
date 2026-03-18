"use client";

/**
 * 체크리스트 아이템 행 컴포넌트 (리뷰 모드 없음).
 *
 * - O/X 버튼 항상 표시 — 즉시 API 저장
 * - 동일 버튼 재클릭 → 리뷰 삭제 (toggle off)
 * - 증빙 배지 hover → EvidencePopover (O/X + View Details 포함)
 * - 채팅 아이콘 클릭 → ReviewChatModal
 */

import React, { useState, useEffect, useRef } from "react";
import { Check, X, Clock, MessageCircle, Paperclip } from "lucide-react";
import { Badge } from "@/components/ui";
import { cn, formatActionTime } from "@/lib/utils";
import { ReviewChatModal } from "./ReviewChatModal";
import { EvidencePopover } from "./EvidencePopover";
import { useUpsertItemReview, useDeleteItemReview } from "@/hooks/useChecklistInstances";
import type { ChecklistInstanceItem } from "@/types";

interface ChecklistItemRowProps {
  item: ChecklistInstanceItem;
  instanceId: string;
  itemIndex: number;
  workDate: string;
  timezone?: string;
  onReviewChange?: () => void;
}

export function ChecklistItemRow({
  item,
  instanceId,
  itemIndex,
  workDate,
  timezone,
  onReviewChange,
}: ChecklistItemRowProps): React.ReactElement {
  const isCompleted = !!item.is_completed;
  // Narrow to pass/fail only (pending_re_review treated as unreviewed for O/X display)
  const rawResult = item.review_result;
  const serverResult: "pass" | "fail" | null =
    rawResult === "pass" || rawResult === "fail" ? rawResult : null;
  const contentsCount = item.messages.length;

  const [isChatOpen, setIsChatOpen] = useState(false);
  // Optimistic result: undefined = use server value, "pass"/"fail"/null = local override
  const [optimisticResult, setOptimisticResult] = useState<"pass" | "fail" | null | undefined>(
    undefined,
  );

  const upsertReview = useUpsertItemReview();
  const deleteReview = useDeleteItemReview();

  // Latest submission's photo URLs only
  const lastSubmission = item.submissions[item.submissions.length - 1] ?? null;
  const latestSubId = lastSubmission?.id;
  const photoUrls: string[] = item.files
    .filter((f) => f.context === "submission" && (latestSubId ? f.context_id === latestSubId : true))
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((f) => f.file_url);
  const hasPhoto = photoUrls.length > 0;
  const note = lastSubmission?.note ?? null;
  const hasNote = !!note;

  // Staff name from latest submission
  const staffName = lastSubmission?.submitted_by_name ?? item.completed_by_name ?? null;

  // Resubmission count = submissions beyond the first
  const resubmissionCount = Math.max(item.submissions.length - 1, 0);

  // 서버 데이터(캐시)가 변경되면 optimistic 상태 해제
  const prevServerResult = useRef(serverResult);
  useEffect(() => {
    if (prevServerResult.current !== serverResult) {
      prevServerResult.current = serverResult;
      setOptimisticResult(undefined);
    }
  }, [serverResult]);

  // UI에 보여줄 결과: optimistic이 있으면 그것, 없으면 서버 값
  const currentResult: "pass" | "fail" | null =
    optimisticResult === undefined ? serverResult : optimisticResult;

  const isActing = upsertReview.isPending || deleteReview.isPending;

  const handleReview = async (result: "pass" | "fail") => {
    if (isActing) return;
    const isToggleOff = currentResult === result;

    // 즉시 UI 업데이트
    setOptimisticResult(isToggleOff ? null : result);

    try {
      if (isToggleOff) {
        await deleteReview.mutateAsync({ instanceId, itemIndex });
      } else {
        await upsertReview.mutateAsync({ instanceId, itemIndex, result });
      }
      // setQueryData(onSuccess)가 캐시를 업데이트 → 부모 re-render → useEffect에서 optimistic 해제
      onReviewChange?.();
    } catch {
      // 에러 시 서버 값으로 복귀
      setOptimisticResult(undefined);
    }
  };

  // Row background state
  // - pass: success muted tint
  // - fail: danger muted tint
  // - pending_re_review: accent muted tint (resubmitted, awaiting re-review)
  // - completed but no review yet (pending_review): very light success tint
  // - incomplete: plain surface
  const rowState =
    currentResult === "pass"
      ? "bg-success-muted/40 border-success/30"
      : currentResult === "fail"
        ? "bg-danger-muted/40 border-danger/30"
        : rawResult === "pending_re_review"
          ? "bg-accent-muted/30 border-accent/30"
          : isCompleted
            ? "bg-success-muted/20 border-success/20"
            : "bg-surface border-border";

  return (
    <div
      className={cn(
        "flex items-start gap-3 p-3 rounded-lg border transition-colors hover:shadow-sm",
        rowState,
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
        {/* Header row */}
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-mono text-text-muted">{itemIndex + 1}.</span>
          <span className="text-sm font-medium text-text">{item.title}</span>

          {item.verification_type !== "none" && (
            <Badge variant="accent">{item.verification_type}</Badge>
          )}

          {/* Resubmission badge */}
          {resubmissionCount > 0 && (
            <Badge variant="accent">Resubmitted {resubmissionCount}x</Badge>
          )}

          {/* Review result badge */}
          {currentResult === "pass" && <Badge variant="success">Pass</Badge>}
          {currentResult === "fail" && <Badge variant="danger">Fail</Badge>}
          {rawResult === "pending_re_review" && <Badge variant="accent">Pending Resubmit</Badge>}
        </div>

        {item.description && (
          <p className="text-xs text-text-secondary mt-1 ml-5">{item.description}</p>
        )}

        {/* Completion meta */}
        {isCompleted && item.completed_at && (
          <div className="flex items-center gap-2 text-xs text-text-muted mt-1 ml-5">
            <Clock size={11} />
            <span>{formatActionTime(item.completed_at, workDate, timezone)}</span>
            {item.completed_by_name && (
              <>
                <span>by</span>
                <span className="text-text-secondary font-medium">{item.completed_by_name}</span>
              </>
            )}
            {item.reviewer_name && (
              <>
                <span>·</span>
                <span>Reviewed by {item.reviewer_name}</span>
              </>
            )}
          </div>
        )}
      </div>

      {/* Right actions: evidence + O/X + chat */}
      <div className="flex items-center gap-1.5 flex-shrink-0 mt-0.5">
        {/* Evidence indicator */}
        {(hasPhoto || hasNote) && (
          <EvidencePopover
            photoUrls={photoUrls}
            note={note}
            completedAt={item.completed_at ?? null}
            workDate={workDate}
            timezone={timezone}
            staffName={staffName}
          >
            <button
              type="button"
              className="w-8 h-8 rounded-md border border-border text-text-muted flex items-center justify-center transition-colors hover:border-accent hover:text-accent hover:bg-accent-muted"
              title={hasPhoto && hasNote ? `${photoUrls.length} photo(s) + note` : hasPhoto ? `${photoUrls.length} photo(s)` : "Note"}
            >
              <Paperclip size={13} />
            </button>
          </EvidencePopover>
        )}

        {/* Pass button */}
        <button
          type="button"
          disabled={isActing}
          onClick={() => handleReview("pass")}
          className={cn(
            "w-8 h-8 rounded-md text-sm font-bold border-2 flex items-center justify-center transition-colors disabled:opacity-50",
            currentResult === "pass"
              ? "bg-success text-white border-success"
              : "border-success/50 text-success hover:bg-success hover:text-white",
          )}
          title="Pass"
        >
          O
        </button>

        {/* Fail button */}
        <button
          type="button"
          disabled={isActing}
          onClick={() => handleReview("fail")}
          className={cn(
            "w-8 h-8 rounded-md text-sm font-bold border-2 flex items-center justify-center transition-colors disabled:opacity-50",
            currentResult === "fail"
              ? "bg-danger text-white border-danger"
              : "border-danger/50 text-danger hover:bg-danger hover:text-white",
          )}
          title="Fail"
        >
          X
        </button>

        {/* Chat button */}
        <button
          type="button"
          onClick={() => setIsChatOpen(true)}
          className="relative w-8 h-8 rounded-md border border-border text-text-muted flex items-center justify-center transition-colors hover:border-accent hover:text-accent hover:bg-accent-muted"
          title="Comments"
        >
          <MessageCircle size={14} />
          {contentsCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 min-w-[15px] h-[15px] rounded-full bg-accent text-white text-[9px] font-bold flex items-center justify-center px-0.5">
              {contentsCount}
            </span>
          )}
        </button>
      </div>

      {/* Chat modal */}
      <ReviewChatModal
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
        instanceId={instanceId}
        itemIndex={itemIndex}
        itemTitle={item.title}
        reviewResult={currentResult}
        item={item}
        onReviewChange={onReviewChange}
      />
    </div>
  );
}
