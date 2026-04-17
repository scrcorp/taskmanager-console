"use client";

/**
 * WeekPickerCalendar — 3-level drill-down week picker.
 *
 * Week view: monthly calendar, click week row to select
 * Month view: Jan-Dec grid (click header to drill down)
 * Year view: decade grid
 */

import { useState } from "react";

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];
const SHORT_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

export function getWeekStart(date: Date): Date {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0, 0, 0, 0);
  return d;
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

export function fmtWeekRange(start: Date): string {
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  if (start.getFullYear() !== new Date().getFullYear()) {
    return `${fmt(start)} – ${fmt(end)}, ${start.getFullYear()}`;
  }
  return `${fmt(start)} – ${fmt(end)}`;
}

interface Props {
  selectedWeekStart: Date;
  onSelect: (weekStart: Date) => void;
}

export function WeekPickerCalendar({ selectedWeekStart, onSelect }: Props) {
  const [view, setView] = useState<"week" | "month" | "year">("week");
  const [displayDate, setDisplayDate] = useState(() =>
    new Date(selectedWeekStart.getFullYear(), selectedWeekStart.getMonth(), 1),
  );
  const [hoverWeek, setHoverWeek] = useState<Date | null>(null);

  const year = displayDate.getFullYear();
  const month = displayDate.getMonth();
  const yearBase = Math.floor(year / 12) * 12;
  const today = new Date();

  function buildWeeks(): Date[][] {
    const firstDay = new Date(year, month, 1);
    const start = new Date(firstDay);
    start.setDate(1 - firstDay.getDay());
    const days: Date[] = Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      return d;
    });
    return Array.from({ length: 6 }, (_, i) => days.slice(i * 7, i * 7 + 7));
  }

  const weeks = buildWeeks();

  function prevPeriod() {
    if (view === "week") setDisplayDate(new Date(year, month - 1, 1));
    else if (view === "month") setDisplayDate(new Date(year - 1, month, 1));
    else setDisplayDate(new Date(yearBase - 12, month, 1));
  }
  function nextPeriod() {
    if (view === "week") setDisplayDate(new Date(year, month + 1, 1));
    else if (view === "month") setDisplayDate(new Date(year + 1, month, 1));
    else setDisplayDate(new Date(yearBase + 12, month, 1));
  }

  function headerLabel() {
    if (view === "week") return `${MONTH_NAMES[month]} ${year}`;
    if (view === "month") return `${year}`;
    return `${yearBase} – ${yearBase + 11}`;
  }
  function headerClick() {
    if (view === "week") setView("month");
    else if (view === "month") setView("year");
  }

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl shadow-xl p-3 w-[272px]">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <button type="button" onClick={prevPeriod}
          className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-[var(--color-surface-hover)] text-[var(--color-text-secondary)] transition-colors">
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="7 9 4 5.5 7 2" /></svg>
        </button>

        <button
          type="button"
          onClick={view !== "year" ? headerClick : undefined}
          className={`text-[13px] font-semibold flex items-center gap-1 px-2 py-0.5 rounded-lg transition-colors ${
            view !== "year"
              ? "hover:bg-[var(--color-accent-muted)] hover:text-[var(--color-accent)] cursor-pointer"
              : "text-[var(--color-text-muted)] cursor-default"
          } text-[var(--color-text)]`}
        >
          {headerLabel()}
          {view !== "year" && (
            <svg width="9" height="9" viewBox="0 0 9 9" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="opacity-50">
              <polyline points="2 3.5 4.5 6 7 3.5" />
            </svg>
          )}
        </button>

        <button type="button" onClick={nextPeriod}
          className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-[var(--color-surface-hover)] text-[var(--color-text-secondary)] transition-colors">
          <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="4 2 7 5.5 4 9" /></svg>
        </button>
      </div>

      {/* Week view */}
      {view === "week" && (
        <div>
          <div className="grid grid-cols-7 mb-0.5">
            {DAY_LABELS.map((d) => (
              <div key={d} className="text-center text-[10px] font-semibold text-[var(--color-text-muted)] py-1">{d}</div>
            ))}
          </div>
          <div className="space-y-0.5">
            {weeks.map((week, wi) => {
              if (wi === 5 && week.every((d) => d.getMonth() !== month)) return null;
              const ws = getWeekStart(week[0]!);
              const isSel = sameDay(ws, selectedWeekStart);
              const isHov = hoverWeek !== null && sameDay(ws, hoverWeek);
              return (
                <div key={wi}
                  className={`grid grid-cols-7 rounded-lg cursor-pointer transition-colors ${
                    isSel ? "bg-[var(--color-accent)]"
                    : isHov ? "bg-[var(--color-accent-muted)]"
                    : "hover:bg-[var(--color-accent-muted)]"
                  }`}
                  onMouseEnter={() => setHoverWeek(ws)}
                  onMouseLeave={() => setHoverWeek(null)}
                  onClick={() => onSelect(ws)}
                >
                  {week.map((day, di) => {
                    const inMonth = day.getMonth() === month;
                    const isToday = sameDay(day, today);
                    return (
                      <div key={di} className={`text-center text-[12px] py-1.5 ${
                        isSel ? "text-white font-semibold"
                        : isToday ? "font-bold text-[var(--color-accent)]"
                        : inMonth ? "text-[var(--color-text)]"
                        : "text-[var(--color-text-muted)] opacity-30"
                      }`}>
                        {day.getDate()}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Month view */}
      {view === "month" && (
        <div className="grid grid-cols-3 gap-1 mt-1">
          {SHORT_MONTHS.map((m, i) => {
            const isSel = i === selectedWeekStart.getMonth() && year === selectedWeekStart.getFullYear();
            const isCur = i === today.getMonth() && year === today.getFullYear();
            return (
              <button key={m} type="button"
                onClick={() => { setDisplayDate(new Date(year, i, 1)); setView("week"); }}
                className={`py-2.5 rounded-lg text-[12px] font-medium transition-colors ${
                  isSel ? "bg-[var(--color-accent)] text-white"
                  : isCur ? "text-[var(--color-accent)] font-bold hover:bg-[var(--color-accent-muted)]"
                  : "text-[var(--color-text)] hover:bg-[var(--color-accent-muted)]"
                }`}>
                {m}
              </button>
            );
          })}
        </div>
      )}

      {/* Year view */}
      {view === "year" && (
        <div className="grid grid-cols-4 gap-1 mt-1">
          {Array.from({ length: 12 }, (_, i) => yearBase + i).map((y) => {
            const isSel = y === selectedWeekStart.getFullYear();
            const isCur = y === today.getFullYear();
            return (
              <button key={y} type="button"
                onClick={() => { setDisplayDate(new Date(y, month, 1)); setView("month"); }}
                className={`py-2.5 rounded-lg text-[12px] font-medium transition-colors ${
                  isSel ? "bg-[var(--color-accent)] text-white"
                  : isCur ? "text-[var(--color-accent)] font-bold hover:bg-[var(--color-accent-muted)]"
                  : "text-[var(--color-text)] hover:bg-[var(--color-accent-muted)]"
                }`}>
                {y}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
