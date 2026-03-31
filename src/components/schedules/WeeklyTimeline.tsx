"use client";

/**
 * WeeklyTimeline — 주간 스케줄을 직원×요일 그리드로 표시하는 컴포넌트.
 *
 * Staff rows × Mon–Sun day columns + Total column.
 * Summary rows: Headcount, Total Time (confirmed/pending dual-line), Labor Cost.
 * OT warning: >40h weekly turns red + OT badge.
 * Shift chip: work role + time range + net hours + status color + hover tooltip.
 */

import React, { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import type { Schedule } from "@/types";
import type { ScheduleStatus } from "@/components/schedules/ShiftBar";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WeeklyEntry {
  schedule: Schedule;
  status: ScheduleStatus;
  hourlyRate: number | null;
  isEmpty?: boolean;
}

interface WeeklyTimelineProps {
  /** ISO date string for Monday of the displayed week (YYYY-MM-DD) */
  weekStart: Date;
  /** All schedule entries for the week */
  entries: WeeklyEntry[];
  /** Whether to show rejected schedules */
  showRejected: boolean;
  /** Weekly OT threshold in hours (default 40) */
  overtimeLimit?: number;
  /** Called when a shift chip is clicked */
  onScheduleClick: (schedule: Schedule) => void;
  /** Called when an empty day cell is clicked */
  onEmptyCellClick: (date: string) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Parse "HH:MM" or "HH:MM:SS" to decimal hours */
function parseTime(t: string | null | undefined): number | null {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  if (isNaN(h)) return null;
  return h + (m || 0) / 60;
}

/** Format "HH:MM" or "HH:MM:SS" → "H:MM AM/PM" */
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

/** Short time label: "14:30" → "2:30P", "07:00" → "7A" */
function shortTime(t: string | null): string {
  if (!t) return "";
  const parts = t.split(":");
  const h = parseInt(parts[0], 10);
  const m = parts[1] || "00";
  if (isNaN(h)) return t;
  const norm = ((h % 24) + 24) % 24;
  const ampm = norm < 12 ? "A" : "P";
  const hour12 = norm % 12 === 0 ? 12 : norm % 12;
  const mStr = m.slice(0, 2);
  return mStr === "00" ? `${hour12}${ampm}` : `${hour12}:${mStr}${ampm}`;
}

/** Net work minutes for an entry */
function netMinutes(entry: WeeklyEntry): number {
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

/** Human-readable status */
function statusLabel(s: ScheduleStatus): string {
  switch (s) {
    case "confirmed": return "Confirmed";
    case "pending": return "Pending";
    case "modified": return "Modified";
    case "rejected": return "Rejected";
  }
}

/** Add days to a date */
function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

/** Date → "YYYY-MM-DD" */
function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** "Sun", "Mon", … "Sat" (US week starts on Sunday) */
const SHORT_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// ─── Shift Chip ───────────────────────────────────────────────────────────────

interface ShiftChipProps {
  entry: WeeklyEntry;
  onClick: () => void;
}

function ShiftChip({ entry, onClick }: ShiftChipProps): React.ReactElement {
  const [tooltipVisible, setTooltipVisible] = useState(false);

  const { schedule, status, hourlyRate } = entry;
  const netH = netMinutes(entry) / 60;
  const cost = netH * (hourlyRate ?? 0);

  const timeRange =
    schedule.start_time && schedule.end_time
      ? `${shortTime(schedule.start_time)}–${shortTime(schedule.end_time)}`
      : "–";

  const breakLabel =
    schedule.break_start_time && schedule.break_end_time
      ? `${formatTimeStr(schedule.break_start_time)}–${formatTimeStr(schedule.break_end_time)}`
      : null;

  return (
    <div
      className={cn(
        "relative flex flex-col items-center gap-px px-1.5 py-1 rounded cursor-pointer transition-all duration-150 border-l-[3px]",
        "hover:shadow-[0_0_0_1px_rgba(108,92,231,0.3)]",
        status === "confirmed" && "bg-[rgba(0,184,148,0.1)] border-l-[#00B894]",
        status === "modified" && "bg-[rgba(240,165,0,0.1)] border-l-[#F0A500]",
        status === "pending" && "bg-[rgba(108,92,231,0.1)] border border-dashed border-[rgba(108,92,231,0.4)] border-l-[3px] border-l-[#6C5CE7]",
        status === "rejected" && "bg-[rgba(255,107,107,0.1)] border-l-[#FF6B6B] opacity-50",
      )}
      onClick={onClick}
      onMouseEnter={() => setTooltipVisible(true)}
      onMouseLeave={() => setTooltipVisible(false)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onClick(); }}
    >
      {/* Role label */}
      {schedule.work_role_name && (
        <span className="text-[9px] font-semibold text-accent whitespace-nowrap truncate max-w-full">
          {schedule.work_role_name}
        </span>
      )}

      {/* Time range */}
      <span
        className={cn(
          "text-[10px] font-semibold text-text whitespace-nowrap",
          status === "rejected" && "line-through",
        )}
      >
        {timeRange}
      </span>

      {/* Net hours */}
      <span className="text-[9px] font-medium text-text-muted">
        {netH.toFixed(1)}h
      </span>

      {/* Hover tooltip */}
      {tooltipVisible && (
        <div
          className="absolute bottom-[calc(100%+6px)] left-1/2 -translate-x-1/2 bg-card border border-border shadow-[0_4px_16px_rgba(0,0,0,0.4)] rounded px-3 py-2 whitespace-nowrap z-30 pointer-events-none"
          style={{ fontSize: "11px", minWidth: "180px" }}
        >
          <div className="font-bold text-text text-xs">{schedule.user_name ?? "Unknown"}</div>
          {schedule.work_role_name && (
            <div style={{ color: "var(--color-accent)", fontSize: "10px", marginTop: "2px" }}>
              {schedule.work_role_name}
            </div>
          )}
          <div style={{ color: "var(--color-text-secondary)", marginTop: "3px" }}>
            {formatTimeStr(schedule.start_time)} – {formatTimeStr(schedule.end_time)}
            {breakLabel && <> · Break {breakLabel}</>}
          </div>
          <div style={{ color: "var(--color-accent)", fontWeight: 600, marginTop: "2px" }}>
            Net: {netH.toFixed(1)}h
          </div>
          {cost > 0 && (
            <div style={{ color: "var(--color-text-secondary)", marginTop: "1px" }}>
              Est. ${cost.toFixed(2)}
            </div>
          )}
          <div
            className={cn(
              "mt-1 text-[10px] font-bold uppercase",
              status === "confirmed" && "text-[var(--color-success)]",
              status === "pending" && "text-[var(--color-accent)]",
              status === "modified" && "text-[var(--color-warning)]",
              status === "rejected" && "text-[var(--color-danger)]",
            )}
          >
            {statusLabel(status)}
          </div>
          <div
            className="mt-1 pt-1 border-t border-border text-[9px] text-text-muted"
          >
            Click to view detail
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function WeeklyTimeline({
  weekStart,
  entries,
  showRejected,
  overtimeLimit = 40,
  onScheduleClick,
  onEmptyCellClick,
}: WeeklyTimelineProps): React.ReactElement {
  // Week days: Monday=0 … Sunday=6
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );

  const dayStrings = useMemo(() => days.map(toDateStr), [days]);

  // Today's date string for column highlight
  const todayStr = useMemo(() => toDateStr(new Date()), []);

  // Filter visible entries (rejected hidden unless showRejected)
  const visibleEntries = useMemo(
    () => entries.filter((e) => showRejected || e.status !== "rejected"),
    [entries, showRejected],
  );

  // Group entries by user_id and by work_date
  // Map: userId → { name, hourlyRate, Map<dateStr, entry[]> }
  const staffMap = useMemo(() => {
    const map = new Map<string, {
      userId: string;
      name: string;
      hourlyRate: number | null;
      byDay: Map<string, WeeklyEntry[]>;
    }>();

    for (const entry of visibleEntries) {
      const uid = entry.schedule.user_id;
      if (!map.has(uid)) {
        map.set(uid, {
          userId: uid,
          name: entry.schedule.user_name ?? "Unknown",
          hourlyRate: entry.hourlyRate,
          byDay: new Map(),
        });
      }
      // Skip isEmpty placeholder entries — they only provide staff name
      if (entry.isEmpty) continue;
      const staff = map.get(uid)!;
      const d = entry.schedule.work_date;
      if (!staff.byDay.has(d)) staff.byDay.set(d, []);
      staff.byDay.get(d)!.push(entry);
    }

    return map;
  }, [visibleEntries]);

  const staffRows = useMemo(() => Array.from(staffMap.values()), [staffMap]);

  // ── Per-day summary calculations ──────────────────────────────────────────

  const daySummary = useMemo(() => {
    return dayStrings.map((dateStr) => {
      const dayEntries = visibleEntries.filter(
        (e) => e.schedule.work_date === dateStr && e.status !== "rejected" && !e.isEmpty,
      );

      const confirmedEntries = dayEntries.filter((e) => e.status === "confirmed" || e.status === "modified");
      const pendingEntries = dayEntries.filter((e) => e.status === "pending");

      const confirmedHeadcount = new Set(confirmedEntries.map((e) => e.schedule.user_id)).size;
      const pendingHeadcount = new Set(pendingEntries.map((e) => e.schedule.user_id)).size;
      const confirmedHours = confirmedEntries.reduce((sum, e) => sum + netMinutes(e) / 60, 0);
      const pendingHours = pendingEntries.reduce((sum, e) => sum + netMinutes(e) / 60, 0);
      const confirmedLaborCost = confirmedEntries.reduce((sum, e) => sum + (netMinutes(e) / 60) * (e.hourlyRate ?? 0), 0);
      const pendingLaborCost = pendingEntries.reduce((sum, e) => sum + (netMinutes(e) / 60) * (e.hourlyRate ?? 0), 0);

      return { confirmedHeadcount, pendingHeadcount, confirmedHours, pendingHours, confirmedLaborCost, pendingLaborCost };
    });
  }, [dayStrings, visibleEntries]);

  // Totals across the week
  const weekTotals = useMemo(() => ({
    confirmedHours: daySummary.reduce((s, d) => s + d.confirmedHours, 0),
    pendingHours: daySummary.reduce((s, d) => s + d.pendingHours, 0),
    confirmedLaborCost: daySummary.reduce((s, d) => s + d.confirmedLaborCost, 0),
    pendingLaborCost: daySummary.reduce((s, d) => s + d.pendingLaborCost, 0),
    totalStaff: new Set(visibleEntries.filter((e) => !e.isEmpty && e.status !== "rejected").map((e) => e.schedule.user_id)).size,
  }), [daySummary, visibleEntries]);

  // ── Per-staff weekly totals ────────────────────────────────────────────────

  function staffWeeklyHours(staff: (typeof staffRows)[0]): {
    totalH: number;
    confirmedH: number;
    pendingH: number;
    cost: number;
    isOT: boolean;
  } {
    let totalH = 0;
    let confirmedH = 0;
    let pendingH = 0;
    let cost = 0;

    for (const [, dayEntries] of staff.byDay) {
      for (const e of dayEntries) {
        if (e.status === "rejected") continue;
        const h = netMinutes(e) / 60;
        totalH += h;
        if (e.status === "confirmed" || e.status === "modified") {
          confirmedH += h;
          cost += h * (e.hourlyRate ?? 0);
        } else if (e.status === "pending") {
          pendingH += h;
        }
      }
    }

    return { totalH, confirmedH, pendingH, cost, isOT: totalH > overtimeLimit };
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div
      className="bg-card border border-border rounded-xl overflow-x-auto mb-3.5"
      style={{ WebkitOverflowScrolling: "touch" } as React.CSSProperties}
    >
      <table
        className="border-collapse w-full"
        style={{ minWidth: "900px" }}
      >
        <thead>
          <tr>
            {/* Staff column header — sticky left */}
            <th className="text-left pl-4 py-2 text-[11px] font-semibold uppercase tracking-[0.04em] text-text-muted bg-surface sticky left-0 z-[10] w-[200px] min-w-[200px] border-b border-r border-border">
              Staff
            </th>

            {/* Day headers */}
            {days.map((day, i) => {
              const dateStr = dayStrings[i];
              const isToday = dateStr === todayStr;
              return (
                <th
                  key={dateStr}
                  className={cn(
                    "p-2 text-center bg-surface border-b border-r border-border sticky top-0 z-[5]",
                    isToday && "text-accent bg-[var(--color-accent-muted)]",
                  )}
                >
                  <span className="block text-[10px] font-medium text-text-muted">
                    {SHORT_DAYS[i]}
                  </span>
                  <span className={cn(
                    "block text-[13px] font-bold",
                    isToday ? "text-accent" : "text-text",
                  )}>
                    {day.getDate()}
                  </span>
                </th>
              );
            })}

            {/* Total column */}
            <th className="w-[80px] min-w-[80px] bg-surface text-[11px] font-semibold uppercase tracking-[0.04em] text-text-muted border-b border-l border-border sticky top-0 z-[5] p-2">
              Total
            </th>
          </tr>
        </thead>

        <tbody>
          {/* ── Headcount summary row (dual-line: confirmed/pending) ──── */}
          <tr className="bg-[var(--color-summary-warning)]">
            <td className="sticky left-0 z-[3] min-w-[200px] py-2 pl-4 text-left text-xs text-text-secondary border-b border-r border-border bg-[var(--color-summary-warning)]">
              Headcount
            </td>
            {daySummary.map((s, i) => (
              <td key={dayStrings[i]} className={cn("border-b border-r border-border text-center p-1.5", dayStrings[i] === todayStr && "bg-[rgba(108,92,231,0.06)]")}>
                <div className="flex flex-col items-center gap-0 leading-snug">
                  {s.confirmedHeadcount > 0
                    ? <span className="text-[11px] font-extrabold text-[var(--color-success)]">{s.confirmedHeadcount}</span>
                    : <span className="text-[11px] font-semibold text-text-muted opacity-35">0</span>}
                  {s.pendingHeadcount > 0
                    ? <span className="text-[11px] font-extrabold text-warning">{s.pendingHeadcount}</span>
                    : <span className="text-[11px] font-semibold text-text-muted opacity-35">0</span>}
                </div>
              </td>
            ))}
            <td className="border-b border-l border-border bg-[var(--color-summary-warning)] px-2 text-center sticky right-0 z-[3]">
              <div className="text-sm font-extrabold text-text">{weekTotals.totalStaff}</div>
              <div className="text-[10px] text-text-muted">staff</div>
            </td>
          </tr>

          {/* ── Total Time summary row (dual-line) ────────────────────────── */}
          <tr className="bg-[var(--color-summary-accent)]">
            <td className="sticky left-0 z-[3] min-w-[200px] py-2 pl-4 text-left text-xs font-bold text-text border-b border-r border-border bg-[var(--color-summary-accent)]">
              Total Time
            </td>
            {daySummary.map((s, i) => (
              <td key={dayStrings[i]} className={cn("border-b border-r border-border text-center p-1.5", dayStrings[i] === todayStr && "bg-[rgba(108,92,231,0.06)]")}>
                <div className="flex flex-col items-center gap-0 leading-snug">
                  {s.confirmedHours > 0
                    ? <span className="text-[12px] font-extrabold text-[var(--color-success)]">{s.confirmedHours.toFixed(2)}</span>
                    : <span className="text-[12px] font-semibold text-text-muted opacity-35">0</span>}
                  {s.pendingHours > 0
                    ? <span className="text-[12px] font-extrabold text-warning">{s.pendingHours.toFixed(2)}</span>
                    : <span className="text-[12px] font-semibold text-text-muted opacity-35">0</span>}
                </div>
              </td>
            ))}
            <td className="border-b border-l border-border bg-[var(--color-summary-accent)] px-2 text-center sticky right-0 z-[3]">
              <div className="text-sm font-extrabold text-[var(--color-success)]">{weekTotals.confirmedHours.toFixed(2)}</div>
              {weekTotals.pendingHours > 0 && (
                <div className="text-[10px] font-bold text-warning">{weekTotals.pendingHours.toFixed(2)} pend</div>
              )}
            </td>
          </tr>

          {/* ── Labor Cost summary row (dual-line) ────────────────────────── */}
          <tr className="bg-[var(--color-summary-success)]">
            <td className="sticky left-0 z-[3] min-w-[200px] py-2 pl-4 text-left text-xs text-[var(--color-success)] border-b border-r border-border bg-[var(--color-summary-success)]">
              Labor Cost
            </td>
            {daySummary.map((s, i) => (
              <td key={dayStrings[i]} className={cn("border-b border-r border-border text-center p-1.5", dayStrings[i] === todayStr && "bg-[rgba(108,92,231,0.04)]")}>
                <div className="flex flex-col items-center gap-0 leading-snug">
                  {s.confirmedLaborCost > 0
                    ? <span className="text-[11px] font-bold text-[var(--color-success)]">${Math.round(s.confirmedLaborCost)}</span>
                    : <span className="text-[11px] font-semibold text-text-muted opacity-35">$0</span>}
                  {s.pendingLaborCost > 0
                    ? <span className="text-[11px] font-bold text-warning">${Math.round(s.pendingLaborCost)}</span>
                    : <span className="text-[11px] font-semibold text-text-muted opacity-35">$0</span>}
                </div>
              </td>
            ))}
            <td className="border-b border-l border-border bg-[var(--color-summary-success)] px-2 text-center sticky right-0 z-[3]">
              <div className="text-sm font-extrabold text-[var(--color-success)]">${Math.round(weekTotals.confirmedLaborCost)}</div>
              {weekTotals.pendingLaborCost > 0 && (
                <div className="text-[10px] font-bold text-warning">${Math.round(weekTotals.pendingLaborCost)} pend</div>
              )}
            </td>
          </tr>

          {/* ── Staff rows ────────────────────────────────────────────────── */}
          {staffRows.length === 0 ? (
            <tr>
              <td
                colSpan={9}
                className="text-center py-8 text-text-muted text-sm border-b border-border"
              >
                No schedules for this week.
              </td>
            </tr>
          ) : (
            staffRows.map((staff) => {
              const weekly = staffWeeklyHours(staff);

              return (
                <tr key={staff.userId}>
                  {/* Staff name cell — sticky left */}
                  <td className="sticky left-0 z-[3] bg-surface min-w-[200px] px-4 py-2.5 text-left border-b border-r border-border">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[13px] font-bold text-text">
                        {staff.name}
                      </span>
                      {weekly.isOT && (
                        <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[9px] font-bold bg-[var(--color-danger-muted)] text-[var(--color-danger)]">
                          OT
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-text-muted mt-0.5">
                      {staff.hourlyRate ? `$${staff.hourlyRate}/hr` : "—"}
                    </div>
                  </td>

                  {/* Day cells */}
                  {dayStrings.map((dateStr) => {
                    const dayEntries = staff.byDay.get(dateStr) ?? [];
                    const isToday = dateStr === todayStr;

                    return (
                      <td
                        key={dateStr}
                        className={cn(
                          "border-b border-r border-border p-[6px_4px] align-middle",
                          isToday && "bg-[rgba(108,92,231,0.04)]",
                          "hover:bg-[var(--color-surface-hover)] cursor-pointer",
                        )}
                        onClick={() => {
                          if (dayEntries.length === 0) onEmptyCellClick(dateStr);
                        }}
                      >
                        {dayEntries.length === 0 ? (
                          <span className="text-[10px] text-text-muted italic">OFF</span>
                        ) : (
                          <div className="flex flex-col gap-1">
                            {dayEntries.map((entry) => (
                              <ShiftChip
                                key={entry.schedule.id}
                                entry={entry}
                                onClick={() => onScheduleClick(entry.schedule)}
                              />
                            ))}
                          </div>
                        )}
                      </td>
                    );
                  })}

                  {/* Total column */}
                  <td className="border-b border-l border-border bg-surface px-2 py-1.5 text-center">
                    <div
                      className={cn(
                        "text-[15px] font-extrabold",
                        weekly.isOT ? "text-[var(--color-danger)]" : "text-text",
                      )}
                    >
                      {weekly.totalH.toFixed(1)}h
                    </div>
                    {weekly.cost > 0 && (
                      <div className="text-[10px] text-text-muted mt-px">
                        ${Math.round(weekly.cost)}
                      </div>
                    )}
                    {weekly.isOT && (
                      <span className="inline-flex items-center gap-0.5 px-1 py-0.5 rounded text-[9px] font-bold bg-[var(--color-danger-muted)] text-[var(--color-danger)] mt-0.5">
                        OT
                      </span>
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
