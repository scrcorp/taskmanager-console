/**
 * 스케줄 시간 datetime 인코딩 조립 — 단일/벌크 경로 공용.
 *
 * 서버 전환기 계약: schedules 는 벽시계 datetime(start_at/end_at "YYYY-MM-DDTHH:MM",
 * zone 없음) + 영업일 라벨(operating_day)을 저장한다. 이 헬퍼가 콘솔의 date + "HH:MM"
 * 입력을 그 형태로 변환한다. 드리프트 방지를 위해 여기 한 곳에서만 조립한다.
 */

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

/** 날짜 UI가 없는 표면(벌크 그리드/키오스크)용 영업일 창 규칙 —
 * 경계 이전 새벽 시각은 달력상 영업일+1일. (서버 _kiosk_shift_iso와 동일 규칙) */
export function dawnStartOffset(startTime: string, boundary: string = DEFAULT_DAY_START): 0 | 1 {
  return timeToMin(startTime) < timeToMin(boundary) ? 1 : 0;
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
