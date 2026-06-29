"use client";

/**
 * 접근성 있는 토글 스위치 (controlled).
 *
 * Accessible controlled toggle switch. role="switch" + aria-checked,
 * keyboard (space/enter), dark theme colors. on = accent/success, off = border.
 */

import React, { useCallback } from "react";
import { cn } from "@/lib/utils";

interface SwitchProps {
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
  disabled?: boolean;
  /** Visible text label rendered next to the switch. */
  label?: string;
  /** Accessible name when no visible label is supplied. */
  "aria-label"?: string;
  /** on-state color. Defaults to accent. */
  variant?: "accent" | "success";
  className?: string;
}

export function Switch({
  checked,
  onCheckedChange,
  disabled = false,
  label,
  "aria-label": ariaLabel,
  variant = "accent",
  className,
}: SwitchProps): React.ReactElement {
  const toggle = useCallback(() => {
    if (disabled) return;
    onCheckedChange(!checked);
  }, [disabled, onCheckedChange, checked]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>) => {
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        toggle();
      }
    },
    [toggle],
  );

  const onColor = variant === "success" ? "bg-success" : "bg-accent";

  return (
    <span className={cn("inline-flex items-center gap-2", className)}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label ? undefined : ariaLabel}
        disabled={disabled}
        onClick={toggle}
        onKeyDown={handleKeyDown}
        className={cn(
          "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200 ease-in-out",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-card",
          checked ? onColor : "bg-border",
          disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
        )}
      >
        <span
          className={cn(
            "inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200 ease-in-out",
            checked ? "translate-x-[18px]" : "translate-x-0.5",
          )}
        />
      </button>
      {label !== undefined && (
        <span
          className={cn(
            "text-sm select-none",
            checked ? "text-text" : "text-text-muted",
            !disabled && "cursor-pointer",
          )}
          onClick={toggle}
        >
          {label}
        </span>
      )}
    </span>
  );
}
