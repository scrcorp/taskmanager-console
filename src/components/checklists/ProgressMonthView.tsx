"use client";

/**
 * 체크리스트 Month View 컴포넌트.
 *
 * Shows a calendar grid (5-6 weeks) with per-day completion rate.
 * Color: ≥90%=green, 70-89%=yellow, <70%=red.
 * Today highlighted, future dates dimmed.
 * Day click → switches to Day view.
 */

import React, { useMemo } from "react";
import { cn } from "@/lib/utils";
import type { ChecklistInstance } from "@/types";

interface ProgressMonthViewProps {
  /** Map of date string (YYYY-MM-DD) → instances */
  instancesByDate: Record<string, ChecklistInstance[]>;
  /** The month being displayed (any date within that month) */
  month: Date;
  onDayClick: (date: Date) => void;
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function isToday(d: Date): boolean {
  const t = new Date();
  return (
    d.getFullYear() === t.getFullYear() &&
    d.getMonth() === t.getMonth() &&
    d.getDate() === t.getDate()
  );
}

function isFuture(d: Date): boolean {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return d > t;
}

function isSameMonth(d: Date, month: Date): boolean {
  return d.getMonth() === month.getMonth() && d.getFullYear() === month.getFullYear();
}

/** Build a 5-6 week calendar grid */
function buildCalendarGrid(month: Date): Date[] {
  const year = month.getFullYear();
  const m = month.getMonth();
  const firstDay = new Date(year, m, 1);
  const lastDay = new Date(year, m + 1, 0);

  // Start from Monday of the first week
  const startOffset = (firstDay.getDay() + 6) % 7; // 0=Mon
  const start = new Date(firstDay);
  start.setDate(firstDay.getDate() - startOffset);

  // End on Sunday of the last week
  const endOffset = (7 - ((lastDay.getDay() + 1) % 7)) % 7;
  const end = new Date(lastDay);
  end.setDate(lastDay.getDate() + endOffset);

  const days: Date[] = [];
  const cur = new Date(start);
  while (cur <= end) {
    days.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

function getCompletion(instances: ChecklistInstance[]): number | null {
  if (instances.length === 0) return null;
  const total = instances.reduce((s, i) => s + i.total_items, 0);
  const completed = instances.reduce((s, i) => s + i.completed_items, 0);
  return total > 0 ? Math.round((completed / total) * 100) : null;
}

function rateColorClass(rate: number): string {
  if (rate >= 90) return "bg-[var(--color-success-muted)] text-[var(--color-success)]";
  if (rate >= 70) return "bg-[var(--color-warning-muted)] text-[var(--color-warning)]";
  return "bg-[var(--color-danger-muted)] text-[var(--color-danger)]";
}

function rateBarColor(rate: number): string {
  if (rate >= 90) return "bg-[var(--color-success)]";
  if (rate >= 70) return "bg-[var(--color-warning)]";
  return "bg-[var(--color-danger)]";
}

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function ProgressMonthView({
  instancesByDate,
  month,
  onDayClick,
}: ProgressMonthViewProps): React.ReactElement {
  const days = useMemo(() => buildCalendarGrid(month), [month]);

  // Chunk into weeks
  const weeks = useMemo(() => {
    const result: Date[][] = [];
    for (let i = 0; i < days.length; i += 7) {
      result.push(days.slice(i, i + 7));
    }
    return result;
  }, [days]);

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden">
      {/* 요일 헤더 */}
      <div className="grid grid-cols-7 border-b border-border">
        {WEEKDAY_LABELS.map((label) => (
          <div
            key={label}
            className="py-2 text-center text-[11px] font-semibold text-text-secondary"
          >
            {label}
          </div>
        ))}
      </div>

      {/* 달력 그리드 */}
      {weeks.map((week, wi) => (
        <div key={wi} className="grid grid-cols-7">
          {week.map((day) => {
            const dateStr = toDateStr(day);
            const inMonth = isSameMonth(day, month);
            const today = isToday(day);
            const future = isFuture(day);
            const instances = instancesByDate[dateStr] ?? [];
            const rate = getCompletion(instances);

            return (
              <div
                key={dateStr}
                className={cn(
                  "min-h-[70px] p-1.5 border-b border-r border-border last:border-r-0 cursor-pointer transition-colors",
                  !inMonth && "opacity-30",
                  future && "opacity-50 cursor-default",
                  today && "ring-2 ring-inset ring-accent",
                  !future && "hover:bg-surface-hover",
                )}
                onClick={() => (!future ? onDayClick(day) : undefined)}
              >
                {/* 날짜 숫자 */}
                <div
                  className={cn(
                    "text-[11px] font-semibold mb-1",
                    today ? "text-accent" : inMonth ? "text-text-secondary" : "text-text-muted",
                  )}
                >
                  {day.getDate()}
                </div>

                {/* 완료율 표시 */}
                {!future && rate !== null ? (
                  <div className={cn("rounded px-1 py-0.5", rateColorClass(rate))}>
                    <div className="h-1 rounded-full bg-black/10 overflow-hidden mb-0.5">
                      <div
                        className={cn("h-full rounded-full", rateBarColor(rate))}
                        style={{ width: `${rate}%` }}
                      />
                    </div>
                    <div className="text-[9px] font-bold text-center">{rate}%</div>
                  </div>
                ) : !future && instances.length === 0 && inMonth ? (
                  <div className="text-[9px] text-text-muted text-center mt-1">—</div>
                ) : null}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
