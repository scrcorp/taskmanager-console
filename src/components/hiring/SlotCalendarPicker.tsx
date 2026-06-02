"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PickerSlot {
  id: string;
  date: string; // YYYY-MM-DD
  start: string; // HH:MM
  taken?: boolean;
  preferred?: boolean;
}

interface Props {
  slots: PickerSlot[];
  selected: string[];
  onToggle: (id: string) => void;
  max: number;
  tzLabel?: string;
  /** true면 이미 확정된(taken) 슬롯을 숨기지 않고 'Booked' 회색으로 표시 (콘솔 admin용). */
  showTaken?: boolean;
}

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function fmtTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const am = h < 12;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${am ? "AM" : "PM"}`;
}
const DOW = ["S", "M", "T", "W", "T", "F", "S"];

/** 캘린더에서 가능한 날짜를 고르면 그 날의 가능 시간대만 칩으로. max 만큼 선택. */
export function SlotCalendarPicker({ slots, selected, onToggle, max, tzLabel, showTaken = false }: Props) {
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  // date → 그 날의 (안 잡힌) 슬롯
  const byDate = useMemo(() => {
    const m = new Map<string, PickerSlot[]>();
    for (const s of slots) {
      if (s.taken && !showTaken) continue; // 공개: taken 숨김 / 콘솔: 회색으로 노출
      (m.get(s.date) ?? m.set(s.date, []).get(s.date)!).push(s);
    }
    for (const arr of m.values()) arr.sort((a, b) => a.start.localeCompare(b.start));
    return m;
  }, [slots, showTaken]);

  const selectedSet = new Set(selected);
  const selectedCountByDate = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of slots) if (selectedSet.has(s.id)) m.set(s.date, (m.get(s.date) ?? 0) + 1);
    return m;
  }, [slots, selected]); // eslint-disable-line react-hooks/exhaustive-deps
  // 지원자 희망 슬롯이 있는 날짜 (어드민 화면에서 ★ 표시)
  const preferredDates = useMemo(() => {
    const s = new Set<string>();
    for (const sl of slots) if (sl.preferred) s.add(sl.date);
    return s;
  }, [slots]);
  // 희망 슬롯 중 아직 안 잡힌 게 하나라도 있는 날짜 (없으면 ★ 회색 — 희망했지만 booked)
  const preferredOpenDates = useMemo(() => {
    const s = new Set<string>();
    for (const sl of slots) if (sl.preferred && !sl.taken) s.add(sl.date);
    return s;
  }, [slots]);

  const firstAvailable = useMemo(() => {
    const ds = [...byDate.keys()].filter((d) => d >= iso(today)).sort();
    return ds[0];
  }, [byDate, today]);

  const [month, setMonth] = useState(() => {
    const base = firstAvailable ? new Date(firstAvailable + "T00:00:00") : today;
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });
  const [selDate, setSelDate] = useState<string | undefined>(firstAvailable);

  // 달력 그리드 (해당 월 포함 6주)
  const gridStart = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const s = new Date(first);
    s.setDate(s.getDate() - s.getDay());
    return s;
  }, [month]);
  const weeks = useMemo(() => {
    return Array.from({ length: 6 }, (_, w) =>
      Array.from({ length: 7 }, (_, d) => {
        const cur = new Date(gridStart);
        cur.setDate(cur.getDate() + w * 7 + d);
        return cur;
      }),
    );
  }, [gridStart]);

  const dayTimes = selDate ? (byDate.get(selDate) ?? []) : [];
  const full = selected.length >= max;
  const monthLabel = month.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  return (
    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(150px,0.62fr)]">
      {/* calendar */}
      <div className="rounded-xl border border-[#E2E4EA] bg-white p-3">
        <div className="mb-2 flex items-center justify-between">
          <button type="button" onClick={() => setMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))} className="rounded-md p-1 text-[#64748B] hover:bg-[#F5F6FA]">
            <ChevronLeft size={16} />
          </button>
          <span className="text-[12.5px] font-semibold text-[#1A1D27]">{monthLabel}</span>
          <button type="button" onClick={() => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))} className="rounded-md p-1 text-[#64748B] hover:bg-[#F5F6FA]">
            <ChevronRight size={16} />
          </button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center">
          {DOW.map((d, i) => (
            <div key={i} className="text-[10px] font-semibold text-[#94A3B8]">{d}</div>
          ))}
          {weeks.flat().map((cur) => {
            const ds = iso(cur);
            const inMonth = cur.getMonth() === month.getMonth();
            const available = byDate.has(ds) && ds >= iso(today);
            const isSel = selDate === ds;
            const cnt = selectedCountByDate.get(ds) ?? 0;
            return (
              <button
                key={ds}
                type="button"
                disabled={!available}
                onClick={() => setSelDate(ds)}
                className={cn(
                  "relative aspect-square rounded-lg text-[12px] font-medium transition-colors",
                  !inMonth && "opacity-30",
                  isSel ? "bg-[#6C5CE7] text-white" : available ? "text-[#1A1D27] hover:bg-[rgba(108,92,231,0.1)]" : "text-[#CBD5E1] cursor-not-allowed",
                  available && !isSel && "ring-1 ring-inset ring-[rgba(108,92,231,0.25)]",
                )}
              >
                {cur.getDate()}
                {cnt > 0 && (
                  <span className={cn("absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full", isSel ? "bg-white" : "bg-[#00B894]")} />
                )}
                {preferredDates.has(ds) && (
                  <span
                    className={cn(
                      "absolute left-0.5 top-0.5 text-[9px] leading-none",
                      isSel ? "text-white" : preferredOpenDates.has(ds) ? "text-[#6C5CE7]" : "text-[#CBD5E1]",
                    )}
                  >
                    ★
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-[10.5px] text-[#94A3B8]">
          Dates with open times are highlighted.{preferredDates.size > 0 ? " ★ = applicant's preferred date." : ""} {tzLabel ? `Times in ${tzLabel}.` : ""}
        </p>
      </div>

      {/* times — desktop: panel matches calendar height, chips scroll inside */}
      <div className="sm:relative sm:overflow-hidden">
        <div className="flex flex-col sm:absolute sm:inset-0">
          {selDate && (
            <p className="mb-1.5 shrink-0 text-[11px] font-semibold uppercase tracking-wide text-[#94A3B8]">
              {new Date(selDate + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
            </p>
          )}
          <div className="min-h-0 flex-1 overflow-y-auto">
            {selDate ? (
              dayTimes.length === 0 ? (
                <p className="rounded-lg bg-[#F5F6FA] px-3 py-3 text-[12px] text-[#94A3B8]">No open times on this date.</p>
              ) : (
                <div className="grid grid-cols-[repeat(auto-fill,minmax(82px,1fr))] gap-1.5">
                  {dayTimes.map((s) => {
                    if (s.taken) {
                      // 이미 확정된 시간 — 콘솔에서만 노출, 선택 불가
                      return (
                        <div
                          key={s.id}
                          title="Already booked by another applicant"
                          className="w-full rounded-lg border border-[#E2E4EA] bg-[#F5F6FA] px-2 py-2 text-center"
                        >
                          <div className="text-[12.5px] font-semibold text-[#94A3B8] line-through">
                            {s.preferred && <span className="mr-0.5 text-[#B9AEF0] no-underline">★</span>}
                            {fmtTime(s.start)}
                          </div>
                          <div className="text-[9px] font-bold uppercase tracking-wide text-[#CBD5E1]">Booked</div>
                        </div>
                      );
                    }
                    const on = selectedSet.has(s.id);
                    const disabled = !on && full && max > 1;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        disabled={disabled}
                        onClick={() => onToggle(s.id)}
                        className={cn(
                          "w-full rounded-lg border px-2 py-2 text-center text-[12.5px] font-semibold transition-colors",
                          on
                            ? "border-[#6C5CE7] bg-[#6C5CE7] text-white"
                            : disabled
                              ? "border-[#E2E4EA] bg-white text-[#CBD5E1]"
                              : s.preferred
                                ? "border-[#6C5CE7] bg-[rgba(108,92,231,0.08)] text-[#1A1D27] hover:bg-[rgba(108,92,231,0.16)]"
                                : "border-[#E2E4EA] bg-white text-[#1A1D27] hover:border-[#6C5CE7]",
                        )}
                      >
                        {s.preferred && <span className="mr-1 text-[#6C5CE7]">★</span>}
                        {fmtTime(s.start)}
                      </button>
                    );
                  })}
                </div>
              )
            ) : (
              <p className="rounded-lg bg-[#F5F6FA] px-3 py-3 text-[12px] text-[#94A3B8]">Pick a highlighted date to see open times.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
