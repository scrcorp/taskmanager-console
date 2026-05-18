"use client";

/**
 * ConfirmBody — modal.confirm() 프리셋의 본문 컴포넌트.
 *
 * 책임:
 *   - variant (primary/danger) 에 따른 시각 톤
 *   - requiresReason 일 때 textarea 노출 + 검증
 *   - Confirm/Cancel 클릭 시 onResult(value) 호출
 *
 * onResult 가 받는 값의 규약:
 *   일반 모드 (requiresReason 없음):
 *     - Confirm 클릭 → true
 *     - Cancel 클릭  → false
 *   reason 모드 (requiresReason: true):
 *     - Confirm 클릭 → string (trim 된 입력값. 빈 문자열 "" 가능)
 *     - Cancel 클릭  → undefined
 *
 * ESC/backdrop 으로 닫히는 경우는 Provider 가 처리 — ConfirmBody 모름.
 * 이 경우 Promise 는 undefined 로 resolve (useModal 의 confirm wrapper 가
 * 일반 모드에서는 false 로 coerce).
 *
 * 기존 schedules/redesign/ConfirmDialog.tsx 와 거의 같은 동작 — 이쪽으로 통합 예정.
 */

import { useState, type ReactNode } from "react";
import { AlertTriangle, HelpCircle } from "lucide-react";
import { Button } from "../Button";
import type { ConfirmProps } from "./types";

/** Confirm/Cancel 클릭 결과의 가능한 값. ESC/backdrop 은 별도 경로 (Provider) */
type ConfirmResult = boolean | string | undefined;

interface ConfirmBodyProps extends ConfirmProps {
  /** Confirm/Cancel 클릭 시 호출되는 콜백. 결과 값과 함께 호출 */
  onResult: (value: ConfirmResult) => void;
}

export function ConfirmBody({
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "primary",
  requiresReason = false,
  reasonMandatory = false,
  reasonLabel = "Reason",
  onResult,
}: ConfirmBodyProps): ReactNode {
  const [reason, setReason] = useState("");
  const isDanger = variant === "danger";

  /**
   * reason 검증.
   * - requiresReason 가 아니면 항상 valid
   * - reasonMandatory 가 아니면 빈 값도 허용
   * - mandatory 면 trim 후 길이 > 0 일 때만 Confirm 활성화
   */
  const reasonValid =
    !requiresReason || !reasonMandatory || reason.trim().length > 0;

  const handleConfirm = () => {
    if (requiresReason) {
      onResult(reason.trim()); // "" 또는 실제 사유
    } else {
      onResult(true);
    }
  };

  const handleCancel = () => {
    /**
     * 일반 모드: false (= 명시적 취소)
     * reason 모드: undefined (= "사유 없음 + 취소" 를 구분할 필요 없음)
     */
    onResult(requiresReason ? undefined : false);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        {/* 아이콘 — danger 면 경고, 아니면 질문 */}
        <div
          className={`flex-shrink-0 mt-0.5 ${isDanger ? "text-danger" : "text-accent"}`}
        >
          {isDanger ? (
            <AlertTriangle className="h-5 w-5" />
          ) : (
            <HelpCircle className="h-5 w-5" />
          )}
        </div>

        <p className="text-sm text-text-secondary leading-relaxed">{message}</p>
      </div>

      {/* reason 입력 칸 — 옵션 켜졌을 때만 */}
      {requiresReason && (
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-text-muted mb-1.5">
            {reasonLabel}
            {reasonMandatory && <span className="text-danger"> *</span>}
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Provide a reason..."
            className="w-full min-h-[70px] px-3 py-2 text-sm border border-border rounded-lg resize-none focus:outline-none focus:border-accent bg-surface text-text"
            autoFocus
          />
        </div>
      )}

      {/* 액션 버튼 */}
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="secondary" size="sm" onClick={handleCancel}>
          {cancelLabel}
        </Button>
        <Button
          variant={isDanger ? "danger" : "primary"}
          size="sm"
          onClick={handleConfirm}
          disabled={!reasonValid}
        >
          {confirmLabel}
        </Button>
      </div>
    </div>
  );
}
