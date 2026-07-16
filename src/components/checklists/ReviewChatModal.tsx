"use client";

/**
 * 리뷰 채팅 모달 — `ReviewThread` 본문을 Modal 로 감싼 얇은 래퍼.
 *
 * 실제 타임라인/입력/O·X 로직은 `ReviewThread` 에 있다.
 * 인라인 펼침(`ChecklistItemRow`)은 같은 `ReviewThread` 를 모달 없이 렌더한다.
 */

import React from "react";
import { Modal } from "@/components/ui";
import { ReviewThread } from "./ReviewThread";
import type { ChecklistInstanceItem } from "@/types";

interface ReviewChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  instanceId: string;
  itemIndex: number;
  itemTitle: string;
  reviewResult: string | null;
  item: ChecklistInstanceItem;
  /** store/org 타임존 — 사진 워터마크 시각 변환용. */
  timezone?: string;
  onReviewChange?: () => void;
}

export function ReviewChatModal({
  isOpen,
  onClose,
  instanceId,
  itemIndex,
  itemTitle,
  reviewResult,
  item,
  timezone,
  onReviewChange,
}: ReviewChatModalProps): React.ReactElement {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`Review — ${itemTitle}`} size="md" closeOnBackdrop={false}>
      <ReviewThread
        instanceId={instanceId}
        itemIndex={itemIndex}
        item={item}
        reviewResult={reviewResult}
        timezone={timezone}
        onReviewChange={onReviewChange}
        showReviewControls
        autoScrollOnMount
      />
    </Modal>
  );
}
