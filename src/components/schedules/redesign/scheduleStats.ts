/**
 * 스케줄 통계용 순수 헬퍼 — 컴포넌트에서 분리하여 단위 테스트 가능하게 함.
 *  - hourOccupancy: 일간 시간대별 0.5인 환산 (30분 grid → 0/0.5/1)
 *  - fmtTeam: TEAM 숫자 표시 (0.5 grid 스냅)
 *  - isOn30Grid: 30분 단위 검증 (등록 모달 / 서버 reject 와 동일 규칙)
 */

const SCHEDULE_STEP_MIN = 30;

/** "HH:MM" → 시간 단위 float. null/빈값은 0. */
function parseTimeToHours(t: string | null | undefined): number {
  if (!t) return 0;
  const [hh, mm] = t.split(":");
  return (Number.parseInt(hh ?? "0", 10) || 0) + (Number.parseInt(mm ?? "0", 10) || 0) / 60;
}

/**
 * 영업일 축 위의 절대 시작/종료 시각(시간 단위 float).
 * startOffsetDays: 새벽 근무(+1d, start_at 날짜 = 영업일+1)의 달력일 오프셋.
 *   +1d 새벽 01:00 은 당일 아침 1시가 아니라 영업일 축의 25시(1A+1)에 위치한다.
 * overnight(end<=start after offset) 은 end+24 로 처리.
 */
export function absShiftHours(
  startTime: string | null,
  endTime: string | null,
  startOffsetDays: number = 0,
): { startH: number; endH: number } {
  const startH = parseTimeToHours(startTime) + startOffsetDays * 24;
  let endH = parseTimeToHours(endTime) + startOffsetDays * 24;
  if (endH <= startH) endH += 24;
  return { startH, endH };
}

/**
 * 스케줄이 [hour, hour+1) 1시간 슬롯에서 차지하는 비율(0~1).
 * hour 는 영업일 축 기준(0~47, 24 이상 = 익일). 30분 grid 입력이면 결과는 0/0.5/1 로 떨어짐.
 * startOffsetDays: +1d 새벽 근무의 물리 위치 보정 (absShiftHours 참조).
 */
export function hourOccupancy(
  startTime: string | null,
  endTime: string | null,
  hour: number,
  startOffsetDays: number = 0,
): number {
  const { startH, endH } = absShiftHours(startTime, endTime, startOffsetDays);
  const overlap = Math.min(endH, hour + 1) - Math.max(startH, hour);
  return Math.max(0, Math.min(1, overlap));
}

/**
 * 스케줄이 [slotStart, slotStart+slotLen) 슬롯과 겹치는 양(시간 단위, 0 이상).
 * 슬롯은 영업일 축 기준. 30분 슬롯이면 slotLen=0.5, 1시간이면 1.
 * overlap>0 이면 그 슬롯을 "차지"한 것 (30분 grid 입력이면 풀 또는 0).
 * startOffsetDays: +1d 새벽 근무의 물리 위치 보정 (absShiftHours 참조).
 */
export function slotOverlap(
  startTime: string | null,
  endTime: string | null,
  slotStart: number,
  slotLen: number,
  startOffsetDays: number = 0,
): number {
  const { startH, endH } = absShiftHours(startTime, endTime, startOffsetDays);
  const overlap = Math.min(endH, slotStart + slotLen) - Math.max(startH, slotStart);
  return Math.max(0, overlap);
}

/** TEAM 표시 — 0.5 grid 로 스냅. 정수면 정수, 반이면 "x.5". */
export function fmtTeam(n: number): string {
  const r = Math.round(n * 2) / 2;
  return r % 1 === 0 ? String(r) : r.toFixed(1);
}

/** "HH:MM" 가 30분 grid(:00/:30) 인지. null/빈값은 통과. */
export function isOn30Grid(hhmm: string | null | undefined): boolean {
  if (!hhmm) return true;
  const [hh, mm] = hhmm.split(":");
  const total = (Number.parseInt(hh ?? "0", 10) || 0) * 60 + (Number.parseInt(mm ?? "0", 10) || 0);
  return total % SCHEDULE_STEP_MIN === 0;
}
