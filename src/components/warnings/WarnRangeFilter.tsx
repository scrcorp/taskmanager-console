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
import React, { useEffect, useRef, useState } from "react";

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

export function WarnRangeFilter({ lo, hi, open, onOpenChange, onChange, onClear }: Props): React.ReactElement {
  const ref = useRef<HTMLDivElement>(null);
  const active = !(lo === 0 && hi === WARN_MAX);
  const chip = active ? (lo === hi ? labelOf(lo) : `${labelOf(lo)}–${labelOf(hi)}`) : null;

  // Custom drag: a translucent ghost follows the cursor; the actual value
  // (and the filter) commit only on RELEASE — no live re-filtering while dragging.
  const [dragging, setDragging] = useState<null | "lo" | "hi">(null);
  const [ghost, setGhost] = useState(0);
  const trackRef = useRef<HTMLDivElement>(null);
  const loRef = useRef(lo);
  loRef.current = lo;
  const hiRef = useRef(hi);
  hiRef.current = hi;
  const ghostRef = useRef(ghost);
  ghostRef.current = ghost;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const justDraggedRef = useRef(false);

  useEffect(() => {
    if (!dragging) return;
    const move = (e: PointerEvent): void => {
      const rect = trackRef.current?.getBoundingClientRect();
      if (!rect || rect.width === 0) return;
      const ratio = (e.clientX - rect.left) / rect.width;
      setGhost(Math.max(0, Math.min(WARN_MAX, Math.round(ratio * WARN_MAX))));
    };
    const up = (): void => {
      const v = ghostRef.current;
      if (dragging === "lo") onChangeRef.current(Math.min(v, hiRef.current), hiRef.current);
      else onChangeRef.current(loRef.current, Math.max(v, loRef.current));
      justDraggedRef.current = true;
      setTimeout(() => {
        justDraggedRef.current = false;
      }, 0);
      setDragging(null);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [dragging]);

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
  /** Click-to-move: move whichever handle is nearer to the clicked value. */
  function moveNearest(v: number): void {
    const cv = Math.max(0, Math.min(WARN_MAX, v));
    if (Math.abs(cv - lo) <= Math.abs(cv - hi)) setLo(cv);
    else setHi(cv);
  }
  function onTrackClick(e: React.MouseEvent<HTMLDivElement>): void {
    if (justDraggedRef.current) return; // ignore the click that fires right after a drag
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = rect.width > 0 ? (e.clientX - rect.left) / rect.width : 0;
    moveNearest(Math.round(ratio * WARN_MAX));
  }
  function startDrag(handle: "lo" | "hi", e: React.PointerEvent): void {
    e.stopPropagation();
    e.preventDefault();
    setGhost(handle === "lo" ? lo : hi);
    setDragging(handle);
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

          {/* dual-handle slider — drag a thumb, or click the track / a number below */}
          <div ref={trackRef} className="relative mt-7 h-5 cursor-pointer" onClick={onTrackClick}>
            <div className="absolute inset-x-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-border" />
            <div
              className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-accent"
              style={{ left: `${pct(lo)}%`, width: `${pct(hi) - pct(lo)}%` }}
            />
            {/* real handles — stay put while dragging; commit on release */}
            <button
              type="button"
              aria-label="Minimum warnings"
              onPointerDown={(e) => startDrag("lo", e)}
              className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-accent shadow cursor-grab active:cursor-grabbing"
              style={{ left: `${pct(lo)}%`, zIndex: 3 }}
            />
            <button
              type="button"
              aria-label="Maximum warnings"
              onPointerDown={(e) => startDrag("hi", e)}
              className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-accent shadow cursor-grab active:cursor-grabbing"
              style={{ left: `${pct(hi)}%`, zIndex: 3 }}
            />
            {/* translucent ghost that follows the cursor while dragging */}
            {dragging && (
              <>
                <div
                  className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-accent/40 shadow"
                  style={{ left: `${pct(ghost)}%`, zIndex: 4 }}
                />
                <div
                  className="pointer-events-none absolute -top-7 z-10 -translate-x-1/2 rounded-md bg-accent/70 px-1.5 py-0.5 text-[11px] font-bold text-white tabular-nums shadow-md"
                  style={{ left: `${pct(ghost)}%` }}
                >
                  {labelOf(ghost)}
                </div>
              </>
            )}
          </div>

          <div className="mt-1 flex justify-between">
            {LABELS.map((l, i) => {
              const inRange = i >= lo && i <= hi;
              return (
                <button
                  key={l}
                  type="button"
                  onClick={() => moveNearest(i)}
                  className={`w-6 rounded text-[11px] font-semibold tabular-nums py-0.5 transition-colors ${
                    inRange ? "text-accent" : "text-text-muted hover:text-text"
                  }`}
                >
                  {l}
                </button>
              );
            })}
          </div>

          <div className="mt-3 text-[11px] text-text-muted">
            {active
              ? lo === hi
                ? `Showing staff with ${labelOf(lo)} warning${lo === 1 ? "" : "s"}.`
                : `Showing staff with ${labelOf(lo)}–${labelOf(hi)} warnings.`
              : "All staff (click or drag to 1+ to show only those with warnings)."}
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
