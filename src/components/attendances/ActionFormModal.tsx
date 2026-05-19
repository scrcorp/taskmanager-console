"use client";

import React, { useState } from "react";
import { Button, Input } from "@/components/ui";
import { ReasonPicker } from "./ReasonPicker";

/**
 * 단일 attendance 액션용 재사용 모달 본문.
 *
 * 액션 종류에 따라 입력 항목이 달라진다:
 *   - 시간 필요(clock_in/clock_out/start_break/end_break): time picker 노출
 *   - break 시작: break_type 라벨 (이미 confirm 단계에서 결정)
 *   - reason: 항상 필수 (preset + Other)
 *
 * useModal().open() 으로 띄우고, close({at?, break_type?, reason}) 또는 close()(취소).
 */

export type ActionPayload = {
  at?: string; // ISO datetime
  break_type?: "paid_10min" | "unpaid_meal";
  reason: string;
};

interface ActionFormModalProps {
  title: string;
  /** 한 줄 설명 (선택). 예: "Record when the employee actually clocked in." */
  description?: string;
  /** time picker 노출 여부. mark_no_show/cancel/reopen 은 false. */
  needsTime?: boolean;
  /** time picker 기본값 — datetime-local 포맷 "YYYY-MM-DDTHH:mm". 없으면 비어있음. */
  defaultTime?: string;
  /** break 시작 액션이면 표시할 break_type. ActionFormModal 은 변경 안함. */
  breakType?: "paid_10min" | "unpaid_meal";
  /** 시간 입력 라벨 (기본 "Time") */
  timeLabel?: string;
  /** 강조 라벨 (Submit 버튼). 기본 "Confirm" */
  submitLabel?: string;
  /** 위험 동작 표시 (빨강 톤) */
  danger?: boolean;
  /** submit 진행중 여부 — 외부 mutation 의 isPending 을 받음 */
  busy?: boolean;
  onClose: (payload?: ActionPayload) => void;
}

function localInputToIso(s: string): string | null {
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export function ActionFormModal({
  description,
  needsTime = true,
  defaultTime = "",
  breakType,
  timeLabel = "Time",
  submitLabel = "Confirm",
  danger = false,
  busy = false,
  onClose,
}: ActionFormModalProps): React.ReactElement {
  const [time, setTime] = useState<string>(defaultTime);
  const [reason, setReason] = useState<string>("");

  const reasonValid = reason.trim().length > 0;
  const timeValid = !needsTime || time.length > 0;
  const canSubmit = reasonValid && timeValid;

  const handleSubmit = (): void => {
    if (!canSubmit) return;
    const payload: ActionPayload = { reason: reason.trim() };
    if (needsTime) {
      const iso = localInputToIso(time);
      if (!iso) return;
      payload.at = iso;
    }
    if (breakType) payload.break_type = breakType;
    onClose(payload);
  };

  return (
    <div className="flex flex-col gap-4">
      {description && (
        <p className="text-sm text-text-secondary">{description}</p>
      )}

      {needsTime && (
        <Input
          label={timeLabel}
          type="datetime-local"
          value={time}
          onChange={(e) => setTime(e.target.value)}
        />
      )}

      <ReasonPicker
        value={reason}
        onChange={setReason}
        hint="Required. Choose a preset or pick Other to describe."
      />

      <div className="flex justify-end gap-2 pt-2 border-t border-border">
        <Button variant="secondary" onClick={() => onClose()} disabled={busy}>
          Cancel
        </Button>
        <Button
          variant={danger ? "danger" : "primary"}
          onClick={handleSubmit}
          disabled={!canSubmit}
          isLoading={busy}
        >
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}

/** ISO datetime 을 datetime-local input 의 기본값으로 변환. */
export function isoToLocalInputValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number): string => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

/** 지금 시각을 datetime-local 포맷으로 — 액션 모달 기본값 (clock_in/clock_out 등). */
export function nowAsLocalInput(): string {
  return isoToLocalInputValue(new Date().toISOString());
}
