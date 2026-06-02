"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { useApplicationsInbox } from "@/hooks/useHiring";
import { InboxInterviews } from "./InboxInterviews";
import { SlotsPanel } from "./SlotsPanel";
import { SlotDemandList } from "./SlotDemandList";
import { InterviewConfirmModal } from "./InterviewConfirmModal";

interface Props {
  storeId: string;
  q: string;
}

type Tab = "overview" | "availability";
type DateFilter = "all" | "today" | "tomorrow" | "week";

// ── date helpers (org tz, week = Sun→Sat) ──
function ymdInTz(d: Date, tz: string): string {
  // en-CA → YYYY-MM-DD
  return d.toLocaleDateString("en-CA", tz ? { timeZone: tz } : undefined);
}
function addYmd(ymd: string, n: number): string {
  const d = new Date(ymd + "T00:00:00");
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export interface DateRange {
  start: string;
  end: string;
}

/** Inbox → Interviews. Overview(좌우 2단 운영 보드) + Set availability(슬롯 편집기). */
export function InterviewsView({ storeId, q }: Props) {
  const [tab, setTab] = useState<Tab>("overview");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  // 크로스 하이라이트 상태
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [highlightAppIds, setHighlightAppIds] = useState<Set<string>>(new Set());

  // org tz (날짜 필터 범위 계산용) — InboxInterviews와 동일 쿼리라 dedupe됨
  const { data: inbox } = useApplicationsInbox({
    storeId: storeId || undefined,
    q: q || undefined,
    stage: "interview",
    sort: "updated",
    perPage: 200,
  });
  const orgTz = inbox?.org_timezone ?? "";
  const selectedName = inbox?.items.find((a) => a.id === selectedAppId)?.candidate.full_name ?? "";

  const range: DateRange | null = useMemo(() => {
    if (dateFilter === "all") return null;
    const today = ymdInTz(new Date(), orgTz);
    if (dateFilter === "today") return { start: today, end: today };
    if (dateFilter === "tomorrow") {
      const t = addYmd(today, 1);
      return { start: t, end: t };
    }
    // week: Sun..Sat containing today
    const dow = new Date(today + "T00:00:00").getDay();
    const start = addYmd(today, -dow);
    return { start, end: addYmd(start, 6) };
  }, [dateFilter, orgTz]);

  const selectApp = (id: string) => {
    setSelectedAppId((cur) => (cur === id ? null : id));
    setSelectedSlotId(null);
    setSelectedDate(null);
    setHighlightAppIds(new Set());
  };
  const selectSlot = (slotId: string, appIds: string[]) => {
    setSelectedSlotId((cur) => (cur === slotId ? null : slotId));
    setSelectedAppId(null);
    setSelectedDate(null);
    setHighlightAppIds(selectedSlotId === slotId ? new Set() : new Set(appIds));
  };
  const selectDay = (date: string, appIds: string[]) => {
    const off = selectedDate === date;
    setSelectedDate(off ? null : date);
    setSelectedAppId(null);
    setSelectedSlotId(null);
    setHighlightAppIds(off ? new Set() : new Set(appIds));
  };

  const FILTERS: { key: DateFilter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "today", label: "Today" },
    { key: "tomorrow", label: "Tomorrow" },
    { key: "week", label: "This week" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex items-center gap-1 rounded-xl border border-[#E2E4EA] bg-white p-1">
          {([
            { key: "overview", label: "Overview" },
            { key: "availability", label: "Set availability" },
          ] as { key: Tab; label: string }[]).map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={cn(
                "rounded-lg px-3.5 py-1.5 text-[12.5px] font-medium transition-colors",
                tab === t.key ? "bg-[#6C5CE7] text-white" : "text-[#64748B] hover:bg-[#F5F6FA]",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "overview" && (
          <div className="inline-flex items-center gap-1 rounded-xl border border-[#E2E4EA] bg-white p-1">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setDateFilter(f.key)}
                className={cn(
                  "rounded-lg px-3 py-1.5 text-[12px] font-medium transition-colors",
                  dateFilter === f.key ? "bg-[#1A1D27] text-white" : "text-[#64748B] hover:bg-[#F5F6FA]",
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {tab === "overview" ? (
        <div className="grid items-start gap-4 lg:grid-cols-2">
          <InboxInterviews
            storeId={storeId}
            q={q}
            range={range}
            selectedAppId={selectedAppId}
            highlightAppIds={highlightAppIds}
            onSelectApp={selectApp}
          />
          {selectedAppId ? (
            <InterviewConfirmModal
              key={selectedAppId}
              inline
              applicationId={selectedAppId}
              candidateName={selectedName}
              onClose={() => setSelectedAppId(null)}
            />
          ) : (
            <SlotDemandList
              range={range}
              selectedAppId={selectedAppId}
              selectedSlotId={selectedSlotId}
              selectedDate={selectedDate}
              onSelectSlot={selectSlot}
              onSelectDay={selectDay}
            />
          )}
        </div>
      ) : (
        <SlotsPanel />
      )}
    </div>
  );
}
