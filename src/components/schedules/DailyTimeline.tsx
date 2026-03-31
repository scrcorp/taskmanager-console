"use client";

/**
 * DailyTimeline — 하루 단위 스케줄을 시간대별 그리드로 표시하는 타임라인 컴포넌트.
 *
 * Shows a 24-hour grid (day_start_time → +24h) with:
 *  - Summary rows: Headcount, Total Time (confirmed/pending dual-line), Labor Cost
 *  - One row per schedule entry with a ShiftBar
 *  - Columns after midnight marked +1 with a dashed separator
 *  - Current-hour column highlight
 */

import React, { useMemo } from "react";
import { cn } from "@/lib/utils";
import { ShiftBar } from "@/components/schedules/ShiftBar";
import type { ScheduleStatus } from "@/components/schedules/ShiftBar";
import type { Schedule } from "@/types";

// ─── Re-export for consumers ──────────────────────────────────────────────────
export type { ScheduleStatus };

/** Schedule entry enriched with derived timeline fields */
export interface TimelineEntry {
  schedule: Schedule;
  /** Effective status (maps "cancelled" → "rejected") */
  status: ScheduleStatus;
  /** Effective hourly rate (from schedule override or user default, null if unknown) */
  hourlyRate: number | null;
  /** True if this is a placeholder row for a staff member with no schedule */
  isEmpty?: boolean;
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface DailyTimelineProps {
  /** Date being displayed (YYYY-MM-DD) */
  date: string;
  /** All schedule entries for this date (and carryover from previous day) */
  entries: TimelineEntry[];
  /** Hour the day starts (0–23), default 6 */
  dayStartHour: number;
  /** Whether to show rejected schedules */
  showRejected: boolean;
  /** Called when a shift bar is clicked */
  onScheduleClick: (schedule: Schedule) => void;
  /** Called when an empty time cell is clicked */
  onEmptyCellClick: (hour: number, userId?: string) => void;
}

// ─── Time helpers ─────────────────────────────────────────────────────────────

/** Parse "HH:MM" or "HH:MM:SS" to decimal hours (e.g. "14:30" → 14.5) */
function parseTime(t: string | null | undefined): number | null {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  if (isNaN(h)) return null;
  return h + (m || 0) / 60;
}

/** Format decimal hours as "H:MM AM/PM" */
function formatHour(h: number): string {
  const norm = ((h % 24) + 24) % 24;
  const ampm = norm < 12 || norm === 0 ? "AM" : "PM";
  const hour12 = norm % 12 === 0 ? 12 : norm % 12;
  return `${hour12}:00 ${ampm}`;
}

/** Format "HH:MM" or "HH:MM:SS" as "H:MM AM/PM" */
function formatTimeStr(t: string | null): string {
  if (!t) return "";
  const parts = t.split(":");
  const h = parseInt(parts[0], 10);
  const m = parts[1] || "00";
  if (isNaN(h)) return t;
  const norm = ((h % 24) + 24) % 24;
  const ampm = norm < 12 ? "AM" : "PM";
  const hour12 = norm % 12 === 0 ? 12 : norm % 12;
  return `${hour12}:${m.slice(0, 2)} ${ampm}`;
}

/** Short column header: "6A", "12P", "1A +1", etc. */
function hourColLabel(absHour: number): { label: string; isNextDay: boolean } {
  const isNextDay = absHour >= 24;
  const norm = absHour % 24;
  const ampm = norm < 12 ? "A" : "P";
  const h = norm % 12 === 0 ? 12 : norm % 12;
  return { label: `${h}${ampm}`, isNextDay };
}

/** Compute net working minutes excluding break window */
function netMinutes(entry: TimelineEntry): number {
  // Use pre-computed value from API if available
  if (entry.schedule.net_work_minutes > 0) return entry.schedule.net_work_minutes;
  const start = parseTime(entry.schedule.start_time);
  const end = parseTime(entry.schedule.end_time);
  if (start === null || end === null) return 0;
  let total = (end - start) * 60;
  const bStart = parseTime(entry.schedule.break_start_time);
  const bEnd = parseTime(entry.schedule.break_end_time);
  if (bStart !== null && bEnd !== null) total -= (bEnd - bStart) * 60;
  return Math.max(0, total);
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DailyTimeline({
  date,
  entries,
  dayStartHour,
  showRejected,
  onScheduleClick,
  onEmptyCellClick,
}: DailyTimelineProps): React.ReactElement {
  // 24 hour columns starting from dayStartHour
  const hours = useMemo(
    () => Array.from({ length: 24 }, (_, i) => dayStartHour + i),
    [dayStartHour],
  );

  // Current hour (absolute, may exceed 23 if past midnight relative to start)
  const nowHour = useMemo(() => {
    const d = new Date();
    return d.getHours() + d.getMinutes() / 60;
  }, []);

  // Index of the first column that is "next day" (hour >= 24)
  const firstNextDayIdx = useMemo(
    () => hours.findIndex((h) => h >= 24),
    [hours],
  );

  // Visible entries (filter rejected if needed)
  const visibleEntries = useMemo(
    () => entries.filter((e) => showRejected || e.status !== "rejected"),
    [entries, showRejected],
  );

  // ── Summary calculations ──────────────────────────────────────────────────

  /**
   * For each hour slot, compute:
   *  - headcount: number of staff working (not on break, not rejected)
   *  - confirmedHours: total confirmed/modified hours in that slot
   *  - pendingHours: total pending hours in that slot
   *  - laborCost: total labor cost in that slot
   */
  const summary = useMemo(() => {
    return hours.map((absHour) => {
      // Each column represents [absHour, absHour+1) — one hour slot
      const slotStart = absHour;
      const slotEnd = absHour + 1;
      let confirmedHeadcount = 0;
      let pendingHeadcount = 0;
      let confirmedHours = 0;
      let pendingHours = 0;
      let confirmedLaborCost = 0;
      let pendingLaborCost = 0;

      for (const entry of visibleEntries) {
        if (entry.status === "rejected" || entry.isEmpty) continue;

        const start = parseTime(entry.schedule.start_time);
        const end = parseTime(entry.schedule.end_time);
        if (start === null || end === null) continue;

        const absStart = start < dayStartHour ? start + 24 : start;
        const absEnd = end <= start ? end + 24 : end;

        const overlapStart = Math.max(slotStart, absStart);
        const overlapEnd = Math.min(slotEnd, absEnd);
        if (overlapStart >= overlapEnd) continue;

        let breakOverlap = 0;
        const bStart = parseTime(entry.schedule.break_start_time);
        const bEnd = parseTime(entry.schedule.break_end_time);
        if (bStart !== null && bEnd !== null) {
          const absBStart = bStart < dayStartHour ? bStart + 24 : bStart;
          const absBEnd = bEnd <= bStart ? bEnd + 24 : bEnd;
          const bOverlapStart = Math.max(overlapStart, absBStart);
          const bOverlapEnd = Math.min(overlapEnd, absBEnd);
          if (bOverlapStart < bOverlapEnd) breakOverlap = bOverlapEnd - bOverlapStart;
        }

        const workedHours = (overlapEnd - overlapStart) - breakOverlap;
        if (workedHours <= 0) continue;

        const rate = entry.hourlyRate ?? 0;
        if (entry.status === "confirmed" || entry.status === "modified") {
          confirmedHeadcount++;
          confirmedHours += workedHours;
          confirmedLaborCost += workedHours * rate;
        } else if (entry.status === "pending") {
          pendingHeadcount++;
          pendingHours += workedHours;
          pendingLaborCost += workedHours * rate;
        }
      }

      return { confirmedHeadcount, pendingHeadcount, confirmedHours, pendingHours, confirmedLaborCost, pendingLaborCost };
    });
  }, [hours, visibleEntries, dayStartHour]);

  // Totals
  const totalConfirmedHours = useMemo(
    () => visibleEntries
      .filter((e) => !e.isEmpty && (e.status === "confirmed" || e.status === "modified"))
      .reduce((sum, e) => sum + netMinutes(e) / 60, 0),
    [visibleEntries],
  );
  const totalPendingHours = useMemo(
    () => visibleEntries
      .filter((e) => !e.isEmpty && e.status === "pending")
      .reduce((sum, e) => sum + netMinutes(e) / 60, 0),
    [visibleEntries],
  );
  const totalConfirmedLaborCost = useMemo(
    () => visibleEntries
      .filter((e) => !e.isEmpty && (e.status === "confirmed" || e.status === "modified"))
      .reduce((sum, e) => sum + (netMinutes(e) / 60) * (e.hourlyRate ?? 0), 0),
    [visibleEntries],
  );
  const totalPendingLaborCost = useMemo(
    () => visibleEntries
      .filter((e) => !e.isEmpty && e.status === "pending")
      .reduce((sum, e) => sum + (netMinutes(e) / 60) * (e.hourlyRate ?? 0), 0),
    [visibleEntries],
  );

  // ── Per-entry shift bar position helpers ────────────────────────────────

  /** Compute bar position (colIndex, spanCols, breakLeftPct, breakWidthPct) for a given entry */
  function shiftPosition(entry: TimelineEntry): {
    startColIdx: number;
    endColIdx: number;
    breakLeftFrac: number | null;
    breakWidthFrac: number | null;
    leftPct: number;
    widthPct: number;
  } {
    const start = parseTime(entry.schedule.start_time);
    const end = parseTime(entry.schedule.end_time);
    if (start === null || end === null) return { startColIdx: -1, endColIdx: -1, breakLeftFrac: null, breakWidthFrac: null, leftPct: 0, widthPct: 1 };

    const absStart = start < dayStartHour ? start + 24 : start;
    const absEnd = end <= start ? end + 24 : end;

    // Clamp to timeline range [dayStartHour, dayStartHour+24)
    const timelineStart = dayStartHour;
    const timelineEnd = dayStartHour + 24;
    const clampedStart = Math.max(absStart, timelineStart);
    const clampedEnd = Math.min(absEnd, timelineEnd);
    if (clampedStart >= clampedEnd) return { startColIdx: -1, endColIdx: -1, breakLeftFrac: null, breakWidthFrac: null, leftPct: 0, widthPct: 1 };

    const startColIdx = Math.floor(clampedStart - timelineStart);
    const endColIdx = Math.ceil(clampedEnd - timelineStart); // exclusive

    const totalSpanHours = clampedEnd - clampedStart;

    // Break position as fraction of total bar span
    const bStart = parseTime(entry.schedule.break_start_time);
    const bEnd = parseTime(entry.schedule.break_end_time);
    let breakLeftFrac: number | null = null;
    let breakWidthFrac: number | null = null;
    if (bStart !== null && bEnd !== null) {
      let absBStart = bStart < dayStartHour ? bStart + 24 : bStart;
      let absBEnd = bEnd <= bStart ? bEnd + 24 : bEnd;
      absBStart = Math.max(absBStart, clampedStart);
      absBEnd = Math.min(absBEnd, clampedEnd);
      if (absBEnd > absBStart) {
        breakLeftFrac = (absBStart - clampedStart) / totalSpanHours;
        breakWidthFrac = (absBEnd - absBStart) / totalSpanHours;
      }
    }

    // Fractional offset within the colspan: how much of the first/last column is actually worked
    const spanCols = endColIdx - startColIdx;
    const colStartAbs = timelineStart + startColIdx;
    const leftPct = (clampedStart - colStartAbs) / spanCols;
    const widthPct = (clampedEnd - clampedStart) / spanCols;

    return { startColIdx, endColIdx, breakLeftFrac, breakWidthFrac, leftPct, widthPct };
  }

  // ── Render ────────────────────────────────────────────────────────────────

  /** Render header label for a column */
  function renderHourHeader(absHour: number, idx: number): React.ReactElement {
    const { label, isNextDay } = hourColLabel(absHour);
    const isCurrent = Math.floor(nowHour) === absHour % 24;
    const isFirstNextDay = idx === firstNextDayIdx;

    return (
      <th
        key={absHour}
        className={cn(
          "p-[6px_2px] text-[11px] font-semibold text-text-muted bg-surface whitespace-nowrap sticky top-0 z-[5] min-w-[48px]",
          isCurrent && "text-accent bg-[var(--color-summary-accent)]",
          isNextDay && "bg-[rgba(255,255,255,0.02)]",
          isFirstNextDay && "border-l-2 border-dashed border-border",
        )}
      >
        {label}
        {isNextDay && (
          <span className="block text-[8px] font-bold text-warning leading-none">+1</span>
        )}
      </th>
    );
  }

  /** Render a table cell for a given hour in a summary/staff row */
  function renderHourCell(
    absHour: number,
    idx: number,
    content: React.ReactNode,
    extraClass?: string,
  ): React.ReactElement {
    const { isNextDay } = hourColLabel(absHour);
    const isCurrent = Math.floor(nowHour) === absHour % 24;
    const isFirstNextDay = idx === firstNextDayIdx;

    return (
      <td
        key={absHour}
        className={cn(
          "p-0 h-auto relative min-w-[48px] border-b border-r border-border text-center align-middle py-1",
          isCurrent && "!bg-[rgba(108,92,231,0.12)]",
          isNextDay && !isCurrent && "!bg-[rgba(255,255,255,0.03)]",
          isFirstNextDay && "border-l-2 border-dashed border-border",
          extraClass,
        )}
      >
        {content}
      </td>
    );
  }

  return (
    <div
      className="bg-card border border-border rounded-xl overflow-x-auto mb-3.5"
      style={{ WebkitOverflowScrolling: "touch" }}
    >
      <table
        className="border-collapse w-full"
        style={{ minWidth: "1400px" }}
      >
        <thead>
          <tr>
            {/* Staff column header — sticky left */}
            <th className="text-left pl-4 py-1.5 text-[11px] font-semibold text-text-muted bg-surface sticky left-0 z-[10] w-[220px] min-w-[220px] border-b border-r border-border">
              Staff
            </th>
            {hours.map((h, i) => renderHourHeader(h, i))}
            {/* Total column */}
            <th className="w-16 min-w-[64px] bg-surface text-[11px] font-semibold text-text-muted border-b border-l border-border sticky top-0 right-0 z-[11]">
              Total
            </th>
          </tr>
        </thead>

        <tbody>
          {/* ── Headcount summary row ───────────────────────────────────────── */}
          <tr className="bg-[var(--color-summary-warning)]">
            <td
              className="sticky left-0 z-[3] min-w-[220px] py-1.5 pl-4 text-left text-xs text-text-secondary border-b border-r border-border bg-[var(--color-summary-warning)]"
            >
              Headcount
            </td>
            {hours.map((absHour, idx) => {
              const { confirmedHeadcount: ch, pendingHeadcount: ph } = summary[idx];
              return renderHourCell(
                absHour,
                idx,
                <div className="flex flex-col items-center gap-0 leading-snug">
                  {ch > 0 ? (
                    <span className="text-[11px] font-extrabold text-[var(--color-success)]">{ch}</span>
                  ) : (
                    <span className="text-[11px] font-semibold text-text-muted opacity-35">0</span>
                  )}
                  {ph > 0 ? (
                    <span className="text-[11px] font-extrabold text-warning">{ph}</span>
                  ) : (
                    <span className="text-[11px] font-semibold text-text-muted opacity-35">0</span>
                  )}
                </div>,
              );
            })}
            <td className="border-b border-l border-border bg-[var(--color-summary-warning)] px-2 text-center sticky right-0 z-[3]">
              <div className="text-sm font-extrabold text-text">
                {new Set(visibleEntries.filter((e) => !e.isEmpty && e.status !== "rejected").map((e) => e.schedule.user_id)).size}
              </div>
              <div className="text-[10px] text-text-muted">people</div>
            </td>
          </tr>

          {/* ── Total Time summary row ──────────────────────────────────────── */}
          <tr className="bg-[var(--color-summary-accent)]">
            <td
              className="sticky left-0 z-[3] min-w-[220px] py-1.5 pl-4 text-left text-xs font-bold text-text border-b border-r border-border bg-[var(--color-summary-accent)]"
            >
              Total Time
            </td>
            {hours.map((absHour, idx) => {
              const { confirmedHours, pendingHours } = summary[idx];
              return renderHourCell(
                absHour,
                idx,
                <div className="flex flex-col items-center gap-0 leading-snug">
                  {confirmedHours > 0 ? (
                    <span className="text-[11px] font-extrabold text-[var(--color-success)]">{confirmedHours.toFixed(2)}</span>
                  ) : (
                    <span className="text-[11px] font-semibold text-text-muted opacity-35">0</span>
                  )}
                  {pendingHours > 0 ? (
                    <span className="text-[11px] font-extrabold text-warning">{pendingHours.toFixed(2)}</span>
                  ) : (
                    <span className="text-[11px] font-semibold text-text-muted opacity-35">0</span>
                  )}
                </div>,
              );
            })}
            <td className="border-b border-l border-border bg-[var(--color-summary-accent)] px-2 text-center sticky right-0 z-[3]">
              <div className="text-sm font-extrabold text-[var(--color-success)]">{totalConfirmedHours.toFixed(2)}</div>
              {totalPendingHours > 0 && (
                <div className="text-[10px] font-bold text-warning">{totalPendingHours.toFixed(2)} pend</div>
              )}
            </td>
          </tr>

          {/* ── Labor Cost summary row ──────────────────────────────────────── */}
          <tr className="bg-[var(--color-summary-success)]">
            <td
              className="sticky left-0 z-[3] min-w-[220px] py-1.5 pl-4 text-left text-xs text-[var(--color-success)] border-b border-r border-border bg-[var(--color-summary-success)]"
            >
              Labor Cost
            </td>
            {hours.map((absHour, idx) => {
              const { confirmedLaborCost: clc, pendingLaborCost: plc } = summary[idx];
              return renderHourCell(
                absHour,
                idx,
                <div className="flex flex-col items-center gap-0 leading-snug">
                  {clc > 0
                    ? <span className="text-[11px] font-bold text-[var(--color-success)]">${Math.round(clc)}</span>
                    : <span className="text-[11px] font-semibold text-text-muted opacity-35">$0</span>}
                  {plc > 0
                    ? <span className="text-[11px] font-bold text-warning">${Math.round(plc)}</span>
                    : <span className="text-[11px] font-semibold text-text-muted opacity-35">$0</span>}
                </div>,
              );
            })}
            <td className="border-b border-l border-border bg-[var(--color-summary-success)] px-2 text-center sticky right-0 z-[3]">
              <div className="text-sm font-extrabold text-[var(--color-success)]">${Math.round(totalConfirmedLaborCost)}</div>
              {totalPendingLaborCost > 0 && (
                <div className="text-[10px] font-bold text-warning">${Math.round(totalPendingLaborCost)} pend</div>
              )}
            </td>
          </tr>

          {/* ── Staff rows ──────────────────────────────────────────────────── */}
          {visibleEntries.length === 0 ? (
            <tr>
              <td
                colSpan={26}
                className="text-center py-8 text-text-muted text-sm border-b border-border"
              >
                No schedules for this day.
              </td>
            </tr>
          ) : (
            visibleEntries.map((entry) => {
              // Empty row for staff with no schedule
              if (entry.isEmpty) {
                return (
                  <tr key={entry.schedule.id}>
                    <td className="sticky left-0 z-[3] bg-surface min-w-[220px] px-4 py-2.5 text-left border-b border-r border-border">
                      <div className="text-[13px] font-bold text-text opacity-50">
                        {entry.schedule.user_name ?? "Unknown"}
                      </div>
                      <div className="text-[11px] text-text-muted mt-0.5">No schedule</div>
                    </td>
                    {hours.map((absHour, idx) => (
                      <td
                        key={absHour}
                        className={cn(
                          "p-0 h-12 relative min-w-[48px] border-b border-r border-border cursor-pointer group",
                          hourColLabel(absHour).isNextDay && "bg-[rgba(255,255,255,0.015)]",
                          idx === firstNextDayIdx && "border-l-2 border-dashed border-border",
                        )}
                        onClick={() => onEmptyCellClick(absHour % 24, entry.schedule.user_id)}
                      >
                        <span className="hidden group-hover:flex absolute inset-0 items-center justify-center text-text-muted opacity-30 hover:opacity-80 hover:text-accent transition-all duration-150 text-base">+</span>
                      </td>
                    ))}
                    <td className="border-b border-l border-border bg-surface px-2 py-1.5 text-center sticky right-0 z-[3]">
                      <div className="text-sm text-text-muted">—</div>
                    </td>
                  </tr>
                );
              }

              const pos = shiftPosition(entry);
              const netH = netMinutes(entry) / 60;
              const cost = netH * (entry.hourlyRate ?? 0);

              // Build the row: cells before shift start, colspan cell for shift, cells after
              const cells: React.ReactElement[] = [];

              if (pos.startColIdx === -1) {
                // Shift outside visible range — render all empty cells
                hours.forEach((absHour, idx) => {
                  cells.push(
                    <td
                      key={absHour}
                      className={cn(
                        "p-0 h-12 relative min-w-[48px] border-b border-r border-border",
                        hourColLabel(absHour).isNextDay && "bg-[rgba(255,255,255,0.015)]",
                        idx === firstNextDayIdx && "border-l-2 border-dashed border-border",
                        Math.floor(nowHour) === absHour % 24 && "bg-[rgba(108,92,231,0.05)]",
                      )}
                      onClick={() => onEmptyCellClick(absHour % 24, entry.schedule.user_id)}
                    >
                      <button className="hidden group-hover:flex absolute inset-0 w-full h-full items-center justify-center text-text-muted opacity-30 hover:opacity-80 hover:text-accent hover:bg-[var(--color-summary-accent)] text-base cursor-pointer border-none bg-transparent transition-all duration-150">
                        +
                      </button>
                    </td>,
                  );
                });
              } else {
                // Cells before shift
                for (let i = 0; i < pos.startColIdx; i++) {
                  const absHour = hours[i];
                  cells.push(
                    <td
                      key={absHour}
                      className={cn(
                        "p-0 h-12 relative min-w-[48px] border-b border-r border-border cursor-pointer",
                        hourColLabel(absHour).isNextDay && "bg-[rgba(255,255,255,0.015)]",
                        i === firstNextDayIdx && "border-l-2 border-dashed border-border",
                        Math.floor(nowHour) === absHour % 24 && "bg-[rgba(108,92,231,0.05)]",
                        "group",
                      )}
                      onClick={() => onEmptyCellClick(absHour % 24, entry.schedule.user_id)}
                    >
                      <span className="hidden group-hover:flex absolute inset-0 items-center justify-center text-text-muted opacity-30 hover:opacity-80 hover:text-accent transition-all duration-150 text-base">
                        +
                      </span>
                    </td>,
                  );
                }

                // Shift span cell
                const spanCols = pos.endColIdx - pos.startColIdx;
                const spanAbsHour = hours[pos.startColIdx];
                const isFirstNextDayInSpan = firstNextDayIdx >= pos.startColIdx && firstNextDayIdx < pos.endColIdx;

                cells.push(
                  <td
                    key={`shift-${entry.schedule.id}`}
                    colSpan={spanCols}
                    className={cn(
                      "p-0 h-12 relative border-b border-r border-border",
                      hourColLabel(spanAbsHour).isNextDay && "bg-[rgba(255,255,255,0.015)]",
                      isFirstNextDayInSpan && "border-l-2 border-dashed border-border",
                      Math.floor(nowHour) >= spanAbsHour % 24 && Math.floor(nowHour) < (hours[pos.endColIdx - 1] ?? spanAbsHour) % 24 && "bg-[rgba(108,92,231,0.05)]",
                    )}
                  >
                    <ShiftBar
                      staffName={entry.schedule.user_name ?? "Unknown"}
                      workRole={entry.schedule.work_role_name}
                      startLabel={formatTimeStr(entry.schedule.start_time)}
                      endLabel={formatTimeStr(entry.schedule.end_time)}
                      breakLabel={
                        entry.schedule.break_start_time && entry.schedule.break_end_time
                          ? `${formatTimeStr(entry.schedule.break_start_time)}–${formatTimeStr(entry.schedule.break_end_time)}`
                          : null
                      }
                      netHours={netH}
                      status={entry.status}
                      leftPct={pos.leftPct}
                      widthPct={pos.widthPct}
                      breakLeftFrac={pos.breakLeftFrac}
                      breakWidthFrac={pos.breakWidthFrac}
                      isCarryover={entry.schedule.work_date !== date}
                      onClick={() => onScheduleClick(entry.schedule)}
                    />
                  </td>,
                );

                // Cells after shift
                for (let i = pos.endColIdx; i < hours.length; i++) {
                  const absHour = hours[i];
                  cells.push(
                    <td
                      key={absHour}
                      className={cn(
                        "p-0 h-12 relative min-w-[48px] border-b border-r border-border cursor-pointer",
                        hourColLabel(absHour).isNextDay && "bg-[rgba(255,255,255,0.015)]",
                        i === firstNextDayIdx && "border-l-2 border-dashed border-border",
                        Math.floor(nowHour) === absHour % 24 && "bg-[rgba(108,92,231,0.05)]",
                        "group",
                      )}
                      onClick={() => onEmptyCellClick(absHour % 24, entry.schedule.user_id)}
                    >
                      <span className="hidden group-hover:flex absolute inset-0 items-center justify-center text-text-muted opacity-30 hover:opacity-80 hover:text-accent transition-all duration-150 text-base">
                        +
                      </span>
                    </td>,
                  );
                }
              }

              return (
                <tr key={entry.schedule.id}>
                  {/* Staff name cell — sticky left */}
                  <td
                    className="sticky left-0 z-[3] bg-surface min-w-[220px] px-4 py-2.5 text-left border-b border-r border-border"
                  >
                    <div className="text-[13px] font-bold text-text">
                      {entry.schedule.user_name ?? "Unknown"}
                    </div>
                    <div className="text-[11px] text-text-muted mt-0.5">
                      {entry.hourlyRate ? `$${entry.hourlyRate}/hr` : "—"}
                    </div>
                  </td>

                  {/* Hour cells with shift bar */}
                  {cells}

                  {/* Total column */}
                  <td className="border-b border-l border-border bg-surface px-2 py-1.5 text-center sticky right-0 z-[3]">
                    <div className="text-sm font-extrabold text-text">{netH.toFixed(2)}h</div>
                    {cost > 0 && (
                      <div className="text-[10px] text-text-muted">${Math.round(cost)}</div>
                    )}
                  </td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
