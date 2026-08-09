"use client";

import { ChevronRight } from "lucide-react";
import { formatWallClock } from "@/lib/compactWeek";
import { cn } from "@/lib/utils";
import type { Schedule } from "@/types";

const STATUS_STYLE: Record<string, string> = {
  confirmed: "bg-success-muted text-success",
  draft: "bg-warning-muted text-warning",
  requested: "bg-warning-muted text-warning",
  rejected: "bg-danger-muted text-danger",
};

export function CompactScheduleCard({
  schedule,
  onClick,
}: {
  schedule: Schedule;
  onClick: () => void;
}) {
  const role = schedule.work_role_name_snapshot ?? schedule.work_role_name;
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl border border-border bg-card px-3 py-3 text-left transition-colors active:bg-surface-hover"
    >
      <div className="w-[86px] shrink-0">
        <div className="text-sm font-bold tabular-nums text-text">
          {formatWallClock(schedule.start_at)}
        </div>
        <div className="text-xs tabular-nums text-text-muted">
          {formatWallClock(schedule.end_at)}
        </div>
      </div>

      {/* 이름은 한 줄을 통째로 쓴다 — 상태 배지를 같은 줄에 두면 320px 에서 이름이 뭉개진다 */}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-text">
          {schedule.user_name ?? "Unassigned"}
        </div>
        <div className="flex items-center gap-1.5">
          {role && <span className="truncate text-xs text-text-secondary">{role}</span>}
          <span
            className={cn(
              "ml-auto shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase",
              STATUS_STYLE[schedule.status] ?? "bg-surface-hover text-text-muted",
            )}
          >
            {schedule.status}
          </span>
        </div>
      </div>

      <ChevronRight size={16} className="shrink-0 text-text-muted" />
    </button>
  );
}
