/**
 * 스케줄 검증 에러/경고 코드 — **콘솔 측 단일 출처** (server `app/core/schedule_codes.py` 의 짝).
 *
 * 계약 (D9)
 * ---------
 *     400  {code:"SCHEDULE_INVALID",              message, errors:[{code,params}], warnings:[...]}
 *     409  {code:"SCHEDULE_WARNINGS_UNCONFIRMED", message, warnings:[{code,params}], retry:{force:true}}
 *
 * - **문구는 클라이언트가 code + params 로 만든다.** `message` 는 구버전 fallback 전용이고
 *   서버 문장이 바뀌면 조용히 깨지므로 `detail.includes("overlap")` 같은 매칭을 하지 않는다.
 *   (과거 체크리스트 재설정 흐름이 `/reset_checklist=true/` 정규식으로 분기했다가
 *    서버 문구가 바뀔 때마다 함께 고쳐야 했던 전례가 있다.)
 * - 코드 문자열은 이 파일 밖에서 리터럴로 쓰지 않는다. 3-repo 가 같은 목록을 들고 있어야 해서
 *   흩뿌려지면 diff 로 정합성을 확인할 수 없다.
 *
 * 409 는 이미 세 의미로 점유돼 있다 — `pay_period_locked` / `store_closed` / `pin_conflict`.
 * **status 만 보고 확인 모달을 띄우면 급여 잠금에도 "Save anyway" 가 뜬다.**
 * 그래서 식별은 반드시 **최상위 `code`** 로 한다.
 */

// ── 응답 최상위 코드 ────────────────────────────────────────

export const SCHEDULE_INVALID = "SCHEDULE_INVALID";
export const SCHEDULE_WARNINGS_UNCONFIRMED = "SCHEDULE_WARNINGS_UNCONFIRMED";

// ── 에러 (차단, force 로도 못 넘음) ─────────────────────────

export const ZERO_DURATION = "ZERO_DURATION";
export const START_DATE_OUT_OF_WINDOW = "START_DATE_OUT_OF_WINDOW";
export const USER_NOT_IN_STORE = "USER_NOT_IN_STORE";
export const USER_NOT_MARKED_FOR_STORE = "USER_NOT_MARKED_FOR_STORE";
export const TIME_NOT_ON_GRID = "TIME_NOT_ON_GRID";
export const BREAK_PAIR_INCOMPLETE = "BREAK_PAIR_INCOMPLETE";
export const BREAK_REVERSED = "BREAK_REVERSED";
export const BREAK_OUTSIDE_SHIFT = "BREAK_OUTSIDE_SHIFT";
export const PAY_PERIOD_LOCKED = "PAY_PERIOD_LOCKED";

// ── 경고 (확인 후 진행) ─────────────────────────────────────

export const OVERLAPPING_SCHEDULE = "OVERLAPPING_SCHEDULE";
export const SHIFT_TOO_LONG = "SHIFT_TOO_LONG";
export const WEEKLY_OVERTIME = "WEEKLY_OVERTIME";
export const START_AFTER_DAY_BOUNDARY = "START_AFTER_DAY_BOUNDARY";
export const START_BEFORE_DAY_BOUNDARY = "START_BEFORE_DAY_BOUNDARY";
export const STORE_CLOSED_DAY = "STORE_CLOSED_DAY";
export const OPERATING_DAY_OVERRIDDEN = "OPERATING_DAY_OVERRIDDEN";

/** 검증 항목 하나 — 서버 `ScheduleIssue` 와 동일 형태. */
export interface ScheduleIssue {
  code: string;
  params?: Record<string, unknown>;
}

// ── code + params → 사용자 문구 ─────────────────────────────

function minutesText(raw: unknown): string {
  const n = Number(raw);
  if (!Number.isFinite(n)) return String(raw ?? "");
  const h = Math.floor(n / 60);
  const m = n % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** "YYYY-MM-DDTHH:MM" 또는 "HH:MM" → 표시용 시각. 파싱 실패는 원문 그대로. */
function timeText(raw: unknown): string {
  const s = String(raw ?? "");
  const m = /(\d{2}):(\d{2})/.exec(s);
  return m ? `${m[1]}:${m[2]}` : s;
}

/**
 * 한 항목의 사용자 문구. **알 수 없는 코드도 반드시 무언가를 반환한다** —
 * 서버가 새 코드를 먼저 배포해도 사용자가 빈 모달을 보지 않도록.
 */
export function describeScheduleIssue(issue: ScheduleIssue): string {
  const p = issue.params ?? {};
  switch (issue.code) {
    case ZERO_DURATION:
      return "The shift is 0 minutes long. Set an end time after the start.";
    case START_DATE_OUT_OF_WINDOW:
      return `The start date (${p.start_date ?? "?"}) must be the operating day (${p.operating_day ?? "?"}) or the day after.`;
    case USER_NOT_IN_STORE:
      return "This employee is not assigned to this store.";
    case USER_NOT_MARKED_FOR_STORE:
      return "This employee is not marked for work at this store. Enable “Work” in their store assignments first.";
    case TIME_NOT_ON_GRID:
      return `${p.field ?? "Time"} (${timeText(p.value)}) must be in ${p.step_minutes ?? "5"}-minute increments.`;
    case BREAK_PAIR_INCOMPLETE:
      return "Break start and end must be set together.";
    case BREAK_REVERSED:
      return "The break ends before it starts.";
    case BREAK_OUTSIDE_SHIFT:
      return `The break (${timeText(p.break_start_at)}–${timeText(p.break_end_at)}) falls outside the shift. Move or clear the break.`;
    case PAY_PERIOD_LOCKED:
      return p.direction === "out_of"
        ? `${p.work_date ?? "This date"} is in a locked pay period, so the shift cannot be moved out of it.`
        : `${p.work_date ?? "This date"} is in a locked pay period.`;
    case OVERLAPPING_SCHEDULE:
      return "This employee already has another shift overlapping these times.";
    case SHIFT_TOO_LONG:
      return `The shift is ${minutesText(p.net_minutes)}, longer than the ${p.limit_hours ?? "?"}h limit.`;
    case WEEKLY_OVERTIME:
      return `Weekly hours reach ${minutesText(p.total_minutes)}, over the ${minutesText(p.limit_minutes)} limit.`;
    case START_AFTER_DAY_BOUNDARY:
      return `The start (${p.start_date ?? "?"}) is at or after the store's day boundary ${timeText(p.boundary)}, so it may belong to the next operating day.`;
    case START_BEFORE_DAY_BOUNDARY:
      return `The start (${p.start_date ?? "?"}) is before the store's day boundary ${timeText(p.boundary)}, so it may belong to the previous operating day.`;
    case STORE_CLOSED_DAY:
      return `The store is closed on ${p.weekday ?? "this day"}.`;
    case OPERATING_DAY_OVERRIDDEN:
      return `The operating day is set to ${p.chosen ?? "?"} instead of the automatic ${p.auto ?? "?"}.`;
    default:
      // 알 수 없는 코드 — 사람이 읽을 수 있게 코드라도 보여준다(빈 모달 방지).
      return issue.code;
  }
}

/** 여러 항목을 한 덩어리 문구로. 모달 message 는 개행 그대로 렌더된다. */
export function describeScheduleIssues(issues: ScheduleIssue[]): string {
  return issues.map((i) => `• ${describeScheduleIssue(i)}`).join("\n");
}

// ── 응답 파싱 ───────────────────────────────────────────────

/** 스케줄 저장 실패의 성격. `other` 는 이 계약 밖(권한/네트워크/기존 409들). */
export type ScheduleFailureKind = "invalid" | "warnings_unconfirmed" | "other";

export interface ScheduleFailure {
  kind: ScheduleFailureKind;
  errors: ScheduleIssue[];
  warnings: ScheduleIssue[];
}

function issueList(raw: unknown): ScheduleIssue[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((i): i is Record<string, unknown> => !!i && typeof i === "object")
    .filter((i) => typeof i.code === "string")
    .map((i) => ({ code: i.code as string, params: (i.params ?? {}) as Record<string, unknown> }));
}

/**
 * axios 에러에서 D9 계약 본문을 꺼낸다. 계약이 아니면 `other`.
 *
 * FastAPI 는 `HTTPException(detail=<dict>)` 를 `{detail: {...}}` 로 감싸므로 한 겹 벗긴다.
 * status 는 보지 않는다 — **식별은 최상위 `code`**(같은 409 를 급여 잠금이 이미 쓴다).
 */
export function parseScheduleFailure(err: unknown): ScheduleFailure {
  const none: ScheduleFailure = { kind: "other", errors: [], warnings: [] };
  if (!err || typeof err !== "object" || !("response" in err)) return none;
  const data = (err as { response?: { data?: unknown } }).response?.data;
  if (!data || typeof data !== "object") return none;
  const detail = (data as Record<string, unknown>).detail;
  const body = (detail && typeof detail === "object" ? detail : data) as Record<string, unknown>;
  const code = body.code;
  if (code !== SCHEDULE_INVALID && code !== SCHEDULE_WARNINGS_UNCONFIRMED) return none;
  return {
    kind: code === SCHEDULE_INVALID ? "invalid" : "warnings_unconfirmed",
    errors: issueList(body.errors),
    warnings: issueList(body.warnings),
  };
}

/** 경고 확인 대기 409 인가. 자동 에러 모달을 건너뛸지 판단하는 데 쓴다. */
export function isScheduleWarningConflict(err: unknown): boolean {
  return parseScheduleFailure(err).kind === "warnings_unconfirmed";
}
