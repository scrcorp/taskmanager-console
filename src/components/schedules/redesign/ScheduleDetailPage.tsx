"use client";

/**
 * ScheduleDetailPage — server types 직접 사용. mockup 의존 없음.
 *
 * 모든 데이터를 props로 받음 (page level에서 fetch 후 전달):
 * - schedule, user, attendance, auditEvents, relatedSchedules
 */

import type { Schedule, User, Attendance } from "@/types";
import type { ScheduleAuditLogEntry } from "@/hooks/useSchedules";

interface Props {
  schedule: Schedule;
  user: User;
  attendance: Attendance | null;
  auditEvents: ScheduleAuditLogEntry[];
  relatedSchedules: Schedule[];
  showCost: boolean;
  /** 현재 effective rate (cascade: user → store → org). 없으면 null. */
  currentEffectiveRate: number | null;
  /** Stored rate가 stale일 때 sync 콜백 (GM+ 가능 시). undefined면 버튼 안 보임. */
  onSyncRate?: () => void;
  isSyncingRate?: boolean;
  onBack: () => void;
  /** undefined면 해당 action 버튼 숨김 (권한 없음) */
  onEdit?: () => void;
  onSwap?: () => void;
  onConfirm?: () => void;
  onRevert?: () => void;
  onDelete?: () => void;
  /** Owner-only history entry 삭제. undefined면 버튼 안 보임. */
  onDeleteHistoryEntry?: (logId: string) => void;
}

// ─── Helpers ──────────────────────────────────────────

function parseTimeToHours(t: string | null): number {
  if (!t) return 0;
  const [hh, mm] = t.split(":");
  return (Number.parseInt(hh ?? "0", 10) || 0) + (Number.parseInt(mm ?? "0", 10) || 0) / 60;
}

function formatHourLabel(h: number): string {
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  const suf = hh >= 12 ? "PM" : "AM";
  const hr = hh === 0 ? 12 : hh > 12 ? hh - 12 : hh;
  return mm === 0 ? `${hr}:00 ${suf}` : `${hr}:${String(mm).padStart(2, "0")} ${suf}`;
}

function formatTimeRange(start: string | null, end: string | null): string {
  return `${formatHourLabel(parseTimeToHours(start))} – ${formatHourLabel(parseTimeToHours(end))}`;
}

function formatFullDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}

function shortDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function formatClockTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

function formatHoursMin(min: number | null | undefined): string {
  if (!min) return "—";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

function formatEventTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true });
}

function rolePriorityToBadge(p: number): string {
  if (p <= 10) return "Owner";
  if (p <= 20) return "GM";
  if (p <= 30) return "SV";
  return "Staff";
}

function rolePriorityToColorClass(p: number): string {
  if (p <= 20) return "bg-[var(--color-accent-muted)] text-[var(--color-accent)]";
  if (p <= 30) return "bg-[var(--color-warning-muted)] text-[var(--color-warning)]";
  return "bg-[var(--color-success-muted)] text-[var(--color-success)]";
}

function getInitials(name: string | null | undefined): string {
  if (!name) return "??";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "??";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return ((parts[0]![0] ?? "") + (parts[parts.length - 1]![0] ?? "")).toUpperCase();
}

const statusMeta: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  draft: { label: "Draft", bg: "bg-[var(--color-bg)]", text: "text-[var(--color-text-muted)]", dot: "bg-[var(--color-text-muted)]" },
  requested: { label: "Requested", bg: "bg-[var(--color-warning-muted)]", text: "text-[var(--color-warning)]", dot: "bg-[var(--color-warning)]" },
  confirmed: { label: "Confirmed", bg: "bg-[var(--color-success-muted)]", text: "text-[var(--color-success)]", dot: "bg-[var(--color-success)]" },
  rejected: { label: "Rejected", bg: "bg-[var(--color-danger-muted)]", text: "text-[var(--color-danger)]", dot: "bg-[var(--color-danger)]" },
  cancelled: { label: "Cancelled", bg: "bg-[var(--color-bg)]", text: "text-[var(--color-text-muted)]", dot: "bg-[var(--color-text-muted)]" },
  deleted: { label: "Deleted", bg: "bg-[var(--color-danger-muted)]", text: "text-[var(--color-danger)]", dot: "bg-[var(--color-danger)]" },
};

const eventColors: Record<string, string> = {
  created: "bg-[var(--color-info)]",
  requested: "bg-[var(--color-accent)]",
  modified: "bg-[var(--color-accent)]",
  confirmed: "bg-[var(--color-success)]",
  rejected: "bg-[var(--color-danger)]",
  cancelled: "bg-[var(--color-text-muted)]",
  reverted: "bg-[var(--color-warning)]",
  swapped: "bg-[var(--color-info)]",
  deleted: "bg-[var(--color-danger)]",
};

const eventLabels: Record<string, string> = {
  created: "Created",
  requested: "Submitted",
  modified: "Modified",
  confirmed: "Confirmed",
  rejected: "Rejected",
  cancelled: "Cancelled",
  reverted: "Reverted",
  swapped: "Swapped",
  deleted: "Deleted",
};

const attendanceMeta: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  not_yet: { label: "Scheduled", bg: "bg-[var(--color-bg)]", text: "text-[var(--color-text-muted)]", dot: "bg-[var(--color-text-muted)]" },
  working: { label: "Working", bg: "bg-[var(--color-success-muted)]", text: "text-[var(--color-success)]", dot: "bg-[var(--color-success)] animate-pulse" },
  on_break: { label: "On break", bg: "bg-[var(--color-warning-muted)]", text: "text-[var(--color-warning)]", dot: "bg-[var(--color-warning)]" },
  late: { label: "Late", bg: "bg-[var(--color-danger-muted)]", text: "text-[var(--color-danger)]", dot: "bg-[var(--color-danger)]" },
  clocked_out: { label: "Done", bg: "bg-[var(--color-info-muted)]", text: "text-[var(--color-info)]", dot: "bg-[var(--color-info)]" },
  no_show: { label: "No show", bg: "bg-[var(--color-danger-muted)]", text: "text-[var(--color-danger)]", dot: "bg-[var(--color-danger)]" },
};

// ─── Component ────────────────────────────────────────

export function ScheduleDetailPage({ schedule, user, attendance, auditEvents, relatedSchedules, showCost, currentEffectiveRate, onSyncRate, isSyncingRate, onBack, onEdit, onSwap, onConfirm, onRevert, onDelete, onDeleteHistoryEntry }: Props) {
  const startH = parseTimeToHours(schedule.start_time);
  const endH = parseTimeToHours(schedule.end_time);
  const grossHours = Math.max(0, endH - startH);
  const breakHours = (schedule.break_start_time && schedule.break_end_time)
    ? Math.max(0, parseTimeToHours(schedule.break_end_time) - parseTimeToHours(schedule.break_start_time))
    : 0;
  const hours = Math.max(0, grossHours - breakHours);
  // stored rate만 사용 — NULL이면 No cost (preview/fallback 안 함).
  // 사용자가 명시적으로 sync 버튼 눌러서 cascade rate를 박아넣어야 함.
  const storedRate = schedule.hourly_rate || 0;
  const cost = storedRate > 0 ? (hours * storedRate).toFixed(2) : null;
  // sync 버튼 노출 조건: stored가 비어있거나 현재 cascade와 다를 때
  const isStoredStale = currentEffectiveRate != null && storedRate !== currentEffectiveRate;
  const status = statusMeta[schedule.status] ?? statusMeta.draft;
  const roleName = schedule.work_role_name_snapshot || schedule.work_role_name || "—";
  const positionName = schedule.position_snapshot || "—";
  const userRoleBadge = rolePriorityToBadge(user.role_priority);

  // Late / early leave 계산 (attendance 있을 때만)
  let lateMin = 0;
  let earlyLeaveMin = 0;
  if (attendance && schedule.start_time && schedule.end_time) {
    const schedStartMin = parseTimeToHours(schedule.start_time) * 60;
    const schedEndMin = parseTimeToHours(schedule.end_time) * 60;
    if (attendance.clock_in) {
      const ci = new Date(attendance.clock_in);
      const ciMin = ci.getHours() * 60 + ci.getMinutes();
      lateMin = Math.max(0, ciMin - schedStartMin);
    }
    if (attendance.clock_out) {
      const co = new Date(attendance.clock_out);
      const coMin = co.getHours() * 60 + co.getMinutes();
      earlyLeaveMin = Math.max(0, schedEndMin - coMin);
    }
  }

  const isConfirmed = schedule.status === "confirmed";
  const isRequested = schedule.status === "requested";
  const isDeleted = schedule.status === "deleted";

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 py-4">
        <button
          type="button"
          onClick={onBack}
          className="w-8 h-8 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] flex items-center justify-center text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]"
          aria-label="Back to schedule"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="9 11 5 7 9 3" /></svg>
        </button>
        <div>
          <h1 className="text-[22px] font-semibold text-[var(--color-text)]">Schedule Detail</h1>
          <p className="text-[12px] text-[var(--color-text-muted)]">View and manage this shift</p>
        </div>
      </div>

      {/* 2-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left column (2/3) */}
        <div className="lg:col-span-2 space-y-4">
          {/* Staff card */}
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-5">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-3">Staff</div>
            <div className="flex items-center gap-3">
              <div className={`w-14 h-14 rounded-full flex items-center justify-center text-[16px] font-bold shrink-0 ${rolePriorityToColorClass(user.role_priority)}`}>
                {getInitials(user.full_name)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[16px] font-bold text-[var(--color-text)]">{user.full_name || user.username}</div>
                <div className="flex items-center gap-2 text-[12px] mt-1">
                  <span className={`font-semibold ${user.role_priority <= 20 ? "text-[var(--color-accent)]" : user.role_priority <= 30 ? "text-[var(--color-warning)]" : "text-[var(--color-text-muted)]"}`}>
                    {userRoleBadge}
                  </span>
                  {showCost && user.hourly_rate && (
                    <>
                      <span className="text-[var(--color-text-muted)]">·</span>
                      <span className="text-[var(--color-text-secondary)]">${user.hourly_rate}/hr</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Schedule card */}
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Schedule</div>
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${status.bg} ${status.text}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
                {status.label}
              </span>
            </div>
            <div className="space-y-3">
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-1">Date</div>
                <div className="text-[14px] font-semibold text-[var(--color-text)]">{formatFullDate(schedule.work_date)}</div>
              </div>
              {(schedule.status === "rejected" || schedule.status === "cancelled") && (
                <div className={`px-3 py-2 rounded-lg border-l-2 ${schedule.status === "rejected" ? "bg-[var(--color-danger-muted)] border-[var(--color-danger)]" : "bg-[var(--color-bg)] border-[var(--color-text-muted)]"}`}>
                  <div className={`text-[10px] font-bold uppercase tracking-wider mb-0.5 ${schedule.status === "rejected" ? "text-[var(--color-danger)]" : "text-[var(--color-text-muted)]"}`}>
                    {schedule.status === "rejected" ? "Rejection Reason" : "Cancellation Reason"}
                  </div>
                  <div className="text-[12px] text-[var(--color-text)]">
                    {schedule.status === "rejected" ? (schedule.rejection_reason ?? "—") : (schedule.cancellation_reason ?? "—")}
                  </div>
                </div>
              )}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-1">Work Role</div>
                  <div className="text-[13px] font-medium text-[var(--color-text)]">{roleName}</div>
                </div>
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-1">Position</div>
                  <div className="text-[13px] font-medium text-[var(--color-text)]">{positionName}</div>
                </div>
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-1">Total</div>
                  <div className="text-[13px] font-medium text-[var(--color-text)]">{hours} hours</div>
                </div>
              </div>
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-1">Time</div>
                <div className="text-[13px] font-medium text-[var(--color-text)]">{formatTimeRange(schedule.start_time, schedule.end_time)}</div>
              </div>
              {(schedule.break_start_time || schedule.break_end_time) && (
                <div className="pt-3 border-t border-[var(--color-border)]">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-1">Break</div>
                  <div className="text-[12px] text-[var(--color-text-secondary)]">{formatTimeRange(schedule.break_start_time, schedule.break_end_time)}</div>
                </div>
              )}
            </div>
          </div>

          {/* Cost breakdown (GM only) */}
          {showCost && (
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Cost Breakdown</div>
              </div>
              {cost !== null ? (
                <div>
                  <div className="flex items-center justify-between text-[13px] py-1.5">
                    <span className="text-[var(--color-text-secondary)]">Hourly rate</span>
                    <span className="font-medium text-[var(--color-text)]">${storedRate}</span>
                  </div>
                  <div className="flex items-center justify-between text-[13px] py-1.5">
                    <span className="text-[var(--color-text-secondary)]">Hours scheduled</span>
                    <span className="font-medium text-[var(--color-text)]">{hours}h</span>
                  </div>
                  <div className="flex items-center justify-between pt-2 mt-2 border-t border-[var(--color-border)]">
                    <span className="text-[13px] font-semibold text-[var(--color-text)]">Total</span>
                    <span className="text-[18px] font-bold text-[var(--color-success)]">${cost}</span>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between py-1">
                  <span className="text-[13px] font-semibold text-[var(--color-danger)]">No cost</span>
                  <span className="text-[11px] text-[var(--color-text-muted)]">No rate stored on this schedule</span>
                </div>
              )}
              {/* Sync rate 버튼 — cascade rate가 있으면 명시적으로 박아넣을 수 있게 */}
              {isStoredStale && onSyncRate && (
                <div className="mt-3 pt-3 border-t border-[var(--color-border)]">
                  <div className="text-[11px] text-[var(--color-text-muted)] mb-2">
                    {storedRate === 0
                      ? `No rate stored. ${user.full_name ?? "User"}'s current rate is $${currentEffectiveRate}/hr.`
                      : `Stored rate ($${storedRate}/hr) differs from ${user.full_name ?? "user"}'s current rate ($${currentEffectiveRate}/hr).`}
                  </div>
                  <button
                    type="button"
                    onClick={onSyncRate}
                    disabled={isSyncingRate}
                    className="w-full px-3 py-1.5 rounded-lg text-[12px] font-semibold bg-[var(--color-accent-muted)] text-[var(--color-accent)] hover:bg-[var(--color-accent)] hover:text-white transition-colors disabled:opacity-50"
                  >
                    {isSyncingRate ? "Syncing…" : `Apply $${currentEffectiveRate}/hr to this schedule`}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Attendance comparison */}
          {attendance && (
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Attendance</div>
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${attendanceMeta[attendance.status]?.bg ?? ""} ${attendanceMeta[attendance.status]?.text ?? ""}`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${attendanceMeta[attendance.status]?.dot ?? ""}`} />
                  {attendanceMeta[attendance.status]?.label ?? attendance.status}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-2">Scheduled</div>
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-[13px]">
                      <span className="text-[var(--color-text-secondary)]">Clock in</span>
                      <span className="font-semibold text-[var(--color-text)] tabular-nums">{formatHourLabel(parseTimeToHours(schedule.start_time))}</span>
                    </div>
                    <div className="flex justify-between text-[13px]">
                      <span className="text-[var(--color-text-secondary)]">Clock out</span>
                      <span className="font-semibold text-[var(--color-text)] tabular-nums">{formatHourLabel(parseTimeToHours(schedule.end_time))}</span>
                    </div>
                    <div className="flex justify-between text-[13px] pt-1.5 border-t border-[var(--color-border)]">
                      <span className="text-[var(--color-text-secondary)]">Total</span>
                      <span className="font-bold text-[var(--color-text)]">{hours}h</span>
                    </div>
                  </div>
                </div>

                <div className="border-l border-[var(--color-border)] pl-4">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-2">Actual</div>
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-baseline text-[13px]">
                      <span className="text-[var(--color-text-secondary)]">Clock in</span>
                      <span className="text-right">
                        <span className="font-semibold text-[var(--color-text)] tabular-nums">{formatClockTime(attendance.clock_in)}</span>
                        {lateMin > 0 && <span className="block text-[10px] font-medium text-[var(--color-danger)]">{lateMin} min late</span>}
                      </span>
                    </div>
                    <div className="flex justify-between items-baseline text-[13px]">
                      <span className="text-[var(--color-text-secondary)]">Clock out</span>
                      <span className="text-right">
                        <span className="font-semibold text-[var(--color-text)] tabular-nums">{formatClockTime(attendance.clock_out)}</span>
                        {earlyLeaveMin > 0 && <span className="block text-[10px] font-medium text-[var(--color-warning)]">{earlyLeaveMin} min early</span>}
                      </span>
                    </div>
                    <div className="flex justify-between text-[13px] pt-1.5 border-t border-[var(--color-border)]">
                      <span className="text-[var(--color-text-secondary)]">Total</span>
                      <span className="font-bold text-[var(--color-success)]">{formatHoursMin(attendance.net_work_minutes ?? attendance.total_work_minutes)}</span>
                    </div>
                  </div>
                </div>
              </div>

              {attendance.anomalies && attendance.anomalies.length > 0 && (
                <div className="mt-4 pt-3 border-t border-[var(--color-border)]">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-2">Anomalies</div>
                  <div className="flex flex-wrap gap-1.5">
                    {attendance.anomalies.map((a) => (
                      <span key={a} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-[var(--color-danger-muted)] text-[var(--color-danger)]">
                        {a.replace("_", " ")}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Notes (read-only — schedule.note) */}
          {schedule.note && (
            <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-5">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-2">Notes</div>
              <p className="text-[13px] text-[var(--color-text-secondary)] whitespace-pre-wrap">{schedule.note}</p>
            </div>
          )}

          {/* History */}
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">History</div>
              <a
                href="/schedules/history"
                className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-accent)] hover:underline"
              >
                View all →
              </a>
            </div>
            {auditEvents.length === 0 ? (
              <div className="text-[12px] text-[var(--color-text-muted)] italic">No history events for this schedule yet. Edits, status changes, and rate syncs will appear here.</div>
            ) : (
              <div className="space-y-3">
                {auditEvents.map((e, i) => (
                  <div key={e.id} className={`relative pl-5 pb-3 group ${i < auditEvents.length - 1 ? "border-l-2 border-[var(--color-border)] ml-1" : "ml-1"}`}>
                    <div className={`absolute left-[-5px] top-1 w-[10px] h-[10px] rounded-full ${eventColors[e.event_type] ?? "bg-[var(--color-text-muted)]"} border-2 border-white`} />
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] font-semibold text-[var(--color-text-muted)]">{formatEventTime(e.timestamp)}</div>
                        <div className="text-[13px] text-[var(--color-text)] mt-0.5">
                          <span className="font-semibold">{eventLabels[e.event_type] ?? e.event_type}</span>
                          <span className="font-normal text-[var(--color-text-muted)]"> by {e.actor_name ?? "Unknown"}{e.actor_role ? ` · ${e.actor_role}` : ""}</span>
                        </div>
                      </div>
                      {onDeleteHistoryEntry && (
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm("Delete this history entry permanently?")) {
                              onDeleteHistoryEntry(e.id);
                            }
                          }}
                          className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] font-semibold uppercase tracking-wider text-[var(--color-danger)] hover:bg-[var(--color-danger-muted)] px-1.5 py-0.5 rounded shrink-0"
                          title="Delete history entry (Owner only)"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                    {e.description && <div className="text-[12px] text-[var(--color-text-secondary)] mt-0.5">{e.description}</div>}
                    {e.diff && Object.keys(e.diff).length > 0 && (
                      <div className="mt-1.5 px-2.5 py-1.5 bg-[var(--color-bg)] border-l-2 border-[var(--color-accent)] rounded-r text-[11px]">
                        <div className="font-semibold text-[var(--color-text-muted)] uppercase tracking-wider text-[10px] mb-1">Changes</div>
                        <div className="space-y-0.5">
                          {Object.entries(e.diff).map(([field, change]) => {
                            const d = change as { old?: unknown; new?: unknown };
                            return (
                              <div key={field} className="flex items-baseline gap-2">
                                <span className="font-semibold text-[var(--color-text)] min-w-[90px]">{field}</span>
                                <span className="text-[var(--color-text-muted)] line-through">{String(d.old ?? "—")}</span>
                                <span className="text-[var(--color-text-muted)]">→</span>
                                <span className="text-[var(--color-text)] font-medium">{String(d.new ?? "—")}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {e.reason && (
                      <div className="mt-1.5 px-2.5 py-1.5 bg-[var(--color-bg)] border-l-2 border-[var(--color-danger)] rounded-r text-[11px] text-[var(--color-text-secondary)]">
                        <span className="font-semibold text-[var(--color-text)]">Reason:</span> {e.reason}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right column (1/3) */}
        <div className="space-y-4">
          {/* Quick actions — deleted schedule은 read-only */}
          {!isDeleted && (onEdit || onConfirm || onSwap || onRevert || onDelete) && (
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-5">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-3">Quick Actions</div>
            <div className="space-y-2">
              {onEdit && (
                <button
                  type="button"
                  onClick={onEdit}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-[13px] font-semibold bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] transition-colors"
                >
                  Edit Schedule
                </button>
              )}
              {isRequested && onConfirm && (
                <button
                  type="button"
                  onClick={onConfirm}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-[13px] font-semibold bg-[var(--color-success)] text-white hover:opacity-90"
                >
                  Confirm
                </button>
              )}
              {isConfirmed && onSwap && (
                <button
                  type="button"
                  onClick={onSwap}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-[13px] font-semibold border border-[var(--color-border)] text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]"
                >
                  Swap with...
                </button>
              )}
              {isConfirmed && onRevert && (
                <button
                  type="button"
                  onClick={onRevert}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-[13px] font-semibold border border-[var(--color-border)] text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]"
                >
                  Revert to Pending
                </button>
              )}
              {onDelete && (
                <button
                  type="button"
                  onClick={onDelete}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-[13px] font-semibold text-[var(--color-danger)] hover:bg-[var(--color-danger-muted)]"
                >
                  {isConfirmed ? "Cancel Schedule" : "Delete Schedule"}
                </button>
              )}
            </div>
          </div>
          )}

          {/* Related schedules */}
          <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-5">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-3">
              Related Schedules This Week
            </div>
            {relatedSchedules.length === 0 ? (
              <div className="text-[12px] text-[var(--color-text-muted)] italic">No other schedules this week</div>
            ) : (
              <div className="space-y-2">
                {relatedSchedules.map((rs) => {
                  const rsHours = Math.max(0, parseTimeToHours(rs.end_time) - parseTimeToHours(rs.start_time));
                  const rsStatus = statusMeta[rs.status] ?? statusMeta.draft;
                  const rsRole = rs.work_role_name_snapshot || rs.work_role_name || "—";
                  return (
                    <div key={rs.id} className="flex items-center justify-between gap-2 px-3 py-2 bg-[var(--color-bg)] rounded-lg">
                      <div className="min-w-0 flex-1">
                        <div className="text-[12px] font-semibold text-[var(--color-text)]">{shortDate(rs.work_date)}</div>
                        <div className="text-[11px] text-[var(--color-text-muted)]">
                          {rsRole} · {formatTimeRange(rs.start_time, rs.end_time)} · {rsHours}h
                        </div>
                      </div>
                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${rsStatus.bg} ${rsStatus.text}`}>
                        <span className={`w-1 h-1 rounded-full ${rsStatus.dot}`} />
                        {rsStatus.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
