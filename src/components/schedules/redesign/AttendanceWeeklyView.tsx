"use client";

/**
 * Attendance Weekly View — 직원 × 요일 7일 그리드.
 *
 * 각 셀에 clock-in/out 시간, 상태 색깔, late/no_show 태그, 수정 표시(노란 점)를 노출.
 * 해당 매장의 모든 활성 직원을 행으로 표시하고, 스케줄/attendance 없는 셀은 OFF.
 *
 * Daily view 와 같은 페이지에서 view toggle 로 전환.
 * 헤더 (store/title/toggle/date) 는 부모(AttendancePage) 가 관리.
 */

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAttendances } from "@/hooks/useAttendances";
import { useUsers } from "@/hooks/useUsers";
import type { Attendance } from "@/types";

type AttendanceState = Attendance["status"];

const stateMeta: Record<
  AttendanceState,
  { bg: string; ring: string; dot: string; label: string }
> = {
  upcoming: {
    bg: "bg-[var(--color-bg)]",
    ring: "ring-1 ring-[var(--color-border)]",
    dot: "bg-[var(--color-text-muted)]",
    label: "Upcoming",
  },
  soon: {
    bg: "bg-[var(--color-warning-muted)]",
    ring: "ring-1 ring-[var(--color-warning)]/40",
    dot: "bg-[var(--color-warning)]",
    label: "Soon",
  },
  working: {
    bg: "bg-[var(--color-success-muted)]",
    ring: "ring-1 ring-[var(--color-success)]/40",
    dot: "bg-[var(--color-success)]",
    label: "Working",
  },
  on_break: {
    bg: "bg-[var(--color-warning-muted)]",
    ring: "ring-1 ring-[var(--color-warning)]/40",
    dot: "bg-[var(--color-warning)]",
    label: "On break",
  },
  late: {
    bg: "bg-[var(--color-danger-muted)]",
    ring: "ring-1 ring-[var(--color-danger)]/40",
    dot: "bg-[var(--color-danger)]",
    label: "Late",
  },
  clocked_out: {
    bg: "bg-[var(--color-surface)]",
    ring: "ring-1 ring-[var(--color-border)]",
    dot: "bg-[var(--color-info,#7AB7FF)]",
    label: "Done",
  },
  no_show: {
    bg: "bg-[var(--color-danger-muted)]",
    ring: "ring-1 ring-[var(--color-danger)]",
    dot: "bg-[var(--color-danger)]",
    label: "No show",
  },
  cancelled: {
    bg: "bg-[var(--color-surface)]",
    ring: "ring-1 ring-[var(--color-border)]",
    dot: "bg-[var(--color-text-muted)]",
    label: "Cancelled",
  },
};

function formatHHmm24(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** YYYY-MM-DD 캘린더 날짜 더하기 (timezone-safe). */
function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const local = new Date(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + days);
  const ny = local.getFullYear();
  const nm = String(local.getMonth() + 1).padStart(2, "0");
  const nd = String(local.getDate()).padStart(2, "0");
  return `${ny}-${nm}-${nd}`;
}

function dayOfWeek(ymd: string): number {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1).getDay();
}

/** Week start (Sunday) 로 정렬 — schedules/overview 와 동일 컨벤션. */
function sundayOf(ymd: string): string {
  const dow = dayOfWeek(ymd); // 0=Sun ... 6=Sat
  return addDays(ymd, -dow);
}

function weekDates(weekStart: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function isLate(r: Attendance): boolean {
  return r.status === "late" || (r.anomalies?.includes("late") ?? false);
}

interface Props {
  storeId: string;
  /** 어느 날짜이든 OK — 내부에서 해당 주의 월요일로 정규화. */
  weekStart: string;
}

export function AttendanceWeeklyView({ storeId, weekStart }: Props) {
  const router = useRouter();
  const normalizedWeekStart = useMemo(() => sundayOf(weekStart), [weekStart]);
  const days = useMemo(() => weekDates(normalizedWeekStart), [normalizedWeekStart]);
  const dateFrom = days[0]!;
  const dateTo = days[6]!;

  const attendancesQ = useAttendances({
    store_id: storeId || undefined,
    date_from: dateFrom,
    date_to: dateTo,
    per_page: 500,
  });
  const records = attendancesQ.data?.items ?? [];

  // 매장의 활성 직원 전체 — attendance 없어도 행으로 표시 (스케줄 없는 날은 OFF).
  const usersQ = useUsers(storeId ? { store_id: storeId, is_active: true } : undefined);
  const storeUsers = usersQ.data ?? [];

  // 직원 ID → 요일별 attendance 배열.
  const attendanceByUser = useMemo(() => {
    const map = new Map<string, Map<string, Attendance[]>>();
    for (const r of records) {
      let perDay = map.get(r.user_id);
      if (!perDay) {
        perDay = new Map();
        map.set(r.user_id, perDay);
      }
      const list = perDay.get(r.work_date) ?? [];
      list.push(r);
      perDay.set(r.work_date, list);
    }
    return map;
  }, [records]);

  // 행 목록 — 매장 직원이 fetch 됐으면 그 목록 사용, 아니면 records 기반.
  const rows = useMemo(() => {
    if (storeUsers.length > 0) {
      return storeUsers
        .map((u) => ({
          user_id: u.id,
          user_name: u.full_name || u.username || "—",
          perDay: attendanceByUser.get(u.id) ?? new Map<string, Attendance[]>(),
        }))
        .sort((a, b) => a.user_name.localeCompare(b.user_name));
    }
    // fallback — store 직원 fetch 실패 시 attendance 기반.
    const fallback = new Map<string, { user_id: string; user_name: string }>();
    for (const r of records) {
      if (!fallback.has(r.user_id)) {
        fallback.set(r.user_id, {
          user_id: r.user_id,
          user_name: r.user_name ?? "—",
        });
      }
    }
    return Array.from(fallback.values())
      .map((u) => ({
        ...u,
        perDay: attendanceByUser.get(u.user_id) ?? new Map<string, Attendance[]>(),
      }))
      .sort((a, b) => a.user_name.localeCompare(b.user_name));
  }, [storeUsers, records, attendanceByUser]);

  // Daily 와 동일한 5 개 stat — Upcoming/Clocked In/Late/On Break/No Show. (+ Edited 별도 hint)
  const stats = useMemo(() => {
    let upcoming = 0;
    let working = 0;
    let onBreak = 0;
    let late = 0;
    let noShow = 0;
    let edited = 0;
    for (const r of records) {
      if (r.status === "upcoming" || r.status === "soon") upcoming += 1;
      if (r.status === "working") working += 1;
      if (r.status === "on_break") onBreak += 1;
      if (isLate(r)) late += 1;
      if (r.status === "no_show") noShow += 1;
      if ((r.correction_count ?? 0) > 0) edited += 1;
    }
    return { upcoming, working, onBreak, late, noShow, edited };
  }, [records]);

  return (
    <div>
      {/* Stat cards — Daily 와 동일한 5 개 (Upcoming/Clocked In/Late/On Break/No Show) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
        <StatCard label="Upcoming" value={stats.upcoming} color="text-[var(--color-text)]" />
        <StatCard label="Clocked In" value={stats.working} color="text-[var(--color-success)]" />
        <StatCard label="Late" value={stats.late} color="text-[var(--color-danger)]" />
        <StatCard label="On Break" value={stats.onBreak} color="text-[var(--color-warning)]" />
        <StatCard label="No Show" value={stats.noShow} color="text-[var(--color-danger)]" />
      </div>

      {/* Edited hint — 헤더에서 다 못 전한 보조 정보만. */}
      {stats.edited > 0 && (
        <div className="flex items-center justify-end mb-3">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-[var(--color-warning)]/40 bg-[var(--color-warning-muted)]">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-warning)]" />
            <span className="text-[11px] font-semibold text-[var(--color-warning)]">
              {stats.edited} edited
            </span>
          </div>
        </div>
      )}

      {/* Grid */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl overflow-x-auto">
        <table className="w-full border-collapse min-w-[900px]">
          <thead>
            <tr className="border-b-2 border-[var(--color-border)] bg-[var(--color-bg)]">
              <th className="text-left px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-[var(--color-text-muted)] sticky left-0 bg-[var(--color-bg)] z-10 min-w-[180px] border-r-2 border-[var(--color-border)]">
                Employee
              </th>
              {days.map((d, i) => {
                const [, mm, dd] = d.split("-");
                const isLast = i === days.length - 1;
                return (
                  <th
                    key={d}
                    className={`text-center px-2 py-2.5 text-[11px] font-bold uppercase tracking-wider text-[var(--color-text-muted)] min-w-[120px] ${
                      isLast ? "" : "border-r border-[var(--color-border)]"
                    }`}
                  >
                    <div className="flex flex-col leading-tight">
                      <span>{WEEKDAY_LABELS[i]}</span>
                      <span className="text-[10px] font-normal text-[var(--color-text-muted)] tabular-nums">{mm}/{dd}</span>
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !attendancesQ.isLoading && !usersQ.isLoading && (
              <tr>
                <td
                  colSpan={8}
                  className="text-center py-12 text-[12px] text-[var(--color-text-muted)] italic"
                >
                  No staff assigned to this store
                </td>
              </tr>
            )}
            {rows.map((row, rowIdx) => {
              const initials =
                (row.user_name || "??")
                  .split(/\s+/)
                  .slice(0, 2)
                  .map((s) => s[0] ?? "")
                  .join("")
                  .toUpperCase() || "??";
              // 짝수/홀수 row 미세한 background 차이 — 행 구분 강화.
              const rowBg = rowIdx % 2 === 1 ? "bg-[var(--color-bg)]/30" : "";
              return (
                <tr
                  key={row.user_id}
                  className={`border-b border-[var(--color-border)] last:border-b-0 align-top hover:bg-[var(--color-surface-hover)]/50 transition-colors ${rowBg}`}
                >
                  <td className="px-4 py-2 sticky left-0 z-10 bg-[var(--color-surface)] border-r-2 border-[var(--color-border)]">
                    <div className="flex items-center gap-2.5">
                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 bg-[var(--color-success-muted)] text-[var(--color-success)]">
                        {initials}
                      </div>
                      <div className="text-[12.5px] font-semibold text-[var(--color-text)] truncate max-w-[140px]">
                        {row.user_name}
                      </div>
                    </div>
                  </td>
                  {days.map((d, i) => {
                    const items = row.perDay.get(d) ?? [];
                    const isLastCol = i === days.length - 1;
                    return (
                      <td
                        key={d}
                        className={`px-1.5 py-1.5 align-top ${
                          isLastCol ? "" : "border-r border-[var(--color-border)]"
                        }`}
                      >
                        {items.length === 0 ? (
                          <OffCell />
                        ) : (
                          <div className="flex flex-col gap-1">
                            {items.map((att) => (
                              <DayCell
                                key={att.id}
                                attendance={att}
                                onClick={() => router.push(`/attendances/${att.id}?from=${d}`)}
                              />
                            ))}
                          </div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DayCell({
  attendance,
  onClick,
}: {
  attendance: Attendance;
  onClick: () => void;
}) {
  const meta = stateMeta[attendance.status] ?? stateMeta.upcoming;
  const inT = attendance.clock_in_display ?? formatHHmm24(attendance.clock_in);
  const outT = attendance.clock_out_display ?? formatHHmm24(attendance.clock_out);
  const schedIn =
    attendance.scheduled_start_display ?? formatHHmm24(attendance.scheduled_start);
  const schedOut =
    attendance.scheduled_end_display ?? formatHHmm24(attendance.scheduled_end);
  const hasCorrection = (attendance.correction_count ?? 0) > 0;
  const late = isLate(attendance);
  const noShow = attendance.status === "no_show";
  const cancelled = attendance.status === "cancelled";

  const showActual = !!inT || !!outT;
  const displayIn = inT ?? (schedIn ? schedIn : "—");
  const displayOut = outT ?? (schedOut ? schedOut : "—");
  const timeMuted = !showActual;

  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative w-full text-left rounded-md px-2 py-1.5 transition-colors hover:brightness-110 ${meta.bg} ${meta.ring} ${cancelled ? "opacity-60" : ""}`}
    >
      {hasCorrection && (
        <span
          className="absolute top-1 right-1 w-2 h-2 rounded-full bg-[var(--color-warning)] ring-2 ring-[var(--color-surface)]"
          title={`Edited ${attendance.correction_count} time(s)`}
        />
      )}

      <div className="flex items-center gap-1 mb-0.5">
        <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
        <span
          className={`text-[10px] font-bold uppercase tracking-wider ${
            hasCorrection
              ? "text-[var(--color-warning)]"
              : "text-[var(--color-text-secondary)]"
          }`}
        >
          {meta.label}
        </span>
      </div>

      <div
        className={`text-[12px] tabular-nums leading-tight ${
          timeMuted
            ? "text-[var(--color-text-muted)]"
            : hasCorrection
              ? "text-[var(--color-warning)] font-semibold"
              : "text-[var(--color-text)] font-semibold"
        }`}
      >
        {displayIn} <span className="text-[var(--color-text-muted)]">→</span> {displayOut}
      </div>

      {(late || noShow) && (
        <div className="flex flex-wrap gap-0.5 mt-1">
          {late && (
            <span className="inline-flex items-center px-1 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide bg-[var(--color-danger)] text-white">
              Late
            </span>
          )}
          {noShow && (
            <span className="inline-flex items-center px-1 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide bg-[var(--color-danger)] text-white">
              No show
            </span>
          )}
        </div>
      )}
    </button>
  );
}

function OffCell() {
  return (
    <div className="flex items-center justify-center h-[58px] rounded-md border border-dashed border-[var(--color-border)] text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
      Off
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl px-4 py-3">
      <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">{label}</div>
      <div className={`text-[24px] font-bold mt-1 tabular-nums ${color}`}>{value}</div>
    </div>
  );
}
