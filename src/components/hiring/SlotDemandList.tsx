"use client";

import { useMemo } from "react";
import { useInterviewSlots } from "@/hooks/useInterviews";
import { cn } from "@/lib/utils";
import type { DateRange } from "./InterviewsView";

interface Props {
  range: DateRange | null;
  selectedAppId: string | null;
  selectedSlotId: string | null;
  selectedDate: string | null;
  onSelectSlot: (slotId: string, appIds: string[]) => void;
  onSelectDay: (date: string, appIds: string[]) => void;
}

function fmtTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const am = h < 12;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${am ? "AM" : "PM"}`;
}
function fmtDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

/** 슬롯별 수요/확정 (우측 패널) — 슬롯 클릭=그 시간을 원한/확정한 지원자 하이라이트. */
export function SlotDemandList({ range, selectedAppId, selectedSlotId, selectedDate, onSelectSlot, onSelectDay }: Props) {
  const { data, isLoading } = useInterviewSlots();

  const active = useMemo(() => {
    let rows = (data?.items ?? []).filter((s) => s.demand > 0 || s.confirmed);
    if (range) rows = rows.filter((s) => s.date >= range.start && s.date <= range.end);
    return rows;
  }, [data, range]);

  const byDate = useMemo(() => {
    const g: Record<string, typeof active> = {};
    for (const s of active) (g[s.date] ??= []).push(s);
    return Object.entries(g).sort(([a], [b]) => a.localeCompare(b));
  }, [active]);

  const slotAppIds = (s: (typeof active)[number]): string[] =>
    s.confirmed ? [s.confirmed.application_id] : s.wanters.map((w) => w.application_id);
  const involvesSelectedApp = (s: (typeof active)[number]): boolean =>
    !!selectedAppId && slotAppIds(s).includes(selectedAppId);

  return (
    <div className="overflow-hidden rounded-2xl border border-[#E2E4EA] bg-white">
      <div className="border-b border-[#E2E4EA] px-5 py-3.5">
        <h3 className="text-[13.5px] font-semibold text-[#1A1D27]">Slot demand &amp; bookings</h3>
        <p className="mt-0.5 text-[11.5px] text-[#64748B]">
          Click a time to highlight who wants it. (Org timezone.)
        </p>
      </div>
      {isLoading ? (
        <div className="px-5 py-8 text-center text-[12px] text-[#94A3B8]">Loading…</div>
      ) : active.length === 0 ? (
        <div className="px-5 py-8 text-center text-[12px] text-[#94A3B8]">
          {range ? "No demand in this range." : "No demand yet. Once applicants pick times, they show here."}
        </div>
      ) : (
        <div className="max-h-[62vh] divide-y divide-[#E2E4EA] overflow-y-auto">
          {byDate.map(([date, slots]) => {
            const dayAppIds = [...new Set(slots.flatMap(slotAppIds))];
            const dayOn = selectedDate === date;
            return (
            <div
              key={date}
              role="button"
              tabIndex={0}
              onClick={() => onSelectDay(date, dayAppIds)}
              title="Select this whole day"
              className={cn(
                "cursor-pointer px-5 py-3 transition-colors",
                dayOn ? "bg-[rgba(108,92,231,0.07)] shadow-[inset_3px_0_0_0_#6C5CE7]" : "hover:bg-black/[0.04]",
              )}
            >
              <div className="mb-2 flex items-center justify-between px-1.5">
                <span className={cn("text-[11px] font-semibold", dayOn ? "text-[#6C5CE7]" : "text-[#64748B]")}>
                  {fmtDate(date)}
                </span>
                <span className="text-[10.5px] font-medium text-[#94A3B8]">
                  {slots.length} time{slots.length === 1 ? "" : "s"}
                </span>
              </div>
              <div className="space-y-1.5">
                {slots.map((s) => {
                  const on = selectedSlotId === s.id || involvesSelectedApp(s);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={(e) => { e.stopPropagation(); onSelectSlot(s.id, slotAppIds(s)); }}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-lg border px-2 py-1.5 text-left transition-colors",
                        on
                          ? "border-[#6C5CE7] bg-[rgba(108,92,231,0.12)]"
                          : "border-[#E8EAF0] bg-white hover:bg-[#F8FAFC]",
                      )}
                    >
                      <span className="w-[72px] flex-shrink-0 text-[12.5px] font-medium text-[#1A1D27]">
                        {fmtTime(s.start)}
                      </span>
                      {s.confirmed ? (
                        <span className="flex min-w-0 flex-wrap items-center gap-1.5">
                          <span className="inline-flex items-center gap-1 rounded-full bg-[rgba(0,184,148,0.12)] px-2 py-0.5 text-[11px] font-semibold text-[#00B894]">
                            ✓ {s.confirmed.candidate_name}
                          </span>
                          <span className="text-[11px] text-[#94A3B8]">
                            w/ {s.confirmed.interviewer_name ?? "no interviewer"}
                          </span>
                        </span>
                      ) : (
                        <>
                          <span className="inline-flex items-center gap-1 rounded-full bg-[rgba(108,92,231,0.1)] px-2 py-0.5 text-[11px] font-semibold text-[#6C5CE7]">
                            {s.demand} want
                          </span>
                          {s.wanters.length > 0 && (
                            <span className="truncate text-[11px] text-[#94A3B8]">
                              {s.wanters.map((w) => w.candidate_name).join(", ")}
                            </span>
                          )}
                        </>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
