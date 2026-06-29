"use client";

/**
 * Cross-store assignment panel for a single org report period.
 *
 * org Report Periods 화면에서 한 period 행을 펼치면, 모든 활성 매장 목록과
 * 각 매장의 enable/disable Switch 를 보여준다. 매장별로 이 period 의 effective
 * is_active 를 토글한다 (상속이면 store override 생성, override 면 PUT). 매장이
 * org 기본값을 상속 중이면 "Default", 자체 override 가 있으면 "Override" 표시.
 *
 * 매장 한 곳씩 열어야 했던 기존 흐름을 org 화면에서 한 번에 처리하기 위한 것.
 */

import React, { useCallback, useState } from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";

import { useApplyReportTypeChange } from "@/hooks/useReportTypes";
import { Badge, LoadingSpinner, Switch } from "@/components/ui";
import type { EffectiveReportType, Store } from "@/types";

/** 한 매장의 resolved report type 목록 (병렬 조회 결과). */
export interface StoreEffectiveEntry {
  store: Store;
  list: EffectiveReportType[];
  isLoading: boolean;
}

interface Props {
  /** 펼친 org period 의 code. */
  periodCode: string;
  /** 활성 매장 + 각 매장의 effective 목록. */
  storeEntries: StoreEffectiveEntry[];
  /** 매장 데이터 로딩 중 여부. */
  isLoading: boolean;
  canManage: boolean;
}

export function ReportPeriodStoresPanel({
  periodCode,
  storeEntries,
  isLoading,
  canManage,
}: Props): React.ReactElement {
  const applyChange = useApplyReportTypeChange();
  const [busyStoreId, setBusyStoreId] = useState<string | null>(null);

  const handleToggle = useCallback(
    async (entry: StoreEffectiveEntry, item: EffectiveReportType) => {
      setBusyStoreId(entry.store.id);
      try {
        await applyChange.mutateAsync({
          scope: "store",
          storeId: entry.store.id,
          target: item,
          change: { is_active: !item.is_active },
          effectiveList: entry.list,
        });
      } catch {
        // hook 자동 모달
      } finally {
        setBusyStoreId(null);
      }
    },
    [applyChange],
  );

  if (isLoading) {
    return (
      <div className="flex justify-center py-6">
        <LoadingSpinner size="md" />
      </div>
    );
  }

  if (storeEntries.length === 0) {
    return (
      <p className="px-4 py-4 text-sm text-text-muted">
        No active stores to assign.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-border border-t border-border bg-surface/40">
      {storeEntries.map((entry) => {
        const item = entry.list.find((e) => e.code === periodCode);
        // org period 가 존재하면 매장 effective 목록에도 반드시 나타난다. 방어적 처리.
        const isActive = item?.is_active ?? false;
        const isOverride = item?.scope === "store";
        const busy = busyStoreId === entry.store.id || !item;
        return (
          <li
            key={entry.store.id}
            className="flex items-center gap-3 px-4 py-2.5 pl-10"
          >
            <div className="flex-1 min-w-0">
              <Link
                href={`/stores/${entry.store.id}?tab=reports`}
                className="inline-flex items-center gap-1 text-sm font-medium text-text hover:text-accent transition-colors"
              >
                <span className="truncate">{entry.store.name}</span>
                <ExternalLink className="h-3 w-3 shrink-0 opacity-60" />
              </Link>
            </div>

            {isOverride ? (
              <Badge variant="accent">Override</Badge>
            ) : (
              <Badge variant="default">Default</Badge>
            )}

            <Switch
              checked={isActive}
              onCheckedChange={() => item && handleToggle(entry, item)}
              disabled={!canManage || busy}
              variant="success"
              aria-label={`${entry.store.name} ${isActive ? "enabled" : "disabled"}`}
            />
          </li>
        );
      })}
    </ul>
  );
}
