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
import { Upload, FileSpreadsheet, X, AlertTriangle, Download, Copy, Check } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { PERMISSIONS, ROLE_PRIORITY } from "@/lib/permissions";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui";
import { Modal } from "@/components/ui/Modal";
import { useModal } from "@/components/ui/imperative-modal";
import { cn, parseApiError } from "@/lib/utils";
import {
  useUsers,
  useCreateProvisionalUsersBulk,
  type CreateProvisionalUserData,
} from "@/hooks/useUsers";
import { useRoles } from "@/hooks/useRoles";
import { useStoreGroups } from "@/hooks/useStoreGroups";
import { useStores } from "@/hooks/useStores";
import type { Role, Store, StoreGroup, User } from "@/types";
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

/**
 * Sentinel stored in `pickedUsers` when the operator chose "create a new
 * provisional staff member" instead of an existing DB user. Rows carrying it
 * get a real user id only at Apply time, after the bulk-create call returns.
 */
const CREATE_PROVISIONAL = "__create_provisional__";

/**
 * Group key for provisional creation: one user per (person card × file name).
 * Deferred rows for one person across several stores collapse into a single
 * user with several store_ids, while a placeholder card (several people
 * sharing a dummy email) still creates one user per distinct name.
 */
const createGroupKey = (
  prefix: string,
  personIdx: number,
  fullName: string,
): string => `${prefix}:${personIdx}:${fullName}`;

/** One provisional staff member to create, plus the rows waiting on its id. */
interface ProvisionalCreateGroup {
  key: string;
  full_name: string;
  role_id: string;
  /** Every store the person appears in — one user, many store assignments. */
  store_ids: string[];
  rows: { store_id: string; empid: number }[];
}

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

/** needs_store 행 — 사람은 확정, 매장은 그룹 매장 중 운영자 선택. */
const isStorePickable = (
  person: EmpidImportPerson,
  entry: EmpidImportEntry,
): boolean =>
  entry.action === "needs_store" &&
  !!person.user_id &&
  entry.emp_id !== null &&
  (entry.group_stores?.length ?? 0) > 0;

const COUNT_ITEMS: { key: keyof EmpidImportCounts; label: string }[] = [
  { key: "people", label: "People" },
  { key: "rebind", label: "Rebind" },
  { key: "same", label: "Same" },
  { key: "new_assignment", label: "New assignment" },
  { key: "unmatched_store", label: "Unmatched" },
  { key: "needs_store", label: "Pick store" },
  { key: "htm_unmatched", label: "HTM unmatched" },
  { key: "file_unmatched", label: "File unmatched" },
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
 * The first option creates a brand-new provisional staff member instead —
 * for people who simply aren't in the DB yet.
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
          <option value={CREATE_PROVISIONAL}>
            + Create as new provisional staff
          </option>
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
 * it anyway, or creates a provisional staff member on the spot.
 * unmatched_store / invalid rows stay report-only.
 */
function PickUserSection({
  title,
  hint,
  prefix,
  people,
  users,
  usersLoading,
  roles,
  defaultRoleId,
  checked,
  pickedUsers,
  pickedRoles,
  pickedStores,
  duplicateKeys,
  onToggle,
  onPickUser,
  onPickRole,
  onPickStore,
}: {
  title: string;
  hint: string;
  prefix: string;
  people: EmpidImportPerson[];
  users: User[];
  usersLoading: boolean;
  roles: Role[];
  defaultRoleId: string;
  checked: Set<string>;
  pickedUsers: Record<string, string>;
  pickedRoles: Record<string, string>;
  pickedStores: Record<string, string>;
  duplicateKeys: Set<string>;
  onToggle: (key: string) => void;
  onPickUser: (key: string, userId: string) => void;
  onPickRole: (groupKey: string, roleId: string) => void;
  onPickStore: (key: string, storeId: string) => void;
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
                const willCreate = pickedUser === CREATE_PROVISIONAL;
                const fullName = entry.person_name ?? person.name;
                // 그룹 스코프 — 매장도 골라야 등록 가능 (hint = corp 가 지목한 매장 프리필)
                const needsStorePick = !entry.store_id && (entry.group_stores?.length ?? 0) > 0;
                const storePicked =
                  entry.store_id ?? pickedStores[key] ?? entry.hint_store_id ?? "";
                const groupKey = createGroupKey(prefix, pi, fullName);
                const roleId = pickedRoles[groupKey] ?? defaultRoleId;
                return (
                  <div
                    key={key}
                    className="flex items-center gap-2 flex-wrap rounded-lg px-2 py-1.5 -mx-2 hover:bg-surface-hover transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={checked.has(key)}
                      onChange={() => onToggle(key)}
                      disabled={!pickedUser || !storePicked}
                      className="cursor-pointer accent-accent disabled:cursor-not-allowed"
                    />
                    <span className="text-sm text-text">
                      {fullName} — {entry.store_name}:{" "}
                      <span className="font-semibold">{entry.emp_id}</span>
                    </span>
                    {needsStorePick && (
                      <select
                        className="bg-surface border border-border rounded-lg px-2 py-1 text-xs text-text"
                        value={pickedStores[key] ?? entry.hint_store_id ?? ""}
                        onChange={(e) => onPickStore(key, e.target.value)}
                      >
                        <option value="">Pick a store…</option>
                        {(entry.group_stores ?? []).map((st) => (
                          <option key={st.store_id} value={st.store_id}>
                            {st.store_name}
                          </option>
                        ))}
                      </select>
                    )}
                    <UserPicker
                      users={users}
                      isLoading={usersLoading}
                      value={pickedUser}
                      suggestedId={suggestedId}
                      onChange={(userId) => onPickUser(key, userId)}
                    />
                    {willCreate && (
                      <>
                        <Badge
                          variant="accent"
                          className="text-[10px] uppercase tracking-wide"
                        >
                          New
                        </Badge>
                        <select
                          value={roleId}
                          onChange={(e) => onPickRole(groupKey, e.target.value)}
                          aria-label={`Role for ${fullName}`}
                          className="px-2 py-1 rounded-md bg-surface border border-border text-xs text-text focus:outline-none focus:ring-2 focus:ring-accent/20 cursor-pointer"
                        >
                          {roles.length === 0 && (
                            <option value="">Loading roles…</option>
                          )}
                          {roles.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name}
                            </option>
                          ))}
                        </select>
                        <span className="text-[11px] text-text-muted">
                          Will be created as a provisional staff member (no
                          login yet)
                        </span>
                      </>
                    )}
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
                            {m.crewid !== null && (
                              <span className="text-[11px] text-text-muted">
                                CREW #{m.crewid}
                              </span>
                            )}
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
  // Roles for the "create as provisional staff" rows.
  const { data: rolesData } = useRoles();
  const roles: Role[] = useMemo(
    () => (Array.isArray(rolesData) ? rolesData : []),
    [rolesData],
  );
  /** Default role for created staff: Staff (priority 40), else the lowest rank. */
  const defaultRoleId: string = useMemo(() => {
    if (roles.length === 0) return "";
    const staff = roles.find((r) => r.priority === ROLE_PRIORITY.STAFF);
    if (staff) return staff.id;
    return roles.reduce((a, b) => (b.priority > a.priority ? b : a)).id;
  }, [roles]);
  const createProvisional = useCreateProvisionalUsersBulk();

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
  /**
   * needs_user rows — entry key → picked user id, "" / absent = none,
   * CREATE_PROVISIONAL = create a new provisional staff member for this row.
   */
  const [pickedUsers, setPickedUsers] = useState<Record<string, string>>({});
  /** Create-group key → role id chosen for the staff member to be created. */
  const [pickedRoles, setPickedRoles] = useState<Record<string, string>>({});
  /** 그룹 스코프 행의 매장 선택 — needs_store / (그룹) needs_user. entry key → store id. */
  const [pickedStores, setPickedStores] = useState<Record<string, string>>({});
  /** 대조 패널의 HTM 미매칭 인원 번호 입력 — "rc|user|store" key → 숫자 문자열. */
  const [reconNumbers, setReconNumbers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<EmpidCommitResult | null>(null);
  /** Claim codes of staff created during the last Apply (result step). */
  const [createdClaims, setCreatedClaims] = useState<
    { name: string; code: string }[]
  >([]);
  const [claimsCopied, setClaimsCopied] = useState(false);
  /** "Export current" filter modal (upload step). */
  const [exportOpen, setExportOpen] = useState(false);
  /**
   * Unmatched store label → store id mapping (preview re-run input).
   * Keys come verbatim from preview.unmatched_stores[].key — typo'd store
   * codes ("MBK"), corp names with no code, etc.
   */
  const [storeOverrides, setStoreOverrides] = useState<Record<string, string>>({});
  /** Store options for the unmatched-store mapping panel. */
  const storesQ = useStores();
  const storeOptions: Store[] = storesQ.data ?? [];
  const mappingGroupsQ = useStoreGroups();
  /** 그룹별 매장 버킷 — 매핑 드롭다운의 optgroup 재료. */
  const mappingGroups = useMemo(() => {
    const groups = mappingGroupsQ.data ?? [];
    const byGroup = new Map<string, Store[]>();
    const ungrouped: Store[] = [];
    for (const st of storeOptions) {
      if (st.group_id) {
        const list = byGroup.get(st.group_id) ?? [];
        list.push(st);
        byGroup.set(st.group_id, list);
      } else {
        ungrouped.push(st);
      }
    }
    return { groups, byGroup, ungrouped };
  }, [mappingGroupsQ.data, storeOptions]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setStep("upload");
    setSelectedFile(null);
    setIsDragging(false);
    setPreview(null);
    setChecked(new Set());
    setPickedUsers({});
    setPickedRoles({});
    setPickedStores({});
    setReconNumbers({});
    setResult(null);
    setCreatedClaims([]);
    setClaimsCopied(false);
    setStoreOverrides({});
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
    const activeOverrides = Object.fromEntries(
      Object.entries(storeOverrides).filter(([, v]) => v),
    );
    if (Object.keys(activeOverrides).length > 0) {
      formData.append("store_overrides", JSON.stringify(activeOverrides));
    }
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
        setPickedRoles({});
        setStep("preview");
      },
      // hook shows the error modal
    });
  }, [selectedFile, previewImport, storeOverrides]);

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

  /**
   * needs_user rows — picking a user (or "create provisional") auto-checks;
   * clearing unchecks.
   */
  const pickUser = useCallback((key: string, userId: string) => {
    setPickedUsers((prev) => ({ ...prev, [key]: userId }));
    setChecked((prev) => {
      const n = new Set(prev);
      if (userId) n.add(key);
      else n.delete(key);
      return n;
    });
  }, []);

  /** needs_user(그룹 스코프) 행의 매장 선택 — 유저까지 골라져 있으면 자동 체크. */
  const pickStore = useCallback((key: string, storeId: string) => {
    setPickedStores((prev) => ({ ...prev, [key]: storeId }));
    setChecked((prev) => {
      const next = new Set(prev);
      if (storeId && pickedUsers[key]) next.add(key);
      else next.delete(key);
      return next;
    });
  }, [pickedUsers]);

  /** Role for a to-be-created provisional staff member (per create group). */
  const pickRole = useCallback((groupKey: string, roleId: string) => {
    setPickedRoles((prev) => ({ ...prev, [groupKey]: roleId }));
  }, []);

  /**
   * Commit list = checked matched-people rows + checked needs_user rows with a
   * picked user. A needs_user row whose (user, store) pair already appeared in
   * an earlier row is excluded and flagged (duplicateKeys → inline warning).
   *
   * Rows marked CREATE_PROVISIONAL have no user id yet, so they are collected
   * into createGroups instead — one group per person×name, carrying every
   * store it appears in. Apply creates those users first, then folds their
   * rows into the commit payload.
   */
  const {
    selectedAssignments,
    duplicateKeys,
    createGroups,
    createRowCount,
  } = useMemo(() => {
    const assignments: EmpidCommitAssignment[] = [];
    const duplicates = new Set<string>();
    const groups = new Map<string, ProvisionalCreateGroup>();
    if (!preview)
      return {
        selectedAssignments: assignments,
        duplicateKeys: duplicates,
        createGroups: [] as ProvisionalCreateGroup[],
        createRowCount: 0,
      };
    const seenPairs = new Set<string>();
    preview.people.forEach((person, pi) => {
      person.entries.forEach((entry, ei) => {
        const key = entryKey("p", pi, ei);
        if (!checked.has(key)) return;
        // needs_store — 사람은 확정, 매장은 운영자가 고른 그룹 매장 (hint = 프리필)
        if (entry.action === "needs_store") {
          const storeId = pickedStores[key] ?? entry.hint_store_id ?? undefined;
          if (!isStorePickable(person, entry) || !storeId) return;
          const pair = `${person.user_id}|${storeId}`;
          if (seenPairs.has(pair)) {
            duplicates.add(key);
            return;
          }
          seenPairs.add(pair);
          assignments.push({
            user_id: person.user_id as string,
            store_id: storeId,
            empid: entry.emp_id as number,
          });
          return;
        }
        if (!isSelectable(person, entry)) return;
        seenPairs.add(`${person.user_id}|${entry.store_id}`);
        assignments.push({
          user_id: person.user_id as string,
          store_id: entry.store_id as string,
          empid: entry.emp_id as number,
        });
      });
    });
    // 대조 패널 — HTM 미매칭 인원에게 지정한 번호
    (preview.reconciliation ?? []).forEach((rec) => {
      rec.htm_unmatched.forEach((x) => {
        const rkey = `rc|${x.user_id}|${x.store_id}`;
        if (!checked.has(rkey)) return;
        const raw = reconNumbers[rkey] ?? "";
        if (!/^\d+$/.test(raw)) return;
        const pair = `${x.user_id}|${x.store_id}`;
        if (seenPairs.has(pair)) {
          duplicates.add(rkey);
          return;
        }
        seenPairs.add(pair);
        assignments.push({
          user_id: x.user_id,
          store_id: x.store_id,
          empid: parseInt(raw, 10),
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
          // 그룹 스코프 needs_user 는 store 도 골라야 한다 (pickedStores → hint 폴백)
          const entryStoreId =
            entry.store_id ?? pickedStores[key] ?? entry.hint_store_id ?? null;
          if (!userId || !entryStoreId || entry.emp_id === null) return;

          if (userId === CREATE_PROVISIONAL) {
            const fullName = entry.person_name ?? person.name;
            const groupKey = createGroupKey(prefix, pi, fullName);
            // Group identity stands in for the (not-yet-known) user id.
            const pair = `create:${groupKey}|${entryStoreId}`;
            if (seenPairs.has(pair)) {
              duplicates.add(key);
              return;
            }
            seenPairs.add(pair);
            const group = groups.get(groupKey) ?? {
              key: groupKey,
              full_name: fullName,
              role_id: pickedRoles[groupKey] ?? defaultRoleId,
              store_ids: [],
              rows: [],
            };
            if (!group.store_ids.includes(entryStoreId)) {
              group.store_ids.push(entryStoreId);
            }
            group.rows.push({ store_id: entryStoreId, empid: entry.emp_id });
            groups.set(groupKey, group);
            return;
          }

          const pair = `${userId}|${entryStoreId}`;
          if (seenPairs.has(pair)) {
            duplicates.add(key);
            return;
          }
          seenPairs.add(pair);
          assignments.push({
            user_id: userId,
            store_id: entryStoreId,
            empid: entry.emp_id,
          });
        });
      });
    });
    const groupList = [...groups.values()];
    return {
      selectedAssignments: assignments,
      duplicateKeys: duplicates,
      createGroups: groupList,
      createRowCount: groupList.reduce((n, g) => n + g.rows.length, 0),
    };
  }, [preview, checked, pickedUsers, pickedRoles, pickedStores, reconNumbers, defaultRoleId]);

  /** Rows that Apply will write — existing users + rows pending creation. */
  const applyCount = selectedAssignments.length + createRowCount;

  const apply = useCallback(async () => {
    if (applyCount === 0) return;
    const missingRole = createGroups.find((g) => !g.role_id);
    if (missingRole) {
      void modal.alert({
        type: "error",
        message: `Pick a role for ${missingRole.full_name} before applying.`,
      });
      return;
    }
    const ok = await modal.confirm({
      title: `Apply ${applyCount} number(s)?`,
      message:
        "Numbers are written per store. Existing numbers may be renumbered to make room." +
        (createGroups.length > 0
          ? `\n${createGroups.length} will be created as provisional staff.`
          : ""),
      confirmLabel: "Apply",
      variant: "warning",
    });
    if (!ok) return;

    // Step a — create the missing people first. A failure here aborts before
    // any number is written (the server creates them in one transaction).
    const assignments: EmpidCommitAssignment[] = [...selectedAssignments];
    const claims: { name: string; code: string }[] = [];
    if (createGroups.length > 0) {
      const people: CreateProvisionalUserData[] = createGroups.map((g) => ({
        full_name: g.full_name,
        role_id: g.role_id,
        store_ids: g.store_ids,
      }));
      let created: User[];
      try {
        created = await createProvisional.mutateAsync({ people });
      } catch {
        return; // hook shows the error modal
      }
      if (created.length !== createGroups.length) {
        void modal.alert({
          type: "error",
          message:
            "The server returned a different number of created staff than requested — nothing was written.",
        });
        return;
      }
      // Step b — response order mirrors request order, so index maps group→user.
      created.forEach((user, i) => {
        const group = createGroups[i];
        claims.push({
          name: user.full_name || group.full_name,
          code: user.claim_code ?? "—",
        });
        group.rows.forEach((row) => {
          assignments.push({
            user_id: user.id,
            store_id: row.store_id,
            empid: row.empid,
          });
        });
      });
    }

    commitImport.mutate(
      { assignments },
      {
        onSuccess: (data) => {
          setCreatedClaims(claims);
          setClaimsCopied(false);
          setResult(data);
          setStep("result");
        },
        // hook shows the error modal
      },
    );
  }, [
    applyCount,
    selectedAssignments,
    createGroups,
    modal,
    commitImport,
    createProvisional,
  ]);

  /** Copy every claim code as "Name: CODE" lines for handing out later. */
  const copyClaims = useCallback(async () => {
    const text = createdClaims.map((c) => `${c.name}: ${c.code}`).join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setClaimsCopied(true);
      window.setTimeout(() => setClaimsCopied(false), 2000);
    } catch {
      // Clipboard unavailable (non-HTTPS) — the codes are on screen anyway.
    }
  }, [createdClaims]);

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
                Upload the legacy roster (COMPANY, CORP_ABR_3, Name, emp_id,
                Email, optional crewid). Rows with a crewid are matched exactly
                by org number — useful when staff signed up with a different
                email.
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

          {createdClaims.length > 0 && (
            <div className="rounded-lg bg-accent-muted border border-accent/20 p-3">
              <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
                <p className="text-xs font-semibold text-accent">
                  {createdClaims.length} provisional staff created — claim codes
                </p>
                <Button variant="secondary" size="sm" onClick={() => void copyClaims()}>
                  {claimsCopied ? <Check size={14} /> : <Copy size={14} />}
                  {claimsCopied ? "Copied" : "Copy all"}
                </Button>
              </div>
              <p className="text-[11px] text-text-muted mb-2">
                Give each code to the employee — they enter it when signing up
                to take over the account.
              </p>
              <ul className="text-xs text-text-secondary space-y-0.5 max-h-48 overflow-y-auto">
                {createdClaims.map((c, i) => (
                  <li key={i}>
                    {c.name} —{" "}
                    <span className="font-mono font-semibold text-text tracking-wider">
                      {c.code}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

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

      {/* Saved label mappings — learned from previous uploads, auto-applied */}
      {(preview.saved_aliases?.length ?? 0) > 0 && (
        <div className="bg-card border border-border rounded-xl p-4">
          <p className="text-sm font-semibold text-text mb-1">
            Saved label mappings (applied automatically)
          </p>
          <p className="text-xs text-text-muted mb-2">
            Learned from previous uploads. To change one, pick a different store
            below and re-run — the new choice is remembered.
          </p>
          <div className="flex flex-wrap gap-2">
            {preview.saved_aliases.map((a) => (
              <span
                key={a.key}
                className="inline-flex items-center gap-1.5 rounded-full bg-surface px-2.5 py-1 text-xs text-text"
              >
                <span className="font-semibold">{a.key}</span>
                <span className="text-text-muted">→</span>
                <select
                  className="bg-transparent text-xs text-text border-0 focus:outline-none cursor-pointer"
                  value={storeOverrides[a.key] ?? a.target_id}
                  onChange={(e) =>
                    setStoreOverrides((prev) => ({ ...prev, [a.key]: e.target.value }))
                  }
                >
                  <option value={a.target_id}>{a.store_name}</option>
                  {storeOptions
                    .filter((st) => st.id !== a.target_id)
                    .map((st) => (
                      <option key={st.id} value={st.id}>
                        {st.name}
                      </option>
                    ))}
                </select>
              </span>
            ))}
          </div>
          {preview.saved_aliases.some(
            (a) => storeOverrides[a.key] && storeOverrides[a.key] !== a.target_id,
          ) && (
            <div className="mt-2">
              <Button variant="secondary" size="sm" onClick={handlePreview} disabled={previewImport.isPending}>
                {previewImport.isPending ? "Re-running…" : "Re-run with changed mappings"}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Unmatched store mapping — map file labels to stores, then re-run */}
      {preview.unmatched_stores?.length > 0 && (
        <div className="bg-card border border-warning/40 rounded-xl p-4">
          <div className="flex items-start gap-2 mb-2">
            <AlertTriangle className="h-4 w-4 text-warning mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-text">
                Unrecognized store labels in this file
              </p>
              <p className="text-xs text-text-muted mt-0.5">
                Map each label to a store and re-run the preview. Rows with
                unmapped labels stay report-only. Re-running resets row
                selections below.
              </p>
            </div>
          </div>
          <div className="space-y-2">
            {preview.unmatched_stores.map((u) => (
              <div key={u.key} className="flex items-center gap-3 pl-6">
                <span className="text-sm text-text min-w-[220px]">
                  {u.corp_abr || u.company}
                  {u.corp_abr && u.company && (
                    <span className="text-xs text-text-muted ml-1">({u.company})</span>
                  )}
                  <span className="text-xs text-text-muted ml-1">· {u.rows} rows</span>
                </span>
                <select
                  className="bg-surface border border-border rounded-lg px-2 py-1.5 text-sm text-text"
                  value={storeOverrides[u.key] ?? ""}
                  onChange={(e) =>
                    setStoreOverrides((prev) => ({ ...prev, [u.key]: e.target.value }))
                  }
                >
                  <option value="">— skip —</option>
                  {mappingGroups.groups.length > 0 && (
                    <optgroup label="Groups">
                      {mappingGroups.groups.map((g) => {
                        const members = mappingGroups.byGroup.get(g.id) ?? [];
                        if (members.length === 0) return null;
                        // 다매장 그룹도 정식 스코프 — 행의 매장은 각 사람의 그룹 내
                        // 기존 배정이 결정한다 (배정 없으면 needs_store 로 매장 선택).
                        return (
                          <option key={g.id} value={g.id}>
                            Group: {g.name}
                            {members.length > 1 ? ` (${members.length} stores)` : ""}
                          </option>
                        );
                      })}
                    </optgroup>
                  )}
                  {mappingGroups.groups.map((g) => {
                    const members = mappingGroups.byGroup.get(g.id) ?? [];
                    if (members.length === 0) return null;
                    return (
                      <optgroup key={g.id} label={g.name}>
                        {members.map((st) => (
                          <option key={st.id} value={st.id}>
                            {st.name}
                          </option>
                        ))}
                      </optgroup>
                    );
                  })}
                  {mappingGroups.ungrouped.length > 0 && (
                    <optgroup
                      label={
                        mappingGroups.groups.length > 0 ? "Ungrouped stores" : "Stores"
                      }
                    >
                      {mappingGroups.ungrouped.map((st) => (
                        <option key={st.id} value={st.id}>
                          {st.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>
            ))}
          </div>
          <div className="mt-3 pl-6">
            <Button
              variant="secondary"
              size="sm"
              onClick={handlePreview}
              disabled={
                previewImport.isPending ||
                !Object.values(storeOverrides).some(Boolean)
              }
            >
              {previewImport.isPending ? "Re-running…" : "Re-run preview with mapping"}
            </Button>
          </div>
        </div>
      )}

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
                  {person.matched_by === "crewid" && (
                    <Badge
                      variant="accent"
                      className="text-[10px] uppercase tracking-wide ml-2"
                    >
                      Matched by CREWID
                    </Badge>
                  )}
                  {person.matched_by === "name" && (
                    <Badge
                      variant="warning"
                      className="text-[10px] uppercase tracking-wide ml-2"
                    >
                      Matched by name — verify
                    </Badge>
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

                  // needs_store — 그룹 매핑은 맞지만 그룹 내 배정 매장이 없다.
                  // 운영자가 그룹 매장 중 하나를 골라야 등록 (체크는 선택 후 자동).
                  if (entry.action === "needs_store") {
                    // 파일 corp 가 매장을 지목했던 행(매장→그룹 승격)은 그 매장을 프리필
                    const storePicked =
                      pickedStores[key] ?? entry.hint_store_id ?? "";
                    const pickable = isStorePickable(person, entry);
                    return (
                      <div
                        key={key}
                        className="flex items-center gap-2 flex-wrap rounded-lg px-2 py-1.5 -mx-2 hover:bg-surface-hover transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={checked.has(key)}
                          onChange={() => toggle(key)}
                          disabled={!storePicked || !pickable}
                          className="cursor-pointer accent-accent disabled:cursor-not-allowed"
                        />
                        <span className="text-sm text-text">
                          {entry.group_name ?? entry.company}:{" "}
                          <span className="font-semibold">{entry.emp_id}</span>
                        </span>
                        <select
                          className="bg-surface border border-border rounded-lg px-2 py-1 text-xs text-text"
                          value={storePicked}
                          onChange={(e) => {
                            const v = e.target.value;
                            setPickedStores((prev) => ({ ...prev, [key]: v }));
                            // 매장 선택 = 등록 의사 — needs_user 의 pickUser 와 동일하게 자동 체크
                            setChecked((prev) => {
                              const next = new Set(prev);
                              if (v) next.add(key);
                              else next.delete(key);
                              return next;
                            });
                          }}
                        >
                          <option value="">Pick a store…</option>
                          {(entry.group_stores ?? []).map((st) => (
                            <option key={st.store_id} value={st.store_id}>
                              {st.store_name}
                            </option>
                          ))}
                        </select>
                        {entry.warning && <EntryWarning text={entry.warning} />}
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

      {/* 양측 대조 — 사람 단위 3분류. HTM 미매칭 인원은 여기서 바로 번호 지정 가능 */}
      {(preview.reconciliation?.length ?? 0) > 0 && (
        <div className="bg-card border border-border rounded-xl p-4 space-y-4">
          <div>
            <p className="text-sm font-bold text-text">Number reconciliation</p>
            <p className="text-xs text-text-muted mt-0.5">
              Per mapped scope: matched people, HTM members the file didn&apos;t
              cover (assign a number right here — checked rows are applied), and
              file rows with no HTM person (resolve them in the sections below).
            </p>
          </div>
          {preview.reconciliation.map((rec) => (
            <div key={`${rec.scope}-${rec.id}`} className="border-t border-border/60 pt-3">
              <p className="text-sm font-semibold text-text">
                {rec.scope === "group" ? "Group: " : "Store: "}
                {rec.name}
                <span className="text-xs text-text-muted font-normal ml-2">
                  {rec.matched.length} matched · {rec.htm_unmatched.length} in HTM
                  only · {rec.file_unmatched.length} in file only
                </span>
              </p>

              {rec.matched.length > 0 && (
                <div className="mt-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-success mb-1">
                    Matched ({rec.matched.length})
                  </p>
                  <ul className="space-y-0.5 max-h-40 overflow-y-auto pr-1">
                    {rec.matched.map((m) => (
                      <li key={m.user_id} className="text-xs text-text">
                        <span className="font-medium">{m.name}</span>
                        <span className="text-text-muted">
                          {" — "}
                          {m.changes
                            .map((c) =>
                              c.pending_store
                                ? `#${c.new} (pick a store above)`
                                : c.current === c.new
                                  ? `${c.store_name}: #${c.new}`
                                  : `${c.store_name}: ${c.current ?? "—"} → ${c.new}`,
                            )
                            .join(" · ")}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="grid sm:grid-cols-2 gap-3 mt-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted mb-1">
                    In HTM, not in file — assign numbers
                  </p>
                  {rec.htm_unmatched.length === 0 ? (
                    <p className="text-xs text-text-muted">None</p>
                  ) : (
                    <ul className="space-y-1 max-h-56 overflow-y-auto pr-1">
                      {rec.htm_unmatched.map((x) => {
                        const rkey = `rc|${x.user_id}|${x.store_id}`;
                        const value = reconNumbers[rkey] ?? "";
                        return (
                          <li key={rkey} className="flex items-center gap-2 text-xs text-text">
                            <input
                              type="checkbox"
                              checked={checked.has(rkey)}
                              onChange={() => toggle(rkey)}
                              disabled={!/^\d+$/.test(value)}
                              className="cursor-pointer accent-accent disabled:cursor-not-allowed"
                            />
                            <span className="min-w-0 truncate">
                              <span className="font-medium">{x.name}</span>
                              <span className="text-text-muted"> — {x.store_name}</span>
                            </span>
                            <input
                              type="text"
                              inputMode="numeric"
                              placeholder={
                                x.current_empid != null ? String(x.current_empid) : "number"
                              }
                              value={value}
                              onChange={(e) => {
                                const v = e.target.value.trim();
                                setReconNumbers((prev) => ({ ...prev, [rkey]: v }));
                                setChecked((prev) => {
                                  const next = new Set(prev);
                                  if (/^\d+$/.test(v)) next.add(rkey);
                                  else next.delete(rkey);
                                  return next;
                                });
                              }}
                              className="w-20 bg-surface border border-border rounded-md px-2 py-0.5 text-xs text-text"
                            />
                            {x.current_empid != null && (
                              <span className="text-text-muted shrink-0">
                                now #{x.current_empid}
                              </span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-text-muted mb-1">
                    In file, not in HTM
                  </p>
                  {rec.file_unmatched.length === 0 ? (
                    <p className="text-xs text-text-muted">None</p>
                  ) : (
                    <ul className="space-y-0.5 max-h-56 overflow-y-auto pr-1">
                      {rec.file_unmatched.map((x, i) => (
                        <li key={`f${x.empid}-${i}`} className="text-xs text-text">
                          <span className="font-semibold">#{x.empid}</span> {x.name}
                        </li>
                      ))}
                    </ul>
                  )}
                  {rec.file_unmatched.length > 0 && (
                    <p className="text-[11px] text-text-muted mt-1">
                      Resolve these in the sections below (pick a user or create a
                      provisional staff member).
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Placeholder / deferred — pick a user per row to register anyway */}
      <PickUserSection
        title="Placeholder emails"
        hint="Shared/dummy emails — pick a user, or create a provisional staff member, to register each row."
        prefix="ph"
        people={preview.placeholder}
        users={users}
        usersLoading={usersLoading}
        roles={roles}
        defaultRoleId={defaultRoleId}
        checked={checked}
        pickedUsers={pickedUsers}
        pickedRoles={pickedRoles}
        pickedStores={pickedStores}
        duplicateKeys={duplicateKeys}
        onToggle={toggle}
        onPickUser={pickUser}
        onPickRole={pickRole}
        onPickStore={pickStore}
      />
      <PickUserSection
        title="Deferred"
        hint="No matching user in DB — pick a similar user, or create a provisional staff member, to register each row."
        prefix="df"
        people={preview.deferred}
        users={users}
        usersLoading={usersLoading}
        roles={roles}
        defaultRoleId={defaultRoleId}
        checked={checked}
        pickedUsers={pickedUsers}
        pickedRoles={pickedRoles}
        pickedStores={pickedStores}
        duplicateKeys={duplicateKeys}
        onToggle={toggle}
        onPickUser={pickUser}
        onPickRole={pickRole}
        onPickStore={pickStore}
      />

      {/* Apply bar */}
      <div className="bg-card border border-border rounded-xl p-4 flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs text-text-muted">
          Rebind rows set to Upload, checked new-assignment rows, and checked
          picked-user rows are applied. Existing numbers may be renumbered.
          {createGroups.length > 0 && (
            <>
              {" "}
              {createGroups.length} provisional staff member(s) will be created
              first — their claim codes appear on the result page.
            </>
          )}
        </p>
        <Button
          variant="primary"
          size="sm"
          onClick={() => void apply()}
          disabled={
            applyCount === 0 ||
            commitImport.isPending ||
            createProvisional.isPending
          }
          isLoading={commitImport.isPending || createProvisional.isPending}
        >
          Apply selected ({applyCount})
        </Button>
      </div>
    </div>
  );
}
