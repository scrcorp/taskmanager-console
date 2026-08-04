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
import { useStoreGroups } from "@/hooks/useStoreGroups";
import type { StoreGroup, User } from "@/types";
import {
  usePreviewEmpidImport,
  useCommitEmpidImport,
  type EmpidImportPreviewResult,
  type EmpidImportPerson,
  type EmpidImportEntry,
  type EmpidImportCounts,
  type EmpidCommitAssignment,
  type EmpidCommitResult,
  type EmpidExportItem,
  type EmpidExportSplit,
  useDownloadEmpidTemplate,
  useExportEmpids,
} from "@/hooks/useEmpidImport";
import {
  useEmpidRoster,
  type EmpidRosterMember,
  type EmpidRosterStore,
} from "@/hooks/useEmpidRoster";

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

// ─── Export — multi-axis roster picker modal ─────────────────────────────────

/** Sentinel key for a null role / department on filter checkboxes. */
const NO_ROLE = "__none__";
const NO_DEPT = "__none__";

type NumbersScope = "all" | "numbered" | "unnumbered";

/** Number-scope radio options for the export picker. */
const NUMBERS_OPTIONS: { value: NumbersScope; label: string }[] = [
  { value: "all", label: "Everyone" },
  { value: "numbered", label: "Has a number" },
  { value: "unnumbered", label: "Missing a number" },
];

/** Sheet-split select options (1차/2차식 배포 — one sheet per bucket). */
const SPLIT_OPTIONS: { value: EmpidExportSplit; label: string }[] = [
  { value: "none", label: "None — single sheet" },
  { value: "store", label: "By store" },
  { value: "role", label: "By role" },
  { value: "band", label: "By number band (hundreds)" },
];

/** One rendered store section in the store filter (last = Ungrouped). */
interface ExportRosterSection {
  groupId: string | null;
  name: string;
  stores: EmpidRosterStore[];
}

/** One distinct role across the roster, in role_priority order. */
interface ExportRoleOption {
  /** role_name, or NO_ROLE for members without a role. */
  key: string;
  label: string;
  priority: number;
}

/** One store of the filtered result with its passing members. */
interface ExportResultStore {
  store: EmpidRosterStore;
  members: EmpidRosterMember[];
}

/** Stable manual-exclusion key — survives filter changes. */
const rowKey = (userId: string, storeId: string): string => `${userId}:${storeId}`;

/**
 * Export picker modal — multi-axis filters (stores, roles, department,
 * numbers, number band, dormant) narrow the roster on the left; the right
 * panel lists every passing (person, store) row with a checkbox for manual
 * include/exclude. Export POSTs exactly the checked rows; Split sheets can
 * separate the workbook by store / role / number band for staged handouts.
 * Mounted only while open, so the roster/group queries fetch lazily and the
 * selection resets to "everything" on each open.
 */
function ExportEmpidModal({ onClose }: { onClose: () => void }): React.ReactElement {
  const modal = useModal();
  const exportEmpids = useExportEmpids();
  const { data: groupsData } = useStoreGroups();
  const { data: rosterData, isLoading: rosterLoading } = useEmpidRoster();
  const roster: EmpidRosterStore[] = useMemo(
    () => (Array.isArray(rosterData) ? rosterData : []),
    [rosterData],
  );

  // ── Filter state ──
  /** "all" = every store; otherwise an explicit id set. */
  const [storeSel, setStoreSel] = useState<Set<string> | "all">("all");
  /** Role keys the operator unchecked (default: every role on). */
  const [rolesOff, setRolesOff] = useState<Set<string>>(new Set());
  /** "all" | department value | NO_DEPT (unassigned). */
  const [dept, setDept] = useState<string>("all");
  const [numbers, setNumbers] = useState<NumbersScope>("all");
  /** Optional empid range — filled = only people whose number is inside. */
  const [bandFrom, setBandFrom] = useState("");
  const [bandTo, setBandTo] = useState("");
  const [includeDormant, setIncludeDormant] = useState(true);
  /** Manual per-row exclusions ("user:store" keys) — survive filter changes. */
  const [manualOff, setManualOff] = useState<Set<string>>(new Set());

  // ── Output options ──
  const [includeEmail, setIncludeEmail] = useState(true);
  const [includeNumbers, setIncludeNumbers] = useState(true);
  const [splitBy, setSplitBy] = useState<EmpidExportSplit>("none");
  const [isExporting, setIsExporting] = useState(false);

  // ── Store filter (grouped sections, Ungrouped last; empty hidden) ──
  const allStoreIds: string[] = useMemo(
    () => roster.map((s) => s.store_id),
    [roster],
  );

  const sections: ExportRosterSection[] = useMemo(() => {
    const groupList: StoreGroup[] = Array.isArray(groupsData)
      ? [...groupsData].sort((a, b) => a.sort_order - b.sort_order)
      : [];
    const knownGroupIds = new Set(groupList.map((g) => g.id));
    const byGroup = new Map<string, EmpidRosterStore[]>();
    const ungrouped: EmpidRosterStore[] = [];
    for (const store of roster) {
      const gid = store.group_id ?? null;
      if (gid && knownGroupIds.has(gid)) {
        const list = byGroup.get(gid);
        if (list) list.push(store);
        else byGroup.set(gid, [store]);
      } else {
        ungrouped.push(store);
      }
    }
    const result: ExportRosterSection[] = groupList
      .map((g) => ({ groupId: g.id, name: g.name, stores: byGroup.get(g.id) ?? [] }))
      .filter((s) => s.stores.length > 0);
    if (ungrouped.length > 0) {
      result.push({ groupId: null, name: "Ungrouped", stores: ungrouped });
    }
    return result;
  }, [groupsData, roster]);

  const isStoreChecked = useCallback(
    (id: string): boolean => storeSel === "all" || storeSel.has(id),
    [storeSel],
  );
  const allStoresChecked: boolean =
    storeSel === "all" ||
    (allStoreIds.length > 0 && storeSel.size === allStoreIds.length);

  const toggleAllStores = useCallback((): void => {
    setStoreSel((prev) => {
      const isAll =
        prev === "all" ||
        (allStoreIds.length > 0 && prev.size === allStoreIds.length);
      return isAll ? new Set<string>() : "all";
    });
  }, [allStoreIds]);

  const toggleStore = useCallback(
    (id: string): void => {
      setStoreSel((prev) => {
        const next = new Set(prev === "all" ? allStoreIds : prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    },
    [allStoreIds],
  );

  /** Group header toggle — all on → clear the group, otherwise select it all. */
  const toggleGroup = useCallback(
    (groupStores: EmpidRosterStore[]): void => {
      setStoreSel((prev) => {
        const next = new Set(prev === "all" ? allStoreIds : prev);
        const allOn = groupStores.every((s) => next.has(s.store_id));
        groupStores.forEach((s) => {
          if (allOn) next.delete(s.store_id);
          else next.add(s.store_id);
        });
        return next;
      });
    },
    [allStoreIds],
  );

  // ── Role / department option lists (derived from the roster) ──
  const roles: ExportRoleOption[] = useMemo(() => {
    const seen = new Map<string, ExportRoleOption>();
    for (const store of roster) {
      for (const m of store.members) {
        const key = m.role_name ?? NO_ROLE;
        const priority = m.role_priority ?? Number.MAX_SAFE_INTEGER;
        const existing = seen.get(key);
        if (!existing || priority < existing.priority) {
          seen.set(key, { key, label: m.role_name ?? "No role", priority });
        }
      }
    }
    return [...seen.values()].sort(
      (a, b) => a.priority - b.priority || a.label.localeCompare(b.label),
    );
  }, [roster]);

  const toggleRole = useCallback((key: string): void => {
    setRolesOff((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const { deptOptions, hasUnassignedDept } = useMemo(() => {
    const set = new Set<string>();
    let hasNull = false;
    for (const store of roster) {
      for (const m of store.members) {
        if (m.department) set.add(m.department);
        else hasNull = true;
      }
    }
    // FOH before BOH, anything else after alphabetically.
    const order = (d: string): number => (d === "FOH" ? 0 : d === "BOH" ? 1 : 2);
    return {
      deptOptions: [...set].sort((a, b) => order(a) - order(b) || a.localeCompare(b)),
      hasUnassignedDept: hasNull,
    };
  }, [roster]);

  // ── Filtered result — the right panel's row source ──
  const band = useMemo((): { from: number | null; to: number | null } => {
    const parse = (v: string): number | null => {
      const t = v.trim();
      if (!t) return null;
      const n = Number(t);
      return Number.isFinite(n) ? n : null;
    };
    return { from: parse(bandFrom), to: parse(bandTo) };
  }, [bandFrom, bandTo]);

  const results: ExportResultStore[] = useMemo(() => {
    const passes = (m: EmpidRosterMember): boolean => {
      if (rolesOff.has(m.role_name ?? NO_ROLE)) return false;
      if (dept !== "all") {
        if (dept === NO_DEPT) {
          if (m.department !== null) return false;
        } else if (m.department !== dept) return false;
      }
      if (numbers === "numbered" && m.empid === null) return false;
      if (numbers === "unnumbered" && m.empid !== null) return false;
      if (band.from !== null || band.to !== null) {
        // 번호대 필터 — 번호 없는 사람은 제외 (a band excludes the numberless)
        if (m.empid === null) return false;
        if (band.from !== null && m.empid < band.from) return false;
        if (band.to !== null && m.empid > band.to) return false;
      }
      if (!includeDormant && !m.is_work_assignment) return false;
      return true;
    };
    return roster
      .filter((s) => storeSel === "all" || storeSel.has(s.store_id))
      .map((s) => ({ store: s, members: s.members.filter(passes) }))
      .filter((r) => r.members.length > 0);
  }, [roster, storeSel, rolesOff, dept, numbers, band, includeDormant]);

  /** Final export list = filter-passing rows minus manual exclusions. */
  const { visibleCount, selectedItems } = useMemo(() => {
    const items: EmpidExportItem[] = [];
    let visible = 0;
    for (const r of results) {
      for (const m of r.members) {
        visible += 1;
        if (!manualOff.has(rowKey(m.user_id, r.store.store_id))) {
          items.push({ user_id: m.user_id, store_id: r.store.store_id });
        }
      }
    }
    return { visibleCount: visible, selectedItems: items };
  }, [results, manualOff]);

  const toggleRow = useCallback((key: string): void => {
    setManualOff((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  /** Select all / Clear — only touches the currently visible rows. */
  const setAllVisible = useCallback(
    (on: boolean): void => {
      setManualOff((prev) => {
        const next = new Set(prev);
        for (const r of results) {
          for (const m of r.members) {
            const key = rowKey(m.user_id, r.store.store_id);
            if (on) next.delete(key);
            else next.add(key);
          }
        }
        return next;
      });
    },
    [results],
  );

  const handleExport = useCallback(async (): Promise<void> => {
    if (selectedItems.length === 0) return;
    setIsExporting(true);
    try {
      await exportEmpids({
        items: selectedItems,
        include_email: includeEmail,
        include_numbers: includeNumbers,
        split_by: splitBy,
      });
      onClose();
    } catch (err) {
      void modal.alert({
        type: "error",
        message: parseApiError(err, "Failed to export the roster."),
      });
    } finally {
      setIsExporting(false);
    }
  }, [selectedItems, includeEmail, includeNumbers, splitBy, exportEmpids, onClose, modal]);

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Export roster"
      size="lg"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => void handleExport()}
            disabled={selectedItems.length === 0 || isExporting}
            isLoading={isExporting}
          >
            <Download size={14} />
            Export ({selectedItems.length})
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="space-y-4 md:grid md:grid-cols-[15rem_minmax(0,1fr)] md:gap-4 md:space-y-0">
          {/* ── Left: filters ── */}
          <div className="space-y-4 md:max-h-[55vh] md:overflow-y-auto md:pr-1">
            {/* Stores — group sections, Ungrouped last */}
            <div>
              <p className="text-xs font-semibold text-text-secondary mb-1.5">Stores</p>
              <label className="flex items-center gap-2 cursor-pointer text-sm font-medium text-text">
                <input
                  type="checkbox"
                  checked={allStoresChecked}
                  onChange={toggleAllStores}
                  className="cursor-pointer accent-accent"
                />
                All stores
              </label>
              <div className="mt-2 max-h-44 overflow-y-auto rounded-lg border border-border p-2.5 space-y-2.5">
                {sections.map((section) => {
                  const groupAllOn = section.stores.every((s) => isStoreChecked(s.store_id));
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
                      <div className="mt-1 space-y-1 pl-5">
                        {section.stores.map((store) => (
                          <label
                            key={store.store_id}
                            className="flex items-center gap-2 cursor-pointer text-sm text-text"
                          >
                            <input
                              type="checkbox"
                              checked={isStoreChecked(store.store_id)}
                              onChange={() => toggleStore(store.store_id)}
                              className="cursor-pointer accent-accent"
                            />
                            {store.store_name}
                          </label>
                        ))}
                      </div>
                    </div>
                  );
                })}
                {sections.length === 0 && (
                  <p className="text-xs text-text-muted">
                    {rosterLoading ? "Loading stores…" : "No stores."}
                  </p>
                )}
              </div>
            </div>

            {/* Roles — distinct role_name in priority order, default all on */}
            <div>
              <p className="text-xs font-semibold text-text-secondary mb-1.5">Roles</p>
              <div className="space-y-1">
                {roles.map((role) => (
                  <label
                    key={role.key}
                    className="flex items-center gap-2 cursor-pointer text-sm text-text"
                  >
                    <input
                      type="checkbox"
                      checked={!rolesOff.has(role.key)}
                      onChange={() => toggleRole(role.key)}
                      className="cursor-pointer accent-accent"
                    />
                    {role.label}
                  </label>
                ))}
                {roles.length === 0 && (
                  <p className="text-xs text-text-muted">
                    {rosterLoading ? "Loading…" : "No roles."}
                  </p>
                )}
              </div>
            </div>

            {/* Department — All / FOH / BOH / Unassigned (when nulls exist) */}
            <div>
              <p className="text-xs font-semibold text-text-secondary mb-1.5">Department</p>
              <div className="space-y-1">
                {[
                  { value: "all", label: "All" },
                  ...deptOptions.map((d) => ({ value: d, label: d })),
                  ...(hasUnassignedDept
                    ? [{ value: NO_DEPT, label: "Unassigned" }]
                    : []),
                ].map(({ value, label }) => (
                  <label
                    key={value}
                    className="flex items-center gap-2 cursor-pointer text-sm text-text"
                  >
                    <input
                      type="radio"
                      name="export-dept"
                      checked={dept === value}
                      onChange={() => setDept(value)}
                      className="cursor-pointer accent-accent"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>

            {/* Numbers */}
            <div>
              <p className="text-xs font-semibold text-text-secondary mb-1.5">Numbers</p>
              <div className="space-y-1">
                {NUMBERS_OPTIONS.map(({ value, label }) => (
                  <label
                    key={value}
                    className="flex items-center gap-2 cursor-pointer text-sm text-text"
                  >
                    <input
                      type="radio"
                      name="export-numbers"
                      checked={numbers === value}
                      onChange={() => setNumbers(value)}
                      className="cursor-pointer accent-accent"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>

            {/* Number band — optional empid range */}
            <div>
              <p className="text-xs font-semibold text-text-secondary mb-1.5">Number band</p>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={bandFrom}
                  onChange={(e) => setBandFrom(e.target.value)}
                  placeholder="From"
                  aria-label="Number band from"
                  className="w-20 px-2 py-1 rounded-md bg-surface border border-border text-xs text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/20"
                />
                <span className="text-xs text-text-muted">–</span>
                <input
                  type="number"
                  value={bandTo}
                  onChange={(e) => setBandTo(e.target.value)}
                  placeholder="To"
                  aria-label="Number band to"
                  className="w-20 px-2 py-1 rounded-md bg-surface border border-border text-xs text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/20"
                />
              </div>
              {(band.from !== null || band.to !== null) && (
                <p className="text-[11px] text-text-muted mt-1">
                  Only numbers in this range — people without a number are excluded.
                </p>
              )}
            </div>

            {/* Dormant */}
            <label className="flex items-center gap-2 cursor-pointer text-sm text-text">
              <input
                type="checkbox"
                checked={includeDormant}
                onChange={() => setIncludeDormant((v) => !v)}
                className="cursor-pointer accent-accent"
              />
              Include dormant assignments
            </label>
          </div>

          {/* ── Right: filtered people, grouped by store ── */}
          <div className="flex flex-col rounded-lg border border-border md:max-h-[55vh]">
            <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2 shrink-0">
              <p className="text-xs text-text-secondary">
                <span className="font-semibold text-text">{selectedItems.length}</span>{" "}
                of {visibleCount} selected
              </p>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" onClick={() => setAllVisible(true)}>
                  Select all
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setAllVisible(false)}>
                  Clear
                </Button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {rosterLoading ? (
                <p className="text-xs text-text-muted">Loading roster…</p>
              ) : results.length === 0 ? (
                <p className="text-xs text-text-muted">No people match the filters.</p>
              ) : (
                results.map(({ store, members }) => (
                  <div key={store.store_id}>
                    <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary mb-1">
                      {store.store_name} ({members.length})
                    </p>
                    <div className="space-y-0.5">
                      {members.map((m) => {
                        const key = rowKey(m.user_id, store.store_id);
                        return (
                          <label
                            key={key}
                            className="flex items-center gap-2 flex-wrap cursor-pointer rounded-md px-1.5 py-1 hover:bg-surface-hover transition-colors"
                          >
                            <input
                              type="checkbox"
                              checked={!manualOff.has(key)}
                              onChange={() => toggleRow(key)}
                              className="cursor-pointer accent-accent"
                            />
                            <span className="text-sm text-text">{m.full_name}</span>
                            {m.role_name && (
                              <Badge variant="accent" className="text-[10px]">
                                {m.role_name}
                              </Badge>
                            )}
                            {m.empid !== null ? (
                              <Badge variant="default" className="text-[10px] font-semibold">
                                #{m.empid}
                              </Badge>
                            ) : (
                              <Badge variant="warning" className="text-[10px]">
                                no number
                              </Badge>
                            )}
                            {!m.is_work_assignment && (
                              <Badge
                                variant="warning"
                                className="text-[10px] uppercase tracking-wide"
                              >
                                Dormant
                              </Badge>
                            )}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* ── Output options ── */}
        <div className="border-t border-border pt-3 space-y-2">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <label className="flex items-center gap-2 cursor-pointer text-sm text-text">
              <input
                type="checkbox"
                checked={includeEmail}
                onChange={() => setIncludeEmail((v) => !v)}
                className="cursor-pointer accent-accent"
              />
              Include emails
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-sm text-text">
              <input
                type="checkbox"
                checked={includeNumbers}
                onChange={() => setIncludeNumbers((v) => !v)}
                className="cursor-pointer accent-accent"
              />
              Include numbers
            </label>
            <label className="flex items-center gap-2 text-sm text-text">
              Split sheets
              <select
                value={splitBy}
                onChange={(e) => setSplitBy(e.target.value as EmpidExportSplit)}
                className="px-2 py-1 rounded-md bg-surface border border-border text-xs text-text focus:outline-none focus:ring-2 focus:ring-accent/20 cursor-pointer"
              >
                {SPLIT_OPTIONS.map(({ value, label }) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {!includeEmail && (
            <EntryWarning text="Email is the matching key — a file without emails can't be re-imported." />
          )}
          {splitBy !== "none" && (
            <p className="text-[11px] text-text-muted">
              Re-import reads the first sheet only.
            </p>
          )}
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

        {/* Mounted only while open — roster/group queries fetch lazily,
            filters and selection reset each open. */}
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
