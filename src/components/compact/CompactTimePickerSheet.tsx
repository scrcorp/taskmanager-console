"use client";

/**
 * 휠 피커를 모달 시트로 감싼 것. `modal.open` 으로 열고 고른 값을 돌려준다.
 * 취소(닫기)와 "값 없음으로 지정"을 구분해야 해서 반환 타입을 명시적으로 나눈다.
 */

import { useState } from "react";
import { CompactTimeNudge, CompactTimeWheel, type WheelValue } from "./CompactTimeWheel";

export type TimePickerResult = { cleared: true } | { cleared: false; value: WheelValue };

export function CompactTimePickerSheet({
  initial,
  step,
  dates,
  allowClear,
  onDone,
}: {
  initial: WheelValue;
  step: 1 | 5;
  dates?: string[];
  /** 값을 비울 수 있는 칸인지 (예: 아직 안 찍은 퇴근). */
  allowClear?: boolean;
  onDone: (result: TimePickerResult | undefined) => void;
}) {
  const [value, setValue] = useState<WheelValue>(initial);
  const nudges = step === 1 ? [-15, -1, 1, 15] : [-30, -5, 5, 30];

  return (
    <div className="px-1 pb-1">
      <CompactTimeWheel value={value} onChange={setValue} step={step} dates={dates} />
      <CompactTimeNudge value={value} onChange={setValue} steps={nudges} dates={dates} />

      <div className="mt-4 flex gap-2">
        {allowClear && (
          <button
            type="button"
            onClick={() => onDone({ cleared: true })}
            className="h-12 flex-1 rounded-lg border border-border text-sm font-bold text-danger"
          >
            Clear
          </button>
        )}
        <button
          type="button"
          onClick={() => onDone({ cleared: false, value })}
          className="h-12 flex-[2] rounded-lg bg-accent text-sm font-bold text-white transition-colors active:bg-accent-light"
        >
          Set {value.time}
        </button>
      </div>
    </div>
  );
}
