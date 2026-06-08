"use client";

import React, { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export interface RowMenuItem {
  label: string;
  onClick: () => void;
  danger?: boolean;
  dividerBefore?: boolean;
  icon?: React.ReactNode;
}

/** Kebab popover for per-row actions. Stops row-click propagation. */
export function RowMenu({ items }: { items: RowMenuItem[] }): React.ReactElement {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") setOpen(false);
    };
    const t = window.setTimeout(() => document.addEventListener("mousedown", onDown), 0);
    document.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Row actions"
        className={cn(
          "w-8 h-8 rounded-lg flex items-center justify-center text-text-muted hover:bg-surface-hover hover:text-text-secondary transition-colors cursor-pointer",
          open && "bg-surface-hover text-text-secondary",
        )}
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
          <circle cx="8" cy="3" r="1.4" />
          <circle cx="8" cy="8" r="1.4" />
          <circle cx="8" cy="13" r="1.4" />
        </svg>
      </button>
      {open && (
        <div
          className="absolute right-0 top-9 z-20 min-w-[168px] bg-card border border-border rounded-lg py-1 shadow-lg"
        >
          {items.map((it, i) => (
            <div key={i}>
              {it.dividerBefore && <div className="my-1 h-px bg-border" />}
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  it.onClick();
                }}
                className={cn(
                  "w-full text-left px-3 py-2 text-[13.5px] font-medium flex items-center gap-2.5 transition-colors cursor-pointer",
                  it.danger
                    ? "text-danger hover:bg-danger-muted"
                    : "text-text hover:bg-surface-hover",
                )}
              >
                {it.icon && <span className="shrink-0">{it.icon}</span>}
                {it.label}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
