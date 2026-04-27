"use client";

/**
 * Schedule History — 모든 schedule audit 이벤트를 모아보는 페이지 (GM+ only).
 *
 * Filters: store, user (assigned), actor, event_type, date range
 * SV/Staff은 cost(hourly_rate) diff가 서버에서 redact되므로 안 보임.
 * 또한 cost-only modified 이벤트는 redact 후 빈 entry로 서버에서 자동 제외됨.
 */

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { useScheduleHistory, useDeleteScheduleHistoryEntry, type ScheduleHistoryItem } from "@/hooks/useSchedules";
import { useStores } from "@/hooks/useStores";
import { useUsers } from "@/hooks/useUsers";
import { useAuthStore } from "@/stores/authStore";
import { ROLE_PRIORITY } from "@/lib/permissions";
import { DiffDisplay } from "@/components/schedules/redesign/DiffDisplay";
import { ConfirmDialog } from "@/components/schedules/redesign/ConfirmDialog";
import type { User } from "@/types";

const EVENT_TYPES = [
  { value: "", label: "All events" },
  { value: "created", label: "Created" },
  { value: "modified", label: "Modified" },
  { value: "confirmed", label: "Confirmed" },
  { value: "rejected", label: "Rejected" },
  { value: "cancelled", label: "Cancelled" },
  { value: "reverted", label: "Reverted" },
  { value: "switched", label: "Switched" },
  { value: "deleted", label: "Deleted" },
];

const eventColor: Record<string, string> = {
  created: "bg-[var(--color-bg)] text-[var(--color-text-secondary)]",
  modified: "bg-[var(--color-warning-muted)] text-[var(--color-warning)]",
  confirmed: "bg-[var(--color-success-muted)] text-[var(--color-success)]",
  rejected: "bg-[var(--color-danger-muted)] text-[var(--color-danger)]",
  cancelled: "bg-[var(--color-bg)] text-[var(--color-text-muted)]",
  reverted: "bg-[var(--color-bg)] text-[var(--color-text-secondary)]",
  switched: "bg-[var(--color-accent-muted)] text-[var(--color-accent)]",
  swapped: "bg-[var(--color-accent-muted)] text-[var(--color-accent)]",
  deleted: "bg-[var(--color-danger-muted)] text-[var(--color-danger)]",
};

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function HistoryRow({ item, onDelete, users }: { item: ScheduleHistoryItem; onDelete?: (id: string) => void; users?: User[] }) {
  const [expanded, setExpanded] = useState(false);
  const hasDiff = item.diff && Object.keys(item.diff).length > 0;
  const hasDetails = hasDiff || !!item.reason;
  return (
    <>
      <tr
        className="border-b border-[var(--color-border)] hover:bg-[var(--color-surface-hover)] transition-colors group"
        onClick={() => hasDetails && setExpanded((v) => !v)}
        role={hasDetails ? "button" : undefined}
      >
        <td className="px-3 py-2.5 text-[11px] text-[var(--color-text-muted)] tabular-nums whitespace-nowrap">
          {formatDateTime(item.timestamp)}
        </td>
        <td className="px-3 py-2.5">
          <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide ${eventColor[item.event_type] ?? "bg-[var(--color-bg)] text-[var(--color-text-muted)]"}`}>
            {item.event_type}
          </span>
        </td>
        <td className="px-3 py-2.5 text-[12px]">
          {(item.event_type === "switched" || item.event_type === "swapped") ? (
            <span className="text-[var(--color-text-muted)]">—</span>
          ) : (
            <>
              <Link
                href={`/schedules/${item.schedule_id}`}
                onClick={(e) => e.stopPropagation()}
                className="text-[var(--color-accent)] hover:underline"
              >
                {item.work_date} · {item.user_name ?? "—"}
              </Link>
              <div className="text-[10px] text-[var(--color-text-muted)] mt-0.5">
                {item.work_role_name ?? "—"} @ {item.store_name ?? "—"}
                {item.start_time && item.end_time && ` · ${item.start_time}–${item.end_time}`}
              </div>
            </>
          )}
        </td>
        <td className="px-3 py-2.5 text-[12px] text-[var(--color-text-secondary)]">
          {item.actor_name ?? "system"}
          {item.actor_role && (
            <span className="text-[10px] text-[var(--color-text-muted)] ml-1">({item.actor_role})</span>
          )}
        </td>
        <td className="px-3 py-2.5 text-[12px] text-[var(--color-text)]">
          {item.description ?? "—"}
        </td>
        <td className="px-3 py-2.5 text-right">
          {onDelete && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(item.id);
              }}
              className="opacity-0 group-hover:opacity-100 transition-opacity text-[10px] font-semibold uppercase tracking-wider text-[var(--color-danger)] hover:bg-[var(--color-danger-muted)] px-1.5 py-0.5 rounded"
              title="Delete history entry (Owner only)"
            >
              Delete
            </button>
          )}
        </td>
      </tr>
      {expanded && hasDetails && (
        <tr className="bg-[var(--color-bg)] border-b border-[var(--color-border)]">
          <td colSpan={6} className="px-3 py-2.5">
            {hasDiff && (
              <div className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-1.5">Changes</div>
            )}
            <DiffDisplay diff={item.diff ?? {}} users={users} reason={item.reason ?? undefined} />
          </td>
        </tr>
      )}
    </>
  );
}

export default function ScheduleHistoryPage() {
  const router = useRouter();
  const currentUser = useAuthStore((s) => s.user);
  const isOwner = (currentUser?.role_priority ?? 99) <= ROLE_PRIORITY.OWNER;
  const deleteHistoryMutation = useDeleteScheduleHistoryEntry();

  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const [storeId, setStoreId] = useState("");
  const [userId, setUserId] = useState("");
  const [actorId, setActorId] = useState("");
  const [eventType, setEventType] = useState("");
  const [dateFrom, setDateFrom] = useState(monthAgo);
  const [dateTo, setDateTo] = useState(today);
  const [page, setPage] = useState(1);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const storesQ = useStores();
  const usersQ = useUsers();

  const filters = useMemo(() => ({
    store_id: storeId || undefined,
    user_id: userId || undefined,
    actor_id: actorId || undefined,
    event_type: eventType || undefined,
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
    page,
    per_page: 50,
  }), [storeId, userId, actorId, eventType, dateFrom, dateTo, page]);

  const historyQ = useScheduleHistory(filters);

  const items = historyQ.data?.items ?? [];
  const total = historyQ.data?.total ?? 0;
  const totalPages = Math.ceil(total / 50);

  const resetFilters = () => {
    setStoreId("");
    setUserId("");
    setActorId("");
    setEventType("");
    setDateFrom(monthAgo);
    setDateTo(today);
    setPage(1);
  };

  return (
    <div className="min-h-screen bg-[var(--color-bg)] p-6">
      <div className="max-w-[1400px] mx-auto">
        {/* Header */}
        <div className="flex items-start justify-between mb-6 gap-3">
          <div>
            <button
              type="button"
              onClick={() => router.push("/schedules")}
              className="text-[12px] text-[var(--color-text-muted)] hover:text-[var(--color-text)] mb-1 flex items-center gap-1"
            >
              ← Back to Schedules
            </button>
            <h1 className="text-[22px] font-bold text-[var(--color-text)]">Schedule History</h1>
            <p className="text-[12px] text-[var(--color-text-muted)] mt-0.5">All schedule events across the organization</p>
          </div>
          <button
            type="button"
            onClick={() => historyQ.refetch()}
            disabled={historyQ.isFetching}
            className="mt-6 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-[12px] font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Refresh history"
          >
            <RefreshCw size={13} className={historyQ.isFetching ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>

        {/* Filters */}
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-4 mb-4">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-1">From</label>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
                className="w-full px-2 py-1.5 border border-[var(--color-border)] rounded text-[12px] bg-[var(--color-surface)]"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-1">To</label>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
                className="w-full px-2 py-1.5 border border-[var(--color-border)] rounded text-[12px] bg-[var(--color-surface)]"
              />
            </div>
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-1">Store</label>
              <select
                value={storeId}
                onChange={(e) => { setStoreId(e.target.value); setPage(1); }}
                className="w-full px-2 py-1.5 border border-[var(--color-border)] rounded text-[12px] bg-[var(--color-surface)]"
              >
                <option value="">All stores</option>
                {(storesQ.data ?? []).map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-1">Assigned to</label>
              <select
                value={userId}
                onChange={(e) => { setUserId(e.target.value); setPage(1); }}
                className="w-full px-2 py-1.5 border border-[var(--color-border)] rounded text-[12px] bg-[var(--color-surface)]"
              >
                <option value="">Anyone</option>
                {(usersQ.data ?? []).map((u) => (
                  <option key={u.id} value={u.id}>{u.full_name || u.username}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-1">Changed by</label>
              <select
                value={actorId}
                onChange={(e) => { setActorId(e.target.value); setPage(1); }}
                className="w-full px-2 py-1.5 border border-[var(--color-border)] rounded text-[12px] bg-[var(--color-surface)]"
              >
                <option value="">Anyone</option>
                {(usersQ.data ?? []).map((u) => (
                  <option key={u.id} value={u.id}>{u.full_name || u.username}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-1">Event</label>
              <select
                value={eventType}
                onChange={(e) => { setEventType(e.target.value); setPage(1); }}
                className="w-full px-2 py-1.5 border border-[var(--color-border)] rounded text-[12px] bg-[var(--color-surface)]"
              >
                {EVENT_TYPES.map((e) => (
                  <option key={e.value} value={e.value}>{e.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex justify-end mt-3">
            <button
              type="button"
              onClick={resetFilters}
              className="text-[11px] text-[var(--color-text-muted)] hover:text-[var(--color-text)] underline"
            >
              Reset filters
            </button>
          </div>
        </div>

        {/* Results */}
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center justify-between">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
              {historyQ.isLoading ? "Loading…" : `${total} event${total === 1 ? "" : "s"}`}
            </div>
            {totalPages > 1 && (
              <div className="flex items-center gap-2 text-[11px]">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="px-2 py-1 rounded border border-[var(--color-border)] disabled:opacity-30"
                >
                  Prev
                </button>
                <span className="text-[var(--color-text-muted)]">{page} / {totalPages}</span>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="px-2 py-1 rounded border border-[var(--color-border)] disabled:opacity-30"
                >
                  Next
                </button>
              </div>
            )}
          </div>
          {historyQ.error && (
            <div className="px-4 py-8 text-center text-[var(--color-danger)] text-[13px]">
              {historyQ.error.message}
            </div>
          )}
          {!historyQ.isLoading && items.length === 0 && (
            <div className="px-4 py-12 text-center text-[var(--color-text-muted)] text-[13px]">
              No history events match the filters.
            </div>
          )}
          {items.length > 0 && (
            <table className="w-full text-left">
              <thead className="bg-[var(--color-bg)] border-b border-[var(--color-border)]">
                <tr>
                  <th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">When</th>
                  <th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Event</th>
                  <th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Schedule</th>
                  <th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">By</th>
                  <th className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Description</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <HistoryRow
                    key={item.id}
                    item={item}
                    users={usersQ.data ?? []}
                    onDelete={isOwner ? (id) => setPendingDeleteId(id) : undefined}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={pendingDeleteId !== null}
        title="Delete History Entry"
        message="This will permanently remove the audit log entry. This action cannot be undone."
        confirmLabel="Delete"
        confirmVariant="danger"
        onConfirm={() => {
          if (pendingDeleteId) deleteHistoryMutation.mutate(pendingDeleteId);
          setPendingDeleteId(null);
        }}
        onCancel={() => setPendingDeleteId(null)}
      />
    </div>
  );
}
