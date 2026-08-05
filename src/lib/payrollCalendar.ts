/**
 * Payroll 일별 상세의 캘린더(주 단위) 뷰 데이터 구성.
 *
 * 목적: "이 기간 시작 전에 이미 그 주 40시간을 채워서 OT 가 났다" 같은 상황이
 * 표로는 안 보인다. 주(일→토) 격자에 기간 내 날짜 + 직전 기간 컨텍스트 날짜를
 * 함께 놓아 주 단위 누적을 한눈에 보이게 한다.
 *
 * 여기서는 배치만 한다 — OT/DT 분류는 서버 계산 결과를 그대로 표시할 뿐,
 * 임계값을 다시 판단하지 않는다.
 */

import { parseYmd } from "./payrollFormat";
import type { ContextDay, DayDetail } from "@/types/payroll";

/** Date → "YYYY-MM-DD" (로컬 기준). */
function toYmd(date: Date): string {
  const pad = (n: number): string => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** n 일 뒤 날짜 문자열 (음수면 이전). */
export function addDays(dateStr: string, n: number): string {
  const d = parseYmd(dateStr);
  d.setDate(d.getDate() + n);
  return toYmd(d);
}

/** 그 날이 속한 주의 일요일 (Sun→Sat 관례). */
export function weekStartOf(dateStr: string): string {
  const d = parseYmd(dateStr);
  d.setDate(d.getDate() - d.getDay());
  return toYmd(d);
}

export interface CalendarDay {
  date: string;
  /** false = 직전 기간 컨텍스트 (주간 OT 산정에만 포함, 지급은 이전 기간) */
  inPeriod: boolean;
  regular_minutes: number;
  ot_minutes: number;
  dt_minutes: number;
  total_minutes: number;
  /** 기간 내 날짜의 그날 금액 (없거나 옛 데이터면 null) */
  total_amount: string | null;
}

export interface CalendarWeek {
  /** 그 주 일요일 */
  start: string;
  /** 7칸 (일→토). 근무 기록이 없는 칸은 null */
  days: (CalendarDay | null)[];
  /** 그 주 총 근무 시간 (컨텍스트 날짜 포함) — straight 누적 */
  total_minutes: number;
  /** 그 주에 OT/DT 로 분류된 시간이 있는지 (서버 분류 기준) */
  hasPremium: boolean;
}

function dayFromDetail(d: DayDetail): CalendarDay {
  return {
    date: d.work_date,
    inPeriod: true,
    regular_minutes: d.regular_minutes,
    ot_minutes: d.ot_minutes,
    dt_minutes: d.dt_minutes,
    total_minutes: d.regular_minutes + d.ot_minutes + d.dt_minutes,
    total_amount: d.total_amount ?? null,
  };
}

function dayFromContext(c: ContextDay): CalendarDay {
  return {
    date: c.work_date,
    inPeriod: false,
    regular_minutes: 0,
    ot_minutes: 0,
    dt_minutes: 0,
    total_minutes: c.net_minutes,
    total_amount: null,
  };
}

/** pay period 범위 (YYYY-MM-DD, end 포함). */
export interface PeriodRange {
  start: string;
  end: string;
}

/**
 * 기간 내 일별 + 직전 기간 컨텍스트 → 주 단위 격자.
 *
 * range 를 주면 그 기간이 걸친 모든 주(첫 주 일요일 ~ 마지막 주 토요일)를
 * 근무가 하나도 없어도 만든다 — 캘린더가 기간 전체를 보여줘야 "이 주는 아예
 * 안 나왔다" 도 읽히기 때문. range 밖이라도 데이터(직전 기간 컨텍스트 등)가
 * 있는 주는 그대로 포함된다.
 */
export function buildPayrollWeeks(
  days: readonly DayDetail[],
  contextDays: readonly ContextDay[] = [],
  range?: PeriodRange,
): CalendarWeek[] {
  const byDate = new Map<string, CalendarDay>();
  // 컨텍스트를 먼저 넣고 기간 내 날짜로 덮어쓴다 (같은 날짜면 기간 내가 우선)
  for (const c of contextDays) byDate.set(c.work_date, dayFromContext(c));
  for (const d of days) byDate.set(d.work_date, dayFromDetail(d));

  const weeks = new Map<string, CalendarWeek>();
  const ensureWeek = (start: string): CalendarWeek => {
    let week = weeks.get(start);
    if (!week) {
      week = {
        start,
        days: [null, null, null, null, null, null, null],
        total_minutes: 0,
        hasPremium: false,
      };
      weeks.set(start, week);
    }
    return week;
  };

  // 기간 전체 주를 먼저 깔아둔다 (근무 없는 주도 빈 격자로 남게)
  if (range) {
    const lastWeek = weekStartOf(range.end);
    for (
      let w = weekStartOf(range.start);
      w <= lastWeek;
      w = addDays(w, 7)
    ) {
      ensureWeek(w);
    }
  }

  for (const day of byDate.values()) {
    const week = ensureWeek(weekStartOf(day.date));
    week.days[parseYmd(day.date).getDay()] = day;
    week.total_minutes += day.total_minutes;
    if (day.ot_minutes > 0 || day.dt_minutes > 0) week.hasPremium = true;
  }

  return [...weeks.values()].sort((a, b) => a.start.localeCompare(b.start));
}
