"use client";

import React from "react";
import { AlertCircle } from "lucide-react";
import { Modal } from "./Modal";
import { Button } from "./Button";

/**
 * Error modal — toast 로 보여주기엔 너무 중요한 오류를 풀어쓴 모달.
 *
 * 사용처:
 * - 데이터 손실/되돌릴 수 없는 작업 실패
 * - 권한/인증 오류 (401/403) — 사용자가 명확히 인지해야 함
 * - 다단계 폼 제출 실패 — 입력 손실 없이 메시지 노출
 *
 * Toast 와 차이:
 * - 사용자가 직접 닫아야 사라짐 (자동 dismiss 안 함)
 * - 긴 메시지 / bullet list 표시 가능
 * - 옵션 details 로 추가 컨텍스트 (서버 응답, conflict 항목 등) 노출 가능
 */

interface ErrorModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  message: string;
  /** 추가 세부 사항 (예: conflict 항목 list, debug info). bullet 으로 표시됨. */
  details?: string[];
  /** 닫기 버튼 텍스트 (기본 "Close") */
  closeLabel?: string;
}

export function ErrorModal({
  isOpen,
  onClose,
  title = "Something went wrong",
  message,
  details,
  closeLabel = "Close",
}: ErrorModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <div className="flex justify-end">
          <Button variant="primary" size="sm" onClick={onClose}>
            {closeLabel}
          </Button>
        </div>
      }
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex-shrink-0 text-[var(--color-danger)]">
          <AlertCircle className="h-5 w-5" />
        </div>
        <div className="space-y-2 min-w-0">
          <p className="text-[14px] text-[var(--color-text)] leading-relaxed">{message}</p>
          {details && details.length > 0 && (
            <ul className="list-disc list-inside text-[12.5px] text-[var(--color-text-secondary)] space-y-1">
              {details.map((d, i) => (
                <li key={i} className="leading-snug">{d}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  );
}
