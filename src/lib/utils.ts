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
export function formatDate(dateStr: string | null | undefined, timezone?: string): string {
  if (!dateStr) return "—";
  // Python datetime은 마이크로초(6자리)를 포함할 수 있음 → JS 호환을 위해 3자리로 정규화
  const normalized = dateStr.replace(/(\.\d{3})\d+/, "$1");
  const d = new Date(normalized);
  if (isNaN(d.getTime())) return "—";
  const options: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    year: "numeric",
  };
  if (timezone) options.timeZone = timezone;
  return d.toLocaleDateString("en-US", options);
}

/** 감사 타임스탬프를 날짜+시간 포맷 — UTC를 로컬 타임존으로 변환.
 *
 * @param dateStr - ISO 8601 UTC 문자열
 * @returns 포맷된 날짜+시간 (예: "Feb 19, 3:30 PM")
 */
export function formatDateTime(dateStr: string | null | undefined, timezone?: string): string {
  if (!dateStr) return "—";
  const normalized = dateStr.replace(/(\.\d{3})\d+/, "$1");
  const d = new Date(normalized);
  if (isNaN(d.getTime())) return "—";
  const options: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  };
  if (timezone) options.timeZone = timezone;
  return d.toLocaleString("en-US", options);
}

/** 초 단위까지 표시하는 타임스탬프 포맷 — 디바이스 등록/활동 로그 등 정확한 시각 필요한 곳.
 *
 *  예: "Apr 22, 2026, 06:45:12 PM"
 */
export function formatDateTimeSeconds(
  dateStr: string | null | undefined,
  timezone?: string,
): string {
  if (!dateStr) return "—";
  const normalized = dateStr.replace(/(\.\d{3})\d+/, "$1");
  const d = new Date(normalized);
  if (isNaN(d.getTime())) return "—";
  const options: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  };
  if (timezone) options.timeZone = timezone;
  return d.toLocaleString("en-US", options);
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
  timezone?: string,
): string {
  const date = new Date(dateStr);
  const ref = referenceDate ? new Date(referenceDate) : new Date();

  // When timezone is specified, compare dates in that timezone
  const formatOpts: Intl.DateTimeFormatOptions = timezone ? { timeZone: timezone } : {};
  const dateParts = new Intl.DateTimeFormat("en-US", { ...formatOpts, year: "numeric", month: "numeric", day: "numeric" }).format(date);
  const refParts = new Intl.DateTimeFormat("en-US", { ...formatOpts, year: "numeric", month: "numeric", day: "numeric" }).format(ref);
  const sameDay = dateParts === refParts;

  if (sameDay) {
    return date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      ...formatOpts,
    });
  }
  return date.toLocaleString("en-US", {
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    ...formatOpts,
  });
}

/** 타임존 기준 오늘 날짜를 YYYY-MM-DD 문자열로 반환.
 *  timezone이 없으면 브라우저 로컬 기준.
 */
export function todayInTimezone(timezone?: string): string {
  const now = new Date();
  if (!timezone) return now.toISOString().split("T")[0];
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  return parts; // en-CA → "YYYY-MM-DD"
}

// ── Day Boundary: Work Date 판단 ──────────────────────────────────
// store.day_start_time JSONB 기반으로 현재 "업무일"을 결정

const WEEKDAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

/** 매장의 day_start_time 설정에서 해당 요일의 경계 시각(HH:MM)을 반환.
 *  설정이 없으면 기본값 "06:00" 반환.
 */
export function getDayBoundary(
  dayStartTime: Record<string, string> | null | undefined,
  weekday: number, // JS getDay(): 0=Sun..6=Sat
): string {
  if (!dayStartTime) return "06:00";
  // JS getDay: 0=Sun → WEEKDAY_KEYS index: 6=Sun
  const idx = weekday === 0 ? 6 : weekday - 1;
  const key = WEEKDAY_KEYS[idx];
  return dayStartTime[key] ?? dayStartTime["all"] ?? "06:00";
}

/** 매장의 day_start_time + timezone 기준으로 현재 work_date를 YYYY-MM-DD로 반환.
 *  현재 시각이 경계 시각보다 이르면 전날을 반환.
 */
export function getWorkDate(
  dayStartTime: Record<string, string> | null | undefined,
  timezone?: string,
): string {
  const now = new Date();
  const tz = timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;

  // Get current local date/time in the store's timezone
  const localDateStr = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
  }).format(now);
  const localTimeStr = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(now);

  const localDate = new Date(localDateStr + "T00:00:00");
  const weekday = localDate.getDay();
  const boundary = getDayBoundary(dayStartTime, weekday);

  if (localTimeStr < boundary) {
    // Before boundary → previous day
    localDate.setDate(localDate.getDate() - 1);
    const y = localDate.getFullYear();
    const m = String(localDate.getMonth() + 1).padStart(2, "0");
    const d = String(localDate.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  return localDateStr;
}

/** Cross-midnight shift 시간 계산 (분 단위).
 *  end < start이면 자정 넘김으로 처리.
 *  예: "22:00" → "02:00" = 240분
 */
export function calculateShiftMinutes(startTime: string, endTime: string): number {
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  const startMin = sh * 60 + sm;
  const endMin = eh * 60 + em;
  if (endMin <= startMin) {
    return (24 * 60 - startMin) + endMin;
  }
  return endMin - startMin;
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
  // Response body parsing — try this BEFORE network-error codes, since a 5xx
  // response with no CORS headers can also show up with ERR_NETWORK on the
  // axios error object even though the server did respond.
  if (error && typeof error === "object" && "response" in error) {
    const resp = (error as { response?: { data?: unknown; status?: number } }).response;
    const data = resp?.data;
    if (data && typeof data === "object") {
      const obj = data as Record<string, unknown>;

      // FastAPI HTTPException → {detail: string | [{loc, msg}]}
      if ("detail" in obj) {
        const detail = obj.detail;
        if (typeof detail === "string" && detail !== "Internal Server Error") return detail;
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

      // Custom endpoints (e.g. inventory import) → {error, validation_errors?}
      if ("error" in obj && typeof obj.error === "string") {
        const errMsg = obj.error;
        const ve = obj.validation_errors;
        if (Array.isArray(ve) && ve.length > 0) {
          const head = ve.slice(0, 3).map(String).join("; ");
          const more = ve.length > 3 ? ` (+${ve.length - 3} more)` : "";
          return `${errMsg} — ${head}${more}`;
        }
        return errMsg;
      }

      // Generic message field
      if ("message" in obj && typeof obj.message === "string") return obj.message;
    }

    // Response received but body unparseable — surface the status so we don't
    // mislabel a server error as "no internet".
    if (resp?.status) return `Server error (HTTP ${resp.status}).`;
  }

  if (error && typeof error === "object" && "code" in error) {
    const code = (error as { code?: string }).code;
    if (code === "ECONNABORTED") return "Server not responding. Please try again.";
    if (code === "ERR_NETWORK") {
      // ERR_NETWORK 는 실제 offline 외에도 CORS preflight 실패, DNS, SSL,
      // 서버 다운 등에서 동일하게 발생함. navigator.onLine 으로 진짜 offline
      // 인지 구분해서 오해의 소지를 줄인다.
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        return "No internet connection.";
      }
      return "Cannot reach server. Check your connection or contact admin.";
    }
  }
  return fallback;
}
