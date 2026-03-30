"use client";

/**
 * WeeklyRoleView — 주간 스케줄을 Work Role 기준으로 표시.
 *
 * 각 역할(role) = 1개 테이블 행.
 * - 왼쪽 셀: 역할명, Need/day, coverage dot
 * - 요일 셀: 해당 날짜에 배정된 staff chip들을 세로 스택
 *   (커버리지 비율 상단 표시 + ShiftChip per staff)
 * - 오른쪽 셀: 주간 총 시간 + 비용
 * Row height: min 56px, 가장 많은 날의 staff 수에 따라 동적 확장
 */

import React, { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import type { Schedule, WorkRole } from "@/types";
import type { WeeklyEntry } from "@/components/schedules/WeeklyTimeline";
import type { ScheduleStatus } from "@/components/schedules/ShiftBar";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WeeklyRoleViewProps {
  weekStart: Date;
  entries: WeeklyEntry[];
  workRoles: WorkRole[];
  showRejected: boolean;
  onScheduleClick: (schedule: Schedule) => void;
  onEmptyCellClick: (date: string) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parseTime(t: string | null | undefined): number | null {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  if (isNaN(h)) return null;
  return h + (m || 0) / 60;
}

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

function roleDisplayName(role: WorkRole): string {
  if (role.name) return role.name;
  const parts: string[] = [];
  if (role.shift_name) parts.push(role.shift_name);
  if (role.position_name) parts.push(role.position_name);
  return parts.join(" · ") || "Unknown Role";
}

type CoverageLevel = "full" | "partial" | "none";

/** Get headcount for a specific day. Respects use_per_day_headcount flag. */
const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
function getHeadcountForDate(role: WorkRole | null, dateStr: string): number {
  if (!role) return 0;
  if (role.use_per_day_headcount) {
    const d = new Date(dateStr + "T00:00:00");
    const dayKey = DAY_KEYS[d.getDay()];
    return role.headcount[dayKey] ?? role.headcount.all ?? 1;
  }
  return role.headcount.all ?? 1;
}

function getCoverage(confirmed: number, required: number): CoverageLevel {
  if (required === 0) return confirmed > 0 ? "partial" : "full"; // 0 needed: any assignment is over, 0 is OK
  if (confirmed >= required) return "full";
  if (confirmed > 0) return "partial";
  return "none";
}

const coverageTextColor: Record<CoverageLevel, string> = {
  full: "text-[var(--color-success)]",
  partial: "text-warning",
  none: "text-danger",
};

const coverageDotClass: Record<CoverageLevel, string> = {
  full: "bg-[var(--color-success)]",
  partial: "bg-warning",
  none: "bg-danger",
};

function statusLabel(s: ScheduleStatus): string {
  switch (s) {
    case "confirmed": return "Confirmed";
    case "pending": return "Pending";
    case "modified": return "Modified";
    case "rejected": return "Rejected";
  }
}

const SHORT_DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// ─── Shift Chip (WeeklyTimeline과 동일한 스타일) ──────────────────────────────

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
        "relative flex flex-col items-start gap-px px-1.5 py-1 rounded cursor-pointer transition-all duration-150 border-l-[3px]",
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
      {/* 직원 이름 */}
      <span className="text-[10px] font-bold text-text whitespace-nowrap truncate max-w-full">
        {schedule.user_name ?? "Unknown"}
      </span>

      {/* 시간 범위 */}
      <span
        className={cn(
          "text-[9px] font-medium text-text-muted whitespace-nowrap",
          status === "rejected" && "line-through",
        )}
      >
        {timeRange}  {netH.toFixed(1)}h
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
          <div className="mt-1 pt-1 border-t border-border text-[9px] text-text-muted">
            Click to view detail
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export function WeeklyRoleView({
  weekStart,
  entries,
  workRoles,
  showRejected,
  onScheduleClick,
  onEmptyCellClick,
}: WeeklyRoleViewProps): React.ReactElement {
  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );
  const weekDayStrs = useMemo(() => weekDays.map(toDateStr), [weekDays]);
  const todayStr = useMemo(() => toDateStr(new Date()), []);

  const realEntries = useMemo(
    () => entries.filter((e) => !e.isEmpty && (showRejected || e.status !== "rejected")),
    [entries, showRejected],
  );

  // role별, 날짜별 entries 그룹: roleId → dateStr → entry[]
  const entriesByRoleAndDay = useMemo(() => {
    const map = new Map<string, Map<string, WeeklyEntry[]>>();

    for (const entry of realEntries) {
      const roleId = entry.schedule.work_role_id ?? "__none__";
      if (!map.has(roleId)) map.set(roleId, new Map());
      const byDay = map.get(roleId)!;
      const dateStr = entry.schedule.work_date;
      if (!byDay.has(dateStr)) byDay.set(dateStr, []);
      byDay.get(dateStr)!.push(entry);
    }
    return map;
  }, [realEntries]);

  // Summary stats
  const summaryStats = useMemo(() => {
    const totalRoles = workRoles.length;
    let fullCoverageCount = 0;

    for (const role of workRoles) {
      const byDay = entriesByRoleAndDay.get(role.id);
      const allFull = weekDayStrs.every((d) => {
        const dayEntries = byDay?.get(d) ?? [];
        const confirmed = dayEntries.filter(
          (e) => e.status === "confirmed" || e.status === "modified",
        ).length;
        const dayRequired = getHeadcountForDate(role, d);
        return dayRequired > 0 && confirmed >= dayRequired;
      });
      if (allFull) fullCoverageCount++;
    }

    const totalCost = realEntries
      .filter((e) => e.status === "confirmed" || e.status === "modified")
      .reduce((sum, e) => sum + (netMinutes(e) / 60) * (e.hourlyRate ?? 0), 0);

    return { totalRoles, fullCoverageCount, totalCost };
  }, [workRoles, realEntries, weekDayStrs, entriesByRoleAndDay]);

  // ── Render one role row ────────────────────────────────────────────────────

  function renderRoleRow(
    role: WorkRole | null,
    rowIdx: number,
  ): React.ReactElement {
    const roleId = role?.id ?? "__none__";
    const byDay = entriesByRoleAndDay.get(roleId) ?? new Map<string, WeeklyEntry[]>();
    // headcount left column 표시용 (요일별이면 "per day" 표시)
    const hasPerDay = !!role?.use_per_day_headcount;
    const roleName = role ? roleDisplayName(role) : "Unassigned";
    const rowBg = rowIdx % 2 === 0 ? "bg-card" : "bg-surface";

    // 주간 전체 confirmed 수를 기반으로 overall coverage
    const weekConfirmed = weekDayStrs.reduce((sum, d) => {
      const dayEntries = byDay.get(d) ?? [];
      return sum + dayEntries.filter((e) => e.status === "confirmed" || e.status === "modified").length;
    }, 0);
    // Check if every day meets its required headcount
    const weekTotalRequired = weekDayStrs.reduce((sum, d) => sum + getHeadcountForDate(role, d), 0);
    const overallCoverage: CoverageLevel =
      weekTotalRequired === 0
        ? "partial"
        : weekConfirmed >= weekTotalRequired
        ? "full"
        : weekConfirmed > 0
        ? "partial"
        : "none";

    // 주간 총 시간, 비용
    let totalHours = 0;
    let totalCost = 0;
    for (const dayEntries of byDay.values()) {
      for (const e of dayEntries) {
        if (e.status === "confirmed" || e.status === "modified") {
          const h = netMinutes(e) / 60;
          totalHours += h;
          totalCost += h * (e.hourlyRate ?? 0);
        }
      }
    }

    return (
      <tr key={roleId} className={rowBg}>
        {/* 왼쪽: role 정보 — sticky */}
        <td
          className={cn(
            "sticky left-0 z-[3] min-w-[180px] w-[180px] px-3 py-2 text-left border-b border-r border-border align-top",
            rowBg,
          )}
        >
          <div className="flex items-center gap-2 mt-0.5">
            <div className={cn("w-2 h-2 rounded-full flex-shrink-0", coverageDotClass[overallCoverage])} />
            <span className="text-[12px] font-bold text-text truncate">{roleName}</span>
          </div>
          {role && (role.headcount.all ?? 0) > 0 && (
            <div className="text-[11px] text-text-muted mt-0.5 pl-4">
              Need: {hasPerDay ? "per day" : `${role.headcount.all ?? 0}/day`}
            </div>
          )}
        </td>

        {/* 요일 셀: coverage 비율 + staff chip 스택 */}
        {weekDayStrs.map((dateStr, i) => {
          const isToday = dateStr === todayStr;
          const dayEntries = byDay.get(dateStr) ?? [];
          const dayConfirmed = dayEntries.filter(
            (e) => e.status === "confirmed" || e.status === "modified",
          ).length;
          const dayPending = dayEntries.filter((e) => e.status === "pending").length;
          const dayRequired = getHeadcountForDate(role, dateStr);
          const dayCoverage = getCoverage(dayConfirmed, dayRequired);

          return (
            <td
              key={dateStr}
              className={cn(
                "border-b border-r border-border p-1.5 align-top min-w-[100px]",
                isToday && "bg-[rgba(108,92,231,0.04)]",
                dayEntries.length === 0 && "hover:bg-[var(--color-surface-hover)] cursor-pointer",
              )}
              onClick={() => {
                if (dayEntries.length === 0) onEmptyCellClick(dateStr);
              }}
            >
              {/* 상단: coverage 비율 */}
              <div className={cn("text-[10px] font-bold mb-1", coverageTextColor[dayCoverage])}>
                {dayConfirmed}/{dayRequired}
                {dayPending > 0 && (
                  <span className="text-[9px] font-normal text-text-muted ml-1">+{dayPending}</span>
                )}
              </div>

              {/* Staff chip 스택 */}
              {dayEntries.length === 0 ? (
                <span className="text-[10px] text-text-muted italic">—</span>
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

        {/* 오른쪽: 주간 총 시간, 비용 — sticky */}
        <td
          className={cn(
            "border-b border-l border-border px-2 py-2 text-center sticky right-0 z-[3] min-w-[72px] align-top",
            rowBg,
          )}
        >
          {totalHours > 0 ? (
            <>
              <div className="text-[14px] font-extrabold text-text mt-0.5">{totalHours.toFixed(1)}h</div>
              {totalCost > 0 && (
                <div className="text-[10px] text-text-muted">${Math.round(totalCost)}</div>
              )}
            </>
          ) : (
            <div className="text-sm text-text-muted">—</div>
          )}
        </td>
      </tr>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const unassignedByDay = entriesByRoleAndDay.get("__none__");
  const hasUnassigned = unassignedByDay && Array.from(unassignedByDay.values()).some((v) => v.length > 0);

  return (
    <div
      className="bg-card border border-border rounded-xl overflow-x-auto mb-3.5"
      style={{ WebkitOverflowScrolling: "touch" }}
    >
      <table className="border-collapse w-full" style={{ minWidth: "1000px" }}>
        <thead>
          <tr>
            <th className="text-left pl-3 py-1.5 text-[11px] font-semibold text-text-muted bg-surface sticky left-0 z-[10] w-[180px] min-w-[180px] border-b border-r border-border">
              Work Role
            </th>
            {weekDays.map((day, i) => {
              const dateStr = weekDayStrs[i];
              const isToday = dateStr === todayStr;
              return (
                <th
                  key={dateStr}
                  className={cn(
                    "p-[6px_4px] text-[11px] font-semibold text-text-muted bg-surface min-w-[100px] border-b border-r border-border sticky top-0 z-[5]",
                    isToday && "text-accent bg-[var(--color-summary-accent)]",
                  )}
                >
                  <div>{SHORT_DAYS[day.getDay()]}</div>
                  <div className={cn("text-[10px]", isToday ? "text-accent" : "text-text-muted")}>
                    {day.toLocaleDateString("en-US", { month: "numeric", day: "numeric" })}
                  </div>
                </th>
              );
            })}
            <th className="w-[72px] min-w-[72px] bg-surface text-[11px] font-semibold text-text-muted border-b border-l border-border sticky top-0 right-0 z-[11]">
              Total
            </th>
          </tr>
        </thead>

        <tbody>
          {/* Coverage summary row */}
          <tr className="bg-[var(--color-summary-warning)]">
            <td className="sticky left-0 z-[3] min-w-[180px] py-2 pl-3 text-left border-b border-r border-border bg-[var(--color-summary-warning)]">
              <div className="text-[12px] font-bold text-text">Coverage</div>
              <div className="text-[10px] text-text-muted">
                {summaryStats.fullCoverageCount}/{summaryStats.totalRoles} full week
              </div>
            </td>
            {weekDayStrs.map((dateStr) => (
              <td
                key={dateStr}
                className="border-b border-r border-border bg-[var(--color-summary-warning)] min-w-[100px]"
              />
            ))}
            <td className="border-b border-l border-border bg-[var(--color-summary-warning)] px-2 py-1.5 text-center sticky right-0 z-[3]">
              {summaryStats.totalCost > 0 ? (
                <>
                  <div className="text-sm font-extrabold text-warning">${Math.round(summaryStats.totalCost)}</div>
                  <div className="text-[10px] text-text-muted">est. cost</div>
                </>
              ) : (
                <div className="text-sm text-text-muted">—</div>
              )}
            </td>
          </tr>

          {/* Role rows */}
          {workRoles.length === 0 && !hasUnassigned ? (
            <tr>
              <td
                colSpan={10}
                className="text-center py-8 text-text-muted text-sm border-b border-border"
              >
                No work roles configured for this store.
              </td>
            </tr>
          ) : (
            <>
              {workRoles.map((role, idx) => renderRoleRow(role, idx))}
              {hasUnassigned && renderRoleRow(null, workRoles.length)}
            </>
          )}
        </tbody>
      </table>
    </div>
  );
}
