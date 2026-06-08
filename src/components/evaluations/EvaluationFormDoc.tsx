"use client";

import React from "react";
import type { TemplateConfig, EvaluationScores } from "@/types";
import { sortedCriteria } from "./criteria";
import { fmtRange } from "./format";
import { RatingCells } from "./RatingCells";
import { Textarea } from "@/components/ui";
import { cn } from "@/lib/utils";

/**
 * The unified evaluation document — a printable, paper-style sheet rendered in
 * three modes:
 *   - "blank": template preview (no values, signature block)
 *   - "edit":  authoring (header fields are pick buttons, ratings/comments editable)
 *   - "view":  read-only detail
 *
 * The document keeps an intentional "paper form" look (fixed ink colors) so it
 * reads the same in light/dark and matches the planned v2 PDF export.
 */

type Mode = "blank" | "edit" | "view";

interface EvaluationFormDocProps {
  mode: Mode;
  config: TemplateConfig;
  employeeName?: string | null;
  employeeNo?: string | null;
  storeName?: string | null;
  jobTitle?: string | null;
  periodStart?: string | null;
  periodEnd?: string | null;
  dateLabel?: string;
  scores: EvaluationScores;
  improvement: string;
  goodExamples: string;
  onPickEmployee?: () => void;
  onPickAssignment?: () => void;
  onPickPeriod?: () => void;
  onScore?: (code: string, n: number) => void;
  onImprovement?: (s: string) => void;
  onGoodExamples?: (s: string) => void;
  showSignatures?: boolean;
}

const chevron = (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 5.5 7 9.5 11 5.5" />
  </svg>
);

function StaticCell({ label, value, blank }: { label: string; value?: string | null; blank?: boolean }): React.ReactElement {
  return (
    <div className="border border-[#cfd4dc] rounded-md px-3 py-2 min-h-[58px]">
      <div className="text-[10.5px] font-bold uppercase tracking-wide text-[#6b7280]">{label}</div>
      {blank ? (
        <div className="h-5 mt-1.5 border-b border-dashed border-[#cfd4dc]" />
      ) : (
        <div className="text-[14px] font-semibold text-[#1A1D27] mt-1 truncate">{value || "—"}</div>
      )}
    </div>
  );
}

function PickCell({ label, value, placeholder, onClick }: { label: string; value?: string | null; placeholder: string; onClick?: () => void }): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left w-full border border-[#cfd4dc] rounded-md px-3 py-2 min-h-[58px] hover:border-accent hover:bg-accent-muted transition-colors"
    >
      <div className="flex items-center justify-between text-[#6b7280]">
        <span className="text-[10.5px] font-bold uppercase tracking-wide">{label}</span>
        <span className="text-accent">{chevron}</span>
      </div>
      <div className={cn("text-[14px] font-semibold mt-1 truncate", value ? "text-[#1A1D27]" : "text-accent")}>
        {value || placeholder}
      </div>
    </button>
  );
}

function CommentArea({ mode, value, placeholder, onChange }: { mode: Mode; value: string; placeholder: string; onChange?: (s: string) => void }): React.ReactElement {
  if (mode === "edit") {
    return (
      <div className="mt-1.5">
        <Textarea
          value={value}
          onChange={(e) => onChange?.(e.target.value)}
          rows={3}
          placeholder={placeholder}
        />
      </div>
    );
  }
  return (
    <div className="mt-1.5 border border-[#cfd4dc] rounded-md px-3.5 py-3 min-h-[64px] text-[14px] leading-relaxed text-[#1A1D27] whitespace-pre-wrap">
      {value || (mode === "view" ? <span className="text-[#9ca3af] italic">No comments.</span> : "")}
    </div>
  );
}

export function EvaluationFormDoc(props: EvaluationFormDocProps): React.ReactElement {
  const { mode, config, employeeName, employeeNo, storeName, jobTitle, periodStart, periodEnd, dateLabel, scores } = props;
  const blank = mode === "blank";
  const edit = mode === "edit";
  const showSignatures = props.showSignatures ?? blank;
  const periodText =
    periodStart && periodEnd && periodStart <= periodEnd ? fmtRange(periodStart, periodEnd) : "";
  const scaleHint = config.scale.map((s) => `${s.value}=${s.label}`).join("  ");

  return (
    <div className="bg-white border border-border rounded-lg p-6 sm:p-9 shadow-sm">
      {/* Title */}
      <div className="text-center border-b-2 border-[#1A1D27] pb-4">
        <h1 className="text-[20px] sm:text-[22px] font-extrabold tracking-[0.04em] text-[#1A1D27] uppercase">
          Employee Performance Evaluation
        </h1>
      </div>

      {/* Header fields */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mt-5">
        <StaticCell label="Employee ID" value={employeeNo || "—"} blank={blank} />
        {edit ? (
          <PickCell label="Employee Name" value={employeeName} placeholder="Select employee" onClick={props.onPickEmployee} />
        ) : (
          <StaticCell label="Employee Name" value={employeeName} blank={blank} />
        )}
        <StaticCell label="Date" value={dateLabel} blank={blank} />
        <StaticCell label="Position" value={jobTitle} blank={blank} />
        {edit ? (
          <PickCell label="Store" value={storeName} placeholder="Select store & position" onClick={props.onPickAssignment} />
        ) : (
          <StaticCell label="Store" value={storeName} blank={blank} />
        )}
        {edit ? (
          <PickCell label="Evaluation Period" value={periodText} placeholder="Select period" onClick={props.onPickPeriod} />
        ) : (
          <StaticCell label="Evaluation Period" value={periodText} blank={blank} />
        )}
      </div>

      {/* Ratings */}
      <div className="mt-6 border border-[#cfd4dc] rounded-md">
        <div className="px-3.5 py-2 bg-[#f3f4f6] border-b border-[#cfd4dc] flex flex-wrap items-center gap-x-4 gap-y-1">
          <span className="text-[12px] font-extrabold uppercase tracking-wide text-[#1A1D27]">Ratings</span>
          <span className="text-[12px] text-[#4b5563]">{scaleHint}</span>
        </div>
        <div className="divide-y divide-[#e5e7eb]">
          {sortedCriteria(config).map((c, i) => (
            <div key={c.code} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 px-3.5 py-3">
              <div className="flex items-start gap-2.5 flex-1 min-w-0">
                <span className="text-[13px] font-bold text-[#6b7280] tabular-nums w-4 shrink-0 mt-0.5">{i + 1}</span>
                <div className="min-w-0">
                  <div className="text-[14px] font-semibold text-[#1A1D27]">{c.label}</div>
                  <div className="text-[12.5px] text-[#6b7280] leading-snug">{c.description}</div>
                </div>
              </div>
              <div className="pl-6 sm:pl-0 sm:shrink-0">
                <RatingCells
                  scale={config.scale}
                  value={scores[c.code]}
                  onSelect={edit ? (n) => props.onScore?.(c.code, n) : undefined}
                  showWord={!blank}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Comments */}
      <div className="mt-6 space-y-4">
        <div>
          <div className="text-[12px] font-extrabold uppercase tracking-wide text-[#1A1D27]">
            Additional Comments — How improvements can be made
          </div>
          <CommentArea mode={mode} value={props.improvement} placeholder="What could this employee work on?" onChange={props.onImprovement} />
        </div>
        <div>
          <div className="text-[12px] font-extrabold uppercase tracking-wide text-[#1A1D27]">
            Additional Comments — Good examples
          </div>
          <CommentArea mode={mode} value={props.goodExamples} placeholder="What did this employee do well?" onChange={props.onGoodExamples} />
        </div>
      </div>

      {/* Verification of Review (print-only; signing is v2) */}
      {showSignatures && (
        <div className="mt-6 border-t border-[#cfd4dc] pt-4">
          <div className="text-[13px] font-extrabold text-[#1A1D27] mb-1">Verification of Review</div>
          <p className="text-[12px] text-[#6b7280] leading-relaxed max-w-[680px]">
            By signing this form, you confirm that you have discussed this review in detail with your supervisor. Signing this form does not necessarily indicate that you agree with this evaluation.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-5 mt-5">
            {["Employee Signature", "Manager name / Signature", "C.E.O Signature"].map((s) => (
              <div key={s}>
                <div className="h-8 border-b border-[#1A1D27]" />
                <div className="flex items-center justify-between mt-1">
                  <span className="text-[11px] font-semibold text-[#4b5563]">{s}</span>
                  <span className="text-[11px] text-[#9ca3af]">Date</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
