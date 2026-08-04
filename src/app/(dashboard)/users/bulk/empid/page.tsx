"use client";

/**
 * EMPID Import — legacy roster Excel → per-store empid registration.
 *
 * 3-step flow (page form of the ImportProductsModal UX):
 *   1. Upload  — drag & drop / pick a .xlsx/.csv legacy roster.
 *   2. Preview — counts summary + per-person cards; operator picks
 *                Current vs Upload on rebind rows, checks
 *                new-assignment rows, then applies. Placeholder/deferred
 *                rows (user unresolved) get a per-row user picker so the
 *                operator can still register them.
 *   3. Result  — applied / renumbered / skipped / rejected report.
 */

import React, { useCallback, useMemo, useRef, useState } from "react";
import { Upload, FileSpreadsheet, X, AlertTriangle, Download } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { PERMISSIONS } from "@/lib/permissions";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui";
import { Modal } from "@/components/ui/Modal";
import { useModal } from "@/components/ui/imperative-modal";
import { cn, parseApiError } from "@/lib/utils";
import { useUsers } from "@/hooks/useUsers";
import { useStores } from "@/hooks/useStores";
import { useStoreGroups } from "@/hooks/useStoreGroups";
import type { Store, StoreGroup, User } from "@/types";
import {
  usePreviewEmpidImport,
  useCommitEmpidImport,
  type EmpidImportPreviewResult,
  type EmpidImportPerson,
  type EmpidImportEntry,
  type EmpidImportCounts,
  type EmpidCommitAssignment,
  type EmpidCommitResult,
  type EmpidTemplateFilters,
  useDownloadEmpidTemplate,
} from "@/hooks/useEmpidImport";

type Step = "upload" | "preview" | "result";

/**
 * Stable key for a bucket×person×entry selection (checkbox, rebind choice,
 * or user pick). Buckets: "p" = people, "ph" = placeholder, "df" = deferred.
 */
const entryKey = (bucket: string, personIdx: number, entryIdx: number): string =>
  `${bucket}:${personIdx}:${entryIdx}`;

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
  { key: "needs_user", label: "Needs user" },
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

/**
 * Compact combobox for picking a DB user: filter input on top, select below.
 * The selected user stays visible in the options even when filtered out.
 */
function UserPicker({
  users,
  isLoading,
  value,
  suggestedId,
  onChange,
}: {
  users: User[];
  isLoading: boolean;
  value: string;
  suggestedId: string | null;
  onChange: (userId: string) => void;
}): React.ReactElement {
  const [filter, setFilter] = useState("");

  const options = useMemo(() => {
    const q = filter.trim().toLowerCase();
    let list = users;
    if (q) {
      list = users.filter(
        (u) =>
          (u.full_name?.toLowerCase().includes(q) ?? false) ||
          u.username.toLowerCase().includes(q) ||
          (u.email?.toLowerCase().includes(q) ?? false),
      );
    }
    if (value && !list.some((u) => u.id === value)) {
      const selected = users.find((u) => u.id === value);
      if (selected) list = [selected, ...list];
    }
    return list;
  }, [users, filter, value]);

  return (
    <span className="inline-flex flex-col gap-1">
      <input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filter users…"
        className="w-56 px-2 py-1 rounded-md bg-surface border border-border text-xs text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/20"
      />
      <span className="inline-flex items-center gap-1.5">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={isLoading}
          aria-label="Pick a user to register"
          className="w-56 px-2 py-1 rounded-md bg-surface border border-border text-xs text-text focus:outline-none focus:ring-2 focus:ring-accent/20 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          <option value="">{isLoading ? "Loading users…" : "Select user…"}</option>
          {options.map((u) => (
            <option key={u.id} value={u.id}>
              {u.full_name || u.username}
              {u.email ? ` (${u.email})` : ""}
            </option>
          ))}
        </select>
        {suggestedId && value === suggestedId && (
          <span className="text-[11px] text-accent font-medium">suggested</span>
        )}
      </span>
    </span>
  );
}

/**
 * Actionable section for placeholder / deferred buckets — the user is
 * unresolved, so the operator picks a DB user per needs_user row to register
 * it anyway. unmatched_store / invalid rows stay report-only.
 */
function PickUserSection({
  title,
  hint,
  prefix,
  people,
  users,
  usersLoading,
  checked,
  pickedUsers,
  duplicateKeys,
  onToggle,
  onPickUser,
}: {
  title: string;
  hint: string;
  prefix: string;
  people: EmpidImportPerson[];
  users: User[];
  usersLoading: boolean;
  checked: Set<string>;
  pickedUsers: Record<string, string>;
  duplicateKeys: Set<string>;
  onToggle: (key: string) => void;
  onPickUser: (key: string, userId: string) => void;
}): React.ReactElement | null {
  if (people.length === 0) return null;
  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-3">
      <div>
        <p className="text-sm font-bold text-text">
          {title} ({people.length})
        </p>
        <p className="text-xs text-text-muted mt-0.5">{hint}</p>
      </div>
      {people.map((person, pi) => {
        const suggestedId = person.similar_users?.[0]?.user_id ?? null;
        return (
          <div key={pi} className="border-t border-border/60 pt-3">
            <div className="mb-1.5">
              <p className="text-sm font-medium text-text">
                {person.name}
                {person.email && (
                  <span className="text-xs text-text-muted font-normal ml-2">
                    {person.email}
                  </span>
                )}
              </p>
              {person.note && (
                <p className="text-xs text-text-muted mt-0.5">{person.note}</p>
              )}
              {person.members.length > 0 && (
                <p className="text-xs text-text-secondary mt-0.5">
                  File members: {person.members.join(", ")}
                </p>
              )}
              {person.similar.length > 0 && (
                <p className="text-xs text-text-secondary mt-0.5">
                  Similar users: {person.similar.join(", ")}
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              {person.entries.map((entry, ei) => {
                const key = entryKey(prefix, pi, ei);

                if (entry.action === "unmatched_store") {
                  return (
                    <div key={key} className="flex items-center gap-2 pl-6 text-sm text-text-muted">
                      <span>
                        {entry.person_name ?? person.name} — {entry.company}: no
                        matching store — skipped
                      </span>
                      {entry.warning && <EntryWarning text={entry.warning} />}
                    </div>
                  );
                }

                if (entry.action === "invalid") {
                  return (
                    <div key={key} className="flex items-center gap-2 pl-6 text-sm text-danger/80">
                      <span>
                        {entry.person_name ?? person.name} —{" "}
                        {entry.store_name || entry.company}: &quot;{entry.emp_id_raw}&quot; —{" "}
                        {entry.warning || "invalid emp_id"}
                      </span>
                    </div>
                  );
                }

                if (entry.action !== "needs_user") return null;

                const pickedUser = pickedUsers[key] ?? "";
                return (
                  <div
                    key={key}
                    className="flex items-center gap-2 flex-wrap rounded-lg px-2 py-1.5 -mx-2 hover:bg-surface-hover transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={checked.has(key)}
                      onChange={() => onToggle(key)}
                      disabled={!pickedUser}
                      className="cursor-pointer accent-accent disabled:cursor-not-allowed"
                    />
                    <span className="text-sm text-text">
                      {entry.person_name ?? person.name} — {entry.store_name}:{" "}
                      <span className="font-semibold">{entry.emp_id}</span>
                    </span>
                    <UserPicker
                      users={users}
                      isLoading={usersLoading}
                      value={pickedUser}
                      suggestedId={suggestedId}
                      onChange={(userId) => onPickUser(key, userId)}
                    />
                    {duplicateKeys.has(key) && (
                      <EntryWarning text="same user & store picked above — excluded from commit" />
                    )}
                    {entry.warning && <EntryWarning text={entry.warning} />}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Export current — filter modal ────────────────────────────────────────────

type ExportPeople = NonNullable<EmpidTemplateFilters["people"]>;

/** People-scope radio options for the current-roster export. */
const EXPORT_PEOPLE_OPTIONS: { value: ExportPeople; label: string }[] = [
  { value: "all", label: "Everyone" },
  { value: "numbered", label: "Has a number" },
  { value: "unnumbered", label: "Missing a number — fill-in sheet" },
];

/** One rendered store section in the export picker (last = Ungrouped). */
interface ExportStoreSection {
  groupId: string | null;
  name: string;
  stores: Store[];
}

/**
 * "Export current" filter modal — pick stores (grouped sections), the people
 * scope, and the included columns, then download the current roster xlsx.
 * Mounted only while open, so the store/group queries fetch lazily and the
 * selection resets to "everything" on each open.
 */
function ExportEmpidModal({ onClose }: { onClose: () => void }): React.ReactElement {
  const modal = useModal();
  const downloadTemplate = useDownloadEmpidTemplate();
  const { data: groupsData } = useStoreGroups();
  const { data: storesData, isLoading: storesLoading } = useStores();
  const stores: Store[] = useMemo(
    () => (Array.isArray(storesData) ? storesData : []),
    [storesData],
  );

  /** "all" = every store (stores param omitted); otherwise an explicit id set. */
  const [selected, setSelected] = useState<Set<string> | "all">("all");
  const [people, setPeople] = useState<ExportPeople>("all");
  const [includeDormant, setIncludeDormant] = useState(true);
  const [includeEmail, setIncludeEmail] = useState(true);
  const [includeNumbers, setIncludeNumbers] = useState(true);
  const [isExporting, setIsExporting] = useState(false);

  /** Group sections in sort_order, Ungrouped last; empty sections hidden. */
  const sections: ExportStoreSection[] = useMemo(() => {
    const groupList: StoreGroup[] = Array.isArray(groupsData)
      ? [...groupsData].sort((a, b) => a.sort_order - b.sort_order)
      : [];
    const knownGroupIds = new Set(groupList.map((g) => g.id));
    const byGroup = new Map<string, Store[]>();
    const ungrouped: Store[] = [];
    for (const store of stores) {
      const gid = store.group_id ?? null;
      if (gid && knownGroupIds.has(gid)) {
        const list = byGroup.get(gid);
        if (list) list.push(store);
        else byGroup.set(gid, [store]);
      } else {
        ungrouped.push(store);
      }
    }
    const result: ExportStoreSection[] = groupList
      .map((g) => ({ groupId: g.id, name: g.name, stores: byGroup.get(g.id) ?? [] }))
      .filter((s) => s.stores.length > 0);
    if (ungrouped.length > 0) {
      result.push({ groupId: null, name: "Ungrouped", stores: ungrouped });
    }
    return result;
  }, [groupsData, stores]);

  const isChecked = useCallback(
    (id: string): boolean => selected === "all" || selected.has(id),
    [selected],
  );
  const allChecked: boolean =
    selected === "all" || (stores.length > 0 && selected.size === stores.length);
  const selectedCount: number = selected === "all" ? stores.length : selected.size;

  const toggleAll = useCallback((): void => {
    setSelected((prev) => {
      const isAll =
        prev === "all" || (stores.length > 0 && prev.size === stores.length);
      return isAll ? new Set<string>() : "all";
    });
  }, [stores]);

  const toggleStore = useCallback(
    (id: string): void => {
      setSelected((prev) => {
        const next = new Set(prev === "all" ? stores.map((s) => s.id) : prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    },
    [stores],
  );

  /** Group header toggle — all on → clear the group, otherwise select it all. */
  const toggleGroup = useCallback(
    (groupStores: Store[]): void => {
      setSelected((prev) => {
        const next = new Set(prev === "all" ? stores.map((s) => s.id) : prev);
        const allOn = groupStores.every((s) => next.has(s.id));
        groupStores.forEach((s) => {
          if (allOn) next.delete(s.id);
          else next.add(s.id);
        });
        return next;
      });
    },
    [stores],
  );

  const handleExport = useCallback(async (): Promise<void> => {
    const filters: EmpidTemplateFilters = {
      people,
      include_dormant: includeDormant,
      include_email: includeEmail,
      include_numbers: includeNumbers,
    };
    // 전체 선택이면 stores 생략 (서버 기본 = 전체 매장)
    if (selected !== "all" && selected.size !== stores.length) {
      filters.stores = Array.from(selected);
    }
    setIsExporting(true);
    try {
      await downloadTemplate("current", filters);
      onClose();
    } catch (err) {
      void modal.alert({
        type: "error",
        message: parseApiError(err, "Failed to export the current roster."),
      });
    } finally {
      setIsExporting(false);
    }
  }, [
    people,
    includeDormant,
    includeEmail,
    includeNumbers,
    selected,
    stores,
    downloadTemplate,
    onClose,
    modal,
  ]);

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Export current roster"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => void handleExport()}
            disabled={selectedCount === 0 || isExporting}
            isLoading={isExporting}
          >
            <Download size={14} />
            Export
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Store picker — group sections, Ungrouped last */}
        <div>
          <p className="text-xs font-semibold text-text-secondary mb-1.5">Stores</p>
          <label className="flex items-center gap-2 cursor-pointer text-sm font-medium text-text">
            <input
              type="checkbox"
              checked={allChecked}
              onChange={toggleAll}
              className="cursor-pointer accent-accent"
            />
            All stores
          </label>
          {storesLoading ? (
            <p className="text-xs text-text-muted mt-2">Loading stores…</p>
          ) : (
            <div className="mt-2 max-h-64 overflow-y-auto rounded-lg border border-border p-3 space-y-3">
              {sections.map((section) => {
                const groupAllOn = section.stores.every((s) => isChecked(s.id));
                return (
                  <div key={section.groupId ?? "ungrouped"}>
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold uppercase tracking-wide text-text-secondary">
                      <input
                        type="checkbox"
                        checked={groupAllOn}
                        onChange={() => toggleGroup(section.stores)}
                        className="cursor-pointer accent-accent"
                      />
                      {section.name}
                    </label>
                    <div className="mt-1.5 space-y-1 pl-5">
                      {section.stores.map((store) => (
                        <label
                          key={store.id}
                          className="flex items-center gap-2 cursor-pointer text-sm text-text"
                        >
                          <input
                            type="checkbox"
                            checked={isChecked(store.id)}
                            onChange={() => toggleStore(store.id)}
                            className="cursor-pointer accent-accent"
                          />
                          {store.name}
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
              {sections.length === 0 && (
                <p className="text-xs text-text-muted">No stores.</p>
              )}
            </div>
          )}
        </div>

        {/* People scope */}
        <div>
          <p className="text-xs font-semibold text-text-secondary mb-1.5">People</p>
          <div className="space-y-1">
            {EXPORT_PEOPLE_OPTIONS.map(({ value, label }) => (
              <label
                key={value}
                className="flex items-center gap-2 cursor-pointer text-sm text-text"
              >
                <input
                  type="radio"
                  name="export-people"
                  checked={people === value}
                  onChange={() => setPeople(value)}
                  className="cursor-pointer accent-accent"
                />
                {label}
              </label>
            ))}
          </div>
        </div>

        {/* Included columns */}
        <div>
          <p className="text-xs font-semibold text-text-secondary mb-1.5">Options</p>
          <div className="space-y-1">
            <label className="flex items-center gap-2 cursor-pointer text-sm text-text">
              <input
                type="checkbox"
                checked={includeDormant}
                onChange={() => setIncludeDormant((v) => !v)}
                className="cursor-pointer accent-accent"
              />
              Include dormant assignments
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-sm text-text">
              <input
                type="checkbox"
                checked={includeEmail}
                onChange={() => setIncludeEmail((v) => !v)}
                className="cursor-pointer accent-accent"
              />
              Include emails
            </label>
            {!includeEmail && (
              <div className="pl-6">
                <EntryWarning text="Email is the matching key — a file without emails can't be re-imported." />
              </div>
            )}
            <label className="flex items-center gap-2 cursor-pointer text-sm text-text">
              <input
                type="checkbox"
                checked={includeNumbers}
                onChange={() => setIncludeNumbers((v) => !v)}
                className="cursor-pointer accent-accent"
              />
              Include current numbers
            </label>
          </div>
        </div>
      </div>
    </Modal>
  );
}

export default function EmpidImportPage(): React.ReactElement {
  const { hasPermission } = usePermissions();
  const canUpdate = hasPermission(PERMISSIONS.USERS_UPDATE);
  const modal = useModal();
  const previewImport = usePreviewEmpidImport();
  const downloadTemplate = useDownloadEmpidTemplate();
  const commitImport = useCommitEmpidImport();
  // Whole-org user list for the placeholder/deferred user pickers.
  const { data: usersData, isLoading: usersLoading } = useUsers();
  const users: User[] = useMemo(
    () => (Array.isArray(usersData) ? usersData : []),
    [usersData],
  );

  const [step, setStep] = useState<Step>("upload");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [preview, setPreview] = useState<EmpidImportPreviewResult | null>(null);
  /**
   * Keys of entries that will be written on commit:
   * - rebind rows: in the set = "Upload" chosen (default); absent = keep Current
   * - new_assignment rows: plain checkbox state
   * - needs_user rows (placeholder/deferred): checked once a user is picked
   */
  const [checked, setChecked] = useState<Set<string>>(new Set());
  /** needs_user rows — entry key → picked user id ("" / absent = none). */
  const [pickedUsers, setPickedUsers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<EmpidCommitResult | null>(null);
  /** "Export current" filter modal (upload step). */
  const [exportOpen, setExportOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setStep("upload");
    setSelectedFile(null);
    setIsDragging(false);
    setPreview(null);
    setChecked(new Set());
    setPickedUsers({});
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
            if (isSelectable(person, entry)) initial.add(entryKey("p", pi, ei));
          });
        });
        // Deferred rows with a similar-user candidate: prefill the first
        // suggestion but leave the row unchecked — committing a guessed match
        // must be an explicit operator decision (pickUser still auto-checks).
        const initialPicks: Record<string, string> = {};
        data.deferred.forEach((person, pi) => {
          const suggested = person.similar_users?.[0]?.user_id;
          if (!suggested) return;
          person.entries.forEach((entry, ei) => {
            if (entry.action !== "needs_user") return;
            initialPicks[entryKey("df", pi, ei)] = suggested;
          });
        });
        setChecked(initial);
        setPickedUsers(initialPicks);
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

  /** needs_user rows — picking a user auto-checks; clearing unchecks. */
  const pickUser = useCallback((key: string, userId: string) => {
    setPickedUsers((prev) => ({ ...prev, [key]: userId }));
    setChecked((prev) => {
      const n = new Set(prev);
      if (userId) n.add(key);
      else n.delete(key);
      return n;
    });
  }, []);

  /**
   * Commit list = checked matched-people rows + checked needs_user rows with a
   * picked user. A needs_user row whose (user, store) pair already appeared in
   * an earlier row is excluded and flagged (duplicateKeys → inline warning).
   */
  const { selectedAssignments, duplicateKeys } = useMemo(() => {
    const assignments: EmpidCommitAssignment[] = [];
    const duplicates = new Set<string>();
    if (!preview) return { selectedAssignments: assignments, duplicateKeys: duplicates };
    const seenPairs = new Set<string>();
    preview.people.forEach((person, pi) => {
      person.entries.forEach((entry, ei) => {
        if (!checked.has(entryKey("p", pi, ei))) return;
        if (!isSelectable(person, entry)) return;
        seenPairs.add(`${person.user_id}|${entry.store_id}`);
        assignments.push({
          user_id: person.user_id as string,
          store_id: entry.store_id as string,
          empid: entry.emp_id as number,
        });
      });
    });
    const pickerBuckets: { prefix: string; people: EmpidImportPerson[] }[] = [
      { prefix: "ph", people: preview.placeholder },
      { prefix: "df", people: preview.deferred },
    ];
    pickerBuckets.forEach(({ prefix, people }) => {
      people.forEach((person, pi) => {
        person.entries.forEach((entry, ei) => {
          if (entry.action !== "needs_user") return;
          const key = entryKey(prefix, pi, ei);
          if (!checked.has(key)) return;
          const userId = pickedUsers[key];
          if (!userId || !entry.store_id || entry.emp_id === null) return;
          const pair = `${userId}|${entry.store_id}`;
          if (seenPairs.has(pair)) {
            duplicates.add(key);
            return;
          }
          seenPairs.add(pair);
          assignments.push({
            user_id: userId,
            store_id: entry.store_id,
            empid: entry.emp_id,
          });
        });
      });
    });
    return { selectedAssignments: assignments, duplicateKeys: duplicates };
  }, [preview, checked, pickedUsers]);

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
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-text mb-1">Upload legacy roster</h2>
              <p className="text-sm text-text-secondary">
                Upload the legacy roster (COMPANY, CORP_ABR_3, Name, emp_id, Email).
                Numbers are registered per store.
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              <Button variant="ghost" size="sm" onClick={() => void downloadTemplate("blank")}>
                <Download size={14} />
                Template
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setExportOpen(true)}>
                <Download size={14} />
                Export current
              </Button>
            </div>
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

        {/* Mounted only while open — store/group queries fetch lazily,
            selection resets each open. */}
        {exportOpen && <ExportEmpidModal onClose={() => setExportOpen(false)} />}
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
                  const key = entryKey("p", pi, ei);
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

      {/* Placeholder / deferred — pick a user per row to register anyway */}
      <PickUserSection
        title="Placeholder emails"
        hint="Shared/dummy emails — pick a user to register each row."
        prefix="ph"
        people={preview.placeholder}
        users={users}
        usersLoading={usersLoading}
        checked={checked}
        pickedUsers={pickedUsers}
        duplicateKeys={duplicateKeys}
        onToggle={toggle}
        onPickUser={pickUser}
      />
      <PickUserSection
        title="Deferred"
        hint="No matching user in DB — pick a user to register each row."
        prefix="df"
        people={preview.deferred}
        users={users}
        usersLoading={usersLoading}
        checked={checked}
        pickedUsers={pickedUsers}
        duplicateKeys={duplicateKeys}
        onToggle={toggle}
        onPickUser={pickUser}
      />

      {/* Apply bar */}
      <div className="bg-card border border-border rounded-xl p-4 flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs text-text-muted">
          Rebind rows set to Upload, checked new-assignment rows, and checked
          picked-user rows are applied. Existing numbers may be renumbered.
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
