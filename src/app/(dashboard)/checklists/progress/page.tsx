"use client";

/**
 * 체크리스트 Progress & Review 페이지.
 *
 * Day / Week / Month 토글 뷰.
 * - Day view: instance card list + summary + filter tabs
 * - Week view: staff × day grid
 * - Month view: calendar grid with daily completion rates
 */

import React, { useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useStores } from "@/hooks/useStores";
import { useChecklistInstances, useReviewSummary } from "@/hooks/useChecklistInstances";
import { usePersistedFilters } from "@/hooks/usePersistedFilters";
import { Select } from "@/components/ui";
import { ProgressDayView } from "@/components/checklists/ProgressDayView";
import { ProgressWeekView } from "@/components/checklists/ProgressWeekView";
import { ProgressMonthView } from "@/components/checklists/ProgressMonthView";
import { cn, todayInTimezone } from "@/lib/utils";
import { useTimezone } from "@/hooks/useTimezone";
import type { ChecklistInstance } from "@/types";

// ─── Date helpers ─────────────────────────────────────────────────────────────

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function addMonths(d: Date, n: number): Date {
  const r = new Date(d);
  r.setMonth(r.getMonth() + n);
  return r;
}

/** Monday of the week containing d */
function weekStart(d: Date): Date {
  const r = new Date(d);
  const day = r.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  r.setDate(r.getDate() + diff);
  return r;
}

function dayLabel(d: Date): string {
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    weekday: "short",
  });
}

function weekLabel(start: Date): string {
  const end = addDays(start, 6);
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  return `${start.toLocaleDateString("en-US", opts)} – ${end.toLocaleDateString("en-US", opts)}, ${end.getFullYear()}`;
}

function monthLabel(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

// ─── Component ────────────────────────────────────────────────────────────────

type ViewMode = "day" | "week" | "month";

export default function ChecklistProgressPage(): React.ReactElement {
  const tz = useTimezone();

  // URL + localStorage 영속 — date 는 transient (매 세션 새 today 가 자연스러움)
  const [params, setParams] = usePersistedFilters(
    "checklists.progress",
    { date: "", view: "day", store: "", q: "" },
    { transient: ["date"] },
  );
  const view = params.view as ViewMode;
  const selectedStoreId = params.store;
  const searchQuery = params.q;
  const selectedDate: Date = useMemo(() => {
    const raw = params.date || todayInTimezone(tz);
    const [y, m, d] = raw.split("-").map(Number);
    return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
  }, [params.date, tz]);
  const setSelectedDate = (next: Date | ((prev: Date) => Date)): void => {
    const resolved = typeof next === "function" ? next(selectedDate) : next;
    setParams({ date: toDateStr(resolved) });
  };
  const setView = (v: ViewMode): void => setParams({ view: v === "day" ? null : v });
  const setSelectedStoreId = (v: string): void => setParams({ store: v || null });
  const setSearchQuery = (v: string): void => setParams({ q: v || null });

  // ── Derived date ranges ──────────────────────────────────────────────────

  const dateStr = toDateStr(selectedDate);

  const weekStartDate = useMemo(() => weekStart(selectedDate), [selectedDate]);
  const weekDates = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStartDate, i)),
    [weekStartDate],
  );
  const weekFromStr = toDateStr(weekStartDate);
  const weekToStr = toDateStr(addDays(weekStartDate, 6));

  const monthStart = useMemo(
    () => new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1),
    [selectedDate],
  );
  const monthEnd = useMemo(
    () => new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0),
    [selectedDate],
  );
  const monthFromStr = toDateStr(monthStart);
  const monthToStr = toDateStr(monthEnd);

  // ── Data fetching ────────────────────────────────────────────────────────

  const { data: stores = [] } = useStores();

  // Day view — fetch for the selected date (work_date 단일 날짜 필터)
  const { data: dayData, isLoading: dayLoading } = useChecklistInstances({
    work_date: dateStr,
    ...(selectedStoreId ? { store_id: selectedStoreId } : {}),
    per_page: 200,
  });

  // Week/Month view — API supports only single work_date filter.
  // Fetch a large page without date filter and post-filter client-side by date range.
  // React Query deduplicates these two calls since the params are identical.
  const { data: rangeData, isLoading: rangeLoading } = useChecklistInstances({
    ...(selectedStoreId ? { store_id: selectedStoreId } : {}),
    per_page: 1000,
  });

  // ── Review summary for Day view ──────────────────────────────────────────

  const { data: reviewSummary } = useReviewSummary({
    ...(selectedStoreId ? { store_id: selectedStoreId } : {}),
    date_from: dateStr,
    date_to: dateStr,
  });

  // ── Instances ────────────────────────────────────────────────────────────

  const dayInstances: ChecklistInstance[] = useMemo(
    () => (dayData?.items ?? []).filter((i) => i.work_date === dateStr),
    [dayData, dateStr],
  );

  const weekInstancesByDate = useMemo(() => {
    const all = rangeData?.items ?? [];
    const map: Record<string, ChecklistInstance[]> = {};
    for (const inst of all) {
      if (inst.work_date >= weekFromStr && inst.work_date <= weekToStr) {
        if (!map[inst.work_date]) map[inst.work_date] = [];
        map[inst.work_date].push(inst);
      }
    }
    return map;
  }, [rangeData, weekFromStr, weekToStr]);

  const monthInstancesByDate = useMemo(() => {
    const all = rangeData?.items ?? [];
    const map: Record<string, ChecklistInstance[]> = {};
    for (const inst of all) {
      if (inst.work_date >= monthFromStr && inst.work_date <= monthToStr) {
        if (!map[inst.work_date]) map[inst.work_date] = [];
        map[inst.work_date].push(inst);
      }
    }
    return map;
  }, [rangeData, monthFromStr, monthToStr]);

  // ── Summary stats (Day view) ─────────────────────────────────────────────

  const summaryStats = useMemo(() => {
    const total = dayInstances.length;
    const completed = dayInstances.filter((i) => i.status === "completed").length;
    const inProgress = dayInstances.filter((i) => i.status === "in_progress").length;
    const needsReview = dayInstances.filter((i) =>
      i.items?.some(
        (item) => item.is_completed && (item.review_result === null || item.review_result === "fail" || item.review_result === "pending_re_review"),
      ),
    ).length;
    return { total, completed, inProgress, needsReview };
  }, [dayInstances]);

  // ── Navigation ───────────────────────────────────────────────────────────

  function navigatePrev() {
    if (view === "day") setSelectedDate((d) => addDays(d, -1));
    else if (view === "week") setSelectedDate((d) => addDays(d, -7));
    else setSelectedDate((d) => addMonths(d, -1));
  }

  function navigateNext() {
    if (view === "day") setSelectedDate((d) => addDays(d, 1));
    else if (view === "week") setSelectedDate((d) => addDays(d, 7));
    else setSelectedDate((d) => addMonths(d, 1));
  }

  function currentLabel(): string {
    if (view === "day") return dayLabel(selectedDate);
    if (view === "week") return weekLabel(weekStartDate);
    return monthLabel(selectedDate);
  }

  // ── Store select options ─────────────────────────────────────────────────

  const storeOptions = useMemo(
    () => [{ value: "", label: "All Stores" }, ...stores.map((s) => ({ value: s.id, label: s.name }))],
    [stores],
  );

  // ── Review summary bar percentages ──────────────────────────────────────

  const totalReviewItems = reviewSummary
    ? reviewSummary.pass + reviewSummary.fail + reviewSummary.pending_re_review + reviewSummary.unreviewed
    : 0;

  function reviewPct(n: number): number {
    return totalReviewItems > 0 ? (n / totalReviewItems) * 100 : 0;
  }

  return (
    <div className="flex flex-col gap-3.5">
      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-text">Checklist Progress & Review</h1>
          <p className="text-sm text-text-muted mt-0.5">Track staff checklist completion and review items</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Day/Week/Month toggle */}
          <div className="flex items-center rounded-lg border border-border overflow-hidden">
            {(["day", "week", "month"] as ViewMode[]).map((v) => (
              <button
                key={v}
                className={cn(
                  "px-3 py-1.5 text-sm font-medium transition-colors duration-150 capitalize cursor-pointer border-none",
                  view === v
                    ? "bg-accent text-white"
                    : "text-text-muted hover:text-text hover:bg-surface-hover bg-transparent",
                )}
                onClick={() => setView(v)}
              >
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>

          {/* Store filter */}
          <div style={{ width: 180 }}>
            <Select
              options={storeOptions}
              value={selectedStoreId}
              onChange={(e) => setSelectedStoreId(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* ── Date navigation + search ─────────────────────────────────────── */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <button
            className="flex items-center justify-center w-8 h-8 rounded text-text-muted hover:text-text hover:bg-surface-hover transition-colors border-none bg-transparent cursor-pointer"
            onClick={navigatePrev}
            aria-label="Previous"
          >
            <ChevronLeft size={18} />
          </button>
          <span className="text-[15px] font-bold text-text min-w-[200px] text-center">
            {currentLabel()}
          </span>
          <button
            className="flex items-center justify-center w-8 h-8 rounded text-text-muted hover:text-text hover:bg-surface-hover transition-colors border-none bg-transparent cursor-pointer"
            onClick={navigateNext}
            aria-label="Next"
          >
            <ChevronRight size={18} />
          </button>
          <button
            className="px-3 py-1 text-xs font-semibold border border-border rounded text-text-secondary hover:text-text hover:border-accent hover:bg-[var(--color-accent-muted)] transition-colors cursor-pointer bg-transparent"
            onClick={() => setSelectedDate(new Date())}
          >
            Today
          </button>
        </div>

        <div className="flex-1" />

        {/* 검색 (Day view only) */}
        {view === "day" && (
          <input
            type="text"
            placeholder="Search staff or template…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="px-3 py-1.5 text-sm bg-surface border border-border rounded-lg text-text placeholder:text-text-muted outline-none focus:border-accent transition-colors w-52"
          />
        )}
      </div>

      {/* ── Summary cards (Day view only) ────────────────────────────────── */}
      {view === "day" && (
        <div className="flex gap-3 flex-wrap">
          <SummaryCard value={summaryStats.total} label="Total" detail="all checklists today" colorClass="text-accent" />
          <SummaryCard value={summaryStats.completed} label="Completed" detail="fully done" colorClass="text-[var(--color-success)]" />
          <SummaryCard value={summaryStats.inProgress} label="In Progress" detail="currently active" colorClass="text-warning" />
          <SummaryCard value={summaryStats.needsReview} label="Needs Review" detail="awaiting review" colorClass="text-[var(--color-danger)]" />
        </div>
      )}

      {/* ── Review summary bar (Day view only) ───────────────────────────── */}
      {view === "day" && reviewSummary && totalReviewItems > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 bg-card border border-border rounded-lg flex-wrap">
          <ReviewStat dot="bg-[var(--color-success)]" label="Pass" count={reviewSummary.pass} />
          <ReviewStat dot="bg-[var(--color-danger)]" label="Fail" count={reviewSummary.fail} />
          <ReviewStat dot="bg-warning" label="Re-review" count={reviewSummary.pending_re_review} />
          <ReviewStat dot="bg-text-muted" label="Unreviewed" count={reviewSummary.unreviewed} />
          {/* Progress track */}
          <div className="flex-1 h-2 rounded-full bg-border overflow-hidden flex min-w-[80px]">
            <div className="bg-[var(--color-success)] h-full" style={{ width: `${reviewPct(reviewSummary.pass)}%` }} />
            <div className="bg-[var(--color-danger)] h-full" style={{ width: `${reviewPct(reviewSummary.fail)}%` }} />
            <div className="bg-warning h-full" style={{ width: `${reviewPct(reviewSummary.pending_re_review)}%` }} />
          </div>
        </div>
      )}

      {/* ── View content ─────────────────────────────────────────────────── */}
      {view === "day" && (
        <ProgressDayView
          instances={dayInstances}
          isLoading={dayLoading}
          searchQuery={searchQuery}
        />
      )}

      {view === "week" && (
        rangeLoading ? (
          <div className="bg-card border border-border rounded-xl p-12 text-center text-text-muted">Loading…</div>
        ) : (
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <ProgressWeekView
              instancesByDate={weekInstancesByDate}
              weekDates={weekDates}
              onDayClick={(d) => {
                setSelectedDate(d);
                setView("day");
              }}
            />
          </div>
        )
      )}

      {view === "month" && (
        rangeLoading ? (
          <div className="bg-card border border-border rounded-xl p-12 text-center text-text-muted">Loading…</div>
        ) : (
          <ProgressMonthView
            instancesByDate={monthInstancesByDate}
            month={selectedDate}
            onDayClick={(d) => {
              setSelectedDate(d);
              setView("day");
            }}
          />
        )
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface SummaryCardProps {
  value: number;
  label: string;
  detail: string;
  colorClass: string;
}

function SummaryCard({ value, label, detail, colorClass }: SummaryCardProps): React.ReactElement {
  return (
    <div className="flex-1 min-w-[130px] p-3.5 px-4 rounded-xl bg-card border border-border">
      <div className={cn("text-[28px] font-extrabold leading-tight", colorClass)}>{value}</div>
      <div className="text-[11px] font-semibold text-text-secondary mt-1">{label}</div>
      <div className="text-[10px] text-text-muted mt-0.5">{detail}</div>
    </div>
  );
}

interface ReviewStatProps {
  dot: string;
  label: string;
  count: number;
}

function ReviewStat({ dot, label, count }: ReviewStatProps): React.ReactElement {
  return (
    <div className="flex items-center gap-1.5 text-xs font-semibold text-text-secondary">
      <span className={cn("w-2 h-2 rounded-full shrink-0", dot)} />
      {label}
      <span className="text-text font-bold">{count}</span>
    </div>
  );
}
