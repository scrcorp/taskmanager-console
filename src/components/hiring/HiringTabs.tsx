"use client";

import { cn } from "@/lib/utils";

export type HiringTab =
  | "link"
  | "photos"
  | "questions"
  | "applicants"
  | "pipeline";

export interface HiringTabDef {
  key: HiringTab;
  label: string;
  phase: 1 | 2;
  count?: number;
}

export const HIRING_TABS: HiringTabDef[] = [
  { key: "link", label: "Link & QR", phase: 1 },
  { key: "photos", label: "Cover Photos", phase: 1 },
  { key: "questions", label: "Screening Questions", phase: 2 },
  { key: "applicants", label: "Applicants", phase: 2 },
  { key: "pipeline", label: "Pipeline", phase: 2 },
];

interface Props {
  active: HiringTab;
  onSelect: (key: HiringTab) => void;
  counts?: Partial<Record<HiringTab, number>>;
}

export function HiringTabs({ active, onSelect, counts = {} }: Props) {
  return (
    <div className="flex items-center gap-1 border-b border-[#E2E4EA] bg-white px-6">
      {HIRING_TABS.map((tab) => {
        const isActive = active === tab.key;
        const isPhase2 = tab.phase === 2;
        const count = counts[tab.key];
        return (
          <button
            key={tab.key}
            type="button"
            onClick={() => onSelect(tab.key)}
            className={cn(
              "group relative flex items-center gap-2 px-3 py-3.5 text-[13px] font-medium transition-colors",
              isActive ? "text-[#6C5CE7]" : "text-[#64748B] hover:text-[#1A1D27]",
            )}
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
            {isPhase2 && (
              <span className="rounded-full bg-[rgba(240,165,0,0.12)] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-[#C28100] ring-1 ring-[rgba(240,165,0,0.2)]">
                Soon
              </span>
            )}
            {isActive && (
              <span className="absolute bottom-0 left-3 right-3 h-0.5 bg-[#6C5CE7]" />
            )}
          </button>
        );
      })}
    </div>
  );
}
