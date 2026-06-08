"use client";

import React from "react";
import type { ScalePoint } from "@/types";
import { cn } from "@/lib/utils";

/**
 * The 1–N score cells used everywhere the form appears (template / edit / view).
 * Cells 1..value fill with accent. Interactive only when `onSelect` is given.
 */
interface RatingCellsProps {
  scale: ScalePoint[];
  value?: number;
  /** Omit to render read-only. */
  onSelect?: (n: number) => void;
  showWord?: boolean;
}

export function RatingCells({
  scale,
  value,
  onSelect,
  showWord = true,
}: RatingCellsProps): React.ReactElement {
  const interactive = !!onSelect;
  const word = value ? (scale.find((s) => s.value === value)?.label ?? "") : "";

  return (
    <div className="flex items-center gap-2.5">
      <div className="flex items-center gap-1">
        {scale.map((s) => {
          const filled = value != null && s.value <= value;
          return (
            <button
              key={s.value}
              type="button"
              disabled={!interactive}
              onClick={() => onSelect?.(s.value)}
              title={`${s.value} · ${s.label}`}
              className={cn(
                "w-8 h-8 rounded text-[13px] font-semibold flex items-center justify-center transition-colors",
                filled
                  ? "bg-accent text-white border border-accent"
                  : cn(
                      "bg-white border border-[#cfd4dc] text-[#9ca3af]",
                      interactive &&
                        "hover:border-accent hover:text-accent cursor-pointer",
                    ),
              )}
            >
              {s.value}
            </button>
          );
        })}
      </div>
      {showWord && (
        <span
          className="text-[12.5px] font-medium min-w-[92px]"
          style={{ color: value ? "var(--color-text)" : "var(--color-text-muted)" }}
        >
          {value ? word : interactive ? "Tap to rate" : ""}
        </span>
      )}
    </div>
  );
}
