"use client";

import { cn } from "@/lib/utils";
import { minutesToHours, money } from "@/lib/payrollFormat";
import { PENALTY_TERM_HINT } from "@/lib/payrollTerms";
import type { PayrollTotals } from "@/lib/payrollTotals";

function KpiTile({
  label,
  value,
  tone = "default",
  hint,
}: {
  label: string;
  value: string;
  tone?: "default" | "muted" | "danger" | "accent";
  /** 라벨 hover 설명 (용어 병기 등) */
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-[#E2E4EA] bg-white px-4 py-3">
      <p
        title={hint}
        className="text-[10px] font-semibold uppercase tracking-wider text-[#94A3B8]"
      >
        {label}
      </p>
      <p
        className={cn(
          "mt-1 text-[18px] font-bold",
          tone === "danger" && "text-[#FF6B6B]",
          tone === "accent" && "text-[#6C5CE7]",
          tone === "muted" && "text-[#94A3B8]",
          tone === "default" && "text-[#1A1D27]",
        )}
      >
        {value}
      </p>
    </div>
  );
}

interface Props {
  totals: PayrollTotals;
  /** gross 타일 라벨 — open 은 추정치라 "Est. gross". */
  grossLabel: string;
  /** open 뷰 전용 — 미해결 validation 수 (없으면 타일 생략). */
  issues?: number;
}

/**
 * 기간 합계 KPI 행 — open preview / confirmed 동결 entries 공용.
 * 테이블 합계 footer 와 같은 sumPayrollRows 결과를 쓴다 (두 값이 어긋나지 않게).
 */
export function PayrollSummary({ totals, grossLabel, issues }: Props) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <KpiTile label="Total hours" value={minutesToHours(totals.total_minutes)} />
      <KpiTile label="Regular" value={minutesToHours(totals.regular_minutes)} />
      <KpiTile
        label="Overtime"
        value={minutesToHours(totals.ot_minutes)}
        tone={totals.ot_minutes > 0 ? "default" : "muted"}
      />
      <KpiTile
        label="Doubletime"
        value={minutesToHours(totals.dt_minutes)}
        tone={totals.dt_minutes > 0 ? "default" : "muted"}
      />
      <KpiTile
        label="Penalties"
        value={money(totals.penalty_pay)}
        tone={totals.penalty_pay > 0 ? "default" : "muted"}
        hint={PENALTY_TERM_HINT}
      />
      <KpiTile
        label="Card tips"
        value={money(totals.card_tips)}
        tone={totals.card_tips !== 0 ? "default" : "muted"}
      />
      <KpiTile label={grossLabel} value={money(totals.gross_pay)} tone="accent" />
      {issues === undefined ? (
        <KpiTile label="Employees" value={String(totals.employees)} />
      ) : (
        <KpiTile
          label="Open issues"
          value={String(issues)}
          tone={issues > 0 ? "danger" : "default"}
        />
      )}
    </div>
  );
}
