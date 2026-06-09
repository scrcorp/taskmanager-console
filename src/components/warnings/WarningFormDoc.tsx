"use client";

import React from "react";
import { Check } from "lucide-react";
import type { WarningCategory } from "@/types";
import { Textarea } from "@/components/ui";
import { cn } from "@/lib/utils";
import { CATEGORY_META } from "./categories";

/**
 * The unified warning document — a printable, paper-style sheet (the real
 * "EMPLOYEE WARNING NOTICE FORM") rendered in two modes:
 *   - "edit": authoring (employee/store are pick buttons, date/subject inputs,
 *              the 12 reasons are toggle checkboxes, details/action are textareas)
 *   - "view": read-only detail
 *
 * Mirrors the evaluation feature's EvaluationFormDoc: fixed light "ink" colors so
 * it reads like printed paper regardless of the console dark theme, and matches
 * the server PDF (warning_pdf.py). Boxes we don't capture (deadline / follow-up /
 * signatures) render as blank lines, exactly like the paper form.
 */

type Mode = "edit" | "view";

/** The 12 reasons in the paper form's 3-column layout. */
const REASON_COLUMNS: WarningCategory[][] = [
  ["tardiness", "damaged_equipment", "refusal_overtime", "absenteeism", "policy_violation"],
  ["insubordination", "rudeness", "fighting", "language"],
  ["failure_procedure", "failure_performance", "other"],
];

interface WarningFormDocProps {
  mode: Mode;
  companyName?: string | null;
  refNo?: string | null;
  employeeName?: string | null;
  employeeNo?: string | null;
  managerName?: string | null;
  storeName?: string | null;
  /** YYYY-MM-DD for the edit input. */
  dateValue?: string;
  /** Pretty date string for the view. */
  dateLabel?: string;
  maxDate?: string;
  /** 1=First, 2=Second, ≥3=Other (view only). */
  ordinal?: number | null;
  title?: string;
  categories: WarningCategory[];
  details: string;
  correctiveAction: string;
  /** In edit mode, render the employee as a fixed cell (subject can't change). */
  lockEmployee?: boolean;
  onPickEmployee?: () => void;
  onPickStore?: () => void;
  onTitle?: (s: string) => void;
  onDate?: (s: string) => void;
  onToggleCategory?: (c: WarningCategory) => void;
  onDetails?: (s: string) => void;
  onCorrectiveAction?: (s: string) => void;
}

const chevron = (
  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 5.5 7 9.5 11 5.5" />
  </svg>
);

function StaticCell({ label, value, muted }: { label: string; value?: string | null; muted?: boolean }): React.ReactElement {
  return (
    <div className={cn("border rounded-md px-3 py-2 min-h-[58px]", muted ? "border-[#dfe2e8] bg-[#f3f4f7]" : "border-[#cfd4dc]")}>
      <div className={cn("text-[11px] font-bold uppercase tracking-wide", muted ? "text-[#9aa0ad]" : "text-[#6b7280]")}>{label}</div>
      <div className={cn("text-[14.5px] font-semibold mt-1 truncate", muted ? "text-[#9aa0ad]" : "text-[#1A1D27]")}>{value || "—"}</div>
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
        <span className="text-[11px] font-bold uppercase tracking-wide">{label}</span>
        <span className="text-accent">{chevron}</span>
      </div>
      <div className={cn("text-[14.5px] font-semibold mt-1 truncate", value ? "text-[#1A1D27]" : "text-accent")}>
        {value || placeholder}
      </div>
    </button>
  );
}

function InputCell({ label, value, placeholder, maxLength, type = "text", max, onChange }: { label: string; value?: string; placeholder?: string; maxLength?: number; type?: string; max?: string; onChange?: (s: string) => void }): React.ReactElement {
  return (
    <div className="border border-[#cfd4dc] rounded-md px-3 py-2 min-h-[58px] focus-within:border-accent transition-colors">
      <div className="text-[11px] font-bold uppercase tracking-wide text-[#6b7280]">{label}</div>
      <input
        type={type}
        value={value ?? ""}
        max={max}
        maxLength={maxLength}
        placeholder={placeholder}
        onChange={(e) => onChange?.(e.target.value)}
        className="mt-1 w-full bg-transparent text-[14.5px] font-semibold text-[#1A1D27] placeholder:text-[#9ca3af] placeholder:font-normal outline-none"
      />
    </div>
  );
}

/** A never-captured field (blank on the form). Always muted so it's clearly not editable. */
function BlankCell({ label, hint }: { label: string; hint?: string }): React.ReactElement {
  return (
    <div className="border border-[#dfe2e8] bg-[#f3f4f7] rounded-md px-3 py-2 min-h-[54px]">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] font-bold uppercase tracking-wide text-[#9aa0ad]">{label}</div>
        {hint && <span className="text-[10px] italic text-[#b3b8c2] shrink-0">{hint}</span>}
      </div>
      <div className="h-5 mt-1.5 border-b border-dashed border-[#cfd4dc]" />
    </div>
  );
}

function CheckMark({ checked }: { checked: boolean }): React.ReactElement {
  return (
    <span className={cn("w-[15px] h-[15px] rounded-[3px] border flex items-center justify-center shrink-0", checked ? "bg-[#1A1D27] border-[#1A1D27]" : "bg-white border-[#9ca3af]")}>
      {checked && <Check className="w-3 h-3 text-white" strokeWidth={3} />}
    </span>
  );
}

function ReasonCheck({ label, checked, onToggle }: { label: string; checked: boolean; onToggle?: () => void }): React.ReactElement {
  const interactive = !!onToggle;
  return (
    <button
      type="button"
      disabled={!interactive}
      onClick={onToggle}
      className={cn("group flex items-center gap-2 text-left py-1 w-full", interactive ? "cursor-pointer" : "cursor-default")}
    >
      <CheckMark checked={checked} />
      <span className={cn("text-[13.5px] leading-tight", checked ? "text-[#1A1D27] font-semibold" : "text-[#4b5563]", interactive && !checked && "group-hover:text-[#1A1D27]")}>
        {label}
      </span>
    </button>
  );
}

function CommentArea({ mode, value, placeholder, onChange }: { mode: Mode; value: string; placeholder: string; onChange?: (s: string) => void }): React.ReactElement {
  if (mode === "edit") {
    return (
      <div className="mt-1.5">
        <Textarea value={value} onChange={(e) => onChange?.(e.target.value)} rows={3} placeholder={placeholder} />
      </div>
    );
  }
  return (
    <div className="mt-1.5 border border-[#cfd4dc] rounded-md px-3.5 py-3 min-h-[60px] text-[14.5px] leading-relaxed text-[#1A1D27] whitespace-pre-wrap">
      {value || <span className="text-[#9ca3af] italic">—</span>}
    </div>
  );
}

export function WarningFormDoc(props: WarningFormDocProps): React.ReactElement {
  const { mode, companyName, refNo, employeeName, managerName, storeName, dateValue, dateLabel, maxDate, ordinal, title, categories, details, correctiveAction } = props;
  const edit = mode === "edit";
  const chosen = new Set(categories);

  const TYPES: [string, number][] = [
    ["First Warning", 1],
    ["Second Warning", 2],
    ["Other", 3],
  ];

  return (
    <div className="bg-white border border-border rounded-lg p-5 sm:p-9 shadow-sm">
      {/* Title band: form name | company */}
      <div className="flex items-end justify-between gap-4 border-b-2 border-[#1A1D27] pb-3">
        <h1 className="text-[16px] sm:text-[20px] font-extrabold tracking-[0.03em] text-[#1A1D27] uppercase">
          Employee Warning Notice Form
        </h1>
        <div className="text-[11px] sm:text-[12px] font-bold uppercase tracking-wide text-[#4b5563] text-right shrink-0">
          {companyName || ""}
        </div>
      </div>

      {/* Header field cells */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mt-4">
        {edit && !props.lockEmployee ? (
          <PickCell label="Employee Name" value={employeeName} placeholder="Select employee" onClick={props.onPickEmployee} />
        ) : (
          <StaticCell label="Employee Name" value={employeeName} />
        )}
        {edit ? (
          <InputCell label="Date" type="date" value={dateValue} max={maxDate} onChange={props.onDate} />
        ) : (
          <StaticCell label="Date" value={dateLabel} />
        )}
        <StaticCell label="Manager Name" value={managerName} muted={edit} />
        {edit ? (
          <PickCell label="Store" value={storeName} placeholder="Select store" onClick={props.onPickStore} />
        ) : (
          <StaticCell label="Store" value={storeName} />
        )}
        {edit ? (
          <InputCell label="Subject" value={title} maxLength={80} placeholder="Short summary" onChange={props.onTitle} />
        ) : (
          <StaticCell label="Subject" value={title} />
        )}
        {!edit && refNo && <StaticCell label="Reference" value={refNo} />}
      </div>

      {/* Warning type — First / Second / Other (auto by ordinal; not editable) */}
      <div className={cn("mt-4 border rounded-md px-3.5 py-2.5 flex flex-wrap items-center gap-x-7 gap-y-2", edit ? "border-[#dfe2e8] bg-[#f3f4f7]" : "border-[#cfd4dc]")}>
        {TYPES.map(([lbl, n]) => {
          const checked = !edit && (n === 3 ? (ordinal ?? 0) >= 3 : ordinal === n);
          return (
            <span key={lbl} className="flex items-center gap-2">
              <CheckMark checked={checked} />
              <span className={cn("text-[13.5px] font-semibold", edit ? "text-[#9aa0ad]" : "text-[#1A1D27]")}>{lbl}</span>
            </span>
          );
        })}
        {edit && (
          <span className="text-[10.5px] text-[#b3b8c2] italic ml-auto">Auto-set by the employee&apos;s warning count</span>
        )}
      </div>

      {/* Section 1 — reasons */}
      <div className="mt-4 border border-[#cfd4dc] rounded-md">
        <div className="px-3.5 py-2.5 bg-[#e7eaef] border-b border-[#cfd4dc]">
          <span className="text-[13px] font-extrabold text-[#1A1D27]">
            1. Your behavior/actions have been found unsatisfactory for the following reasons:
          </span>
        </div>
        <div className="px-3.5 py-3 grid grid-cols-1 sm:grid-cols-[1fr_0.8fr_1.35fr] gap-x-4 gap-y-0.5">
          {REASON_COLUMNS.map((col, ci) => (
            <div key={ci}>
              {col.map((code) => (
                <ReasonCheck
                  key={code}
                  label={CATEGORY_META[code].label}
                  checked={chosen.has(code)}
                  onToggle={edit ? () => props.onToggleCategory?.(code) : undefined}
                />
              ))}
            </div>
          ))}
        </div>
        <div className="px-3.5 pb-3.5">
          <div className="text-[11px] font-bold uppercase tracking-wide text-[#6b7280]">
            Details of unsatisfactory behavior/actions
          </div>
          <CommentArea mode={mode} value={details} placeholder="Describe what happened…" onChange={props.onDetails} />
        </div>
      </div>

      {/* Section 2 — corrective action */}
      <div className="mt-4 border border-[#cfd4dc] rounded-md">
        <div className="px-3.5 py-2.5 bg-[#e7eaef] border-b border-[#cfd4dc]">
          <span className="text-[13px] font-extrabold text-[#1A1D27]">
            2. The following immediate and sustained corrective action must be taken by the employee.
            Failure to do so will result in further disciplinary action up to and including termination.
          </span>
        </div>
        <div className="px-3.5 py-3">
          <CommentArea mode={mode} value={correctiveAction} placeholder="What the employee must do to correct this (optional)…" onChange={props.onCorrectiveAction} />
        </div>
      </div>

      {/* Section 3 / 4 — never captured (blank on the form) */}
      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        <BlankCell label="3. Deadline" hint="on printed form" />
        <BlankCell label="4. Follow-up meeting will be held on" hint="on printed form" />
      </div>

      {/* Signatures + cc — signed by hand on the printed form (not captured here) */}
      <div className={cn("mt-5 border-t border-[#cfd4dc] pt-4", edit && "opacity-70")}>
        <div className="flex items-start justify-between gap-3">
          <p className="text-[11.5px] text-[#6b7280] leading-relaxed max-w-[640px]">
            Note: Your signature on this form means that we have discussed the situation. It doesn&apos;t
            necessarily mean you agree that the infraction occurred.
          </p>
          {edit && <span className="text-[10px] italic text-[#b3b8c2] shrink-0">Signed on the printed form</span>}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-5 mt-4">
          {["Employee Signature", "Manager's Signature"].map((role) => (
            <div key={role}>
              <div className="h-8 border-b border-[#1A1D27]" />
              <div className="flex items-center justify-between mt-1">
                <span className="text-[11.5px] font-semibold text-[#4b5563]">{role}</span>
                <span className="text-[11.5px] text-[#9ca3af]">Date</span>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 text-[11px] text-[#6b7280]">
          cc:&nbsp;&nbsp;Employee&nbsp;&nbsp;/&nbsp;&nbsp;Manager&nbsp;&nbsp;/&nbsp;&nbsp;Human Resources&nbsp;&nbsp;/&nbsp;&nbsp;Personnel File
        </div>
      </div>
    </div>
  );
}
