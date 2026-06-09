/**
 * Reason category chips — a colored dot + label per category, with optional
 * overflow ("+N"). `short` uses abbreviated labels for tight table cells.
 */
import React from "react";
import type { WarningCategory } from "@/types";
import { CATEGORY_META } from "./categories";

interface Props {
  categories: WarningCategory[];
  max?: number;
  short?: boolean;
}

export function CategoryChips({ categories, max = 2, short = false }: Props): React.ReactElement {
  const shown = categories.slice(0, max);
  const extra = categories.length - shown.length;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {shown.map((c) => {
        const m = CATEGORY_META[c];
        return (
          <span
            key={c}
            title={m?.label ?? c}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-0.5 text-xs font-medium text-text-secondary whitespace-nowrap"
          >
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: m?.color }} />
            {short ? m?.short ?? c : m?.label ?? c}
          </span>
        );
      })}
      {extra > 0 && (
        <span className="inline-flex items-center rounded-full bg-surface-hover px-2 py-0.5 text-xs font-medium text-text-muted">
          +{extra}
        </span>
      )}
    </div>
  );
}
