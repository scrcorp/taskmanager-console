"use client";

import { useEffect, useMemo, useState } from "react";
import { useSessionState } from "@/hooks/useSessionState";
import { useStores } from "@/hooks/useStores";
import { HiringStorePicker } from "@/components/hiring/StorePicker";
import {
  HiringTabs,
  type HiringTab,
} from "@/components/hiring/HiringTabs";
import { LinkAndQrPanel } from "@/components/hiring/LinkAndQrPanel";
import { CoverPhotosPanel } from "@/components/hiring/CoverPhotosPanel";
import { QuestionsPanel } from "@/components/hiring/QuestionsPanel";
import { ApplicantsPanel } from "@/components/hiring/ApplicantsPanel";
import { PipelinePanel } from "@/components/hiring/PipelinePanel";
import { ExternalLink } from "lucide-react";
import { encodeUuid } from "@/lib/url-encoding";
import { useApplications } from "@/hooks/useHiring";

export default function HiringPage() {
  const { data: stores = [], isLoading } = useStores();
  // sessionStorage 에 selectedId / tab 기억 — 새로고침/뒤로가기 시 복원, URL 은 안 건드림
  const [selectedId, setSelectedId] = useSessionState<string | null>(
    "hiring:selectedStoreId",
    null,
  );
  const [tab, setTab] = useSessionState<HiringTab>("hiring:tab", "link");

  // 매장 목록이 로드된 후, 저장된 id 가 유효하지 않으면 첫 매장으로 fallback
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

  const renderPanel = () => {
    if (!selected) {
      return (
        <div className="rounded-2xl border border-dashed border-[#E2E4EA] bg-white p-10 text-center text-[13px] text-[#94A3B8]">
          Select a store on the left to manage its hiring settings.
        </div>
      );
    }

    switch (tab) {
      case "link":
        return <LinkAndQrPanel storeId={selected.id} />;
      case "photos":
        return <CoverPhotosPanel storeId={selected.id} />;
      case "questions":
        return <QuestionsPanel storeId={selected.id} />;
      case "applicants":
        return <ApplicantsPanel storeId={selected.id} />;
      case "pipeline":
        return <PipelinePanel storeId={selected.id} />;
    }
  };

  // sub-tab 배지 카운트
  const { data: appsData } = useApplications(
    selected?.id,
    "active",
  );
  const tabCounts = {
    applicants: appsData?.items.length ?? 0,
  };

  return (
    <div className="flex h-[calc(100dvh-3rem)] overflow-hidden rounded-2xl bg-[#F5F6FA] ring-1 ring-[#E2E4EA]">
      <HiringStorePicker
        stores={stores}
        selectedId={selectedId}
        onSelect={(id) => {
          // 매장만 바꾸고 현재 탭은 유지 — Form 보다가 매장 비교할 때 편함
          setSelectedId(id);
        }}
      />

      <div className="flex flex-1 flex-col overflow-hidden bg-white">
        {selected ? (
          <>
            <div className="flex items-center justify-between border-b border-[#E2E4EA] bg-white px-6 py-4">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[#94A3B8]">
                  Operations · Hiring
                </p>
                <h1 className="mt-0.5 text-[18px] font-semibold leading-tight text-[#1A1D27]">
                  {selected.name}
                </h1>
              </div>
              <a
                href={`/join/${encodeUuid(selected.id)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 rounded-lg border border-[#E2E4EA] bg-white px-3 py-1.5 text-[12px] font-medium text-[#64748B] transition-colors hover:bg-[#F0F1F5]"
              >
                <ExternalLink size={14} />
                View signup page
              </a>
            </div>

            <HiringTabs active={tab} onSelect={setTab} counts={tabCounts} />

            <div className="flex-1 overflow-y-auto bg-[#F5F6FA] p-6">
              {renderPanel()}
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center bg-[#F5F6FA] px-6">
            {isLoading ? (
              <p className="text-[13px] text-[#94A3B8]">Loading stores…</p>
            ) : (
              <p className="text-[13px] text-[#94A3B8]">No stores yet.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
