"use client";

import { cn } from "@/lib/utils";
import type { Store } from "@/types";

interface Props {
  stores: Store[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

export function HiringStorePicker({ stores, selectedId, onSelect }: Props) {
  return (
    <div className="flex w-[260px] flex-shrink-0 flex-col border-r border-[#E2E4EA] bg-[#F5F6FA]">
      <div className="border-b border-[#E2E4EA] bg-white px-4 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-[#94A3B8]">
          Hiring · {stores.length} {stores.length === 1 ? "store" : "stores"}
        </p>
        <h2 className="mt-0.5 text-[14px] font-semibold text-[#1A1D27]">
          Select store
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto p-2.5">
        {stores.length === 0 && (
          <div className="rounded-xl border border-dashed border-[#E2E4EA] px-3 py-6 text-center text-[12px] text-[#94A3B8]">
            No stores yet. Create a store first to share its signup link.
          </div>
        )}
        <ul className="space-y-1.5">
          {stores.map((s) => {
            const active = s.id === selectedId;
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => onSelect(s.id)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl border p-2.5 text-left transition-colors",
                    active
                      ? "border-[#6C5CE7] bg-white shadow-sm ring-2 ring-[rgba(108,92,231,0.15)]"
                      : "border-transparent bg-white/60 hover:border-[#E2E4EA] hover:bg-white",
                  )}
                >
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-[rgba(108,92,231,0.1)] text-[12px] font-semibold text-[#6C5CE7]">
                    {s.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="truncate text-[12.5px] font-semibold text-[#1A1D27]">
                        {s.name}
                      </p>
                      {!s.is_active && (
                        <span className="flex-shrink-0 rounded-full bg-[rgba(240,165,0,0.1)] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-[#F0A500]">
                          Paused
                        </span>
                      )}
                    </div>
                    {s.address && (
                      <p className="mt-0.5 truncate text-[10.5px] text-[#94A3B8]">
                        {s.address}
                      </p>
                    )}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
