"use client";

/**
 * FixedBlockEditor — 고정 근무 설정 블록 1개 (= `staff_work_patterns` 행 1개).
 *
 * 시각·역할·휴게·요일 7버튼(Sun→Sat)·"Different period" 토글·삭제.
 * 겹침/가용성 표시는 **요일 버튼 색**으로 한다 — 어느 요일이 문제인지 버튼 자리에서 바로 읽히게.
 *   - conflictDows: ① 창 안 다른 블록과 같은 요일·시간 겹침 (클라 선계산 + 서버 400 매핑)
 *   - availabilityDows: ④ 그 요일의 근무가능시간 밖 (서버 400 매핑)
 *
 * 요일 인덱스는 0=Sun..6=Sat (일요일 시작). 파이썬 weekday(0=Mon) 와 혼동 금지.
 */

import { TimeSelect, workRoleLabel } from "../redesign/ScheduleEditModal";
import { wrapMinutes, timeToMin } from "@/lib/scheduleTime";
import type { WorkRole } from "@/types";

export const DOW_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** 폼 로컬 블록 상태. 서버 `PatternBlockIn` 으로는 저장 직전에 변환한다. */
export interface FixedBlockDraft {
  /** React key 용 로컬 식별자 (저장값 아님). */
  key: string;
  startTime: string;            // "HH:MM"
  endTime: string;              // "HH:MM" — end < start 면 overnight
  breakEnabled: boolean;
  breakStart: string;           // "HH:MM" (breakEnabled 일 때만 의미)
  breakEnd: string;
  workRoleId: string;           // "" = 역할 없음
  byday: number[];              // 0=Sun..6=Sat
  /** "Different period" 토글 — 켜면 아래 두 날짜가 공통 기간을 덮어쓴다. */
  differentPeriod: boolean;
  startDate: string;            // "YYYY-MM-DD" (differentPeriod 일 때만 사용)
  untilDate: string;            // "" = 무기한
}

/** start→end 길이(분). overnight 은 wrap. */
export function blockDurationMin(b: Pick<FixedBlockDraft, "startTime" | "endTime">): number {
  return wrapMinutes(timeToMin(b.endTime) - timeToMin(b.startTime));
}

function fmtDuration(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

interface Props {
  index: number;
  block: FixedBlockDraft;
  workRoles: WorkRole[];
  workRolesLoading?: boolean;
  /** 공통 기간 (differentPeriod 가 꺼져 있을 때 안내용). */
  commonStartDate: string;
  commonUntilDate: string;
  /** ① 이 블록에서 다른 블록과 겹치는 요일들. */
  conflictDows: ReadonlySet<number>;
  /** ④ 이 블록에서 근무가능시간 밖인 요일들. */
  availabilityDows: ReadonlySet<number>;
  /** 블록이 1개뿐이면 삭제 버튼을 숨긴다. */
  canRemove: boolean;
  disabled?: boolean;
  onChange: (next: FixedBlockDraft) => void;
  onRemove: () => void;
}

export function FixedBlockEditor({
  index, block, workRoles, workRolesLoading, commonStartDate, commonUntilDate,
  conflictDows, availabilityDows, canRemove, disabled, onChange, onRemove,
}: Props) {
  const set = (patch: Partial<FixedBlockDraft>) => onChange({ ...block, ...patch });
  const duration = blockDurationMin(block);
  const overnight = timeToMin(block.endTime) <= timeToMin(block.startTime);
  const breakMin = block.breakEnabled && block.breakStart && block.breakEnd
    ? wrapMinutes(timeToMin(block.breakEnd) - timeToMin(block.breakStart))
    : 0;

  function toggleDow(d: number) {
    if (disabled) return;
    const has = block.byday.includes(d);
    const next = has ? block.byday.filter((x) => x !== d) : [...block.byday, d].sort((a, b) => a - b);
    set({ byday: next });
  }

  function onChangeWorkRole(id: string) {
    const wr = workRoles.find((w) => w.id === id);
    // 역할 기본 시각이 있으면 채운다 — 일반 모달과 같은 동작. 이미 고른 요일은 건드리지 않는다.
    if (wr?.default_start_time && wr.default_end_time) {
      set({
        workRoleId: id,
        startTime: wr.default_start_time.slice(0, 5),
        endTime: wr.default_end_time.slice(0, 5),
        ...(wr.break_start_time && wr.break_end_time
          ? { breakEnabled: true, breakStart: wr.break_start_time.slice(0, 5), breakEnd: wr.break_end_time.slice(0, 5) }
          : {}),
      });
      return;
    }
    set({ workRoleId: id });
  }

  const conflictNames = [...conflictDows].sort().map((d) => DOW_LABELS[d]).join(", ");
  const availNames = [...availabilityDows].sort().map((d) => DOW_LABELS[d]).join(", ");
  const timeCls = "px-2 py-1.5 border rounded-lg text-[13px] bg-[var(--color-surface)] border-[var(--color-border)]";

  return (
    <div
      data-testid={`fixed-block-${index}`}
      className={`rounded-xl border bg-[var(--color-surface)] p-3 space-y-2.5 ${
        conflictDows.size > 0 || availabilityDows.size > 0 ? "border-[var(--color-danger)]" : "border-[var(--color-border)]"
      }`}
    >
      {/* 제목줄: Block N · 길이 · 삭제 */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.11em] text-[var(--color-text-muted)]">Block {index + 1}</span>
        <span className="text-[11px] tabular-nums text-[var(--color-text-muted)]">
          {fmtDuration(duration)}{breakMin > 0 ? ` · ${breakMin}m break` : ""}{overnight ? " · overnight" : ""}
        </span>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            disabled={disabled}
            className="ml-auto px-2 py-0.5 rounded-md text-[11px] font-semibold text-[var(--color-danger)] hover:bg-[var(--color-danger-muted)] disabled:opacity-50"
            aria-label={`Remove block ${index + 1}`}
          >
            Remove
          </button>
        )}
      </div>

      {/* 시각 + 역할 */}
      <div className="grid grid-cols-[auto_auto_minmax(0,1fr)] gap-2 items-center">
        <div>
          <span className="block text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--color-text-muted)] mb-1">Start</span>
          <TimeSelect value={block.startTime} onChange={(v) => set({ startTime: v })} className={timeCls} />
        </div>
        <div>
          <span className="block text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--color-text-muted)] mb-1">End</span>
          <TimeSelect value={block.endTime} onChange={(v) => set({ endTime: v })} className={timeCls} />
        </div>
        <div className="min-w-0">
          <span className="block text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--color-text-muted)] mb-1">Work role</span>
          <select
            value={block.workRoleId}
            onChange={(e) => onChangeWorkRole(e.target.value)}
            disabled={disabled}
            className="w-full px-2 py-[7px] border rounded-lg text-[13px] bg-[var(--color-surface)] border-[var(--color-border)]"
            aria-label={`Work role for block ${index + 1}`}
          >
            <option value="">— None (no role) —</option>
            {workRolesLoading && <option disabled>Loading…</option>}
            {workRoles.map((wr) => (
              <option key={wr.id} value={wr.id}>{workRoleLabel(wr)}</option>
            ))}
          </select>
        </div>
      </div>
      {duration === 0 && (
        <div className="text-[11px] text-[var(--color-danger)]">End time must be different from start time.</div>
      )}

      {/* 휴게 */}
      <div className="flex items-center gap-3 flex-wrap">
        <label className="inline-flex items-center gap-2 text-[12px] text-[var(--color-text-secondary)] select-none cursor-pointer">
          <input
            type="checkbox"
            checked={block.breakEnabled}
            disabled={disabled}
            onChange={(e) => {
              const on = e.target.checked;
              if (on && (!block.breakStart || !block.breakEnd)) {
                // 기본값: 시작 +3h 부터 30분. 사용자는 바로 고칠 수 있다.
                const s = wrapMinutes(timeToMin(block.startTime) + 180);
                const pad = (n: number) => String(n).padStart(2, "0");
                const toT = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
                set({ breakEnabled: true, breakStart: toT(s), breakEnd: toT(wrapMinutes(s + 30)) });
              } else {
                set({ breakEnabled: on });
              }
            }}
            className="w-3.5 h-3.5 accent-[var(--color-accent)]"
          />
          Split with break
        </label>
        {block.breakEnabled && (
          <div className="flex items-center gap-2">
            <TimeSelect value={block.breakStart || "12:00"} onChange={(v) => set({ breakStart: v })} className={timeCls} />
            <span className="text-[11px] text-[var(--color-text-muted)]">–</span>
            <TimeSelect value={block.breakEnd || "12:30"} onChange={(v) => set({ breakEnd: v })} className={timeCls} />
          </div>
        )}
      </div>

      {/* 요일 7버튼 — Sun→Sat. 문제 요일은 빨갛게. */}
      <div>
        <span className="block text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--color-text-muted)] mb-1">Days</span>
        <div className="grid grid-cols-7 gap-1" role="group" aria-label={`Days of week for block ${index + 1}`}>
          {DOW_LABELS.map((name, d) => {
            const on = block.byday.includes(d);
            const bad = conflictDows.has(d) || availabilityDows.has(d);
            return (
              <button
                key={d}
                type="button"
                onClick={() => toggleDow(d)}
                disabled={disabled}
                aria-pressed={on}
                data-dow={d}
                data-conflict={bad ? "true" : undefined}
                className={`py-1.5 rounded-md border text-[12px] font-semibold transition-colors ${
                  bad
                    ? "border-[var(--color-danger)] bg-[var(--color-danger-muted)] text-[var(--color-danger)]"
                    : on
                      ? "border-[var(--color-accent)] bg-[var(--color-accent-muted)] text-[var(--color-accent)]"
                      : "border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]"
                } disabled:opacity-50`}
              >
                {name}
              </button>
            );
          })}
        </div>
        {block.byday.length === 0 && (
          <div className="mt-1 text-[11px] text-[var(--color-danger)]">Select at least one day.</div>
        )}
        {conflictDows.size > 0 && (
          <div className="mt-1 text-[11px] text-[var(--color-danger)]">
            Overlaps another block on {conflictNames} at the same time. Two shifts on one day are fine only if the times don&apos;t overlap — change the times or uncheck the day.
          </div>
        )}
        {availabilityDows.size > 0 && (
          <div className="mt-1 text-[11px] text-[var(--color-danger)]">
            Outside this staff&apos;s availability on {availNames}. Pick a time inside their availability, or update their availability first.
          </div>
        )}
      </div>

      {/* 블록별 기간 override */}
      <div className="pt-2 border-t border-dashed border-[var(--color-border)]">
        <label className="inline-flex items-center gap-2 text-[12px] text-[var(--color-text-secondary)] select-none cursor-pointer">
          <input
            type="checkbox"
            checked={block.differentPeriod}
            disabled={disabled}
            onChange={(e) => set({
              differentPeriod: e.target.checked,
              // 켜는 순간 공통값을 복사해 시작점으로 준다 — 빈 날짜로 시작하지 않게.
              ...(e.target.checked && !block.startDate ? { startDate: commonStartDate, untilDate: commonUntilDate } : {}),
            })}
            className="w-3.5 h-3.5 accent-[var(--color-accent)]"
          />
          Different period for this block
        </label>
        {block.differentPeriod && (
          <div className="mt-1.5 flex items-center gap-2 flex-wrap text-[12px]">
            <input
              type="date"
              value={block.startDate}
              disabled={disabled}
              onChange={(e) => e.target.value && set({ startDate: e.target.value })}
              className="px-2 py-1.5 border rounded-lg text-[13px] tabular-nums bg-[var(--color-surface)] border-[var(--color-border)]"
              aria-label={`Block ${index + 1} start date`}
            />
            <span className="text-[var(--color-text-muted)]">to</span>
            <input
              type="date"
              value={block.untilDate}
              min={block.startDate || undefined}
              disabled={disabled}
              onChange={(e) => set({ untilDate: e.target.value })}
              className="px-2 py-1.5 border rounded-lg text-[13px] tabular-nums bg-[var(--color-surface)] border-[var(--color-border)]"
              aria-label={`Block ${index + 1} end date`}
            />
            <span className="text-[11px] text-[var(--color-text-muted)]">{block.untilDate ? "" : "No end date = ongoing"}</span>
            {block.untilDate && block.startDate && block.untilDate < block.startDate && (
              <span className="text-[11px] text-[var(--color-danger)]">End date must be on or after the start date.</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
