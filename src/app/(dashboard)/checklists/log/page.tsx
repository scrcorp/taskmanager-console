"use client";

/**
 * Checklist Logs 페이지 — 체크리스트 관련 전체 활동 로그.
 * (기존 /schedules/log에서 이동)
 *
 * 로그 타입: Completed, Review(pass/fail), Reject, Re-submit, Score
 * 필터: Type, Store, Staff, Date Range, Search
 * 테이블: Type | Date/Time | Staff | Role | Description | By
 */

import React, { useMemo, Suspense } from "react";
import { Search, ChevronUp, ChevronDown } from "lucide-react";
import { useStores } from "@/hooks/useStores";
import { useCompletionLog } from "@/hooks/useCompletionLog";
import type { CompletionLogEntry } from "@/hooks/useCompletionLog";
import { usePermissions } from "@/hooks/usePermissions";
import { usePersistedFilters } from "@/hooks/usePersistedFilters";
import { PERMISSIONS } from "@/lib/permissions";
import { Card, Badge, Pagination, EmptyState, LoadingSpinner } from "@/components/ui";
import { useTimezone } from "@/hooks/useTimezone";
import { formatDateTime, todayInTimezone } from "@/lib/utils";

// ─── Log types ───────────────────────────────────

interface LogType {
  key: string;
  label: string;
  variant: "success" | "danger" | "warning" | "accent" | "default";
}

const LOG_TYPES: LogType[] = [
  { key: "approved", label: "Approved", variant: "success" },
  { key: "rejected", label: "Rejected", variant: "danger" },
  { key: "modified", label: "Modified", variant: "warning" },
  { key: "completed", label: "Completed", variant: "success" },
  { key: "evaluation", label: "Evaluation", variant: "accent" },
  { key: "shift_complete", label: "Shift Done", variant: "default" },
];

const LOG_TYPE_MAP: Record<string, LogType> = {};
LOG_TYPES.forEach((t) => { LOG_TYPE_MAP[t.key] = t; });

// ─── Normalized log entry ────────────────────────

interface LogEntry {
  id: string;
  type: string;
  timestamp: string;
  userName: string;
  storeName: string;
  role: string;
  description: string;
  actor: string;
}

// ─── Sort state ──────────────────────────────────

type SortDir = "asc" | "desc" | null;
interface SortState {
  key: string;
  dir: SortDir;
}

function SortArrows({ active, dir }: { active: boolean; dir: SortDir }) {
  return (
    <span className="inline-flex flex-col ml-1 -space-y-1">
      <ChevronUp className={`h-3 w-3 ${active && dir === "asc" ? "text-accent" : "text-text-muted/40"}`} />
      <ChevronDown className={`h-3 w-3 ${active && dir === "desc" ? "text-accent" : "text-text-muted/40"}`} />
    </span>
  );
}

// ─── Date filter presets ─────────────────────────

type DatePreset = "today" | "this_week" | "last_week" | "this_month" | "all" | "custom";

/** YYYY-MM-DD 로 로컬 캘린더 날짜 포맷 — timezone 변환 없음. */
function fmtLocalYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** 매장/조직 timezone 의 "오늘" 을 캘린더 Date 로 환원. 이후 산술은 캘린더 산술. */
function todayAsLocalDate(tz: string | undefined): Date {
  const [y, m, d] = todayInTimezone(tz).split("-").map(Number);
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

function getToday(tz: string | undefined): string {
  return todayInTimezone(tz);
}

function getWeekRange(offset: number, tz: string | undefined): { from: string; to: string } {
  const today = todayAsLocalDate(tz);
  const dayOfWeek = today.getDay();
  const monday = new Date(today);
  monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1) + offset * 7);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { from: fmtLocalYMD(monday), to: fmtLocalYMD(sunday) };
}

function getMonthRange(tz: string | undefined): { from: string; to: string } {
  const today = todayAsLocalDate(tz);
  const first = new Date(today.getFullYear(), today.getMonth(), 1);
  const last = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  return { from: fmtLocalYMD(first), to: fmtLocalYMD(last) };
}

// ─── Component ───────────────────────────────────

function ScheduleLogsContent(): React.ReactElement {
  const { hasPermission } = usePermissions();
  const tz = useTimezone();

  // URL + localStorage 영속 필터
  const [params, setParams] = usePersistedFilters("checklists.log", {
    type: "all",
    store: "",
    preset: "today",
    from: "",
    to: "",
    q: "",
    sort_key: "timestamp",
    sort_dir: "desc",
    page: "1",
  });
  const typeFilter = params.type;
  const storeFilter = params.store;
  const datePreset = params.preset as DatePreset;
  const customFrom = params.from;
  const customTo = params.to;
  const searchQuery = params.q;
  const sort: SortState = { key: params.sort_key, dir: params.sort_dir as "asc" | "desc" };
  const page = Math.max(1, Number(params.page) || 1);
  const perPage = 15;

  const setTypeFilter = (v: string): void => setParams({ type: v === "all" ? null : v, page: null });
  const setStoreFilter = (v: string): void => setParams({ store: v || null, page: null });
  const setDatePreset = (v: DatePreset): void => setParams({ preset: v === "today" ? null : v, page: null });
  const setCustomFrom = (v: string): void => setParams({ from: v || null, page: null });
  const setCustomTo = (v: string): void => setParams({ to: v || null, page: null });
  const setSearchQuery = (v: string): void => setParams({ q: v || null, page: null });
  const setSort = (next: SortState | ((prev: SortState) => SortState)): void => {
    const resolved = typeof next === "function" ? next(sort) : next;
    setParams({ sort_key: resolved.key, sort_dir: resolved.dir });
  };
  const setPage = (n: number): void => setParams({ page: n === 1 ? null : String(n) });

  // Data
  const { data: stores } = useStores();

  // Build date range from preset
  const dateRange = useMemo(() => {
    if (datePreset === "today") { const d = getToday(tz); return { from: d, to: d }; }
    if (datePreset === "this_week") return getWeekRange(0, tz);
    if (datePreset === "last_week") return getWeekRange(-1, tz);
    if (datePreset === "this_month") return getMonthRange(tz);
    if (datePreset === "custom") return { from: customFrom || undefined, to: customTo || undefined };
    return { from: undefined, to: undefined };
  }, [datePreset, customFrom, customTo, tz]);

  const { data: logData, isLoading } = useCompletionLog({
    store_id: storeFilter || undefined,
    date_from: dateRange.from,
    date_to: dateRange.to,
    page: 1,
    per_page: 500,
  });

  // Normalize completion log entries into LogEntry format
  // For now, all entries from the completion log are "completed" type.
  // Future: multiple log sources will provide different types.
  const normalizedLogs: LogEntry[] = useMemo(() => {
    const items = logData?.items ?? [];
    return items.map((item: CompletionLogEntry & { id: string }) => ({
      id: item.id,
      type: "completed",
      timestamp: item.completed_at ?? item.work_date,
      userName: item.user_name,
      storeName: item.store_name,
      role: item.item_title ?? "",
      description: item.note ? `Checklist completed — ${item.note}` : "Checklist item completed",
      actor: item.user_name?.split(" ")[0] ?? "Staff",
    }));
  }, [logData]);

  // Apply filters
  const filteredLogs = useMemo(() => {
    let result = normalizedLogs;

    if (typeFilter !== "all") {
      result = result.filter((l) => l.type === typeFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter((l) =>
        [l.userName, l.description, l.actor, l.role, l.storeName, LOG_TYPE_MAP[l.type]?.label ?? ""]
          .join(" ")
          .toLowerCase()
          .includes(q),
      );
    }

    return result;
  }, [normalizedLogs, typeFilter, searchQuery]);

  // Sort
  const sortedLogs = useMemo(() => {
    if (!sort.key || !sort.dir) return filteredLogs;
    const rows = [...filteredLogs];
    rows.sort((a, b) => {
      const aVal = (a as unknown as Record<string, unknown>)[sort.key] as string ?? "";
      const bVal = (b as unknown as Record<string, unknown>)[sort.key] as string ?? "";
      const cmp = aVal.localeCompare(bVal);
      return sort.dir === "asc" ? cmp : -cmp;
    });
    return rows;
  }, [filteredLogs, sort]);

  // Paginate
  const totalPages = Math.max(1, Math.ceil(sortedLogs.length / perPage));
  const pageItems = sortedLogs.slice((page - 1) * perPage, page * perPage);

  const handleSort = (key: string) => {
    setSort((prev) => {
      if (prev.key !== key) return { key, dir: "asc" };
      if (prev.dir === "asc") return { key, dir: "desc" };
      return { key: "", dir: null };
    });
  };

  if (!hasPermission(PERMISSIONS.CHECKLIST_LOG_READ)) {
    return (
      <div className="text-center py-12">
        <p className="text-text-secondary">You do not have permission to view this page.</p>
      </div>
    );
  }

  const columns = [
    { key: "type", header: "Type", sortable: true },
    { key: "timestamp", header: "Date / Time", sortable: true },
    { key: "userName", header: "Staff", sortable: true },
    { key: "role", header: "Role", sortable: true },
    { key: "description", header: "Description", sortable: false },
    { key: "actor", header: "By", sortable: false },
  ];

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-text">Schedule Logs</h1>
        <p className="text-sm text-text-muted mt-0.5">All schedule-related activity records</p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2.5 mb-4">
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="px-2.5 py-1.5 text-xs font-medium bg-surface border border-border rounded-lg text-text-secondary focus:border-accent focus:ring-1 focus:ring-accent outline-none"
        >
          <option value="all">All Types</option>
          {LOG_TYPES.map((t) => (
            <option key={t.key} value={t.key}>{t.label}</option>
          ))}
        </select>

        <select
          value={storeFilter}
          onChange={(e) => setStoreFilter(e.target.value)}
          className="px-2.5 py-1.5 text-xs font-medium bg-surface border border-border rounded-lg text-text-secondary focus:border-accent focus:ring-1 focus:ring-accent outline-none"
        >
          <option value="">All Stores</option>
          {(stores ?? []).map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>

        <select
          value={datePreset}
          onChange={(e) => setDatePreset(e.target.value as DatePreset)}
          className="px-2.5 py-1.5 text-xs font-medium bg-surface border border-border rounded-lg text-text-secondary focus:border-accent focus:ring-1 focus:ring-accent outline-none"
        >
          <option value="today">Today</option>
          <option value="this_week">This Week</option>
          <option value="last_week">Last Week</option>
          <option value="this_month">This Month</option>
          <option value="all">All</option>
          <option value="custom">Custom</option>
        </select>

        {datePreset === "custom" && (
          <>
            <input
              type="date"
              value={customFrom}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="px-2.5 py-1.5 text-xs bg-surface border border-border rounded-lg text-text-secondary focus:border-accent focus:ring-1 focus:ring-accent outline-none"
            />
            <span className="text-xs text-text-muted">~</span>
            <input
              type="date"
              value={customTo}
              onChange={(e) => setCustomTo(e.target.value)}
              className="px-2.5 py-1.5 text-xs bg-surface border border-border rounded-lg text-text-secondary focus:border-accent focus:ring-1 focus:ring-accent outline-none"
            />
          </>
        )}

        <div className="relative">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search logs..."
            className="pl-8 pr-3 py-1.5 text-xs bg-surface border border-border rounded-lg text-text focus:border-accent focus:ring-1 focus:ring-accent outline-none min-w-[180px]"
          />
        </div>

        <span className="text-xs text-text-muted ml-auto">
          {sortedLogs.length} entries
        </span>
      </div>

      {/* Table */}
      <Card padding="p-0">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <LoadingSpinner size="lg" />
          </div>
        ) : pageItems.length === 0 ? (
          <EmptyState message="No logs match your filters." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-surface">
                  {columns.map((col) => (
                    <th
                      key={col.key}
                      onClick={col.sortable ? () => handleSort(col.key) : undefined}
                      className={`px-3 py-2.5 text-left text-[11px] font-semibold text-text-muted uppercase tracking-wider whitespace-nowrap ${col.sortable ? "cursor-pointer select-none hover:text-text-secondary" : ""}`}
                    >
                      <span className="inline-flex items-center">
                        {col.header}
                        {col.sortable && (
                          <SortArrows active={sort.key === col.key} dir={sort.key === col.key ? sort.dir : null} />
                        )}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageItems.map((log) => {
                  const logType = LOG_TYPE_MAP[log.type] ?? LOG_TYPES[0];
                  return (
                    <tr key={log.id} className="border-b border-border/50 hover:bg-surface-hover transition-colors">
                      <td className="px-3 py-2.5">
                        <Badge variant={logType.variant}>{logType.label}</Badge>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-text-secondary whitespace-nowrap">
                        {log.timestamp ? formatDateTime(log.timestamp, tz) : "—"}
                      </td>
                      <td className="px-3 py-2.5 text-sm text-text">{log.userName}</td>
                      <td className="px-3 py-2.5 text-xs text-text-muted">{log.role}</td>
                      <td className="px-3 py-2.5 text-sm text-text-secondary">{log.description}</td>
                      <td className="px-3 py-2.5 text-xs text-text-muted">{log.actor}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4">
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </div>
      )}
    </div>
  );
}

export default function ScheduleLogsPage(): React.ReactElement {
  return (
    <Suspense>
      <ScheduleLogsContent />
    </Suspense>
  );
}
