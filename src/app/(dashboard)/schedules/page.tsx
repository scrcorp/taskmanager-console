"use client";

/**
 * 스케줄 Overview 페이지 — Day/Week 토글, 날짜 네비게이션, 스토어 필터, 스탯 카드 + DailyTimeline.
 *
 * Schedule Overview page with Day/Week toggle, date navigation,
 * store filter dropdown, stats cards, and the DailyTimeline component.
 * Weekly view shows a placeholder until implemented.
 *
 * All schedule statuses (requested/confirmed/rejected/cancelled) are fetched
 * from the single /admin/schedules API — no separate schedule_requests API.
 */

import React, { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight, Eye, EyeOff } from "lucide-react";
import { useStores } from "@/hooks/useStores";
import { useUsers } from "@/hooks/useUsers";
import { useSchedules, useBulkConfirmSchedules } from "@/hooks/useSchedules";
import { useToast } from "@/components/ui/Toast";
import { Check } from "lucide-react";
import { DailyTimeline } from "@/components/schedules/DailyTimeline";
import { WeeklyTimeline } from "@/components/schedules/WeeklyTimeline";
import { DailyRoleView } from "@/components/schedules/DailyRoleView";
import { WeeklyRoleView } from "@/components/schedules/WeeklyRoleView";
import { ScheduleModal } from "@/components/schedules/ScheduleModal";
import { cn } from "@/lib/utils";
import type { Schedule, Store } from "@/types";
import type { TimelineEntry, ScheduleStatus } from "@/components/schedules/DailyTimeline";
import type { WeeklyEntry } from "@/components/schedules/WeeklyTimeline";
import { useWorkRoles } from "@/hooks/useWorkRoles";

// ─── Date helpers ─────────────────────────────────────────────────────────────

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
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

/** Get the Sunday of the week containing d */
function getWeekStart(d: Date): Date {
  const r = new Date(d);
  r.setDate(r.getDate() - r.getDay()); // getDay() 0=Sun → no change, 1=Mon → -1, etc.
  r.setHours(0, 0, 0, 0);
  return r;
}

/** "Mar 23 – Mar 29, 2026" */
function weekRangeLabel(weekStart: Date): string {
  const weekEnd = addDays(weekStart, 6);
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  const start = weekStart.toLocaleDateString("en-US", opts);
  const end = weekEnd.toLocaleDateString("en-US", { ...opts, year: "numeric" });
  return `${start} – ${end}`;
}

// ─── Status normalization ─────────────────────────────────────────────────────

/**
 * Map raw API status to display status.
 * "requested" → "pending" (pending confirmation from admin)
 * "confirmed" → "confirmed"
 * "rejected"/"cancelled" → "rejected"
 */
function normalizeStatus(s: Schedule): ScheduleStatus {
  if (s.status === "requested" && s.is_modified) return "modified";
  switch (s.status) {
    case "confirmed": return "confirmed";
    case "requested": return "pending";
    case "rejected":
    case "cancelled": return "rejected";
    default: return "confirmed";
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

const DAY_START_HOUR = 6; // hardcoded until org.day_start_time is available from API

export default function SchedulesPage(): React.ReactElement {
  const [view, setView] = useState<"day" | "week">("day");
  const [viewMode, setViewMode] = useState<"staff" | "role">("staff");
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());
  const [weekStart, setWeekStart] = useState<Date>(() => getWeekStart(new Date()));
  const [selectedStoreId, setSelectedStoreId] = useState<string>("");
  const [showRejected, setShowRejected] = useState(false);
  const { toast } = useToast();
  const bulkConfirmMutation = useBulkConfirmSchedules();

  // Schedule modal state
  const [modalOpen, setModalOpen] = useState(false);
  const [modalSchedule, setModalSchedule] = useState<Schedule | undefined>(undefined);
  const [modalDefaultDate, setModalDefaultDate] = useState<string | undefined>(undefined);
  const [modalDefaultHour, setModalDefaultHour] = useState<number | undefined>(undefined);
  const [modalDefaultUserId, setModalDefaultUserId] = useState<string | undefined>(undefined);

  const dateStr = toDateStr(selectedDate);

  // Fetch stores
  const { data: stores = [] } = useStores();

  // Auto-select first store when none selected
  const effectiveStoreId = selectedStoreId || stores[0]?.id || "";

  // Fetch work roles for role view
  const { data: workRoles = [] } = useWorkRoles(effectiveStoreId || undefined);

  // Fetch staff for the selected store (shows all staff even without schedules)
  const { data: storeUsers = [] } = useUsers(
    effectiveStoreId ? { store_id: effectiveStoreId, is_active: true } : undefined,
  );

  // Fetch schedules for the selected date only (work_date based)
  const { data: dayData, isLoading: isDayLoading } = useSchedules({
    date_from: dateStr,
    date_to: dateStr,
    ...(effectiveStoreId ? { store_id: effectiveStoreId } : {}),
    per_page: 200,
  });

  // Fetch schedules for the full week (weekly view)
  const weekEndStr = toDateStr(addDays(weekStart, 6));
  const weekStartStr = toDateStr(weekStart);
  const { data: weekData, isLoading: isWeekLoading } = useSchedules({
    date_from: weekStartStr,
    date_to: weekEndStr,
    ...(effectiveStoreId ? { store_id: effectiveStoreId } : {}),
    per_page: 500,
  });

  const isLoading = view === "day" ? isDayLoading : isWeekLoading;

  // Build daily timeline entries from schedules
  const entries = useMemo((): TimelineEntry[] => {
    return (dayData?.items ?? []).map((s: Schedule): TimelineEntry => ({
      schedule: s,
      status: normalizeStatus(s),
      hourlyRate: s.hourly_rate ?? null,
    }));
  }, [dayData]);

  // All entries are for the selected date (single date fetch)
  const visibleEntries = useMemo((): TimelineEntry[] => {
    const scheduled = entries;

    // Add empty rows for store staff without schedules
    const scheduledUserIds = new Set(scheduled.map((e) => e.schedule.user_id));
    const emptyEntries: TimelineEntry[] = storeUsers
      .filter((u) => !scheduledUserIds.has(u.id))
      .map((u) => ({
        schedule: {
          id: `empty-${u.id}`,
          organization_id: "",
          request_id: null,
          user_id: u.id,
          user_name: u.full_name,
          store_id: effectiveStoreId,
          store_name: null,
          work_role_id: null,
          work_role_name: null,
          work_date: dateStr,
          start_time: null,
          end_time: null,
          break_start_time: null,
          break_end_time: null,
          net_work_minutes: 0,
          hourly_rate: 0,
          status: "confirmed" as const,
          submitted_at: null,
          is_modified: false,
          rejection_reason: null,
          created_by: null,
          approved_by: null,
          note: null,
          created_at: "",
          updated_at: "",
        },
        status: "confirmed" as ScheduleStatus,
        hourlyRate: null,
        isEmpty: true,
      }));

    return [...scheduled, ...emptyEntries];
  }, [entries, dateStr, storeUsers, effectiveStoreId]);

  // Weekly entries — schedules + empty rows
  const weeklyEntries = useMemo((): WeeklyEntry[] => {
    const scheduled = (weekData?.items ?? []).map((s: Schedule): WeeklyEntry => ({
      schedule: s,
      status: normalizeStatus(s),
      hourlyRate: s.hourly_rate ?? null,
    }));

    // Add placeholder entries for staff without any schedules this week
    const scheduledUserIds = new Set(scheduled.map((e) => e.schedule.user_id));
    const emptyEntries: WeeklyEntry[] = storeUsers
      .filter((u) => !scheduledUserIds.has(u.id))
      .map((u) => ({
        schedule: {
          id: `empty-week-${u.id}`,
          organization_id: "",
          request_id: null,
          user_id: u.id,
          user_name: u.full_name,
          store_id: effectiveStoreId,
          store_name: null,
          work_role_id: null,
          work_role_name: null,
          work_date: weekStartStr,
          start_time: null,
          end_time: null,
          break_start_time: null,
          break_end_time: null,
          net_work_minutes: 0,
          hourly_rate: 0,
          status: "confirmed" as const,
          submitted_at: null,
          is_modified: false,
          rejection_reason: null,
          created_by: null,
          approved_by: null,
          note: null,
          created_at: "",
          updated_at: "",
        },
        status: "confirmed" as ScheduleStatus,
        hourlyRate: null,
        isEmpty: true,
      }));

    return [...scheduled, ...emptyEntries];
  }, [weekData, storeUsers, effectiveStoreId, weekStartStr]);

  // ── Stats ────────────────────────────────────────────────────────────────

  const statsEntries = useMemo(
    () => visibleEntries.filter((e) => !e.isEmpty && e.schedule.work_date === dateStr),
    [visibleEntries, dateStr],
  );

  const scheduledStaff = statsEntries.length;
  const confirmedCount = statsEntries.filter((e) => e.status === "confirmed" || e.status === "modified").length;
  const pendingCount = statsEntries.filter((e) => e.status === "pending").length;
  const rejectedCount = statsEntries.filter((e) => e.status === "rejected").length;

  const totalHours = statsEntries
    .filter((e) => e.status !== "rejected")
    .reduce((sum, e) => {
      const m = e.schedule.net_work_minutes || 0;
      return sum + m / 60;
    }, 0);

  const totalCost = statsEntries
    .filter((e) => e.status === "confirmed" || e.status === "modified")
    .reduce((sum, e) => {
      const h = (e.schedule.net_work_minutes || 0) / 60;
      return sum + h * (e.hourlyRate ?? 0);
    }, 0);

  // Headcount coverage: naive — just unique work roles that have at least one confirmed staff
  const coveredRoles = new Set(
    statsEntries
      .filter((e) => e.status === "confirmed" || e.status === "modified")
      .map((e) => e.schedule.work_role_id)
      .filter(Boolean),
  ).size;
  const totalRoles = new Set(
    statsEntries.map((e) => e.schedule.work_role_id).filter(Boolean),
  ).size;

  // ── Handlers ─────────────────────────────────────────────────────────────

  function handleScheduleClick(schedule: Schedule): void {
    // Skip empty placeholder rows
    if (schedule.id.startsWith("empty-")) return;
    setModalSchedule(schedule);
    setModalDefaultDate(undefined);
    setModalDefaultHour(undefined);
    setModalOpen(true);
  }

  function handleEmptyCellClick(hour: number, userId?: string): void {
    setModalSchedule(undefined);
    setModalDefaultDate(dateStr);
    setModalDefaultHour(hour);
    setModalDefaultUserId(userId);
    setModalOpen(true);
  }

  function handleWeeklyEmptyCellClick(date: string): void {
    setModalSchedule(undefined);
    setModalDefaultDate(date);
    setModalDefaultHour(undefined);
    setModalOpen(true);
  }

  function handleCloseModal(): void {
    setModalOpen(false);
    setModalSchedule(undefined);
    setModalDefaultDate(undefined);
    setModalDefaultHour(undefined);
    setModalDefaultUserId(undefined);
  }

  // Count pending schedules (status === "requested") for Confirm All button
  // Day view: only count schedules for the SELECTED date (not carryover from prev day)
  // Week view: count all in the week range
  const pendingSchedulesCount = useMemo(() => {
    if (view === "day") {
      return (dayData?.items ?? []).filter((s) => s.status === "requested" && s.work_date === dateStr).length;
    }
    return (weekData?.items ?? []).filter((s) => s.status === "requested").length;
  }, [view, dayData, weekData, dateStr]);

  return (
    <div className="flex flex-col gap-3.5">
      {/* ── Page header ──────────────────────────────────────────────────── */}
      {/* ── Row 1: Title + View toggles ──────────────────────────────── */}
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-bold text-text">Schedule Overview</h1>
        <div className="flex items-center gap-2">
          {/* Day/Week toggle */}
          <div className="flex items-center rounded-lg border border-border overflow-hidden">
            <button
              className={cn(
                "px-3 py-1.5 text-sm font-medium transition-colors duration-150",
                view === "day" ? "bg-accent text-white" : "text-text-muted hover:text-text hover:bg-surface-hover",
              )}
              onClick={() => setView("day")}
            >
              Day
            </button>
            <button
              className={cn(
                "px-3 py-1.5 text-sm font-medium transition-colors duration-150",
                view === "week" ? "bg-accent text-white" : "text-text-muted hover:text-text hover:bg-surface-hover",
              )}
              onClick={() => setView("week")}
            >
              Week
            </button>
          </div>
          {/* Staff/Role toggle */}
          <div className="flex items-center rounded-lg border border-border overflow-hidden">
            <button
              className={cn(
                "px-3 py-1.5 text-sm font-medium transition-colors duration-150",
                viewMode === "staff" ? "bg-accent text-white" : "text-text-muted hover:text-text hover:bg-surface-hover",
              )}
              onClick={() => setViewMode("staff")}
            >
              Staff
            </button>
            <button
              className={cn(
                "px-3 py-1.5 text-sm font-medium transition-colors duration-150",
                viewMode === "role" ? "bg-accent text-white" : "text-text-muted hover:text-text hover:bg-surface-hover",
              )}
              onClick={() => setViewMode("role")}
            >
              Role
            </button>
          </div>
        </div>
      </div>

      {/* ── Row 2: Store selector ──────────────────────────────────── */}
      <div className="flex gap-1.5 overflow-x-auto">
        {stores.map((s: Store) => (
          <button
            key={s.id}
            onClick={() => setSelectedStoreId(s.id)}
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


      {/* ── Date navigation + legend ─────────────────────────────────────── */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          {view === "day" ? (
            <>
              <button
                className="flex items-center justify-center w-8 h-8 rounded text-text-muted hover:text-text hover:bg-surface-hover transition-colors duration-150 border-none bg-transparent cursor-pointer"
                onClick={() => setSelectedDate((d) => addDays(d, -1))}
                aria-label="Previous day"
              >
                <ChevronLeft size={18} />
              </button>
              <span className="text-[15px] font-bold text-text min-w-[160px] text-center">
                {dayLabel(selectedDate)}
              </span>
              <button
                className="flex items-center justify-center w-8 h-8 rounded text-text-muted hover:text-text hover:bg-surface-hover transition-colors duration-150 border-none bg-transparent cursor-pointer"
                onClick={() => setSelectedDate((d) => addDays(d, 1))}
                aria-label="Next day"
              >
                <ChevronRight size={18} />
              </button>
              <button
                className="px-3 py-1 text-xs font-semibold border border-border rounded text-text-secondary hover:text-text hover:border-accent hover:bg-[var(--color-accent-muted)] transition-colors duration-150 cursor-pointer bg-transparent"
                onClick={() => setSelectedDate(new Date())}
              >
                Today
              </button>
            </>
          ) : (
            <>
              <button
                className="flex items-center justify-center w-8 h-8 rounded text-text-muted hover:text-text hover:bg-surface-hover transition-colors duration-150 border-none bg-transparent cursor-pointer"
                onClick={() => setWeekStart((w) => addDays(w, -7))}
                aria-label="Previous week"
              >
                <ChevronLeft size={18} />
              </button>
              <span className="text-[15px] font-bold text-text min-w-[220px] text-center">
                {weekRangeLabel(weekStart)}
              </span>
              <button
                className="flex items-center justify-center w-8 h-8 rounded text-text-muted hover:text-text hover:bg-surface-hover transition-colors duration-150 border-none bg-transparent cursor-pointer"
                onClick={() => setWeekStart((w) => addDays(w, 7))}
                aria-label="Next week"
              >
                <ChevronRight size={18} />
              </button>
              <button
                className="px-3 py-1 text-xs font-semibold border border-border rounded text-text-secondary hover:text-text hover:border-accent hover:bg-[var(--color-accent-muted)] transition-colors duration-150 cursor-pointer bg-transparent"
                onClick={() => setWeekStart(getWeekStart(new Date()))}
              >
                This Week
              </button>
            </>
          )}
        </div>

        <div className="flex-1" />

        {/* Show rejected toggle */}
        <button
          className={cn(
            "flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded border transition-colors duration-150 cursor-pointer bg-transparent",
            showRejected
              ? "border-danger text-danger bg-[var(--color-danger-muted)]"
              : "border-border text-text-muted hover:text-text hover:border-accent",
          )}
          onClick={() => setShowRejected((v) => !v)}
        >
          {showRejected ? <EyeOff size={13} /> : <Eye size={13} />}
          {showRejected ? "Hide Rejected" : "Show Rejected"}
        </button>

        {/* Confirm All pending schedules */}
        {pendingSchedulesCount > 0 && (
          <button
            className="flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded border border-[var(--color-success)] text-[var(--color-success)] bg-[var(--color-success-muted)] hover:brightness-110 transition-colors duration-150 cursor-pointer disabled:opacity-50"
            disabled={bulkConfirmMutation.isPending}
            onClick={async () => {
              const dateFrom = view === "day" ? dateStr : weekStartStr;
              const dateTo = view === "day" ? dateStr : weekEndStr;
              try {
                await bulkConfirmMutation.mutateAsync({ store_id: effectiveStoreId, date_from: dateFrom, date_to: dateTo });
                toast({ type: "success", message: `${pendingSchedulesCount} schedule(s) confirmed.` });
              } catch {
                toast({ type: "error", message: "Failed to confirm schedules." });
              }
            }}
          >
            <Check size={13} />
            {bulkConfirmMutation.isPending ? "Confirming..." : `Confirm All (${pendingSchedulesCount})`}
          </button>
        )}

        {/* Legend */}
        <div className="flex items-center gap-3.5 flex-wrap">
          <LegendItem color="from-[#00B894] to-[#00D4A8]" label="Confirmed" />
          <LegendItem color="from-[#6C5CE7] to-[#7C6DF0]" label="Pending" dashed />
          <LegendItem color="from-[#F0A500] to-[#FDCB6E]" label="Modified" />
          {showRejected && (
            <LegendItem color="from-[#FF6B6B] to-[#FF8A8A]" label="Rejected" faded />
          )}
          <div className="flex items-center gap-1 text-[11px] text-text-muted">
            <span
              className="inline-block w-4 h-2 rounded-[1px] align-middle"
              style={{
                background: "repeating-linear-gradient(45deg, transparent, transparent 2px, rgba(255,255,255,0.15) 2px, rgba(255,255,255,0.15) 4px)",
                border: "1px solid rgba(255,255,255,0.1)",
              }}
            />
            Break
          </div>
        </div>
      </div>

      {/* ── Stats cards ───────────────────────────────────────────────────── */}
      <div className="flex gap-3 flex-wrap">
        <StatCard
          value={String(scheduledStaff)}
          label="Scheduled Staff"
          detail={`${confirmedCount} confirmed · ${pendingCount} pending · ${rejectedCount} rejected`}
          colorClass="text-accent"
        />
        <StatCard
          value={`${totalHours.toFixed(1)}h`}
          label="Total Hours"
          detail={scheduledStaff > 0 ? `Avg ${(totalHours / Math.max(1, scheduledStaff - rejectedCount)).toFixed(1)}h per staff` : "No schedules"}
          colorClass="text-[var(--color-success)]"
        />
        <StatCard
          value={totalCost > 0 ? `$${Math.round(totalCost)}` : "—"}
          label="Est. Labor Cost"
          detail={totalCost > 0 ? `$${(totalCost / Math.max(1, totalHours)).toFixed(1)}/hr avg rate` : "No hourly rates set"}
          colorClass="text-warning"
        />
        <StatCard
          value={totalRoles > 0 ? `${coveredRoles}/${totalRoles}` : "—"}
          label="Headcount Coverage"
          detail={
            totalRoles === 0
              ? "No roles assigned"
              : coveredRoles >= totalRoles
              ? "All roles covered"
              : `${totalRoles - coveredRoles} role(s) uncovered`
          }
          colorClass="text-text"
          detailColor={
            totalRoles > 0 && coveredRoles >= totalRoles
              ? "text-[var(--color-success)]"
              : undefined
          }
        />
      </div>

      {/* ── Timeline ─────────────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="bg-card border border-border rounded-xl p-12 text-center text-text-muted">
          Loading schedules…
        </div>
      ) : view === "day" && viewMode === "staff" ? (
        <DailyTimeline
          date={dateStr}
          entries={visibleEntries}
          dayStartHour={DAY_START_HOUR}
          showRejected={showRejected}
          onScheduleClick={handleScheduleClick}
          onEmptyCellClick={handleEmptyCellClick}
        />
      ) : view === "day" && viewMode === "role" ? (
        <DailyRoleView
          date={dateStr}
          entries={visibleEntries}
          workRoles={workRoles}
          dayStartHour={DAY_START_HOUR}
          showRejected={showRejected}
          onScheduleClick={handleScheduleClick}
          onEmptyCellClick={(hour) => handleEmptyCellClick(hour)}
        />
      ) : view === "week" && viewMode === "role" ? (
        <WeeklyRoleView
          weekStart={weekStart}
          entries={weeklyEntries}
          workRoles={workRoles}
          showRejected={showRejected}
          onScheduleClick={handleScheduleClick}
          onEmptyCellClick={handleWeeklyEmptyCellClick}
        />
      ) : (
        <WeeklyTimeline
          weekStart={weekStart}
          entries={weeklyEntries}
          showRejected={showRejected}
          onScheduleClick={handleScheduleClick}
          onEmptyCellClick={handleWeeklyEmptyCellClick}
        />
      )}

      {/* ── Schedule modal ───────────────────────────────────────────────── */}
      <ScheduleModal
        isOpen={modalOpen}
        onClose={handleCloseModal}
        schedule={modalSchedule}
        storeId={effectiveStoreId}
        defaultDate={modalDefaultDate}
        defaultHour={modalDefaultHour}
        defaultUserId={modalDefaultUserId}
      />
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface StatCardProps {
  value: string;
  label: string;
  detail: string;
  colorClass: string;
  detailColor?: string;
}

function StatCard({ value, label, detail, colorClass, detailColor }: StatCardProps): React.ReactElement {
  return (
    <div className="flex-1 min-w-[140px] p-3 px-4 rounded-xl bg-card border border-border">
      <div className={cn("text-2xl font-extrabold leading-tight", colorClass)}>{value}</div>
      <div className="text-[11px] font-semibold text-text-secondary mt-1">{label}</div>
      <div className={cn("text-[10px] mt-0.5", detailColor ?? "text-text-muted")}>{detail}</div>
    </div>
  );
}

interface LegendItemProps {
  color: string;
  label: string;
  dashed?: boolean;
  faded?: boolean;
}

function LegendItem({ color, label, dashed, faded }: LegendItemProps): React.ReactElement {
  return (
    <div className="flex items-center gap-1.5 text-[11px] text-text-muted">
      <span
        className={cn("w-5 h-2.5 rounded-[3px] inline-block bg-gradient-to-br", color, faded && "opacity-50")}
        style={dashed ? { border: "1px dashed rgba(255,255,255,0.4)" } : undefined}
      />
      {label}
    </div>
  );
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function parseTimeHour(t: string | null | undefined): number | null {
  if (!t) return null;
  const [h] = t.split(":").map(Number);
  return isNaN(h) ? null : h;
}
