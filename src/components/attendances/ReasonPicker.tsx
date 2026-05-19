"use client";

import React, { useEffect, useState } from "react";
import { Select, Input } from "@/components/ui";
import {
  CORRECTION_REASON_PRESETS,
  OTHER_REASON_LABEL,
  isPresetReason,
} from "./correctionPresets";

/**
 * Reason 입력 컴포넌트.
 *
 * - preset 중 하나 또는 "Other" 선택 → Other 일 때 free-text input 노출
 * - "Other" 모드는 내부 state 로 추적 (value 가 빈 문자열이어도 input 이 사라지지 않게)
 *   → 사용자가 Other 골랐다가 텍스트 다 지워도 다시 입력 가능
 * - value 가 비어있으면 외부적으로는 "미완료" 상태 (저장 비활성)
 *
 * 외부에서 보면 단일 string 값으로 다뤄짐 — preset label 또는 Other free-text.
 */
interface ReasonPickerProps {
  label?: string;
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  otherPlaceholder?: string;
  hint?: string;
  /** History 인라인 편집용 — label 숨김 + 간격 줄임 */
  compact?: boolean;
  autoFocus?: boolean;
}

export function ReasonPicker({
  label = "Reason",
  value,
  onChange,
  placeholder = "Choose reason...",
  otherPlaceholder = "Describe the reason",
  hint,
  compact = false,
  autoFocus = false,
}: ReasonPickerProps): React.ReactElement {
  // Other 모드 — value 가 비어도 free-text input 을 유지하려면 별도 추적.
  // 초기값은 value 분류로 결정 (인라인 편집에서 기존 reason 이 free-text 면 Other 로 시작).
  const [otherMode, setOtherMode] = useState<boolean>(
    () => Boolean(value) && !isPresetReason(value),
  );

  // 외부에서 value 가 preset 으로 바뀌면 otherMode 해제 (예: 다른 사람이 reset).
  useEffect(() => {
    if (value && isPresetReason(value) && otherMode) {
      setOtherMode(false);
    }
  }, [value, otherMode]);

  const selectOptions = [
    ...CORRECTION_REASON_PRESETS.map((label) => ({ value: label, label })),
    { value: OTHER_REASON_LABEL, label: OTHER_REASON_LABEL },
  ];

  // Select 의 표시 값:
  //   - preset 인 value → 그 preset
  //   - otherMode 면 "Other" (value 가 비어있어도)
  //   - 그 외 → "" (placeholder 표시)
  const selectValue: string = otherMode
    ? OTHER_REASON_LABEL
    : value && isPresetReason(value)
      ? value
      : "";

  const handleSelectChange = (next: string): void => {
    if (next === OTHER_REASON_LABEL) {
      setOtherMode(true);
      onChange(""); // 사용자가 Other 텍스트를 새로 입력해야 함
    } else {
      setOtherMode(false);
      onChange(next);
    }
  };

  return (
    <div className={compact ? "flex flex-col gap-1" : "flex flex-col gap-2"}>
      <Select
        label={compact ? undefined : label}
        value={selectValue}
        onChange={(e) => handleSelectChange(e.target.value)}
        options={selectOptions}
        placeholder={placeholder}
        autoFocus={autoFocus}
      />
      {otherMode && (
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={otherPlaceholder}
          autoFocus
        />
      )}
      {hint && !compact && (
        <p className="text-xs text-text-muted">{hint}</p>
      )}
    </div>
  );
}
