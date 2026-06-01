"use client";

import { useState } from "react";
import { Inbox } from "lucide-react";
import { useApplicationsInbox } from "@/hooks/useHiring";
import { usePersistedFilters } from "@/hooks/usePersistedFilters";
import { ApplicantDetailDrawer } from "./ApplicantDetailDrawer";
import { StageBadge } from "./StageBadge";
import { StoreBadge } from "./StoreBadge";

interface Props {
  /** "" = all accessible stores */
  storeId: string;
  q: string;
}

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

const PER_PAGE = 25;

export function InboxApplicantsTable({ storeId, q }: Props) {
  const [params, setParams] = usePersistedFilters("hiring.inbox", {
    stage: "active",
  });
  const stageFilter = params.stage;
  const setStageFilter = (v: string): void =>
    setParams({ stage: v === "active" ? null : v });

  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<{ id: string; storeId: string } | null>(null);

  const { data, isLoading, isFetching } = useApplicationsInbox({
    storeId: storeId || undefined,
    stage: stageFilter,
    q: q || undefined,
    page,
    perPage: PER_PAGE,
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const pages = data?.pages ?? 0;
  const showStoreCol = !storeId; // 단일 매장 필터 중엔 STORE 컬럼 숨김

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-2xl border border-[#E2E4EA] bg-white">
        <div className="flex items-center justify-between border-b border-[#E2E4EA] px-5 py-3.5">
          <div>
            <h3 className="text-[13.5px] font-semibold text-[#1A1D27]">
              {total} applicant{total === 1 ? "" : "s"}
              {isFetching && <span className="ml-2 text-[11px] font-normal text-[#94A3B8]">updating…</span>}
            </h3>
            <p className="mt-0.5 text-[11.5px] text-[#64748B]">
              Across all stores you manage. Click a row to review, change stage, or hire.
            </p>
          </div>
          <select
            value={stageFilter}
            onChange={(e) => {
              setStageFilter(e.target.value);
              setPage(1);
            }}
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
          <div className="px-5 py-10 text-center text-[12px] text-[#94A3B8]">Loading…</div>
        ) : items.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <Inbox className="mx-auto text-[#CBD5E1]" size={32} />
            <p className="mt-2 text-[12.5px] text-[#94A3B8]">No applicants in this view.</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#E2E4EA] bg-[#F5F6FA] text-[10.5px] font-semibold uppercase tracking-wider text-[#64748B]">
                <th className="px-5 py-2.5 text-left">Applicant</th>
                {showStoreCol && <th className="px-3 py-2.5 text-left">Store</th>}
                <th className="px-3 py-2.5 text-left">Applied</th>
                <th className="px-3 py-2.5 text-left">Stage</th>
                <th className="px-3 py-2.5 text-right">Score</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E4EA]">
              {items.map((a) => (
                <tr
                  key={a.id}
                  onClick={() => setSelected({ id: a.id, storeId: a.store_id })}
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
                        <p className="truncate text-[11px] text-[#94A3B8]">{a.candidate.email}</p>
                      </div>
                    </div>
                  </td>
                  {showStoreCol && (
                    <td className="px-3 py-3">
                      <StoreBadge name={a.store.name} id={a.store.id} variant="chip" />
                    </td>
                  )}
                  <td className="px-3 py-3 text-[12px] text-[#64748B]">
                    {a.submitted_at.slice(0, 10)}
                  </td>
                  <td className="px-3 py-3">
                    <StageBadge stage={a.stage} />
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

        {pages > 1 && (
          <div className="flex items-center justify-between border-t border-[#E2E4EA] px-5 py-2.5">
            <span className="text-[11.5px] text-[#94A3B8]">
              Page {page} of {pages}
            </span>
            <div className="flex gap-1.5">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="rounded-lg border border-[#E2E4EA] px-2.5 py-1 text-[12px] font-medium text-[#64748B] disabled:opacity-40 enabled:hover:bg-[#F5F6FA]"
              >
                Prev
              </button>
              <button
                type="button"
                disabled={page >= pages}
                onClick={() => setPage((p) => Math.min(pages, p + 1))}
                className="rounded-lg border border-[#E2E4EA] px-2.5 py-1 text-[12px] font-medium text-[#64748B] disabled:opacity-40 enabled:hover:bg-[#F5F6FA]"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {selected && (
        <ApplicantDetailDrawer
          storeId={selected.storeId}
          applicationId={selected.id}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
