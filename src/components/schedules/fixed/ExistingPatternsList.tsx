"use client";

/**
 * ExistingPatternsList — 이 직원·매장의 기존 고정 근무(그룹 단위) 읽기 전용 목록.
 *
 * 설계 D-i(1-c): 신규 작성 영역 아래에 기존 것을 보여 **중복을 게이트 이전에 예방**한다.
 * 표시와 편집은 분리 — 항목 [Edit] 는 그 그룹의 편집 모드로 전환할 뿐, 여기서 값을 고치지 않는다.
 * 표시 범위 = 현재 유효 + 예정(종료된 것은 서버 `include_ended=false` 기본).
 */

import { useState } from "react";
import type { PatternGroupOut, PatternBlockOut } from "@/types/schedulePattern";
import { DOW_LABELS } from "./FixedBlockEditor";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "YYYY-MM-DD" → "Sep 8" (로컬 tz 파싱 없이 문자열 성분만). */
export function fmtShortDate(d: string): string {
  const [, m, dd] = d.split("-").map(Number);
  return `${MONTHS[(m ?? 1) - 1]} ${dd}`;
}
/** "HH:MM[:SS]" → "9:00 AM". */
export function fmtClock(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const hh = (h ?? 0) % 12 === 0 ? 12 : (h ?? 0) % 12;
  return `${hh}:${String(m ?? 0).padStart(2, "0")} ${(h ?? 0) < 12 ? "AM" : "PM"}`;
}
export function fmtDows(byday: number[]): string {
  return [...byday].sort((a, b) => a - b).map((d) => DOW_LABELS[d] ?? String(d)).join("/");
}
/** 기간 한 줄 — "From Sep 8" / "Sep 8 – Dec 31". */
export function fmtPeriod(start: string, until: string | null | undefined): string {
  return until ? `${fmtShortDate(start)} – ${fmtShortDate(until)}` : `From ${fmtShortDate(start)}`;
}
/** 블록 한 줄 — "Tue/Thu · 12:00 PM–8:00 PM · Cook". */
export function describeBlock(b: PatternBlockOut): string {
  const role = b.work_role_name ? ` · ${b.work_role_name}` : "";
  return `${fmtDows(b.byday)} · ${fmtClock(b.start_time)}–${fmtClock(b.end_time)}${role}`;
}

interface Props {
  groups: PatternGroupOut[];
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
  /** 편집 중인 그룹은 목록에서 "Editing" 으로 표시하고 [Edit] 를 숨긴다. */
  editingGroupId?: string | null;
  /** 기본 펼침 여부 — 신규 작성 중엔 펼치고, 편집 중엔 접는다 (목업과 동일). */
  defaultOpen: boolean;
  onEdit: (group: PatternGroupOut) => void;
}

export function ExistingPatternsList({ groups, isLoading, isError, onRetry, editingGroupId, defaultOpen, onEdit }: Props) {
  const [open, setOpen] = useState(defaultOpen);
  const count = groups.length;

  return (
    <div className="pt-3 border-t border-dashed border-[var(--color-border)]" data-testid="existing-patterns">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-2 text-left text-[12px] font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"
      >
        <span className="inline-block w-3 text-[10px]">{open ? "▼" : "▶"}</span>
        Existing fixed schedules
        <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold tabular-nums bg-[var(--color-bg)] text-[var(--color-text-muted)]">
          {isLoading ? "…" : count}
        </span>
        <span className="ml-auto text-[10px] font-normal text-[var(--color-text-muted)]">current + upcoming</span>
      </button>

      {open && (
        <div className="mt-2 space-y-1.5">
          {isError ? (
            <div className="px-2.5 py-2 rounded-lg border border-[var(--color-danger)] bg-[var(--color-danger-muted)] text-[11px] text-[var(--color-danger)] flex items-center gap-2">
              <span className="flex-1">Couldn&apos;t load this staff&apos;s existing fixed schedules, so duplicates can&apos;t be shown here. The server still checks on save.</span>
              {onRetry && (
                <button type="button" onClick={onRetry} className="font-bold underline underline-offset-2">Retry</button>
              )}
            </div>
          ) : isLoading ? (
            <div className="text-[11px] text-[var(--color-text-muted)] px-1">Loading…</div>
          ) : count === 0 ? (
            <div className="text-[11px] text-[var(--color-text-muted)] px-1">None yet for this staff at this store.</div>
          ) : (
            groups.map((g) => {
              const editing = g.group_id === editingGroupId;
              return (
                <div
                  key={g.group_id}
                  data-testid="existing-pattern-row"
                  className={`rounded-lg border px-2.5 py-2 text-[12px] ${
                    editing ? "border-[var(--color-accent)] bg-[var(--color-accent-muted)]" : "border-[var(--color-border)] bg-[var(--color-bg)]"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-[var(--color-text)] tabular-nums">
                        {fmtPeriod(g.start_date, g.until_date)}
                        {g.store_name && <span className="ml-1.5 font-normal text-[var(--color-text-muted)]">· {g.store_name}</span>}
                      </div>
                      <ul className="mt-0.5 space-y-0.5 text-[var(--color-text-secondary)]">
                        {g.blocks.map((b) => (
                          <li key={b.id} className="truncate">
                            · {describeBlock(b)}
                            {(b.start_date !== g.start_date || (b.until_date ?? null) !== (g.until_date ?? null)) && (
                              <span className="ml-1 text-[10px] text-[var(--color-text-muted)]">({fmtPeriod(b.start_date, b.until_date)})</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                    {editing ? (
                      <span className="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold border border-[var(--color-accent)] text-[var(--color-accent)]">Editing</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onEdit(g)}
                        className="shrink-0 px-2.5 py-1 rounded-md text-[11px] font-semibold border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]"
                      >
                        Edit
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
