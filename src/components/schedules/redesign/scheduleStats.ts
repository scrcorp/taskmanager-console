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
 * 스케줄이 [hour, hour+1) 1시간 슬롯에서 차지하는 비율(0~1).
 * overnight(end<=start) 은 end+24 로 처리. 30분 grid 입력이면 결과는 0/0.5/1 로 떨어짐.
 */
export function hourOccupancy(startTime: string | null, endTime: string | null, hour: number): number {
  const start = parseTimeToHours(startTime);
  const end = parseTimeToHours(endTime);
  const effectiveEnd = end <= start ? end + 24 : end;
  const overlap = Math.min(effectiveEnd, hour + 1) - Math.max(start, hour);
  return Math.max(0, Math.min(1, overlap));
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
