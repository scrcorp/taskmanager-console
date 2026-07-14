"use client";

/**
 * Compact time picker — two selection-only dropdowns (hour + minute) instead of
 * one long flat list. Value/onChange use a "HH:MM" 24-hour string. Minutes step
 * by `minuteStep` (default 5). Selection-only: no free typing.
 *
 * Preferred over a single 288-entry <select> for fine-grained (5-min) times.
 */
import React from "react";
import { cn } from "@/lib/utils";

const HOURS: string[] = Array.from({ length: 24 }, (_, h) => String(h).padStart(2, "0"));

interface Props {
  /** Current value as "HH:MM" (24-hour). */
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  /** Minute granularity (default 5). */
  minuteStep?: number;
  className?: string;
}

const BOX =
  "rounded-md border border-border bg-surface px-1.5 py-1 text-[12px] text-text tabular-nums appearance-none cursor-pointer focus:border-[#0EA5E9] focus:outline-none focus:ring-2 focus:ring-[#0EA5E9]/40 disabled:opacity-50 disabled:cursor-not-allowed";

export function TimeSelect({
  value,
  onChange,
  disabled = false,
  minuteStep = 5,
  className,
}: Props): React.ReactElement {
  const [hh, mm] = (value || "00:00").split(":");

  // Minute grid; keep the current minute selectable even if it is off-grid.
  const minuteNums: number[] = Array.from(
    { length: Math.ceil(60 / minuteStep) },
    (_, i) => i * minuteStep,
  );
  if (!minuteNums.includes(Number(mm))) minuteNums.push(Number(mm));
  minuteNums.sort((a, b) => a - b);
  const minutes: string[] = minuteNums.map((n) => String(n).padStart(2, "0"));

  return (
    <span className={cn("inline-flex items-center gap-0.5", className)}>
      <select
        aria-label="Hour"
        disabled={disabled}
        value={hh}
        onChange={(e) => onChange(`${e.target.value}:${mm}`)}
        className={BOX}
      >
        {HOURS.map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </select>
      <span className="text-text-muted">:</span>
      <select
        aria-label="Minute"
        disabled={disabled}
        value={mm}
        onChange={(e) => onChange(`${hh}:${e.target.value}`)}
        className={BOX}
      >
        {minutes.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
    </span>
  );
}
