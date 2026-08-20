"use client";

import { Fragment, useState } from "react";
import { ChevronDown, ChevronRight, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { minutesToHours, money } from "@/lib/payrollFormat";
import { sumPayrollRows } from "@/lib/payrollTotals";
import { PENALTY_TERM_HINT } from "@/lib/payrollTerms";
import { BreakdownDetail } from "@/components/payroll/BreakdownDetail";
import { RateQuickEditModal } from "@/components/payroll/RateQuickEditModal";
import {
  PAYROLL_GATE,
  type EntryBreakdown,
  type PayPeriod,
  type PreviewValidation,
} from "@/types/payroll";

/** preview row / frozen entry 공용 표시 모델. */
export interface PayrollTableRow {
  key: string;
  name: string;
  /** 근태 딥링크용 — 동결 entry 는 사용자가 지워졌으면 null */
  userId: string | null;
  empid: number | null;
  crewid: number | null;
  regular_minutes: number;
  ot_minutes: number;
  dt_minutes: number;
  penalty_pay: string;
  card_tips: string;
  gross_pay: string;
  breakdown: EntryBreakdown;
  /** preview 전용 — 행 validation 배지 */
  validations?: PreviewValidation[];
  /** frozen 전용 — 0 이면 미표시 */
  revision?: number;
}

const BADGES: Record<string, { label: string; className: string }> = {
  [PAYROLL_GATE.RATE_MISSING]: {
    label: "No rate",
    className: "bg-[rgba(255,107,107,0.12)] text-[#FF6B6B]",
  },
  [PAYROLL_GATE.BELOW_MINIMUM_WAGE]: {
    label: "Below min wage",
    className: "bg-[rgba(255,107,107,0.12)] text-[#FF6B6B]",
  },
  [PAYROLL_GATE.OPEN_SHIFT]: {
    label: "Open shift",
    className: "bg-[rgba(240,165,0,0.12)] text-[#B45F06]",
  },
  [PAYROLL_GATE.UNCONFIRMED_AUTO_CLOCKOUT]: {
    label: "Auto clock-out",
    className: "bg-[rgba(240,165,0,0.12)] text-[#B45F06]",
  },
  [PAYROLL_GATE.TIP_PERIOD_NOT_CONFIRMED]: {
    label: "Tips provisional",
    className: "bg-[rgba(108,92,231,0.1)] text-[#6C5CE7]",
  },
};

/** breakdown segments → 고유 rate 표시 ("$16.00 · $17.50", 없으면 "—"). */
function ratesLabel(breakdown: EntryBreakdown): string {
  const rates = [
    ...new Set(
      breakdown.segments
        .map((s) => Number(s.rate))
        .filter((r) => Number.isFinite(r) && r > 0),
    ),
  ].sort((a, b) => a - b);
  if (rates.length === 0) return "—";
  return rates.map((r) => money(r)).join(" · ");
}

function Th({
  children,
  align = "left",
  title,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  title?: string;
}) {
  return (
    <th
      title={title}
      className={cn(
        "whitespace-nowrap border-b border-[#E2E4EA] px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-[#64748B]",
        align === "right" ? "text-right" : "text-left",
      )}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = "left",
  className,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  return (
    <td
      className={cn(
        "whitespace-nowrap border-b border-[#F0F1F5] px-3 py-2 text-[12px] text-[#1A1D27]",
        align === "right" && "text-right",
        className,
      )}
    >
      {children}
    </td>
  );
}

interface Props {
  title: string;
  rows: PayrollTableRow[];
  emptyMessage: string;
  /** 확장 상세의 근태 딥링크용 — 이 기간의 매장 */
  /** 확장 상세용 — 근태 딥링크(store)와 캘린더 기간 범위의 원천 */
  period: PayPeriod;
  /** frozen 뷰의 행 액션 (Pay Stub 버튼 등) */
  renderRowAction?: (row: PayrollTableRow) => React.ReactNode;
  /**
   * Rate 셀 인라인 편집 허용 — open preview 전용 (frozen 은 재계산이 없어
   * 오해만 부르므로 끔). 권한(users:update + GM+)은 호출측이 게이트.
   */
  rateEditable?: boolean;
}

/**
 * 직원별 payroll 테이블 (open preview / confirmed frozen 공용).
 * 행 클릭 확장 → BreakdownDetail (rate 구간·일별 상세·penalty 사유).
 */
export function PayrollTable({
  title,
  rows,
  emptyMessage,
  period,
  renderRowAction,
  rateEditable = false,
}: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  /** 인라인 rate 편집 대상 행 (null = 모달 닫힘) */
  const [rateTarget, setRateTarget] = useState<PayrollTableRow | null>(null);
  const colCount = renderRowAction ? 9 : 8;
  const totals = sumPayrollRows(rows);

  const toggle = (key: string): void => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  return (
    <div className="rounded-xl border border-[#E2E4EA] bg-white">
      <div className="border-b border-[#E2E4EA] px-4 py-2.5">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">
          {title}
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-[#F5F6FA]">
            <tr>
              <Th>Employee</Th>
              <Th align="right">Regular</Th>
              <Th align="right">OT</Th>
              <Th align="right">DT</Th>
              <Th align="right">Rate(s)</Th>
              <Th align="right" title={PENALTY_TERM_HINT}>
                Penalty
              </Th>
              <Th align="right">Card tips</Th>
              <Th align="right">Gross</Th>
              {renderRowAction && <Th align="right">Actions</Th>}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={colCount}
                  className="px-4 py-10 text-center text-[12px] text-[#94A3B8]"
                >
                  {emptyMessage}
                </td>
              </tr>
            )}
            {rows.map((row) => {
              const isOpen = expanded.has(row.key);
              return (
                <Fragment key={row.key}>
                  <tr
                    className="cursor-pointer hover:bg-[#FAFBFC]"
                    onClick={() => toggle(row.key)}
                  >
                    <Td>
                      <div className="flex items-center gap-2">
                        {isOpen ? (
                          <ChevronDown
                            size={14}
                            className="shrink-0 text-[#94A3B8]"
                          />
                        ) : (
                          <ChevronRight
                            size={14}
                            className="shrink-0 text-[#94A3B8]"
                          />
                        )}
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold">{row.name}</span>
                            {row.revision !== undefined && row.revision > 0 && (
                              <span className="rounded-full bg-[rgba(108,92,231,0.1)] px-1.5 py-0.5 text-[9px] font-bold uppercase text-[#6C5CE7]">
                                Rev {row.revision}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-[10.5px] text-[#94A3B8]">
                            {row.empid !== null && <span>EMPID {row.empid}</span>}
                            {row.crewid !== null && (
                              <span>CREWID {row.crewid}</span>
                            )}
                            {row.empid === null && row.crewid === null && (
                              <span>No ID</span>
                            )}
                          </div>
                          {row.validations && row.validations.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1">
                              {[...new Set(row.validations.map((v) => v.code))].map(
                                (code) => {
                                  const badge = BADGES[code];
                                  return (
                                    <span
                                      key={code}
                                      className={cn(
                                        "rounded-full px-1.5 py-0.5 text-[9.5px] font-semibold",
                                        badge?.className ??
                                          "bg-[#F0F1F5] text-[#64748B]",
                                      )}
                                    >
                                      {badge?.label ?? code}
                                    </span>
                                  );
                                },
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </Td>
                    <Td align="right">{minutesToHours(row.regular_minutes)}</Td>
                    <Td align="right">
                      {row.ot_minutes > 0 ? (
                        <span className="font-medium text-[#B45F06]">
                          {minutesToHours(row.ot_minutes)}
                        </span>
                      ) : (
                        "—"
                      )}
                    </Td>
                    <Td align="right">
                      {row.dt_minutes > 0 ? (
                        <span className="font-medium text-[#FF6B6B]">
                          {minutesToHours(row.dt_minutes)}
                        </span>
                      ) : (
                        "—"
                      )}
                    </Td>
                    <Td align="right">
                      {rateEditable && row.userId !== null ? (
                        (() => {
                          const label = ratesLabel(row.breakdown);
                          const noRate = row.validations?.some(
                            (v) => v.code === PAYROLL_GATE.RATE_MISSING,
                          );
                          return (
                            <button
                              type="button"
                              title="Set hourly rate"
                              onClick={(e) => {
                                // 확장 토글로 번지지 않게 차단
                                e.stopPropagation();
                                setRateTarget(row);
                              }}
                              className={cn(
                                "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 hover:bg-[#F0F1F5]",
                                noRate && "font-semibold text-[#FF6B6B]",
                              )}
                            >
                              {noRate ? "Set rate" : label}
                              <Pencil size={11} className="text-[#94A3B8]" />
                            </button>
                          );
                        })()
                      ) : (
                        ratesLabel(row.breakdown)
                      )}
                    </Td>
                    <Td align="right">
                      {Number(row.penalty_pay) > 0 ? (
                        <span className="text-[#B45F06]">
                          {money(row.penalty_pay)}
                        </span>
                      ) : (
                        "—"
                      )}
                    </Td>
                    <Td align="right">
                      {Number(row.card_tips) !== 0 ? money(row.card_tips) : "—"}
                    </Td>
                    <Td align="right" className="font-bold text-[#6C5CE7]">
                      {money(row.gross_pay)}
                    </Td>
                    {renderRowAction && (
                      <Td align="right">
                        {/* 행 액션 클릭이 확장 토글로 번지지 않게 차단 */}
                        <div onClick={(e) => e.stopPropagation()}>
                          {renderRowAction(row)}
                        </div>
                      </Td>
                    )}
                  </tr>
                  {isOpen && (
                    <tr>
                      <td
                        colSpan={colCount}
                        className="border-b border-[#F0F1F5] bg-white px-4 py-3"
                      >
                        <BreakdownDetail
                          breakdown={row.breakdown}
                          storeId={period.store_id}
                          periodStart={period.start_date}
                          periodEnd={period.end_date}
                          userId={row.userId}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>

          {/* 합계 — KPI 요약 행과 동일한 sumPayrollRows 결과 */}
          {rows.length > 0 && (
            <tfoot className="bg-[#F5F6FA]">
              <tr>
                <td className="whitespace-nowrap px-3 py-2.5 text-[12px] font-bold text-[#1A1D27]">
                  Total · {totals.employees}{" "}
                  {totals.employees === 1 ? "employee" : "employees"}
                </td>
                <FootTd>{minutesToHours(totals.regular_minutes)}</FootTd>
                <FootTd>
                  {totals.ot_minutes > 0
                    ? minutesToHours(totals.ot_minutes)
                    : "—"}
                </FootTd>
                <FootTd>
                  {totals.dt_minutes > 0
                    ? minutesToHours(totals.dt_minutes)
                    : "—"}
                </FootTd>
                <FootTd>—</FootTd>
                <FootTd>
                  {totals.penalty_pay > 0 ? money(totals.penalty_pay) : "—"}
                </FootTd>
                <FootTd>
                  {totals.card_tips !== 0 ? money(totals.card_tips) : "—"}
                </FootTd>
                <FootTd className="text-[#6C5CE7]">
                  {money(totals.gross_pay)}
                </FootTd>
                {renderRowAction && <FootTd> </FootTd>}
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {rateTarget && rateTarget.userId !== null && (
        <RateQuickEditModal
          isOpen
          onClose={() => setRateTarget(null)}
          userId={rateTarget.userId}
          name={rateTarget.name}
          currentRateLabel={
            ratesLabel(rateTarget.breakdown) === "—"
              ? null
              : ratesLabel(rateTarget.breakdown)
          }
          periodStart={period.start_date}
        />
      )}
    </div>
  );
}

function FootTd({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <td
      className={cn(
        "whitespace-nowrap px-3 py-2.5 text-right text-[12px] font-bold text-[#1A1D27]",
        className,
      )}
    >
      {children}
    </td>
  );
}
