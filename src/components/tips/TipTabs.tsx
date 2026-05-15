"use client";

import { cn } from "@/lib/utils";

export type TipTab = "period" | "review" | "distributions" | "forms" | "history";

export interface TipTabDef {
  key: TipTab;
  label: string;
  /** Stage 1 = available now, Stage 2/3 = coming soon */
  stage: 1 | 2 | 3;
}

export const TIP_TABS: TipTabDef[] = [
  { key: "period", label: "Period", stage: 1 },
  { key: "review", label: "Review", stage: 1 },
  { key: "distributions", label: "Distributions", stage: 1 },
  { key: "forms", label: "4070 Forms", stage: 1 },
  { key: "history", label: "History", stage: 1 },
];

interface Props {
  active: TipTab;
  onSelect: (key: TipTab) => void;
  counts?: Partial<Record<TipTab, number>>;
}

export function TipTabs({ active, onSelect, counts = {} }: Props) {
  return (
    <div className="flex items-center gap-1 border-b border-[#E2E4EA] bg-white px-6">
      {TIP_TABS.map((tab) => {
        const isActive = active === tab.key;
        const isComingSoon = tab.stage !== 1;
        const count = counts[tab.key];
        return (
          <button
            key={tab.key}
            type="button"
            disabled={isComingSoon}
            onClick={() => !isComingSoon && onSelect(tab.key)}
            className={cn(
              "group relative flex items-center gap-2 px-3 py-3.5 text-[13px] font-medium transition-colors",
              isActive && "text-[#6C5CE7]",
              !isActive && !isComingSoon && "text-[#64748B] hover:text-[#1A1D27]",
              isComingSoon && "cursor-not-allowed text-[#CBD2DA]",
            )}
            title={isComingSoon ? "Coming soon" : undefined}
          >
            <span>{tab.label}</span>
            {count !== undefined && (
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                  isActive
                    ? "bg-[#6C5CE7] text-white"
                    : "bg-[#F0F1F5] text-[#64748B]",
                )}
              >
                {count}
              </span>
            )}
            {isComingSoon && (
              <span className="rounded-full bg-[#F0F1F5] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-[#94A3B8]">
                Soon
              </span>
            )}
            {isActive && (
              <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-[#6C5CE7]" />
            )}
          </button>
        );
      })}
    </div>
  );
}
