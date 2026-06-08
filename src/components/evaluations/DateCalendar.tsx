"use client";

import React, { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface DateCalendarProps {
  /** YYYY-MM-DD or "" */
  value: string;
  /** YYYY-MM-DD — dates before this are disabled */
  min?: string;
  /** YYYY-MM-DD — dates after this are disabled */
  max?: string;
  onChange: (value: string) => void;
}

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]; // week starts Sunday
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const pad = (n: number): string => String(n).padStart(2, "0");
const ymd = (y: number, m0: number, d: number): string => `${y}-${pad(m0 + 1)}-${pad(d)}`;

/**
 * Single-date calendar (no native <input type="date">). One per field, so start
 * and end are chosen independently — changing just the end never disturbs the
 * start. Dates outside [min, max] are disabled. Console tokens (light/dark).
 */
export function DateCalendar({ value, min, max, onChange }: DateCalendarProps): React.ReactElement {
  const anchor = value || max || min || ymd(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());
  const [ay, amRaw] = anchor.split("-").map(Number);
  const [view, setView] = useState<{ y: number; m: number }>({ y: ay, m: amRaw - 1 });

  // Keep the visible month in sync with the selected value.
  useEffect(() => {
    if (value) {
      const [vy, vm] = value.split("-").map(Number);
      setView({ y: vy, m: vm - 1 });
    }
  }, [value]);

  const firstWeekday = new Date(view.y, view.m, 1).getDay();
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array<null>(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const viewMonth = `${view.y}-${pad(view.m + 1)}`;
  const nextDisabled = max ? viewMonth >= max.slice(0, 7) : false;
  const prevDisabled = min ? viewMonth <= min.slice(0, 7) : false;

  function shift(delta: number): void {
    setView((v) => {
      let m = v.m + delta;
      let y = v.y;
      if (m < 0) { m = 11; y -= 1; }
      else if (m > 11) { m = 0; y += 1; }
      return { y, m };
    });
  }

  return (
    <div className="rounded-lg border border-border bg-surface p-3 select-none">
      <div className="flex items-center justify-between mb-2">
        <button
          type="button"
          onClick={() => shift(-1)}
          disabled={prevDisabled}
          aria-label="Previous month"
          className="w-7 h-7 rounded-md flex items-center justify-center text-text-muted hover:bg-surface-hover hover:text-text transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="text-sm font-semibold text-text">{MONTHS[view.m]} {view.y}</div>
        <button
          type="button"
          onClick={() => shift(1)}
          disabled={nextDisabled}
          aria-label="Next month"
          className="w-7 h-7 rounded-md flex items-center justify-center text-text-muted hover:bg-surface-hover hover:text-text transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 mb-1">
        {WEEKDAYS.map((w) => (
          <div key={w} className="text-[11px] font-semibold text-text-muted text-center py-1">{w}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-y-1">
        {cells.map((day, i) => {
          if (day === null) return <div key={i} />;
          const ds = ymd(view.y, view.m, day);
          const disabled = !!((min && ds < min) || (max && ds > max));
          const selected = ds === value;
          return (
            <button
              key={i}
              type="button"
              disabled={disabled}
              onClick={() => onChange(ds)}
              className={[
                "h-9 text-[13px] rounded-md flex items-center justify-center transition-colors",
                disabled
                  ? "text-text-muted opacity-30 cursor-not-allowed"
                  : selected
                    ? "bg-accent text-white font-semibold cursor-pointer"
                    : "text-text hover:bg-surface-hover cursor-pointer",
              ].join(" ")}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}
