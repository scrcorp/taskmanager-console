"use client";

/**
 * EMPID Import — legacy roster Excel → per-store empid registration.
 *
 * 3-step flow (page form of the ImportProductsModal UX):
 *   1. Upload  — drag & drop / pick a .xlsx/.csv legacy roster.
 *   2. Preview — counts summary + per-person cards; operator picks
 *                Current vs Upload on rebind rows, checks
 *                new-assignment rows, then applies.
 *   3. Result  — applied / renumbered / skipped / rejected report.
 */

import React, { useCallback, useMemo, useRef, useState } from "react";
import { Upload, FileSpreadsheet, X, AlertTriangle } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { PERMISSIONS } from "@/lib/permissions";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui";
import { useModal } from "@/components/ui/imperative-modal";
import { cn } from "@/lib/utils";
import {
  usePreviewEmpidImport,
  useCommitEmpidImport,
  type EmpidImportPreviewResult,
  type EmpidImportPerson,
  type EmpidImportEntry,
  type EmpidImportCounts,
  type EmpidCommitAssignment,
  type EmpidCommitResult,
} from "@/hooks/useEmpidImport";

type Step = "upload" | "preview" | "result";

/** Stable key for a person×entry selection (checkbox or rebind choice). */
const entryKey = (personIdx: number, entryIdx: number): string =>
  `${personIdx}:${entryIdx}`;

/** Rebind pill options — Current (DB value) vs Upload (file value, default). */
const REBIND_OPTIONS: { value: "current" | "upload"; label: string }[] = [
  { value: "current", label: "Current" },
  { value: "upload", label: "Upload" },
];

/** Only rebind / new_assignment rows with complete ids can be committed. */
const isSelectable = (
  person: EmpidImportPerson,
  entry: EmpidImportEntry,
): boolean =>
  (entry.action === "rebind" || entry.action === "new_assignment") &&
  !!person.user_id &&
  !!entry.store_id &&
  entry.emp_id !== null;

const COUNT_ITEMS: { key: keyof EmpidImportCounts; label: string }[] = [
  { key: "people", label: "People" },
  { key: "rebind", label: "Rebind" },
  { key: "same", label: "Same" },
  { key: "new_assignment", label: "New assignment" },
  { key: "unmatched_store", label: "Unmatched" },
  { key: "invalid", label: "Invalid" },
  { key: "placeholder", label: "Placeholder" },
  { key: "deferred", label: "Deferred" },
];

/** Amber inline warning shown next to an entry (non-blocking). */
function EntryWarning({ text }: { text: string }): React.ReactElement {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-warning">
      <AlertTriangle size={12} className="shrink-0" />
      {text}
    </span>
  );
}

/** Collapsed report section for placeholder / deferred buckets. */
function ReportSection({
  title,
  people,
  emptyHint,
}: {
  title: string;
  people: EmpidImportPerson[];
  emptyHint: string;
}): React.ReactElement | null {
  if (people.length === 0) return null;
  return (
    <details className="bg-card border border-border rounded-xl">
      <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold text-text-secondary hover:text-text transition-colors">
        {title} ({people.length}) — {emptyHint}
      </summary>
      <div className="px-4 pb-4 space-y-3">
        {people.map((p, i) => (
          <div key={i} className="border-t border-border/60 pt-3">
            <p className="text-sm font-medium text-text">
              {p.name}
              {p.email && (
                <span className="text-xs text-text-muted ml-2">{p.email}</span>
              )}
            </p>
            {p.note && <p className="text-xs text-text-muted mt-0.5">{p.note}</p>}
            {p.members.length > 0 && (
              <p className="text-xs text-text-secondary mt-1">
                File members: {p.members.join(", ")}
              </p>
            )}
            {p.similar.length > 0 && (
              <p className="text-xs text-text-secondary mt-1">
                Similar users: {p.similar.join(", ")}
              </p>
            )}
            {p.entries.length > 0 && (
              <p className="text-xs text-text-muted mt-1">
                Rows: {p.entries.map((e) => `${e.company} · ${e.emp_id_raw}`).join("  /  ")}
              </p>
            )}
          </div>
        ))}
      </div>
    </details>
  );
}

export default function EmpidImportPage(): React.ReactElement {
  const { hasPermission } = usePermissions();
  const canUpdate = hasPermission(PERMISSIONS.USERS_UPDATE);
  const modal = useModal();
  const previewImport = usePreviewEmpidImport();
  const commitImport = useCommitEmpidImport();

  const [step, setStep] = useState<Step>("upload");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [preview, setPreview] = useState<EmpidImportPreviewResult | null>(null);
  /**
   * Keys of entries that will be written on commit:
   * - rebind rows: in the set = "Upload" chosen (default); absent = keep Current
   * - new_assignment rows: plain checkbox state
   */
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<EmpidCommitResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setStep("upload");
    setSelectedFile(null);
    setIsDragging(false);
    setPreview(null);
    setChecked(new Set());
    setResult(null);
  }, []);

  // ── Step 1: file handling ──
  const handleFile = useCallback(
    (file: File) => {
      const name = file.name.toLowerCase();
      const accepted =
        name.endsWith(".xlsx") ||
        name.endsWith(".csv") ||
        file.type ===
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
        file.type === "text/csv";
      if (!accepted) {
        void modal.alert({
          type: "error",
          message: "Please upload an .xlsx or .csv file.",
        });
        return;
      }
      setSelectedFile(file);
    },
    [modal],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const handlePreview = useCallback(() => {
    if (!selectedFile) return;
    const formData = new FormData();
    formData.append("file", selectedFile);
    previewImport.mutate(formData, {
      onSuccess: (data) => {
        setPreview(data);
        // Default every committable row to "will be written":
        // rebind → Upload selected, new_assignment → checked.
        const initial = new Set<string>();
        data.people.forEach((person, pi) => {
          person.entries.forEach((entry, ei) => {
            if (isSelectable(person, entry)) initial.add(entryKey(pi, ei));
          });
        });
        setChecked(initial);
        setStep("preview");
      },
      // hook shows the error modal
    });
  }, [selectedFile, previewImport]);

  // ── Step 2: selection ──
  /** new_assignment checkbox toggle. */
  const toggle = useCallback((key: string) => {
    setChecked((prev) => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  }, []);

  /** Rebind choice — "upload" puts the key in the set, "current" removes it. */
  const setRebindChoice = useCallback(
    (key: string, choice: "current" | "upload") => {
      setChecked((prev) => {
        const n = new Set(prev);
        if (choice === "upload") n.add(key);
        else n.delete(key);
        return n;
      });
    },
    [],
  );

  const selectedAssignments: EmpidCommitAssignment[] = useMemo(() => {
    if (!preview) return [];
    const out: EmpidCommitAssignment[] = [];
    preview.people.forEach((person, pi) => {
      person.entries.forEach((entry, ei) => {
        if (!checked.has(entryKey(pi, ei))) return;
        if (!isSelectable(person, entry)) return;
        out.push({
          user_id: person.user_id as string,
          store_id: entry.store_id as string,
          empid: entry.emp_id as number,
        });
      });
    });
    return out;
  }, [preview, checked]);

  const apply = useCallback(async () => {
    if (selectedAssignments.length === 0) return;
    const ok = await modal.confirm({
      title: `Apply ${selectedAssignments.length} number(s)?`,
      message:
        "Numbers are written per store. Existing numbers may be renumbered to make room.",
      confirmLabel: "Apply",
      variant: "warning",
    });
    if (!ok) return;
    commitImport.mutate(
      { assignments: selectedAssignments },
      {
        onSuccess: (data) => {
          setResult(data);
          setStep("result");
        },
        // hook shows the error modal
      },
    );
  }, [selectedAssignments, modal, commitImport]);

  if (!canUpdate) {
    return (
      <div className="bg-card border border-border rounded-xl p-10 text-center text-text-secondary">
        You don&apos;t have permission to import EMPIDs.
      </div>
    );
  }

  // ── Step 1: upload ──
  if (step === "upload") {
    return (
      <div className="max-w-2xl space-y-4">
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <div>
            <h2 className="text-sm font-bold text-text mb-1">Upload legacy roster</h2>
            <p className="text-sm text-text-secondary">
              Upload the legacy roster (COMPANY, CORP_ABR_3, Name, emp_id, Email).
              Numbers are registered per store.
            </p>
          </div>

          <div
            onDrop={handleDrop}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onClick={() => fileInputRef.current?.click()}
            className={cn(
              "relative flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed cursor-pointer transition-colors py-10 px-4",
              isDragging
                ? "border-accent bg-accent-muted"
                : "border-border hover:border-accent/50 hover:bg-surface-hover",
            )}
          >
            <FileSpreadsheet size={28} className="text-text-muted" />
            {selectedFile ? (
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-text">{selectedFile.name}</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedFile(null);
                  }}
                  className="p-0.5 rounded text-text-muted hover:text-danger transition-colors"
                >
                  <X size={14} />
                </button>
              </div>
            ) : (
              <>
                <p className="text-sm text-text-secondary">
                  Drag &amp; drop a file here, or{" "}
                  <span className="text-accent">click to browse</span>
                </p>
                <p className="text-xs text-text-muted">.xlsx or .csv</p>
              </>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
                e.target.value = "";
              }}
            />
          </div>

          <Button
            variant="primary"
            size="sm"
            onClick={handlePreview}
            disabled={!selectedFile}
            isLoading={previewImport.isPending}
          >
            <Upload size={14} />
            Preview
          </Button>
        </div>
      </div>
    );
  }

  // ── Step 3: result ──
  if (step === "result" && result) {
    return (
      <div className="max-w-3xl space-y-4">
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <h2 className="text-sm font-bold text-text">Import Results</h2>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            <div className="rounded-lg bg-success-muted p-3">
              <div className="text-xl font-bold text-success">{result.applied.length}</div>
              <div className="text-xs text-text-muted mt-0.5">Applied</div>
            </div>
            <div className="rounded-lg bg-warning-muted p-3">
              <div className="text-xl font-bold text-warning">{result.renumbered.length}</div>
              <div className="text-xs text-text-muted mt-0.5">Renumbered</div>
            </div>
            <div className="rounded-lg bg-surface-hover p-3">
              <div className="text-xl font-bold text-text-secondary">{result.skipped.length}</div>
              <div className="text-xs text-text-muted mt-0.5">Skipped</div>
            </div>
            <div className="rounded-lg bg-danger-muted p-3">
              <div className="text-xl font-bold text-danger">{result.rejected.length}</div>
              <div className="text-xs text-text-muted mt-0.5">Rejected</div>
            </div>
          </div>

          {result.applied.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-text-secondary mb-1">Applied</p>
              <ul className="text-xs text-text-secondary space-y-0.5 max-h-48 overflow-y-auto">
                {result.applied.map((a, i) => (
                  <li key={i}>
                    {a.user} — {a.store}: #{a.empid}
                    {a.created && <span className="text-accent ml-1">(new assignment)</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.renumbered.length > 0 && (
            <div className="rounded-lg bg-warning-muted/40 border border-warning/20 p-3">
              <p className="text-xs font-semibold text-warning mb-1">
                Renumbered — existing members moved to make room
              </p>
              <ul className="text-xs text-text-secondary space-y-0.5 max-h-40 overflow-y-auto">
                {result.renumbered.map((r, i) => (
                  <li key={i}>
                    {r.user} — {r.store}: {r.old} → {r.new}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.skipped.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-text-secondary mb-1">Skipped</p>
              <ul className="text-xs text-text-muted space-y-0.5 max-h-40 overflow-y-auto">
                {result.skipped.map((s, i) => (
                  <li key={i}>
                    {s.user} — {s.store}: #{s.empid} ({s.reason})
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.rejected.length > 0 && (
            <div className="rounded-lg bg-danger-muted border border-danger/20 p-3">
              <p className="text-xs font-semibold text-danger mb-1">Rejected</p>
              <ul className="text-xs text-danger/80 space-y-0.5 max-h-40 overflow-y-auto">
                {result.rejected.map((r, i) => (
                  <li key={i}>
                    user {r.user_id} — store {r.store_id}: {r.reason}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="pt-1 border-t border-border">
            <Button variant="secondary" size="sm" onClick={reset}>
              Upload another file
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Step 2: preview ──
  if (!preview) {
    // Shouldn't happen (preview step without data) — fall back to upload.
    return (
      <div className="bg-card border border-border rounded-xl p-10 text-center text-text-secondary">
        <Button variant="secondary" size="sm" onClick={reset}>
          Back to upload
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Counts summary */}
      <div className="bg-card border border-border rounded-xl p-4">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
          <p className="text-sm font-bold text-text">
            Preview — {selectedFile?.name}
          </p>
          <Button variant="secondary" size="sm" onClick={reset}>
            Back
          </Button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
          {COUNT_ITEMS.map(({ key, label }) => (
            <div key={key} className="rounded-lg bg-surface p-2 text-center">
              <div className="text-lg font-bold text-text">{preview.counts[key] ?? 0}</div>
              <div className="text-[11px] text-text-muted">{label}</div>
            </div>
          ))}
        </div>
        <p className="text-xs text-text-muted mt-2">
          {preview.total_rows} rows in file · {preview.excluded_rows} excluded
        </p>
      </div>

      {/* People cards */}
      <div className="space-y-3">
        {preview.people.length === 0 ? (
          <div className="bg-card border border-border rounded-xl p-8 text-center text-text-muted text-sm">
            No matched people in this file.
          </div>
        ) : (
          preview.people.map((person, pi) => (
            <div key={pi} className="bg-card border border-border rounded-xl p-4">
              <div className="mb-2">
                <p className="text-sm font-semibold text-text">
                  {person.user_full_name || person.name}
                  {person.email && (
                    <span className="text-xs text-text-muted font-normal ml-2">
                      {person.email}
                    </span>
                  )}
                </p>
                {person.note && (
                  <p className="text-xs text-text-muted mt-0.5">{person.note}</p>
                )}
              </div>

              <div className="space-y-1.5">
                {person.entries.map((entry, ei) => {
                  const key = entryKey(pi, ei);
                  const selectable = isSelectable(person, entry);

                  if (entry.action === "same") {
                    return (
                      <div key={key} className="flex items-center gap-2 pl-6 text-sm text-text-muted">
                        <span>
                          {entry.store_name}: already set ({entry.current_empid})
                        </span>
                        {entry.warning && <EntryWarning text={entry.warning} />}
                      </div>
                    );
                  }

                  if (entry.action === "unmatched_store") {
                    return (
                      <div key={key} className="flex items-center gap-2 pl-6 text-sm text-text-muted">
                        <span>
                          {entry.company}: no matching store — skipped
                        </span>
                        {entry.warning && <EntryWarning text={entry.warning} />}
                      </div>
                    );
                  }

                  if (entry.action === "invalid") {
                    return (
                      <div key={key} className="flex items-center gap-2 pl-6 text-sm text-danger/80">
                        <span>
                          {entry.store_name || entry.company}: &quot;{entry.emp_id_raw}&quot; —{" "}
                          {entry.warning || "invalid emp_id"}
                        </span>
                      </div>
                    );
                  }

                  // rebind — the two values conflict; pick Current vs Upload
                  // (Upload = write the file value, Current = leave untouched).
                  if (entry.action === "rebind") {
                    const choice: "current" | "upload" = checked.has(key)
                      ? "upload"
                      : "current";
                    return (
                      <div
                        key={key}
                        className={cn(
                          "flex items-center gap-2 flex-wrap rounded-lg px-2 py-1.5 -mx-2",
                          !selectable && "opacity-50",
                        )}
                      >
                        <span className="text-sm text-text">{entry.store_name}:</span>
                        <span
                          role="radiogroup"
                          aria-label={`${entry.store_name ?? entry.company} — keep current number or use uploaded number`}
                          className="inline-flex items-center gap-1"
                        >
                          {REBIND_OPTIONS.map(({ value, label }) => {
                            const empid =
                              value === "upload" ? entry.emp_id : entry.current_empid;
                            const selected = choice === value;
                            return (
                              <label
                                key={value}
                                className={selectable ? "cursor-pointer" : "cursor-not-allowed"}
                              >
                                <input
                                  type="radio"
                                  name={`rebind-${key}`}
                                  className="sr-only peer"
                                  checked={selected}
                                  onChange={() => setRebindChoice(key, value)}
                                  disabled={!selectable}
                                />
                                <span
                                  className={cn(
                                    "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-accent/50",
                                    selected
                                      ? "border-accent bg-accent-muted text-accent font-semibold"
                                      : "border-border text-text-secondary hover:bg-surface-hover",
                                  )}
                                >
                                  {label}
                                  <span className="font-semibold">
                                    · {empid ?? "—"}
                                  </span>
                                </span>
                              </label>
                            );
                          })}
                        </span>
                        {entry.dormant && (
                          <Badge variant="warning" className="text-[10px] uppercase tracking-wide">
                            Dormant
                          </Badge>
                        )}
                        {entry.dormant && (
                          <span className="text-[11px] text-text-muted">
                            number is written; person stays out of work assignment
                          </span>
                        )}
                        {entry.warning && <EntryWarning text={entry.warning} />}
                      </div>
                    );
                  }

                  // new_assignment — checkbox row
                  return (
                    <label
                      key={key}
                      className={cn(
                        "flex items-center gap-2 flex-wrap rounded-lg px-2 py-1.5 -mx-2 transition-colors",
                        selectable
                          ? "cursor-pointer hover:bg-surface-hover"
                          : "opacity-50",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={checked.has(key)}
                        onChange={() => toggle(key)}
                        disabled={!selectable}
                        className="cursor-pointer accent-accent"
                      />
                      <span className="text-sm text-text">
                        {entry.store_name}:{" "}
                        <span className="font-semibold">{entry.emp_id}</span>
                      </span>
                      <Badge variant="accent" className="text-[10px] uppercase tracking-wide">
                        New assignment
                      </Badge>
                      <span className="text-[11px] text-text-muted">
                        store assignment will be created
                      </span>
                      {entry.dormant && (
                        <Badge variant="warning" className="text-[10px] uppercase tracking-wide">
                          Dormant
                        </Badge>
                      )}
                      {entry.dormant && (
                        <span className="text-[11px] text-text-muted">
                          number is written; person stays out of work assignment
                        </span>
                      )}
                      {entry.warning && <EntryWarning text={entry.warning} />}
                    </label>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Report sections */}
      <ReportSection
        title="Placeholder emails"
        people={preview.placeholder}
        emptyHint="shared/dummy emails, not imported"
      />
      <ReportSection
        title="Deferred"
        people={preview.deferred}
        emptyHint="no matching user in DB, not imported"
      />

      {/* Apply bar */}
      <div className="bg-card border border-border rounded-xl p-4 flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs text-text-muted">
          Rebind rows set to Upload and checked new-assignment rows are applied.
          Existing numbers may be renumbered.
        </p>
        <Button
          variant="primary"
          size="sm"
          onClick={() => void apply()}
          disabled={selectedAssignments.length === 0 || commitImport.isPending}
          isLoading={commitImport.isPending}
        >
          Apply selected ({selectedAssignments.length})
        </Button>
      </div>
    </div>
  );
}
