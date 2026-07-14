/**
 * Work Availability types + helpers.
 *
 * A staff member declares, per weekday, whether they can work:
 *   - "off"   → not available that day
 *   - "range" → a specific time window (e.g. 09:00–14:30)
 *   - "full"  → available open-to-close ("Full day")
 *
 * Week is always Sunday-first: day_of_week 0=Sun … 6=Sat.
 * Mirrors the server contract at /api/v1/console/availability.
 */
import type { CSSProperties } from "react";

/** A day's availability state. `range` carries start/end times. */
export type AvailabilityState = "off" | "range" | "full";

/** One weekday's availability as returned by the server. */
export interface AvailabilityDay {
  day_of_week: number; // 0=Sun … 6=Sat
  state: AvailabilityState;
  start_time: string | null; // "HH:MM" when state="range", else null
  end_time: string | null;
}

/** One weekday's availability as sent to the server (times omitted when not a range). */
export interface AvailabilityDayInput {
  day_of_week: number;
  state: AvailabilityState;
  start_time?: string;
  end_time?: string;
}

/** A member's full weekly availability. `days` may omit off weekdays. */
export interface AvailabilityMember {
  user_id: string;
  full_name: string | null;
  days: AvailabilityDay[];
  updated_at: string | null;
}

/** A single edit-history entry (who changed what, when). */
export interface AvailabilityHistory {
  day_of_week: number | null;
  source: "console_manager" | "staff_self";
  snapshot: { state: string; start: string | null; end: string | null };
  prev: { state: string; start: string | null; end: string | null } | null;
  description: string | null;
  actor_id: string | null;
  actor_name: string | null;
  created_at: string;
}

/** Detail response: the member's current week + its edit history. */
export interface AvailabilityDetail {
  member: AvailabilityMember;
  history: AvailabilityHistory[];
}

/**
 * A reusable weekly template. `is_system` presets ship built-in and can't be
 * deleted; the rest are org-custom. Shared by the Setup page and the single
 * -staff edit modal via `GET /console/availability/presets`.
 */
export interface Preset {
  id: string;
  name: string;
  days: AvailabilityDay[];
  is_system: boolean;
}

/** Sunday-first weekday labels (index = day_of_week). */
export const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** Fixed colors for the three states (shared by strip, editor, popover). */
export const AVAIL_COLORS = {
  off: "#94A3B8",
  range: "#0EA5E9", // sky
  full: "#7C3AED", // purple
} as const;

/** Diagonal hatch texture used for "off" tiles (distinguishable without hue). */
export const OFF_HATCH: CSSProperties = {
  backgroundColor: "#F8FAFC",
  backgroundImage:
    "repeating-linear-gradient(45deg, #CBD5E1 0, #CBD5E1 1px, transparent 1px, transparent 4px)",
};

/**
 * Normalize a member's (possibly sparse) `days[]` into a dense 7-slot routine
 * indexed by day_of_week. Missing/invalid weekdays default to "off".
 */
export function toRoutine(days: AvailabilityDay[] | undefined): AvailabilityDay[] {
  const routine: AvailabilityDay[] = Array.from({ length: 7 }, (_, i) => ({
    day_of_week: i,
    state: "off" as AvailabilityState,
    start_time: null,
    end_time: null,
  }));
  for (const d of days ?? []) {
    if (d.day_of_week >= 0 && d.day_of_week <= 6) {
      routine[d.day_of_week] = {
        day_of_week: d.day_of_week,
        state: d.state,
        start_time: d.start_time ?? null,
        end_time: d.end_time ?? null,
      };
    }
  }
  return routine;
}

/** Human-readable label for a day: "Off" | "Full day" | "09:00–14:30". */
export function fmtDay(d: AvailabilityDay): string {
  if (d.state === "full") return "Full day";
  if (d.state === "range" && d.start_time && d.end_time) {
    return `${d.start_time}–${d.end_time}`;
  }
  return "Off";
}

/** Convert a dense routine into the server input payload (all 7 days explicit). */
export function toDaysInput(routine: AvailabilityDay[]): AvailabilityDayInput[] {
  return routine.map((d) => {
    if (d.state === "range") {
      return {
        day_of_week: d.day_of_week,
        state: "range" as const,
        start_time: d.start_time ?? undefined,
        end_time: d.end_time ?? undefined,
      };
    }
    return { day_of_week: d.day_of_week, state: d.state };
  });
}

/** Default time window applied when a day is first switched to "range". */
export const DEFAULT_RANGE = { start: "09:00", end: "17:00" } as const;

/**
 * Validate a routine before saving. Returns an error message for the first
 * invalid "range" day, or null when everything is valid.
 * Rules: start & end required, 5-min grid, start ≠ end. Overnight ranges
 * (end < start, wrapping past midnight) are allowed.
 */
export function validateRoutine(routine: AvailabilityDay[]): string | null {
  for (const d of routine) {
    if (d.state !== "range") continue;
    const { start_time: s, end_time: e } = d;
    const label = DAY_LABELS[d.day_of_week];
    if (!s || !e) return `${label}: set both a start and end time, or choose Off / Full.`;
    if (!onGrid(s) || !onGrid(e)) return `${label}: times must be on a 5-minute boundary.`;
    if (e === s) return `${label}: start and end time can't be the same.`;
  }
  return null;
}

function onGrid(hhmm: string): boolean {
  const m = Number(hhmm.slice(3, 5));
  return m % 5 === 0;
}

/** True when two dense 7-slot routines are identical (used for dirty checks). */
export function routinesEqual(a: AvailabilityDay[], b: AvailabilityDay[]): boolean {
  for (let i = 0; i < 7; i++) {
    const x = a[i];
    const y = b[i];
    if (
      x.state !== y.state ||
      (x.start_time ?? null) !== (y.start_time ?? null) ||
      (x.end_time ?? null) !== (y.end_time ?? null)
    ) {
      return false;
    }
  }
  return true;
}
