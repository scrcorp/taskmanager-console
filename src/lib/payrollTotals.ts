/**
 * Payroll 합계 집계 — KPI 요약 행과 테이블 합계 footer 가 같은 값을 쓰도록
 * 한 곳에서 계산한다 (preview 행 / 동결 entry 공용).
 *
 * 돈 필드는 서버에서 Decimal 문자열("123.45")로 내려오므로 숫자로 환산해 더한다.
 * 표시용 집계일 뿐 원천은 서버 값이다 — 여기서 재계산한 값을 저장하지 않는다.
 */

/** 합계에 필요한 최소 필드 — PayrollTableRow / preview row / entry 모두 만족. */
export interface PayrollSummableRow {
  regular_minutes: number;
  ot_minutes: number;
  dt_minutes: number;
  penalty_pay: string;
  card_tips: string;
  gross_pay: string;
}

export interface PayrollTotals {
  regular_minutes: number;
  ot_minutes: number;
  dt_minutes: number;
  /** regular + ot + dt */
  total_minutes: number;
  penalty_pay: number;
  card_tips: number;
  gross_pay: number;
  /** 행 수 = 지급 대상 인원 */
  employees: number;
}

/** Decimal 문자열 → 숫자. 파싱 불가/누락은 0 (합계가 NaN 으로 오염되지 않게). */
function num(value: string | number | null | undefined): number {
  const n = typeof value === "string" ? Number(value) : (value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/* -------------------------------------------------------------------------- */
/*  일별 금액 — "이 날 실제 얼마인지 / 무엇으로 얼마인지"                      */
/* -------------------------------------------------------------------------- */

/** 그날 premium(penalty) 합계 계산에 필요한 최소 필드. */
export interface PenaltyLineLike {
  work_date: string;
  amount: string;
}

/** 일별 금액 계산에 필요한 최소 필드 (DayDetail 이 만족). */
export interface DayAmountFields {
  work_date: string;
  regular_amount?: string | null;
  ot_amount?: string | null;
  dt_amount?: string | null;
  total_amount?: string | null;
}

export interface DayAmountParts {
  regular: number;
  ot: number;
  dt: number;
  /** 그날 meal/rest premium(penalty) 합 — penalties[] 에서 유도한 파생값 */
  premium: number;
  /**
   * 그날 실지급액 = 근무 금액 + premium.
   * null = 일별 금액 필드가 없는 옛 동결본 (재계산하지 않고 "—" 로 표시).
   */
  total: number | null;
}

/**
 * penalty 목록 → 날짜별 합계.
 * 서버는 penalty 를 일 단위 라인으로 주므로 같은 날 여러 건이면 더한다.
 */
export function penaltyTotalsByDate(
  penalties: readonly PenaltyLineLike[],
): Map<string, number> {
  const byDate = new Map<string, number>();
  for (const p of penalties) {
    byDate.set(p.work_date, (byDate.get(p.work_date) ?? 0) + num(p.amount));
  }
  return byDate;
}

/**
 * 그날 금액 구성. premium 은 호출 측이 penaltyTotalsByDate 로 구해 넘긴다.
 *
 * total_amount 가 없으면(옛 동결본) premium 이 있어도 total 은 null —
 * 근무 금액을 모르는 채로 "이 날 얼마" 를 단정하지 않는다.
 */
export function dayAmountParts(
  day: DayAmountFields,
  premium: number,
): DayAmountParts {
  const hasAmounts = day.total_amount != null;
  return {
    regular: num(day.regular_amount),
    ot: num(day.ot_amount),
    dt: num(day.dt_amount),
    premium,
    total: hasAmounts ? num(day.total_amount) + premium : null,
  };
}

export interface DayAmountsTotals {
  regular_minutes: number;
  ot_minutes: number;
  dt_minutes: number;
  premium: number;
  /** 일별 금액을 가진 날이 하나도 없으면 null */
  total: number | null;
}

/** 일별 표의 합계 행 — 시간 합 + Day total 합 (premium 포함). */
export function sumDayAmounts(
  days: readonly (DayAmountFields & {
    regular_minutes: number;
    ot_minutes: number;
    dt_minutes: number;
  })[],
  penalties: readonly PenaltyLineLike[],
): DayAmountsTotals {
  const byDate = penaltyTotalsByDate(penalties);
  const totals: DayAmountsTotals = {
    regular_minutes: 0,
    ot_minutes: 0,
    dt_minutes: 0,
    premium: 0,
    total: null,
  };
  let amountSum = 0;
  let anyAmount = false;

  for (const d of days) {
    totals.regular_minutes += d.regular_minutes;
    totals.ot_minutes += d.ot_minutes;
    totals.dt_minutes += d.dt_minutes;
    if (d.total_amount != null) {
      anyAmount = true;
      amountSum += num(d.total_amount);
    }
  }
  // premium 은 일별 표에 없는 날짜에 걸려 있어도 기간 합계에는 들어간다
  for (const value of byDate.values()) totals.premium += value;

  totals.total = anyAmount ? amountSum + totals.premium : null;
  return totals;
}

export function sumPayrollRows(
  rows: readonly PayrollSummableRow[],
): PayrollTotals {
  const totals: PayrollTotals = {
    regular_minutes: 0,
    ot_minutes: 0,
    dt_minutes: 0,
    total_minutes: 0,
    penalty_pay: 0,
    card_tips: 0,
    gross_pay: 0,
    employees: rows.length,
  };
  for (const r of rows) {
    totals.regular_minutes += r.regular_minutes;
    totals.ot_minutes += r.ot_minutes;
    totals.dt_minutes += r.dt_minutes;
    totals.penalty_pay += num(r.penalty_pay);
    totals.card_tips += num(r.card_tips);
    totals.gross_pay += num(r.gross_pay);
  }
  totals.total_minutes =
    totals.regular_minutes + totals.ot_minutes + totals.dt_minutes;
  return totals;
}
