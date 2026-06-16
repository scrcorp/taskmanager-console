"use client";

import React from "react";
import { MonitorSmartphone, FileSignature } from "lucide-react";
import type { WarningSignatureMethod } from "@/types";
import { cn } from "@/lib/utils";

/**
 * Digital / Wet segmented toggle for the warning signature method. Lives in the
 * action bar (NOT inside the printable WarningFormDoc grid) so it never appears
 * on the printed/exported PDF. Used by the create editor (free toggle).
 */
interface Props {
  value: WarningSignatureMethod;
  onChange: (m: WarningSignatureMethod) => void;
  disabled?: boolean;
}

const OPTS: { key: WarningSignatureMethod; label: string; Icon: typeof MonitorSmartphone }[] = [
  { key: "digital", label: "Digital", Icon: MonitorSmartphone },
  { key: "wet", label: "Wet", Icon: FileSignature },
];

export function MethodToggle({ value, onChange, disabled }: Props): React.ReactElement {
  return (
    <div
      role="group"
      aria-label="Signature method"
      className="inline-flex items-center rounded-lg border border-border bg-surface p-0.5"
    >
      {OPTS.map(({ key, label, Icon }) => {
        const active = value === key;
        return (
          <button
            key={key}
            type="button"
            disabled={disabled}
            aria-pressed={active}
            onClick={() => !active && onChange(key)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50",
              active
                ? "bg-accent text-white shadow-sm"
                : "text-text-secondary hover:text-text",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        );
      })}
    </div>
  );
}
