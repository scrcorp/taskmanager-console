"use client";

import React, { useEffect, useCallback } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * 모달 컴포넌트 -- 오버레이 백드롭 위에 중앙 배치되는 대화 상자입니다.
 *
 * Centered modal dialog with overlay backdrop, close button, and click-outside-to-close.
 *
 * @param isOpen - 모달 표시 여부 (Whether the modal is visible)
 * @param onClose - 모달 닫기 핸들러 (Handler called when modal should close)
 * @param title - 모달 제목 (Modal title text)
 * @param children - 모달 내부 콘텐츠 (Modal body content)
 * @param size - 모달 너비 크기 (Modal width size)
 */

type ModalSize = "sm" | "md" | "lg";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  /** 하단 고정 footer (Save/Cancel 버튼 영역). 전달하면 body 스크롤 중에도 항상 보임. */
  footer?: React.ReactNode;
  size?: ModalSize;
  /** backdrop 클릭으로 닫기 허용 여부. 입력/수정 폼 모달은 false 권장 (우발적 변경 분실 방지) */
  closeOnBackdrop?: boolean;
  /** ESC 키로 닫기 허용 여부. 기본 true */
  closeOnEscape?: boolean;
}

const sizeStyles: Record<ModalSize, string> = {
  sm: "md:max-w-sm",
  md: "md:max-w-lg",
  lg: "md:max-w-2xl",
};

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  footer,
  size = "md",
  closeOnBackdrop = true,
  closeOnEscape = true,
}: ModalProps): React.ReactElement | null {
  const handleKeyDown: (e: KeyboardEvent) => void = useCallback(
    (e: KeyboardEvent): void => {
      if (e.key === "Escape" && closeOnEscape) {
        onClose();
      }
    },
    [onClose, closeOnEscape],
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    }

    return (): void => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [isOpen, handleKeyDown]);

  if (!isOpen) {
    return null;
  }

  const handleBackdropClick: (e: React.MouseEvent<HTMLDivElement>) => void = (
    e: React.MouseEvent<HTMLDivElement>,
  ): void => {
    if (!closeOnBackdrop) return;
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center md:justify-center bg-black/60"
      onClick={handleBackdropClick}
    >
      <div
        className={cn(
          "w-full bg-card flex flex-col",
          // Mobile: full screen
          "h-full",
          // Desktop: auto height, centered, rounded
          "md:h-auto md:max-h-[90vh] md:mx-4 md:border md:border-border md:rounded-xl md:shadow-xl",
          sizeStyles[size],
        )}
      >
        {title && (
          <div className="flex items-center justify-between px-4 md:px-6 py-4 border-b border-border shrink-0">
            <h2 className="text-lg font-semibold text-text">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-lg text-text-muted hover:text-text hover:bg-surface-hover transition-colors duration-150 cursor-pointer"
              aria-label="Close modal"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        )}
        <div className="px-4 md:px-6 py-4 flex-1 overflow-auto">{children}</div>
        {footer && (
          <div className="shrink-0 border-t border-border bg-card px-4 md:px-6 py-3">{footer}</div>
        )}
      </div>
    </div>
  );
}
