"use client";

import { useState } from "react";
import { Search, Users, Eye, CalendarClock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Store } from "@/types";
import { useApplicationsInbox, type ApplicationStage } from "@/hooks/useHiring";
import { usePersistedFilters } from "@/hooks/usePersistedFilters";
import { InboxApplicantsTable } from "./InboxApplicantsTable";
import { InboxPipeline } from "./InboxPipeline";
import { InterviewsView } from "./InterviewsView";

type InboxTab = "applicants" | "pipeline" | "interviews";

const SUB_TABS: { key: InboxTab; label: string; icon: typeof Users }[] = [
  { key: "applicants", label: "Applicants", icon: Users },
  { key: "pipeline", label: "Pipeline", icon: Eye },
  { key: "interviews", label: "Interviews", icon: CalendarClock },
];

// summary strip — 한눈에 들어오는 단계별 카운트.
const SUMMARY: { stage: ApplicationStage; label: string; dot: string; text: string }[] = [
  { stage: "new", label: "New", dot: "bg-[#6C5CE7]", text: "text-[#6C5CE7]" },
  { stage: "screen", label: "Screen", dot: "bg-[#C28100]", text: "text-[#C28100]" },
  { stage: "interview", label: "Interview", dot: "bg-[#3B8DD9]", text: "text-[#3B8DD9]" },
  { stage: "review", label: "Review", dot: "bg-[#7C3AED]", text: "text-[#7C3AED]" },
];

interface Props {
  stores: Store[];
}

export function InboxView({ stores }: Props) {
  const [params, setParams] = usePersistedFilters("hiring.inboxnav", {
    sub: "applicants",
    store: "",
  });
  const sub = params.sub as InboxTab;
  const storeFilter = params.store; // "" = all
  const setSub = (s: InboxTab): void => setParams({ sub: s === "applicants" ? null : s });
  const setStoreFilter = (id: string): void => setParams({ store: id || null });

  const [q, setQ] = useState("");
  // applicants 테이블과 공유하는 stage 필터 키 — summary chip 클릭으로 제어.
  const [, setStageParams] = usePersistedFilters("hiring.inbox", { stage: "active" });

  const { data } = useApplicationsInbox({
    storeId: storeFilter || undefined,
    q: q || undefined,
    perPage: 1,
  });
  const counts = data?.counts;

  const jumpToStage = (stage: ApplicationStage): void => {
    setStageParams({ stage });
    setSub("applicants");
  };

  return (
    <div className="space-y-5">
      {/* summary strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {SUMMARY.map((s) => (
          <button
            key={s.stage}
            type="button"
            onClick={() => jumpToStage(s.stage)}
            className="group flex items-center justify-between rounded-2xl border border-[#E2E4EA] bg-white px-4 py-3 text-left transition-colors hover:border-[#CBD5E1] hover:bg-[#FAFBFC]"
          >
            <div>
              <div className="flex items-center gap-1.5">
                <span className={cn("h-2 w-2 rounded-full", s.dot)} />
                <span className="text-[11.5px] font-medium text-[#64748B]">{s.label}</span>
              </div>
              <p className={cn("mt-1 text-[22px] font-semibold leading-none tabular-nums", s.text)}>
                {counts?.[s.stage] ?? 0}
              </p>
            </div>
          </button>
        ))}
      </div>

      {/* filter bar */}
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="inline-flex items-center gap-1 rounded-xl border border-[#E2E4EA] bg-white p-1">
          {SUB_TABS.map((t) => {
            const Icon = t.icon;
            const active = sub === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setSub(t.key)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition-colors",
                  active
                    ? "bg-[#6C5CE7] text-white"
                    : "text-[#64748B] hover:bg-[#F5F6FA] hover:text-[#1A1D27]",
                )}
              >
                <Icon size={14} />
                {t.label}
              </button>
            );
          })}
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2.5">
          <select
            value={storeFilter}
            onChange={(e) => setStoreFilter(e.target.value)}
            className="rounded-xl border border-[#E2E4EA] bg-white px-3 py-2 text-[12.5px] outline-none focus:border-[#6C5CE7]"
          >
            <option value="">All stores</option>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>

          <div className="relative">
            <Search
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]"
            />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name or email"
              className="w-[210px] rounded-xl border border-[#E2E4EA] bg-white py-2 pl-8 pr-3 text-[12.5px] outline-none placeholder:text-[#94A3B8] focus:border-[#6C5CE7]"
            />
          </div>
        </div>
      </div>

      {/* sub-view */}
      {sub === "applicants" ? (
        <InboxApplicantsTable storeId={storeFilter} q={q} />
      ) : sub === "pipeline" ? (
        <InboxPipeline storeId={storeFilter} q={q} />
      ) : (
        <InterviewsView storeId={storeFilter} q={q} />
      )}
    </div>
  );
}
