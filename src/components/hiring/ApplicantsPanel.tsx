"use client";

import { useMemo, useState } from "react";
import { Inbox } from "lucide-react";
import {
  useApplications,
  type ApplicationStage,
} from "@/hooks/useHiring";
import { usePersistedFilters } from "@/hooks/usePersistedFilters";
import { ApplicantDetailDrawer } from "./ApplicantDetailDrawer";

interface Props {
  storeId: string;
}

const STAGE_LABEL: Record<ApplicationStage, string> = {
  pending_form: "Filling out",
  new: "New",
  reviewing: "Reviewing",
  interview: "Interview",
  hired: "Hired",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
};

const STAGE_STYLE: Record<ApplicationStage, string> = {
  pending_form: "bg-[#F0F1F5] text-[#94A3B8] ring-[#E2E4EA]",
  new: "bg-[rgba(108,92,231,0.1)] text-[#6C5CE7] ring-[rgba(108,92,231,0.2)]",
  reviewing: "bg-[rgba(240,165,0,0.12)] text-[#C28100] ring-[rgba(240,165,0,0.25)]",
  interview: "bg-[rgba(59,141,217,0.12)] text-[#3B8DD9] ring-[rgba(59,141,217,0.25)]",
  hired: "bg-[rgba(0,184,148,0.12)] text-[#00B894] ring-[rgba(0,184,148,0.25)]",
  rejected: "bg-[rgba(239,68,68,0.1)] text-[#EF4444] ring-[rgba(239,68,68,0.25)]",
  withdrawn: "bg-[#F0F1F5] text-[#64748B] ring-[#E2E4EA]",
};

const STAGE_FILTERS: { key: string; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "pending_form", label: "Filling out" },
  { key: "new", label: "New" },
  { key: "reviewing", label: "Reviewing" },
  { key: "interview", label: "Interview" },
  { key: "hired", label: "Hired" },
  { key: "rejected", label: "Rejected" },
  { key: "withdrawn", label: "Withdrawn" },
];

export function ApplicantsPanel({ storeId }: Props) {
  // 1계정 1데이터 — 매장 바꿔도 stage 필터는 그대로 유지. URL + localStorage + 서버 영속.
  const [params, setParams] = usePersistedFilters("hiring.applicants", {
    stage: "all",
  });
  const stageFilter = params.stage;
  const setStageFilter = (v: string): void => setParams({ stage: v === "all" ? null : v });
  const { data, isLoading } = useApplications(
    storeId,
    stageFilter === "all" ? undefined : stageFilter,
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const items = useMemo(() => data?.items ?? [], [data]);

  return (
    <div className="space-y-5">
      <div className="overflow-hidden rounded-2xl border border-[#E2E4EA] bg-white">
        <div className="flex items-center justify-between border-b border-[#E2E4EA] px-5 py-3.5">
          <div>
            <h3 className="text-[13.5px] font-semibold text-[#1A1D27]">
              {items.length} applicants
            </h3>
            <p className="mt-0.5 text-[11.5px] text-[#64748B]">
              Click a row to review details, change stage, or hire.
            </p>
          </div>
          <select
            value={stageFilter}
            onChange={(e) => setStageFilter(e.target.value)}
            className="rounded-lg border border-[#E2E4EA] bg-white px-2.5 py-1.5 text-[12px] outline-none focus:border-[#6C5CE7]"
          >
            {STAGE_FILTERS.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </select>
        </div>

        {isLoading ? (
          <div className="px-5 py-10 text-center text-[12px] text-[#94A3B8]">
            Loading…
          </div>
        ) : items.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <Inbox className="mx-auto text-[#CBD5E1]" size={32} />
            <p className="mt-2 text-[12.5px] text-[#94A3B8]">
              No applicants in this view.
            </p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#E2E4EA] bg-[#F5F6FA] text-[10.5px] font-semibold uppercase tracking-wider text-[#64748B]">
                <th className="px-5 py-2.5 text-left">Applicant</th>
                <th className="px-3 py-2.5 text-left">Applied</th>
                <th className="px-3 py-2.5 text-left">Attempt</th>
                <th className="px-3 py-2.5 text-left">Stage</th>
                <th className="px-3 py-2.5 text-right">Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E4EA]">
              {items.map((a) => (
                <tr
                  key={a.id}
                  onClick={() => setSelectedId(a.id)}
                  className="cursor-pointer transition-colors hover:bg-[#F5F6FA]"
                >
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[rgba(108,92,231,0.1)] text-[11px] font-semibold text-[#6C5CE7]">
                        {a.candidate.full_name
                          .split(" ")
                          .map((n) => n[0])
                          .join("")
                          .slice(0, 2)
                          .toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-medium text-[#1A1D27]">
                          {a.candidate.full_name}
                        </p>
                        <p className="truncate text-[11px] text-[#94A3B8]">
                          {a.candidate.email}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-[12px] text-[#64748B]">
                    {a.submitted_at.slice(0, 10)}
                  </td>
                  <td className="px-3 py-3 text-[12px] text-[#64748B]">
                    {a.attempt_no > 1 ? `#${a.attempt_no}` : "—"}
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={[
                        "inline-flex rounded-full px-2 py-0.5 text-[10.5px] font-semibold ring-1",
                        STAGE_STYLE[a.stage],
                      ].join(" ")}
                    >
                      {STAGE_LABEL[a.stage]}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-right">
                    {a.stage !== "pending_form" && a.score !== null ? (
                      <span className="font-mono text-[12.5px] font-semibold tabular-nums text-[#1A1D27]">
                        {a.score}
                      </span>
                    ) : (
                      <span className="text-[11px] text-[#94A3B8]">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {selectedId && (
        <ApplicantDetailDrawer
          storeId={storeId}
          applicationId={selectedId}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}
