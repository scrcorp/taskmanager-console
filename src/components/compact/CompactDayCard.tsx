"use client";

/**
 * 통합 목록의 한 행 — 계획(SCH)과 실제(ACT)를 위아래로 겹쳐 보여준다.
 *
 * 탭이 갈려 있을 땐 "예정 9시 / 실제 8:45" 를 맞춰보려면 화면을 오가야 했다.
 * 한 줄에 두 값을 붙여 놓는 게 이 화면의 존재 이유다.
 */

import { AlertTriangle, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { NOT_SET } from "@/lib/compactWeek";
import { wallClock, type DayRow } from "@/lib/compactDay";

const STATUS_STYLE: Record<string, string> = {
  working: "bg-success-muted text-success",
  on_break: "bg-warning-muted text-warning",
  clocked_out: "bg-surface-hover text-text-muted",
  late: "bg-warning-muted text-warning",
  no_show: "bg-danger-muted text-danger",
  upcoming: "bg-accent-muted text-accent",
  soon: "bg-accent-muted text-accent",
  cancelled: "bg-surface-hover text-text-muted",
};

/** 검색어 일치 구간 강조. 질의가 없으면 원문 그대로. */
function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim().toLowerCase();
  if (!q) return <>{text}</>;
  const i = text.toLowerCase().indexOf(q);
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded-sm bg-accent-muted text-accent">{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}

function planText(row: DayRow): string {
  const s = row.schedule;
  if (!s) return "—";
  const start = wallClock(s.start_at) ?? s.start_time;
  const end = wallClock(s.end_at) ?? s.end_time;
  return start && end ? `${start}–${end}` : NOT_SET;
}

function actual(row: DayRow): { text: string; tone: "none" | "live" | "bad" | "normal" } {
  const a = row.attendance;
  if (!a) return { text: "—", tone: "none" };
  if (a.status === "cancelled") return { text: "—", tone: "none" };
  if (a.clock_in_display && a.clock_out_display) {
    return { text: `${a.clock_in_display}–${a.clock_out_display}`, tone: "normal" };
  }
  if (a.clock_in_display) {
    const live = a.status === "working" || a.status === "on_break";
    return { text: `${a.clock_in_display} – ${live ? "now" : "?"}`, tone: live ? "live" : "bad" };
  }
  if (a.status === "no_show") return { text: "not recorded", tone: "bad" };
  return { text: "—", tone: "none" };
}

export function CompactDayCard({
  row,
  query,
  onClick,
}: {
  row: DayRow;
  query: string;
  onClick: () => void;
}) {
  const act = actual(row);
  const status = row.attendance?.status ?? row.schedule?.status ?? "upcoming";
  const isDraft = row.schedule?.status === "draft";

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors active:bg-surface-hover",
        row.issues.length > 0 ? "border-danger/40 bg-danger-muted/20" : "border-border bg-card",
        row.group === "done" && "bg-surface/60",
        row.group === "cancelled" && "opacity-60",
      )}
    >
      <div className="w-[104px] shrink-0">
        <div className="flex items-center gap-1.5 tabular-nums">
          <span className="w-6 shrink-0 text-[8.5px] font-extrabold text-text-muted">SCH</span>
          <span className="truncate text-xs font-semibold text-text-secondary">{planText(row)}</span>
        </div>
        <div className="flex items-center gap-1.5 tabular-nums">
          <span className="w-6 shrink-0 text-[8.5px] font-extrabold text-text-muted">ACT</span>
          <span
            className={cn(
              "truncate text-[13px] font-extrabold",
              act.tone === "none" && "font-semibold text-text-muted",
              act.tone === "live" && "text-success",
              act.tone === "bad" && "text-danger",
              act.tone === "normal" && "text-text",
            )}
          >
            {act.text}
          </span>
        </div>
      </div>

      {/* 이름은 한 줄을 통째로 쓴다 — 상태 배지를 같은 줄에 두면 320px 에서 이름이 뭉개진다 */}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-bold text-text">
          <Highlight text={row.userName} query={query} />
          {!row.schedule && (
            <span className="ml-1.5 rounded-full bg-accent-muted px-1.5 py-0.5 text-[9px] font-extrabold uppercase text-accent">
              walk-in
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {row.roleName && (
            <span className="truncate text-xs text-text-secondary">
              <Highlight text={row.roleName} query={query} />
            </span>
          )}
          {isDraft && (
            <span className="shrink-0 rounded-full bg-warning-muted px-1.5 py-0.5 text-[9px] font-extrabold uppercase text-warning">
              draft
            </span>
          )}
          <span
            className={cn(
              "ml-auto shrink-0 rounded-full px-2 py-0.5 text-[9.5px] font-extrabold uppercase",
              STATUS_STYLE[status] ?? "bg-surface-hover text-text-muted",
            )}
          >
            {status.replace(/_/g, " ")}
          </span>
        </div>
        {row.issues.length > 0 && (
          <div className="flex items-center gap-1 text-[11px] font-bold text-danger">
            <AlertTriangle size={11} className="shrink-0" />
            <span className="truncate">{row.issues[0]}</span>
          </div>
        )}
      </div>

      <ChevronRight size={15} className="shrink-0 text-text-muted" />
    </button>
  );
}
