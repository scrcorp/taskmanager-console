/**
 * Payroll 표시 포맷 헬퍼 — 기간 라벨 / 금액 / 분→시간 변환.
 *
 * 반월(semi-monthly) 기간은 서버(pay_periods)가 원천이고, 여기는 표시만 담당.
 */

const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** "2026-08-01" + "2026-08-15" → "Aug 1–15, 2026" (월이 다르면 풀 표기). */
export function payrollPeriodLabel(start: string, end: string): string {
  const [sy, sm, sd] = start.split("-").map(Number);
  const [ey, em, ed] = end.split("-").map(Number);
  const sMon = MONTH_SHORT[(sm ?? 1) - 1];
  const eMon = MONTH_SHORT[(em ?? 1) - 1];
  if (sy === ey && sm === em) {
    return `${sMon} ${sd}–${ed}, ${sy}`;
  }
  if (sy === ey) {
    return `${sMon} ${sd} – ${eMon} ${ed}, ${sy}`;
  }
  return `${sMon} ${sd}, ${sy} – ${eMon} ${ed}, ${ey}`;
}

/** "2026-08-03" → "Aug 3" */
export function payrollShortDate(dateStr: string): string {
  const [, m, d] = dateStr.split("-").map(Number);
  return `${MONTH_SHORT[(m ?? 1) - 1]} ${d}`;
}

/** 주는 일요일 시작 (프로젝트 관례 Sun→Sat). */
export const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * "YYYY-MM-DD" → 로컬 Date.
 * new Date("2026-08-03") 는 UTC 자정 파싱이라 음수 오프셋 지역에서 하루 밀린다.
 */
export function parseYmd(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

/** "2026-08-03" → "Mon" */
export function payrollWeekday(dateStr: string): string {
  return WEEKDAY_SHORT[parseYmd(dateStr).getDay()];
}

/** "2026-08-03" → "Aug 3 (Mon)" — OT 가 무슨 요일에 났는지 바로 보이게. */
export function payrollDayLabel(dateStr: string): string {
  return `${payrollShortDate(dateStr)} (${payrollWeekday(dateStr)})`;
}

/** 금액 표시 — $ + 천단위 콤마 + 2dp. Decimal 은 문자열로 내려오므로 둘 다 수용. */
export function money(value: string | number | null | undefined): string {
  const n = typeof value === "string" ? Number(value) : (value ?? 0);
  const safe = Number.isFinite(n) ? n : 0;
  const abs = Math.abs(safe).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${safe < 0 ? "-" : ""}$${abs}`;
}

/**
 * 그날 근무/휴게 벽시계 한 줄 — "Worked 09:00–15:30 · Meal 12:00–12:30 · Rest 10:30".
 *
 * 서버 pay_stub_pdf.worked_times_line 과 같은 구성 (명세서와 화면이 같은 문장을
 * 읽히게): 무급 식사는 구간 그대로, 유급 휴게는 시작 시각만 — 10분짜리 종료
 * 시각은 노이즈다. 미퇴근이면 "09:00–".
 *
 * 기록이 없으면 빈 문자열 (옛 동결본·전기 frozen 소스 일자) → 호출 측이 생략.
 */
export function workedTimesLine(day: {
  shifts?: { start: string; end?: string | null }[] | null;
  breaks?: { start: string; end?: string | null; type: string }[] | null;
}): string {
  const parts: string[] = [];

  const worked = (day.shifts ?? []).map((s) =>
    s.end ? `${s.start}–${s.end}` : `${s.start}–`,
  );
  if (worked.length > 0) parts.push(`Worked ${worked.join(", ")}`);

  const breaks = day.breaks ?? [];
  const meals = breaks
    .filter((b) => b.type === "unpaid_meal")
    .map((b) => (b.end ? `${b.start}–${b.end}` : b.start));
  if (meals.length > 0) parts.push(`Meal ${meals.join(", ")}`);

  const rests = breaks
    .filter((b) => b.type !== "unpaid_meal")
    .map((b) => b.start);
  if (rests.length > 0) parts.push(`Rest ${rests.join(", ")}`);

  return parts.join(" · ");
}

/**
 * 그날 금액 구성 한 줄 — "Regular $104.00 · OT $13.00 · Premium $36.00".
 *
 * 0 인 항목은 생략(그날 없던 분류를 $0.00 로 늘어놓지 않는다), 전부 0 이면 빈
 * 문자열. 순서·구분자는 급여명세서와 동일하게 Regular → OT → DT → Premium.
 */
export function dayAmountLine(parts: {
  regular: number;
  ot: number;
  dt: number;
  premium: number;
}): string {
  const line: string[] = [];
  const push = (label: string, value: number): void => {
    if (value !== 0) line.push(`${label} ${money(value)}`);
  };
  push("Regular", parts.regular);
  push("OT", parts.ot);
  push("DT", parts.dt);
  push("Premium", parts.premium);
  return line.join(" · ");
}

/** 분 → "80h 30m" (0 → "0h", 60 배수는 "8h"). */
export function minutesToHours(minutes: number): string {
  if (!minutes) return "0h";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}
