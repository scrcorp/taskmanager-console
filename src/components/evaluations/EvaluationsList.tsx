"use client";

import React, { useMemo } from "react";
import { Search, Star } from "lucide-react";
import type { Evaluation, Store } from "@/types";
import { useEvaluations } from "@/hooks/useEvaluations";
import { useStores } from "@/hooks/useStores";
import { Button, Badge, LoadingSpinner, Pagination } from "@/components/ui";
import { averageScore, completedCount, initials } from "./criteria";
import { fmtRange } from "./format";
import { RowMenu } from "./RowMenu";

const PER_PAGE = 20;

const trashIcon = (
  <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2.5 4h10M5.5 4V2.8a.8.8 0 01.8-.8h2.4a.8.8 0 01.8.8V4M4 4v8a1 1 0 001 1h5a1 1 0 001-1V4" />
  </svg>
);

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }): React.ReactElement {
  return (
    <div className="bg-card border border-border rounded-xl px-5 py-4 flex-1 min-w-[140px] shadow-sm">
      <div className="text-[11px] font-bold uppercase tracking-wide text-text-muted">{label}</div>
      <div className="mt-1.5 flex items-baseline gap-1.5">
        <span className="text-[28px] font-extrabold text-text leading-none">{value}</span>
        {sub && <span className="text-xs text-text-muted">{sub}</span>}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: Evaluation["status"] }): React.ReactElement {
  return status === "submitted" ? (
    <Badge variant="success">Submitted</Badge>
  ) : (
    <Badge variant="warning">Draft</Badge>
  );
}

function ScoreCell({ ev }: { ev: Evaluation }): React.ReactElement {
  const total = ev.template_snapshot.criteria.length;
  if (ev.status === "draft") {
    const done = completedCount(ev.template_snapshot, ev.responses);
    return (
      <span className="text-[13px] font-medium text-text-muted tabular-nums">
        {done}/{total} rated
      </span>
    );
  }
  const avg = ev.average ?? averageScore(ev.template_snapshot, ev.responses);
  if (avg == null) return <span className="text-text-muted">—</span>;
  return (
    <span className="tabular-nums">
      <span className="text-[15px] font-bold text-text">{avg.toFixed(1)}</span>
      <span className="text-[12px] font-semibold text-text-muted"> / 5</span>
    </span>
  );
}

interface EvaluationsListProps {
  /** Filter state (persisted by the page). */
  storeFilter: string;
  statusFilter: string;
  query: string;
  page: number;
  onStoreFilter: (v: string) => void;
  onStatusFilter: (v: string) => void;
  onQuery: (v: string) => void;
  onPage: (p: number) => void;
  onStart: () => void;
  onOpen: (id: string) => void;
  onEdit: (id: string) => void;
  onDelete: (ev: Evaluation) => void;
}

export function EvaluationsList({
  storeFilter,
  statusFilter,
  query,
  page,
  onStoreFilter,
  onStatusFilter,
  onQuery,
  onPage,
  onStart,
  onOpen,
  onEdit,
  onDelete,
}: EvaluationsListProps): React.ReactElement {
  const { data: stores } = useStores();
  const activeStores = useMemo<Store[]>(
    () => (stores ?? []).filter((s) => s.is_active !== false),
    [stores],
  );

  const { data, isLoading } = useEvaluations({
    store_id: storeFilter || undefined,
    status: (statusFilter as Evaluation["status"]) || undefined,
    page,
    per_page: PER_PAGE,
  });

  const evaluations = useMemo<Evaluation[]>(() => data?.items ?? [], [data]);
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  // Client-side name search over the current page (server doesn't search by name).
  const filtered = useMemo<Evaluation[]>(() => {
    if (!query) return evaluations;
    const lower = query.toLowerCase();
    return evaluations.filter((ev) => (ev.evaluatee_name ?? "").toLowerCase().includes(lower));
  }, [evaluations, query]);

  // Stats over the current page (lightweight; matches the mockup's local stat cards).
  const submitted = evaluations.filter((e) => e.status === "submitted");
  const drafts = evaluations.filter((e) => e.status === "draft");
  const orgAvg = useMemo<number | null>(() => {
    const avgs = submitted
      .map((e) => e.average ?? averageScore(e.template_snapshot, e.responses))
      .filter((v): v is number => v != null);
    if (!avgs.length) return null;
    return Math.round((avgs.reduce((a, b) => a + b, 0) / avgs.length) * 10) / 10;
  }, [submitted]);

  const noneAtAll = !isLoading && total === 0 && !storeFilter && !statusFilter && !query;

  return (
    <div>
      {/* Stats */}
      <div className="flex flex-wrap gap-4 mb-6">
        <StatCard label="Total" value={String(total)} sub="evaluations" />
        <StatCard label="Submitted" value={String(submitted.length)} />
        <StatCard label="Drafts" value={String(drafts.length)} sub="on this page" />
        <StatCard label="Avg score" value={orgAvg != null ? orgAvg.toFixed(1) : "—"} sub="/ 5" />
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted pointer-events-none" />
          <input
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            placeholder="Search employee…"
            className="w-[240px] rounded-lg border border-border bg-surface pl-9 pr-3 py-2 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent"
          />
        </div>
        <select
          value={storeFilter}
          onChange={(e) => onStoreFilter(e.target.value)}
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent cursor-pointer"
        >
          <option value="">All stores</option>
          {activeStores.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <select
          value={statusFilter}
          onChange={(e) => onStatusFilter(e.target.value)}
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent cursor-pointer"
        >
          <option value="">All status</option>
          <option value="submitted">Submitted</option>
          <option value="draft">Draft</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-card border border-border rounded-xl overflow-x-auto shadow-sm">
        {isLoading ? (
          <div className="py-16 flex justify-center">
            <LoadingSpinner />
          </div>
        ) : noneAtAll ? (
          <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
            <div className="w-11 h-11 rounded-xl bg-accent-muted text-accent flex items-center justify-center mb-3">
              <Star className="h-5 w-5" />
            </div>
            <p className="text-text font-semibold">No evaluations yet</p>
            <p className="text-sm text-text-muted mt-1 max-w-md">
              Start a performance review for any team member. They&apos;ll appear here as drafts and submitted records.
            </p>
            <div className="mt-4">
              <Button variant="primary" onClick={onStart}>Start Evaluation</Button>
            </div>
          </div>
        ) : (
          <div style={{ minWidth: 900 }}>
            <table className="w-full border-collapse" style={{ tableLayout: "fixed" }}>
              <colgroup>
                <col />
                <col style={{ width: 150 }} />
                <col style={{ width: 116 }} />
                <col style={{ width: 156 }} />
                <col style={{ width: 96 }} />
                <col style={{ width: 124 }} />
                <col style={{ width: 52 }} />
              </colgroup>
              <thead>
                <tr className="border-b border-border text-[11px] font-bold uppercase tracking-wide text-text-muted">
                  <th className="text-left px-4 py-3">Employee</th>
                  <th className="text-left px-2 py-3">Store</th>
                  <th className="text-left px-2 py-3">Position</th>
                  <th className="text-left px-2 py-3">Period</th>
                  <th className="text-left px-2 py-3">Score</th>
                  <th className="text-left px-2 py-3">Status</th>
                  <th className="px-2 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((ev) => {
                  const isDraft = ev.status === "draft";
                  return (
                    <tr
                      key={ev.id}
                      onClick={() => onOpen(ev.id)}
                      className="group border-b border-border last:border-b-0 border-l-2 border-l-transparent hover:border-l-accent hover:bg-surface-hover cursor-pointer transition-colors duration-100"
                    >
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-accent-muted text-accent flex items-center justify-center text-[12px] font-bold shrink-0">
                            {ev.evaluatee_name ? initials(ev.evaluatee_name) : "??"}
                          </div>
                          <div className="min-w-0">
                            <div className="text-[14.5px] font-semibold text-text truncate">
                              {ev.evaluatee_name ?? "Unknown"}
                            </div>
                            <div className="text-xs text-text-muted truncate">
                              {ev.employee_no ? `ID ${ev.employee_no} · ` : ""}
                              by {ev.evaluator_name ?? "—"}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-2 py-3.5">
                        {ev.store_name ? (
                          <Badge variant="default">{ev.store_name}</Badge>
                        ) : (
                          <span className="text-text-muted">—</span>
                        )}
                      </td>
                      <td className="px-2 py-3.5 text-sm text-text-secondary truncate">
                        {ev.position_name ?? ev.job_title ?? "—"}
                      </td>
                      <td className="px-2 py-3.5 text-sm text-text-secondary">
                        {fmtRange(ev.period_start, ev.period_end)}
                      </td>
                      <td className="px-2 py-3.5"><ScoreCell ev={ev} /></td>
                      <td className="px-2 py-3.5"><StatusBadge status={ev.status} /></td>
                      <td className="px-2 py-3.5">
                        <div className="opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                          <RowMenu
                            items={[
                              { label: "Open", onClick: () => onOpen(ev.id) },
                              { label: isDraft ? "Continue editing" : "Edit", onClick: () => onEdit(ev.id) },
                              { label: "Delete", danger: true, dividerBefore: true, icon: trashIcon, onClick: () => onDelete(ev) },
                            ]}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-sm text-text-muted">
                      No evaluations match these filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex justify-end">
          <Pagination page={page} totalPages={totalPages} onPageChange={onPage} />
        </div>
      )}
    </div>
  );
}
