/**
 * 마감 게이트 → 해결 화면 딥링크 빌더 (Payroll v1).
 *
 * Attendance 페이지는 usePersistedFilters 로 URL 파라미터가 곧 필터 상태이고,
 * `_ext=1` 마커가 붙은 진입은 "1회용"으로 취급된다 — localStorage/서버 필터를
 * 덮어쓰지 않고 그 방문에만 적용된다 (usePersistedFilters.ts 의 EXT_MARKER).
 * 게이트에서 새 탭으로 여는 링크는 항상 이 마커를 붙여, 사용자가 원래 쓰던
 * 근태 필터를 payroll 수정 동선이 망가뜨리지 않게 한다.
 */

/** attendance 필터를 1회용으로 만드는 마커 (usePersistedFilters). */
export const ONE_SHOT_PARAM = "_ext";

export interface AttendanceLinkOptions {
  /**
   * group 스코프 기간은 매장 귀속이 없어 null — store 필터 없이 연다
   * (근태 페이지가 기본 매장으로 열리고, 날짜/직원 필터는 그대로 적용).
   */
  storeId: string | null;
  /** YYYY-MM-DD. 없으면 근태 페이지 기본값(오늘)으로 열림. */
  date?: string | null;
  /** 대상 직원 — attendance `staff` 필터(CSV) 1건. */
  userId?: string | null;
  /** 자동퇴근 미확인 quick filter 활성화 여부. */
  unconfirmedAutoOnly?: boolean;
  /** 겹쳐 열린 shift quick filter 활성화 여부 (겹침 게이트 전용). */
  overlappingOnly?: boolean;
}

/**
 * 근태 페이지 1회용 딥링크.
 * 예) /attendances?store=<id>&date=2026-07-18&staff=<uid>&unconf=1&_ext=1
 */
export function buildAttendanceOneShotLink({
  storeId,
  date,
  userId,
  unconfirmedAutoOnly = false,
  overlappingOnly = false,
}: AttendanceLinkOptions): string {
  const params = new URLSearchParams();
  if (storeId) params.set("store", storeId);
  if (date) params.set("date", date);
  if (userId) params.set("staff", userId);
  if (unconfirmedAutoOnly) params.set("unconf", "1");
  if (overlappingOnly) params.set("overlap", "1");
  params.set(ONE_SHOT_PARAM, "1");
  return `/attendances?${params.toString()}`;
}

const ISO_DATE_RE = /\d{4}-\d{2}-\d{2}/g;

/** 메시지 안의 YYYY-MM-DD 를 등장 순서대로 (중복 제거) 추출. */
export function extractDates(message: string): string[] {
  const found = message.match(ISO_DATE_RE);
  return found ? [...new Set(found)] : [];
}

/**
 * 날짜 목록을 떼어낸 사유 문구.
 * "Open shift without clock-out on: 2026-07-18, 2026-07-20"
 *   → "Open shift without clock-out"
 * 날짜가 행 단위로 따로 표시되므로 문구에서 중복 제거하는 용도.
 */
export function stripDates(message: string): string {
  return message
    .replace(/\s*\d{4}-\d{2}-\d{2}(?:\s*,\s*\d{4}-\d{2}-\d{2})*\s*$/, "")
    .replace(/(?:\s+on)?\s*:?\s*$/, "")
    .trim();
}
