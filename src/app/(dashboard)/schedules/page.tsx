"use client";

/**
 * 스케줄 Overview 페이지 — 스케줄 현황을 Day/Week/Month/List 뷰로 조회.
 *
 * Shows confirmed schedule entries across Day, Week, Month calendar views
 * and a List view with flexible date range.
 */

import React, { useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useUrlParams } from "@/hooks/useUrlParams";
import {
  ChevronLeft,
  ChevronRight,
  Calendar,
  List,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useStores } from "@/hooks/useStores";
import { useWorkRoles } from "@/hooks/useWorkRoles";
import { useSchedules } from "@/hooks/useSchedules";
import { useReviewSummary, useScheduleChecklistMap } from "@/hooks/useChecklistInstances";
import { Card, Badge } from "@/components/ui";
import { cn } from "@/lib/utils";
import type { ChecklistInstance, Store, Schedule, WorkRole } from "@/types";

// ─── View types ─────────────────────────────────────

type CalView = "day" | "week" | "month";
type MainView = "calendar" | "list";
type ListPreset = "today" | "week" | "month" | "custom";

// ─── Date helpers ───────────────────────────────────

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function getWeekStart(d: Date): Date {
  const r = new Date(d);
  const day = r.getDay();
  r.setDate(r.getDate() - day);
  r.setHours(0, 0, 0, 0);
  return r;
}

function getWeekDays(sun: Date): string[] {
  return Array.from({ length: 7 }, (_, i) => toDateStr(addDays(sun, i)));
}

function shortDay(ds: string): string {
  return new Date(ds + "T00:00:00").toLocaleDateString("en-US", { weekday: "short" });
}

function shortDate(ds: string): string {
  const d = new Date(ds + "T00:00:00");
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function longDate(ds: string): string {
  return new Date(ds + "T00:00:00").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    weekday: "short",
  });
}

function dayLabel(d: Date): string {
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    weekday: "short",
  });
}

function weekLabel(days: string[]): string {
  const s = new Date(days[0] + "T00:00:00");
  const e = new Date(days[6] + "T00:00:00");
  const o: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  return `${s.toLocaleDateString("en-US", o)} – ${e.toLocaleDateString("en-US", { ...o, year: "numeric" })}`;
}

function monthLabel(y: number, m: number): string {
  return new Date(y, m).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function getMonthRange(y: number, m: number): { from: string; to: string } {
  const first = `${y}-${String(m + 1).padStart(2, "0")}-01`;
  const lastDay = new Date(y, m + 1, 0).getDate();
  const last = `${y}-${String(m + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { from: first, to: last };
}

function getListPresetRange(preset: ListPreset): { from: string; to: string } {
  const now = new Date();
  const todayStr = toDateStr(now);
  if (preset === "today") return { from: todayStr, to: todayStr };
  if (preset === "week") {
    const sun = getWeekStart(now);
    return { from: toDateStr(sun), to: toDateStr(addDays(sun, 6)) };
  }
  // month
  return getMonthRange(now.getFullYear(), now.getMonth());
}

// ─── Component ──────────────────────────────────────

export default function ScheduleOverviewPage(): React.ReactElement {
  const router = useRouter();

  // View state (URL-persisted)
  const defaultListRange = getListPresetRange("week");
  const [urlParams, setUrlParams] = useUrlParams({
    store: "",
    view: "calendar",
    cv: "week",
    date: toDateStr(new Date()),
    preset: "week",
    from: defaultListRange.from,
    to: defaultListRange.to,
    sort: "work_date",
    asc: "true",
  });

  const mainView = (urlParams.view === "list" ? "list" : "calendar") as MainView;
  const calView = (["day", "week", "month"].includes(urlParams.cv) ? urlParams.cv : "week") as CalView;
  const currentDate = useMemo(() => new Date(urlParams.date + "T00:00:00"), [urlParams.date]);
  const weekStart = useMemo(() => getWeekStart(new Date(urlParams.date + "T00:00:00")), [urlParams.date]);
  const monthYear = useMemo(() => {
    const d = new Date(urlParams.date + "T00:00:00");
    return { year: d.getFullYear(), month: d.getMonth() };
  }, [urlParams.date]);

  // Store selection
  const { data: stores } = useStores();
  const storeId = urlParams.store;

  // List view date range
  const listPreset = (["today", "week", "month", "custom"].includes(urlParams.preset) ? urlParams.preset : "week") as ListPreset;
  const listFrom = urlParams.from;
  const listTo = urlParams.to;

  // List sort
  const sortKey = urlParams.sort;
  const sortAsc = urlParams.asc !== "false";

  // Auto-select first store
  const effectiveStoreId = storeId || stores?.[0]?.id || "";

  // Date range for data fetching
  const dateRange = useMemo(() => {
    if (mainView === "list") return { from: listFrom, to: listTo };
    if (calView === "day") {
      const ds = toDateStr(currentDate);
      return { from: ds, to: ds };
    }
    if (calView === "week") {
      const days = getWeekDays(weekStart);
      return { from: days[0], to: days[6] };
    }
    return getMonthRange(monthYear.year, monthYear.month);
  }, [mainView, calView, currentDate, weekStart, monthYear, listFrom, listTo]);

  // Fetch data
  const { data: workRoles } = useWorkRoles(effectiveStoreId || undefined);

  // Schedule entries
  const { data: schedulesData, isLoading } = useSchedules({
    store_id: effectiveStoreId || undefined,
    date_from: dateRange.from,
    date_to: dateRange.to,
    per_page: 500,
  });

  const allSchedules = useMemo(
    () => (schedulesData?.items ?? []).filter((s) => s.status !== "cancelled"),
    [schedulesData],
  );

  // Review summary from server
  const { data: reviewSummary } = useReviewSummary({
    store_id: effectiveStoreId || undefined,
    date_from: dateRange.from,
    date_to: dateRange.to,
  });

  // Checklist instance map (schedule_id → instance) for progress display in cards
  const { data: checklistMap } = useScheduleChecklistMap(
    effectiveStoreId || undefined,
    dateRange.from,
    dateRange.to,
  );

  const activeRoles = useMemo(
    () => (workRoles ?? []).filter((r) => r.is_active),
    [workRoles],
  );

  // ─── Navigation ─────────────────────────────────

  const goToday = useCallback(() => {
    setUrlParams({ date: toDateStr(new Date()) });
  }, [setUrlParams]);

  const goPrev = useCallback(() => {
    if (calView === "day") {
      setUrlParams({ date: toDateStr(addDays(currentDate, -1)) });
    } else if (calView === "week") {
      setUrlParams({ date: toDateStr(addDays(weekStart, -7)) });
    } else {
      const nm = monthYear.month - 1;
      const newDate = nm < 0
        ? new Date(monthYear.year - 1, 11, 1)
        : new Date(monthYear.year, nm, 1);
      setUrlParams({ date: toDateStr(newDate) });
    }
  }, [calView, currentDate, weekStart, monthYear, setUrlParams]);

  const goNext = useCallback(() => {
    if (calView === "day") {
      setUrlParams({ date: toDateStr(addDays(currentDate, 1)) });
    } else if (calView === "week") {
      setUrlParams({ date: toDateStr(addDays(weekStart, 7)) });
    } else {
      const nm = monthYear.month + 1;
      const newDate = nm > 11
        ? new Date(monthYear.year + 1, 0, 1)
        : new Date(monthYear.year, nm, 1);
      setUrlParams({ date: toDateStr(newDate) });
    }
  }, [calView, currentDate, weekStart, monthYear, setUrlParams]);

  const dateLabel = useMemo(() => {
    if (calView === "day") return dayLabel(currentDate);
    if (calView === "week") return weekLabel(getWeekDays(weekStart));
    return monthLabel(monthYear.year, monthYear.month);
  }, [calView, currentDate, weekStart, monthYear]);

  // ─── Summary stats ──────────────────────────────

  const summary = useMemo(() => {
    const total = allSchedules.length;
    const rv = reviewSummary;
    const fullyApproved = rv?.fully_approved_assignments ?? 0;
    const pct = total > 0 ? Math.round((fullyApproved / total) * 100) : 0;
    // Item completion = approved (pass) / total items
    const totalItems = rv?.total_items ?? 0;
    const passCount = rv?.pass ?? 0;
    const itemPct = totalItems > 0 ? Math.round((passCount / totalItems) * 100) : 0;
    return { total, completed: fullyApproved, pct,
      totalItems, passCount, itemPct,
      pass: passCount, fail: rv?.fail ?? 0,
      unreviewed: rv?.unreviewed ?? 0,
    };
  }, [allSchedules, reviewSummary]);

  // Range label for summary
  const rangeLabel = useMemo(() => {
    if (dateRange.from === dateRange.to) return longDate(dateRange.from);
    return `${shortDate(dateRange.from)} – ${shortDate(dateRange.to)}`;
  }, [dateRange]);

  // ─── List preset handler ────────────────────────

  const handlePresetChange = useCallback((preset: ListPreset) => {
    if (preset !== "custom") {
      const range = getListPresetRange(preset);
      setUrlParams({ preset, from: range.from, to: range.to });
    } else {
      setUrlParams({ preset });
    }
  }, [setUrlParams]);

  const handleListFromChange = useCallback((v: string) => {
    setUrlParams({ from: v, preset: "custom" });
  }, [setUrlParams]);

  const handleListToChange = useCallback((v: string) => {
    setUrlParams({ to: v, preset: "custom" });
  }, [setUrlParams]);

  // ─── Sort handler ──────────────────────────────

  const handleSort = useCallback((key: string) => {
    if (sortKey === key) {
      setUrlParams({ asc: sortAsc ? "false" : "true" });
    } else {
      setUrlParams({ sort: key, asc: "true" });
    }
  }, [sortKey, sortAsc, setUrlParams]);

  // ─── Navigate to detail ─────────────────────────

  const goToDetail = useCallback(
    (id: string) => router.push(`/schedules/${id}`),
    [router],
  );

  // ─── Click month day → switch to day view ───────

  const goToDay = useCallback((dateStr: string) => {
    setUrlParams({ date: dateStr, cv: "day" });
  }, [setUrlParams]);

  // ─── Render ─────────────────────────────────────

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-extrabold text-text">Schedule Overview</h1>
      </div>

      {/* Summary */}
      <p className="text-xs text-text-muted uppercase tracking-wider font-semibold mb-2">
        Summary — {rangeLabel}
      </p>
      <div className="space-y-4 mb-6">
        {/* Schedule */}
        <div>
          <p className="text-[10px] text-text-muted uppercase tracking-wider font-semibold mb-2">Schedule</p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <PctCard label="Completion" sub={`${summary.completed}/${summary.total}`} pct={summary.pct} />
            <MiniCard label="Total" value={summary.total} color="text-accent" dot="bg-accent" />
            <MiniCard label="Completed" value={summary.completed} color="text-success" dot="bg-success" />
          </div>
        </div>

        <div className="border-t border-border" />

        {/* Checklist Items */}
        <div>
          <p className="text-[10px] text-text-muted uppercase tracking-wider font-semibold mb-2">Checklist Items</p>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <PctCard label="Completion" sub={`${summary.pass}/${summary.totalItems}`} pct={summary.itemPct} />
            <MiniCard label="Pending" value={summary.unreviewed} color="text-text-muted" dot="bg-text-muted" />
            <MiniCard label="Rejected" value={summary.fail} color="text-danger" dot="bg-danger" />
            <MiniCard label="Approved" value={summary.pass} color="text-success" dot="bg-success" />
          </div>
        </div>
      </div>

      {/* Store + View */}
      <div className="flex items-center justify-between gap-4 mb-1.5">
        <p className="text-[10px] text-text-muted uppercase tracking-wider font-semibold">Store</p>
        <p className="text-[10px] text-text-muted uppercase tracking-wider font-semibold">View</p>
      </div>
      <div className="flex items-center justify-between gap-4 mb-4">
        <div className="flex gap-1 overflow-x-auto min-w-0">
          {(stores ?? []).map((s: Store) => (
            <button
              key={s.id}
              onClick={() => setUrlParams({ store: s.id })}
              className={cn(
                "px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors",
                s.id === effectiveStoreId
                  ? "bg-accent text-white"
                  : "bg-surface text-text-secondary hover:text-text hover:bg-surface-hover",
              )}
            >
              {s.name}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 shrink-0">
        {/* Calendar sub-view toggle */}
        {mainView === "calendar" && (
          <div className="flex bg-surface rounded-lg p-0.5">
            {(["day", "week", "month"] as CalView[]).map((v) => (
              <button
                key={v}
                onClick={() => setUrlParams({ cv: v })}
                className={cn(
                  "px-3 py-1 rounded-md text-xs font-medium capitalize transition-colors",
                  calView === v
                    ? "bg-accent text-white"
                    : "text-text-secondary hover:text-text",
                )}
              >
                {v}
              </button>
            ))}
          </div>
        )}

        {/* Calendar / List toggle */}
        <div className="flex bg-surface rounded-lg p-0.5">
          <button
            onClick={() => setUrlParams({ view: "calendar" })}
            className={cn(
              "p-1.5 rounded-md transition-colors",
              mainView === "calendar"
                ? "bg-accent text-white"
                : "text-text-secondary hover:text-text",
            )}
            title="Calendar"
          >
            <Calendar size={16} />
          </button>
          <button
            onClick={() => setUrlParams({ view: "list" })}
            className={cn(
              "p-1.5 rounded-md transition-colors",
              mainView === "list"
                ? "bg-accent text-white"
                : "text-text-secondary hover:text-text",
            )}
            title="List"
          >
            <List size={16} />
          </button>
        </div>
        </div>
      </div>

      {/* Date Navigation — hidden in list mode */}
      {mainView === "calendar" && (
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={goPrev}
            className="p-1.5 rounded-lg text-text-secondary hover:text-text hover:bg-surface-hover transition-colors"
          >
            <ChevronLeft size={18} />
          </button>
          <span className="text-sm font-semibold text-text min-w-[200px] text-center">
            {dateLabel}
          </span>
          <button
            onClick={goNext}
            className="p-1.5 rounded-lg text-text-secondary hover:text-text hover:bg-surface-hover transition-colors"
          >
            <ChevronRight size={18} />
          </button>
          <button
            onClick={goToday}
            className="px-3 py-1 rounded-lg text-xs font-medium bg-surface text-text-secondary hover:text-text hover:bg-surface-hover transition-colors"
          >
            Today
          </button>
        </div>
      )}

      {/* List Date Range Filter */}
      {mainView === "list" && (
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <select
            value={listPreset}
            onChange={(e) => handlePresetChange(e.target.value as ListPreset)}
            className="bg-surface border border-border rounded-lg px-3 py-1.5 text-sm text-text"
          >
            <option value="today">Today</option>
            <option value="week">This Week</option>
            <option value="month">This Month</option>
            <option value="custom">Custom</option>
          </select>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={listFrom}
              onChange={(e) => handleListFromChange(e.target.value)}
              className="bg-surface border border-border rounded-lg px-3 py-1.5 text-sm text-text"
            />
            <span className="text-text-muted text-sm">–</span>
            <input
              type="date"
              value={listTo}
              onChange={(e) => handleListToChange(e.target.value)}
              className="bg-surface border border-border rounded-lg px-3 py-1.5 text-sm text-text"
            />
          </div>
          <span className="text-xs text-text-muted ml-auto">
            {allSchedules.length} schedules
          </span>
        </div>
      )}

      {/* Schedules */}
      {isLoading ? (
        <div className="text-center py-20 text-text-muted">Loading...</div>
      ) : mainView === "calendar" ? (
        calView === "day" ? (
          <DayView
            roles={activeRoles}
            schedules={allSchedules}
            date={toDateStr(currentDate)}
            checklistMap={checklistMap}
            onDetailClick={goToDetail}
          />
        ) : calView === "week" ? (
          <WeekView
            roles={activeRoles}
            schedules={allSchedules}
            weekStart={weekStart}
            checklistMap={checklistMap}
            onDetailClick={goToDetail}
          />
        ) : (
          <MonthView
            schedules={allSchedules}
            year={monthYear.year}
            month={monthYear.month}
            onDayClick={goToDay}
          />
        )
      ) : (
        <ListView
          schedules={allSchedules}
          roles={activeRoles}
          checklistMap={checklistMap}
          sortKey={sortKey}
          sortAsc={sortAsc}
          onSort={handleSort}
          onDetailClick={goToDetail}
        />
      )}
    </div>
  );
}

// ─── Percentage Card ────────────────────────────────

function PctCard({ label, sub, pct }: { label: string; sub: string; pct: number }) {
  const c = pct >= 80
    ? { border: "border-success/20", bg: "bg-success-muted", text: "text-success", bar: "bg-success" }
    : pct >= 50
      ? { border: "border-warning/20", bg: "bg-warning-muted", text: "text-warning", bar: "bg-warning" }
      : { border: "border-danger/20", bg: "bg-danger-muted", text: "text-danger", bar: "bg-danger" };
  return (
    <div className={cn("rounded-xl border p-4 flex flex-col justify-between", c.border, c.bg)}>
      <div>
        <div className={cn("text-3xl font-extrabold", c.text)}>{pct}%</div>
        <div className="text-xs text-text-secondary mt-1">{label} · {sub}</div>
      </div>
      <div className="mt-3 h-2 bg-surface rounded-full overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", c.bar)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ─── Mini Card ──────────────────────────────────────

function MiniCard({
  label,
  value,
  color,
  dot,
}: {
  label: string;
  value: number;
  color: string;
  dot: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <div className="flex items-center gap-1.5 mb-1">
        <div className={cn("w-2 h-2 rounded-full", dot)} />
        <span className="text-[11px] text-text-muted font-medium">{label}</span>
      </div>
      <div className={cn("text-xl font-bold", color)}>{value}</div>
    </div>
  );
}

// ─── Status Badge ───────────────────────────────────

function ScheduleStatusBadge({ status }: { status: string }) {
  if (status === "confirmed") return <Badge variant="success">Confirmed</Badge>;
  if (status === "cancelled") return <Badge variant="danger">Cancelled</Badge>;
  return <Badge variant="default">{status}</Badge>;
}

// ─── Checklist Progress Chip ────────────────────────

/** 체크리스트 진행 상황 칩 — 완료 항목 수, 상태 뱃지, 색상 코딩된 진행 바를 표시합니다.
 * Shows completed_items/total_items, status badge, and color-coded progress bar. */
function ChecklistProgressChip({ instance }: { instance: ChecklistInstance }) {
  const { total_items, completed_items, status } = instance;
  const pct = total_items > 0 ? Math.round((completed_items / total_items) * 100) : 0;

  // Status → badge variant + bar color
  const statusConfig: Record<string, { variant: "default" | "accent" | "success" | "warning" | "danger"; bar: string; label: string }> = {
    pending:     { variant: "default",  bar: "bg-text-muted", label: "Pending" },
    in_progress: { variant: "accent",   bar: "bg-accent",     label: "In Progress" },
    completed:   { variant: "success",  bar: "bg-success",    label: "Completed" },
    rejected:    { variant: "danger",   bar: "bg-danger",     label: "Rejected" },
    resubmitted: { variant: "warning",  bar: "bg-warning",    label: "Resubmitted" },
  };
  const cfg = statusConfig[status] ?? statusConfig.pending;

  return (
    <div className="mt-1.5">
      <div className="flex items-center justify-between mb-0.5">
        <Badge variant={cfg.variant} className="text-[9px] px-1.5 py-0">{cfg.label}</Badge>
        <span className="text-[9px] text-text-muted">{completed_items}/{total_items}</span>
      </div>
      <div className="h-1 bg-surface rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", cfg.bar)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

/** 인라인 진행 바 + 텍스트 — 리스트 뷰의 테이블 셀 용.
 * Compact inline progress bar + text for table cells in list view. */
function ChecklistProgressInline({ instance }: { instance: ChecklistInstance }) {
  const { total_items, completed_items, status } = instance;
  const pct = total_items > 0 ? Math.round((completed_items / total_items) * 100) : 0;

  const statusConfig: Record<string, { variant: "default" | "accent" | "success" | "warning" | "danger"; bar: string; label: string }> = {
    pending:     { variant: "default",  bar: "bg-text-muted", label: "Pending" },
    in_progress: { variant: "accent",   bar: "bg-accent",     label: "In Progress" },
    completed:   { variant: "success",  bar: "bg-success",    label: "Completed" },
    rejected:    { variant: "danger",   bar: "bg-danger",     label: "Rejected" },
    resubmitted: { variant: "warning",  bar: "bg-warning",    label: "Resubmitted" },
  };
  const cfg = statusConfig[status] ?? statusConfig.pending;

  return (
    <div className="flex items-center gap-2 min-w-[120px]">
      <Badge variant={cfg.variant}>{cfg.label}</Badge>
      <div className="flex items-center gap-1.5 flex-1">
        <div className="flex-1 h-1.5 bg-surface rounded-full overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all", cfg.bar)}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-[10px] text-text-muted whitespace-nowrap">
          {completed_items}/{total_items}
        </span>
      </div>
    </div>
  );
}

// ─── Day View ───────────────────────────────────────

function DayView({
  roles,
  schedules,
  date,
  checklistMap,
  onDetailClick,
}: {
  roles: WorkRole[];
  schedules: Schedule[];
  date: string;
  checklistMap?: Map<string, ChecklistInstance>;
  onDetailClick: (id: string) => void;
}) {
  const daySchedules = schedules.filter((s) => s.work_date === date);

  if (roles.length === 0) {
    return <div className="text-center py-20 text-text-muted">No work roles configured</div>;
  }

  return (
    <div className="space-y-4">
      {roles.map((role) => {
        const roleSchedules = daySchedules.filter(
          (s) => s.work_role_id === role.id,
        );
        const filled = roleSchedules.length;
        const hc = role.required_headcount;
        const hcVariant = filled < hc ? "danger" : filled === hc ? "success" : "warning";

        return (
          <Card key={role.id} padding="p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-sm font-semibold text-text">
                  {role.shift_name} · {role.position_name}
                </div>
                <div className="text-xs text-text-muted">
                  {role.default_start_time}–{role.default_end_time}
                  {role.default_checklist_id && (
                    <span className="ml-2 px-1.5 py-0.5 bg-accent-muted text-accent text-[10px] rounded font-medium">
                      Checklist
                    </span>
                  )}
                </div>
              </div>
              <Badge variant={hcVariant}>{filled}/{hc}</Badge>
            </div>

            {roleSchedules.length === 0 ? (
              <div className="text-xs text-text-muted py-4 text-center">No schedules</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {roleSchedules.map((s) => {
                  const instance = checklistMap?.get(s.id);
                  return (
                    <button
                      key={s.id}
                      onClick={() => onDetailClick(s.id)}
                      className="text-left p-3 rounded-lg bg-surface hover:bg-surface-hover transition-colors"
                    >
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-sm font-medium text-text">{s.user_name ?? "-"}</span>
                        <span className="text-[10px] text-text-muted">
                          {s.start_time && s.end_time ? `${s.start_time}–${s.end_time}` : s.work_date}
                        </span>
                      </div>
                      <ScheduleStatusBadge status={s.status} />
                      {instance && <ChecklistProgressChip instance={instance} />}
                    </button>
                  );
                })}
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

// ─── Week View ──────────────────────────────────────

function WeekView({
  roles,
  schedules,
  weekStart,
  checklistMap,
  onDetailClick,
}: {
  roles: WorkRole[];
  schedules: Schedule[];
  weekStart: Date;
  checklistMap?: Map<string, ChecklistInstance>;
  onDetailClick: (id: string) => void;
}) {
  const days = getWeekDays(weekStart);
  const todayStr = toDateStr(new Date());

  if (roles.length === 0) {
    return <div className="text-center py-20 text-text-muted">No work roles configured</div>;
  }

  return (
    <Card padding="p-0" className="overflow-x-auto">
      <table className="w-full border-collapse min-w-[800px]">
        <thead>
          <tr>
            <th className="text-left px-3 py-2 text-xs font-semibold text-text-muted uppercase w-48">
              Role
            </th>
            {days.map((ds) => (
              <th
                key={ds}
                className={cn(
                  "px-2 py-2 text-center text-xs",
                  ds === todayStr && "bg-accent/5 rounded-t-lg",
                )}
              >
                <div className="font-semibold text-text-secondary">{shortDay(ds)}</div>
                <div className={cn("text-text-muted", ds === todayStr && "text-accent font-bold")}>
                  {shortDate(ds)}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {roles.map((role) => (
            <tr key={role.id} className="border-t border-border">
              <td className="px-3 py-2 align-top">
                <div className="text-xs font-semibold text-text">
                  {role.shift_name} · {role.position_name}
                </div>
                <div className="text-[10px] text-text-muted">
                  {role.default_start_time}–{role.default_end_time} · {role.required_headcount}명
                </div>
                {role.default_checklist_id && (
                  <span className="px-1 py-0.5 bg-accent-muted text-accent text-[9px] rounded font-medium">
                    Checklist
                  </span>
                )}
              </td>
              {days.map((ds) => {
                const cellSchedules = schedules.filter(
                  (s) => s.work_date === ds && s.work_role_id === role.id,
                );
                const filled = cellSchedules.length;
                const hcCls =
                  filled < role.required_headcount
                    ? "text-danger"
                    : filled === role.required_headcount
                      ? "text-success"
                      : "text-warning";

                return (
                  <td
                    key={ds}
                    className={cn(
                      "px-1.5 py-2 align-top border-l border-border min-w-[100px]",
                      ds === todayStr && "bg-accent/5",
                      ds < todayStr && "opacity-60",
                    )}
                  >
                    <div className="space-y-1">
                      {cellSchedules.map((s) => {
                        const instance = checklistMap?.get(s.id);
                        return (
                          <button
                            key={s.id}
                            onClick={() => onDetailClick(s.id)}
                            className="w-full text-left p-1.5 rounded bg-surface hover:bg-surface-hover transition-colors"
                          >
                            <div className="text-[11px] font-medium text-text truncate">
                              {s.user_name ?? "-"}
                            </div>
                            {s.start_time && s.end_time && (
                              <div className="text-[10px] text-text-muted">
                                {s.start_time}–{s.end_time}
                              </div>
                            )}
                            {instance && <ChecklistProgressChip instance={instance} />}
                          </button>
                        );
                      })}
                      {role.required_headcount > 0 && (
                        <div className={cn("text-[10px] font-medium text-center", hcCls)}>
                          {filled}/{role.required_headcount}
                        </div>
                      )}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

// ─── Month View ─────────────────────────────────────

function MonthView({
  schedules,
  year,
  month,
  onDayClick,
}: {
  schedules: Schedule[];
  year: number;
  month: number;
  onDayClick: (dateStr: string) => void;
}) {
  const todayStr = toDateStr(new Date());
  const firstDay = new Date(year, month, 1);
  const startOffset = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const prevMonthDays = new Date(year, month, 0).getDate();

  const cells: {
    dayNum: number;
    dateStr: string;
    otherMonth: boolean;
  }[] = [];

  for (let i = 0; i < 42; i++) {
    if (i < startOffset) {
      const dayNum = prevMonthDays - startOffset + i + 1;
      const pm = month === 0 ? 11 : month - 1;
      const py = month === 0 ? year - 1 : year;
      cells.push({
        dayNum,
        dateStr: `${py}-${String(pm + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`,
        otherMonth: true,
      });
    } else if (i >= startOffset + daysInMonth) {
      const dayNum = i - startOffset - daysInMonth + 1;
      const nm = month === 11 ? 0 : month + 1;
      const ny = month === 11 ? year + 1 : year;
      cells.push({
        dayNum,
        dateStr: `${ny}-${String(nm + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`,
        otherMonth: true,
      });
    } else {
      const dayNum = i - startOffset + 1;
      cells.push({
        dayNum,
        dateStr: `${year}-${String(month + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`,
        otherMonth: false,
      });
    }
  }

  return (
    <div className="grid grid-cols-7 gap-px bg-border rounded-lg overflow-hidden">
      {/* Header */}
      {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
        <div key={d} className="bg-surface px-2 py-2 text-center text-[10px] font-semibold text-text-muted uppercase">
          {d}
        </div>
      ))}

      {/* Cells */}
      {cells.map((cell) => {
        const daySchedules = schedules.filter((s) => s.work_date === cell.dateStr);
        const isToday = cell.dateStr === todayStr;

        return (
          <button
            key={cell.dateStr}
            onClick={() => onDayClick(cell.dateStr)}
            className={cn(
              "bg-card p-2 min-h-[80px] text-left hover:bg-surface-hover transition-colors",
              cell.otherMonth && "opacity-40",
              isToday && "ring-1 ring-accent ring-inset",
            )}
          >
            <div
              className={cn(
                "text-xs font-medium mb-1",
                isToday ? "text-accent font-bold" : "text-text-secondary",
              )}
            >
              {cell.dayNum}
            </div>
            {daySchedules.length > 0 && (
              <>
                <div className="flex flex-wrap gap-0.5 mb-1">
                  {daySchedules.slice(0, 8).map((s) => (
                    <div key={s.id} className="w-1.5 h-1.5 rounded-full bg-success" />
                  ))}
                </div>
                <div className="text-[10px] text-text-muted">
                  {daySchedules.length} scheduled
                </div>
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ─── List View ──────────────────────────────────────

const LIST_COLS = [
  { key: "work_date", label: "Date" },
  { key: "user_name", label: "Worker" },
  { key: "role", label: "Role" },
  { key: "time", label: "Time" },
  { key: "status", label: "Status" },
  { key: "checklist", label: "Checklist" },
] as const;

function ListView({
  schedules,
  roles,
  checklistMap,
  sortKey,
  sortAsc,
  onSort,
  onDetailClick,
}: {
  schedules: Schedule[];
  roles: WorkRole[];
  checklistMap?: Map<string, ChecklistInstance>;
  sortKey: string;
  sortAsc: boolean;
  onSort: (key: string) => void;
  onDetailClick: (id: string) => void;
}) {
  const getRoleName = useCallback((wrId: string | null) => {
    if (!wrId) return "—";
    const r = roles.find((wr) => wr.id === wrId);
    return r ? `${r.shift_name} · ${r.position_name}` : "—";
  }, [roles]);

  const sorted = useMemo(() => {
    const rows = [...schedules];
    rows.sort((a, b) => {
      let va: string | number = "";
      let vb: string | number = "";

      if (sortKey === "work_date") { va = a.work_date; vb = b.work_date; }
      else if (sortKey === "user_name") { va = a.user_name || ""; vb = b.user_name || ""; }
      else if (sortKey === "role") { va = getRoleName(a.work_role_id); vb = getRoleName(b.work_role_id); }
      else if (sortKey === "time") { va = a.start_time || ""; vb = b.start_time || ""; }
      else if (sortKey === "status") { va = a.status; vb = b.status; }

      if (va < vb) return sortAsc ? -1 : 1;
      if (va > vb) return sortAsc ? 1 : -1;
      return 0;
    });
    return rows;
  }, [schedules, sortKey, sortAsc, getRoleName]);

  if (sorted.length === 0) {
    return <div className="text-center py-20 text-text-muted">No schedules for this range</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-border">
            {LIST_COLS.map((col) => {
              const isSorted = sortKey === col.key;
              return (
                <th
                  key={col.key}
                  onClick={() => onSort(col.key)}
                  className="text-left px-3 py-2.5 text-xs font-semibold text-text-muted uppercase cursor-pointer hover:text-text transition-colors"
                >
                  <span className="inline-flex items-center gap-1">
                    {col.label}
                    {isSorted && (sortAsc ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
                  </span>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((s) => {
            const instance = checklistMap?.get(s.id);
            return (
              <tr
                key={s.id}
                onClick={() => onDetailClick(s.id)}
                className="border-b border-border/50 hover:bg-surface-hover cursor-pointer transition-colors"
              >
                <td className="px-3 py-2.5 text-sm text-text">{longDate(s.work_date)}</td>
                <td className="px-3 py-2.5 text-sm font-medium text-text">{s.user_name ?? "-"}</td>
                <td className="px-3 py-2.5 text-sm text-text-secondary">
                  {getRoleName(s.work_role_id)}
                </td>
                <td className="px-3 py-2.5 text-sm text-text-secondary">
                  {s.start_time && s.end_time ? `${s.start_time}–${s.end_time}` : "—"}
                </td>
                <td className="px-3 py-2.5">
                  <ScheduleStatusBadge status={s.status} />
                </td>
                <td className="px-3 py-2.5">
                  {instance ? (
                    <ChecklistProgressInline instance={instance} />
                  ) : (
                    <span className="text-xs text-text-muted">—</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
