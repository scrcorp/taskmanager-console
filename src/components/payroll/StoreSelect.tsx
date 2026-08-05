"use client";

import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Store } from "@/types";

interface Props {
  stores: Store[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  className?: string;
}

/**
 * 헤더 밴드용 컴팩트 매장 선택 드롭다운 (Pay 계열 라이트 테마).
 *
 * 좌측 매장 목록 컬럼 대신 헤더 한 줄에 들어가, 매장 전환이 페이지 전체
 * 리셋처럼 보이지 않게 한다. 페이지 제목(매장명) 역할도 겸한다.
 */
export function StoreSelect({
  stores,
  selectedId,
  onSelect,
  className,
}: Props) {
  const empty = stores.length === 0;

  return (
    <div className={cn("relative inline-flex items-center", className)}>
      <select
        aria-label="Store"
        value={selectedId ?? ""}
        disabled={empty}
        onChange={(e) => onSelect(e.target.value)}
        className="cursor-pointer appearance-none rounded-lg border border-[#E2E4EA] bg-white py-1.5 pl-3 pr-8 text-[15px] font-semibold text-[#1A1D27] shadow-sm transition-colors hover:border-[#CBD2DA] focus:border-[#6C5CE7] focus:outline-none focus:ring-2 focus:ring-[rgba(108,92,231,0.2)] disabled:cursor-not-allowed disabled:text-[#94A3B8]"
      >
        {empty && <option value="">No stores available</option>}
        {!empty && !selectedId && (
          <option value="" disabled>
            Select a store
          </option>
        )}
        {stores.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
            {s.is_active ? "" : " (paused)"}
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
