"use client";

/**
 * Schedule Settings 페이지 — 매장별 스케줄 관련 설정.
 */

import React, { useState, useMemo } from "react";
import { useStores } from "@/hooks/useStores";
import { WorkRolesPanel } from "@/components/schedules/WorkRolesPanel";
import { cn } from "@/lib/utils";
import type { Store } from "@/types";

export default function ScheduleSettingsPage(): React.ReactElement {
  const { data: stores = [] } = useStores();
  const [selectedStoreId, setSelectedStoreId] = useState<string>("");
  const effectiveStoreId = selectedStoreId || stores[0]?.id || "";
  const selectedStore = useMemo(() => stores.find((s) => s.id === effectiveStoreId), [stores, effectiveStoreId]);

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-text">Schedule Settings</h1>
        <p className="text-sm text-text-muted mt-0.5">Store-level schedule configuration</p>
      </div>

      {/* Store selector */}
      <div className="flex gap-1.5 flex-wrap">
        {stores.map((s: Store) => (
          <button
            key={s.id}
            onClick={() => setSelectedStoreId(s.id)}
            className={cn(
              "px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors",
              s.id === effectiveStoreId
                ? "bg-accent text-white"
                : "bg-surface text-text-secondary hover:text-text hover:bg-surface-hover",
            )}
          >
            {s.name}
          </button>
        ))}
      </div>

      {/* Work Roles panel for selected store */}
      {selectedStore && effectiveStoreId && (
        <div className="bg-card border border-border rounded-xl p-6">
          <h2 className="text-lg font-bold text-text mb-1">{selectedStore.name}</h2>
          <p className="text-xs text-text-muted mb-4">Work Roles — Shift × Position combinations</p>
          <WorkRolesPanel storeId={effectiveStoreId} />
        </div>
      )}
    </div>
  );
}
