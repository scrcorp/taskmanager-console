"use client";

/**
 * 간소화 콘솔 — 근태 (오늘 현황 + 이상 건).
 *
 * 스케줄과 같은 주간 스트립을 쓰되, 스트립 숫자는 "이상 건 수"다 (근태에서 급한 건 그거라서).
 */

import { useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useAttendances } from "@/hooks/useAttendances";
import { usePersistedFilters } from "@/hooks/usePersistedFilters";
import { useTimezone } from "@/hooks/useTimezone";
import { useModal } from "@/components/ui/imperative-modal";
import { COMPACT_FILTER_KEY } from "@/lib/compact";
import { addDay } from "@/lib/scheduleTime";
import { formatDayLabel, WEEKDAY_LABELS, weekDays } from "@/lib/compactWeek";
import { cn, todayInTimezone } from "@/lib/utils";
import { hasIssue } from "@/lib/compactAttendance";
import type { Attendance } from "@/types";
import { CompactAttendanceCard } from "./CompactAttendanceCard";
import { CompactAttendanceDetail } from "./CompactAttendanceDetail";

export function CompactAttendanceView() {
  const tz = useTimezone();
  const today = todayInTimezone(tz);
  const modal = useModal();

  const [storeParams] = usePersistedFilters(COMPACT_FILTER_KEY, { store: "" });
  const [params, setParams] = usePersistedFilters(`${COMPACT_FILTER_KEY}.attendances`, {
    date: today,
    seg: "all",
  });
  const selectedDate = params.date || today;
  const storeId = storeParams.store;
  const onlyIssues = params.seg === "issues";

  const days = useMemo(() => weekDays(selectedDate), [selectedDate]);

  const { data, isLoading, isError } = useAttendances({
    store_id: storeId || undefined,
    date_from: days[0],
    date_to: days[6],
    per_page: 500,
  });

  const items = useMemo(() => data?.items ?? [], [data]);

  const issueCountByDay = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const a of items) {
      if (!hasIssue(a)) continue;
      counts[a.work_date] = (counts[a.work_date] ?? 0) + 1;
    }
    return counts;
  }, [items]);

  const dayItems = useMemo(() => {
    const sameDay = items.filter((a) => a.work_date === selectedDate);
    const filtered = onlyIssues ? sameDay.filter(hasIssue) : sameDay;
    return filtered.sort((a, b) => (a.clock_in ?? "").localeCompare(b.clock_in ?? ""));
  }, [items, selectedDate, onlyIssues]);

  const issuesToday = useMemo(
    () => items.filter((a) => a.work_date === selectedDate && hasIssue(a)).length,
    [items, selectedDate],
  );

  const openDetail = async (attendance: Attendance) => {
    await modal.open(
      ({ close }) => <CompactAttendanceDetail attendance={attendance} onDone={close} />,
      { title: attendance.user_name ?? "Attendance", size: "md", closeOnBackdrop: false },
    );
  };

  if (!storeId) {
    return (
      <p className="px-4 py-10 text-center text-sm text-text-secondary">
        Select a store to see attendance.
      </p>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-border bg-surface/60 px-2 py-2">
        <div className="flex items-center justify-between px-1 pb-2">
          <button
            type="button"
            onClick={() => setParams({ date: addDay(selectedDate, -7) })}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-text-secondary hover:bg-surface-hover"
            aria-label="Previous week"
          >
            <ChevronLeft size={18} />
          </button>
          <span className="text-sm font-semibold text-text">{formatDayLabel(selectedDate)}</span>
          <button
            type="button"
            onClick={() => setParams({ date: addDay(selectedDate, 7) })}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-text-secondary hover:bg-surface-hover"
            aria-label="Next week"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        <div className="flex gap-1">
          {days.map((day, i) => {
            const active = day === selectedDate;
            const issues = issueCountByDay[day] ?? 0;
            return (
              <button
                key={day}
                type="button"
                onClick={() => setParams({ date: day })}
                aria-current={active ? "date" : undefined}
                className={cn(
                  "flex flex-1 flex-col items-center gap-0.5 rounded-lg py-1.5 transition-colors",
                  active ? "bg-accent-muted text-accent" : "text-text-secondary",
                )}
              >
                <span className="text-[10px] font-medium">{WEEKDAY_LABELS[i]}</span>
                <span className={cn("text-sm font-bold", day === today && !active && "text-text")}>
                  {Number(day.slice(8, 10))}
                </span>
                <span
                  className={cn("text-[10px] tabular-nums", issues > 0 && "font-bold text-danger")}
                >
                  {issues > 0 ? issues : "·"}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* All / Issues 세그먼트 */}
      <div className="flex shrink-0 gap-1 px-3 py-2">
        {(["all", "issues"] as const).map((seg) => (
          <button
            key={seg}
            type="button"
            onClick={() => setParams({ seg })}
            className={cn(
              "h-9 flex-1 rounded-lg text-sm font-semibold transition-colors",
              params.seg === seg
                ? "bg-accent-muted text-accent"
                : "bg-surface text-text-secondary",
            )}
          >
            {seg === "all" ? "All" : `Issues${issuesToday > 0 ? ` (${issuesToday})` : ""}`}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-auto overscroll-contain px-3 pb-3">
        {isLoading && (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl bg-surface-hover" />
            ))}
          </div>
        )}

        {isError && (
          <p className="px-2 py-8 text-center text-sm text-danger">
            Couldn&apos;t load attendance. Check your connection and try again.
          </p>
        )}

        {!isLoading && !isError && dayItems.length === 0 && (
          <p className="px-2 py-10 text-center text-sm text-text-secondary">
            {onlyIssues ? "No issues on this day." : "No attendance records on this day."}
          </p>
        )}

        <div className="space-y-2">
          {dayItems.map((attendance) => (
            <CompactAttendanceCard
              key={attendance.id}
              attendance={attendance}
              onClick={() => openDetail(attendance)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
