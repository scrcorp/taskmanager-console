"use client";

import { useMemo, useState } from "react";
import { CalendarClock } from "lucide-react";
import { useApplicationsInbox } from "@/hooks/useHiring";
import { ApplicantDetailDrawer } from "./ApplicantDetailDrawer";
import { InterviewStepper, effectiveSubstatus } from "./InterviewStepper";
import { storeColor } from "./StoreBadge";
import { cn } from "@/lib/utils";
import type { DateRange } from "./InterviewsView";

interface Props {
  storeId: string;
  q: string;
  range: DateRange | null;
  selectedAppId: string | null;
  highlightAppIds: Set<string>;
  onSelectApp: (id: string) => void;
}

/** Interview 단계 지원자 큐 (좌측 패널) — 행 클릭=선택/하이라이트, 버튼=스케줄 모달. */
export function InboxInterviews({ storeId, q, range, selectedAppId, highlightAppIds, onSelectApp }: Props) {
  const { data, isLoading } = useApplicationsInbox({
    storeId: storeId || undefined,
    q: q || undefined,
    stage: "interview",
    sort: "updated",
    perPage: 200,
  });
  const [selected, setSelected] = useState<{ id: string; storeId: string } | null>(null);

  const showStore = !storeId;
  const orgTz = data?.org_timezone;

  const items = useMemo(() => {
    const all = data?.items ?? [];
    if (!range) return all;
    return all.filter((a) => {
      if (!a.interview_at) return false;
      const d = new Date(a.interview_at).toLocaleDateString("en-CA", orgTz ? { timeZone: orgTz } : undefined);
      return d >= range.start && d <= range.end;
    });
  }, [data, range, orgTz]);

  return (
    <div>
      <div className="overflow-hidden rounded-2xl border border-[#E2E4EA] bg-white">
        <div className="border-b border-[#E2E4EA] px-5 py-3.5">
          <h3 className="text-[13.5px] font-semibold text-[#1A1D27]">{items.length} to schedule</h3>
          <p className="mt-0.5 text-[11.5px] text-[#64748B]">
            Click an applicant to manage their interview. Details opens the full profile.
          </p>
        </div>

        {isLoading ? (
          <div className="px-5 py-10 text-center text-[12px] text-[#94A3B8]">Loading…</div>
        ) : items.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <CalendarClock className="mx-auto text-[#CBD5E1]" size={32} />
            <p className="mt-2 text-[12.5px] text-[#94A3B8]">
              {range ? "No interviews in this range." : "No interviews to schedule."}
            </p>
          </div>
        ) : (
          <ul className="max-h-[62vh] divide-y divide-[#E2E4EA] overflow-y-auto">
            {items.map((a) => {
              const eff = effectiveSubstatus(a.interview_substatus, a.interview_at);
              const confirmed = eff === "confirmed" || eff === "completed";
              const active = selectedAppId === a.id || highlightAppIds.has(a.id);
              return (
                <li
                  key={a.id}
                  onClick={() => onSelectApp(a.id)}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 px-5 py-3 transition-colors",
                    active
                      ? "bg-[rgba(108,92,231,0.07)] shadow-[inset_3px_0_0_0_#6C5CE7]"
                      : "hover:bg-black/[0.03]",
                  )}
                >
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-[rgba(59,141,217,0.12)] text-[11px] font-semibold text-[#3B8DD9]">
                    {a.candidate.full_name.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 truncate text-[13px] font-medium text-[#1A1D27]">
                      {a.candidate.full_name}
                      {showStore && (
                        <span className="inline-flex items-center gap-1 text-[10.5px] font-normal text-[#94A3B8]">
                          <span className="h-1.5 w-1.5 rounded-full" style={{ background: storeColor(a.store.id) }} />
                          {a.store.name}
                        </span>
                      )}
                    </p>
                    <p className="truncate text-[11px] text-[#94A3B8]">{a.candidate.email}</p>
                    <div className="mt-1.5 flex items-center gap-2">
                      <InterviewStepper status={eff} compact />
                      {confirmed && (
                        <span className="text-[10.5px] text-[#64748B]">
                          · {a.interviewer_name ? a.interviewer_name : "No interviewer"}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-shrink-0 flex-col items-end gap-1.5">
                    {confirmed && a.interview_at && (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-[rgba(0,184,148,0.12)] px-2.5 py-1 text-[11px] font-semibold text-[#00B894]">
                        <CalendarClock size={12} />
                        {new Date(a.interview_at).toLocaleString(undefined, {
                          month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
                          ...(orgTz ? { timeZone: orgTz } : {}),
                        })}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setSelected({ id: a.id, storeId: a.store.id }); }}
                      className="rounded-lg border border-[#E2E4EA] px-3 py-1.5 text-[11.5px] font-semibold text-[#64748B] hover:bg-[#F5F6FA]"
                    >
                      Details
                    </button>
                  </div>
                </li>
              );
            })}
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
