/**
 * Payroll v1 타입 — 서버 app/schemas/payroll.py 계약과 1:1 동기화.
 *
 * 돈(Decimal) 필드는 JSON 직렬화 시 문자열("123.45")로 내려온다.
 * 날짜는 "YYYY-MM-DD", 시각은 ISO datetime 문자열.
 */

// ── Validation / gate codes (서버 VALIDATION_* / GATE_* 상수와 동일) ──
export const PAYROLL_GATE = {
  RATE_MISSING: "rate_missing",
  BELOW_MINIMUM_WAGE: "below_minimum_wage",
  OPEN_SHIFT: "open_shift",
  UNCONFIRMED_AUTO_CLOCKOUT: "unconfirmed_auto_clockout",
  TIP_PERIOD_NOT_CONFIRMED: "tip_period_not_confirmed",
  MULTI_STORE_WEEK: "multi_store_week",
} as const;

export type PayrollGateCode = (typeof PAYROLL_GATE)[keyof typeof PAYROLL_GATE];

// ── confirm 409 detail.code (서버 CODE_* 상수와 동일) ──
export const PAYROLL_ERROR_CODES = {
  CLOSE_GATES_FAILED: "payroll_close_gates_failed",
  ALREADY_CONFIRMED: "pay_period_already_confirmed",
} as const;

export interface PayPeriod {
  id: string;
  organization_id: string;
  store_id: string;
  /** YYYY-MM-DD */
  start_date: string;
  /** YYYY-MM-DD (inclusive) */
  end_date: string;
  status: "open" | "confirmed";
  confirmed_at: string | null;
  confirmed_by: string | null;
  override_reason: string | null;
  /** 대응 tip_period.status. null = tip period 미생성. */
  tip_period_status: string | null;
}

export interface RateSegment {
  rate: string;
  regular_minutes: number;
  ot_minutes: number;
  dt_minutes: number;
  amount: string;
}

/**
 * 그날 근무 1건의 벽시계 구간 — store-tz "HH:MM" (자정 넘겨도 시:분만).
 * end = null/미존재 이면 미퇴근.
 */
export interface WorkedShift {
  start: string;
  end?: string | null;
}

/** 그날 휴게 1건 — 벽시계 + 종류(유/무급 구분 표시용). */
export interface WorkedBreak {
  start: string;
  end?: string | null;
  /** paid_10min | unpaid_meal */
  type: string;
}

export interface DayDetail {
  work_date: string;
  regular_minutes: number;
  ot_minutes: number;
  dt_minutes: number;
  /** null = rate 미상 (게이트 대상) */
  applied_rate: string | null;
  /**
   * 일별 금액 — 표시 전용 additive 필드 (서버 calc_version=1 유지).
   * 이 필드가 없던 시절 동결된 breakdown 에는 아예 없다(undefined) → "—" 로 표시.
   * canonical 금액은 여전히 segments + 스칼라 컬럼이며, 일별 금액은 하루 단위
   * 반올림이라 합계가 segment 합과 센트 단위로 어긋날 수 있다.
   */
  regular_amount?: string | null;
  ot_amount?: string | null;
  dt_amount?: string | null;
  /** 위 3개의 합 — 그날 근무로 받는 금액 (penalty/카드팁 제외) */
  total_amount?: string | null;
  /**
   * 그날 실제 근무/휴게 벽시계 — 금액과 같은 additive 선택 필드.
   * 옛 동결본·전기 frozen 소스 일자는 빈 목록 (재계산하지 않는다).
   */
  shifts?: WorkedShift[];
  breaks?: WorkedBreak[];
}

/**
 * 직전 기간 컨텍스트 날짜 — 기간 경계에 걸친 주(straddle week)에서 주간 OT
 * 산정에는 포함되지만 지급은 이전 기간에 끝난 날.
 * 서버 additive optional 필드라 옛 동결 breakdown 에는 없다.
 */
export interface ContextDay {
  work_date: string;
  net_minutes: number;
  /** true = 그 날 급여는 직전 기간에 이미 지급됨 */
  paid_in_prior: boolean;
}

export interface PenaltyLine {
  work_date: string;
  /** meal_penalty | rest_penalty */
  kind: string;
  reason: string;
  amount: string;
}

export interface EntryBreakdown {
  calc_version: number;
  segments: RateSegment[];
  days: DayDetail[];
  /** straddle 주의 직전 기간 날짜 — 서버 additive optional (없으면 표시 생략) */
  context_days?: ContextDay[];
  penalties: PenaltyLine[];
  tip_period_id: string | null;
  sources: Record<string, unknown> | null;
}

export interface PreviewValidation {
  code: string;
  message: string;
  user_id: string | null;
}

export interface PayrollPreviewRow {
  user_id: string;
  member_name: string;
  empid: number | null;
  crewid: number | null;
  regular_minutes: number;
  ot_minutes: number;
  dt_minutes: number;
  regular_pay: string;
  ot_pay: string;
  dt_pay: string;
  penalty_pay: string;
  card_tips: string;
  gross_pay: string;
  breakdown: EntryBreakdown;
  validations: PreviewValidation[];
}

export interface ValidationSummaryItem {
  code: string;
  count: number;
}

export interface PeriodPreviewResponse {
  period: PayPeriod;
  rows: PayrollPreviewRow[];
  validations_summary: ValidationSummaryItem[];
}

export interface PayrollEntry {
  id: string;
  pay_period_id: string;
  user_id: string | null;
  org_member_id: string | null;
  empid: number | null;
  crewid: number | null;
  member_name: string;
  revision: number;
  regular_minutes: number;
  ot_minutes: number;
  dt_minutes: number;
  regular_pay: string;
  ot_pay: string;
  dt_pay: string;
  penalty_pay: string;
  card_tips: string;
  gross_pay: string;
  calc_version: number;
  breakdown: EntryBreakdown;
  created_at: string;
}

export interface PeriodConfirmResponse {
  period: PayPeriod;
  entries: PayrollEntry[];
  events_frozen: number;
}

export interface PeriodEntriesResponse {
  period: PayPeriod;
  entries: PayrollEntry[];
}

export interface ConfirmGateItem {
  user_id: string | null;
  member_name: string | null;
  dates: string[];
  message: string;
}

export interface ConfirmGateFailure {
  /** VALIDATION_* 또는 multi_store_week */
  gate: string;
  message: string;
  items: ConfirmGateItem[];
}

export type EventAttribution = "staff" | "management";

export interface PayrollEvent {
  id: string;
  user_id: string | null;
  member_name: string | null;
  attendance_id: string | null;
  work_date: string;
  /** meal_penalty | rest_penalty | ... */
  kind: string;
  reason: string;
  attribution: EventAttribution | null;
  tagged_by: string | null;
  tagged_at: string | null;
  voided_at: string | null;
  pay_period_id: string | null;
  /** pay_period_id 부여 = 동결 (태깅 불가) */
  frozen: boolean;
  created_at: string;
}

/** 확정본/draft 명세서 메타의 공통 필드. */
interface PayStubMetaBase {
  pay_period_id: string;
  filename: string;
  size_bytes: number | null;
  generated_at: string;
}

/**
 * 확정 entry 명세서 (PayStubResponse) — 파일로 저장되므로 entry_id/file_id 를
 * 준다. 경로/URL 은 서버가 의도적으로 미노출 (다운로드는 인증된 GET 이 서빙).
 */
export interface EntryPayStubMeta extends PayStubMetaBase {
  entry_id: string;
  file_id: string;
  /** 확정본 응답에는 이 필드가 없다 (draft 판별용) */
  draft?: false;
}

/**
 * 미확정 기간 draft (DraftPayStubResponse) — 저장하지 않고 요청마다 다시
 * 만들기 때문에 entry_id/file_id 가 없고, 대상 직원과 draft 표식이 온다.
 */
export interface DraftPayStubMeta extends PayStubMetaBase {
  user_id: string;
  draft: true;
}

/** 두 stub 응답의 합집합 — `meta.draft === true` 로 좁힌다. */
export type PayStubMeta = EntryPayStubMeta | DraftPayStubMeta;
