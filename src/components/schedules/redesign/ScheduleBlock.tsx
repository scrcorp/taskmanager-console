/**
 * ScheduleBlock — server Schedule + User + (optional) Attendance를 받아 셀에 표시.
 *
 * Props는 모두 server type 직접 사용. mockup adapter 없음.
 */

import type { Schedule, Attendance } from "@/types";

interface Props {
  schedule: Schedule;
  showCost: boolean;
  attendance?: Attendance | null;
  /** 현재 보고 있는 매장 ID — 다른 매장 스케줄(isOtherStore) 표시용 */
  currentStoreId: string;
  onClick?: (e: React.MouseEvent) => void;
}

const stateDotColors: Record<string, string> = {
  not_yet: "bg-[var(--color-text-muted)]",
  working: "bg-[var(--color-success)] animate-pulse",
  on_break: "bg-[var(--color-warning)]",
  late: "bg-[var(--color-danger)]",
  clocked_out: "bg-[var(--color-info)]",
  no_show: "bg-[var(--color-danger)]",
};

const stateTextColors: Record<string, string> = {
  not_yet: "text-[var(--color-text-muted)]",
  working: "text-[var(--color-success)]",
  on_break: "text-[var(--color-warning)]",
  late: "text-[var(--color-danger)]",
  clocked_out: "text-[var(--color-info)]",
  no_show: "text-[var(--color-danger)]",
};

const stateLabels: Record<string, string> = {
  not_yet: "Scheduled",
  working: "Working",
  on_break: "On break",
  late: "Late",
  clocked_out: "Done",
  no_show: "No show",
};

type AlertLevel = "normal" | "caution" | "overtime";

function getAlertLevel(hours: number): AlertLevel {
  if (hours <= 5.5) return "normal";
  if (hours <= 7.5) return "caution";
  return "overtime";
}

const alertStyles: Record<AlertLevel, { border: string; bg: string; bgMuted: string; text: string }> = {
  normal: {
    border: "border-[var(--color-success)]",
    bg: "bg-[var(--color-success-muted)]",
    bgMuted: "rgba(0, 184, 148, 0.06)",
    text: "text-[var(--color-success)]",
  },
  caution: {
    border: "border-[var(--color-warning)]",
    bg: "bg-[var(--color-warning-muted)]",
    bgMuted: "rgba(240, 165, 0, 0.06)",
    text: "text-[var(--color-warning)]",
  },
  overtime: {
    border: "border-[var(--color-danger)]",
    bg: "bg-[var(--color-danger-muted)]",
    bgMuted: "rgba(239, 68, 68, 0.06)",
    text: "text-[var(--color-danger)]",
  },
};

/** "HH:MM" → fractional hours (9.5) */
function parseTimeToHours(t: string | null): number {
  if (!t) return 0;
  const [hh, mm] = t.split(":");
  return (Number.parseInt(hh ?? "0", 10) || 0) + (Number.parseInt(mm ?? "0", 10) || 0) / 60;
}

function formatTime(t: string | null): string {
  if (!t) return "—";
  const h = parseTimeToHours(t);
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  const suf = hh >= 12 ? "p" : "a";
  const hr = hh === 0 ? 12 : hh > 12 ? hh - 12 : hh;
  return mm === 0 ? `${hr}${suf}` : `${hr}:${String(mm).padStart(2, "0")}${suf}`;
}

function formatClockTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

function elapsedSince(iso: string): string {
  const start = new Date(iso).getTime();
  const diff = Math.max(0, Date.now() - start);
  const totalMin = Math.floor(diff / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function ScheduleBlock({ schedule, showCost, attendance, currentStoreId, onClick }: Props) {
  const startH = parseTimeToHours(schedule.start_time);
  const endH = parseTimeToHours(schedule.end_time);
  const hours = Math.max(0, endH - startH);
  // stored rate만 사용. NULL이면 "No cost" 표시 (preview/cascade 안 함 — 사용자가 명시적으로 sync해야 함).
  const storedRate = schedule.hourly_rate;
  const cost = storedRate && storedRate > 0 ? Math.round(hours * storedRate) : null;
  const timeRange = `${formatTime(schedule.start_time)}–${formatTime(schedule.end_time)}`;

  const isOtherStore = schedule.store_id !== currentStoreId;
  const roleName = schedule.work_role_name_snapshot || schedule.work_role_name || "Shift";
  const positionName = schedule.position_snapshot || "—";

  if (isOtherStore) {
    return (
      <div
        className="rounded-md border-[1.5px] border-dashed border-[var(--color-text-muted)] px-2 py-1.5 opacity-40 text-[var(--color-text-muted)]"
        title={`Scheduled at ${schedule.store_name ?? "another store"}`}
      >
        <div className="text-[11px] font-semibold leading-tight truncate">{roleName} · {positionName}</div>
        <div className="text-[10px] mt-0.5">{timeRange} ({hours}h)</div>
        <div className="text-[10px] mt-0.5 truncate">@ {schedule.store_name ?? "—"}</div>
      </div>
    );
  }

  const level = getAlertLevel(hours);
  const styles = alertStyles[level];
  const status = schedule.status;
  const isConfirmed = status === "confirmed";
  const isRequested = status === "requested";
  const isDraft = status === "draft";
  const isRejected = status === "rejected";
  const isCancelled = status === "cancelled";

  const pendingBg = isRequested
    ? `repeating-linear-gradient(-45deg, ${styles.bgMuted}, ${styles.bgMuted} 3px, transparent 3px, transparent 6px)`
    : undefined;

  const rejectedClasses = isRejected
    ? "border-[var(--color-text-muted)] bg-[var(--color-bg)] opacity-60 line-through decoration-[var(--color-danger)] decoration-2"
    : "";
  const cancelledClasses = isCancelled
    ? "border-dashed border-[var(--color-text-muted)] bg-[var(--color-bg)]/60 opacity-50"
    : "";

  return (
    <div
      onClick={onClick}
      role="button"
      title={
        isRejected
          ? `Rejected: ${schedule.rejection_reason ?? ""}`
          : isCancelled
            ? `Cancelled: ${schedule.cancellation_reason ?? ""}`
            : undefined
      }
      className={`
        group rounded-md border-[1.5px] px-2 py-1.5 cursor-pointer relative
        transition-[box-shadow] duration-150 ease-out hover:shadow-[0_2px_8px_rgba(0,0,0,0.08)]
        ${isRejected || isCancelled ? "" : styles.border}
        ${isConfirmed ? styles.bg : ""}
        ${isRequested ? "border-dashed" : ""}
        ${isDraft ? "border-dashed border-[var(--color-border)] bg-[var(--color-bg)] opacity-50" : ""}
        ${rejectedClasses}
        ${cancelledClasses}
      `}
      style={isRequested ? { backgroundImage: pendingBg } : undefined}
    >
      {/* Row 1: Role · Position + hours */}
      <div className="flex items-center justify-between gap-1">
        <span className="text-[11px] font-semibold text-[var(--color-text)] truncate flex-1 min-w-0">
          {roleName}{positionName !== "—" ? ` · ${positionName}` : ""}
        </span>
        <span className={`text-[11px] font-bold tabular-nums shrink-0 ${styles.text}`}>{hours}h</span>
      </div>

      {/* Row 2: Time range */}
      <div className="text-[10px] text-[var(--color-text-secondary)] tabular-nums mt-0.5">{timeRange}</div>

      {/* Row 3: Cost (GM only) */}
      {showCost && cost !== null && (
        <div className={`text-[10px] font-semibold mt-0.5 tabular-nums ${isRequested ? "opacity-70" : "text-[var(--color-text)]"}`}>
          ${cost}
        </div>
      )}
      {showCost && cost === null && (
        <div className="text-[10px] font-medium mt-0.5 text-[var(--color-danger)]" title="No rate stored on this schedule. Open detail and sync to apply current rate.">No cost</div>
      )}

      {/* Row 4: Status / Attendance */}
      {(isRequested || isDraft || isRejected || isCancelled || (isConfirmed && attendance)) && (
        <div className="flex items-center gap-1 mt-1 pt-1 border-t border-[var(--color-border)]/40 text-[10px] font-medium">
          {isRequested ? (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-warning)] flex-shrink-0" />
              <span className="text-[var(--color-warning)]">Requested</span>
            </>
          ) : isDraft ? (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-text-muted)] flex-shrink-0" />
              <span className="text-[var(--color-text-muted)]">Draft</span>
            </>
          ) : isRejected ? (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-danger)] flex-shrink-0" />
              <span className="text-[var(--color-danger)] truncate" title={schedule.rejection_reason ?? undefined}>Rejected</span>
            </>
          ) : isCancelled ? (
            <>
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-text-muted)] flex-shrink-0" />
              <span className="text-[var(--color-text-muted)] truncate" title={schedule.cancellation_reason ?? undefined}>Cancelled</span>
            </>
          ) : attendance && (
            <>
              {attendance.status === "no_show" ? (
                <svg width="9" height="9" viewBox="0 0 9 9" className="text-[var(--color-danger)] flex-shrink-0">
                  <path d="M2 2l5 5M7 2l-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                </svg>
              ) : (
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${stateDotColors[attendance.status] ?? ""}`} />
              )}
              <span className={`${stateTextColors[attendance.status] ?? ""} truncate`}>
                {stateLabels[attendance.status] ?? attendance.status}
              </span>
              {attendance.status === "working" && attendance.clock_in && (
                <span className="opacity-60 truncate">· {elapsedSince(attendance.clock_in)}</span>
              )}
              {attendance.status === "clocked_out" && attendance.clock_out && (
                <span className="opacity-60 truncate">· {formatClockTime(attendance.clock_out)}</span>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
