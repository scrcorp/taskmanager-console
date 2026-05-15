"use client";

import { Clock, CheckCircle2, AlertCircle } from "lucide-react";
import { useMemo, useState } from "react";
import { useStoreTipDistributions } from "@/hooks/useTips";
import { cn } from "@/lib/utils";
import type { StoreDistribution, TipDistributionStatus } from "@/types/tip";

interface Props {
  storeId: string;
  period: { start: string; end: string; label: string };
}

const FILTERS: { key: TipDistributionStatus | "all"; label: string }[] = [
  { key: "pending", label: "Pending" },
  { key: "accepted", label: "Accepted" },
  { key: "auto_accepted", label: "Auto" },
  { key: "all", label: "All" },
];

function timeUntil(iso: string): string {
  const target = new Date(iso).getTime();
  const now = Date.now();
  const diffMs = target - now;
  if (diffMs <= 0) return "Auto-accept due";
  const hours = Math.floor(diffMs / 3_600_000);
  const minutes = Math.floor((diffMs % 3_600_000) / 60_000);
  if (hours >= 1) return `Auto in ${hours}h ${minutes}m`;
  return `Auto in ${minutes}m`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function DistributionsPanel({ storeId, period }: Props) {
  const [filter, setFilter] = useState<TipDistributionStatus | "all">("pending");
  const range = useMemo(
    () => ({ start: period.start, end: period.end }),
    [period.start, period.end],
  );
  const { data: items = [], isLoading } = useStoreTipDistributions(
    storeId,
    filter === "all" ? undefined : filter,
    range,
  );

  // 통계는 현재 사이클 전체 (status 무관, 같은 range)
  const { data: all = [] } = useStoreTipDistributions(storeId, undefined, range);
  const stats = useMemo(() => {
    const out = { total: all.length, pending: 0, accepted: 0, auto: 0 };
    for (const d of all) {
      if (d.status === "pending") out.pending++;
      else if (d.status === "accepted") out.accepted++;
      else if (d.status === "auto_accepted") out.auto++;
    }
    return out;
  }, [all]);

  const topRecipients = useMemo(() => {
    const sums = new Map<string, { name: string; total: number }>();
    for (const d of all) {
      if (!d.receiver_id) continue;
      const cur = sums.get(d.receiver_id) ?? {
        name: d.receiver_name ?? "—",
        total: 0,
      };
      cur.total += Number(d.amount) || 0;
      sums.set(d.receiver_id, cur);
    }
    return [...sums.entries()]
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  }, [all]);

  return (
    <div className="grid grid-cols-[1fr_280px] gap-4">
      {/* main list */}
      <div className="space-y-3">
        <div className="flex items-center gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={cn(
                "rounded-full px-3 py-1 text-[12px] font-medium transition-colors",
                filter === f.key
                  ? "bg-[#6C5CE7] text-white"
                  : "bg-white text-[#64748B] hover:bg-[#F5F6FA]",
              )}
            >
              {f.label}
              {f.key !== "all" && (
                <span className="ml-1.5 text-[10px] opacity-70">
                  {f.key === "pending"
                    ? stats.pending
                    : f.key === "accepted"
                      ? stats.accepted
                      : stats.auto}
                </span>
              )}
            </button>
          ))}
        </div>

        {isLoading && (
          <p className="rounded-xl border border-[#E2E4EA] bg-white p-6 text-center text-[13px] text-[#94A3B8]">
            Loading distributions...
          </p>
        )}

        {!isLoading && items.length === 0 && (
          <p className="rounded-xl border border-dashed border-[#E2E4EA] bg-white p-6 text-center text-[13px] text-[#94A3B8]">
            No distributions matching this filter.
          </p>
        )}

        <ul className="space-y-2">
          {items.map((d) => (
            <DistributionCard key={d.id} dist={d} />
          ))}
        </ul>
      </div>

      {/* sidebar */}
      <aside className="space-y-3">
        <div className="rounded-xl border border-[#E2E4EA] bg-white p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">
            Stats
          </p>
          <ul className="mt-2 space-y-1.5 text-[13px]">
            <li className="flex justify-between">
              <span className="text-[#64748B]">Total</span>
              <span className="font-semibold text-[#1A1D27]">{stats.total}</span>
            </li>
            <li className="flex justify-between">
              <span className="text-[#64748B]">Pending</span>
              <span className="font-semibold text-[#F0A500]">
                {stats.pending}
              </span>
            </li>
            <li className="flex justify-between">
              <span className="text-[#64748B]">Accepted</span>
              <span className="font-semibold text-[#00B894]">
                {stats.accepted}
              </span>
            </li>
            <li className="flex justify-between">
              <span className="text-[#64748B]">Auto-accepted</span>
              <span className="font-semibold text-[#94A3B8]">{stats.auto}</span>
            </li>
          </ul>
        </div>

        <div className="rounded-xl border border-[#E2E4EA] bg-white p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">
            Top recipients
          </p>
          {topRecipients.length === 0 ? (
            <p className="mt-2 text-[12px] text-[#94A3B8]">No data yet.</p>
          ) : (
            <ul className="mt-2 space-y-1.5 text-[12.5px]">
              {topRecipients.map((r, idx) => (
                <li key={r.id} className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-[#1A1D27]">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#F0F1F5] text-[10px] font-semibold text-[#64748B]">
                      {idx + 1}
                    </span>
                    {r.name}
                  </span>
                  <span className="font-semibold text-[#6C5CE7]">
                    ${r.total.toFixed(2)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
}

function DistributionCard({ dist }: { dist: StoreDistribution }) {
  const isPending = dist.status === "pending";
  const isAuto = dist.status === "auto_accepted";

  return (
    <li className="rounded-xl border border-[#E2E4EA] bg-white p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold text-[#1A1D27]">
            {dist.sender_name} → {dist.receiver_name ?? "(deleted)"}
            <span className="ml-2 text-[11px] font-medium text-[#94A3B8]">
              {dist.work_date} · {dist.work_role_name ?? "no role"}
            </span>
          </p>
          {dist.reason && (
            <p className="mt-0.5 text-[12px] text-[#64748B]">{dist.reason}</p>
          )}
          <p className="mt-1 text-[11px] text-[#94A3B8]">
            Created {formatDate(dist.created_at)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[16px] font-bold text-[#1A1D27]">
            ${Number(dist.amount).toFixed(2)}
          </p>
          {isPending && (
            <p className="mt-1 flex items-center justify-end gap-1 text-[10px] font-semibold text-[#F0A500]">
              <Clock size={10} /> {timeUntil(dist.pending_until)}
            </p>
          )}
          {!isPending && (
            <p className="mt-1 flex items-center justify-end gap-1 text-[10px] font-semibold text-[#00B894]">
              {isAuto ? (
                <AlertCircle size={10} />
              ) : (
                <CheckCircle2 size={10} />
              )}
              {isAuto ? "Auto-accepted" : "Accepted"}
            </p>
          )}
        </div>
      </div>
    </li>
  );
}
