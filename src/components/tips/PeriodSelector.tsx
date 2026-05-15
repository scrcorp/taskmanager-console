"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { recentPeriods, type TipPeriod } from "@/lib/tipPeriod";

interface Props {
  value: TipPeriod;
  onChange: (period: TipPeriod) => void;
}

export function PeriodSelector({ value, onChange }: Props) {
  const [open, setOpen] = useState<boolean>(false);
  const periods = recentPeriods(8);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-lg border border-[#E2E4EA] bg-white px-3 py-2 text-[13px] font-medium text-[#1A1D27] shadow-sm hover:border-[#CBD2DA]"
      >
        <span>{value.label}</span>
        <ChevronDown size={14} className="text-[#94A3B8]" />
      </button>
      {open && (
        <>
          <button
            type="button"
            aria-label="Close period selector"
            className="fixed inset-0 z-10"
            onClick={() => setOpen(false)}
          />
          <ul className="absolute left-0 top-[calc(100%+4px)] z-20 w-[240px] overflow-hidden rounded-xl border border-[#E2E4EA] bg-white py-1 shadow-lg">
            {periods.map((p) => {
              const isActive = p.start === value.start && p.end === value.end;
              return (
                <li key={`${p.start}_${p.end}`}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(p);
                      setOpen(false);
                    }}
                    className={cn(
                      "block w-full px-3 py-2 text-left text-[13px] hover:bg-[#F5F6FA]",
                      isActive && "bg-[rgba(108,92,231,0.08)] font-semibold text-[#6C5CE7]",
                    )}
                  >
                    {p.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
