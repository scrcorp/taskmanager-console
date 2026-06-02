"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useInterviewSlots,
  useCreateSlots,
  useDeleteSlot,
  type InterviewSlot,
} from "@/hooks/useInterviews";

// ── date helpers (week = Sun→Sat) ──
function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
function sundayOf(d: Date): Date {
  return addDays(d, -d.getDay());
}
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const GRID_TIMES: string[] = [];
for (let h = 0; h < 24; h++) for (const m of [0, 30]) GRID_TIMES.push(`${String(h).padStart(2, "0")}:${m === 0 ? "00" : "30"}`);
function plus30(t: string): string {
  const [h, m] = t.split(":").map(Number);
  const tot = h * 60 + m + 30;
  return `${String(Math.floor(tot / 60)).padStart(2, "0")}:${String(tot % 60).padStart(2, "0")}`;
}
function fmtTime(t: string): string {
  const [h, m] = t.split(":").map(Number);
  const am = h < 12;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${am ? "AM" : "PM"}`;
}
function timesBetween(from: string, to: string): string[] {
  return GRID_TIMES.filter((t) => t >= from && t < to);
}
const key = (date: string, time: string) => `${date} ${time}`;

export function SlotsPanel() {
  const [anchor, setAnchor] = useState(() => sundayOf(new Date()));
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(anchor, i)), [anchor]);
  const weekDates = days.map(iso);
  const weekdayDates = days.filter((d) => d.getDay() !== 0 && d.getDay() !== 6).map(iso);
  const weekKey = weekDates[0];

  const { data, isLoading } = useInterviewSlots({ start: weekDates[0], end: weekDates[6] });
  const create = useCreateSlots();
  const del = useDeleteSlot();

  const serverSlots = useMemo(() => {
    const m = new Map<string, InterviewSlot>();
    for (const s of data?.items ?? []) m.set(key(s.date, s.start), s);
    return m;
  }, [data]);
  const serverKeys = useMemo(() => new Set(serverSlots.keys()), [serverSlots]);
  const confirmedKeys = useMemo(
    () => new Set([...serverSlots.values()].filter((s) => s.confirmed).map((s) => key(s.date, s.start))),
    [serverSlots],
  );
  // 지원자가 희망일자로 고른 슬롯 (확정 전) — 지우면 픽이 깨지므로 잠금
  const requestedKeys = useMemo(
    () => new Set([...serverSlots.values()].filter((s) => !s.confirmed && s.demand > 0).map((s) => key(s.date, s.start))),
    [serverSlots],
  );
  // 편집(삭제) 불가 = 확정 + 희망
  const lockedKeys = useMemo(() => new Set([...confirmedKeys, ...requestedKeys]), [confirmedKeys, requestedKeys]);

  // 로컬 draft — 명시적 Save 전까지 서버에 안 보냄
  const [draft, setDraft] = useState<Set<string>>(new Set());
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  // 서버 데이터 채택 (편집 중이 아닐 때만 — 사용자 변경 보존)
  useEffect(() => {
    if (!dirty) setDraft(new Set(serverKeys));
  }, [serverKeys, dirty]);
  // 주 이동 시 미저장 변경 폐기 후 서버 채택
  useEffect(() => {
    setDirty(false);
  }, [weekKey]);

  const [from, setFrom] = useState("09:00");
  const [to, setTo] = useState("17:00");
  const [selDays, setSelDays] = useState<Set<string>>(new Set(weekdayDates));
  useEffect(() => setSelDays(new Set(weekdayDates)), [weekKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const weekLabel = `${days[0].toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${days[6].toLocaleDateString(undefined, { month: "short", day: "numeric" })}`;

  const mutateDraft = (fn: (d: Set<string>) => void) => {
    setDraft((prev) => {
      const n = new Set(prev);
      fn(n);
      return n;
    });
    setDirty(true);
  };
  const applyRange = (dates: string[], times: string[]) =>
    mutateDraft((d) => dates.forEach((dt) => times.forEach((t) => d.add(key(dt, t)))));
  const clearWeek = () =>
    mutateDraft((d) => weekDates.forEach((dt) => GRID_TIMES.forEach((t) => { const k = key(dt, t); if (!lockedKeys.has(k)) d.delete(k); })));
  const toggleDay = (d: string) =>
    setSelDays((prev) => { const n = new Set(prev); n.has(d) ? n.delete(d) : n.add(d); return n; });

  // copy week→next: 다른 주라 즉시 저장(이 편집 그리드 밖)
  const copyWeekToNext = async () => {
    const toAdd = (data?.items ?? []).map((s) => ({ date: iso(addDays(new Date(s.date + "T00:00:00"), 7)), start: s.start, end: s.end }));
    if (toAdd.length) await create.mutateAsync(toAdd);
  };

  // hover crosshair + drag paint
  const [hover, setHover] = useState<{ date: string; time: string } | null>(null);
  const [dragMode, setDragMode] = useState<"fill" | "erase" | null>(null);
  useEffect(() => {
    const up = () => setDragMode(null);
    window.addEventListener("mouseup", up);
    return () => window.removeEventListener("mouseup", up);
  }, []);
  const paint = (date: string, time: string, mode: "fill" | "erase") => {
    const k = key(date, time);
    if (lockedKeys.has(k)) return;
    mutateDraft((d) => {
      if (mode === "fill") d.add(k);
      else d.delete(k);
    });
  };
  const onCellDown = (date: string, time: string) => {
    const k = key(date, time);
    if (lockedKeys.has(k)) return;
    const mode: "fill" | "erase" = draft.has(k) ? "erase" : "fill";
    setDragMode(mode);
    paint(date, time, mode);
  };
  const onCellEnter = (date: string, time: string) => {
    setHover({ date, time });
    if (dragMode) paint(date, time, dragMode);
  };

  const toAdd = [...draft].filter((k) => !serverKeys.has(k));
  const toRemove = [...serverKeys].filter((k) => !draft.has(k) && !lockedKeys.has(k));
  const hasChanges = toAdd.length > 0 || toRemove.length > 0;

  const save = async () => {
    setSaving(true);
    try {
      if (toAdd.length) {
        await create.mutateAsync(
          toAdd.map((k) => { const [date, t] = k.split(" "); return { date, start: t, end: plus30(t) }; }),
        );
      }
      await Promise.all(toRemove.map((k) => { const s = serverSlots.get(k); return s ? del.mutateAsync(s.id) : Promise.resolve(); }));
      setDirty(false);
    } finally {
      setSaving(false);
    }
  };
  const discard = () => { setDraft(new Set(serverKeys)); setDirty(false); };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-[14px] font-semibold text-[#1A1D27]">Interview availability</h3>
          <p className="mt-0.5 text-[12px] text-[#64748B]">
            One shared schedule for the whole organization (org timezone). Edit, then <strong>Save changes</strong>.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setAnchor((a) => addDays(a, -7))} className="rounded-lg border border-[#E2E4EA] p-1.5 text-[#64748B] hover:bg-[#F5F6FA]">
            <ChevronLeft size={16} />
          </button>
          <span className="min-w-[120px] text-center text-[12.5px] font-semibold text-[#1A1D27]">{weekLabel}</span>
          <button type="button" onClick={() => setAnchor((a) => addDays(a, 7))} className="rounded-lg border border-[#E2E4EA] p-1.5 text-[#64748B] hover:bg-[#F5F6FA]">
            <ChevronRight size={16} />
          </button>
        </div>
      </div>

      {/* bulk toolbar */}
      <div className="space-y-3 rounded-xl border border-[#E2E4EA] bg-white p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[10.5px] font-bold uppercase tracking-wide text-[#94A3B8]">Quick fill</span>
          <button type="button" onClick={() => applyRange(weekdayDates, timesBetween("09:00", "17:00"))} className="rounded-lg border border-[#E2E4EA] px-2.5 py-1 text-[12px] font-semibold text-[#6C5CE7] hover:bg-[#F5F6FA]">Weekdays 9–5</button>
          <button type="button" onClick={() => applyRange(weekdayDates, timesBetween("10:00", "18:00"))} className="rounded-lg border border-[#E2E4EA] px-2.5 py-1 text-[12px] font-semibold text-[#6C5CE7] hover:bg-[#F5F6FA]">Weekdays 10–6</button>
          <button type="button" onClick={() => applyRange(weekDates, timesBetween("11:00", "19:00"))} className="rounded-lg border border-[#E2E4EA] px-2.5 py-1 text-[12px] font-semibold text-[#6C5CE7] hover:bg-[#F5F6FA]">All days 11–7</button>
          <span className="mx-1 h-4 w-px bg-[#E2E4EA]" />
          <button type="button" onClick={copyWeekToNext} className="rounded-lg border border-[#E2E4EA] px-2.5 py-1 text-[12px] font-semibold text-[#64748B] hover:bg-[#F5F6FA]">Copy week → next</button>
          <button type="button" onClick={clearWeek} className="rounded-lg border border-[#E2E4EA] px-2.5 py-1 text-[12px] font-semibold text-[#EF4444] hover:bg-[rgba(239,68,68,0.06)]">Clear week</button>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-[#E2E4EA] pt-3">
          <span className="text-[10.5px] font-bold uppercase tracking-wide text-[#94A3B8]">Custom</span>
          <select value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-lg border border-[#E2E4EA] bg-white px-2 py-1 text-[12px]">
            {GRID_TIMES.map((t) => <option key={t} value={t}>{fmtTime(t)}</option>)}
          </select>
          <span className="text-[12px] text-[#94A3B8]">to</span>
          <select value={to} onChange={(e) => setTo(e.target.value)} className="rounded-lg border border-[#E2E4EA] bg-white px-2 py-1 text-[12px]">
            {GRID_TIMES.map((t) => <option key={t} value={t}>{fmtTime(t)}</option>)}
          </select>
          <div className="flex items-center gap-1">
            {days.map((d) => {
              const ds = iso(d);
              return (
                <button key={ds} type="button" onClick={() => toggleDay(ds)} className={cn("h-7 w-8 rounded-md text-[11px] font-semibold", selDays.has(ds) ? "bg-[#6C5CE7] text-white" : "border border-[#E2E4EA] bg-[#F5F6FA] text-[#64748B]")}>
                  {DOW[d.getDay()][0]}
                </button>
              );
            })}
          </div>
          <button type="button" onClick={() => applyRange([...selDays], timesBetween(from, to))} className="rounded-lg bg-[#6C5CE7] px-3 py-1.5 text-[12px] font-semibold text-white hover:opacity-90">Apply</button>
        </div>
        <p className="text-[11px] text-[#94A3B8]">Click or drag cells to open/close slots. Times an applicant has picked or that are confirmed are locked.</p>
      </div>

      {/* grid */}
      <div className="overflow-hidden rounded-xl border border-[#E2E4EA] bg-white select-none" onMouseLeave={() => setHover(null)}>
        <div className="grid border-b border-[#E2E4EA]" style={{ gridTemplateColumns: "56px repeat(7, 1fr)" }}>
          <div className="px-2 py-2 text-[10px] font-bold text-[#94A3B8]">Time</div>
          {days.map((d) => {
            const colHot = hover?.date === iso(d);
            return (
              <div key={iso(d)} className={cn("border-l border-[#E2E4EA] px-1 py-2 text-center transition-colors", colHot && "bg-[rgba(108,92,231,0.1)]")}>
                <div className={cn("text-[10px] font-bold uppercase", colHot ? "text-[#6C5CE7]" : "text-[#1A1D27]")}>{DOW[d.getDay()]}</div>
                <div className="text-[12px] font-semibold text-[#64748B]">{d.getDate()}</div>
              </div>
            );
          })}
        </div>
        <div className="overflow-y-auto" style={{ maxHeight: 340 }}>
          {GRID_TIMES.map((t) => {
            const rowHot = hover?.time === t;
            return (
            <div key={t} className="grid border-b border-[#F0F1F5] last:border-b-0" style={{ gridTemplateColumns: "56px repeat(7, 1fr)" }}>
              <div className={cn("flex h-6 items-center px-2 text-[10px] transition-colors", rowHot ? "bg-[rgba(108,92,231,0.1)] font-semibold text-[#6C5CE7]" : t.endsWith(":00") ? "font-medium text-[#64748B]" : "text-[#CBD5E1]")}>
                {t.endsWith(":00") || rowHot ? fmtTime(t) : ""}
              </div>
              {days.map((d) => {
                const date = iso(d);
                const k = key(date, t);
                const confirmed = confirmedKeys.has(k);
                const requested = requestedKeys.has(k);
                const locked = confirmed || requested;
                const filled = draft.has(k);
                const srv = serverSlots.get(k);
                const isHover = hover?.date === date && hover?.time === t;
                return (
                  <button
                    key={date}
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); onCellDown(date, t); }}
                    onMouseEnter={() => onCellEnter(date, t)}
                    disabled={isLoading || locked}
                    title={
                      confirmed
                        ? `Confirmed: ${srv?.confirmed?.candidate_name}`
                        : requested
                          ? `${srv?.demand} picked this — locked`
                          : srv
                            ? `${srv.demand} want this`
                            : "Open this time"
                    }
                    className={cn(
                      "h-6 border-l border-[#F0F1F5] text-[9px] font-bold transition-colors",
                      (rowHot || hover?.date === date) && !isHover && !locked && !filled && "bg-[rgba(108,92,231,0.04)]",
                      isHover && !locked && "ring-2 ring-inset ring-[#6C5CE7]",
                      confirmed
                        ? "cursor-not-allowed bg-[#00B894] text-white"
                        : requested
                          ? "cursor-not-allowed bg-[rgba(108,92,231,0.35)] text-[#4B3FB8]"
                          : filled
                            ? "bg-[rgba(108,92,231,0.15)] text-[#6C5CE7] hover:bg-[rgba(108,92,231,0.25)]"
                            : "bg-white text-transparent hover:bg-[#F0F1F5]",
                    )}
                  >
                    {confirmed ? "✓" : requested ? srv?.demand : filled ? (srv && srv.demand > 0 ? srv.demand : "") : ""}
                  </button>
                );
              })}
            </div>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 text-[11px] text-[#94A3B8]">
          <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-[3px] border border-[#E2E4EA] bg-white" /> Closed</span>
          <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-[3px] bg-[rgba(108,92,231,0.15)]" /> Available</span>
          <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-[3px] bg-[rgba(108,92,231,0.35)]" /> Picked (locked)</span>
          <span className="flex items-center gap-1"><span className="h-3 w-3 rounded-[3px] bg-[#00B894]" /> Confirmed (locked)</span>
        </div>
        <div className="flex items-center gap-2">
          {dirty && hasChanges && (
            <span className="text-[11.5px] text-[#C28100]">
              +{toAdd.length} / −{toRemove.length} unsaved
            </span>
          )}
          {dirty && (
            <button type="button" onClick={discard} disabled={saving} className="rounded-lg border border-[#E2E4EA] px-3 py-1.5 text-[12.5px] font-medium text-[#64748B] hover:bg-[#F5F6FA] disabled:opacity-50">
              Discard
            </button>
          )}
          <button
            type="button"
            onClick={save}
            disabled={!hasChanges || saving}
            className="rounded-lg bg-[#6C5CE7] px-4 py-1.5 text-[12.5px] font-semibold text-white hover:opacity-90 disabled:opacity-40"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
