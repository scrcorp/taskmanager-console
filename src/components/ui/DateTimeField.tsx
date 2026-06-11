"use client";

/**
 * DateTimeField — 날짜 + 시간(5분 단위)을 한 필드에서 고르는 picker.
 *
 * popover 안에 공용 `DatePickerCalendar`(날짜) + 시:분 AM/PM 선택(시계) 을 함께 둔다.
 * 값은 부모가 date(YYYY-MM-DD) / time("HH:MM" 24h, "" = TBD) 로 분리 보관한다.
 *
 * 규칙:
 *   - 날짜를 처음 고르면 시간은 `defaultTime`(기본 설정값)으로 채워진다(= TBD 아님).
 *   - TBD 체크 시 time="" (날짜만, 시간 미정). 해제하면 다시 defaultTime.
 *   - clearable: 날짜·시간 모두 비움(None).
 */

import React, { useEffect, useRef, useState } from "react";
import { Calendar as CalendarIcon } from "lucide-react";

import { DatePickerCalendar } from "@/components/schedules/redesign/WeekPickerCalendar";
import { cn } from "@/lib/utils";

const MINUTES = ["00", "05", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55"];
const HOURS12 = Array.from({ length: 12 }, (_, i) => i + 1);

interface Props {
  date: string; // YYYY-MM-DD or ""
  time: string; // "HH:MM" (24h) or "" (TBD, when date set)
  onChange: (date: string, time: string) => void;
  placeholder?: string;
  fallbackDate?: string; // calendar month when date empty
  defaultTime?: string; // 24h "HH:MM" used when a date is first picked
  locale?: string;
}

function dateToIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function parse12(hhmm: string): { h: number; m: string; ap: "AM" | "PM" } {
  const [hRaw = "9", mRaw = "00"] = hhmm.split(":");
  let h = Number(hRaw);
  const ap: "AM" | "PM" = h >= 12 ? "PM" : "AM";
  h = h % 12 || 12;
  const m = MINUTES.includes(mRaw) ? mRaw : "00";
  return { h, m, ap };
}

function to24(h: number, m: string, ap: "AM" | "PM"): string {
  let hh = h % 12;
  if (ap === "PM") hh += 12;
  return `${String(hh).padStart(2, "0")}:${m}`;
}

function fmtDate(iso: string, locale: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(locale, { year: "numeric", month: "short", day: "numeric" });
}

export function fmt12(hhmm: string): string {
  const { h, m, ap } = parse12(hhmm);
  return `${h}:${m} ${ap}`;
}

export function DateTimeField({
  date,
  time,
  onChange,
  placeholder = "None",
  fallbackDate,
  defaultTime = "09:00",
  locale = "en-US",
}: Props): React.ReactElement {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const tbd = !!date && !time;
  const calendarDate = new Date(`${date || fallbackDate || dateToIso(new Date())}T00:00:00`);
  const { h, m, ap } = parse12(time || defaultTime);

  const label = date
    ? `${fmtDate(date, locale)} · ${time ? fmt12(time) : "TBD"}`
    : placeholder;

  function setTime(nh: number, nm: string, nap: "AM" | "PM"): void {
    if (!date) return;
    onChange(date, to24(nh, nm, nap));
  }

  return (
    <div ref={rootRef} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex items-center gap-2 px-3 py-2 text-sm bg-surface border border-border rounded-lg",
          "text-text hover:border-accent/40 focus:outline-none focus:ring-1 focus:ring-accent",
          !date && "text-text-muted",
        )}
      >
        <CalendarIcon size={14} className="text-text-muted shrink-0" />
        <span>{label}</span>
      </button>

      {open && (
        <div
          className="absolute top-full left-0 mt-1 z-50 bg-surface border border-border rounded-lg shadow-lg p-2"
          style={{ minWidth: 280 }}
        >
          <DatePickerCalendar
            selectedDate={calendarDate}
            onSelect={(d) => onChange(dateToIso(d), date ? time : defaultTime)}
          />

          {/* time (clock) — 5-min steps */}
          <div className="mt-2 pt-2 border-t border-border flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] font-bold uppercase tracking-wide text-text-muted mr-1">Time</span>
            <select
              value={h}
              disabled={!date || tbd}
              onChange={(e) => setTime(Number(e.target.value), m, ap)}
              className="text-sm bg-surface border border-border rounded-md px-1.5 py-1 text-text disabled:opacity-40"
            >
              {HOURS12.map((x) => (
                <option key={x} value={x}>{x}</option>
              ))}
            </select>
            <span className="text-text-muted">:</span>
            <select
              value={m}
              disabled={!date || tbd}
              onChange={(e) => setTime(h, e.target.value, ap)}
              className="text-sm bg-surface border border-border rounded-md px-1.5 py-1 text-text disabled:opacity-40"
            >
              {MINUTES.map((x) => (
                <option key={x} value={x}>{x}</option>
              ))}
            </select>
            <select
              value={ap}
              disabled={!date || tbd}
              onChange={(e) => setTime(h, m, e.target.value as "AM" | "PM")}
              className="text-sm bg-surface border border-border rounded-md px-1.5 py-1 text-text disabled:opacity-40"
            >
              <option value="AM">AM</option>
              <option value="PM">PM</option>
            </select>

            <label className={cn("flex items-center gap-1.5 text-xs font-semibold ml-auto cursor-pointer", date ? "text-text-secondary" : "text-text-muted")}>
              <input
                type="checkbox"
                checked={tbd}
                disabled={!date}
                onChange={(e) => onChange(date, e.target.checked ? "" : defaultTime)}
                className="accent-accent"
              />
              TBD
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
