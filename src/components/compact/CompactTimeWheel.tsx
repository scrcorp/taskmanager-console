"use client";

/**
 * 간소화 콘솔 시간 선택 휠.
 *
 * `input[type=datetime-local]` 을 쓰면 모바일 OS 가 전체 달력을 띄운다 — 몇 분만 고치려는
 * 상황에 화면을 다 덮어서 제일 흔한 조작이 제일 느렸다. 그래서 표준 드럼 휠로 대체한다.
 *
 * 단위가 표면마다 다르다:
 *   - 스케줄(계획) 5분 — 스케줄 시간 정책의 그리드 단위
 *   - 근태(실제)  1분 — 실제로 찍힌 시각이라 반올림하면 기록을 왜곡한다
 *
 * 날짜 열은 근태에서만 쓴다(자정 넘긴 퇴근). 스케줄은 영업일이 고정이라 시각만 고르고
 * 자정 넘김은 호출 측이 +1d 로 표기한다.
 */

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

const ITEM_H = 40;

export interface WheelValue {
  /** "YYYY-MM-DD". 날짜 열이 없으면 호출 측이 준 값을 그대로 되돌려준다. */
  date: string;
  /** "HH:MM" (24h). */
  time: string;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** "YYYY-MM-DD" → "Sat, Aug 9". UTC 기준 순수 날짜 산술이라 tz 영향 없음. */
function dateLabel(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function Column({
  items,
  index,
  onIndex,
  wide,
  label,
}: {
  items: string[];
  index: number;
  onIndex: (i: number) => void;
  wide?: boolean;
  label: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 스크롤 이벤트가 부모 상태를 바꾸고, 그 리렌더가 다시 scrollTop 을 되돌리는 왕복을 막는다.
  const programmatic = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const target = index * ITEM_H;
    if (Math.abs(el.scrollTop - target) < 2) return;
    programmatic.current = true;
    el.scrollTop = target;
    // 한 프레임 뒤에 해제 — 위 대입이 만든 scroll 이벤트까지만 무시한다.
    requestAnimationFrame(() => {
      programmatic.current = false;
    });
  }, [index]);

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <span className="pb-1 text-center text-[10px] font-bold uppercase tracking-wide text-text-muted">
        {label}
      </span>
      <div
        ref={ref}
        role="listbox"
        aria-label={label}
        className="h-[200px] snap-y snap-mandatory overflow-y-auto py-[80px] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        onScroll={(e) => {
          if (programmatic.current) return;
          const el = e.currentTarget;
          if (settle.current) clearTimeout(settle.current);
          settle.current = setTimeout(() => {
            const next = Math.max(0, Math.min(items.length - 1, Math.round(el.scrollTop / ITEM_H)));
            if (next !== index) onIndex(next);
          }, 90);
        }}
      >
        {items.map((item, i) => (
          <button
            key={item}
            type="button"
            role="option"
            aria-selected={i === index}
            onClick={() => onIndex(i)}
            className={cn(
              "flex h-10 w-full snap-center items-center justify-center tabular-nums transition-colors",
              wide ? "text-sm" : "text-lg",
              i === index ? "font-extrabold text-text" : "font-semibold text-text-muted",
            )}
          >
            {item}
          </button>
        ))}
      </div>
    </div>
  );
}

export function CompactTimeWheel({
  value,
  onChange,
  step,
  dates,
}: {
  value: WheelValue;
  onChange: (next: WheelValue) => void;
  /** 분 단위 — 근태 1, 스케줄 5. */
  step: 1 | 5;
  /** 날짜 열에 띄울 "YYYY-MM-DD" 목록. 생략하면 시각만 고른다. */
  dates?: string[];
}) {
  const hour = Number(value.time.slice(0, 2));
  const minute = Number(value.time.slice(3, 5));

  const hours = Array.from({ length: 24 }, (_, i) => pad(i));
  const minutes = Array.from({ length: 60 / step }, (_, i) => pad(i * step));
  // 1분 단위 휠에 5분 배수가 아닌 값이 들어와도(실제 찍힌 시각) 가장 가까운 칸을 가리킨다.
  const minuteIndex = Math.min(minutes.length - 1, Math.round(minute / step));

  const dateIndex = dates ? Math.max(0, dates.indexOf(value.date)) : 0;

  return (
    <div className="relative">
      {/* 선택 밴드 — 열 제목(약 18px) 아래 80px 지점 */}
      <div className="pointer-events-none absolute inset-x-1 top-[98px] h-10 rounded-lg bg-surface-hover" />
      <div className="relative flex gap-1">
        {dates && dates.length > 0 && (
          <Column
            wide
            label="Date"
            items={dates.map(dateLabel)}
            index={dateIndex}
            onIndex={(i) => onChange({ ...value, date: dates[i] })}
          />
        )}
        <Column
          label="Hour"
          items={hours}
          index={hour}
          onIndex={(i) => onChange({ ...value, time: `${pad(i)}:${pad(minute)}` })}
        />
        <Column
          label="Min"
          items={minutes}
          index={minuteIndex}
          onIndex={(i) => onChange({ ...value, time: `${pad(hour)}:${minutes[i]}` })}
        />
      </div>
    </div>
  );
}

/**
 * 넛지 버튼 — 대부분의 정정은 예정 시각 근처라 휠을 돌리는 것보다 이게 빠르다.
 * 자정을 넘기면 날짜 열이 있을 때만 날짜가 함께 움직인다.
 */
export function CompactTimeNudge({
  value,
  onChange,
  steps,
  dates,
}: {
  value: WheelValue;
  onChange: (next: WheelValue) => void;
  steps: number[];
  dates?: string[];
}) {
  const apply = (delta: number) => {
    const total = Number(value.time.slice(0, 2)) * 60 + Number(value.time.slice(3, 5)) + delta;
    const dayShift = Math.floor(total / 1440);
    const wrapped = ((total % 1440) + 1440) % 1440;
    let date = value.date;
    if (dates && dayShift !== 0) {
      const idx = dates.indexOf(value.date) + dayShift;
      if (idx < 0 || idx >= dates.length) return; // 범위 밖으로는 넘기지 않는다
      date = dates[idx];
    }
    onChange({ date, time: `${pad(Math.floor(wrapped / 60))}:${pad(wrapped % 60)}` });
  };

  return (
    <div className="mt-3 flex gap-2">
      {steps.map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => apply(s)}
          className="h-9 flex-1 rounded-lg border border-border bg-surface text-xs font-bold text-text-secondary transition-colors active:bg-surface-hover"
        >
          {s > 0 ? `+${s}m` : `${s}m`}
        </button>
      ))}
    </div>
  );
}
