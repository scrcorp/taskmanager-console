/**
 * 근태 Activity History 의 항목 이름·값 포맷 (순수 모듈).
 *
 * 화면 컴포넌트 안에 두면 "서버가 새 field_name 을 보냈을 때 raw 코드가 새는가"
 * 를 테스트할 수 없다. 실제로 스케줄 변경 재판정이 `anomalies` 행을 새로 남기기
 * 시작했고, 매핑이 없으면 카드에 `anomalies` / `early_clock_in_override, late`
 * 가 그대로 찍힌다.
 */

import { formatAnomalyList } from "./attendanceAnomalies";

/** 서버 `attendance_timeline.FIELD_ANOMALIES` — 재판정이 남기는 라벨 행. */
export const FIELD_ANOMALIES = "anomalies";

/** 항목(field_name) → 화면 이름. 모르는 이름은 raw 로 떨어지므로 여기가 마지막 방어선. */
export const FIELD_LABELS: Record<string, string> = {
  status: "Status",
  clock_in: "Clock-in",
  clock_out: "Clock-out",
  // 재판정으로 붙거나 걷힌 anomaly 목록. 매핑이 없으면 raw `anomalies` 가 화면에 샌다.
  [FIELD_ANOMALIES]: "Labels",
  note: "Note",
  break_start_at: "Break start",
  break_end_at: "Break end",
  break_type: "Break type",
  // 레거시 행 — field_name 에 액션 이름이 들어가던 시절. raw 값이 화면에 새지 않게 매핑.
  break_start: "Break start",
  break_end: "Break end",
  auto_clock_out: "Clock-out",
  no_show: "Status",
  cancel: "Status",
  reopen: "Status",
  modify: "Change",
};

export function fieldLabel(fieldName: string): string {
  return FIELD_LABELS[fieldName] ?? fieldName;
}

const STATUS_LABELS: Record<string, string> = {
  upcoming: "Upcoming",
  soon: "Soon",
  working: "Working",
  on_break: "On break",
  late: "Late",
  clocked_out: "Clocked out",
  no_show: "No show",
  cancelled: "Cancelled",
};

const BREAK_TYPE_LABELS: Record<string, string> = {
  paid_10min: "Paid 10min",
  unpaid_meal: "Unpaid meal",
  paid_short: "Paid 10min",
  unpaid_long: "Unpaid meal",
};

/** 서버가 "값이 없었다" 를 표시하는 센티널들. */
const EMPTY_SENTINELS = new Set(["(none)", "(cleared)"]);

/**
 * 이력 값 → 화면 문자열.
 *
 * "값이 없었다"는 상태도 값이다 — `-` 로 얼버무리지 않고 "Not set" 으로 쓴다.
 * null 은 이 규약 도입 이전 레거시 행에서만 나오며, 마찬가지로 "Not set".
 */
export function formatValue(
  raw: string | null | undefined,
  tz?: string,
): string {
  if (raw === null || raw === undefined) return "Not set";
  const v = raw.trim();
  if (!v || EMPTY_SENTINELS.has(v)) return "Not set";
  if (v === "(empty)") return "(empty)";
  if (v === "(set)") return "Set";
  if (v === "ended") return "Ended"; // 레거시 break_end 행
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)) return formatTimeOnly(v, tz);
  return STATUS_LABELS[v] ?? BREAK_TYPE_LABELS[v] ?? v;
}

/**
 * 항목별 값 포맷 — 항목 이름에 따라 해석이 갈리는 값만 여기서 처리한다.
 *
 * `anomalies` 행은 서버가 코드들을 ", " 로 이어 남긴다
 * (`late, overlapping_clock_in`). 그대로 그리면 화면에 raw 코드가 새므로
 * 라벨로 바꾸고, 빈 값은 "Not set" 대신 "None" 으로 쓴다 — 라벨은 "설정하는 값"
 * 이 아니라 "붙는 것" 이라 없음의 자연스러운 표현이 다르다.
 */
export function formatFieldValue(
  fieldName: string,
  raw: string | null | undefined,
  tz?: string,
): string {
  if (fieldName !== FIELD_ANOMALIES) return formatValue(raw, tz);
  const v = (raw ?? "").trim();
  if (!v || EMPTY_SENTINELS.has(v) || v === "(empty)") return "None";
  return formatAnomalyList(v);
}

export function formatTimeOnly(iso: string, tz?: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}
