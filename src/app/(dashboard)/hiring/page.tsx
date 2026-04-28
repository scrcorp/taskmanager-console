"use client";

import { useEffect, useMemo, useState } from "react";
import { useStores } from "@/hooks/useStores";
import { HiringStorePicker } from "@/components/hiring/StorePicker";
import {
  HiringTabs,
  type HiringTab,
} from "@/components/hiring/HiringTabs";
import { LinkAndQrPanel } from "@/components/hiring/LinkAndQrPanel";
import { CoverPhotosPanel } from "@/components/hiring/CoverPhotosPanel";
import { Phase2Placeholder } from "@/components/hiring/Phase2Placeholder";
import { ExternalLink } from "lucide-react";
import { encodeUuid } from "@/lib/url-encoding";

export default function HiringPage() {
  const { data: stores = [], isLoading } = useStores();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<HiringTab>("link");

  // 첫 매장 자동 선택
  useEffect(() => {
    if (!selectedId && stores.length > 0) {
      setSelectedId(stores[0].id);
    }
  }, [stores, selectedId]);

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
        return (
          <Phase2Placeholder
            title="Custom screening questions"
            body="Configure per-store screening questions that applicants answer before their application is submitted. Adds an extra step to the public signup flow when enabled."
          />
        );
      case "applicants":
        return (
          <Phase2Placeholder
            title="Applicant inbox"
            body="Review applications, schedule interviews, and move candidates through your hiring pipeline."
          />
        );
      case "pipeline":
        return (
          <Phase2Placeholder
            title="Hiring pipeline"
            body="Drag applicants between stages to track progress. Auto-promotes to Staff when moved to Hired."
          />
        );
    }
  };

  return (
    <div className="flex h-[calc(100dvh-3rem)] overflow-hidden rounded-2xl bg-[#F5F6FA] ring-1 ring-[#E2E4EA]">
      <HiringStorePicker
        stores={stores}
        selectedId={selectedId}
        onSelect={(id) => {
          setSelectedId(id);
          setTab("link");
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

            <HiringTabs active={tab} onSelect={setTab} />

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
