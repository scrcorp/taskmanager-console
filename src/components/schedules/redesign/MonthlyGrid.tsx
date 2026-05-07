"use client";

/**
 * MonthlyGrid — 월간 캘린더 그리드.
 *
 * All/Multi store: 일별 총 인원·시간·금액
 * 단일 store: shift별 인원·시간·금액 + total
 */

import type { Schedule, Shift, WorkRole } from "@/types";

interface Props {
  year: number;
  month: number; // 0-indexed (JS Date)
  schedules: Schedule[];
  shifts: Shift[];
  workRoles: WorkRole[];
  isSingleStore: boolean;
  showCost: boolean;
  onDayClick: (date: string) => void;
  onWeekClick: (date: string) => void;
}

function fmtDate(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function getNetHours(s: Schedule): number {
  return s.net_work_minutes / 60;
}

function getCost(s: Schedule): number {
  return getNetHours(s) * (s.hourly_rate ?? 0);
}

interface DayStat {
  count: number;
  hours: number;
  cost: number;
}

function calcStat(scheds: Schedule[]): DayStat {
  return {
    count: new Set(scheds.map((s) => s.user_id)).size,
    hours: scheds.reduce((sum, s) => sum + getNetHours(s), 0),
    cost: scheds.reduce((sum, s) => sum + getCost(s), 0),
  };
}

// 아이콘 SVG (inline, 10px)
function IconPeople() {
  return <svg width="10" height="10" viewBox="0 0 16 16" fill="currentColor" className="shrink-0"><path d="M8 8a3 3 0 100-6 3 3 0 000 6zm-5 8c0-2.8 2.2-5 5-5s5 2.2 5 5H3z"/></svg>;
}
function IconClock() {
  return <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="shrink-0"><circle cx="8" cy="8" r="6.5"/><path d="M8 4.5V8l2.5 1.5"/></svg>;
}
function IconDollar() {
  return <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.2" className="shrink-0"><rect x="1" y="3.5" width="14" height="9" rx="1.5"/><circle cx="8" cy="8" r="2"/><path d="M3.5 5.5v5M12.5 5.5v5"/></svg>;
}

function StatLine({ label, confirmed, pending, showCost, isTotal }: {
  label?: string;
  confirmed: DayStat;
  pending: DayStat;
  showCost: boolean;
  isTotal?: boolean;
}) {
  const hasConfirmed = confirmed.count > 0;
  const hasPending = pending.count > 0;

  return (
    <div className={`flex flex-col gap-[1px] ${isTotal ? "mt-0.5 pt-0.5 border-t border-[var(--color-border)]/50" : ""}`}>
      {label && (
        <div className={`text-[8px] uppercase tracking-wider font-bold ${isTotal ? "text-[var(--color-text)]" : "text-[var(--color-text-muted)]"}`}>
          {label}
        </div>
      )}
      <div
        className="flex items-center gap-1 text-[9px] leading-[12px] flex-wrap"
        title={`Confirmed${hasPending ? " / +Pending" : ""}: ${confirmed.count}${hasPending ? ` / +${pending.count}` : ""} staff · ${confirmed.hours.toFixed(1)}${hasPending ? ` / +${pending.hours.toFixed(1)}` : ""} h${showCost ? ` · $${confirmed.cost.toFixed(0)}${hasPending ? ` / +$${pending.cost.toFixed(0)}` : ""}` : ""}`}
      >
        <IconPeople />
        <span className={hasConfirmed ? "text-[var(--color-success)] font-semibold" : "text-[var(--color-text-muted)]"}>{confirmed.count}</span>
        {hasPending && <span className="text-[var(--color-warning)] font-semibold">+{pending.count}</span>}
        <span className="text-[var(--color-border)]">|</span>
        <IconClock />
        <span className={hasConfirmed ? "text-[var(--color-success)]" : "text-[var(--color-text-muted)]"}>{confirmed.hours.toFixed(1)}</span>
        {hasPending && <span className="text-[var(--color-warning)]">+{pending.hours.toFixed(1)}</span>}
        {showCost && (
          <>
            <span className="text-[var(--color-border)]">|</span>
            <IconDollar />
            <span className={hasConfirmed ? "text-[var(--color-success)]" : "text-[var(--color-text-muted)]"}>${confirmed.cost.toFixed(0)}</span>
            {hasPending && <span className="text-[var(--color-warning)]">+${pending.cost.toFixed(0)}</span>}
          </>
        )}
      </div>
    </div>
  );
}

function getWeekNumber(d0: Date): number {
  const yr = d0.getFullYear();
  const jan1 = new Date(yr, 0, 1);
  const w1Sun = new Date(jan1); w1Sun.setDate(w1Sun.getDate() - w1Sun.getDay());
  const wk = Math.round((d0.getTime() - w1Sun.getTime()) / (7 * 86400000)) + 1;
  return wk;
}

export function MonthlyGrid({ year, month, schedules, shifts, workRoles, isSingleStore, showCost, onDayClick, onWeekClick }: Props) {
  const today = new Date().toISOString().slice(0, 10);
  const firstDay = new Date(year, month, 1);
  const startDow = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const weeks: (number | null)[][] = [];
  let day = 1 - startDow;
  for (let w = 0; w < 6; w++) {
    const week: (number | null)[] = [];
    for (let d = 0; d < 7; d++) {
      if (day >= 1 && day <= daysInMonth) week.push(day);
      else week.push(null);
      day++;
    }
    if (week.every((d) => d === null)) break;
    weeks.push(week);
  }

  // shift → work_role 매핑
  const shiftIdByWorkRoleId = new Map<string, string>();
  for (const wr of workRoles) {
    shiftIdByWorkRoleId.set(wr.id, wr.shift_id);
  }

  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl overflow-hidden">
      {/* Header */}
      <div className="grid grid-cols-[40px_repeat(7,1fr)] border-b border-[var(--color-border)]">
        <div className="py-2 text-center text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">W</div>
        {dayNames.map((name, i) => (
          <div
            key={name}
            className={`py-2 text-center text-[11px] font-bold uppercase tracking-wider ${
              i === 0 ? "text-[var(--color-danger)]" : i === 6 ? "text-[var(--color-accent)]" : "text-[var(--color-text-muted)]"
            }`}
          >
            {name}
          </div>
        ))}
      </div>

      {/* Grid */}
      {weeks.map((week, wi) => {
        // 주차 계산: 해당 주의 첫 유효 날짜 기준
        const firstValidDay = week.find((d) => d !== null);
        const weekSunDate = firstValidDay ? fmtDate(year, month, firstValidDay) : null;
        const wk = weekSunDate ? getWeekNumber(new Date(weekSunDate + "T00:00:00")) : null;

        return (
        <div key={wi} className="grid grid-cols-[40px_repeat(7,1fr)] border-b border-[var(--color-border)] last:border-b-0">
          {/* Week number */}
          <div
            onClick={() => weekSunDate && onWeekClick(weekSunDate)}
            className="min-h-[90px] flex items-center justify-center border-r border-[var(--color-border)] cursor-pointer hover:bg-[var(--color-accent-muted)] transition-colors"
          >
            <span className="text-[11px] font-bold text-[var(--color-accent)]">{wk != null ? `W${wk}` : ""}</span>
          </div>
          {week.map((d, di) => {
            if (d === null) {
              return <div key={di} className="min-h-[90px] bg-[var(--color-bg)]/50 border-r border-[var(--color-border)] last:border-r-0" />;
            }
            const dateStr = fmtDate(year, month, d);
            const isToday = dateStr === today;
            const dow = di;
            const dayScheds = schedules.filter((s) => s.work_date === dateStr && (s.status === "confirmed" || s.status === "requested"));
            const confirmed = dayScheds.filter((s) => s.status === "confirmed");
            const pending = dayScheds.filter((s) => s.status === "requested");

            return (
              <div
                key={di}
                onClick={() => onDayClick(dateStr)}
                className={`min-h-[90px] p-1.5 border-r border-[var(--color-border)] last:border-r-0 cursor-pointer hover:bg-[var(--color-surface-hover)] transition-colors ${
                  isToday ? "bg-[var(--color-accent-muted)]" : ""
                }`}
              >
                {/* Date number */}
                <div className={`text-[12px] font-semibold mb-1 ${
                  isToday ? "text-[var(--color-accent)]"
                    : dow === 0 ? "text-[var(--color-danger)]"
                    : dow === 6 ? "text-[var(--color-accent)]"
                    : "text-[var(--color-text)]"
                }`}>
                  {d}
                </div>

                {/* Stats */}
                {isSingleStore ? (
                  <div className="space-y-0.5">
                    {shifts.map((shift) => {
                      const shiftConfirmed = confirmed.filter((s) => s.work_role_id && shiftIdByWorkRoleId.get(s.work_role_id) === shift.id);
                      const shiftPending = pending.filter((s) => s.work_role_id && shiftIdByWorkRoleId.get(s.work_role_id) === shift.id);
                      return (
                        <StatLine
                          key={shift.id}
                          label={shift.name ?? undefined}
                          confirmed={calcStat(shiftConfirmed)}
                          pending={calcStat(shiftPending)}
                          showCost={showCost}
                        />
                      );
                    })}
                    <StatLine label="Total" confirmed={calcStat(confirmed)} pending={calcStat(pending)} showCost={showCost} isTotal />
                  </div>
                ) : (
                  (confirmed.length > 0 || pending.length > 0) && (
                    <StatLine confirmed={calcStat(confirmed)} pending={calcStat(pending)} showCost={showCost} />
                  )
                )}
              </div>
            );
          })}
        </div>
        );
      })}
    </div>
  );
}
