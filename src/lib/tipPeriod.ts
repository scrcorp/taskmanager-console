/**
 * 팁 반월 사이클 유틸 — 1-15 / 16-EOM 자동 계산.
 *
 * Stage A: 사이클 확정/잠금은 아직 없음. 매니저가 검토용으로 기간만 선택.
 * Stage B 에서 tip_periods 테이블 + 확정 흐름 추가 예정.
 */

export interface TipPeriod {
  /** YYYY-MM-DD */
  start: string;
  /** YYYY-MM-DD (inclusive) */
  end: string;
  /** Display label, e.g. "Apr 1 – Apr 15, 2026" */
  label: string;
  /** "first" (1-15) 또는 "second" (16-EOM) */
  half: "first" | "second";
}

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

function fmt(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function lastDayOfMonth(year: number, month0: number): number {
  return new Date(year, month0 + 1, 0).getDate();
}

/** 주어진 날짜가 속한 반월 사이클 반환. */
export function periodOf(date: Date): TipPeriod {
  const y = date.getFullYear();
  const m = date.getMonth();
  const d = date.getDate();
  if (d <= 15) {
    const start = new Date(y, m, 1);
    const end = new Date(y, m, 15);
    return {
      start: fmt(start),
      end: fmt(end),
      label: `${MONTH_SHORT[m]} 1 – ${MONTH_SHORT[m]} 15, ${y}`,
      half: "first",
    };
  }
  const eom = lastDayOfMonth(y, m);
  const start = new Date(y, m, 16);
  const end = new Date(y, m, eom);
  return {
    start: fmt(start),
    end: fmt(end),
    label: `${MONTH_SHORT[m]} 16 – ${MONTH_SHORT[m]} ${eom}, ${y}`,
    half: "second",
  };
}

/** 현재 사이클 + 직전 N개 사이클 (현재 포함). */
export function recentPeriods(count: number = 6): TipPeriod[] {
  const out: TipPeriod[] = [];
  const now = new Date();
  let cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  for (let i = 0; i < count; i++) {
    const p = periodOf(cursor);
    out.push(p);
    // 다음 iteration 은 직전 사이클로 이동 — start 의 하루 전.
    const startD = new Date(p.start);
    cursor = new Date(startD.getFullYear(), startD.getMonth(), startD.getDate() - 1);
  }
  return out;
}

/** 사이클 내 일자 배열 (start ~ end inclusive). */
export function daysOfPeriod(period: TipPeriod): string[] {
  const out: string[] = [];
  const start = new Date(period.start);
  const end = new Date(period.end);
  const cursor = new Date(start);
  while (cursor <= end) {
    out.push(fmt(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return out;
}
