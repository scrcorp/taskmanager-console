"use client";

import { AlertTriangle, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Attendance } from "@/types";
import { displayTimes, extraAnomalies, hasIssue } from "@/lib/compactAttendance";

const STATUS_STYLE: Record<string, string> = {
  working: "bg-success-muted text-success",
  on_break: "bg-warning-muted text-warning",
  clocked_out: "bg-surface-hover text-text-muted",
  late: "bg-warning-muted text-warning",
  no_show: "bg-danger-muted text-danger",
  cancelled: "bg-surface-hover text-text-muted",
};

/** 상태 코드를 사람이 읽는 라벨로 (no_show → No show). */
function statusLabel(status: string): string {
  return status.replace(/_/g, " ");
}

export function CompactAttendanceCard({
  attendance,
  onClick,
}: {
  attendance: Attendance;
  onClick: () => void;
}) {
  const issue = hasIssue(attendance);
  const times = displayTimes(attendance);
  const anomalies = extraAnomalies(attendance);
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-xl border bg-card px-3 py-3 text-left transition-colors active:bg-surface-hover",
        issue ? "border-danger/40" : "border-border",
      )}
    >
      {/* 실제 기록이 없으면 예정 시각을 흐리게 보여준다 ("sched" 칩으로 구분) */}
      <div className="w-[92px] shrink-0">
        <div
          className={cn(
            "flex items-baseline gap-1 text-sm tabular-nums",
            times.inIsScheduled ? "font-medium text-text-muted" : "font-bold text-text",
          )}
        >
          {times.inText}
          {times.inIsScheduled && <span className="text-[9px] uppercase">sched</span>}
        </div>
        <div
          className={cn(
            "flex items-baseline gap-1 text-xs tabular-nums text-text-muted",
            times.outIsScheduled && "italic",
          )}
        >
          {times.outText}
          {times.outIsScheduled && <span className="text-[9px] not-italic uppercase">sched</span>}
        </div>
      </div>

      {/* 이름은 한 줄을 통째로 쓴다 — 상태 배지를 같은 줄에 두면 320px 에서 이름이 뭉개진다 */}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-text">
          {attendance.user_name ?? "Unknown"}
        </div>
        <div className="flex items-center gap-1.5">
          {issue && anomalies.length > 0 && (
            <>
              <AlertTriangle size={12} className="shrink-0 text-danger" />
              <span className="truncate text-xs text-danger">
                {anomalies.join(", ").replace(/_/g, " ")}
              </span>
            </>
          )}
          <span
            className={cn(
              "ml-auto shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase",
              STATUS_STYLE[attendance.status] ?? "bg-surface-hover text-text-muted",
            )}
          >
            {statusLabel(attendance.status)}
          </span>
        </div>
      </div>

      <ChevronRight size={16} className="shrink-0 text-text-muted" />
    </button>
  );
}
