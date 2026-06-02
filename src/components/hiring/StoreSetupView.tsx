"use client";

import { useEffect, useMemo } from "react";
import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Store } from "@/types";
import { encodeUuid } from "@/lib/url-encoding";
import { usePersistedFilters } from "@/hooks/usePersistedFilters";
import { HiringStorePicker } from "./StorePicker";
import { LinkAndQrPanel } from "./LinkAndQrPanel";
import { CoverPhotosPanel } from "./CoverPhotosPanel";
import { QuestionsPanel } from "./QuestionsPanel";

type SetupTab = "link" | "photos" | "questions";

const SETUP_TABS: { key: SetupTab; label: string }[] = [
  { key: "questions", label: "Form" },
  { key: "photos", label: "Cover Photos" },
  { key: "link", label: "Link & QR" },
];

interface Props {
  stores: Store[];
  isLoading: boolean;
}

export function StoreSetupView({ stores, isLoading }: Props) {
  const [params, setParams] = usePersistedFilters("hiring.setup", {
    store: "",
    tab: "questions",
  });
  const selectedId = params.store || null;
  const tab = params.tab as SetupTab;
  const setSelectedId = (id: string | null): void => setParams({ store: id || null });
  const setTab = (t: SetupTab): void => setParams({ tab: t === "questions" ? null : t });

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
    <div className="flex h-[calc(100dvh-13rem)] overflow-hidden rounded-2xl border border-[#E2E4EA] bg-white">
      <HiringStorePicker
        stores={stores}
        selectedId={selectedId}
        onSelect={(id) => setSelectedId(id)}
      />

      <div className="flex flex-1 flex-col overflow-hidden">
        {selected ? (
          <>
            <div className="flex items-center justify-between border-b border-[#E2E4EA] px-6 py-3.5">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-[#94A3B8]">
                  Store setup
                </p>
                <h2 className="mt-0.5 text-[16px] font-semibold leading-tight text-[#1A1D27]">
                  {selected.name}
                </h2>
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

            <div className="flex items-center gap-1 border-b border-[#E2E4EA] px-6">
              {SETUP_TABS.map((t) => {
                const active = tab === t.key;
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setTab(t.key)}
                    className={cn(
                      "relative px-3 py-3 text-[13px] font-medium transition-colors",
                      active ? "text-[#6C5CE7]" : "text-[#64748B] hover:text-[#1A1D27]",
                    )}
                  >
                    {t.label}
                    {active && (
                      <span className="absolute bottom-0 left-3 right-3 h-0.5 bg-[#6C5CE7]" />
                    )}
                  </button>
                );
              })}
            </div>

            <div className="flex-1 overflow-y-auto bg-[#F5F6FA] p-6">
              {tab === "link" && <LinkAndQrPanel storeId={selected.id} />}
              {tab === "photos" && <CoverPhotosPanel storeId={selected.id} />}
              {tab === "questions" && <QuestionsPanel storeId={selected.id} />}
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center bg-[#F5F6FA]">
            <p className="text-[13px] text-[#94A3B8]">
              {isLoading ? "Loading stores…" : "No stores yet."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
