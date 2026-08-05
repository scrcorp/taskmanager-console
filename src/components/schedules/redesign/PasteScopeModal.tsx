"use client";

/**
 * PasteScopeModal — 붙여넣을 대상 중 일부가 현재 필터에 가려져 있을 때 범위를 묻는 모달.
 *
 * 복사 시점과 붙여넣기 시점의 필터가 다를 수 있어(필터 없이 복사 → 필터 걸고 붙여넣기)
 * "보이는 것만" 을 조용히 강제하지 않고 사용자에게 선택시킨다.
 */

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui";

/** visible = 지금 보이는 것만, all = 가려진 것까지 전부 */
export type PasteScope = "visible" | "all";

interface Props {
  /** 현재 필터에서 보이는 대상 수 */
  visibleCount: number;
  /** 필터에 가려진 대상 수 (> 0 일 때만 이 모달을 띄운다) */
  hiddenCount: number;
  /** 어디서 온 데이터인지 — "the source week" / "the clipboard" */
  sourceLabel: string;
  onClose: (scope?: PasteScope) => void;
}

export function PasteScopeModal({ visibleCount, hiddenCount, sourceLabel, onClose }: Props) {
  const total = visibleCount + hiddenCount;

  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-warning-muted text-warning">
          <AlertTriangle className="h-5 w-5" />
        </div>
        <p className="text-sm leading-relaxed text-text-secondary">
          {hiddenCount} of the {total} schedules in {sourceLabel}{" "}
          {hiddenCount === 1 ? "is" : "are"} hidden by your current filter. What should be pasted?
        </p>
      </div>

      <div className="space-y-2">
        <button
          type="button"
          onClick={() => onClose("visible")}
          className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-left transition-colors hover:border-accent hover:bg-surface-hover"
        >
          <div className="text-sm font-semibold text-text">Visible only ({visibleCount})</div>
          <div className="mt-0.5 text-xs leading-snug text-text-muted">
            Matches what you see in the grid right now.
          </div>
        </button>

        <button
          type="button"
          onClick={() => onClose("all")}
          className="w-full rounded-lg border border-border bg-surface px-3 py-2.5 text-left transition-colors hover:border-accent hover:bg-surface-hover"
        >
          <div className="text-sm font-semibold text-text">Everything ({total})</div>
          <div className="mt-0.5 text-xs leading-snug text-text-muted">
            The {hiddenCount} hidden {hiddenCount === 1 ? "entry stays" : "entries stay"} out of
            sight in the grid, but {hiddenCount === 1 ? "it is" : "they are"} still saved. Review
            them before saving, or clear the filter to see them.
          </div>
        </button>
      </div>

      <div className="flex justify-end pt-1">
        <Button variant="secondary" size="sm" onClick={() => onClose()}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
