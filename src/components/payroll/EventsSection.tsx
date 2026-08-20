"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Lock, RefreshCw } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { PERMISSIONS } from "@/lib/permissions";
import { useToast } from "@/components/ui/Toast";
import { cn, parseApiError } from "@/lib/utils";
import { payrollShortDate } from "@/lib/payrollFormat";
import { PENALTY_KIND_HINTS, PENALTY_TERM_HINT } from "@/lib/payrollTerms";
import { usePayrollEvents, useTagPayrollEvent } from "@/hooks/usePayroll";
import type {
  EventAttribution,
  PayPeriod,
  PayrollEvent,
} from "@/types/payroll";
import type { Store } from "@/types";

const KIND_LABELS: Record<string, { label: string; className: string }> = {
  meal_penalty: {
    label: "Meal penalty",
    className: "bg-[rgba(240,165,0,0.12)] text-[#B45F06]",
  },
  rest_penalty: {
    label: "Rest penalty",
    className: "bg-[rgba(108,92,231,0.1)] text-[#6C5CE7]",
  },
};

/** 귀책 필터 — 페이지가 URL 파라미터(attr)로 관리하는 영속 상태. */
export type EventFilter = "all" | "untagged" | "staff" | "management";

const FILTERS: { key: EventFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "untagged", label: "Untagged" },
  { key: "staff", label: "Staff" },
  { key: "management", label: "Management" },
];

/** URL 파라미터 raw 값 → 필터. 빈 값/모르는 값은 기본(all). */
export function parseEventFilter(raw: string | null | undefined): EventFilter {
  return raw === "untagged" || raw === "staff" || raw === "management"
    ? raw
    : "all";
}

function kindBadge(kind: string): { label: string; className: string } {
  return (
    KIND_LABELS[kind] ?? {
      label: kind.replace(/_/g, " "),
      className: "bg-[#F0F1F5] text-[#64748B]",
    }
  );
}

interface Props {
  /** 기간 스코프(법인) 소속 매장들 — 이벤트 조회는 매장 단위 API 그대로. */
  stores: Store[];
  period: PayPeriod;
  /** 귀책 필터 (controlled) — 페이지가 URL + 영속 저장으로 관리한다. */
  filter: EventFilter;
  onFilterChange: (next: EventFilter) => void;
}

/**
 * 기간 내 payroll 이벤트(penalty/OT 사유) 목록 + 귀책 태깅 (E1).
 * 조회/태깅 권한: schedules:update (금액 없는 운영 페이로드 — GM/SV 가능).
 * confirm 으로 동결(frozen)된 이벤트는 읽기 전용.
 *
 * 급여 스코프는 법인(group)이지만 이벤트 원장은 매장 귀속이라, 그룹에 매장이
 * 여럿이면 섹션 안에서 매장을 골라 본다 (기본 첫 매장).
 */
export function EventsSection({ stores, period, filter, onFilterChange }: Props) {
  const { hasPermission } = usePermissions();
  const canTag = hasPermission(PERMISSIONS.SCHEDULES_UPDATE);
  const [storePick, setStorePick] = useState<string>("");
  const storeId = useMemo(() => {
    if (stores.length === 0) return null;
    return stores.find((s) => s.id === storePick)?.id ?? stores[0].id;
  }, [stores, storePick]);
  // 서버 목록 조회 자체가 schedules:update 게이트 — 권한 없으면 요청도 안 보냄
  const eventsQ = usePayrollEvents(
    canTag ? storeId : null,
    period.start_date,
    period.end_date,
  );
  const tagMut = useTagPayrollEvent();
  const { toast } = useToast();

  const events = useMemo(() => {
    const all = eventsQ.data ?? [];
    if (filter === "all") return all;
    if (filter === "untagged") return all.filter((e) => e.attribution === null);
    return all.filter((e) => e.attribution === filter);
  }, [eventsQ.data, filter]);

  if (!canTag || storeId === null) return null;

  const onTag = (event: PayrollEvent, attribution: EventAttribution): void => {
    tagMut.mutate(
      { eventId: event.id, attribution },
      {
        onSuccess: () => {
          toast({ type: "success", message: `Tagged as ${attribution}.` });
        },
      },
    );
  };

  return (
    <div className="rounded-xl border border-[#E2E4EA] bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E2E4EA] px-4 py-2.5">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">
            Payroll events
          </p>
          <p
            title={PENALTY_TERM_HINT}
            className="mt-0.5 text-[11px] text-[#94A3B8]"
          >
            Penalty and overtime events in this period — tag who is responsible
          </p>
        </div>
        <div className="flex items-center gap-2">
          {stores.length > 1 && (
            <select
              aria-label="Store"
              value={storeId}
              onChange={(e) => setStorePick(e.target.value)}
              className="rounded-lg border border-[#E2E4EA] bg-white px-2 py-1 text-[11.5px] font-semibold text-[#1A1D27] focus:border-[#6C5CE7] focus:outline-none"
            >
              {stores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          )}
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => onFilterChange(f.key)}
              className={cn(
                "rounded-full px-2.5 py-1 text-[11px] font-semibold",
                filter === f.key
                  ? "bg-[rgba(108,92,231,0.1)] text-[#6C5CE7]"
                  : "text-[#64748B] hover:bg-[#F5F6FA]",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {eventsQ.isLoading && (
        <p className="px-4 py-8 text-center text-[12px] text-[#94A3B8]">
          Loading events...
        </p>
      )}

      {eventsQ.isError && (
        <div className="px-4 py-6 text-center">
          <p className="flex items-center justify-center gap-1.5 text-[12px] font-semibold text-[#C0392B]">
            <AlertTriangle size={13} />
            Couldn&apos;t load events
          </p>
          <p className="mt-1 text-[11.5px] text-[#8B5B5B]">
            {parseApiError(eventsQ.error, "Unexpected error")}
          </p>
          <button
            type="button"
            onClick={() => void eventsQ.refetch()}
            className="mx-auto mt-2 flex items-center gap-1.5 rounded-lg border border-[#E2E4EA] px-3 py-1.5 text-[12px] font-semibold text-[#1A1D27] hover:bg-[#F5F6FA]"
          >
            <RefreshCw size={12} /> Retry
          </button>
        </div>
      )}

      {!eventsQ.isLoading && !eventsQ.isError && (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-[#F5F6FA]">
              <tr>
                {["Kind", "Date", "Employee", "Reason", "Attribution"].map(
                  (h) => (
                    <th
                      key={h}
                      className="whitespace-nowrap border-b border-[#E2E4EA] px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-[#64748B]"
                    >
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {events.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-4 py-8 text-center text-[12px] text-[#94A3B8]"
                  >
                    {filter === "all"
                      ? "No payroll events in this period."
                      : "No events match this filter."}
                  </td>
                </tr>
              )}
              {events.map((e) => {
                const badge = kindBadge(e.kind);
                const pending =
                  tagMut.isPending && tagMut.variables?.eventId === e.id;
                return (
                  <tr key={e.id} className="hover:bg-[#FAFBFC]">
                    <td className="whitespace-nowrap border-b border-[#F0F1F5] px-3 py-2">
                      <span
                        title={PENALTY_KIND_HINTS[e.kind]}
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[10.5px] font-semibold",
                          badge.className,
                        )}
                      >
                        {badge.label}
                      </span>
                    </td>
                    <td className="whitespace-nowrap border-b border-[#F0F1F5] px-3 py-2 text-[12px] text-[#1A1D27]">
                      {payrollShortDate(e.work_date)}
                    </td>
                    <td className="whitespace-nowrap border-b border-[#F0F1F5] px-3 py-2 text-[12px] font-medium text-[#1A1D27]">
                      {e.member_name ?? "Unknown member"}
                    </td>
                    <td className="border-b border-[#F0F1F5] px-3 py-2 text-[12px] text-[#64748B]">
                      {e.reason}
                    </td>
                    <td className="whitespace-nowrap border-b border-[#F0F1F5] px-3 py-2">
                      {e.frozen ? (
                        <span className="flex w-fit items-center gap-1 rounded-full bg-[#F0F1F5] px-2 py-1 text-[11px] font-semibold capitalize text-[#64748B]">
                          <Lock size={10} />
                          {e.attribution ?? "Untagged"}
                        </span>
                      ) : (
                        <select
                          value={e.attribution ?? ""}
                          disabled={pending}
                          onChange={(ev) => {
                            const v = ev.target.value;
                            if (v === "staff" || v === "management") {
                              onTag(e, v);
                            }
                          }}
                          className={cn(
                            "rounded-lg border px-2 py-1 text-[11.5px] font-medium focus:border-[#6C5CE7] focus:outline-none disabled:opacity-50",
                            e.attribution === null
                              ? "border-[#F0C36D] bg-[#FFF9EC] text-[#B45F06]"
                              : "border-[#E2E4EA] bg-white text-[#1A1D27]",
                          )}
                        >
                          <option value="" disabled>
                            Untagged
                          </option>
                          <option value="staff">Staff</option>
                          <option value="management">Management</option>
                        </select>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
