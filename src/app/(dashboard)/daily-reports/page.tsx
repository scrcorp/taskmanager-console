"use client";

/**
 * 일일 보고서 목록 페이지 -- 매장/날짜/기간/상태 필터가 있는 보고서 목록.
 *
 * Daily reports list page with store, date range, period, and status filters.
 */

import React, { useMemo, Suspense } from "react";
import { useRouter } from "next/navigation";
import { FileText, MapPin, Calendar, User, MessageSquare } from "lucide-react";
import { useDailyReports } from "@/hooks/useDailyReports";
import { useStores } from "@/hooks/useStores";
import { usePersistedFilters } from "@/hooks/usePersistedFilters";
import { Card, Badge, ClearButton, LoadingSpinner, Pagination } from "@/components/ui";
import type { DailyReport, Store } from "@/types";
import { formatFixedDate } from "@/lib/utils";

const periodOptions: { value: string; label: string }[] = [
  { value: "", label: "All Periods" },
  { value: "lunch", label: "Lunch" },
  { value: "dinner", label: "Dinner" },
];

const statusBadge: Record<string, { label: string; variant: "success" | "warning" | "default" }> = {
  submitted: { label: "Submitted", variant: "success" },
};

const periodBadge: Record<string, { label: string; variant: "accent" | "default" }> = {
  lunch: { label: "Lunch", variant: "accent" },
  dinner: { label: "Dinner", variant: "default" },
};

const PER_PAGE = 20;

function DailyReportsContent(): React.ReactElement {
  const router = useRouter();
  const [urlParams, setUrlParams] = usePersistedFilters("daily-reports", {
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

  const setSelectedStoreId = (v: string): void => setUrlParams({ store: v || null, page: null });
  const setSelectedPeriod = (v: string): void => setUrlParams({ period: v || null, page: null });
  const setDateFrom = (v: string): void => setUrlParams({ from: v || null, page: null });
  const setDateTo = (v: string): void => setUrlParams({ to: v || null, page: null });
  const setPage = (next: number): void => setUrlParams({ page: next === 1 ? null : String(next) });

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
  const total: number = reportsData?.total ?? 0;
  const totalPages: number = Math.max(1, Math.ceil(total / PER_PAGE));

  const activeStores: Store[] = useMemo(
    () => (stores ?? []).filter((s: Store) => s.is_active),
    [stores],
  );

  return (
    <div>
      {/* Header */}
      <div className="mb-4">
        <h1 className="text-2xl font-extrabold text-text">Daily Reports</h1>
        <p className="text-sm text-text-muted mt-0.5">
          View daily reports submitted by staff
        </p>
      </div>

      {/* Filter bar */}
      <div className="flex flex-col md:flex-row md:items-center gap-3 mb-4">
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

        <input
          type="date"
          value={dateFrom}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
            setDateFrom(e.target.value);
          }}
          className="px-3 py-2 text-sm bg-surface border border-border rounded-lg text-text focus:outline-none focus:ring-1 focus:ring-accent"
        />
        <span className="text-text-muted text-sm">–</span>
        <input
          type="date"
          value={dateTo}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
            setDateTo(e.target.value);
          }}
          className="px-3 py-2 text-sm bg-surface border border-border rounded-lg text-text focus:outline-none focus:ring-1 focus:ring-accent"
        />
        {(dateFrom || dateTo) && (
          <ClearButton onClick={() => setUrlParams({ from: null, to: null, page: null })} />
        )}
      </div>

      {/* Report list */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <LoadingSpinner size="lg" />
        </div>
      ) : reports.length === 0 ? (
        <Card padding="p-16">
          <div className="text-center">
            <FileText size={40} className="mx-auto mb-3 text-text-muted opacity-50" />
            <p className="text-sm text-text-muted">No daily reports found.</p>
          </div>
        </Card>
      ) : (
        <div className="space-y-2">
          {reports.map((report: DailyReport) => {
            const sBadge = statusBadge[report.status] ?? statusBadge.draft;
            const pBadge = periodBadge[report.period] ?? periodBadge.lunch;
            return (
              <Card
                key={report.id}
                padding="p-4"
                className="cursor-pointer hover:border-accent/50 transition-colors"
                onClick={() => router.push(`/daily-reports/${report.id}`)}
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 flex-1 min-w-0">
                    {/* Date */}
                    <div className="flex items-center gap-2">
                      <Calendar size={14} className="text-text-muted shrink-0" />
                      <span className="text-sm font-semibold text-text">
                        {formatFixedDate(report.report_date)}
                      </span>
                    </div>

                    {/* Period */}
                    <Badge variant={pBadge.variant}>{pBadge.label}</Badge>

                    {/* Store */}
                    <div className="flex items-center gap-1.5">
                      <MapPin size={12} className="text-text-muted shrink-0" />
                      <span className="text-xs text-text-secondary truncate">
                        {report.store_name || "Unknown"}
                      </span>
                    </div>

                    {/* Author */}
                    <div className="flex items-center gap-1.5">
                      <User size={12} className="text-text-muted shrink-0" />
                      <span className="text-xs text-text-secondary truncate">
                        {report.author_name || "Unknown"}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Comment count */}
                    {(report.comment_count ?? 0) > 0 && (
                      <div className="flex items-center gap-1 text-accent">
                        <MessageSquare size={13} />
                        <span className="text-xs font-medium">{report.comment_count}</span>
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

export default function DailyReportsPage(): React.ReactElement {
  return (
    <Suspense>
      <DailyReportsContent />
    </Suspense>
  );
}
