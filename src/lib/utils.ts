import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Merge Tailwind CSS classes with conflict resolution via clsx + tailwind-merge. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

// ── Category A: Fixed Date ──────────────────────────────────────────
// No timezone conversion — the date itself is meaningful (work_date, due_date)

/** Format a fixed date string without timezone conversion.
 *  Parses YYYY-MM-DD locally to prevent UTC date shift.
 *
 * @param dateStr - YYYY-MM-DD date string (may include T suffix, which is stripped)
 * @returns Formatted date (e.g., "Feb 19, 2026")
 */
export function formatFixedDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("T")[0].split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Format a fixed date with weekday.
 *
 * @param dateStr - YYYY-MM-DD date string
 * @returns Date with weekday (e.g., "Wed, Feb 19")
 */
export function formatFixedDateWithDay(dateStr: string): string {
  const [y, m, d] = dateStr.split("T")[0].split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

// ── Category B: Audit Timestamp ─────────────────────────────────────
// UTC → local timezone conversion (created_at, updated_at)

/** Format an audit timestamp as date only.
 *  Converts UTC to local timezone.
 *
 * @param dateStr - ISO 8601 UTC string
 * @returns Formatted date (e.g., "Feb 19, 2026")
 */
export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  // Python datetime may include microseconds (6 decimal places); normalize to 3 for JS compatibility
  const normalized = dateStr.replace(/(\.\d{3})\d+/, "$1");
  const d = new Date(normalized);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Format an audit timestamp with date and time.
 *  Converts UTC to local timezone.
 *
 * @param dateStr - ISO 8601 UTC string
 * @returns Formatted datetime (e.g., "Feb 19, 3:30 PM")
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

// ── Category C: Action Timestamp ────────────────────────────────────
// UTC → local timezone, time-focused display (completed_at, etc.)

/** Format an action timestamp with time emphasis.
 *  Same day: "3:30 PM", different day: "2/19, 3:30 PM".
 *
 * @param dateStr - ISO 8601 UTC string
 * @param referenceDate - Date to compare against (defaults to today)
 * @returns Time-focused format (e.g., "3:30 PM" or "2/19, 3:30 PM")
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

/** Calculate total page count from total items and items per page. */
export function getTotalPages(total: number, perPage: number): number {
  return Math.max(1, Math.ceil(total / perPage));
}

/** Return a relative time string (e.g., "2h ago").
 *
 * @param dateStr - ISO 8601 UTC string
 * @returns Relative time string
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

// ── API Error Parsing ──────────────────────────────────────────

/** Parse API error response into a user-friendly message.
 *
 * Handles FastAPI error formats:
 *   - { detail: "message" } → "message"
 *   - { detail: [{ loc: [...], msg: "..." }] } → "field: message"
 *   - Network/timeout errors → friendly fallback
 *
 * @param error - caught error (typically AxiosError)
 * @param fallback - default message if parsing fails
 * @returns User-readable error string
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
