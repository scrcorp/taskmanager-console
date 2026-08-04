"use client";

import { useMemo } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { usePersistedFilters } from "@/hooks/usePersistedFilters";
import { useStores } from "@/hooks/useStores";
import { usePayPeriods } from "@/hooks/usePayroll";
import { StoreSelect } from "@/components/payroll/StoreSelect";
import { PayrollPeriodNav } from "@/components/payroll/PayrollPeriodNav";
import { OpenPeriodView } from "@/components/payroll/OpenPeriodView";
import { ConfirmedPeriodView } from "@/components/payroll/ConfirmedPeriodView";
import {
  EventsSection,
  parseEventFilter,
} from "@/components/payroll/EventsSection";
import { parseApiError } from "@/lib/utils";

/**
 * Pay > Payroll — 반월(semi-monthly) 기간별 payroll 마감 콘솔.
 * OPEN 기간: live preview + 마감 게이트 + confirm.
 * CONFIRMED 기간: 동결 entries + export + pay stub.
 *
 * 헤더 한 줄에 [매장 드롭다운] + [기간 네비 + 상태 pill] — 매장 전환이
 * 페이지 리셋처럼 보이지 않게 하고, 보던 기간을 그대로 유지한다.
 *
 * 화면 설정(매장/기간/이벤트 필터)은 다른 콘솔 페이지와 동일하게 URL 파라미터로
 * 표현되고 localStorage + 서버에 영속화된다 (usePersistedFilters) — 다른 메뉴에
 * 갔다 와도 보던 상태 그대로. `?_ext=1` 로 들어온 공유 링크는 훅이 알아서
 * 영속화를 건너뛴다.
 */
export default function PayrollPage() {
  const { data: stores = [] } = useStores();

  // store: 매장 id / period: 기간 start_date / attr: payroll events 귀책 필터
  const [params, setParams] = usePersistedFilters("pay.payroll", {
    store: "",
    period: "",
    attr: "",
  });

  // 저장된 매장이 없거나 사라졌으면 첫 매장으로 폴백. URL 에 되쓰지 않는다 —
  // 공유 링크의 store 파라미터를 덮어쓰지 않기 위해 (attendances 와 동일한 처리).
  const selected = useMemo(() => {
    if (stores.length === 0) return null;
    return stores.find((s) => s.id === params.store) ?? stores[0];
  }, [stores, params.store]);

  const periodsQ = usePayPeriods(selected?.id ?? null);
  const periods = useMemo(() => periodsQ.data ?? [], [periodsQ.data]);

  // 매장 전환 중에는 직전 매장의 기간 목록이 placeholder 로 남아 헤더가
  // 깜빡이지 않는다. 본문은 새 매장 데이터가 올 때까지 로딩으로 둔다.
  const switching = periodsQ.isPlaceholderData;

  // 선택 기간은 start_date 로 기억 — 매장을 바꿔도 같은 기간을 이어서 본다.
  const index = useMemo(() => {
    if (periods.length === 0) return -1;
    if (params.period) {
      const found = periods.findIndex((p) => p.start_date === params.period);
      if (found >= 0) return found;
    }
    return periods.length - 1; // 저장된 기간이 없거나 이 매장엔 없으면 최신 기간
  }, [periods, params.period]);

  const current = index >= 0 ? periods[index] : null;

  return (
    <div className="flex h-full min-w-0 flex-col bg-[#F5F6FA]">
      <div className="border-b border-[#E2E4EA] bg-white px-6 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[#94A3B8]">
              Pay · Payroll
            </p>
            <StoreSelect
              stores={stores}
              selectedId={selected?.id ?? null}
              onSelect={(id) => setParams({ store: id })}
              className="mt-1"
            />
          </div>
          {current && (
            <PayrollPeriodNav
              periods={periods}
              index={index}
              onChange={(i) => setParams({ period: periods[i].start_date })}
            />
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-4">
        {!selected && (
          <p className="rounded-xl border border-dashed border-[#E2E4EA] bg-white p-10 text-center text-[13px] text-[#94A3B8]">
            Select a store to view its payroll periods.
          </p>
        )}

        {selected && (periodsQ.isLoading || switching) && (
          <div className="flex h-64 items-center justify-center text-[13px] text-[#94A3B8]">
            Loading pay periods...
          </div>
        )}

        {selected && periodsQ.isError && (
          <div className="rounded-xl border border-[#F3C5C5] bg-[rgba(255,107,107,0.06)] p-5">
            <p className="flex items-center gap-2 text-[13px] font-semibold text-[#C0392B]">
              <AlertTriangle size={15} />
              Couldn&apos;t load pay periods
            </p>
            <p className="mt-1 text-[12px] text-[#8B5B5B]">
              {parseApiError(periodsQ.error, "Unexpected error")} — check your
              connection, then retry.
            </p>
            <button
              type="button"
              onClick={() => void periodsQ.refetch()}
              className="mt-3 flex items-center gap-1.5 rounded-lg border border-[#E2E4EA] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#1A1D27] hover:bg-[#F5F6FA]"
            >
              <RefreshCw size={13} /> Retry
            </button>
          </div>
        )}

        {selected &&
          !periodsQ.isLoading &&
          !switching &&
          !periodsQ.isError &&
          periods.length === 0 && (
            <p className="rounded-xl border border-dashed border-[#E2E4EA] bg-white p-10 text-center text-[13px] text-[#94A3B8]">
              No pay periods exist for this store yet. Periods appear
              automatically once the store has operating dates.
            </p>
          )}

        {selected && current && !switching && (
          <div className="space-y-4">
            {current.status === "confirmed" ? (
              <ConfirmedPeriodView period={current} />
            ) : (
              <OpenPeriodView period={current} />
            )}
            <EventsSection
              storeId={selected.id}
              period={current}
              filter={parseEventFilter(params.attr)}
              onFilterChange={(next) =>
                setParams({ attr: next === "all" ? null : next })
              }
            />
          </div>
        )}
      </div>
    </div>
  );
}
