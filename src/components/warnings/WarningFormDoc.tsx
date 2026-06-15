"use client";

import React, { useState } from "react";
import { Check, Search, X, PenLine } from "lucide-react";
import type { WarningCategory, WarningCategoryItem, SigInfo } from "@/types";
import { DateField } from "@/components/ui/DateField";
import { DateTimeField, fmt12 } from "@/components/ui/DateTimeField";
import { SignatureView } from "./SignatureView";

/**
 * The warning document — a tight "official document (공문)" sheet matching the
 * approved mockup: a single gapless 12-column grid with hairline-shared cell
 * borders + a thick outer frame (paper-white, fixed ink colors regardless of
 * the console theme). Two modes:
 *   - "edit": authoring (pick cells open modals; inputs/textareas fill cells;
 *              reasons are toggle checkboxes from the org's categories + search;
 *              dates use the shared calendar pickers)
 *   - "view": read-only detail
 *
 * v1.1: Subject(top, web-only) · EMP ID · Name+Manager adjacent (Manager owner-only)
 * · dynamic reasons · Other free-text · Deadline / Follow-up(date+time, TBD) ·
 * removed-category legacy lock · signatures/cc are print-PDF only.
 */

type Mode = "edit" | "view";

interface WarningFormDocProps {
  mode: Mode;
  companyName?: string | null;
  refNo?: string | null;
  employeeName?: string | null;
  employeeNo?: string | null;
  managerName?: string | null;
  storeName?: string | null;
  dateValue?: string; // YYYY-MM-DD (edit)
  dateLabel?: string; // pretty (view)
  maxDate?: string;
  ordinal?: number | null;
  title?: string;
  categoryOptions: WarningCategoryItem[];
  categories: WarningCategory[];
  categoryLabels?: Record<string, string>;
  details: string;
  correctiveAction: string;
  otherText: string;
  deadline: string;
  followUpDate: string;
  followUpTime: string;
  lockEmployee?: boolean;
  /** Owner(+super-owner) only — lets the Manager (issuer) be changed via a picker. */
  canEditManager?: boolean;
  // ── Signatures (view mode) — render captured vector ink in the sig boxes ──
  employeeSignature?: SigInfo | null;
  managerSignature?: SigInfo | null;
  /** Show the in-box "Sign as manager" affordance (only the warning's manager). */
  canSignAsManager?: boolean;
  /** Read-only hint shown to everyone else when the manager hasn't signed yet. */
  managerAwaitingNote?: string | null;
  onSignManager?: () => void;
  onPickEmployee?: () => void;
  onPickStore?: () => void;
  onPickManager?: () => void;
  onTitle?: (s: string) => void;
  onDate?: (s: string) => void;
  onToggleCategory?: (c: WarningCategory) => void;
  onDetails?: (s: string) => void;
  onCorrectiveAction?: (s: string) => void;
  onOtherText?: (s: string) => void;
  onDeadline?: (s: string) => void;
  onFollowUp?: (date: string, time: string) => void;
}

const CSS = `
.wfd { --ink:#1A1C22; --ink-soft:#3C4049; --label:#7A8090; --muted:#9AA0AD; --rule:#C7CBD4; --rule-thick:#1A1C22; --fill:#F6F7F9; --accent:#6C5CE7; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
.wfd * { box-sizing:border-box; }
.wfd .sheet { background:#fff; color:var(--ink); font-family:"Helvetica Neue",Helvetica,"Segoe UI",Arial,sans-serif; }
.wfd .banner { border:2.5px solid var(--rule-thick); border-bottom:none; display:flex; align-items:flex-end; justify-content:space-between; gap:16px; padding:16px 20px 13px; }
.wfd .banner h1 { font-size:21px; font-weight:800; letter-spacing:.04em; text-transform:uppercase; margin:0; line-height:1.12; }
.wfd .banner h1 .ref { font-weight:600; color:var(--ink-soft); letter-spacing:.02em; text-transform:none; }
.wfd .subtitle { margin-top:5px; font-size:10px; letter-spacing:.2em; text-transform:uppercase; color:var(--label); font-weight:600; }
.wfd .company { text-align:right; line-height:1.15; flex:none; }
.wfd .company .mark { font-size:14px; font-weight:800; letter-spacing:.06em; text-transform:uppercase; }
.wfd .company .mark-sub { font-size:9px; letter-spacing:.16em; text-transform:uppercase; color:var(--muted); margin-top:2px; }
.wfd .grid { border:2.5px solid var(--rule-thick); display:grid; grid-template-columns:repeat(12,minmax(0,1fr)); }
.wfd .cell { border-right:1px solid var(--rule); border-bottom:1px solid var(--rule); padding:9px 13px 10px; min-height:58px; display:flex; flex-direction:column; justify-content:center; position:relative; background:#fff; min-width:0; }
.wfd .cell.edge-r { border-right:none; } .wfd .cell.edge-b { border-bottom:none; }
.wfd .lbl { font-size:10px; font-weight:700; letter-spacing:.12em; text-transform:uppercase; color:var(--label); margin-bottom:5px; display:flex; align-items:center; gap:5px; }
.wfd .req { color:var(--accent); font-weight:800; font-size:12px; }
.wfd .hint { font-size:9px; letter-spacing:.04em; text-transform:none; color:var(--muted); font-weight:500; }
.wfd .val { font-size:16px; font-weight:600; color:var(--ink-soft); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.wfd .val.static { color:var(--ink); font-weight:700; }
.wfd .val.empty { color:var(--muted); }
.wfd .subj { width:100%; border:none; outline:none; background:transparent; font-size:19px; font-weight:700; color:var(--ink); padding:0; }
.wfd .subj::placeholder { color:var(--muted); font-weight:500; }
.wfd .pick { width:100%; text-align:left; border:none; background:transparent; cursor:pointer; padding:0; display:flex; align-items:center; justify-content:space-between; gap:8px; }
.wfd .pick .pv { font-size:16px; font-weight:700; color:var(--ink); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.wfd .pick .pv.empty { color:var(--accent); }
.wfd .pick .chev { color:var(--accent); font-size:11px; flex:none; }
.wfd .edit-tag { position:absolute; top:8px; right:10px; font-size:9px; letter-spacing:.08em; text-transform:uppercase; color:var(--muted); font-weight:600; }
.wfd .c-empid { grid-column:span 2; background:var(--fill); }
.wfd .c-name { grid-column:span 5; } .wfd .c-mgr { grid-column:span 5; }
.wfd .c-store { grid-column:span 8; } .wfd .c-date { grid-column:span 4; }
.wfd .span12 { grid-column:span 12; } .wfd .span6 { grid-column:span 6; }
.wfd .subject { grid-column:span 12; min-height:64px; }
.wfd .wtype { grid-column:span 12; min-height:54px; }
.wfd .wrow { display:flex; align-items:center; gap:26px; margin-top:4px; flex-wrap:wrap; }
.wfd .opt { display:flex; align-items:center; gap:8px; }
.wfd .box { width:16px; height:16px; border:1.6px solid var(--ink); display:inline-flex; align-items:center; justify-content:center; color:#fff; background:#fff; flex:none; }
.wfd .box.on { background:var(--ink); }
.wfd .otx { font-size:15px; font-weight:700; color:var(--ink); } .wfd .opt.off .otx { color:var(--muted); font-weight:600; }
.wfd .band { grid-column:span 12; min-height:0; padding:8px 13px; background:var(--fill); display:flex; flex-direction:row; align-items:center; justify-content:space-between; gap:10px; text-align:left; }
.wfd .band .bt { font-size:13.5px; font-weight:800; color:var(--ink); }
.wfd .rsearch { display:flex; align-items:center; gap:5px; border:1px solid var(--rule); border-radius:6px; padding:3px 8px; background:#fff; flex:none; }
.wfd .rsearch input { font-size:13px; border:none; outline:none; background:transparent; width:120px; color:var(--ink); }
.wfd .rsearch input::placeholder { color:var(--muted); }
.wfd .rgrid { display:grid; grid-template-columns:repeat(3,1fr); gap:6px 16px; align-items:start; }
.wfd .ropt { display:flex; align-items:flex-start; gap:8px; padding:1px 0; }
.wfd .ropt.click { cursor:pointer; } .wfd .ropt .box { margin-top:1px; }
.wfd .ropt .rtx { font-size:14.5px; font-weight:600; color:var(--ink-soft); line-height:1.3; min-width:0; }
.wfd .ropt.on .rtx { color:var(--ink); font-weight:700; }
.wfd .ropt.removed .rtx { color:var(--muted); text-decoration:line-through; }
.wfd .otherinp { flex:1 1 60px; min-width:60px; border:none; outline:none; background:transparent; border-bottom:1px solid var(--accent); font-size:13.5px; font-weight:600; color:var(--ink); padding-bottom:1px; }
.wfd .otherinp::placeholder { color:var(--muted); font-weight:500; }
.wfd .otherview { font-size:13.5px; font-weight:600; color:var(--ink); }
.wfd .warea { width:100%; border:none; outline:none; background:transparent; resize:none; font-size:15px; line-height:1.5; color:var(--ink-soft); min-height:48px; font-family:inherit; }
.wfd .warea::placeholder { color:var(--muted); }
.wfd .rotext { font-size:15px; line-height:1.5; color:var(--ink); white-space:pre-wrap; overflow-wrap:anywhere; word-break:break-word; min-height:24px; } .wfd .rotext.empty { color:var(--muted); font-style:italic; }
.wfd .nomatch { font-size:13px; color:var(--muted); font-style:italic; padding:2px 0; }
.wfd .dtrow { display:flex; align-items:center; gap:6px; margin-top:2px; }
.wfd .clearx { color:var(--muted); padding:2px; cursor:pointer; display:inline-flex; }
.wfd .clearx:hover { color:#ef4444; }
.wfd .printmark { font-size:9px; letter-spacing:.1em; text-transform:uppercase; color:var(--muted); font-weight:700; margin-left:8px; }
.wfd .sigline { height:26px; border-bottom:1px solid var(--ink); margin:10px 0 4px; }
.wfd .sigmeta { display:flex; justify-content:space-between; font-size:11.5px; color:var(--label); font-weight:600; }
.wfd .sigmeta .signedby { color:var(--ink); font-weight:700; }
/* rendered signature ink sitting on the signature line */
.wfd .sigink { height:42px; border-bottom:1px solid var(--ink); margin:6px 0 4px; display:flex; align-items:flex-end; justify-content:center; overflow:hidden; }
.wfd .sigink svg { height:46px; width:auto; max-width:100%; }
.wfd .signbtn { display:inline-flex; align-items:center; gap:6px; margin-top:8px; padding:6px 12px; border:1px solid var(--accent); border-radius:7px; background:rgba(108,92,231,.08); color:var(--accent); font-size:12px; font-weight:800; cursor:pointer; }
.wfd .awaiting { margin-top:6px; font-size:11px; font-weight:700; letter-spacing:.04em; text-transform:uppercase; color:var(--muted); }
.wfd .ccval { font-size:13px; font-weight:700; color:var(--ink); }

/* ── Print (PDF) — only the sheet prints; Subject is web-only so it's dropped ── */
@media print {
  body { background:#fff !important; }
  body * { visibility:hidden !important; }
  .wfd, .wfd * { visibility:visible !important; -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; }
  .wfd { position:absolute; left:0; top:0; width:100%; padding:0 !important; margin:0 !important; --rule:#6B7280; }
  .wfd .sheet { box-shadow:none !important; max-width:none !important; padding:11mm 10mm !important; }
  .wfd .subject { display:none !important; }
  /* 1px hairlines land on fractional device pixels under the print/PDF rasterizer and
     anti-alias to near-nothing, dropping random dividers (esp. verticals). Darker +
     2px so every divider survives low-DPI rasterization. edge-r/edge-b are border:none
     → unaffected; the 2.5px near-black frame still reads as the outer rule. */
  .wfd .cell { border-right-width:2px !important; border-bottom-width:2px !important; }
  /* margin:0 leaves no page-margin box, so Chrome omits its auto header/footer
     (date · "HTM Admin" · URL); the sheet padding above supplies the paper margin. */
  @page { margin:0; }
}
`;

function fmtDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

// ISO datetime → "Jun 12, 2026" (signatures carry a full timestamp).
function fmtSignDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function addDays(iso: string, n: number): string {
  const base = iso ? new Date(`${iso}T00:00:00`) : new Date();
  base.setDate(base.getDate() + n);
  const y = base.getFullYear();
  const m = String(base.getMonth() + 1).padStart(2, "0");
  const d = String(base.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

const chevDown = (
  <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="2.5 4.5 6 8 9.5 4.5" /></svg>
);

function Box({ on }: { on: boolean }): React.ReactElement {
  return <span className={`box${on ? " on" : ""}`}>{on && <Check className="w-3 h-3" strokeWidth={3} />}</span>;
}

export function WarningFormDoc(props: WarningFormDocProps): React.ReactElement {
  const { mode, companyName, refNo, employeeName, employeeNo, managerName, storeName, dateValue, dateLabel, maxDate, ordinal, title, categoryOptions, categories, categoryLabels, details, correctiveAction, otherText, deadline, followUpDate, followUpTime, employeeSignature, managerSignature, canSignAsManager, managerAwaitingNote, onSignManager } = props;
  const edit = mode === "edit";
  const chosen = new Set(categories);
  const [reasonQuery, setReasonQuery] = useState("");

  const activeCodes = new Set(categoryOptions.map((c) => c.code));
  const legacy = categories.filter((c) => !activeCodes.has(c));
  const rq = reasonQuery.trim().toLowerCase();
  const filtered = edit && rq ? categoryOptions.filter((c) => c.label.toLowerCase().includes(rq)) : null;

  const TYPES: [string, number][] = [["First Warning", 1], ["Second Warning", 2], ["Other", 3]];

  const reasonItem = (c: WarningCategoryItem) => {
    const on = chosen.has(c.code);
    const isOther = c.code === "other";
    return (
      <div key={c.code} className={`ropt${on ? " on" : ""}${edit ? " click" : ""}`} onClick={edit ? () => props.onToggleCategory?.(c.code) : undefined}>
        <Box on={on} />
        <span className="rtx">{c.label}</span>
        {isOther && on && edit && (
          <input className="otherinp" value={otherText} onClick={(e) => e.stopPropagation()} onChange={(e) => props.onOtherText?.(e.target.value)} placeholder="specify…" />
        )}
        {isOther && on && !edit && otherText && <span className="otherview">— {otherText}</span>}
      </div>
    );
  };

  return (
    <div className="wfd">
      <style>{CSS}</style>
      <div className="sheet">
        {/* Banner */}
        <div className="banner">
          <div>
            <h1>Employee Warning Notice Form{refNo && <span className="ref"> ({refNo})</span>}</h1>
            <div className="subtitle">Human Resources · Disciplinary Record</div>
          </div>
          <div className="company">
            <div className="mark">{companyName || ""}</div>
            <div className="mark-sub">Official Notice</div>
          </div>
        </div>

        <div className="grid">
          {/* Subject (web only) */}
          <div className="cell subject edge-r">
            <div className="lbl">Subject <span className="req">*</span> <span className="hint">— web only (not in PDF)</span></div>
            {edit ? (
              <input className="subj" value={title ?? ""} maxLength={80} onChange={(e) => props.onTitle?.(e.target.value)} placeholder="Brief summary of the incident (required)" />
            ) : (
              <div className="val static">{title || "—"}</div>
            )}
          </div>

          {/* EMP ID | Name | Manager */}
          <div className="cell c-empid">
            <div className="lbl">Emp ID</div>
            <div className={`val static${employeeNo ? "" : " empty"}`}>{employeeNo || "-"}</div>
          </div>
          <div className="cell c-name">
            <div className="lbl">Employee Name <span className="req">*</span></div>
            {edit && !props.lockEmployee ? (
              <button type="button" className="pick" onClick={props.onPickEmployee}>
                <span className={`pv${employeeName ? "" : " empty"}`}>{employeeName || "Select employee"}</span>
                <span className="chev">{chevDown}</span>
              </button>
            ) : (
              <div className="val static">{employeeName || "—"}</div>
            )}
          </div>
          <div className="cell c-mgr edge-r">
            {edit && <div className="edit-tag">owner only</div>}
            <div className="lbl">Manager Name</div>
            {edit && props.canEditManager ? (
              <button type="button" className="pick" onClick={props.onPickManager}>
                <span className={`pv${managerName ? "" : " empty"}`}>{managerName || "Select manager"}</span>
                <span className="chev">{chevDown}</span>
              </button>
            ) : (
              <div className={`val static${edit ? " empty" : ""}`}>{managerName || "—"}</div>
            )}
          </div>

          {/* Store | Date */}
          <div className="cell c-store">
            <div className="lbl">Store / Brand <span className="req">*</span></div>
            {edit ? (
              <button type="button" className="pick" onClick={props.onPickStore}>
                <span className={`pv${storeName ? "" : " empty"}`}>{storeName || "Select store"}</span>
                <span className="chev">{chevDown}</span>
              </button>
            ) : (
              <div className="val static">{storeName || "—"}</div>
            )}
          </div>
          <div className="cell c-date edge-r">
            <div className="lbl">Date</div>
            {edit ? (
              <div className="dtrow">
                <DateField value={dateValue ?? ""} onChange={(v) => props.onDate?.(v)} placeholder="Pick a date" fallbackDate={maxDate ?? ""} />
              </div>
            ) : (
              <div className="val static">{dateLabel}</div>
            )}
          </div>

          {/* Warning type */}
          <div className="cell wtype edge-r">
            <div className="lbl">Warning Type <span className="hint">— auto by warning count</span></div>
            <div className="wrow">
              {TYPES.map(([lbl, n]) => {
                const on = !edit && (n === 3 ? (ordinal ?? 0) >= 3 : ordinal === n);
                return (
                  <span key={lbl} className={`opt${on ? "" : " off"}`}>
                    <Box on={on} />
                    <span className="otx">{lbl}</span>
                  </span>
                );
              })}
            </div>
          </div>

          {/* Section 1 band + search */}
          <div className="cell band edge-r">
            <span className="bt">1. Behavior / actions found unsatisfactory — reasons</span>
            {edit && (
              <span className="rsearch">
                <Search className="w-3.5 h-3.5" style={{ color: "#9AA0AD" }} />
                <input value={reasonQuery} onChange={(e) => setReasonQuery(e.target.value)} placeholder="Search reasons…" />
              </span>
            )}
          </div>
          <div className="cell span12 edge-r">
            {filtered ? (
              filtered.length ? <div className="rgrid">{filtered.map(reasonItem)}</div> : <div className="nomatch">No reasons match “{reasonQuery}”.</div>
            ) : (
              <div className="rgrid">{categoryOptions.map(reasonItem)}</div>
            )}
            {legacy.length > 0 && (
              <div className="rgrid" style={{ marginTop: 4 }}>
                {legacy.map((code) => (
                  <div key={code} className="ropt on removed">
                    <Box on />
                    <span className="rtx">{categoryLabels?.[code] ?? code}</span>
                    <span className="hint" style={{ marginLeft: 2 }}>(removed)</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="cell span12 edge-r">
            <div className="lbl">Details of unsatisfactory behavior / actions</div>
            {edit ? (
              <textarea className="warea" rows={2} value={details} onChange={(e) => props.onDetails?.(e.target.value)} placeholder="Describe what happened…" />
            ) : (
              <div className={`rotext${details ? "" : " empty"}`}>{details || "No details."}</div>
            )}
          </div>

          {/* Section 2 — corrective */}
          <div className="cell band edge-r"><span className="bt">2. Corrective action required — failure to comply may lead to further disciplinary action up to termination</span></div>
          <div className="cell span12 edge-r">
            {edit ? (
              <textarea className="warea" rows={2} value={correctiveAction} onChange={(e) => props.onCorrectiveAction?.(e.target.value)} placeholder="What the employee must correct (optional)…" />
            ) : (
              <div className={`rotext${correctiveAction ? "" : " empty"}`}>{correctiveAction || "None specified."}</div>
            )}
          </div>

          {/* Deadline | Follow-up (date + time) */}
          <div className="cell span6">
            <div className="lbl">3. Deadline <span className="hint">— optional</span></div>
            {edit ? (
              <div className="dtrow">
                <DateField value={deadline} onChange={(v) => props.onDeadline?.(v)} placeholder="None" fallbackDate={maxDate ?? ""} />
                {deadline && <button type="button" className="clearx" title="Clear" onClick={() => props.onDeadline?.("")}><X className="w-3.5 h-3.5" /></button>}
              </div>
            ) : (
              <div className={`val static${deadline ? "" : " empty"}`}>{deadline ? fmtDate(deadline) : "—"}</div>
            )}
          </div>
          <div className="cell span6 edge-r">
            <div className="lbl">4. Follow-up — date &amp; time <span className="hint">— optional</span></div>
            {edit ? (
              <div className="dtrow">
                <DateTimeField date={followUpDate} time={followUpTime} fallbackDate={addDays(maxDate ?? "", 1)} onChange={(d, t) => props.onFollowUp?.(d, t)} />
                {followUpDate && <button type="button" className="clearx" title="Clear" onClick={() => props.onFollowUp?.("", "")}><X className="w-3.5 h-3.5" /></button>}
              </div>
            ) : (
              <div className={`val static${followUpDate ? "" : " empty"}`}>{followUpDate ? `${fmtDate(followUpDate)} · ${followUpTime ? fmt12(followUpTime.slice(0, 5)) : "TBD"}` : "—"}</div>
            )}
          </div>

          {/* Signatures (print PDF) — render captured vector strokes when signed */}
          <div className="cell span6">
            <div className="lbl">Employee Signature <span className="printmark">print PDF</span></div>
            {employeeSignature ? (
              <>
                <div className="sigink"><SignatureView signature={employeeSignature.signature_strokes} strokeWidth={2.6} /></div>
                <div className="sigmeta"><span className="signedby">{employeeSignature.signer_name || employeeName || "—"}</span><span>{fmtSignDate(employeeSignature.signed_at) || "Date"}</span></div>
              </>
            ) : (
              <>
                <div className="sigline" />
                <div className="sigmeta"><span>{employeeName || "—"}</span><span>Date</span></div>
              </>
            )}
          </div>
          <div className="cell span6 edge-r">
            <div className="lbl">Manager Signature <span className="printmark">print PDF</span></div>
            {managerSignature ? (
              <>
                <div className="sigink"><SignatureView signature={managerSignature.signature_strokes} strokeWidth={2.6} /></div>
                <div className="sigmeta"><span className="signedby">{managerSignature.signer_name || managerName || "—"}</span><span>{fmtSignDate(managerSignature.signed_at) || "Date"}</span></div>
              </>
            ) : (
              <>
                <div className="sigline" />
                <div className="sigmeta"><span>{managerName || "—"}</span><span>Date</span></div>
                {!edit && canSignAsManager && (
                  <button type="button" className="signbtn" onClick={onSignManager}>
                    <PenLine className="w-3.5 h-3.5" />
                    Sign as manager
                  </button>
                )}
                {!edit && !canSignAsManager && managerAwaitingNote && (
                  <div className="awaiting">{managerAwaitingNote}</div>
                )}
              </>
            )}
          </div>

          {/* cc */}
          <div className="cell span12 edge-r edge-b">
            <div className="lbl">cc</div>
            <div className="ccval">Employee&nbsp;&nbsp;/&nbsp;&nbsp;Manager&nbsp;&nbsp;/&nbsp;&nbsp;Human Resources&nbsp;&nbsp;/&nbsp;&nbsp;Personnel File</div>
          </div>
        </div>
      </div>
    </div>
  );
}
