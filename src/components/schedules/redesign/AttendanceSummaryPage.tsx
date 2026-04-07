"use client";

/**
 * AttendanceSummaryPage — server attendances + users 데이터를 클라이언트에서 주간 집계.
 *
 * Server에 summary endpoint가 없으므로 useAttendances로 한 주 데이터 fetch 후
 * user × day 매트릭스로 집계.
 */

import { useState, useMemo, useEffect } from "react";
import { useAttendances } from "@/hooks/useAttendances";
import { useStores } from "@/hooks/useStores";
import { useUsers } from "@/hooks/useUsers";
import type { Attendance, User } from "@/types";

function getWeekStart(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  r.setDate(r.getDate() - r.getDay());
  return r;
}

function buildWeekDates(weekStart: Date): { date: string; dayName: string; dayNum: string }[] {
  const out: { date: string; dayName: string; dayNum: string }[] = [];
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    out.push({
      date: `${yyyy}-${mm}-${dd}`,
      dayName: dayNames[i]!,
      dayNum: String(d.getDate()),
    });
  }
  return out;
}

function formatHours(min: number | null | undefined): string {
  if (!min) return "—";
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h${m}m`;
}

function getInitials(name: string | null | undefined): string {
  if (!name) return "??";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "??";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return ((parts[0]![0] ?? "") + (parts[parts.length - 1]![0] ?? "")).toUpperCase();
}

function rolePriorityToColorClass(p: number): string {
  if (p <= 20) return "bg-[var(--color-accent-muted)] text-[var(--color-accent)]";
  if (p <= 30) return "bg-[var(--color-warning-muted)] text-[var(--color-warning)]";
  return "bg-[var(--color-success-muted)] text-[var(--color-success)]";
}

export function AttendanceSummaryPage() {
  const [selectedStore, setSelectedStore] = useState<string>("");
  const [weekStart, setWeekStart] = useState<Date>(() => getWeekStart(new Date()));
  const weekDates = useMemo(() => buildWeekDates(weekStart), [weekStart]);

  const storesQ = useStores();
  const usersQ = useUsers();
  const stores = storesQ.data ?? [];
  const users = usersQ.data ?? [];

  // 첫 store 자동 선택
  useEffect(() => {
    if (selectedStore === "" && stores.length > 0) {
      setSelectedStore(stores[0]!.id);
    }
  }, [stores, selectedStore]);

  const dateFrom = weekDates[0]?.date;
  const dateTo = weekDates[6]?.date;
  const attendancesQ = useAttendances({
    store_id: selectedStore || undefined,
    date_from: dateFrom,
    date_to: dateTo,
    per_page: 500,
  });
  const records: Attendance[] = attendancesQ.data?.items ?? [];

  // user × date 매트릭스
  const matrix = useMemo(() => {
    const map = new Map<string, Map<string, Attendance>>();
    records.forEach((r) => {
      if (!map.has(r.user_id)) map.set(r.user_id, new Map());
      map.get(r.user_id)!.set(r.work_date, r);
    });
    return map;
  }, [records]);

  const usersInWeek = useMemo(() => {
    const ids = new Set(records.map((r) => r.user_id));
    return users.filter((u) => ids.has(u.id));
  }, [records, users]);

  // Stat cards
  const stats = useMemo(() => {
    const totalMinutes = records.reduce((s, r) => s + (r.net_work_minutes ?? r.total_work_minutes ?? 0), 0);
    const totalShifts = records.length;
    const totalLate = records.filter((r) => r.status === "late" || (r.anomalies ?? []).includes("late")).length;
    const totalNoShow = records.filter((r) => r.status === "no_show").length;
    return {
      totalHours: Math.round(totalMinutes / 60),
      totalShifts,
      totalLate,
      totalNoShow,
    };
  }, [records]);

  function shiftWeek(weeks: number) {
    const next = new Date(weekStart);
    next.setDate(next.getDate() + weeks * 7);
    setWeekStart(next);
  }

  function exportCSV() {
    const header = ["Employee", ...weekDates.map((d) => `${d.dayName} ${d.dayNum}`), "Total"];
    const rows: string[][] = [header];
    usersInWeek.forEach((u: User) => {
      const userMap = matrix.get(u.id);
      if (!userMap) return;
      const cells: string[] = [u.full_name || u.username];
      let totalMin = 0;
      weekDates.forEach((d) => {
        const att = userMap.get(d.date);
        const min = att?.net_work_minutes ?? att?.total_work_minutes ?? 0;
        totalMin += min;
        cells.push(min ? formatHours(min) : "");
      });
      cells.push(formatHours(totalMin));
      rows.push(cells);
    });
    const csv = rows.map((r) => r.map((c) => `"${c.replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `attendance_summary_${dateFrom}_${dateTo}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 pt-4 pb-1">
        <select
          value={selectedStore}
          onChange={(e) => setSelectedStore(e.target.value)}
          className="px-3 py-1.5 bg-white border-2 border-[var(--color-accent)] rounded-lg text-[13px] font-semibold text-[var(--color-accent)] cursor-pointer"
        >
          {stores.length === 0 && <option value="">Loading…</option>}
          {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <span className="text-[12px] text-[var(--color-text-muted)]">Weekly attendance summary</span>
      </div>

      <div className="flex items-center justify-between py-2 gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <h1 className="text-[22px] font-semibold text-[var(--color-text)]">Attendance Summary</h1>
          {attendancesQ.isLoading && <span className="text-[11px] text-[var(--color-text-muted)]">Loading…</span>}
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => shiftWeek(-1)} className="w-8 h-8 rounded-lg border border-[var(--color-border)] bg-white flex items-center justify-center text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]" aria-label="Previous week">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="9 11 5 7 9 3" /></svg>
          </button>
          <span className="text-[13px] font-semibold text-[var(--color-text)] min-w-[160px] text-center">
            {weekDates[0]?.dayName} {weekDates[0]?.dayNum} – {weekDates[6]?.dayName} {weekDates[6]?.dayNum}
          </span>
          <button type="button" onClick={() => shiftWeek(1)} className="w-8 h-8 rounded-lg border border-[var(--color-border)] bg-white flex items-center justify-center text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]" aria-label="Next week">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="5 3 9 7 5 11" /></svg>
          </button>
          <button
            type="button"
            onClick={exportCSV}
            className="ml-2 px-3 py-1.5 rounded-lg text-[13px] font-semibold border border-[var(--color-border)] bg-white text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]"
          >
            Export CSV
          </button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <StatCard label="Total Hours" value={stats.totalHours.toString() + "h"} color="text-[var(--color-success)]" />
        <StatCard label="Total Shifts" value={stats.totalShifts.toString()} color="text-[var(--color-text)]" />
        <StatCard label="Late Arrivals" value={stats.totalLate.toString()} color="text-[var(--color-danger)]" />
        <StatCard label="No Shows" value={stats.totalNoShow.toString()} color="text-[var(--color-danger)]" />
      </div>

      {/* Matrix table */}
      <div className="bg-white border border-[var(--color-border)] rounded-xl overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
              <th className="text-left px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-[var(--color-text-muted)] sticky left-0 bg-[var(--color-bg)]">Employee</th>
              {weekDates.map((d) => (
                <th key={d.date} className="text-center px-3 py-2.5 text-[11px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
                  {d.dayName} {d.dayNum}
                </th>
              ))}
              <th className="text-right px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">Total</th>
            </tr>
          </thead>
          <tbody>
            {usersInWeek.length === 0 && !attendancesQ.isLoading && (
              <tr>
                <td colSpan={weekDates.length + 2} className="text-center py-12 text-[12px] text-[var(--color-text-muted)] italic">
                  No attendance records for this week
                </td>
              </tr>
            )}
            {usersInWeek.map((u: User) => {
              const userMap = matrix.get(u.id);
              let totalMin = 0;
              return (
                <tr key={u.id} className="border-b border-[var(--color-border)] last:border-b-0 hover:bg-[var(--color-surface-hover)]">
                  <td className="px-4 py-3 sticky left-0 bg-white">
                    <div className="flex items-center gap-2.5">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${rolePriorityToColorClass(u.role_priority)}`}>{getInitials(u.full_name)}</div>
                      <div className="min-w-0">
                        <div className="text-[13px] font-semibold text-[var(--color-text)] truncate">{u.full_name || u.username}</div>
                      </div>
                    </div>
                  </td>
                  {weekDates.map((d) => {
                    const att = userMap?.get(d.date);
                    const min = att?.net_work_minutes ?? att?.total_work_minutes ?? 0;
                    totalMin += min;
                    const isAnomaly = att && (att.status === "late" || att.status === "no_show" || (att.anomalies && att.anomalies.length > 0));
                    return (
                      <td key={d.date} className="text-center px-3 py-3">
                        {att ? (
                          <div className={`text-[12px] font-semibold tabular-nums ${isAnomaly ? "text-[var(--color-danger)]" : "text-[var(--color-text)]"}`}>
                            {att.status === "no_show" ? "—" : formatHours(min)}
                          </div>
                        ) : (
                          <div className="text-[11px] text-[var(--color-text-muted)]">—</div>
                        )}
                      </td>
                    );
                  })}
                  <td className="text-right px-4 py-3 text-[13px] font-bold tabular-nums text-[var(--color-success)]">
                    {formatHours(totalMin)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="bg-white border border-[var(--color-border)] rounded-xl px-4 py-3">
      <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">{label}</div>
      <div className={`text-[24px] font-bold mt-1 tabular-nums ${color}`}>{value}</div>
    </div>
  );
}
