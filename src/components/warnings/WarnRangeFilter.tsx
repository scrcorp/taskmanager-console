"use client";

/**
 * Staff list — warning-count range filter (dual-handle slider, 0..5+).
 *
 * One control does two jobs:
 *   - left handle ≥ 1  → "staff with warnings only" (active count ≥ min)
 *   - right handle      → upper bound (5 = "5+", no cap)
 *   - [0, 5] (default)  → no filter (All)
 *
 * Counts are by ACTIVE (valid, non-retracted) warnings.
 */
import React, { useEffect, useRef } from "react";

export const WARN_MAX = 5; // 5 represents "5+"
const LABELS = ["0", "1", "2", "3", "4", "5+"];

function labelOf(v: number): string {
  return LABELS[v] ?? String(v);
}

interface Props {
  lo: number;
  hi: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (lo: number, hi: number) => void;
  onClear: () => void;
}

const THUMB =
  "pointer-events-none absolute inset-x-0 top-0 h-5 w-full cursor-pointer appearance-none bg-transparent " +
  "[&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:bg-accent [&::-webkit-slider-thumb]:shadow " +
  "[&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:h-4 [&::-moz-range-thumb]:w-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-white [&::-moz-range-thumb]:bg-accent " +
  "[&::-webkit-slider-runnable-track]:bg-transparent [&::-moz-range-track]:bg-transparent";

export function WarnRangeFilter({ lo, hi, open, onOpenChange, onChange, onClear }: Props): React.ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  const active = !(lo === 0 && hi === WARN_MAX);
  const chip = active ? (lo === hi ? labelOf(lo) : `${labelOf(lo)}–${labelOf(hi)}`) : null;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onOpenChange(false);
    };
    const t = setTimeout(() => document.addEventListener("mousedown", onDown), 0);
    return () => {
      clearTimeout(t);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open, onOpenChange]);

  const pct = (v: number) => (v / WARN_MAX) * 100;

  function setLo(v: number): void {
    onChange(Math.min(v, hi), hi);
  }
  function setHi(v: number): void {
    onChange(lo, Math.max(v, lo));
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        className={`inline-flex items-center gap-1.5 rounded-lg border px-3 h-9 text-sm font-medium transition-colors ${
          active
            ? "border-accent/40 bg-accent-muted text-accent"
            : "border-border bg-surface text-text-secondary hover:text-text"
        } ${open ? "ring-2 ring-accent/20" : ""}`}
      >
        Warnings
        {chip && (
          <span className="rounded-full bg-accent px-1.5 text-[11px] font-bold text-white tabular-nums">{chip}</span>
        )}
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className={`transition-transform ${open ? "rotate-180" : ""}`}>
          <polyline points="2.5 4 5 6.5 7.5 4" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-full z-30 mt-1 w-64 rounded-lg border border-border bg-card p-4 shadow-lg">
          <div className="mb-3 text-xs font-semibold text-text-secondary">Filter by warning count</div>

          {/* dual-handle slider */}
          <div className="relative h-5">
            <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-border" />
            <div
              className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-accent"
              style={{ left: `${pct(lo)}%`, width: `${pct(hi) - pct(lo)}%` }}
            />
            <input
              type="range"
              min={0}
              max={WARN_MAX}
              step={1}
              value={lo}
              onChange={(e) => setLo(Number(e.target.value))}
              aria-label="Minimum warnings"
              className={THUMB}
              style={{ zIndex: lo >= hi ? 4 : 3 }}
            />
            <input
              type="range"
              min={0}
              max={WARN_MAX}
              step={1}
              value={hi}
              onChange={(e) => setHi(Number(e.target.value))}
              aria-label="Maximum warnings"
              className={THUMB}
              style={{ zIndex: 3 }}
            />
          </div>

          <div className="mt-2 flex justify-between text-[10px] text-text-muted tabular-nums">
            {LABELS.map((l) => (
              <span key={l}>{l}</span>
            ))}
          </div>

          <div className="mt-3 text-[11px] text-text-muted">
            {active
              ? lo === hi
                ? `Showing staff with ${labelOf(lo)} warning${lo === 1 ? "" : "s"}.`
                : `Showing staff with ${labelOf(lo)}–${labelOf(hi)} warnings.`
              : "All staff (drag the left handle to 1+ to show only those with warnings)."}
          </div>

          {active && (
            <button
              type="button"
              onClick={onClear}
              className="mt-3 text-xs font-semibold text-accent hover:underline"
            >
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
}
