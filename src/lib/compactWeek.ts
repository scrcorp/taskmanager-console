/**
 * 간소화 콘솔 주간 스트립용 날짜 계산.
 *
 * 주는 항상 일요일 시작(Sun→Sat). 모든 계산은 UTC 순수 날짜 산술이라 DST/로컬 tz 영향을 안 받는다.
 */

import { addDay } from "./scheduleTime";

/** "YYYY-MM-DD" 의 요일 (0=Sun … 6=Sat). */
export function dayOfWeek(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** 해당 날짜가 속한 주의 일요일. */
export function weekStart(date: string): string {
  return addDay(date, -dayOfWeek(date));
}

/** 해당 날짜가 속한 주의 7일 (일→토). */
export function weekDays(date: string): string[] {
  const start = weekStart(date);
  return Array.from({ length: 7 }, (_, i) => addDay(start, i));
}

export const WEEKDAY_LABELS = ["S", "M", "T", "W", "T", "F", "S"] as const;

/** 값이 없을 때 쓰는 표기 — dev 의 Activity History 규약과 통일 ("-" 로 얼버무리지 않는다). */
export const NOT_SET = "Not set";

/**
 * 벽시계 datetime "YYYY-MM-DDTHH:MM" → "9:00 AM".
 * 문자열을 그대로 읽는다 — Date 로 파싱하면 브라우저 로컬 tz 가 끼어들어 매장 시각이 어긋난다.
 */
export function formatWallClock(iso: string | null | undefined): string {
  if (!iso) return NOT_SET;
  const hhmm = iso.slice(11, 16);
  if (!/^\d{2}:\d{2}$/.test(hhmm)) return NOT_SET;
  const [h, m] = hhmm.split(":").map(Number);
  const period = h < 12 ? "AM" : "PM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${period}`;
}

/** "YYYY-MM-DD" → "Mon, Aug 11" 같은 표시용 라벨. */
export function formatDayLabel(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}
