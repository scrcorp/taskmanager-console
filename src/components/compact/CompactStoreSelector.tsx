"use client";

/**
 * 간소화 콘솔 헤더의 매장 선택기.
 *
 * 선택값은 `compact` page key 로 영속화한다 (데스크탑 키와 분리 — 자세한 이유는 lib/compact.ts).
 * 매장이 하나뿐이면 선택기 대신 매장명만 보여준다.
 */

import { useEffect } from "react";
import { ChevronDown } from "lucide-react";
import { useStores } from "@/hooks/useStores";
import { usePersistedFilters } from "@/hooks/usePersistedFilters";
import { COMPACT_FILTER_KEY } from "@/lib/compact";

export function CompactStoreSelector() {
  const { data: stores, isLoading } = useStores();
  const [params, setParams] = usePersistedFilters(COMPACT_FILTER_KEY, { store: "" });

  // 저장된 매장이 없거나 더 이상 접근 불가하면 첫 매장으로 맞춘다.
  useEffect(() => {
    if (!stores?.length) return;
    const stillValid = stores.some((s) => s.id === params.store);
    if (!stillValid) setParams({ store: stores[0].id });
  }, [stores, params.store]);

  if (isLoading) {
    return <div className="h-9 flex-1 animate-pulse rounded-lg bg-surface-hover" />;
  }

  if (!stores?.length) {
    return <span className="flex-1 truncate text-sm text-text-muted">No stores available</span>;
  }

  if (stores.length === 1) {
    return <span className="flex-1 truncate text-sm font-semibold text-text">{stores[0].name}</span>;
  }

  return (
    <div className="relative flex-1 min-w-0">
      <select
        value={params.store}
        onChange={(e) => setParams({ store: e.target.value })}
        aria-label="Store"
        className="h-11 w-full appearance-none truncate rounded-lg bg-transparent pl-1 pr-8 text-sm font-semibold text-text focus:outline-none focus:ring-2 focus:ring-accent"
      >
        {stores.map((store) => (
          <option key={store.id} value={store.id}>
            {store.name}
          </option>
        ))}
      </select>
      <ChevronDown
        size={16}
        className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-text-secondary"
      />
    </div>
  );
}
