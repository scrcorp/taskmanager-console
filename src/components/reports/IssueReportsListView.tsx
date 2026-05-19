"use client";

/**
 * Issue Reports 목록 뷰 — 필터 + 카드 리스트 + Pagination.
 *
 * Standalone view. 헤더는 옵션 (통합 Reports 페이지에서는 끄고, legacy 페이지에서는 켬).
 * `/reports?type=issue` 와 `/reports/issues` 양쪽에서 재사용.
 */

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  MapPin,
  Calendar,
  MessageSquare,
  Plus,
  Settings,
  User,
} from "lucide-react";

import { useReports } from "@/hooks/useReports";
import { useStores } from "@/hooks/useStores";
import { useAlerts } from "@/hooks/useAlerts";
import { usePermissions } from "@/hooks/usePermissions";
import { useTimezone } from "@/hooks/useTimezone";
import {
  Badge,
  Button,
  Card,
  LoadingSpinner,
  Pagination,
} from "@/components/ui";
import { DateField } from "@/components/ui/DateField";
import {
  ISSUE_CATEGORIES,
  ISSUE_SEVERITIES,
  ISSUE_STATUSES,
  type IssueReportPayload,
  type Report,
  type Store,
} from "@/types";
import { cn, formatFixedDate, todayInTimezone } from "@/lib/utils";
import { PERMISSIONS } from "@/lib/permissions";

// ── Date range presets (DailyReportsListView 와 동일) ──────────────

interface DatePreset {
  key: string;
  label: string;
  days: number | null;
}

const DATE_PRESETS: DatePreset[] = [
  { key: "today", label: "Today", days: 0 },
  { key: "3days", label: "3 days", days: 2 },
  { key: "week", label: "Week", days: 6 },
  { key: "month", label: "Month", days: 29 },
  { key: "year", label: "Year", days: 364 },
  { key: "all", label: "All", days: null },
];

function addDays(iso: string, days: number): string {
  if (!iso) return iso;
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function presetRange(p: DatePreset, today: string): { from: string; to: string } {
  if (p.days === null) return { from: "", to: "" };
  return { from: addDays(today, -p.days), to: today };
}

function detectActivePreset(from: string, to: string, today: string): string {
  if (!from && !to) return "all";
  for (const p of DATE_PRESETS) {
    if (p.days === null) continue;
    const r = presetRange(p, today);
    if (r.from === from && r.to === to) return p.key;
  }
  return "custom";
}

const PER_PAGE = 20;

const statusBadge: Record<
  string,
  { label: string; variant: "warning" | "accent" | "success" | "default" }
> = {
  open: { label: "Open", variant: "warning" },
  in_progress: { label: "In Progress", variant: "accent" },
  closed: { label: "Closed", variant: "success" },
};

const severityBadge: Record<
  string,
  { label: string; variant: "default" | "warning" | "danger" | "accent" }
> = {
  low: { label: "Low", variant: "default" },
  medium: { label: "Medium", variant: "accent" },
  high: { label: "High", variant: "warning" },
  critical: { label: "Critical", variant: "danger" },
};

interface Props {
  /** 페이지 헤더(title + description + New 버튼) 표시 여부. 기본 true (legacy 페이지용). */
  showHeader?: boolean;
}

export function IssueReportsListView({
  showHeader = true,
}: Props): React.ReactElement {
  const router = useRouter();
  const { hasPermission } = usePermissions();
  const orgTz = useTimezone();
  const today = todayInTimezone(orgTz);

  const [selectedStoreId, setSelectedStoreId] = useState<string>("");
  const [selectedStatus, setSelectedStatus] = useState<string>("");
  const [selectedSeverity, setSelectedSeverity] = useState<string>("");
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [showAll, setShowAll] = useState<boolean>(false);
  const [page, setPage] = useState<number>(1);
  // 기본 진입 시 month preset (오늘 - 29일 ~ 오늘). all 모드는 사용자가 선택.
  const [dateFrom, setDateFrom] = useState<string>(() => addDays(today, -29));
  const [dateTo, setDateTo] = useState<string>(today);

  const { data: stores } = useStores();
  const { data, isLoading } = useReports({
    type: "issue",
    store_id: selectedStoreId || undefined,
    status: selectedStatus || undefined,
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
    show_all: showAll,
    page,
    per_page: PER_PAGE,
  });

  // Unread alerts → reference_id set (issue_report 만)
  const { data: alertsData } = useAlerts(1, 100);
  const unreadReportIds = useMemo(() => {
    const set = new Set<string>();
    (alertsData?.items ?? []).forEach((a) => {
      if (
        !a.is_read &&
        a.reference_type === "issue_report" &&
        a.reference_id
      ) {
        set.add(a.reference_id);
      }
    });
    return set;
  }, [alertsData]);

  const reports: Report[] = data?.items ?? [];

  // 클라이언트 필터: severity/category (서버는 jsonb 검색 없음)
  const filtered = useMemo(() => {
    return reports.filter((r) => {
      const p = (r.payload ?? {}) as Partial<IssueReportPayload>;
      if (selectedSeverity && p.severity !== selectedSeverity) return false;
      if (selectedCategory && p.category !== selectedCategory) return false;
      return true;
    });
  }, [reports, selectedSeverity, selectedCategory]);

  const total: number = data?.total ?? 0;
  const totalPages: number = Math.max(1, Math.ceil(total / PER_PAGE));

  const activeStores: Store[] = useMemo(
    () => (stores ?? []).filter((s: Store) => s.is_active !== false),
    [stores],
  );

  const canCreate = hasPermission(PERMISSIONS.REPORTS_CREATE);

  const activePreset = useMemo(
    () => detectActivePreset(dateFrom, dateTo, today),
    [dateFrom, dateTo, today],
  );

  const clearFilters = () => {
    setSelectedStoreId("");
    setSelectedStatus("");
    setSelectedSeverity("");
    setSelectedCategory("");
    setShowAll(false);
    setPage(1);
  };

  return (
    <div className="space-y-6">
      {showHeader && (
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-text">Issue Reports</h1>
            <p className="text-textSecondary text-sm mt-1">
              Operational issues raised from stores. Track, comment, and resolve.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              onClick={() => router.push("/reports/templates?type=issue")}
              className="gap-2"
            >
              <Settings className="w-4 h-4" />
              Manage templates
            </Button>
            {canCreate && (
              <Button
                onClick={() => router.push("/reports/issues/new")}
                className="gap-2"
              >
                <Plus className="w-4 h-4" />
                Report an issue
              </Button>
            )}
          </div>
        </div>
      )}

      <Card className="p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <select
            value={selectedStoreId}
            onChange={(e) => {
              setSelectedStoreId(e.target.value);
              setPage(1);
            }}
            className="bg-surface border border-border rounded-md px-3 py-2 text-sm text-text"
          >
            <option value="">All stores</option>
            {activeStores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

          <select
            value={selectedStatus}
            onChange={(e) => {
              setSelectedStatus(e.target.value);
              setPage(1);
            }}
            className="bg-surface border border-border rounded-md px-3 py-2 text-sm text-text"
          >
            <option value="">All statuses</option>
            {ISSUE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {statusBadge[s]?.label ?? s}
              </option>
            ))}
          </select>

          <select
            value={selectedSeverity}
            onChange={(e) => setSelectedSeverity(e.target.value)}
            className="bg-surface border border-border rounded-md px-3 py-2 text-sm text-text"
          >
            <option value="">All severity</option>
            {ISSUE_SEVERITIES.map((s) => (
              <option key={s} value={s}>
                {severityBadge[s]?.label ?? s}
              </option>
            ))}
          </select>

          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="bg-surface border border-border rounded-md px-3 py-2 text-sm text-text"
          >
            <option value="">All categories</option>
            {ISSUE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        {/* Date range — preset chips + custom */}
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <span className="text-xs font-semibold uppercase tracking-wide text-text-muted mr-1">
            Range
          </span>
          {DATE_PRESETS.map((p) => {
            const isActive = activePreset === p.key;
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => {
                  const r = presetRange(p, today);
                  setDateFrom(r.from);
                  setDateTo(r.to);
                  setPage(1);
                }}
                className={cn(
                  "px-3 py-1 text-xs font-medium rounded-full border transition-colors",
                  isActive
                    ? "bg-accent text-white border-accent"
                    : "bg-surface text-text-secondary border-border hover:border-accent/40 hover:text-text",
                )}
              >
                {p.label}
              </button>
            );
          })}
          <div className="ml-auto flex items-center gap-2">
            <DateField
              value={dateFrom}
              onChange={(v) => {
                setDateFrom(v);
                setPage(1);
              }}
              fallbackDate={today}
              placeholder="From"
            />
            <span className="text-text-muted text-sm">–</span>
            <DateField
              value={dateTo}
              onChange={(v) => {
                setDateTo(v);
                setPage(1);
              }}
              fallbackDate={today}
              placeholder="To"
            />
            {activePreset === "custom" && (
              <span className="text-[11px] text-accent font-medium ml-1">
                Custom
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm text-textSecondary">
            <input
              type="checkbox"
              checked={showAll}
              onChange={(e) => setShowAll(e.target.checked)}
              className="accent-accent"
            />
            Show all (override visibility)
          </label>
          <button
            type="button"
            onClick={clearFilters}
            className="text-sm text-textMuted hover:text-text"
          >
            Clear filters
          </button>
        </div>
      </Card>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <LoadingSpinner />
        </div>
      ) : filtered.length === 0 ? (
        <Card className="p-12 text-center text-textSecondary">
          <AlertTriangle className="w-10 h-10 mx-auto mb-3 opacity-50" />
          <p>No issues match your filters.</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((r) => {
            const p = (r.payload ?? {}) as Partial<IssueReportPayload>;
            const sb =
              statusBadge[r.status] ?? { label: r.status, variant: "default" as const };
            const sv = p.severity ? severityBadge[p.severity] : null;
            const isUnread = unreadReportIds.has(r.id);
            return (
              <Card
                key={r.id}
                onClick={() => router.push(`/reports/issues/${r.id}`)}
                className={cn(
                  "p-4 hover:bg-surfaceHover cursor-pointer transition-colors relative",
                  isUnread && "border-accent/50",
                )}
              >
                {isUnread && (
                  <span
                    aria-label="Unread"
                    title="Unread"
                    className="absolute top-3 right-3 w-2.5 h-2.5 rounded-full bg-danger ring-2 ring-card"
                  />
                )}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    {r.store_name && (
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-accent mb-1.5 uppercase tracking-wide">
                        <MapPin className="w-3.5 h-3.5" />
                        {r.store_name}
                      </div>
                    )}
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant={sb.variant}>{sb.label}</Badge>
                      {sv && <Badge variant={sv.variant}>{sv.label}</Badge>}
                      {p.category && (
                        <Badge variant="default">{p.category}</Badge>
                      )}
                    </div>
                    <h3
                      className={cn(
                        "text-base text-text truncate",
                        isUnread ? "font-bold" : "font-semibold",
                      )}
                    >
                      {r.title ?? "(no title)"}
                    </h3>
                    {p.description && (
                      <p className="text-textSecondary text-sm mt-1 line-clamp-2">
                        {p.description}
                      </p>
                    )}
                    <div className="flex items-center gap-4 mt-2 text-sm text-textMuted">
                      {r.author_name && (
                        <span className="flex items-center gap-1">
                          <User className="w-3.5 h-3.5" />
                          {r.author_name}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3.5 h-3.5" />
                        {formatFixedDate(r.created_at)}
                      </span>
                      {r.comment_count > 0 && (
                        <span className="flex items-center gap-1">
                          <MessageSquare className="w-3.5 h-3.5" />
                          {r.comment_count}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
      )}
    </div>
  );
}
