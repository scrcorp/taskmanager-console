"use client";

import React from "react";
import type { Warning } from "@/types";

/**
 * Compact two-pill sign-off summary for the warnings table: Employee + Manager.
 * Derived from the warning's `signatures` + `acknowledged_at`:
 *   - EMP: Signed (green) / Read (amber) / pending gray ("Not opened")
 *   - MGR: Signed (green) / Sign (accent — the actionable case) / pending gray
 * The manager pill is highlighted (accent) only when the employee has signed but
 * the manager hasn't — the row that needs a manager's action.
 */

type Tone = "done" | "pending" | "idle" | "action";

const TONE: Record<Tone, { fg: string; bg: string }> = {
  done: { fg: "var(--color-success, #00B894)", bg: "var(--color-success-muted, rgba(0,184,148,.15))" },
  pending: { fg: "var(--color-warning, #FDCB6E)", bg: "var(--color-warning-muted, rgba(253,203,110,.15))" },
  idle: { fg: "var(--color-text-secondary, #8B8DA3)", bg: "var(--color-surface-hover, #22252F)" },
  action: { fg: "var(--color-accent, #6C5CE7)", bg: "var(--color-accent-muted, rgba(108,92,231,.15))" },
};

function Pill({ who, label, tone, dot }: { who: string; label: string; tone: Tone; dot?: boolean }): React.ReactElement {
  const t = TONE[tone];
  return (
    <span
      className="inline-flex items-center gap-1 whitespace-nowrap rounded-full py-0.5 pl-1.5 pr-2 text-[11px] font-bold"
      style={{ color: t.fg, background: t.bg }}
      title={`${who}: ${label}`}
    >
      {dot && <span className="h-1.5 w-1.5 rounded-full" style={{ background: t.fg }} />}
      <span className="font-extrabold tracking-wide opacity-60">{who}</span>
      {label}
    </span>
  );
}

export function SignOffCell({ warning }: { warning: Warning }): React.ReactElement {
  const empSigned = !!warning.signatures.employee;
  const empRead = !empSigned && !!warning.acknowledged_at;
  const mgrSigned = !!warning.signatures.manager;
  // The manager must act once the employee has signed but the manager hasn't.
  const mgrNeedsAction = empSigned && !mgrSigned;

  const empPill = empSigned ? (
    <Pill who="EMP" label="Signed" tone="done" dot />
  ) : empRead ? (
    <Pill who="EMP" label="Read" tone="pending" dot />
  ) : (
    <Pill who="EMP" label="Not opened" tone="idle" />
  );

  const mgrPill = mgrSigned ? (
    <Pill who="MGR" label="Signed" tone="done" dot />
  ) : mgrNeedsAction ? (
    <Pill who="MGR" label="Sign" tone="action" dot />
  ) : (
    <Pill who="MGR" label="—" tone="idle" />
  );

  return (
    <div className="flex flex-wrap items-center gap-1">
      {empPill}
      {mgrPill}
    </div>
  );
}
