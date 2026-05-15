"use client";

import { Pencil, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { useStoreTipEntries } from "@/hooks/useTips";
import { useUsers } from "@/hooks/useUsers";
import { daysOfPeriod, type TipPeriod } from "@/lib/tipPeriod";
import { cn } from "@/lib/utils";
import type { TipEntry } from "@/types/tip";
import { EntryFormModal } from "./EntryFormModal";

interface Props {
  storeId: string;
  period: TipPeriod;
}

type ModalState =
  | { kind: "closed" }
  | { kind: "add"; employeeId: string; date: string }
  | { kind: "edit"; entry: TipEntry };

export function ReviewPanel({ storeId, period }: Props) {
  const days = daysOfPeriod(period);
  const [hideNoTips, setHideNoTips] = useState<boolean>(true);
  const [modal, setModal] = useState<ModalState>({ kind: "closed" });

  const { data: entries = [], isLoading } = useStoreTipEntries({
    storeId,
    start: period.start,
    end: period.end,
  });
  const { data: storeUsers = [] } = useUsers({ store_ids: [storeId] });

  /**
   * entry 인덱싱 — (employeeId, date) → list of entries.
   * 한 직원이 같은 날짜에 work_role 분리하여 두 entry 가질 수 있음.
   */
  const grid = useMemo(() => {
    const map = new Map<string, TipEntry[]>();
    for (const e of entries) {
      const key = `${e.employee_id}_${e.date}`;
      const list = map.get(key) ?? [];
      list.push(e);
      map.set(key, list);
    }
    return map;
  }, [entries]);

  /** 직원별 합계 + 총 entry 수. */
  const totals = useMemo(() => {
    const m = new Map<string, { reported: number; count: number }>();
    for (const e of entries) {
      const cur = m.get(e.employee_id) ?? { reported: 0, count: 0 };
      cur.reported += Number(e.reported_on_4070) || 0;
      cur.count += 1;
      m.set(e.employee_id, cur);
    }
    return m;
  }, [entries]);

  const visibleUsers = useMemo(() => {
    if (!hideNoTips) return storeUsers;
    return storeUsers.filter((u) => (totals.get(u.id)?.count ?? 0) > 0);
  }, [storeUsers, totals, hideNoTips]);

  const dailyTotals = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of entries) {
      m.set(e.date, (m.get(e.date) ?? 0) + (Number(e.reported_on_4070) || 0));
    }
    return m;
  }, [entries]);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center text-[13px] text-[#94A3B8]">
        Loading entries...
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[12px] text-[#64748B]">
          {period.label} · {visibleUsers.length} staff · {entries.length} entries
        </p>
        <label className="flex items-center gap-2 text-[12px] text-[#64748B]">
          <input
            type="checkbox"
            checked={hideNoTips}
            onChange={(e) => setHideNoTips(e.target.checked)}
          />
          Hide staff with no tips this period
        </label>
      </div>

      <div className="overflow-x-auto rounded-xl border border-[#E2E4EA] bg-white">
        <table className="w-full min-w-[800px] border-collapse text-[12px]">
          <thead className="bg-[#F5F6FA]">
            <tr>
              <th className="sticky left-0 z-10 border-b border-[#E2E4EA] bg-[#F5F6FA] px-3 py-2 text-left font-semibold text-[#64748B]">
                Staff
              </th>
              {days.map((d) => (
                <th
                  key={d}
                  className="min-w-[68px] border-b border-[#E2E4EA] px-1.5 py-2 text-center font-medium text-[#64748B]"
                >
                  {Number(d.slice(-2))}
                </th>
              ))}
              <th className="border-b border-l border-[#E2E4EA] px-3 py-2 text-right font-semibold text-[#1A1D27]">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {visibleUsers.length === 0 && (
              <tr>
                <td
                  colSpan={days.length + 2}
                  className="px-6 py-8 text-center text-[12px] text-[#94A3B8]"
                >
                  No staff to review.
                </td>
              </tr>
            )}
            {visibleUsers.map((u) => {
              const total = totals.get(u.id);
              return (
                <tr key={u.id} className="hover:bg-[#FAFBFC]">
                  <td className="sticky left-0 z-10 whitespace-nowrap border-b border-[#E2E4EA] bg-white px-3 py-1.5 font-medium text-[#1A1D27]">
                    {u.full_name}
                    <span className="ml-2 text-[10px] text-[#94A3B8]">
                      {u.role_name}
                    </span>
                  </td>
                  {days.map((d) => {
                    const cellEntries = grid.get(`${u.id}_${d}`) ?? [];
                    return (
                      <td
                        key={d}
                        className="border-b border-[#E2E4EA] px-1 py-1.5 text-center"
                      >
                        {cellEntries.length === 0 ? (
                          <button
                            type="button"
                            onClick={() =>
                              setModal({
                                kind: "add",
                                employeeId: u.id,
                                date: d,
                              })
                            }
                            className="flex h-7 w-full items-center justify-center rounded-md border border-dashed border-[#E2E4EA] text-[10px] text-[#CBD2DA] transition-colors hover:border-[#6C5CE7] hover:text-[#6C5CE7]"
                            aria-label={`Add entry for ${u.full_name} on ${d}`}
                          >
                            <Plus size={11} />
                          </button>
                        ) : (
                          <div className="flex flex-col items-stretch gap-0.5">
                            {cellEntries.map((e) => (
                              <CellPill key={e.id} entry={e} onEdit={() => setModal({ kind: "edit", entry: e })} />
                            ))}
                          </div>
                        )}
                      </td>
                    );
                  })}
                  <td className="border-b border-l border-[#E2E4EA] px-3 py-1.5 text-right font-semibold text-[#1A1D27]">
                    {total ? `$${total.reported.toFixed(2)}` : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="bg-[#F5F6FA]">
              <td className="sticky left-0 z-10 bg-[#F5F6FA] px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-[#64748B]">
                Daily total
              </td>
              {days.map((d) => {
                const t = dailyTotals.get(d) ?? 0;
                return (
                  <td
                    key={d}
                    className="px-1 py-2 text-center text-[11px] font-medium text-[#1A1D27]"
                  >
                    {t > 0 ? `$${t.toFixed(0)}` : "·"}
                  </td>
                );
              })}
              <td className="border-l border-[#E2E4EA] px-3 py-2 text-right text-[11px] font-bold uppercase tracking-wider text-[#6C5CE7]">
                $
                {Array.from(dailyTotals.values())
                  .reduce((s, v) => s + v, 0)
                  .toFixed(2)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {modal.kind === "add" && (
        <EntryFormModal
          mode="add"
          isOpen
          onClose={() => setModal({ kind: "closed" })}
          storeId={storeId}
          prefill={{ employeeId: modal.employeeId, date: modal.date }}
        />
      )}
      {modal.kind === "edit" && (
        <EntryFormModal
          mode="edit"
          isOpen
          onClose={() => setModal({ kind: "closed" })}
          storeId={storeId}
          entry={modal.entry}
        />
      )}
    </div>
  );
}

function CellPill({
  entry,
  onEdit,
}: {
  entry: TipEntry;
  onEdit: () => void;
}) {
  const reported = Number(entry.reported_on_4070) || 0;
  const isManagerEdited = entry.source === "manager";
  return (
    <button
      type="button"
      onClick={onEdit}
      className={cn(
        "flex h-7 items-center justify-center gap-1 rounded-md px-1.5 text-[11px] font-semibold transition-colors",
        isManagerEdited
          ? "bg-[#FFF7E6] text-[#B45F06] hover:bg-[#FFEFC8]"
          : "bg-[#F0F1F5] text-[#1A1D27] hover:bg-[rgba(108,92,231,0.12)] hover:text-[#6C5CE7]",
      )}
      title={
        isManagerEdited
          ? "Manager-entered or modified"
          : `Reported $${reported.toFixed(2)}`
      }
    >
      {isManagerEdited && <Pencil size={9} />}
      ${reported.toFixed(0)}
    </button>
  );
}
