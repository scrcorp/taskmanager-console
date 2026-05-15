"use client";

import { useEffect, useMemo, useState } from "react";
import { useSessionState } from "@/hooks/useSessionState";
import { useStores } from "@/hooks/useStores";
import { HiringStorePicker } from "@/components/hiring/StorePicker";
import { TipTabs, type TipTab } from "@/components/tips/TipTabs";
import { ReviewPanel } from "@/components/tips/ReviewPanel";
import { DistributionsPanel } from "@/components/tips/DistributionsPanel";
import { PeriodPanel } from "@/components/tips/PeriodPanel";
import { FormsPanel } from "@/components/tips/FormsPanel";
import { HistoryPanel } from "@/components/tips/HistoryPanel";
import { PeriodSelector } from "@/components/tips/PeriodSelector";
import { periodOf, type TipPeriod } from "@/lib/tipPeriod";

export default function TipsPage() {
  const { data: stores = [] } = useStores();

  const [selectedId, setSelectedId] = useSessionState<string | null>(
    "tips:selectedStoreId",
    null,
  );
  const [tab, setTab] = useSessionState<TipTab>("tips:tab", "period");
  const [period, setPeriod] = useState<TipPeriod>(() => periodOf(new Date()));

  useEffect(() => {
    if (stores.length === 0) return;
    if (!selectedId || !stores.some((s) => s.id === selectedId)) {
      setSelectedId(stores[0].id);
    }
  }, [stores, selectedId, setSelectedId]);

  const selected = useMemo(
    () => stores.find((s) => s.id === selectedId) ?? null,
    [stores, selectedId],
  );

  return (
    <div className="flex h-full">
      <HiringStorePicker
        stores={stores}
        selectedId={selectedId}
        onSelect={setSelectedId}
      />

      <div className="flex min-w-0 flex-1 flex-col bg-[#F5F6FA]">
        <div className="border-b border-[#E2E4EA] bg-white px-6 py-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-[#94A3B8]">
                Pay · Tips
              </p>
              <h1 className="mt-0.5 text-[18px] font-semibold text-[#1A1D27]">
                {selected ? selected.name : "Select a store"}
              </h1>
            </div>
            <PeriodSelector value={period} onChange={setPeriod} />
          </div>
        </div>

        <TipTabs active={tab} onSelect={setTab} />

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {!selected && (
            <p className="rounded-xl border border-dashed border-[#E2E4EA] bg-white p-10 text-center text-[13px] text-[#94A3B8]">
              Select a store to view tip entries.
            </p>
          )}

          {selected && tab === "period" && (
            <PeriodPanel storeId={selected.id} period={period} />
          )}
          {selected && tab === "review" && (
            <ReviewPanel storeId={selected.id} period={period} />
          )}
          {selected && tab === "distributions" && (
            <DistributionsPanel storeId={selected.id} period={period} />
          )}
          {selected && tab === "forms" && (
            <FormsPanel storeId={selected.id} period={period} />
          )}
          {selected && tab === "history" && (
            <HistoryPanel storeId={selected.id} />
          )}
        </div>
      </div>
    </div>
  );
}

