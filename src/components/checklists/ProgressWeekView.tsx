"use client";

/**
 * 체크리스트 Week View 컴포넌트.
 *
 * Shows a staff × day grid with mini progress bars.
 * Cell color: 100%=green, 50-99%=yellow, <50%=red, no checklist=gray.
 * Cell click → switches to Day view for that date.
 */

import React, { useMemo } from "react";
import { cn } from "@/lib/utils";
import type { ChecklistInstance } from "@/types";

interface ProgressWeekViewProps {
  /** All instances for the week — expected to cover the full Mon-Sun range */
  instancesByDate: Record<string, ChecklistInstance[]>;
  weekDates: Date[];
  onDayClick: (date: Date) => void;
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function dayLabel(d: Date): string {
  return d.toLocaleDateString("en-US", { weekday: "short" });
}

function dayNum(d: Date): number {
  return d.getDate();
}

function isToday(d: Date): boolean {
  const t = new Date();
  return (
    d.getFullYear() === t.getFullYear() &&
    d.getMonth() === t.getMonth() &&
    d.getDate() === t.getDate()
  );
}

/** Aggregates progress for a list of instances */
function aggregateProgress(instances: ChecklistInstance[]): { completed: number; total: number } {
  return instances.reduce(
    (acc, inst) => ({
      completed: acc.completed + inst.completed_items,
      total: acc.total + inst.total_items,
    }),
    { completed: 0, total: 0 },
  );
}

function cellColorClass(percentage: number | null): string {
  if (percentage === null) return "bg-surface-hover text-text-muted";
  if (percentage === 100) return "bg-[var(--color-success-muted)] text-[var(--color-success)]";
  if (percentage >= 50) return "bg-[var(--color-warning-muted)] text-[var(--color-warning)]";
  return "bg-[var(--color-danger-muted)] text-[var(--color-danger)]";
}

function progressBarColor(percentage: number | null): string {
  if (percentage === null) return "bg-border";
  if (percentage === 100) return "bg-[var(--color-success)]";
  if (percentage >= 50) return "bg-[var(--color-warning)]";
  return "bg-[var(--color-danger)]";
}

export function ProgressWeekView({
  instancesByDate,
  weekDates,
  onDayClick,
}: ProgressWeekViewProps): React.ReactElement {
  // Collect all unique staff names across the week
  const staffNames = useMemo(() => {
    const names = new Set<string>();
    for (const instances of Object.values(instancesByDate)) {
      for (const inst of instances) {
        if (inst.user_name) names.add(inst.user_name);
      }
    }
    return Array.from(names).sort();
  }, [instancesByDate]);

  if (staffNames.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl p-12 text-center text-text-muted">
        <div className="text-3xl mb-3">📋</div>
        <div className="text-sm font-semibold text-text-secondary">No checklists this week</div>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse min-w-[600px]">
        <thead>
          <tr>
            <th className="text-left text-xs font-semibold text-text-secondary px-4 py-2.5 bg-surface border-b border-border min-w-[140px]">
              Staff
            </th>
            {weekDates.map((d) => {
              const today = isToday(d);
              return (
                <th
                  key={toDateStr(d)}
                  className={cn(
                    "text-center text-xs font-semibold px-2 py-2.5 border-b border-border min-w-[100px]",
                    today ? "bg-accent-muted text-accent" : "bg-surface text-text-secondary",
                  )}
                >
                  <div>{dayLabel(d)}</div>
                  <div className={cn("text-[11px] font-normal", today ? "text-accent" : "text-text-muted")}>
                    {dayNum(d)}
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {staffNames.map((name, rowIdx) => (
            <tr key={name} className={cn("border-b border-border", rowIdx % 2 === 0 ? "bg-card" : "bg-surface")}>
              <td className="px-4 py-2.5 text-sm font-medium text-text whitespace-nowrap">
                {name}
              </td>
              {weekDates.map((d) => {
                const dateStr = toDateStr(d);
                const dayInstances = (instancesByDate[dateStr] ?? []).filter(
                  (inst) => inst.user_name === name,
                );
                const today = isToday(d);

                if (dayInstances.length === 0) {
                  return (
                    <td
                      key={dateStr}
                      className={cn(
                        "px-2 py-2.5 text-center cursor-pointer hover:bg-surface-hover transition-colors",
                        today && "bg-accent-muted/20",
                      )}
                      onClick={() => onDayClick(d)}
                    >
                      <span className="text-[10px] text-text-muted">—</span>
                    </td>
                  );
                }

                const { completed, total } = aggregateProgress(dayInstances);
                const percentage = total > 0 ? Math.round((completed / total) * 100) : null;

                return (
                  <td
                    key={dateStr}
                    className={cn(
                      "px-2 py-2.5 cursor-pointer hover:opacity-80 transition-opacity",
                      today && "ring-1 ring-inset ring-accent",
                    )}
                    onClick={() => onDayClick(d)}
                  >
                    <div className={cn("rounded px-1.5 py-1", cellColorClass(percentage))}>
                      <div className="h-1 rounded-full bg-black/10 overflow-hidden mb-1">
                        <div
                          className={cn("h-full rounded-full", progressBarColor(percentage))}
                          style={{ width: `${percentage ?? 0}%` }}
                        />
                      </div>
                      <div className="text-[10px] font-semibold text-center">
                        {percentage !== null ? `${completed}/${total}` : "—"}
                      </div>
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
