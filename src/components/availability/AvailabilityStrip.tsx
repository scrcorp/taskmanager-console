"use client";

/**
 * Compact weekly availability strip — 7 tiles, Sunday-first.
 *   off   → diagonal hatch (texture)
 *   range → sky tile with a small clock glyph (specific hours)
 *   full  → solid purple tile
 * Color + shape/texture together keep the states distinguishable without hue.
 *
 * `WeekKey` renders the 2-letter weekday key as a distinct muted channel that
 * sits above the tiles (used in the column header).
 */
import React from "react";
import {
  DAY_LABELS,
  AVAIL_COLORS,
  OFF_HATCH,
  fmtDay,
  type AvailabilityDay,
} from "@/types";

type Size = "sm" | "md";

const SIZES: Record<Size, { tile: string; slot: string; icon: number }> = {
  sm: { tile: "w-4 h-[18px] rounded-[4px]", slot: "w-4 text-[8px]", icon: 9 },
  md: { tile: "w-[22px] h-6 rounded-md", slot: "w-[22px] text-[9px]", icon: 12 },
};

function Clock({ size }: { size: number }): React.ReactElement {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="#fff"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 7 12 12 16 14" />
    </svg>
  );
}

export function Tile({
  day,
  size = "sm",
}: {
  day: AvailabilityDay;
  size?: Size;
}): React.ReactElement {
  const sz = SIZES[size];
  if (day.state === "off") {
    return (
      <span
        className={`${sz.tile} ring-1 ring-inset ring-slate-200 inline-block align-middle`}
        style={OFF_HATCH}
      />
    );
  }
  const bg = day.state === "range" ? AVAIL_COLORS.range : AVAIL_COLORS.full;
  return (
    <span
      className={`${sz.tile} inline-flex items-center justify-center align-middle`}
      style={{ background: bg }}
    >
      {day.state === "range" && <Clock size={sz.icon} />}
    </span>
  );
}

/** A11y / native-tooltip summary: "Sun Off · Mon 09:00–17:00 · …". */
function summary(routine: AvailabilityDay[]): string {
  return DAY_LABELS.map((d, i) => `${d} ${fmtDay(routine[i])}`).join(" · ");
}

export function AvailabilityStrip({
  routine,
  size = "sm",
}: {
  routine: AvailabilityDay[];
  size?: Size;
}): React.ReactElement {
  return (
    <span
      className="inline-flex items-center gap-0.5 align-middle"
      title={summary(routine)}
    >
      {routine.map((d, i) => (
        <Tile key={i} day={d} size={size} />
      ))}
    </span>
  );
}

/** 2-letter weekday key, muted, weekends dimmer — a distinct channel. */
export function WeekKey({ size = "sm" }: { size?: Size }): React.ReactElement {
  const sz = SIZES[size];
  return (
    <span className="inline-flex items-center gap-0.5">
      {DAY_LABELS.map((d, i) => (
        <span
          key={i}
          className={`${sz.slot} text-center font-semibold leading-none ${
            i === 0 || i === 6 ? "text-text-muted/70" : "text-text-muted"
          }`}
        >
          {d.slice(0, 2)}
        </span>
      ))}
    </span>
  );
}
