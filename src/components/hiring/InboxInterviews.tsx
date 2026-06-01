"use client";

import { useState } from "react";
import { CalendarClock } from "lucide-react";
import { useApplicationsInbox } from "@/hooks/useHiring";
import { ApplicantDetailDrawer } from "./ApplicantDetailDrawer";
import { StoreBadge } from "./StoreBadge";

interface Props {
  storeId: string;
  q: string;
}

/** Interview 단계 지원자 큐 — 인터뷰 일정을 잡아야 하는 사람들을 한 곳에. */
export function InboxInterviews({ storeId, q }: Props) {
  const { data, isLoading } = useApplicationsInbox({
    storeId: storeId || undefined,
    q: q || undefined,
    stage: "interview",
    sort: "updated",
    perPage: 200,
  });
  const [selected, setSelected] = useState<{ id: string; storeId: string } | null>(null);

  const items = data?.items ?? [];
  const showStore = !storeId;

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-2xl border border-[#E2E4EA] bg-white">
        <div className="border-b border-[#E2E4EA] px-5 py-3.5">
          <h3 className="text-[13.5px] font-semibold text-[#1A1D27]">
            {items.length} to schedule
          </h3>
          <p className="mt-0.5 text-[11.5px] text-[#64748B]">
            Applicants in the interview stage. Open one to set the interview time or move
            them forward.
          </p>
        </div>

        {isLoading ? (
          <div className="px-5 py-10 text-center text-[12px] text-[#94A3B8]">Loading…</div>
        ) : items.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <CalendarClock className="mx-auto text-[#CBD5E1]" size={32} />
            <p className="mt-2 text-[12.5px] text-[#94A3B8]">No interviews to schedule.</p>
          </div>
        ) : (
          <ul className="divide-y divide-[#E2E4EA]">
            {items.map((a) => (
              <li
                key={a.id}
                onClick={() => setSelected({ id: a.id, storeId: a.store_id })}
                className="flex cursor-pointer items-center gap-3 px-5 py-3 transition-colors hover:bg-[#F5F6FA]"
              >
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-[rgba(59,141,217,0.12)] text-[11px] font-semibold text-[#3B8DD9]">
                  {a.candidate.full_name
                    .split(" ")
                    .map((n) => n[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-[#1A1D27]">
                    {a.candidate.full_name}
                  </p>
                  <p className="truncate text-[11px] text-[#94A3B8]">{a.candidate.email}</p>
                </div>
                {showStore && <StoreBadge name={a.store.name} id={a.store.id} variant="chip" />}
                <div className="flex-shrink-0 text-right">
                  {a.interview_at ? (
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-[rgba(59,141,217,0.12)] px-2.5 py-1 text-[11px] font-semibold text-[#3B8DD9]">
                      <CalendarClock size={12} />
                      {new Date(a.interview_at).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </span>
                  ) : (
                    <span className="rounded-full bg-[rgba(240,165,0,0.12)] px-2.5 py-1 text-[11px] font-semibold text-[#C28100]">
                      Not scheduled
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
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
