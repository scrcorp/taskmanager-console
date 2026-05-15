"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Lock } from "lucide-react";
import {
  useConfirmPeriod,
  useForceClosePeriod,
  usePeriodDashboard,
  type PeriodEmployeeRow,
} from "@/hooks/useTips";
import { Modal } from "@/components/ui/Modal";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/hooks/usePermissions";
import { PERMISSIONS } from "@/lib/permissions";
import type { TipPeriod } from "@/lib/tipPeriod";

interface Props {
  storeId: string;
  period: TipPeriod;
}

function fmt$(value: string | number): string {
  const n = typeof value === "string" ? Number(value) : value;
  return `$${(Number.isFinite(n) ? n : 0).toFixed(2)}`;
}

export function PeriodPanel({ storeId, period }: Props) {
  const { data, isLoading } = usePeriodDashboard(storeId, period.start);
  const confirmMut = useConfirmPeriod();
  const forceMut = useForceClosePeriod();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [forceOpen, setForceOpen] = useState(false);
  const [reason, setReason] = useState("");
  const { hasPermission } = usePermissions();
  const canConfirm = hasPermission(PERMISSIONS.TIPS_PERIOD_CONFIRM);
  const canOverride = hasPermission(PERMISSIONS.TIPS_PERIOD_OVERRIDE);

  const isConfirmed = data?.status === "confirmed";

  const maxDaily = useMemo(() => {
    if (!data) return 0;
    return Math.max(...data.daily.map((d) => Number(d.reported) || 0), 1);
  }, [data]);

  if (isLoading || !data) {
    return (
      <div className="flex h-64 items-center justify-center text-[13px] text-[#94A3B8]">
        Loading period dashboard...
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Hero */}
      <div
        className={cn(
          "rounded-2xl p-5 text-white",
          isConfirmed
            ? "bg-gradient-to-r from-[#00B894] to-[#00A084]"
            : "bg-gradient-to-r from-[#6C5CE7] to-[#5A4DD0]",
        )}
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-white/70">
              {period.label}
            </p>
            <p className="mt-1 text-[36px] font-extrabold leading-none">
              {fmt$(data.kpi.reported_total)}
            </p>
            <p className="mt-1 text-[12px] text-white/70">
              Reported on 4070 · {data.kpi.entries_count} entries ·{" "}
              {data.kpi.distinct_employees} staff
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            {isConfirmed ? (
              <div className="flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-[11px] font-semibold">
                <Lock size={12} /> CONFIRMED
              </div>
            ) : (
              <div className="flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 text-[11px] font-semibold">
                OPEN
              </div>
            )}
            {!isConfirmed && (canConfirm || canOverride) && (
              <div className="flex gap-1.5">
                {canConfirm && (
                  <button
                    type="button"
                    onClick={() => setConfirmOpen(true)}
                    className="rounded-lg bg-white px-3 py-1.5 text-[12px] font-semibold text-[#6C5CE7] hover:bg-white/90"
                  >
                    Confirm & Generate
                  </button>
                )}
                {canOverride && (
                  <button
                    type="button"
                    onClick={() => setForceOpen(true)}
                    className="rounded-lg bg-white/10 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-white/20"
                  >
                    Force-close
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
        {isConfirmed && data.override_reason && (
          <p className="mt-3 flex items-center gap-1.5 rounded-lg bg-black/20 px-3 py-2 text-[12px]">
            <AlertTriangle size={14} /> Force-closed: {data.override_reason}
          </p>
        )}
      </div>

      {/* KPI tiles */}
      <div className="grid grid-cols-4 gap-3">
        <KpiTile label="Card tips" value={fmt$(data.kpi.card_total)} />
        <KpiTile label="Cash kept" value={fmt$(data.kpi.cash_total)} />
        <KpiTile
          label="Distributed out"
          value={fmt$(data.kpi.distributed_total)}
        />
        <KpiTile
          label="Avg per staff"
          value={fmt$(
            data.kpi.distinct_employees > 0
              ? Number(data.kpi.reported_total) / data.kpi.distinct_employees
              : 0,
          )}
        />
      </div>

      {/* Daily trend */}
      <div className="rounded-xl border border-[#E2E4EA] bg-white p-4">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">
          Daily trend
        </p>
        <div className="mt-3 flex items-end gap-1 h-32">
          {data.daily.map((d) => {
            const v = Number(d.reported) || 0;
            const h = Math.max(2, Math.round((v / maxDaily) * 100));
            return (
              <div
                key={d.date}
                className="flex flex-1 flex-col items-center gap-1"
                title={`${d.date}: ${fmt$(v)}`}
              >
                <div
                  className={cn(
                    "w-full rounded-t",
                    v > 0 ? "bg-[#6C5CE7]" : "bg-[#E2E4EA]",
                  )}
                  style={{ height: `${h}%` }}
                />
                <span className="text-[9px] text-[#94A3B8]">
                  {Number(d.date.slice(-2))}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Per-employee */}
      <div className="rounded-xl border border-[#E2E4EA] bg-white">
        <div className="border-b border-[#E2E4EA] px-4 py-2">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">
            Per-employee summary
          </p>
        </div>
        <table className="w-full text-[12px]">
          <thead className="bg-[#F5F6FA]">
            <tr>
              <Th>Staff</Th>
              <Th align="right">Card</Th>
              <Th align="right">Cash</Th>
              <Th align="right">Out</Th>
              <Th align="right">Reported</Th>
              <Th align="right">Entries</Th>
            </tr>
          </thead>
          <tbody>
            {data.per_employee.length === 0 && (
              <tr>
                <td
                  colSpan={6}
                  className="px-4 py-8 text-center text-[12px] text-[#94A3B8]"
                >
                  No entries this cycle yet.
                </td>
              </tr>
            )}
            {data.per_employee.map((row) => (
              <PerEmployeeRow key={row.employee_id} row={row} />
            ))}
          </tbody>
        </table>
      </div>

      {/* Confirm modal */}
      <Modal
        isOpen={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Confirm cycle & generate 4070 forms"
        closeOnBackdrop={false}
        footer={
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setConfirmOpen(false)}
              disabled={confirmMut.isPending}
              className="rounded-lg px-3 py-1.5 text-[13px] text-[#64748B] hover:bg-[#F5F6FA]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={async () => {
                await confirmMut.mutateAsync({
                  storeId,
                  dateInCycle: period.start,
                });
                setConfirmOpen(false);
              }}
              disabled={confirmMut.isPending}
              className="rounded-lg bg-[#6C5CE7] px-4 py-1.5 text-[13px] font-semibold text-white hover:bg-[#7C6DF0] disabled:opacity-50"
            >
              Confirm & Generate
            </button>
          </div>
        }
      >
        <p className="text-[13px] text-[#1A1D27]">
          This will lock all tip entries for{" "}
          <strong>{period.label}</strong>, generate IRS Form 4070 documents for{" "}
          <strong>{data.per_employee.length}</strong> staff, and send signing reminders.
        </p>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-[12px] text-[#64748B]">
          <li>Total reported: {fmt$(data.kpi.reported_total)}</li>
          <li>Entries in cycle: {data.kpi.entries_count}</li>
          <li>Distinct staff: {data.kpi.distinct_employees}</li>
        </ul>
        <p className="mt-3 flex items-center gap-1.5 rounded-lg bg-[#FFF7E6] px-3 py-2 text-[11px] text-[#B45F06]">
          <AlertTriangle size={12} /> After confirming, edits require force-close
          (audit-tracked).
        </p>
      </Modal>

      {/* Force-close modal */}
      <Modal
        isOpen={forceOpen}
        onClose={() => setForceOpen(false)}
        title="Force-close cycle"
        closeOnBackdrop={false}
        footer={
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setForceOpen(false)}
              disabled={forceMut.isPending}
              className="rounded-lg px-3 py-1.5 text-[13px] text-[#64748B] hover:bg-[#F5F6FA]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={async () => {
                await forceMut.mutateAsync({
                  storeId,
                  dateInCycle: period.start,
                  reason: reason.trim(),
                });
                setForceOpen(false);
                setReason("");
              }}
              disabled={forceMut.isPending || reason.trim().length < 10}
              className="rounded-lg bg-[#FF6B6B] px-4 py-1.5 text-[13px] font-semibold text-white hover:bg-[#FF5252] disabled:opacity-50"
            >
              Force-close
            </button>
          </div>
        }
      >
        <p className="text-[13px] text-[#1A1D27]">
          This closes the cycle <strong>before its end date</strong> and locks
          all entries. Pending unsigned forms will still be sent to staff for
          signing. The reason is recorded in the audit log and visible to staff.
        </p>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-[12px] text-[#64748B]">
          <li>Affected staff: <strong>{data.per_employee.length}</strong></li>
          <li>Total reported: {fmt$(data.kpi.reported_total)}</li>
          <li>Entries to lock: {data.kpi.entries_count}</li>
        </ul>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          placeholder="Reason (10+ characters)…"
          className="mt-3 w-full rounded-lg border border-[#E2E4EA] px-2.5 py-2 text-[13px] focus:border-[#6C5CE7] focus:outline-none focus:ring-2 focus:ring-[rgba(108,92,231,0.15)]"
        />
        <p className="mt-1 text-[11px] text-[#94A3B8]">
          {reason.trim().length}/10 characters minimum
        </p>
      </Modal>
    </div>
  );
}

function KpiTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#E2E4EA] bg-white px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-[#94A3B8]">
        {label}
      </p>
      <p className="mt-1 text-[18px] font-bold text-[#1A1D27]">{value}</p>
    </div>
  );
}

function Th({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      className={cn(
        "border-b border-[#E2E4EA] px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-[#64748B]",
        align === "right" ? "text-right" : "text-left",
      )}
    >
      {children}
    </th>
  );
}

function PerEmployeeRow({ row }: { row: PeriodEmployeeRow }) {
  return (
    <tr className="hover:bg-[#FAFBFC]">
      <td className="border-b border-[#E2E4EA] px-3 py-1.5 font-medium text-[#1A1D27]">
        {row.employee_name || row.employee_id.slice(0, 8)}
      </td>
      <td className="border-b border-[#E2E4EA] px-3 py-1.5 text-right">
        {fmt$(row.card)}
      </td>
      <td className="border-b border-[#E2E4EA] px-3 py-1.5 text-right">
        {fmt$(row.cash)}
      </td>
      <td className="border-b border-[#E2E4EA] px-3 py-1.5 text-right">
        {fmt$(row.distributed)}
      </td>
      <td className="border-b border-[#E2E4EA] px-3 py-1.5 text-right font-bold text-[#6C5CE7]">
        {fmt$(row.reported)}
      </td>
      <td className="border-b border-[#E2E4EA] px-3 py-1.5 text-right text-[#64748B]">
        {row.entries}
      </td>
    </tr>
  );
}
