"use client";

import type { ApplicationStage } from "@/hooks/useHiring";

export const STAGE_LABEL: Record<ApplicationStage, string> = {
  pending_form: "Filling out",
  new: "New",
  reviewing: "Reviewing",
  interview: "Interview",
  hired: "Hired",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
};

export const STAGE_STYLE: Record<ApplicationStage, string> = {
  pending_form: "bg-[#F0F1F5] text-[#94A3B8] ring-[#E2E4EA]",
  new: "bg-[rgba(108,92,231,0.1)] text-[#6C5CE7] ring-[rgba(108,92,231,0.2)]",
  reviewing: "bg-[rgba(240,165,0,0.12)] text-[#C28100] ring-[rgba(240,165,0,0.25)]",
  interview: "bg-[rgba(59,141,217,0.12)] text-[#3B8DD9] ring-[rgba(59,141,217,0.25)]",
  hired: "bg-[rgba(0,184,148,0.12)] text-[#00B894] ring-[rgba(0,184,148,0.25)]",
  rejected: "bg-[rgba(239,68,68,0.1)] text-[#EF4444] ring-[rgba(239,68,68,0.25)]",
  withdrawn: "bg-[#F0F1F5] text-[#64748B] ring-[#E2E4EA]",
};

/** Stage 라벨 chip — 인박스/테이블/칸반 어디서나 동일하게. */
export function StageBadge({ stage }: { stage: ApplicationStage }) {
  return (
    <span
      className={[
        "inline-flex rounded-full px-2 py-0.5 text-[10.5px] font-semibold ring-1",
        STAGE_STYLE[stage],
      ].join(" ")}
    >
      {STAGE_LABEL[stage]}
    </span>
  );
}
