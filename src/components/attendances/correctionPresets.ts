/**
 * Attendance correction Reason 의 preset 목록.
 *
 * Reason 은 항상 비지 않은 문자열이어야 함 (DB NOT NULL).
 * UI 에서 사용자는 preset 중 하나를 고르거나 "Other" 를 골라 자유 텍스트 입력.
 *
 * Preset 을 고르면 그 label 이 그대로 reason 으로 저장된다 (i18n/리포팅 용도로
 * 정규화된 한정 집합으로 들어감). "Other" 만 사용자 입력 텍스트가 저장됨.
 */
export const CORRECTION_REASON_PRESETS: readonly string[] = [
  "Forgot to clock in",
  "Forgot to clock out",
  "Wrong time recorded",
  "Device / network issue",
  "Schedule change",
  "Break correction",
] as const;

export const OTHER_REASON_LABEL = "Other";

/** preset 중 하나면 true. 기존 데이터에서 "Other" 였는지 free-text 였는지 판별. */
export function isPresetReason(reason: string | null | undefined): boolean {
  if (!reason) return false;
  return CORRECTION_REASON_PRESETS.includes(reason);
}
