"use client";

/**
 * DailyRoleView — 하루 스케줄을 Work Role 기준으로 표시.
 *
 * 각 역할(role) = 1개 테이블 행.
 * - 왼쪽 셀: 역할명, Need/coverage 정보
 * - 시간 셀: 해당 역할에 배정된 staff의 shift bar를 절대 위치로 세로 스택
 *   (DailyTimeline과 동일한 ShiftBar 컴포넌트 사용, colSpan 대신 절대 위치)
 * - 오른쪽 셀: confirmed/required 비율, 총 시간, 총 비용
 * Row height: min 56px, 직원 수에 따라 동적 확장 (30px per staff)
 */

import React, { useMemo } from "react";
import { cn } from "@/lib/utils";
import { ShiftBar } from "@/components/schedules/ShiftBar";
import type { Schedule, WorkRole } from "@/types";
import type { TimelineEntry } from "@/components/schedules/DailyTimeline";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface DailyRoleViewProps {
  date: string;
  entries: TimelineEntry[];
  workRoles: WorkRole[];
  dayStartHour: number;
  showRejected: boolean;
  onScheduleClick: (schedule: Schedule) => void;
  onEmptyCellClick: (hour: number) => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseTime(t: string | null | undefined): number | null {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  if (isNaN(h)) return null;
  return h + (m || 0) / 60;
}

function hourColLabel(absHour: number): { label: string; isNextDay: boolean } {
  const isNextDay = absHour >= 24;
  const norm = absHour % 24;
  const ampm = norm < 12 ? "A" : "P";
  const h = norm % 12 === 0 ? 12 : norm % 12;
  return { label: `${h}${ampm}`, isNextDay };
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

function netMinutes(entry: TimelineEntry): number {
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

// ─── Headcount helper ─────────────────────────────────────────────────────────

const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/** Returns headcount for the given date string, respecting use_per_day_headcount. */
function getHeadcount(role: WorkRole, dateStr: string): number {
  if (role.use_per_day_headcount) {
    const d = new Date(dateStr + "T00:00:00");
    const dayKey = DAY_KEYS[d.getDay()];
    return role.headcount[dayKey] ?? role.headcount.all ?? 1;
  }
  return role.headcount.all ?? 1;
}

// ─── Coverage helpers ─────────────────────────────────────────────────────────

type CoverageLevel = "full" | "partial" | "none";

function getCoverage(confirmed: number, required: number): CoverageLevel {
  if (confirmed >= required && required > 0) return "full";
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

// ─── Shift bar position (identical to DailyTimeline logic) ───────────────────

interface BarPosition {
  startFrac: number;   // 0–1 offset from timeline start (fraction of 24 cols)
  widthFrac: number;   // 0–1 width (fraction of 24 cols)
  breakLeftFrac: number | null;
  breakWidthFrac: number | null;
  valid: boolean;
}

function computeBarPosition(entry: TimelineEntry, dayStartHour: number): BarPosition {
  const invalid: BarPosition = { startFrac: 0, widthFrac: 0, breakLeftFrac: null, breakWidthFrac: null, valid: false };

  const start = parseTime(entry.schedule.start_time);
  const end = parseTime(entry.schedule.end_time);
  if (start === null || end === null) return invalid;

  const absStart = start < dayStartHour ? start + 24 : start;
  const absEnd = end <= start ? end + 24 : end;

  const timelineStart = dayStartHour;
  const timelineEnd = dayStartHour + 24;
  const clampedStart = Math.max(absStart, timelineStart);
  const clampedEnd = Math.min(absEnd, timelineEnd);
  if (clampedStart >= clampedEnd) return invalid;

  const totalHours = 24;
  const startFrac = (clampedStart - timelineStart) / totalHours;
  const widthFrac = (clampedEnd - clampedStart) / totalHours;

  // Break position relative to bar width
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
      const barDuration = clampedEnd - clampedStart;
      breakLeftFrac = (absBStart - clampedStart) / barDuration;
      breakWidthFrac = (absBEnd - absBStart) / barDuration;
    }
  }

  return { startFrac, widthFrac, breakLeftFrac, breakWidthFrac, valid: true };
}

// ─── Constants ────────────────────────────────────────────────────────────────

/** Height of each stacked bar slot in px */
const BAR_HEIGHT = 28;
/** Gap between stacked bars in px */
const BAR_GAP = 2;
/** Minimum row height in px */
const MIN_ROW_HEIGHT = 56;

/** Compute total row height based on staff count */
function rowHeight(staffCount: number): number {
  if (staffCount <= 0) return MIN_ROW_HEIGHT;
  return Math.max(MIN_ROW_HEIGHT, staffCount * (BAR_HEIGHT + BAR_GAP) + 8);
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DailyRoleView({
  date,
  entries,
  workRoles,
  dayStartHour,
  showRejected,
  onScheduleClick,
  onEmptyCellClick,
}: DailyRoleViewProps): React.ReactElement {
  const hours = useMemo(
    () => Array.from({ length: 24 }, (_, i) => dayStartHour + i),
    [dayStartHour],
  );

  const nowHour = useMemo(() => {
    const d = new Date();
    return d.getHours() + d.getMinutes() / 60;
  }, []);

  const firstNextDayIdx = useMemo(
    () => hours.findIndex((h) => h >= 24),
    [hours],
  );

  // 선택한 날짜의 visible entries만 필터링
  const visibleEntries = useMemo(
    () =>
      entries.filter(
        (e) =>
          !e.isEmpty &&
          e.schedule.work_date === date &&
          (showRejected || e.status !== "rejected"),
      ),
    [entries, date, showRejected],
  );

  // role별 entries 그룹
  const entriesByRole = useMemo(() => {
    const map = new Map<string | null, TimelineEntry[]>();
    for (const e of visibleEntries) {
      const key = e.schedule.work_role_id ?? null;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return map;
  }, [visibleEntries]);

  // 정렬된 role 행 목록: workRoles 순서 → unassigned
  const roleRows = useMemo(() => {
    const rows: Array<{ role: WorkRole | null; roleEntries: TimelineEntry[] }> = [];
    for (const role of workRoles) {
      rows.push({ role, roleEntries: entriesByRole.get(role.id) ?? [] });
    }
    const unassigned = entriesByRole.get(null) ?? [];
    if (unassigned.length > 0) {
      rows.push({ role: null, roleEntries: unassigned });
    }
    return rows;
  }, [workRoles, entriesByRole]);

  // Summary stats
  const summaryStats = useMemo(() => {
    const totalRoles = workRoles.length;
    const fullyCovered = roleRows.filter(({ role, roleEntries }) => {
      if (!role) return false;
      const confirmed = roleEntries.filter(
        (e) => e.status === "confirmed" || e.status === "modified",
      ).length;
      const required = getHeadcount(role, date);
      return confirmed >= required && required > 0;
    }).length;
    const totalCost = visibleEntries
      .filter((e) => e.status === "confirmed" || e.status === "modified")
      .reduce((sum, e) => sum + (netMinutes(e) / 60) * (e.hourlyRate ?? 0), 0);
    return { totalRoles, fullyCovered, totalCost };
  }, [roleRows, workRoles, visibleEntries]);

  // ── Render header ─────────────────────────────────────────────────────────

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

  // ── Render one role row ────────────────────────────────────────────────────

  function renderRoleRow(
    role: WorkRole | null,
    roleEntries: TimelineEntry[],
    rowIdx: number,
  ): React.ReactElement {
    const confirmed = roleEntries.filter(
      (e) => e.status === "confirmed" || e.status === "modified",
    ).length;
    const pending = roleEntries.filter((e) => e.status === "pending").length;
    const required = role ? getHeadcount(role, date) : 0;
    const coverage = role ? getCoverage(confirmed, required) : "partial";
    const roleName = role ? roleDisplayName(role) : "Unassigned";
    const staffCount = roleEntries.length;
    const height = rowHeight(staffCount);
    const rowBg = rowIdx % 2 === 0 ? "bg-card" : "bg-surface";

    const totalHours = roleEntries
      .filter((e) => e.status !== "rejected")
      .reduce((sum, e) => sum + netMinutes(e) / 60, 0);
    const totalCost = roleEntries
      .filter((e) => e.status === "confirmed" || e.status === "modified")
      .reduce((sum, e) => sum + (netMinutes(e) / 60) * (e.hourlyRate ?? 0), 0);

    return (
      <tr key={role?.id ?? "unassigned"} className={rowBg}>
        {/* 왼쪽: role 정보 — sticky */}
        <td
          className={cn(
            "sticky left-0 z-[3] min-w-[220px] px-4 py-2 text-left border-b border-r border-border align-top",
            rowBg,
          )}
          style={{ height }}
        >
          <div className="flex items-center gap-2 mt-1">
            <div className={cn("w-2 h-2 rounded-full flex-shrink-0", coverageDotClass[coverage])} />
            <span className="text-[12px] font-bold text-text truncate">{roleName}</span>
          </div>
          {required > 0 && (
            <div className="text-[11px] text-text-muted mt-0.5 pl-4">
              Need: {required}
            </div>
          )}
          <div className={cn("text-[11px] font-semibold mt-0.5 pl-4", coverageTextColor[coverage])}>
            {confirmed} confirmed
            {pending > 0 && (
              <span className="text-text-muted font-normal ml-1">/ {pending} pend</span>
            )}
          </div>
        </td>

        {/* 시간 셀: 각 hour column에 대해 td를 렌더링. 첫 번째 td만 relative container로 24 cols span */}
        {/* 전체 시간 그리드를 하나의 relative container에 담고 셀마다 border를 그린다 */}
        {hours.map((absHour, idx) => {
          const { isNextDay } = hourColLabel(absHour);
          const isCurrent = Math.floor(nowHour) === absHour % 24;
          const isFirstNextDay = idx === firstNextDayIdx;

          return (
            <td
              key={absHour}
              className={cn(
                "p-0 border-b border-r border-border min-w-[48px] relative",
                isCurrent && "bg-[rgba(108,92,231,0.08)]",
                isNextDay && !isCurrent && "bg-[rgba(255,255,255,0.015)]",
                isFirstNextDay && "border-l-2 border-dashed border-border",
              )}
              style={{ height }}
              onClick={() => onEmptyCellClick(absHour % 24)}
            >
              {/* 이 셀에서 시작하는 staff bar들 렌더링 — 절대 위치로 오른쪽으로 뻗어나감 */}
              {roleEntries.map((entry, barIdx) => {
                const pos = computeBarPosition(entry, dayStartHour);
                if (!pos.valid) return null;

                // 이 bar가 이 컬럼에서 시작하는지 확인
                const barStartHour = dayStartHour + pos.startFrac * 24;
                const colStart = absHour;
                const colEnd = absHour + 1;
                if (barStartHour < colStart || barStartHour >= colEnd) return null;

                // bar의 start는 이 컬럼 내의 fractional offset
                const leftWithinCol = (barStartHour - colStart); // 0~1 hours within this col
                const leftPx = `${leftWithinCol * 48}px`; // 48px per column

                // bar의 총 너비: widthFrac * 24cols * 48px/col
                const widthPx = `${pos.widthFrac * 24 * 48}px`;

                const topPx = 4 + barIdx * (BAR_HEIGHT + BAR_GAP);
                const netH = netMinutes(entry) / 60;

                return (
                  <div
                    key={entry.schedule.id}
                    style={{
                      position: "absolute",
                      top: topPx,
                      left: leftPx,
                      width: widthPx,
                      height: BAR_HEIGHT,
                      zIndex: 3 + barIdx,
                      pointerEvents: "none",
                    }}
                  >
                    {/* ShiftBar는 absolute top/bottom 기준이므로 wrapper를 relative로 */}
                    <div style={{ position: "relative", width: "100%", height: "100%", pointerEvents: "auto" }}>
                      <ShiftBar
                        staffName={entry.schedule.user_name ?? "Unknown"}
                        workRole={entry.schedule.user_name ?? "Unknown"}
                        startLabel={formatTimeStr(entry.schedule.start_time)}
                        endLabel={formatTimeStr(entry.schedule.end_time)}
                        breakLabel={
                          entry.schedule.break_start_time && entry.schedule.break_end_time
                            ? `${formatTimeStr(entry.schedule.break_start_time)}–${formatTimeStr(entry.schedule.break_end_time)}`
                            : null
                        }
                        netHours={netH}
                        status={entry.status}
                        leftPct={0}
                        widthPct={1}
                        breakLeftFrac={pos.breakLeftFrac}
                        breakWidthFrac={pos.breakWidthFrac}
                        isCarryover={entry.schedule.work_date !== date}
                        onClick={() => onScheduleClick(entry.schedule)}
                      />
                    </div>
                  </div>
                );
              })}
            </td>
          );
        })}

        {/* 오른쪽: 비율, 시간, 비용 — sticky */}
        <td
          className={cn(
            "border-b border-l border-border px-2 py-2 text-center sticky right-0 z-[3] min-w-[72px] align-top",
            rowBg,
          )}
          style={{ height }}
        >
          <div className={cn("text-sm font-extrabold mt-1", coverageTextColor[coverage])}>
            {confirmed}/{required > 0 ? required : "?"}
          </div>
          {totalHours > 0 && (
            <div className="text-[10px] text-text-muted">{totalHours.toFixed(1)}h</div>
          )}
          {totalCost > 0 && (
            <div className="text-[10px] text-text-muted">${Math.round(totalCost)}</div>
          )}
        </td>
      </tr>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div
      className="bg-card border border-border rounded-xl overflow-x-auto mb-3.5"
      style={{ WebkitOverflowScrolling: "touch" }}
    >
      <table className="border-collapse w-full" style={{ minWidth: "1400px" }}>
        <thead>
          <tr>
            <th className="text-left pl-4 py-1.5 text-[11px] font-semibold text-text-muted bg-surface sticky left-0 z-[10] w-[220px] min-w-[220px] border-b border-r border-border">
              Work Role
            </th>
            {hours.map((h, i) => renderHourHeader(h, i))}
            <th className="w-[72px] min-w-[72px] bg-surface text-[11px] font-semibold text-text-muted border-b border-l border-border sticky top-0 right-0 z-[11]">
              Total
            </th>
          </tr>
        </thead>

        <tbody>
          {/* Coverage summary row */}
          <tr className="bg-[var(--color-summary-warning)]">
            <td className="sticky left-0 z-[3] min-w-[220px] py-2 pl-4 text-left border-b border-r border-border bg-[var(--color-summary-warning)]">
              <div className="text-[12px] font-bold text-text">Coverage</div>
              <div className="text-[10px] text-text-muted">
                {summaryStats.fullyCovered}/{summaryStats.totalRoles} roles fully staffed
              </div>
            </td>
            {hours.map((absHour, idx) => {
              const { isNextDay } = hourColLabel(absHour);
              const isCurrent = Math.floor(nowHour) === absHour % 24;
              const isFirstNextDay = idx === firstNextDayIdx;
              return (
                <td
                  key={absHour}
                  className={cn(
                    "p-0 border-b border-r border-border bg-[var(--color-summary-warning)]",
                    isCurrent && "bg-[rgba(108,92,231,0.12)]",
                    isNextDay && !isCurrent && "bg-[rgba(255,255,255,0.02)]",
                    isFirstNextDay && "border-l-2 border-dashed border-border",
                  )}
                />
              );
            })}
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
          {roleRows.length === 0 ? (
            <tr>
              <td
                colSpan={26}
                className="text-center py-8 text-text-muted text-sm border-b border-border"
              >
                No work roles configured for this store.
              </td>
            </tr>
          ) : (
            roleRows.map(({ role, roleEntries }, idx) =>
              renderRoleRow(role, roleEntries, idx),
            )
          )}
        </tbody>
      </table>
    </div>
  );
}
