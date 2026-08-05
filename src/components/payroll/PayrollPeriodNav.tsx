"use client";

import { ChevronLeft, ChevronRight, Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { payrollPeriodLabel } from "@/lib/payrollFormat";
import type { PayPeriod } from "@/types/payroll";

interface Props {
  /** start_date 오름차순 정렬된 기간 목록 */
  periods: PayPeriod[];
  /** 현재 선택 index (periods 기준) */
  index: number;
  onChange: (index: number) => void;
}

/** 반월 기간 prev/next 네비게이션 + 라벨 + 상태 pill. */
export function PayrollPeriodNav({ periods, index, onChange }: Props) {
  const current = periods[index];
  if (!current) return null;

  const isConfirmed = current.status === "confirmed";

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        aria-label="Previous period"
        disabled={index <= 0}
        onClick={() => onChange(index - 1)}
        className="rounded-lg border border-[#E2E4EA] bg-white p-1.5 text-[#64748B] shadow-sm hover:border-[#CBD2DA] disabled:cursor-not-allowed disabled:opacity-40"
      >
        <ChevronLeft size={16} />
      </button>

      <div className="flex min-w-[210px] items-center justify-center gap-2 rounded-lg border border-[#E2E4EA] bg-white px-3 py-1.5 shadow-sm">
        <span className="text-[13px] font-semibold text-[#1A1D27]">
          {payrollPeriodLabel(current.start_date, current.end_date)}
        </span>
        <span
          className={cn(
            "flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
            isConfirmed
              ? "bg-[rgba(0,184,148,0.12)] text-[#00A084]"
              : "bg-[rgba(108,92,231,0.1)] text-[#6C5CE7]",
          )}
        >
          {isConfirmed && <Lock size={10} />}
          {isConfirmed ? "Confirmed" : "Open"}
        </span>
      </div>

      <button
        type="button"
        aria-label="Next period"
        disabled={index >= periods.length - 1}
        onClick={() => onChange(index + 1)}
        className="rounded-lg border border-[#E2E4EA] bg-white p-1.5 text-[#64748B] shadow-sm hover:border-[#CBD2DA] disabled:cursor-not-allowed disabled:opacity-40"
      >
        <ChevronRight size={16} />
      </button>
    </div>
  );
}
