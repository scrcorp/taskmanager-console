"use client";

import React, { useEffect, useCallback } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { LAYER } from "@/lib/layers";

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
  /**
   * 어느 레이어에 뜰지. 기본 "modal".
   * "dialog" 는 confirm/alert 셸 전용 — 다른 모달 위에서도 반드시 보여야 한다
   * (ModalProvider 가 지정. 호출 측에서 직접 쓸 일 없음).
   */
  layer?: "modal" | "dialog";
  /**
   * 백드롭 딤 여부. 기본 true.
   * 모달이 여러 겹 쌓일 때 위쪽 것들은 false 로 둔다 — 반투명 딤이 곱해져서
   * 화면이 새까매지는 걸 막는다.
   */
  dimBackdrop?: boolean;
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
  layer = "modal",
  dimBackdrop = true,
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
      // h-viewport(100dvh): inset-0 은 모바일 브라우저 툴바가 보일 때도 "툴바 숨김 기준" 높이라,
      // items-end 로 붙인 시트 하단(=주요 액션 버튼)이 하단바 뒤로 들어간다.
      // MobileSidebar 오버레이와 같은 방식. 데스크탑은 md:items-center 라 결과가 동일하다.
      className={cn(
        "fixed inset-x-0 top-0 h-viewport flex items-end md:items-center md:justify-center",
        layer === "dialog" ? LAYER.DIALOG : LAYER.MODAL,
        dimBackdrop && "bg-black/60",
      )}
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
        {/* pb: iOS 홈 인디케이터 영역만큼 아래 여백 — 마지막 버튼이 인디케이터에 겹치지 않게 */}
        <div className="px-4 md:px-6 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:pb-4 flex-1 overflow-auto overscroll-contain">
          {children}
        </div>
        {footer && (
          <div className="shrink-0 border-t border-border bg-card px-4 md:px-6 py-3">{footer}</div>
        )}
      </div>
    </div>
  );
}
