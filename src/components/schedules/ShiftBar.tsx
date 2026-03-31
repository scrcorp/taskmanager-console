"use client";

/**
 * ShiftBar — 타임라인 그리드에서 개별 시프트를 시각화하는 바 컴포넌트.
 *
 * Renders a single shift as a colored bar with status styling, break gap,
 * hover tooltip, and click handler. Positioned absolutely within its table cell.
 */

import React, { useState } from "react";
import { cn } from "@/lib/utils";

export type ScheduleStatus = "confirmed" | "pending" | "modified" | "rejected";

interface ShiftBarProps {
  /** Staff name */
  staffName: string;
  /** Work role label (shift · position) */
  workRole: string | null;
  /** Shift start time label (e.g. "7:00 AM") */
  startLabel: string;
  /** Shift end time label (e.g. "3:00 PM") */
  endLabel: string;
  /** Break window label or null */
  breakLabel: string | null;
  /** Net working hours */
  netHours: number;
  /** Schedule status */
  status: ScheduleStatus;
  /** 0–1 offset from left edge of the total bar span */
  leftPct: number;
  /** 0–1 width as fraction of total bar span */
  widthPct: number;
  /** Break start 0–1 offset (relative to bar width, null = no break) */
  breakLeftFrac: number | null;
  /** Break width as fraction of bar width */
  breakWidthFrac: number | null;
  /** True when this bar comes from the previous calendar day spilling into this day */
  isCarryover: boolean;
  /** Click handler (opens detail modal) */
  onClick: () => void;
}

/** Human-readable status label */
function statusLabel(status: ScheduleStatus): string {
  switch (status) {
    case "confirmed": return "Confirmed";
    case "pending": return "Pending";
    case "modified": return "Modified";
    case "rejected": return "Rejected";
  }
}

export function ShiftBar({
  staffName,
  workRole,
  startLabel,
  endLabel,
  breakLabel,
  netHours,
  status,
  leftPct,
  widthPct,
  breakLeftFrac,
  breakWidthFrac,
  isCarryover,
  onClick,
}: ShiftBarProps): React.ReactElement {
  const [tooltipVisible, setTooltipVisible] = useState(false);

  const barLabel = workRole
    ? `${workRole} — ${startLabel}–${endLabel}`
    : `${startLabel}–${endLabel}`;

  return (
    <div
      className={cn(
        "absolute top-[6px] bottom-[6px] rounded cursor-pointer transition-all duration-150 flex items-center justify-center",
        "hover:brightness-110 hover:shadow-[0_2px_8px_rgba(0,0,0,0.3)] hover:z-[4]",
        status === "confirmed" && !isCarryover && "bg-gradient-to-br from-[#00B894] to-[#00D4A8]",
        status === "confirmed" && isCarryover && "bg-gradient-to-br from-[#00B894] to-[#00D4A8] opacity-50 border border-dashed border-[#00B894]",
        status === "pending" && !isCarryover && "bg-gradient-to-br from-[#6C5CE7] to-[#7C6DF0] border border-dashed border-white/30",
        status === "pending" && isCarryover && "bg-gradient-to-br from-[#6C5CE7] to-[#7C6DF0] opacity-50 border border-dashed border-[#6C5CE7]",
        status === "modified" && "bg-gradient-to-br from-[#F0A500] to-[#FDCB6E]",
        status === "rejected" && "bg-gradient-to-br from-[#FF6B6B] to-[#FF8A8A] opacity-50",
      )}
      style={{
        left: `${leftPct * 100}%`,
        width: `${widthPct * 100}%`,
        zIndex: 2,
      }}
      onClick={onClick}
      onMouseEnter={() => setTooltipVisible(true)}
      onMouseLeave={() => setTooltipVisible(false)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onClick(); }}
      aria-label={`${staffName} ${barLabel}`}
    >
      {/* Break gap — striped pattern overlay */}
      {breakLeftFrac !== null && breakWidthFrac !== null && (
        <div
          className="absolute top-0 bottom-0 pointer-events-none"
          style={{
            left: `${breakLeftFrac * 100}%`,
            width: `${breakWidthFrac * 100}%`,
            background: "repeating-linear-gradient(45deg, transparent, transparent 2px, rgba(0,0,0,0.25) 2px, rgba(0,0,0,0.25) 4px)",
          }}
        />
      )}

      {/* Bar label */}
      <span
        className={cn(
          "text-[9px] font-bold text-white whitespace-nowrap overflow-hidden text-ellipsis px-1 [text-shadow:0_1px_2px_rgba(0,0,0,0.2)] select-none relative z-[1] max-w-full",
          status === "rejected" && "line-through",
        )}
      >
        {barLabel}
      </span>

      {/* Hover tooltip */}
      {tooltipVisible && (
        <div
          className="absolute bottom-[calc(100%+6px)] left-1/2 -translate-x-1/2 bg-card border border-border shadow-[0_4px_12px_rgba(0,0,0,0.3)] rounded px-2.5 py-1.5 whitespace-nowrap z-20 pointer-events-none"
          style={{ fontSize: "11px" }}
        >
          <div className="font-bold text-text">{staffName}</div>
          {workRole && (
            <div style={{ color: "var(--color-accent)", fontSize: "10px", marginTop: "1px" }}>{workRole}</div>
          )}
          <div style={{ color: "var(--color-text-secondary)", marginTop: "2px" }}>
            {startLabel} – {endLabel}
            {breakLabel && <> (Break {breakLabel})</>}
          </div>
          <div style={{ color: "var(--color-accent)", fontWeight: 600, marginTop: "1px" }}>
            Net: {netHours.toFixed(1)}h
          </div>
          {isCarryover && (
            <div style={{ color: "var(--color-warning)", fontSize: "10px", marginTop: "1px" }}>
              Carryover from previous day
            </div>
          )}
          <div
            className={cn(
              "mt-0.5 text-[10px] font-bold uppercase",
              status === "confirmed" && "text-[var(--color-success)]",
              status === "pending" && "text-[var(--color-accent)]",
              status === "modified" && "text-[var(--color-warning)]",
              status === "rejected" && "text-[var(--color-danger)]",
            )}
          >
            {statusLabel(status)}
          </div>
        </div>
      )}
    </div>
  );
}
