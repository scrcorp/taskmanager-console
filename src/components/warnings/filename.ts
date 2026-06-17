/**
 * Shared warning download-filename builder.
 *
 * Spec (plan doc 2026-06-15):
 *   {YYYY-MM-DD}-{STORECODE}-{EMPID}-{CATEGORIES}-{N}-{First_Last}.pdf
 *
 * - date    = wet_signed_on (the date physically signed) || warning_date
 * - STORECODE = stores.code (warning.store_code)
 * - EMPID   = users.employee_no (warning.employee_no)
 * - CATEGORIES = every category label, sanitized, joined by "_" (the field
 *               separator is "-", so "_" inside a part avoids collisions)
 * - N       = ordinal (the issue-time snapshot)
 * - First_Last = subject_name with spaces → "_"
 *
 * Any missing part collapses to "NA". The console also surfaces a "missing
 * fields" badge, but issuing/uploading is never blocked on this.
 */
import type { Warning } from "@/types";

/** Placeholder for a missing/blank filename part. */
const NA = "NA";

/**
 * Strip anything that isn't filename-safe. Keep ASCII alphanumerics; collapse
 * everything else (incl. the "-"/"_" separators a value might contain) to "_",
 * then trim leading/trailing "_". Empty result → "NA".
 */
function sanitizePart(raw: string | null | undefined): string {
  if (!raw) return NA;
  const cleaned = raw
    .trim()
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return cleaned || NA;
}

/** ISO date → "YYYY-MM-DD" (the date prefix of the filename); falls back to "NA". */
function fmtFilenameDate(iso: string | null | undefined): string {
  if (!iso) return NA;
  const ymd = iso.slice(0, 10); // YYYY-MM-DD
  return /^\d{4}-\d{2}-\d{2}$/.test(ymd) ? ymd : NA;
}

/**
 * Resolve a category code → its display label. Prefers the warning's live
 * `category_labels` map (covers removed legacy codes), then a supplied lookup,
 * else the raw code.
 */
function resolveCategoryLabel(
  code: string,
  warning: Warning,
  lookup?: (code: string) => string | undefined,
): string {
  return warning.category_labels?.[code] ?? lookup?.(code) ?? code;
}

/**
 * Build the pretty download filename for a warning's PDF (digital print or wet
 * scan). `categoryLabel` lets a caller plug in the org's live category options;
 * otherwise the warning's own `category_labels` map is used.
 */
export function buildWarningFilename(
  warning: Warning,
  categoryLabel?: (code: string) => string | undefined,
): string {
  const date = fmtFilenameDate(warning.wet_signed_on || warning.warning_date);
  const store = sanitizePart(warning.store_code);
  const empId = sanitizePart(warning.employee_no);

  const categories =
    warning.categories.length > 0
      ? warning.categories
          .map((c) => sanitizePart(resolveCategoryLabel(c, warning, categoryLabel)))
          .filter((c) => c !== NA)
          .join("_")
      : "";
  const cats = categories || NA;

  const ordinal = warning.ordinal != null ? String(warning.ordinal) : NA;
  const name = sanitizePart(warning.subject_name);

  return `${date}-${store}-${empId}-${cats}-${ordinal}-${name}.pdf`;
}

/**
 * Which filename parts are missing (for the console's "missing fields" badge).
 * Returns human-readable labels for any part that collapses to a placeholder.
 */
export function missingFilenameFields(warning: Warning): string[] {
  const missing: string[] = [];
  if (!warning.store_code) missing.push("Store code");
  if (!warning.employee_no) missing.push("Employee ID");
  return missing;
}
