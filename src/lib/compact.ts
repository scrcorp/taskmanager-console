/**
 * 간소화 콘솔(compact) 공통 상수/헬퍼.
 *
 * 경로와 저장키를 의도적으로 분리한다. 저장키를 경로 약자에서 따오면
 * 경로를 바꿀 때 localStorage + 서버 console_filters 마이그레이션이 따라온다.
 */

/** 간소화 콘솔 루트 경로. 경로 문자열은 여기서만 정의한다. */
export const COMPACT_BASE_PATH = "/c";

/**
 * 필터 영속화 page key (매장 선택).
 * 경로(`/c`)에서 파생하지 않는다 — 경로가 바뀌어도 저장된 값이 살아있어야 한다.
 * 데스크탑과 분리하는 이유: 필터는 서버 console_filters 로 디바이스 간 동기화되므로
 * 키를 공유하면 폰에서 잠깐 다른 매장을 본 것이 PC 화면을 덮어쓴다.
 */
export const COMPACT_FILTER_KEY = "compact";

/**
 * 날짜 key.
 *
 * 스케줄/근태로 나누지 않는다 — 화면이 하나로 합쳐졌으므로 나눌 대상이 없고,
 * 나눠 두면 예전 탭 구조처럼 "옮겼더니 다른 날짜" 가 재발한다.
 * (실제 저장은 transient 로 막아 세션 안에서만 유지한다. `CompactDayView` 참조.)
 */
export const COMPACT_DAY_KEY = "compact.day";

/** `/c/schedules` → `/schedules`. 데스크탑 기준 매핑(권한/링크)에 재사용하기 위한 변환. */
export function toDesktopPath(pathname: string): string {
  if (pathname === COMPACT_BASE_PATH) return "/schedules";
  if (pathname.startsWith(`${COMPACT_BASE_PATH}/`)) {
    return pathname.slice(COMPACT_BASE_PATH.length);
  }
  return pathname;
}

/** `/schedules` → `/c/schedules` */
export function toCompactPath(desktopPath: string): string {
  if (desktopPath === "/") return COMPACT_BASE_PATH;
  return `${COMPACT_BASE_PATH}${desktopPath}`;
}
