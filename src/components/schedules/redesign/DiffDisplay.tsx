"use client";

/**
 * DiffDisplay — audit log diff를 사용자 친화적으로 표시.
 *
 * - 일반 변경: field → label, UUID → 이름, 색상 구분
 * - Swap: 양쪽 스케줄 나란히 표시 + 링크
 * - reason 별도 영역
 */

import Link from "next/link";
import type { User } from "@/types";

const FIELD_LABELS: Record<string, string> = {
  user_id: "Staff",
  hourly_rate: "Hourly Rate",
  work_date: "Date",
  work_role_id: "Work Role",
  start_time: "Start",
  end_time: "End",
  break_start_time: "Break Start",
  break_end_time: "Break End",
  note: "Note",
  status: "Status",
  store_id: "Store",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fmtTime(t: string | null | undefined): string {
  if (!t) return "";
  const [hh, mm] = t.split(":");
  const h = Number(hh); const m = mm ?? "00";
  const suf = h >= 12 ? "PM" : "AM";
  const hr = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hr}:${m} ${suf}`;
}

function resolveValue(field: string, value: unknown, nameHint: string | undefined, users?: User[]): string {
  if (value == null) return "—";
  if (nameHint) return nameHint;
  const str = String(value);
  if (field === "user_id" && UUID_RE.test(str) && users) {
    const u = users.find((x) => x.id === str);
    if (u) return u.full_name || u.username || str;
  }
  if (field === "hourly_rate" && !isNaN(Number(str))) return `$${str}`;
  return str;
}

interface SwapInfo {
  schedule_id?: string;
  user_name?: string;
  work_date?: string;
  start_time?: string;
  end_time?: string;
  store_name?: string;
  work_role_name?: string;
}

interface DiffEntry {
  old?: unknown;
  new?: unknown;
  old_name?: string;
  new_name?: string;
}

interface Props {
  diff: Record<string, DiffEntry | SwapInfo>;
  users?: User[];
  reason?: string;
  className?: string;
}

function SwapScheduleCard({ info }: { info: SwapInfo }) {
  const time = `${fmtTime(info.start_time)}–${fmtTime(info.end_time)}`;
  const role = info.work_role_name || "";
  const store = info.store_name || "";
  const roleLine = role || store ? `${role}${store ? ` @ ${store}` : ""}` : null;

  return (
    <div className="text-center bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-5 py-3 min-w-[180px]">
      <div className="text-[13px] font-semibold text-[var(--color-text)]">{info.user_name ?? "Unknown"}</div>
      <div className="text-[12px] text-[var(--color-text-secondary)] mt-1 space-y-0.5">
        {info.schedule_id ? (
          <Link href={`/schedules/${info.schedule_id}`} className="text-[var(--color-accent)] hover:underline">
            {info.work_date} · {time}
          </Link>
        ) : (
          <div>{info.work_date} · {time}</div>
        )}
        {roleLine && <div>{roleLine}</div>}
      </div>
    </div>
  );
}

export function DiffDisplay({ diff, users, reason, className = "" }: Props) {
  const swapThis = diff._swap_this as SwapInfo | undefined;
  const swapWith = diff._swap_with as SwapInfo | undefined;
  const isSwap = !!swapWith;

  const regularFields = isSwap
    ? []
    : Object.entries(diff).filter(([k]) => !k.startsWith("_")) as [string, DiffEntry][];

  return (
    <div className={`space-y-2 ${className}`}>
      {/* Regular changes */}
      {regularFields.length > 0 && (
        <div className="space-y-1">
          {regularFields.map(([field, val]) => {
            const label = FIELD_LABELS[field] ?? field;
            const oldVal = resolveValue(field, val.old, val.old_name, users);
            const newVal = resolveValue(field, val.new, val.new_name, users);
            return (
              <div key={field} className="text-[11px] flex items-baseline gap-2">
                <span className="font-semibold text-[var(--color-text-secondary)] min-w-[80px]">{label}</span>
                <span className="text-[var(--color-text-muted)]">{oldVal}</span>
                <span className="text-[var(--color-text-muted)]">→</span>
                <span className="text-[var(--color-text)] font-medium">{newVal}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Swap: 양쪽 스케줄 나란히 */}
      {isSwap && (
        <div className="flex items-center justify-center gap-5">
          {swapThis && <SwapScheduleCard info={swapThis} />}
          <div className="text-[var(--color-text-muted)] shrink-0">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M7 16l-4-4 4-4"/><path d="M17 8l4 4-4 4"/><path d="M3 12h18"/></svg>
          </div>
          {swapWith && <SwapScheduleCard info={swapWith} />}
        </div>
      )}

      {/* Reason */}
      {reason && (
        <div className="px-2.5 py-1.5 bg-[var(--color-bg)] border-l-2 border-[var(--color-warning)] rounded-r text-[11px]">
          <span className="font-semibold text-[var(--color-text)]">Reason:</span>{" "}
          <span className="text-[var(--color-text-secondary)]">{reason}</span>
        </div>
      )}
    </div>
  );
}
