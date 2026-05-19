"use client";

/**
 * Daily Reports 목록 뷰 — 필터(매장/기간/날짜) + 카드 리스트 + Pagination.
 *
 * 헤더는 옵션. `/reports?type=daily` 와 `/daily-reports` 양쪽에서 재사용.
 */

import React, { useEffect, useMemo, Suspense } from "react";
import { useRouter } from "next/navigation";
import { FileText, MapPin, Calendar, User, MessageSquare, Settings } from "lucide-react";
import { useDailyReports } from "@/hooks/useDailyReports";
import { useStores } from "@/hooks/useStores";
import { useAlerts } from "@/hooks/useAlerts";
import { usePersistedFilters } from "@/hooks/usePersistedFilters";
import { useTimezone } from "@/hooks/useTimezone";
import {
  Button,
  Card,
  Badge,
  LoadingSpinner,
  Pagination,
} from "@/components/ui";
import { DateField } from "@/components/ui/DateField";
import type { DailyReport, Store } from "@/types";
import { cn, formatFixedDate, todayInTimezone } from "@/lib/utils";

// ── Date range presets ─────────────────────────────────────────────
// days=null → 전체(빈 range). 그 외엔 today 기준으로 today-days ~ today.

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

function presetRange(preset: DatePreset, today: string): { from: string; to: string } {
  if (preset.days === null) return { from: "", to: "" };
  return { from: addDays(today, -preset.days), to: today };
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

const periodOptions: { value: string; label: string }[] = [
  { value: "", label: "All Periods" },
  { value: "lunch", label: "Lunch" },
  { value: "dinner", label: "Dinner" },
];

const statusBadge: Record<
  string,
  { label: string; variant: "success" | "warning" | "default" }
> = {
  submitted: { label: "Submitted", variant: "success" },
};

const periodBadge: Record<string, { label: string; variant: "accent" | "default" }> = {
  lunch: { label: "Lunch", variant: "accent" },
  dinner: { label: "Dinner", variant: "default" },
};

const PER_PAGE = 20;

interface Props {
  /** 페이지 헤더 표시 여부 (기본 true). */
  showHeader?: boolean;
  /** URL 필터 상태 키 — 통합 페이지에서 다른 탭의 필터와 분리하려면 다른 키 사용 가능. */
  filterKey?: string;
}

function DailyReportsListBody({
  showHeader,
  filterKey,
}: Required<Props>): React.ReactElement {
  const router = useRouter();
  const orgTz = useTimezone();
  const today = todayInTimezone(orgTz);

  const [urlParams, setUrlParams] = usePersistedFilters(filterKey, {
    store: "",
    period: "",
    from: "",
    to: "",
    page: "1",
  });
  const selectedStoreId = urlParams.store;
  const selectedPeriod = urlParams.period;
  const dateFrom = urlParams.from;
  const dateTo = urlParams.to;
  const page = Math.max(1, Number(urlParams.page) || 1);

  // 진입 시 from/to 비어있으면 오늘로 자동 적용 (org timezone 기준)
  useEffect(() => {
    if (!dateFrom && !dateTo) {
      setUrlParams({ from: today, to: today, page: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today]);

  const setSelectedStoreId = (v: string): void =>
    setUrlParams({ store: v || null, page: null });
  const setSelectedPeriod = (v: string): void =>
    setUrlParams({ period: v || null, page: null });
  const setDateFrom = (v: string): void => setUrlParams({ from: v || null, page: null });
  const setDateTo = (v: string): void => setUrlParams({ to: v || null, page: null });
  const setPage = (next: number): void =>
    setUrlParams({ page: next === 1 ? null : String(next) });

  const { data: stores } = useStores();
  const { data: reportsData, isLoading } = useDailyReports({
    store_id: selectedStoreId || undefined,
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
    period: selectedPeriod || undefined,
    status: "submitted",
    page,
    per_page: PER_PAGE,
  });

  const reports: DailyReport[] = reportsData?.items ?? [];

  // Unread alerts → reference_id set (daily_report 만). issue list 와 동일 패턴.
  const { data: alertsData } = useAlerts(1, 100);
  const unreadReportIds = useMemo(() => {
    const set = new Set<string>();
    (alertsData?.items ?? []).forEach((a) => {
      if (
        !a.is_read &&
        a.reference_type === "daily_report" &&
        a.reference_id
      ) {
        set.add(a.reference_id);
      }
    });
    return set;
  }, [alertsData]);
  const total: number = reportsData?.total ?? 0;
  const totalPages: number = Math.max(1, Math.ceil(total / PER_PAGE));

  const activeStores: Store[] = useMemo(
    () => (stores ?? []).filter((s: Store) => s.is_active),
    [stores],
  );

  const activePreset = useMemo(
    () => detectActivePreset(dateFrom, dateTo, today),
    [dateFrom, dateTo, today],
  );

  return (
    <div>
      {showHeader && (
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold text-text">Daily Reports</h1>
            <p className="text-sm text-text-muted mt-0.5">
              View daily reports submitted by staff
            </p>
          </div>
          <Button
            variant="ghost"
            onClick={() => router.push("/reports/templates?type=daily")}
            className="gap-2"
          >
            <Settings className="w-4 h-4" />
            Manage templates
          </Button>
        </div>
      )}

      {/* Filter bar — store + period */}
      <div className="flex flex-col md:flex-row md:items-center gap-3 mb-3">
        <select
          value={selectedStoreId}
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
            setSelectedStoreId(e.target.value);
          }}
          className="px-3 py-2 text-sm bg-surface border border-border rounded-lg text-text focus:outline-none focus:ring-1 focus:ring-accent"
        >
          <option value="">All Stores</option>
          {activeStores.map((store: Store) => (
            <option key={store.id} value={store.id}>
              {store.name}
            </option>
          ))}
        </select>

        <select
          value={selectedPeriod}
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
            setSelectedPeriod(e.target.value);
          }}
          className="px-3 py-2 text-sm bg-surface border border-border rounded-lg text-text focus:outline-none focus:ring-1 focus:ring-accent"
        >
          {periodOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Date range — preset chips + custom calendar */}
      <Card padding="p-3" className="mb-4">
        <div className="flex flex-wrap items-center gap-2">
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
                  setUrlParams({
                    from: r.from || null,
                    to: r.to || null,
                    page: null,
                  });
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
              onChange={setDateFrom}
              fallbackDate={today}
              placeholder="From"
            />
            <span className="text-text-muted text-sm">–</span>
            <DateField
              value={dateTo}
              onChange={setDateTo}
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
      </Card>

      {/* Report list */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <LoadingSpinner size="lg" />
        </div>
      ) : reports.length === 0 ? (
        <Card padding="p-16">
          <div className="text-center">
            <FileText
              size={40}
              className="mx-auto mb-3 text-text-muted opacity-50"
            />
            <p className="text-sm text-text-muted">No daily reports found.</p>
          </div>
        </Card>
      ) : (
        <div className="space-y-2">
          {reports.map((report: DailyReport) => {
            const sBadge = statusBadge[report.status] ?? statusBadge.draft;
            const pBadge = periodBadge[report.period] ?? periodBadge.lunch;
            const isUnread = unreadReportIds.has(report.id);
            return (
              <Card
                key={report.id}
                padding="p-4"
                className={cn(
                  "cursor-pointer hover:border-accent/50 transition-colors relative",
                  isUnread && "border-accent/50",
                )}
                onClick={() => router.push(`/daily-reports/${report.id}`)}
              >
                {isUnread && (
                  <span
                    aria-label="Unread"
                    title="Unread"
                    className="absolute top-3 right-3 w-2.5 h-2.5 rounded-full bg-danger ring-2 ring-card"
                  />
                )}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 flex-1 min-w-0">
                    {/* Date */}
                    <div className="flex items-center gap-2">
                      <Calendar size={15} className="text-text-muted shrink-0" />
                      <span
                        className={cn(
                          "text-base text-text",
                          isUnread ? "font-bold" : "font-semibold",
                        )}
                      >
                        {formatFixedDate(report.report_date)}
                      </span>
                    </div>

                    {/* Period */}
                    <Badge variant={pBadge.variant}>{pBadge.label}</Badge>

                    {/* Store */}
                    <div className="flex items-center gap-1.5">
                      <MapPin size={13} className="text-text-muted shrink-0" />
                      <span className="text-sm text-text-secondary truncate">
                        {report.store_name || "Unknown"}
                      </span>
                    </div>

                    {/* Author */}
                    <div className="flex items-center gap-1.5">
                      <User size={13} className="text-text-muted shrink-0" />
                      <span className="text-sm text-text-secondary truncate">
                        {report.author_name || "Unknown"}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Comment count */}
                    {(report.comment_count ?? 0) > 0 && (
                      <div className="flex items-center gap-1 text-accent">
                        <MessageSquare size={14} />
                        <span className="text-sm font-medium">
                          {report.comment_count}
                        </span>
                      </div>
                    )}
                    {/* Status badge */}
                    <Badge variant={sBadge.variant}>{sBadge.label}</Badge>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-6">
          <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
        </div>
      )}
    </div>
  );
}

export function DailyReportsListView({
  showHeader = true,
  filterKey = "daily-reports",
}: Props): React.ReactElement {
  return (
    <Suspense>
      <DailyReportsListBody showHeader={showHeader} filterKey={filterKey} />
    </Suspense>
  );
}
