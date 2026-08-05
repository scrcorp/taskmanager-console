"use client";

import { useMemo } from "react";
import { AlertTriangle, Download, Lock, RefreshCw } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { useTimezone } from "@/hooks/useTimezone";
import { useUsers } from "@/hooks/useUsers";
import { PERMISSIONS } from "@/lib/permissions";
import { formatDateTime, parseApiError } from "@/lib/utils";
import { sumPayrollRows } from "@/lib/payrollTotals";
import { useExportPeriod, usePayPeriodEntries } from "@/hooks/usePayroll";
import { PayrollSummary } from "@/components/payroll/PayrollSummary";
import { PayStubActions } from "@/components/payroll/PayStubActions";
import {
  PayrollTable,
  type PayrollTableRow,
} from "@/components/payroll/PayrollTable";
import type { PayPeriod } from "@/types/payroll";

interface Props {
  period: PayPeriod;
}

/**
 * CONFIRMED 기간 뷰 — 동결 entries 테이블 + xlsx export + 행별 pay stub PDF.
 * confirmed_at/by 배너 포함. 여기서는 어떤 값도 재계산하지 않는다 (동결본 원천).
 */
export function ConfirmedPeriodView({ period }: Props) {
  const entriesQ = usePayPeriodEntries(period.id);
  const exportMut = useExportPeriod();
  const tz = useTimezone();
  const { hasPermission } = usePermissions();
  const canExport = hasPermission(PERMISSIONS.PAYROLL_EXPORT);

  // confirmed_by 이름 해석 (실패해도 배너는 시각만 표시)
  const { data: users } = useUsers();
  const confirmedByName = useMemo(() => {
    if (!period.confirmed_by || !users) return null;
    return users.find((u) => u.id === period.confirmed_by)?.full_name ?? null;
  }, [users, period.confirmed_by]);

  const entries = entriesQ.data?.entries ?? [];

  const tableRows: PayrollTableRow[] = useMemo(
    () =>
      entries.map((e) => ({
        key: e.id,
        name: e.member_name,
        userId: e.user_id,
        empid: e.empid,
        crewid: e.crewid,
        regular_minutes: e.regular_minutes,
        ot_minutes: e.ot_minutes,
        dt_minutes: e.dt_minutes,
        penalty_pay: e.penalty_pay,
        card_tips: e.card_tips,
        gross_pay: e.gross_pay,
        breakdown: e.breakdown,
        revision: e.revision,
      })),
    [entries],
  );

  const totals = useMemo(() => sumPayrollRows(tableRows), [tableRows]);

  if (entriesQ.isLoading) {
    return (
      <div className="flex h-64 items-center justify-center text-[13px] text-[#94A3B8]">
        Loading frozen entries...
      </div>
    );
  }

  if (entriesQ.isError) {
    return (
      <div className="rounded-xl border border-[#F3C5C5] bg-[rgba(255,107,107,0.06)] p-5">
        <p className="flex items-center gap-2 text-[13px] font-semibold text-[#C0392B]">
          <AlertTriangle size={15} />
          Couldn&apos;t load the frozen entries
        </p>
        <p className="mt-1 text-[12px] text-[#8B5B5B]">
          {parseApiError(entriesQ.error, "Unexpected error")} — check your
          connection, then retry.
        </p>
        <button
          type="button"
          onClick={() => void entriesQ.refetch()}
          className="mt-3 flex items-center gap-1.5 rounded-lg border border-[#E2E4EA] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#1A1D27] hover:bg-[#F5F6FA]"
        >
          <RefreshCw size={13} /> Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Confirmed banner */}
      <div className="rounded-xl bg-gradient-to-r from-[#00B894] to-[#00A084] p-4 text-white">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/15">
              <Lock size={16} />
            </div>
            <div>
              <p className="text-[13px] font-bold">Period confirmed</p>
              <p className="text-[11.5px] text-white/80">
                {period.confirmed_at
                  ? `Confirmed ${formatDateTime(period.confirmed_at, tz)}`
                  : "Confirmed"}
                {confirmedByName ? ` by ${confirmedByName}` : ""} · entries are
                frozen. Corrections are handled through amendments.
              </p>
            </div>
          </div>
          {canExport && (
            <button
              type="button"
              onClick={() => exportMut.mutate({ periodId: period.id })}
              disabled={exportMut.isPending}
              className="flex items-center gap-1.5 rounded-lg bg-white px-3.5 py-2 text-[12.5px] font-semibold text-[#00A084] hover:bg-white/90 disabled:opacity-60"
            >
              <Download size={14} />
              {exportMut.isPending ? "Preparing..." : "Export .xlsx"}
            </button>
          )}
        </div>
        {period.override_reason && (
          <p className="mt-3 flex items-center gap-1.5 rounded-lg bg-black/20 px-3 py-2 text-[12px]">
            <AlertTriangle size={14} /> Override: {period.override_reason}
          </p>
        )}
      </div>

      {/* Period totals */}
      <PayrollSummary totals={totals} grossLabel="Gross" />

      {/* Frozen entries */}
      <PayrollTable
        title="Frozen entries"
        rows={tableRows}
        emptyMessage="No entries were frozen for this period."
        period={period}
        renderRowAction={
          canExport
            ? (row) => (
                <PayStubActions
                  target={{ kind: "entry", entryId: row.key }}
                  memberName={row.name}
                />
              )
            : undefined
        }
      />
    </div>
  );
}
