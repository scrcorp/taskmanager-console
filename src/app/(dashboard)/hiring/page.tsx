"use client";

import { Inbox, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useStores } from "@/hooks/useStores";
import { usePersistedFilters } from "@/hooks/usePersistedFilters";
import { InboxView } from "@/components/hiring/InboxView";
import { StoreSetupView } from "@/components/hiring/StoreSetupView";

type Segment = "inbox" | "setup";

const SEGMENTS: { key: Segment; label: string; icon: typeof Inbox }[] = [
  { key: "inbox", label: "Inbox", icon: Inbox },
  { key: "setup", label: "Store Setup", icon: Settings2 },
];

export default function HiringPage() {
  const { data: stores = [], isLoading } = useStores();
  const [params, setParams] = usePersistedFilters("hiring", { seg: "inbox" });
  const seg = params.seg as Segment;
  const setSeg = (s: Segment): void => setParams({ seg: s === "inbox" ? null : s });

  return (
    <div className="flex h-full flex-col gap-5 px-1 py-1">
      {/* header + segment switch */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[#94A3B8]">
            Operations
          </p>
          <h1 className="mt-0.5 text-[20px] font-semibold leading-tight text-[#1A1D27]">
            Hiring
          </h1>
        </div>

        <div className="inline-flex items-center gap-1 rounded-2xl border border-[#E2E4EA] bg-white p-1">
          {SEGMENTS.map((s) => {
            const Icon = s.icon;
            const active = seg === s.key;
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => setSeg(s.key)}
                className={cn(
                  "flex items-center gap-2 rounded-xl px-3.5 py-2 transition-colors",
                  active ? "bg-[#6C5CE7] text-white" : "text-[#64748B] hover:bg-[#F5F6FA]",
                )}
              >
                <Icon size={16} className="flex-shrink-0" />
                <span className="text-[13px] font-semibold leading-tight">{s.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* segment body */}
      <div className="min-h-0 flex-1 overflow-y-auto pb-2">
        {seg === "inbox" ? (
          <InboxView stores={stores} />
        ) : (
          <StoreSetupView stores={stores} isLoading={isLoading} />
        )}
      </div>
    </div>
  );
}
