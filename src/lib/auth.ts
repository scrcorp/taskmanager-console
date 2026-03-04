/**
 * 인증 토큰 및 회사 코드 관리 모듈.
 *
 * localStorage에 JWT 토큰(access/refresh)과 회사 코드를 저장·조회·삭제합니다.
 * SSR 환경(window === undefined)에서는 안전하게 null을 반환합니다.
 *
 * 배포 제약(Render+Supabase+Vercel)으로 httpOnly 쿠키 대신 localStorage를 사용합니다.
 * (CLAUDE.md Architecture Decision #2 참조)
 */

const ACCESS_TOKEN_KEY = "taskmanager_access_token";
const REFRESH_TOKEN_KEY = "taskmanager_refresh_token";

/** Access token 조회 — SSR 환경에서는 null 반환 */
export function getAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

/** Refresh token 조회 — SSR 환경에서는 null 반환 */
export function getRefreshToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

/** Access/Refresh 토큰 쌍을 localStorage에 저장 */
export function setTokens(access: string, refresh: string): void {
  localStorage.setItem(ACCESS_TOKEN_KEY, access);
  localStorage.setItem(REFRESH_TOKEN_KEY, refresh);
}

/** 저장된 토큰 전부 삭제 — 로그아웃 또는 refresh 실패 시 호출 */
export function clearTokens(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

/** 인증 여부 확인 — Mock 모드에서는 항상 true */
export function isAuthenticated(): boolean {
  if (process.env.NEXT_PUBLIC_USE_MOCK === "true") return true;
  return !!getAccessToken();
}

// ── 회사 코드 (Company Code) ──────────────────────────────────────
// 6자리 영숫자 코드로 조직을 식별합니다.
// .env 고정값 또는 사용자 입력값을 localStorage에 저장합니다.

const COMPANY_CODE_KEY = "taskmanager_company_code";

/** .env에 고정된 회사코드 (NEXT_PUBLIC_COMPANY_CODE) — 6자리가 아니면 null */
export function getEnvCompanyCode(): string | null {
  const env = process.env.NEXT_PUBLIC_COMPANY_CODE;
  return env && env.length === 6 ? env.toUpperCase() : null;
}

/** 회사 코드 조회 — localStorage 우선, 없으면 .env 값 사용 */
export function getCompanyCode(): string | null {
  if (typeof window === "undefined") return getEnvCompanyCode();
  return localStorage.getItem(COMPANY_CODE_KEY) || getEnvCompanyCode();
}

/** 회사 코드를 localStorage에 저장 (대문자 변환) */
export function setCompanyCode(code: string): void {
  localStorage.setItem(COMPANY_CODE_KEY, code.toUpperCase());
}

/** 유효한 회사 코드가 설정되어 있는지 확인 */
export function hasCompanyCode(): boolean {
  const code = getCompanyCode();
  return !!code && code.length === 6;
}
