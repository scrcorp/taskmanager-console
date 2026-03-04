/**
 * 유틸리티 함수 모음 — 날짜 포맷, CSS 클래스 병합, API 에러 파싱.
 *
 * 날짜 포맷은 3가지 카테고리로 분류:
 * - A. Fixed Date: 타임존 변환 없음 (work_date, due_date 등 날짜 자체가 의미 있는 경우)
 * - B. Audit Timestamp: UTC→로컬 변환 (created_at, updated_at 등 서버 기록 시각)
 * - C. Action Timestamp: UTC→로컬 변환 + 시간 강조 (completed_at 등 행위 시각)
 */
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Tailwind CSS 클래스 병합 — clsx로 조건부 클래스 처리 후 tailwind-merge로 충돌 해결 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

// ── 카테고리 A: 고정 날짜 (Fixed Date) ─────────────────────────────
// 타임존 변환 없음 — 날짜 자체가 의미 있는 값 (work_date, due_date)

/** 고정 날짜 문자열을 포맷 — 타임존 변환 없이 로컬 파싱.
 *  YYYY-MM-DD를 로컬로 파싱하여 UTC 날짜 이동을 방지합니다.
 *
 * @param dateStr - YYYY-MM-DD 날짜 문자열 (T 접미사 포함 가능, 제거됨)
 * @returns 포맷된 날짜 (예: "Feb 19, 2026")
 */
export function formatFixedDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("T")[0].split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** 고정 날짜를 요일 포함하여 포맷.
 *
 * @param dateStr - YYYY-MM-DD 날짜 문자열
 * @returns 요일 포함 날짜 (예: "Wed, Feb 19")
 */
export function formatFixedDateWithDay(dateStr: string): string {
  const [y, m, d] = dateStr.split("T")[0].split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

// ── 카테고리 B: 감사 타임스탬프 (Audit Timestamp) ──────────────────
// UTC → 로컬 타임존 변환 (created_at, updated_at)

/** 감사 타임스탬프를 날짜만 포맷 — UTC를 로컬 타임존으로 변환.
 *
 * @param dateStr - ISO 8601 UTC 문자열
 * @returns 포맷된 날짜 (예: "Feb 19, 2026")
 */
export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  // Python datetime은 마이크로초(6자리)를 포함할 수 있음 → JS 호환을 위해 3자리로 정규화
  const normalized = dateStr.replace(/(\.\d{3})\d+/, "$1");
  const d = new Date(normalized);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** 감사 타임스탬프를 날짜+시간 포맷 — UTC를 로컬 타임존으로 변환.
 *
 * @param dateStr - ISO 8601 UTC 문자열
 * @returns 포맷된 날짜+시간 (예: "Feb 19, 3:30 PM")
 */
export function formatDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  const normalized = dateStr.replace(/(\.\d{3})\d+/, "$1");
  const d = new Date(normalized);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// ── 카테고리 C: 행위 타임스탬프 (Action Timestamp) ──────────────────
// UTC → 로컬 타임존, 시간 강조 표시 (completed_at 등)

/** 행위 타임스탬프를 시간 강조 포맷.
 *  같은 날: "3:30 PM", 다른 날: "2/19, 3:30 PM".
 *
 * @param dateStr - ISO 8601 UTC 문자열
 * @param referenceDate - 비교 기준 날짜 (기본값: 오늘)
 * @returns 시간 강조 포맷 (예: "3:30 PM" 또는 "2/19, 3:30 PM")
 */
export function formatActionTime(
  dateStr: string,
  referenceDate?: string,
): string {
  const date = new Date(dateStr);
  const ref = referenceDate ? new Date(referenceDate) : new Date();
  const sameDay =
    date.getFullYear() === ref.getFullYear() &&
    date.getMonth() === ref.getMonth() &&
    date.getDate() === ref.getDate();

  if (sameDay) {
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
    });
  }
  return date.toLocaleString("en-US", {
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** 전체 아이템 수와 페이지당 아이템 수로 총 페이지 수 계산 */
export function getTotalPages(total: number, perPage: number): number {
  return Math.max(1, Math.ceil(total / perPage));
}

/** 상대 시간 문자열 반환 (예: "2h ago").
 *
 * @param dateStr - ISO 8601 UTC 문자열
 * @returns 상대 시간 문자열
 */
export function timeAgo(dateStr: string): string {
  const now: number = Date.now();
  const past: number = new Date(dateStr).getTime();
  const diffMs: number = now - past;
  const diffMin: number = Math.floor(diffMs / 60000);

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;

  const diffHr: number = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;

  const diffDay: number = Math.floor(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d ago`;

  return formatDate(dateStr);
}

// ── API 에러 파싱 ──────────────────────────────────────────────

/** API 에러 응답을 사용자 친화적 메시지로 변환.
 *
 * FastAPI 에러 형식 처리:
 *   - { detail: "message" } → "message"
 *   - { detail: [{ loc: [...], msg: "..." }] } → "field: message" (유효성 검증 에러)
 *   - 네트워크/타임아웃 에러 → 친화적 fallback 메시지
 *
 * @param error - catch된 에러 (주로 AxiosError)
 * @param fallback - 파싱 실패 시 기본 메시지
 * @returns 사용자용 에러 문자열
 */
export function parseApiError(error: unknown, fallback: string): string {
  if (
    error &&
    typeof error === "object" &&
    "response" in error
  ) {
    const resp = (error as { response?: { data?: unknown } }).response;
    const data = resp?.data;
    if (data && typeof data === "object" && "detail" in (data as Record<string, unknown>)) {
      const detail = (data as { detail: unknown }).detail;
      if (typeof detail === "string") return detail;
      if (Array.isArray(detail) && detail.length > 0) {
        return detail
          .map((d: { loc?: string[]; msg?: string }) => {
            const loc = (d.loc ?? []).filter((l) => l !== "body").join(" > ");
            const msg = d.msg ?? "";
            return loc ? `${loc}: ${msg}` : msg;
          })
          .join(", ");
      }
    }
  }
  if (
    error &&
    typeof error === "object" &&
    "code" in error
  ) {
    const code = (error as { code?: string }).code;
    if (code === "ECONNABORTED") return "Server not responding. Please try again.";
    if (code === "ERR_NETWORK") return "No internet connection.";
  }
  return fallback;
}
