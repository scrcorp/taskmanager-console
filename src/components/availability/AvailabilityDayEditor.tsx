"use client";

/**
 * Per-day availability editor: for each weekday choose Off / Time / Full.
 * Picking "Time" reveals a start–end pair via TimeSelect (hour + minute
 * dropdowns, 5-minute grid, select-only; overnight allowed). Sunday-first.
 * Controlled — the parent owns the routine and applies each day's change.
 */
import React from "react";
import {
  DAY_LABELS,
  AVAIL_COLORS,
  DEFAULT_RANGE,
  type AvailabilityDay,
  type AvailabilityState,
} from "@/types";
import { TimeSelect } from "@/components/ui/TimeSelect";
import { calculateShiftMinutes, formatDurationShort } from "@/lib/utils";

interface Props {
  routine: AvailabilityDay[];
  onChange: (day: number, value: AvailabilityDay) => void;
  disabled?: boolean;
}

const OPTS: { state: AvailabilityState; label: string }[] = [
  { state: "off", label: "Off" },
  { state: "range", label: "Time" },
  { state: "full", label: "Full" },
];

export function AvailabilityDayEditor({
  routine,
  onChange,
  disabled = false,
}: Props): React.ReactElement {
  function pick(day: number, state: AvailabilityState): void {
    if (disabled) return;
    const cur = routine[day];
    if (state === "off") {
      onChange(day, { day_of_week: day, state: "off", start_time: null, end_time: null });
    } else if (state === "full") {
      onChange(day, { day_of_week: day, state: "full", start_time: null, end_time: null });
    } else {
      // range: keep an existing window, else seed the default
      const start = cur.state === "range" && cur.start_time ? cur.start_time : DEFAULT_RANGE.start;
      const end = cur.state === "range" && cur.end_time ? cur.end_time : DEFAULT_RANGE.end;
      onChange(day, { day_of_week: day, state: "range", start_time: start, end_time: end });
    }
  }

  function setTime(day: number, part: "start_time" | "end_time", val: string): void {
    if (disabled) return;
    const cur = routine[day];
    onChange(day, {
      day_of_week: day,
      state: "range",
      start_time: part === "start_time" ? val : cur.start_time ?? DEFAULT_RANGE.start,
      end_time: part === "end_time" ? val : cur.end_time ?? DEFAULT_RANGE.end,
    });
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border">
      {DAY_LABELS.map((label, day) => {
        const v = routine[day];
        const isWeekend = day === 0 || day === 6;
        return (
          <div
            key={label}
            className="flex flex-wrap items-center gap-3 border-b border-border px-3 py-2.5 last:border-0"
          >
            <span
              className={`w-9 shrink-0 text-[14px] font-semibold ${
                isWeekend ? "text-text-muted" : "text-text"
              }`}
            >
              {label}
            </span>

            {/* segmented Off / Time / Full */}
            <div className="flex gap-1 rounded-lg bg-surface-hover p-0.5">
              {OPTS.map((o) => {
                const on = v.state === o.state;
                const color = o.state === "range" ? AVAIL_COLORS.range : AVAIL_COLORS.full;
                return (
                  <button
                    key={o.state}
                    type="button"
                    disabled={disabled}
                    onClick={() => pick(day, o.state)}
                    className="rounded-md px-3 py-1 text-[12px] font-bold transition-colors disabled:cursor-not-allowed"
                    style={
                      on
                        ? {
                            background: o.state === "off" ? "#E2E8F0" : color,
                            color: o.state === "off" ? "#475569" : "#fff",
                          }
                        : { background: "transparent", color: "var(--color-text-muted)" }
                    }
                  >
                    {o.label}
                  </button>
                );
              })}
            </div>

            {/* hour+minute selects when Time */}
            {v.state === "range" &&
              (() => {
                const start = v.start_time ?? DEFAULT_RANGE.start;
                const end = v.end_time ?? DEFAULT_RANGE.end;
                return (
                  <div className="flex items-center gap-1.5">
                    <TimeSelect
                      disabled={disabled}
                      value={start}
                      onChange={(val) => setTime(day, "start_time", val)}
                    />
                    <span className="text-text-muted">–</span>
                    <TimeSelect
                      disabled={disabled}
                      value={end}
                      onChange={(val) => setTime(day, "end_time", val)}
                    />
                    <span className="text-[11px] text-text-muted">
                      ({formatDurationShort(calculateShiftMinutes(start, end))})
                    </span>
                  </div>
                );
              })()}
            {v.state === "full" && (
              <span className="text-[12px] text-text-muted">Open – Close</span>
            )}
            {v.state === "off" && (
              <span className="text-[12px] text-text-muted">Not working</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
