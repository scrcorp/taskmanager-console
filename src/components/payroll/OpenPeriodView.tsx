"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Download, RefreshCw } from "lucide-react";
import { useModal } from "@/components/ui/imperative-modal";
import { usePermissions } from "@/hooks/usePermissions";
import { PERMISSIONS } from "@/lib/permissions";
import { parseApiError } from "@/lib/utils";
import { money, payrollPeriodLabel } from "@/lib/payrollFormat";
import { sumPayrollRows } from "@/lib/payrollTotals";
import {
  getConfirmGateFailures,
  useConfirmPayPeriod,
  useExportPeriod,
  usePayrollPreview,
} from "@/hooks/usePayroll";
import { GateChecklist } from "@/components/payroll/GateChecklist";
import { PayrollSummary } from "@/components/payroll/PayrollSummary";
import { PayStubActions } from "@/components/payroll/PayStubActions";
import {
  PayrollTable,
  type PayrollTableRow,
} from "@/components/payroll/PayrollTable";
import type { ConfirmGateFailure, PayPeriod } from "@/types/payroll";

interface Props {
  period: PayPeriod;
}

/**
 * OPEN 기간 뷰 — live preview: KPI + 마감 게이트 체크리스트 + 직원별
 * preview 테이블 + Confirm (payroll:confirm).
 */
export function OpenPeriodView({ period }: Props) {
  const previewQ = usePayrollPreview(period.id);
  const confirmMut = useConfirmPayPeriod();
  const exportMut = useExportPeriod();
  const modal = useModal();
  const { hasPermission } = usePermissions();
  const canConfirm = hasPermission(PERMISSIONS.PAYROLL_CONFIRM);
  const canExport = hasPermission(PERMISSIONS.PAYROLL_EXPORT);

  const [gateFailures, setGateFailures] = useState<ConfirmGateFailure[] | null>(
    null,
  );

  // 기간 전환 시 이전 confirm 실패 상태 제거
  useEffect(() => {
    setGateFailures(null);
  }, [period.id]);

  const preview = previewQ.data;

  const totals = useMemo(
    () => sumPayrollRows(preview?.rows ?? []),
    [preview],
  );
  const issues = useMemo(
    () =>
      (preview?.validations_summary ?? []).reduce((acc, v) => acc + v.count, 0),
    [preview],
  );

  const tableRows: PayrollTableRow[] = useMemo(
    () =>
      (preview?.rows ?? []).map((r) => ({
        key: r.user_id,
        name: r.member_name,
        userId: r.user_id,
        empid: r.empid,
        crewid: r.crewid,
        regular_minutes: r.regular_minutes,
        ot_minutes: r.ot_minutes,
        dt_minutes: r.dt_minutes,
        penalty_pay: r.penalty_pay,
        card_tips: r.card_tips,
        gross_pay: r.gross_pay,
        breakdown: r.breakdown,
        validations: r.validations,
      })),
    [preview],
  );

  const onConfirm = async (): Promise<void> => {
    if (!preview) return;
    const label = payrollPeriodLabel(period.start_date, period.end_date);
    const ok = await modal.confirm({
      title: "Confirm this pay period?",
      message:
        `This freezes payroll for ${label} — ${preview.rows.length} employee ` +
        `entr${preview.rows.length === 1 ? "y" : "ies"}, ` +
        `${money(totals.gross_pay)} estimated gross. ` +
        "Confirmed payroll cannot be recalculated; later corrections go " +
        "through amendments.",
      confirmLabel: "Confirm period",
    });
    if (!ok) return;
    try {
      await confirmMut.mutateAsync({ periodId: period.id });
      setGateFailures(null);
    } catch (err) {
      const gates = getConfirmGateFailures(err);
      if (gates) setGateFailures(gates);
      // 그 외 에러는 hook 이 모달로 표시
    }
  };

  if (previewQ.isLoading) {
    return (
      <div className="flex h-64 items-center justify-center text-[13px] text-[#94A3B8]">
        Calculating payroll preview...
      </div>
    );
  }

  if (previewQ.isError || !preview) {
    return (
      <div className="rounded-xl border border-[#F3C5C5] bg-[rgba(255,107,107,0.06)] p-5">
        <p className="flex items-center gap-2 text-[13px] font-semibold text-[#C0392B]">
          <AlertTriangle size={15} />
          Couldn&apos;t load the payroll preview
        </p>
        <p className="mt-1 text-[12px] text-[#8B5B5B]">
          {previewQ.error
            ? parseApiError(previewQ.error, "Unexpected error")
            : "Unexpected error"}{" "}
          — check your connection, then retry.
        </p>
        <button
          type="button"
          onClick={() => void previewQ.refetch()}
          className="mt-3 flex items-center gap-1.5 rounded-lg border border-[#E2E4EA] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#1A1D27] hover:bg-[#F5F6FA]"
        >
          <RefreshCw size={13} /> Retry
        </button>
      </div>
    );
  }

  const issuesRemain = issues > 0 || (gateFailures?.length ?? 0) > 0;

  return (
    <div className="space-y-4">
      {/* Action bar */}
      <div className="flex items-center justify-between rounded-xl border border-[#E2E4EA] bg-white px-4 py-3">
        <div className="flex items-center gap-2 text-[12px] text-[#64748B]">
          {issuesRemain ? (
            <>
              <AlertTriangle size={14} className="text-[#F0A500]" />
              Live preview — resolve the close gates below before confirming.
            </>
          ) : (
            <>
              <CheckCircle2 size={14} className="text-[#00B894]" />
              Live preview — all close gates pass. Ready to confirm.
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* 확정 전에도 숫자를 검토용으로 받아볼 수 있게 — 서버가 DRAFT 로 표시 */}
          {canExport && (
            <button
              type="button"
              onClick={() => exportMut.mutate({ periodId: period.id })}
              disabled={exportMut.isPending}
              className="flex items-center gap-1.5 rounded-lg border border-[#E2E4EA] bg-white px-3 py-2 text-[12.5px] font-semibold text-[#1A1D27] hover:border-[#CBD2DA] hover:bg-[#F5F6FA] disabled:opacity-50"
            >
              <Download size={14} />
              {exportMut.isPending ? "Preparing..." : "Export draft (.xlsx)"}
            </button>
          )}
          {canConfirm && (
            <button
              type="button"
              onClick={() => void onConfirm()}
              disabled={confirmMut.isPending}
              className="rounded-lg bg-[#6C5CE7] px-4 py-2 text-[13px] font-semibold text-white hover:bg-[#7C6DF0] disabled:opacity-50"
            >
              {confirmMut.isPending ? "Confirming..." : "Confirm period"}
            </button>
          )}
        </div>
      </div>

      {/* KPI row */}
      <PayrollSummary totals={totals} grossLabel="Est. gross" issues={issues} />

      {/* Close gates */}
      <GateChecklist preview={preview} failures={gateFailures} />

      {/* Per-employee preview */}
      <PayrollTable
        title="Per-employee preview"
        rows={tableRows}
        emptyMessage="No payable work in this period yet."
        period={period}
        // 시급 인라인 편집 — 서버 게이트(users:update + GM+ cost 가시성)와 동일 축.
        // payroll 화면 자체가 cost 뷰라 GM+ 전제, 여기선 쓰기 permission 만 본다.
        rateEditable={hasPermission(PERMISSIONS.USERS_UPDATE)}
        renderRowAction={
          // 미확정 기간도 직원별 draft 명세서를 미리 볼 수 있다 (서버가 DRAFT 표시)
          canExport
            ? (row) =>
                row.userId ? (
                  <PayStubActions
                    target={{
                      kind: "draft",
                      periodId: period.id,
                      userId: row.userId,
                    }}
                    memberName={row.name}
                  />
                ) : null
            : undefined
        }
      />
    </div>
  );
}
