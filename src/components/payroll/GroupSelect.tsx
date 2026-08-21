"use client";

import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { StoreGroup } from "@/types";

interface Props {
  groups: StoreGroup[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  className?: string;
}

/**
 * 헤더 밴드용 컴팩트 법인(그룹) 선택 드롭다운 (Pay 계열 라이트 테마).
 *
 * 급여 스코프는 매장이 아니라 법인이다 (2026-08-19 group 전환) — payroll
 * 페이지의 최상위 선택이 그룹이 된다. StoreSelect 와 같은 시각 언어.
 */
export function GroupSelect({ groups, selectedId, onSelect, className }: Props) {
  const empty = groups.length === 0;

  return (
    <div className={cn("relative inline-flex items-center", className)}>
      <select
        aria-label="Corporation (store group)"
        value={selectedId ?? ""}
        disabled={empty}
        onChange={(e) => onSelect(e.target.value)}
        className="cursor-pointer appearance-none rounded-lg border border-[#E2E4EA] bg-white py-1.5 pl-3 pr-8 text-[15px] font-semibold text-[#1A1D27] shadow-sm transition-colors hover:border-[#CBD2DA] focus:border-[#6C5CE7] focus:outline-none focus:ring-2 focus:ring-[rgba(108,92,231,0.2)] disabled:cursor-not-allowed disabled:text-[#94A3B8]"
      >
        {empty && <option value="">No groups available</option>}
        {!empty && !selectedId && (
          <option value="" disabled>
            Select a group
          </option>
        )}
        {groups.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name}
            {g.code ? ` (${g.code})` : ""}
          </option>
        ))}
      </select>
      <ChevronDown
        size={15}
        className="pointer-events-none absolute right-2.5 text-[#94A3B8]"
      />
    </div>
  );
}
