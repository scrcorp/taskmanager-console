"use client";

/**
 * DateField — 단일 날짜 picker (button + popover + 자체 캘린더).
 *
 * 기존 `<input type="date">`(yyyy-mm-dd) 대체. 우리 `DatePickerCalendar`
 * (schedules/redesign) 를 popover 안에서 사용.
 *
 * 값 포맷: ISO `YYYY-MM-DD` 문자열. 부모는 그대로 받아 server 필터로 전달.
 */

import React, { useEffect, useRef, useState } from "react";
import { Calendar as CalendarIcon } from "lucide-react";

import { DatePickerCalendar } from "@/components/schedules/redesign/WeekPickerCalendar";
import { cn } from "@/lib/utils";

interface Props {
  value: string;
  onChange: (v: string) => void;
  /** 빈 값일 때 버튼에 표시할 placeholder (예: "Pick a date"). */
  placeholder?: string;
  /** 비교용 — value 가 빈 문자열일 때 popover 가 보여줄 기본 month. ISO `YYYY-MM-DD`. */
  fallbackDate?: string;
  /** 우측 X 클릭으로 값 비우기. 기본 true. */
  clearable?: boolean;
  className?: string;
  /** 표시 로케일. 기본 en-US. */
  locale?: string;
}

/** ISO `YYYY-MM-DD` → 표시 라벨 (예: "Apr 5, 2026"). */
function fmtLabel(iso: string, locale: string): string {
  // local-time 파싱 (T00:00 강제하면 timezone shift 없이 정확한 날짜 유지)
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** Date → ISO `YYYY-MM-DD` (local fields). */
function dateToIso(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function DateField({
  value,
  onChange,
  placeholder = "Pick a date",
  fallbackDate,
  clearable = true,
  className,
  locale = "en-US",
}: Props): React.ReactElement {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  // outside click → 닫기
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const calendarDate = (() => {
    const iso = value || fallbackDate || dateToIso(new Date());
    return new Date(`${iso}T00:00:00`);
  })();

  return (
    <div ref={rootRef} className={cn("relative inline-flex", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex items-center gap-2 px-3 py-2 text-sm bg-surface border border-border rounded-lg",
          "text-text hover:border-accent/40 focus:outline-none focus:ring-1 focus:ring-accent",
          !value && "text-text-muted",
        )}
      >
        <CalendarIcon size={14} className="text-text-muted shrink-0" />
        <span>{value ? fmtLabel(value, locale) : placeholder}</span>
      </button>

      {open && (
        <div
          className="absolute top-full left-0 mt-1 z-50 bg-surface border border-border rounded-lg shadow-lg p-2"
          style={{ minWidth: 280 }}
        >
          <DatePickerCalendar
            selectedDate={calendarDate}
            onSelect={(d) => {
              onChange(dateToIso(d));
              setOpen(false);
            }}
          />
        </div>
      )}
    </div>
  );
}
