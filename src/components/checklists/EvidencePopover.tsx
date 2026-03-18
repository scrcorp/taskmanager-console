"use client";

/**
 * 증빙 팝오버 컴포넌트 -- hover 시 제출 사진(들)과 메모를 미리 보여줍니다.
 *
 * Shows completion evidence (photos + note + time + staff name) on hover.
 */

import React, { useState, useRef } from "react";
import { FileText, Clock } from "lucide-react";
import { cn, formatActionTime } from "@/lib/utils";
import { PhotoGrid } from "./PhotoGrid";

interface EvidencePopoverProps {
  photoUrls: string[];
  note: string | null;
  completedAt: string | null;
  workDate: string;
  timezone?: string;
  staffName?: string | null;
  children: React.ReactNode;
}

export function EvidencePopover({
  photoUrls,
  note,
  completedAt,
  workDate,
  timezone,
  staffName,
  children,
}: EvidencePopoverProps): React.ReactElement {
  const [isOpen, setIsOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const hasEvidence = photoUrls.length > 0 || !!note;
  if (!hasEvidence) return <>{children}</>;

  const handleMouseEnter = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setIsOpen(true);
  };

  const handleMouseLeave = () => {
    timeoutRef.current = setTimeout(() => setIsOpen(false), 150);
  };

  return (
    <div
      ref={wrapRef}
      className="relative inline-flex"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {children}

      {isOpen && (
        <div
          className={cn(
            "absolute left-0 top-[calc(100%+6px)] z-50",
            "w-60 rounded-xl border border-border bg-card shadow-lg p-3",
            "flex flex-col gap-2",
          )}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          {/* Arrow */}
          <div className="absolute -top-1.5 left-3 w-2.5 h-2.5 rotate-45 border-t border-l border-border bg-card" />

          {/* Photo thumbnails */}
          {photoUrls.length > 0 && (
            <PhotoGrid urls={photoUrls} maxVisible={4} />
          )}

          {/* Note text */}
          {note && (
            <div className="flex items-start gap-1.5">
              <FileText size={11} className="text-text-muted mt-0.5 flex-shrink-0" />
              <p className="text-xs text-text-secondary line-clamp-3">{note}</p>
            </div>
          )}

          {/* Timestamp + staff name */}
          {(completedAt || staffName) && (
            <div className="flex items-center gap-1.5 text-[10px] text-text-muted">
              {completedAt && (
                <>
                  <Clock size={10} />
                  <span>{formatActionTime(completedAt, workDate, timezone)}</span>
                </>
              )}
              {completedAt && staffName && <span>·</span>}
              {staffName && <span>{staffName}</span>}
            </div>
          )}

        </div>
      )}
    </div>
  );
}
