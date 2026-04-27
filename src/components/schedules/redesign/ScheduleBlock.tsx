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
  /**
   * 현재 보고 있는 매장 ID.
   *  - "__all__" = All Stores / 다중 선택: isOtherStore 판단은 isOtherStore prop으로 별도 제어
   *  - 단일 store: 이 store와 다르면 isOtherStore (dim).
   */
  currentStoreId: string;
  /** 명시적으로 "다른 매장(dim)" 으로 표시하고 싶을 때 (다중 선택에서 subset 밖). */
  isOtherStore?: boolean;
  /** 컨텍스트 메뉴가 이 카드를 가리키고 있으면 true → ring/shadow 강조 */
  isActive?: boolean;
  /** 이 카드(schedule.store_id)의 타임존. clock in/out 등 UTC timestamp를 현지시각으로 렌더링하는 데 사용. */
  storeTimezone?: string | null;
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

/** hours 소수점 최대 2자리 반올림. 정수면 정수 표시. */
function fmtH(h: number): string {
  const r = Math.round(h * 100) / 100;
  return r % 1 === 0 ? String(r) : r.toFixed(r * 10 % 1 === 0 ? 1 : 2);
}

function formatClockTime(iso: string | null, tz?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: tz,
  });
}

function elapsedSince(iso: string): string {
  const start = new Date(iso).getTime();
  const diff = Math.max(0, Date.now() - start);
  const totalMin = Math.floor(diff / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function ScheduleBlock({ schedule, showCost, attendance, currentStoreId, isOtherStore: isOtherStoreProp, isActive, storeTimezone, onClick }: Props) {
  const startH = parseTimeToHours(schedule.start_time);
  const endH = parseTimeToHours(schedule.end_time);
  // overnight: end < start → wrap (e.g. 22:00–02:00 = 4h)
  const grossHours = endH > startH ? endH - startH : (24 - startH + endH);
  const hasBreak = !!(schedule.break_start_time && schedule.break_end_time);
  const breakHours = hasBreak
    ? Math.max(0, parseTimeToHours(schedule.break_end_time) - parseTimeToHours(schedule.break_start_time))
    : 0;
  const hours = Math.max(0, grossHours - breakHours);
  // stored rate만 사용. NULL이면 "No cost" 표시 (preview/cascade 안 함 — 사용자가 명시적으로 sync해야 함).
  const storedRate = schedule.hourly_rate;
  const cost = storedRate && storedRate > 0 ? (hours * storedRate).toFixed(2) : null;
  // overnight: 종료 시각이 시작 시각보다 작으면 다음날 걸침.
  const isOvernight = endH <= startH && endH > 0;
  const nextDayTag = isOvernight ? <sup className="text-[8px] font-bold text-[var(--color-accent)] ml-0.5" title="Ends next day">+1</sup> : null;
  const timeRange = hasBreak
    ? <>
        {formatTime(schedule.start_time)}–{formatTime(schedule.break_start_time)} · {formatTime(schedule.break_end_time)}–{formatTime(schedule.end_time)}{nextDayTag}
      </>
    : <>
        {formatTime(schedule.start_time)}–{formatTime(schedule.end_time)}{nextDayTag}
      </>;

  // "__all__" = All 모드 → dimming 없이 모든 스토어 표시
  const isAllMode = currentStoreId === "__all__";
  // 단일 store 선택 시 이 store와 다르면 dim. 다중 선택/All Stores일 때는 caller가 명시한 isOtherStoreProp 사용.
  const isOtherStore = (!isAllMode && schedule.store_id !== currentStoreId) || !!isOtherStoreProp;
  const roleName = schedule.work_role_name_snapshot || schedule.work_role_name || "Shift";
  const positionName = schedule.position_snapshot || "—";
  const showStoreName = true; // 뷰 모드와 무관하게 항상 스토어명 노출 (맥락 유지)

  if (isOtherStore) {
    return (
      <div
        className="rounded-md border-[1.5px] border-dashed border-[var(--color-border)] px-2 py-1.5 bg-[var(--color-bg)] text-[var(--color-text-secondary)]"
        title={`Scheduled at ${schedule.store_name ?? "another store"}`}
      >
        <div className="text-[10px] font-semibold truncate mb-0.5">{schedule.store_name ?? "—"}</div>
        <div className="text-[11px] font-semibold leading-tight truncate">{roleName} · {positionName}</div>
        <div className="text-[10px] mt-0.5">{timeRange} ({fmtH(hours)}h)</div>
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
        ${isDraft ? "border-dashed border-[var(--color-accent)] bg-[var(--color-accent-muted)] opacity-75" : ""}
        ${rejectedClasses}
        ${cancelledClasses}
        ${isActive ? "ring-2 ring-[var(--color-accent)] ring-offset-1 ring-offset-[var(--color-bg)] shadow-[0_4px_16px_rgba(108,92,231,0.35)] z-20" : ""}
      `}
      style={isRequested ? { backgroundImage: pendingBg } : undefined}
    >
      {/* Row 0: Store name (멀티/All 모드) */}
      {showStoreName && schedule.store_name && (
        <div className="text-[10px] font-semibold text-[var(--color-accent)] truncate mb-0.5">{schedule.store_name}</div>
      )}

      {/* Row 1: Role · Position + hours */}
      <div className="flex items-center justify-between gap-1">
        <span className="text-[11px] font-semibold text-[var(--color-text)] truncate flex-1 min-w-0">
          {roleName}{positionName !== "—" ? ` · ${positionName}` : ""}
        </span>
        <span className={`text-[11px] font-bold tabular-nums shrink-0 ${styles.text}`}>{fmtH(hours)}h</span>
      </div>

      {/* Row 2: Time range */}
      <div className="text-[10px] text-[var(--color-text-secondary)] tabular-nums mt-0.5">
        {timeRange}
      </div>

      {/* Row 2.5: Timeline bar — status색 바. break 있으면 중간에 회색 gap. */}
      {grossHours > 0 && !isRejected && !isCancelled && (
        <div className="mt-1 h-[5px] rounded-full bg-[var(--color-border)]/30 relative overflow-hidden" title={hasBreak ? `Break ${fmtH(breakHours)}h` : `${fmtH(hours)}h`}>
          {hasBreak ? (() => {
            const bStart = parseTimeToHours(schedule.break_start_time);
            const seg1Pct = Math.max(0, Math.min(100, ((bStart - startH) / grossHours) * 100));
            const breakPct = Math.max(0, Math.min(100, (breakHours / grossHours) * 100));
            const barColor = isConfirmed ? "var(--color-success)" : isDraft ? "var(--color-text-muted)" : "var(--color-warning)";
            return (
              <>
                <div className="absolute inset-y-0 left-0 rounded-l-full" style={{ width: `${seg1Pct}%`, background: barColor, opacity: 0.7 }} />
                <div className="absolute inset-y-0 rounded-sm" style={{ left: `${seg1Pct}%`, width: `${breakPct}%`, background: "var(--color-border)", opacity: 0.6 }} />
                <div className="absolute inset-y-0 right-0 rounded-r-full" style={{ width: `${Math.max(0, 100 - seg1Pct - breakPct)}%`, background: barColor, opacity: 0.7 }} />
              </>
            );
          })() : (
            <div
              className="absolute inset-0 rounded-full"
              style={{
                background: isConfirmed ? "var(--color-success)" : isDraft ? "var(--color-text-muted)" : "var(--color-warning)",
                opacity: 0.5,
              }}
            />
          )}
        </div>
      )}

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
                <span className="opacity-60 truncate">· {formatClockTime(attendance.clock_out, storeTimezone ?? undefined)}</span>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
