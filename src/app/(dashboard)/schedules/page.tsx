"use client";

/**
 * 스케줄 Overview 페이지 — 스케줄 엔트리 + 배정 현황을 Day/Week/Month/List 뷰로 조회.
 *
 * Shows schedule entries (from manage page) and work assignments (with checklist progress)
 * across Day, Week, Month calendar views and a List view with flexible date range.
 */

import React, { useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
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
import { useAssignments } from "@/hooks/useAssignments";
import { useSchedules } from "@/hooks/useSchedules";
import { useReviewSummary } from "@/hooks/useChecklistInstances";
import { Card, Badge } from "@/components/ui";
import { cn } from "@/lib/utils";
import type { Store, Assignment, WorkRole } from "@/types";

// ─── View types ─────────────────────────────────────

type CalView = "day" | "week" | "month";
type MainView = "calendar" | "list";
type ListPreset = "today" | "week" | "month" | "custom";
type DisplayStatus = "not_started" | "in_progress" | "in_review";

function getDisplayStatus(a: Assignment): DisplayStatus {
  if (a.completed_items === 0) return "not_started";
  if (a.total_items > 0 && a.completed_items >= a.total_items) return "in_review";
  return "in_progress";
}


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

  // View state
  const [mainView, setMainView] = useState<MainView>("calendar");
  const [calView, setCalView] = useState<CalView>("week");
  const [currentDate, setCurrentDate] = useState<Date>(() => new Date());
  const [weekStart, setWeekStart] = useState<Date>(() => getWeekStart(new Date()));
  const [monthYear, setMonthYear] = useState<{ year: number; month: number }>(() => ({
    year: new Date().getFullYear(),
    month: new Date().getMonth(),
  }));

  // Store selection
  const { data: stores } = useStores();
  const [storeId, setStoreId] = useState<string>("");

  // List view date range
  const [listPreset, setListPreset] = useState<ListPreset>("week");
  const [listFrom, setListFrom] = useState<string>(() => getListPresetRange("week").from);
  const [listTo, setListTo] = useState<string>(() => getListPresetRange("week").to);

  // List sort
  const [sortKey, setSortKey] = useState<string>("work_date");
  const [sortAsc, setSortAsc] = useState<boolean>(true);

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
  const { data: assignmentsData, isLoading: assignmentsLoading } = useAssignments({
    store_id: effectiveStoreId || undefined,
    date_from: dateRange.from,
    date_to: dateRange.to,
    status: "assigned",
    per_page: 500,
  });

  // Also fetch in_progress and completed for overview
  const { data: inProgressData } = useAssignments({
    store_id: effectiveStoreId || undefined,
    date_from: dateRange.from,
    date_to: dateRange.to,
    status: "in_progress",
    per_page: 500,
  });
  const { data: completedData } = useAssignments({
    store_id: effectiveStoreId || undefined,
    date_from: dateRange.from,
    date_to: dateRange.to,
    status: "completed",
    per_page: 500,
  });

  // Schedule entries — manage 페이지에서 생성한 항목도 표시
  const { data: entriesData, isLoading: entriesLoading } = useSchedules({
    store_id: effectiveStoreId || undefined,
    date_from: dateRange.from,
    date_to: dateRange.to,
    per_page: 500,
  });
  const isLoading = assignmentsLoading || entriesLoading;

  // Map schedule entries → Assignment-like objects for unified display
  // Schedule entries from manage page that don't yet have a linked work_assignment
  const entryAssignments = useMemo((): Assignment[] => {
    const scheduleEntries = entriesData?.items ?? [];
    const roles = workRoles ?? [];
    return scheduleEntries
      .filter((e) => e.status !== "cancelled")
      .map((entry) => {
        const role = roles.find((r) => r.id === entry.work_role_id);
        return {
          id: `se_${entry.id}`,
          store_id: entry.store_id,
          store_name: entry.store_name || "",
          shift_id: role?.shift_id || "",
          shift_name: role?.shift_name || "",
          shift_sort_order: role?.sort_order || 0,
          position_id: role?.position_id || "",
          position_name: role?.position_name || "",
          user_id: entry.user_id,
          user_name: entry.user_name || "?",
          work_date: entry.work_date,
          status: "assigned" as const,
          total_items: 0,
          completed_items: 0,
          created_at: entry.created_at,
        };
      });
  }, [entriesData, workRoles]);

  const allAssignments = useMemo(() => [
    ...(assignmentsData?.items ?? []),
    ...(inProgressData?.items ?? []),
    ...(completedData?.items ?? []),
    ...entryAssignments,
  ], [assignmentsData, inProgressData, completedData, entryAssignments]);

  // Review summary from server
  const { data: reviewSummary } = useReviewSummary({
    store_id: effectiveStoreId || undefined,
    date_from: dateRange.from,
    date_to: dateRange.to,
  });

  const activeRoles = useMemo(
    () => (workRoles ?? []).filter((r) => r.is_active),
    [workRoles],
  );

  // ─── Navigation ─────────────────────────────────

  const goToday = useCallback(() => {
    const now = new Date();
    setCurrentDate(new Date(now));
    setWeekStart(getWeekStart(now));
    setMonthYear({ year: now.getFullYear(), month: now.getMonth() });
  }, []);

  const goPrev = useCallback(() => {
    if (calView === "day") setCurrentDate((d) => addDays(d, -1));
    else if (calView === "week") setWeekStart((d) => addDays(d, -7));
    else setMonthYear((m) => {
      const nm = m.month - 1;
      return nm < 0 ? { year: m.year - 1, month: 11 } : { year: m.year, month: nm };
    });
  }, [calView]);

  const goNext = useCallback(() => {
    if (calView === "day") setCurrentDate((d) => addDays(d, 1));
    else if (calView === "week") setWeekStart((d) => addDays(d, 7));
    else setMonthYear((m) => {
      const nm = m.month + 1;
      return nm > 11 ? { year: m.year + 1, month: 0 } : { year: m.year, month: nm };
    });
  }, [calView]);

  const dateLabel = useMemo(() => {
    if (calView === "day") return dayLabel(currentDate);
    if (calView === "week") return weekLabel(getWeekDays(weekStart));
    return monthLabel(monthYear.year, monthYear.month);
  }, [calView, currentDate, weekStart, monthYear]);

  // ─── Summary stats ──────────────────────────────

  const summary = useMemo(() => {
    const total = allAssignments.length;
    const rv = reviewSummary;
    // Assignment: completed = all items approved, not started = 0 items checked, rest = in progress
    const fullyApproved = rv?.fully_approved_assignments ?? 0;
    const notStarted = allAssignments.filter((a) => a.completed_items === 0).length;
    const inProgress = total - fullyApproved - notStarted;
    const pct = total > 0 ? Math.round((fullyApproved / total) * 100) : 0;
    // Item completion = approved (pass) / total items
    const totalItems = rv?.total_items ?? 0;
    const passCount = rv?.pass ?? 0;
    const itemPct = totalItems > 0 ? Math.round((passCount / totalItems) * 100) : 0;
    return { total, completed: fullyApproved, inProgress: Math.max(0, inProgress), notStarted, pct,
      totalItems, passCount, itemPct,
      pass: passCount, fail: rv?.fail ?? 0, caution: rv?.caution ?? 0,
      unreviewed: rv?.unreviewed ?? 0,
    };
  }, [allAssignments, reviewSummary]);

  // Range label for summary
  const rangeLabel = useMemo(() => {
    if (dateRange.from === dateRange.to) return longDate(dateRange.from);
    return `${shortDate(dateRange.from)} – ${shortDate(dateRange.to)}`;
  }, [dateRange]);

  // ─── List preset handler ────────────────────────

  const handlePresetChange = useCallback((preset: ListPreset) => {
    setListPreset(preset);
    if (preset !== "custom") {
      const range = getListPresetRange(preset);
      setListFrom(range.from);
      setListTo(range.to);
    }
  }, []);

  const handleListFromChange = useCallback((v: string) => {
    setListFrom(v);
    setListPreset("custom");
  }, []);

  const handleListToChange = useCallback((v: string) => {
    setListTo(v);
    setListPreset("custom");
  }, []);

  // ─── Sort handler ──────────────────────────────

  const handleSort = useCallback((key: string) => {
    setSortKey((prev) => {
      if (prev === key) {
        setSortAsc((a) => !a);
        return key;
      }
      setSortAsc(true);
      return key;
    });
  }, []);

  // ─── Navigate to detail ─────────────────────────

  const goToDetail = useCallback(
    (id: string) => router.push(`/schedules/${id}`),
    [router],
  );

  // ─── Click month day → switch to day view ───────

  const goToDay = useCallback((dateStr: string) => {
    setCurrentDate(new Date(dateStr + "T00:00:00"));
    setCalView("day");
  }, []);

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
        {/* Assignment */}
        <div>
          <p className="text-[10px] text-text-muted uppercase tracking-wider font-semibold mb-2">Assignment</p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <PctCard label="Completion" sub={`${summary.completed}/${summary.total}`} pct={summary.pct} />
            <MiniCard label="Not Started" value={summary.notStarted} color="text-text-muted" dot="bg-text-muted" />
            <MiniCard label="In Progress" value={summary.inProgress} color="text-blue-400" dot="bg-blue-400" />
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
            <MiniCard label="Caution" value={summary.caution} color="text-warning" dot="bg-warning" />
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
              onClick={() => setStoreId(s.id)}
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
                onClick={() => setCalView(v)}
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
            onClick={() => setMainView("calendar")}
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
            onClick={() => setMainView("list")}
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
            {allAssignments.length} assignments
          </span>
        </div>
      )}

      {/* Assignments */}
      {isLoading ? (
        <div className="text-center py-20 text-text-muted">Loading...</div>
      ) : mainView === "calendar" ? (
        calView === "day" ? (
          <DayView
            roles={activeRoles}
            assignments={allAssignments}
            date={toDateStr(currentDate)}
            onDetailClick={goToDetail}
          />
        ) : calView === "week" ? (
          <WeekView
            roles={activeRoles}
            assignments={allAssignments}
            weekStart={weekStart}
            onDetailClick={goToDetail}
          />
        ) : (
          <MonthView
            assignments={allAssignments}
            year={monthYear.year}
            month={monthYear.month}
            onDayClick={goToDay}
          />
        )
      ) : (
        <ListView
          assignments={allAssignments}
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

// ─── Progress Bar (inline) ──────────────────────────

function ProgressBar({
  completed,
  total,
  size = "sm",
}: {
  completed: number;
  total: number;
  size?: "sm" | "xs";
}) {
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const status = completed === 0 ? "pending" : completed >= total ? "done" : "active";
  const barColor = status === "done" ? "bg-success" : status === "active" ? "bg-accent" : "bg-text-muted";

  return (
    <div className="flex items-center gap-1.5">
      <div className={cn("rounded-full overflow-hidden bg-surface", size === "sm" ? "w-16 h-1.5" : "w-10 h-1")}>
        <div className={cn("h-full rounded-full", barColor)} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[10px] text-text-muted whitespace-nowrap">
        {completed}/{total}
      </span>
    </div>
  );
}

// ─── Status Badge ───────────────────────────────────

function StatusBadge({ completedItems, totalItems }: { completedItems: number; totalItems: number }) {
  if (completedItems === 0) return <Badge variant="default">Not Started</Badge>;
  if (totalItems > 0 && completedItems >= totalItems) return <Badge variant="accent">In Review</Badge>;
  return <Badge variant="accent">In Progress</Badge>;
}

// ─── Day View ───────────────────────────────────────

function DayView({
  roles,
  assignments,
  date,
  onDetailClick,
}: {
  roles: WorkRole[];
  assignments: Assignment[];
  date: string;
  onDetailClick: (id: string) => void;
}) {
  const dayAssignments = assignments.filter((a) => a.work_date === date);

  if (roles.length === 0) {
    return <div className="text-center py-20 text-text-muted">No work roles configured</div>;
  }

  return (
    <div className="space-y-4">
      {roles.map((role) => {
        const roleAssignments = dayAssignments.filter(
          (a) => a.shift_id === role.shift_id && a.position_id === role.position_id,
        );
        const filled = roleAssignments.length;
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

            {roleAssignments.length === 0 ? (
              <div className="text-xs text-text-muted py-4 text-center">No assignments</div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {roleAssignments.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => onDetailClick(a.id)}
                    className="text-left p-3 rounded-lg bg-surface hover:bg-surface-hover transition-colors"
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm font-medium text-text">{a.user_name}</span>
                      <span className="text-[10px] text-text-muted">
                        {a.work_date}
                      </span>
                    </div>
                    <ProgressBar completed={a.completed_items} total={a.total_items} />
                    <div className="mt-1.5">
                      <StatusBadge completedItems={a.completed_items} totalItems={a.total_items} />
                    </div>
                  </button>
                ))}
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
  assignments,
  weekStart,
  onDetailClick,
}: {
  roles: WorkRole[];
  assignments: Assignment[];
  weekStart: Date;
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
                const cellAssignments = assignments.filter(
                  (a) =>
                    a.work_date === ds &&
                    a.shift_id === role.shift_id &&
                    a.position_id === role.position_id,
                );
                const filled = cellAssignments.length;
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
                      {cellAssignments.map((a) => (
                        <button
                          key={a.id}
                          onClick={() => onDetailClick(a.id)}
                          className="w-full text-left p-1.5 rounded bg-surface hover:bg-surface-hover transition-colors"
                        >
                          <div className="text-[11px] font-medium text-text truncate">
                            {a.user_name}
                          </div>
                          <ProgressBar completed={a.completed_items} total={a.total_items} size="xs" />
                        </button>
                      ))}
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
  assignments,
  year,
  month,
  onDayClick,
}: {
  assignments: Assignment[];
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
        const dayAssignments = assignments.filter((a) => a.work_date === cell.dateStr);
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
            {dayAssignments.length > 0 && (
              <>
                <div className="flex flex-wrap gap-0.5 mb-1">
                  {dayAssignments.slice(0, 8).map((a) => {
                    const status =
                      a.status === "completed"
                        ? "bg-success"
                        : a.status === "in_progress"
                          ? "bg-accent"
                          : "bg-text-muted";
                    return <div key={a.id} className={cn("w-1.5 h-1.5 rounded-full", status)} />;
                  })}
                </div>
                <div className="text-[10px] text-text-muted">
                  {dayAssignments.length} assigned
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
  { key: "progress", label: "Progress" },
  { key: "status", label: "Status" },
] as const;

function ListView({
  assignments,
  sortKey,
  sortAsc,
  onSort,
  onDetailClick,
}: {
  assignments: Assignment[];
  sortKey: string;
  sortAsc: boolean;
  onSort: (key: string) => void;
  onDetailClick: (id: string) => void;
}) {
  const sorted = useMemo(() => {
    const rows = [...assignments];
    rows.sort((a, b) => {
      let va: string | number = "";
      let vb: string | number = "";

      if (sortKey === "work_date") { va = a.work_date; vb = b.work_date; }
      else if (sortKey === "user_name") { va = a.user_name; vb = b.user_name; }
      else if (sortKey === "role") { va = `${a.shift_name} ${a.position_name}`; vb = `${b.shift_name} ${b.position_name}`; }
      else if (sortKey === "progress") {
        va = a.total_items > 0 ? a.completed_items / a.total_items : 0;
        vb = b.total_items > 0 ? b.completed_items / b.total_items : 0;
      } else if (sortKey === "status") { va = a.status; vb = b.status; }

      if (va < vb) return sortAsc ? -1 : 1;
      if (va > vb) return sortAsc ? 1 : -1;
      return 0;
    });
    return rows;
  }, [assignments, sortKey, sortAsc]);

  if (sorted.length === 0) {
    return <div className="text-center py-20 text-text-muted">No assignments for this range</div>;
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
          {sorted.map((a) => (
            <tr
              key={a.id}
              onClick={() => onDetailClick(a.id)}
              className="border-b border-border/50 hover:bg-surface-hover cursor-pointer transition-colors"
            >
              <td className="px-3 py-2.5 text-sm text-text">{longDate(a.work_date)}</td>
              <td className="px-3 py-2.5 text-sm font-medium text-text">{a.user_name}</td>
              <td className="px-3 py-2.5 text-sm text-text-secondary">
                {a.shift_name} · {a.position_name}
              </td>
              <td className="px-3 py-2.5">
                <ProgressBar completed={a.completed_items} total={a.total_items} />
              </td>
              <td className="px-3 py-2.5">
                <StatusBadge completedItems={a.completed_items} totalItems={a.total_items} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
