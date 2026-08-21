"use client";

/**
 * OverlapGate — ② 기존 그룹과 겹침(`PATTERN_OVERLAP_EXISTING` 409 또는 validate 의 `overlaps`) 시 3지선다.
 *
 * 설계 D-h(1):
 *   Move earlier (기본)  — 기존 그룹의 start_date 만 이 폼의 시작일로 옮긴다. **기존 설정 유지**, 신규 생성 없음.
 *   Replace              — 기존 그룹 폐기 + 지금 입력값으로 새로 만든다.
 *   Add separately       — 별개 그룹으로 추가. **요일이 겹치면 선택 불가**(이유 표시).
 *
 * 선택값은 `gate` 로 재전송한다(`move` | `replace`). "Add separately" 는 gate 없이 재전송(요일이 안 겹칠 때만 가능).
 * 이 컴포넌트는 선택만 받는다 — 전송은 FixedScheduleForm 이 한다.
 */

import type { PatternGroupOut } from "@/types/schedulePattern";
import { describeBlock, fmtPeriod, fmtShortDate } from "./ExistingPatternsList";
import { DOW_LABELS } from "./FixedBlockEditor";

export type OverlapGateChoice = "move" | "replace" | "add";

interface Props {
  /** 서버가 돌려준 겹치는 기존 그룹 후보. */
  overlaps: PatternGroupOut[];
  /** 폼의 공통 시작일 — "Move earlier" 가 옮길 목적지. */
  newStartDate: string;
  /** 폼에서 고른 요일 전체 (0=Sun..6=Sat). Add separately 가능 여부 판정. */
  newDows: ReadonlySet<number>;
  value: OverlapGateChoice;
  onChange: (v: OverlapGateChoice) => void;
  disabled?: boolean;
}

export function OverlapGate({ overlaps, newStartDate, newDows, value, onChange, disabled }: Props) {
  // 요일 겹침 — 기존 후보의 어느 블록이라도 폼 요일과 겹치면 Add separately 불가.
  const sharedDows = [...new Set(
    overlaps.flatMap((g) => g.blocks.flatMap((b) => b.byday)).filter((d) => newDows.has(d)),
  )].sort((a, b) => a - b);
  const addDisabled = sharedDows.length > 0;
  const sharedText = sharedDows.map((d) => DOW_LABELS[d] ?? String(d)).join(", ");

  const opt = (choice: OverlapGateChoice, title: string, desc: string, isDisabled = false, reason?: string) => (
    <label
      key={choice}
      className={`flex items-start gap-2 rounded-lg border px-2.5 py-2 ${
        isDisabled
          ? "opacity-50 cursor-not-allowed border-[var(--color-border)]"
          : value === choice
            ? "cursor-pointer border-[var(--color-warning)] bg-[var(--color-surface)]"
            : "cursor-pointer border-[var(--color-border)] hover:bg-[var(--color-surface)]"
      }`}
    >
      <input
        type="radio"
        name="fixed-overlap-gate"
        value={choice}
        checked={value === choice}
        disabled={disabled || isDisabled}
        onChange={() => onChange(choice)}
        className="mt-[3px] accent-[var(--color-warning)]"
      />
      <span className="text-[12px] leading-snug">
        <strong className="text-[var(--color-text)]">{title}</strong>
        <span className="text-[var(--color-text-secondary)]"> — {desc}</span>
        {isDisabled && reason && <span className="block text-[11px] text-[var(--color-danger)] mt-0.5">{reason}</span>}
      </span>
    </label>
  );

  return (
    <div
      data-testid="overlap-gate"
      role="group"
      aria-label="Resolve overlap with existing fixed schedule"
      className="rounded-xl border border-[var(--color-warning)] bg-[var(--color-warning-muted)] px-3 py-2.5 space-y-2"
    >
      <div className="text-[12px] font-bold text-[var(--color-warning)]">
        This staff already has a fixed schedule on these days
      </div>
      <ul className="text-[11.5px] text-[var(--color-text-secondary)] space-y-1">
        {overlaps.map((g) => (
          <li key={g.group_id} className="tabular-nums">
            <span className="font-semibold text-[var(--color-text)]">{fmtPeriod(g.start_date, g.until_date)}</span>
            {g.blocks.map((b) => (
              <span key={b.id} className="block pl-2">· {describeBlock(b)}</span>
            ))}
          </li>
        ))}
      </ul>
      <div className="text-[11px] text-[var(--color-text-secondary)]">Choose how to resolve it before saving:</div>
      <div className="space-y-1.5">
        {opt("move", "Move earlier", `start the existing schedule on ${fmtShortDate(newStartDate)} instead. Its times, roles and days stay as they are; nothing new is created.`)}
        {opt("replace", "Replace", "end the existing schedule and save what you entered here as the new one.")}
        {opt("add", "Add separately", "keep the existing schedule and add this as a second one.", addDisabled,
          `Not possible — both include ${sharedText}, which would give two shifts at the same time.`)}
      </div>
    </div>
  );
}
