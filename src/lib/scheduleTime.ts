/**
 * 스케줄 시간 datetime 인코딩 조립 — 단일/벌크 경로 공용.
 *
 * 서버 전환기 계약: schedules 는 벽시계 datetime(start_at/end_at "YYYY-MM-DDTHH:MM",
 * zone 없음) + 영업일 라벨(operating_day)을 저장한다. 이 헬퍼가 콘솔의 date + "HH:MM"
 * 입력을 그 형태로 변환한다. 드리프트 방지를 위해 여기 한 곳에서만 조립한다.
 */

/**
 * 스케줄 입력 단위 — **콘솔 전체에서 이 상수 하나** (D6-1, server SCHEDULE_STEP_MINUTES 와 같은 값).
 *
 * 표시 슬롯은 여전히 30분 행이다(D6-2). 블록 위치는 분 단위 overlap 계산이라
 * 5분 오프셋도 그대로 그려진다 — 그리드를 12행/시간으로 쪼개지 말 것.
 */
export const SCHEDULE_STEP_MINUTES = 5;

/** "YYYY-MM-DD" 에 n일 더하기 (UTC 기준 순수 날짜 산술). */
export function addDay(d: string, n: number): string {
  const [y, m, dd] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, dd + n)).toISOString().slice(0, 10);
}

/** "HH:MM" → 분. */
export function timeToMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/** 분 → "HH:MM". 0~1439 밖은 24시간으로 감아 **벽시계**로만 표기한다(D2-8: 24+ 표기 금지). */
export function minToTime(mins: number): string {
  const w = wrapMinutes(mins);
  return `${String(Math.floor(w / 60)).padStart(2, "0")}:${String(w % 60).padStart(2, "0")}`;
}

/** 하루(1440분) 안으로 감기. 음수도 정상 처리 — clampMinutes 로 23:59 에 붙여버리지 말 것. */
export function wrapMinutes(mins: number): number {
  return ((mins % 1440) + 1440) % 1440;
}

/** 자정을 몇 번 넘겼는지 (표기용 `+1` 의 숫자). 음수 입력은 0. */
export function offsetDaysOf(mins: number): number {
  return Math.max(0, Math.floor(mins / 1440));
}

/** "HH:MM" 이 입력 단위(5분) 위에 있는지. null/빈값은 통과(미입력은 여기서 판정하지 않음). */
export function isOnScheduleGrid(hhmm: string | null | undefined): boolean {
  if (!hhmm) return true;
  return timeToMin(hhmm) % SCHEDULE_STEP_MINUTES === 0;
}

/** 입력 단위로 반올림 스냅. **자동 계산된 값**을 옵션에 맞출 때만 쓴다(사용자 입력은 반올림하지 않고 거절). */
export function snapToStep(hhmm: string): string {
  if (!hhmm) return hhmm;
  return minToTime(Math.round(timeToMin(hhmm) / SCHEDULE_STEP_MINUTES) * SCHEDULE_STEP_MINUTES);
}

/** 하루치 "HH:MM" 옵션 (기본 5분 단위, 288개). 셀렉트 옵션 생성의 단일 출처. */
export function stepTimeOptions(step: number = SCHEDULE_STEP_MINUTES): string[] {
  const out: string[] = [];
  for (let m = 0; m < 1440; m += step) out.push(minToTime(m));
  return out;
}

/**
 * 자정 넘김 표기 — `02:00 +1` (D5-1).
 * **`26:00` 같은 24 초과 표기를 만들지 않는다** (D2-8 개정: 시각은 00:00~23:59 + 날짜 오프셋).
 */
export function formatWallClock(hhmm: string, offsetDays: number): string {
  return offsetDays > 0 ? `${hhmm} +${offsetDays}` : hhmm;
}

// ── 시작 / 종료 / 길이 3필드 (D5-2) ──────────────────────────
//
// 불변식은 하나뿐: **종료 = 시작 + 길이**.
//
// | 바꾼 값 | 유지 | 이동 |
// |---|---|---|
// | 시작 | 길이 | 종료 |
// | 종료 | 시작 | 길이 |
// | 길이 | 시작 | 종료 |
//
// **시작은 어떤 경우에도 자동으로 움직이지 않는다.** 예전 폼은 `endTimeDirtyRef` 같은
// 숨은 플래그로 "end 를 손댔는지"에 따라 결과가 달라져, 같은 조작이 어떤 때는 종료를 옮기고
// 어떤 때는 안 옮겼다. 플래그 없이 위 표만으로 결정한다.

export interface ShiftFields {
  /** 시작 벽시계 분 (0~1439). 시작 달력일은 별도(영업일 + 오프셋). */
  startMin: number;
  /** 근무 길이(분). 1440 까지 — 종료는 이 값으로만 결정된다. */
  durationMin: number;
}

/** 시작 변경 — 길이 유지, 종료가 따라 이동. */
export function withStart(prev: ShiftFields, startMin: number): ShiftFields {
  return { startMin: wrapMinutes(startMin), durationMin: prev.durationMin };
}

/**
 * 종료 변경 — 시작 유지, 길이가 재계산된다.
 * 종료가 시작보다 이르거나 같으면 다음날로 본다(자정 넘김). 같으면 0분이 되고,
 * 0분은 저장 단계에서 ZERO_DURATION 으로 걸러진다 — 여기서 임의로 24h 로 만들지 않는다.
 */
export function withEnd(prev: ShiftFields, endMin: number): ShiftFields {
  return { startMin: prev.startMin, durationMin: wrapMinutes(endMin - prev.startMin) };
}

/** 길이 변경 — 시작 유지, 종료가 따라 이동. */
export function withDuration(prev: ShiftFields, durationMin: number): ShiftFields {
  return { startMin: prev.startMin, durationMin };
}

/** 파생 종료 — 벽시계 시각 + 날짜 오프셋. 저장/표시 양쪽이 이걸 쓴다. */
export function endOf(f: ShiftFields): { time: string; offsetDays: number } {
  const abs = f.startMin + f.durationMin;
  return { time: minToTime(abs), offsetDays: offsetDaysOf(abs) };
}

/** 두 "YYYY-MM-DD" 사이 일수차 (to - from). DST 무관(UTC 순수 날짜 산술). */
export function dayDiff(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86400000);
}

/** end 시각이 start 이하이면 익일(자정 넘김). 시작 달력일 기준 end 달력일 반환. */
export function rollEndDate(startDate: string, startTime: string, endTime: string): string {
  return timeToMin(endTime) <= timeToMin(startTime) ? addDay(startDate, 1) : startDate;
}

/** 매장 영업일 경계 기본값(서버 day_start 기본과 동일). */
export const DEFAULT_DAY_START = "06:00";

/** stores.day_start_time JSONB 요일 키. Date.getUTCDay(): Sun=0. */
const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

/**
 * 그 날짜에 적용되는 매장 영업일 경계 "HH:MM".
 * 저장 형태는 `{all:"06:00"}` 또는 요일별 `{mon:"05:00", ...}` 두 가지다(매장 상세 화면 참조).
 * 미설정이면 DEFAULT_DAY_START — 서버 기본과 같아야 자동 판정이 서버와 어긋나지 않는다.
 */
export function dayStartFor(
  dayStartTime: Record<string, string> | null | undefined,
  dateStr: string,
): string {
  if (!dayStartTime) return DEFAULT_DAY_START;
  const [y, m, d] = dateStr.split("-").map(Number);
  const key = DAY_KEYS[new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1)).getUTCDay()]!;
  return dayStartTime[key] ?? dayStartTime.all ?? DEFAULT_DAY_START;
}

/** 날짜 UI가 없는 표면(벌크 그리드/키오스크)용 영업일 창 규칙 —
 * 경계 이전 새벽 시각은 달력상 영업일+1일. (서버 _kiosk_shift_iso와 동일 규칙) */
export function dawnStartOffset(startTime: string, boundary: string = DEFAULT_DAY_START): 0 | 1 {
  return timeToMin(startTime) < timeToMin(boundary) ? 1 : 0;
}

/**
 * 매장 설정을 반영한 시작일 오프셋 — 날짜 UI 없는 표면은 **반드시** 이걸 쓴다.
 *
 * `dawnStartOffset` 의 boundary 기본값(06:00)을 그대로 두면, 경계를 04:00 으로
 * 운영하는 매장에서 04~06시 시작 근무가 전부 "새벽조"로 오판돼 시작일이 다음날로
 * 밀린다. 그러면 서버(실제 경계 기준)가 START_AFTER_DAY_BOUNDARY 경고를 내고,
 * 단건 모달로는 멀쩡히 저장되는 근무가 벌크에서만 걸린다.
 */
export function storeStartOffset(
  startTime: string,
  dayStartTime: Record<string, string> | null | undefined,
  dateStr: string,
): 0 | 1 {
  return dawnStartOffset(startTime, dayStartFor(dayStartTime ?? null, dateStr));
}

/** 기존 스케줄의 start_at day-offset(영업일 라벨 대비, 0|1) — 새벽근무(+1d) 보존용. */
export function startOffsetDaysOf(s: { work_date: string; operating_day?: string | null; start_at?: string | null }): number {
  const label = s.operating_day ?? s.work_date;
  if (!s.start_at || !label) return 0;
  const d = dayDiff(label, s.start_at.slice(0, 10));
  return Math.max(0, Math.min(1, d));
}

export interface ShiftIsoFields {
  operating_day: string;
  start_at: string;
  end_at: string;
  break_start_at: string | null;
  break_end_at: string | null;
}

/**
 * 명시 start/end 달력일 + 시각 → 서버 전송용 datetime 필드.
 * break 는 start 시각보다 이르면 startDate 익일에 앵커(오버나이트 근무 내 브레이크).
 */
export function shiftIsoFields(
  operatingDay: string,
  startDate: string,
  startTime: string,
  endDate: string,
  endTime: string,
  breakStart: string | null,
  breakEnd: string | null,
): ShiftIsoFields {
  const breakStartAt = breakStart
    ? `${timeToMin(breakStart) < timeToMin(startTime) ? addDay(startDate, 1) : startDate}T${breakStart}`
    : null;
  const breakEndAt = breakEnd
    ? `${timeToMin(breakEnd) < timeToMin(startTime) ? addDay(startDate, 1) : startDate}T${breakEnd}`
    : null;
  return {
    operating_day: operatingDay,
    start_at: `${startDate}T${startTime}`,
    end_at: `${endDate}T${endTime}`,
    break_start_at: breakStartAt,
    break_end_at: breakEndAt,
  };
}
