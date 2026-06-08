/**
 * Date formatting for the evaluation period (fixed dates — no timezone shift).
 * `period_start` / `period_end` are work-date values, formatted with the
 * Category-A "fixed date" rules (parse YYYY-MM-DD locally, never UTC).
 */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-04-01" → "Apr 1, 2026". Strips any "T..." suffix. */
export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("T")[0].split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

/**
 * Compact period range — "Apr 1 – 30, 2026" (same month/year),
 * "Apr 1 – May 2, 2026" (same year), or full both sides otherwise.
 */
export function fmtRange(start: string | null | undefined, end: string | null | undefined): string {
  if (!start || !end) return "";
  const [sy, sm, sd] = start.split("T")[0].split("-").map(Number);
  const [ey, em, ed] = end.split("T")[0].split("-").map(Number);
  if (!sy || !ey) return "";
  if (sy === ey && sm === em) return `${MONTHS[sm - 1]} ${sd} – ${ed}, ${sy}`;
  if (sy === ey) return `${MONTHS[sm - 1]} ${sd} – ${MONTHS[em - 1]} ${ed}, ${sy}`;
  return `${fmtDate(start)} – ${fmtDate(end)}`;
}
