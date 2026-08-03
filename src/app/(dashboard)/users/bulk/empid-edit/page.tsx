"use client";

/**
 * EMPID Edit — 파일 없이 매장별 empid 를 직접 추가/삭제/수정하는 bulk 에디터.
 * roster(GET /console/empid-import/roster) 를 매장 select + 멤버 테이블로 표시,
 * 변경은 로컬 draft 에 쌓아 useCommitEmpidImport 로 일괄 커밋 (empid null = 번호 삭제).
 */

import React, { useState, useMemo, useCallback } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { X, Plus } from "lucide-react";
import {
  useEmpidRoster,
  type EmpidRosterStore,
  type EmpidRosterMember,
} from "@/hooks/useEmpidRoster";
import { useUsers } from "@/hooks/useUsers";
import {
  useCommitEmpidImport,
  type EmpidCommitAssignment,
  type EmpidCommitResult,
} from "@/hooks/useEmpidImport";
import { usePermissions } from "@/hooks/usePermissions";
import { PERMISSIONS } from "@/lib/permissions";
import { Button } from "@/components/ui/Button";
import { Badge, Select } from "@/components/ui";
import { useModal } from "@/components/ui/imperative-modal";
import { type User } from "@/types";

/** Draft key — one editable cell per (store, user). */
const keyOf = (storeId: string, userId: string): string => `${storeId}|${userId}`;

/** Whether a raw input string means the same number as the current empid. */
const isSameAsCurrent = (value: string, empid: number | null): boolean => {
  const t = value.trim();
  if (t === "") return empid === null;
  if (!/^\d+$/.test(t)) return false;
  const n = parseInt(t, 10);
  return n >= 1 && empid !== null && n === empid;
};

/** One resolved pending change (member edit or added person). */
interface DraftChange {
  store_id: string;
  store_name: string;
  user_id: string;
  /** Committed value — null clears the number (assignment row kept). */
  empid: number | null;
  isNew: boolean;
  /** Raw input is neither empty nor a whole number ≥ 1. */
  invalid: boolean;
}

export default function EmpidEditPage(): React.ReactElement {
  const { hasPermission } = usePermissions();
  const canUpdate = hasPermission(PERMISSIONS.USERS_UPDATE);
  const modal = useModal();
  const queryClient: QueryClient = useQueryClient();
  const { data: rosterData, isLoading } = useEmpidRoster();
  const { data: usersData } = useUsers();
  const commit = useCommitEmpidImport();

  const roster: EmpidRosterStore[] = useMemo(
    () => (Array.isArray(rosterData) ? rosterData : []),
    [rosterData],
  );
  const usersById = useMemo(() => {
    const m = new Map<string, User>();
    (Array.isArray(usersData) ? usersData : []).forEach((u) => m.set(u.id, u));
    return m;
  }, [usersData]);

  // ── Store selection (default: first store) ──
  const [storeSel, setStoreSel] = useState("");
  const storeId = storeSel || roster[0]?.store_id || "";
  const store = roster.find((s) => s.store_id === storeId);

  // ── Draft — raw input strings keyed by store|user; added people tracked separately ──
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [added, setAdded] = useState<{ store_id: string; user_id: string }[]>([]);
  const [result, setResult] = useState<EmpidCommitResult | null>(null);

  // ── "Add person" form (per selected store) ──
  const [addUserId, setAddUserId] = useState("");
  const [addEmpid, setAddEmpid] = useState("");

  const setMemberDraft = useCallback(
    (k: string, value: string, current: number | null) => {
      setDraft((prev) => {
        const n = { ...prev };
        if (isSameAsCurrent(value, current)) delete n[k];
        else n[k] = value;
        return n;
      });
    },
    [],
  );

  const setAddedDraft = useCallback((k: string, value: string) => {
    setDraft((prev) => ({ ...prev, [k]: value }));
  }, []);

  const removeAdded = useCallback((sid: string, uid: string) => {
    setAdded((prev) => prev.filter((a) => !(a.store_id === sid && a.user_id === uid)));
    setDraft((prev) => {
      const n = { ...prev };
      delete n[keyOf(sid, uid)];
      return n;
    });
  }, []);

  // ── Pending changes across all stores ──
  const changes: DraftChange[] = useMemo(() => {
    const out: DraftChange[] = [];
    const push = (
      s: EmpidRosterStore,
      userId: string,
      raw: string,
      isNew: boolean,
    ): void => {
      const t = raw.trim();
      const valid = /^\d+$/.test(t) && parseInt(t, 10) >= 1;
      out.push({
        store_id: s.store_id,
        store_name: s.store_name,
        user_id: userId,
        empid: valid ? parseInt(t, 10) : null,
        isNew,
        invalid: t !== "" && !valid,
      });
    };
    roster.forEach((s) => {
      s.members.forEach((m) => {
        const v = draft[keyOf(s.store_id, m.user_id)];
        if (v === undefined || isSameAsCurrent(v, m.empid)) return;
        push(s, m.user_id, v, false);
      });
    });
    added.forEach((a) => {
      const s = roster.find((r) => r.store_id === a.store_id);
      if (!s) return;
      push(s, a.user_id, draft[keyOf(a.store_id, a.user_id)] ?? "", true);
    });
    return out;
  }, [roster, draft, added]);

  /** Keys of draft rows sharing a number with another draft row of the same store. */
  const dupKeys = useMemo(() => {
    const byNumber = new Map<string, string[]>();
    changes.forEach((c) => {
      if (c.empid === null || c.invalid) return;
      const nk = `${c.store_id}#${c.empid}`;
      byNumber.set(nk, [...(byNumber.get(nk) ?? []), keyOf(c.store_id, c.user_id)]);
    });
    const set = new Set<string>();
    byNumber.forEach((keys) => {
      if (keys.length > 1) keys.forEach((k) => set.add(k));
    });
    return set;
  }, [changes]);

  const invalidCount = changes.filter((c) => c.invalid).length;
  /**
   * 신규 행은 번호 필수 — empid null 은 서버 계약상 '번호 삭제'라 배정이 생성되지 않는다.
   * New rows saved without a number would create no assignment — block them.
   */
  const missingNewCount = changes.filter(
    (c) => c.isNew && !c.invalid && c.empid === null,
  ).length;
  const dupStoreNames = useMemo(
    () =>
      Array.from(
        new Set(
          changes
            .filter((c) => dupKeys.has(keyOf(c.store_id, c.user_id)))
            .map((c) => c.store_name),
        ),
      ),
    [changes, dupKeys],
  );

  const canSave =
    changes.length > 0 &&
    dupKeys.size === 0 &&
    invalidCount === 0 &&
    missingNewCount === 0 &&
    !commit.isPending;
  const otherStoreCount = changes.filter((c) => c.store_id !== storeId).length;

  const reset = useCallback(() => {
    setDraft({});
    setAdded([]);
    setAddUserId("");
    setAddEmpid("");
  }, []);

  const handleAdd = useCallback(() => {
    if (!addUserId || !storeId) return;
    setAdded((prev) => [...prev, { store_id: storeId, user_id: addUserId }]);
    setDraft((prev) => ({ ...prev, [keyOf(storeId, addUserId)]: addEmpid.trim() }));
    setAddUserId("");
    setAddEmpid("");
  }, [addUserId, addEmpid, storeId]);

  const save = useCallback(async () => {
    if (!canSave) return;
    const storeCount = new Set(changes.map((c) => c.store_id)).size;
    const ok = await modal.confirm({
      title: `Save ${changes.length} change(s)?`,
      message:
        `${changes.length} change(s) across ${storeCount} store(s). ` +
        "Existing numbers may be renumbered to make room; empty values release the number.",
      confirmLabel: "Save",
      variant: "warning",
    });
    if (!ok) return;
    const assignments: EmpidCommitAssignment[] = changes.map((c) => ({
      user_id: c.user_id,
      store_id: c.store_id,
      empid: c.empid,
    }));
    commit.mutate(
      { assignments },
      {
        onSuccess: (data) => {
          setResult(data);
          reset();
          void queryClient.invalidateQueries({ queryKey: ["empid-roster"] });
        },
        // hook shows the error modal
      },
    );
  }, [canSave, changes, modal, commit, reset, queryClient]);

  if (!canUpdate) {
    return (
      <div className="bg-card border border-border rounded-xl p-10 text-center text-text-secondary">
        You don&apos;t have permission to edit EMPIDs.
      </div>
    );
  }

  // ── Add-person candidates: org users not in this store's roster or draft ──
  const memberIds = new Set(store?.members.map((m) => m.user_id) ?? []);
  const addedHere = added.filter((a) => a.store_id === storeId);
  addedHere.forEach((a) => memberIds.add(a.user_id));
  const candidates = (Array.isArray(usersData) ? usersData : [])
    .filter((u) => !memberIds.has(u.id))
    .sort((a, b) => (a.full_name || a.username).localeCompare(b.full_name || b.username));

  const inputClass = (changed: boolean, bad: boolean): string =>
    `w-24 px-2 py-1 rounded-lg bg-surface border text-sm text-text text-right focus:outline-none focus:ring-2 focus:ring-accent/20 ${
      bad ? "border-danger" : changed ? "border-accent" : "border-border"
    }`;

  const renderRow = (
    m: { user_id: string; name: string; email: string | null; empid: number | null; dormant: boolean },
    isNew: boolean,
  ): React.ReactElement => {
    const k = keyOf(storeId, m.user_id);
    const raw = draft[k];
    const value = raw !== undefined ? raw : m.empid !== null ? String(m.empid) : "";
    const changed = isNew || (raw !== undefined && !isSameAsCurrent(raw, m.empid));
    const t = value.trim();
    const missingNew = isNew && t === "";
    const bad =
      dupKeys.has(k) ||
      missingNew ||
      (changed && t !== "" && !(/^\d+$/.test(t) && parseInt(t, 10) >= 1));
    return (
      <tr key={m.user_id} className="border-b border-border/50 hover:bg-surface-hover">
        <td className="px-3 py-2">
          <span className="text-sm font-medium text-text">{m.name}</span>
          {isNew && <Badge variant="accent" className="ml-2">NEW</Badge>}
          {m.dormant && <Badge variant="warning" className="ml-2">Dormant</Badge>}
        </td>
        <td className="px-3 py-2 text-sm text-text-muted">{m.email ?? "—"}</td>
        <td className="px-3 py-2 text-right">
          <input
            type="text"
            inputMode="numeric"
            aria-label={`EMPID for ${m.name}`}
            value={value}
            onChange={(e) =>
              isNew
                ? setAddedDraft(k, e.target.value)
                : setMemberDraft(k, e.target.value, m.empid)
            }
            placeholder="—"
            className={inputClass(changed, bad)}
          />
          {missingNew && (
            <p className="text-[11px] text-danger mt-1">
              number required for new assignment
            </p>
          )}
        </td>
        <td className="px-3 py-2">
          <div className="flex items-center justify-end gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                isNew ? setAddedDraft(k, "") : setMemberDraft(k, "", m.empid)
              }
              disabled={value.trim() === ""}
            >
              Clear
            </Button>
            {isNew && (
              <button
                type="button"
                aria-label={`Remove ${m.name}`}
                onClick={() => removeAdded(storeId, m.user_id)}
                className="p-1 rounded text-text-muted hover:text-danger transition-colors"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </td>
      </tr>
    );
  };

  return (
    <div className="max-w-4xl space-y-4">
      {/* ── Commit result panel ── */}
      {result && (
        <div className="bg-card border border-border rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-text">Save Results</h2>
            <Button variant="ghost" size="sm" onClick={() => setResult(null)}>
              Dismiss
            </Button>
          </div>
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
              <ul className="text-xs text-text-secondary space-y-0.5 max-h-40 overflow-y-auto">
                {result.applied.map((a, i) => (
                  <li key={i}>
                    {a.user} — {a.store}:{" "}
                    {typeof a.empid === "number" ? `#${a.empid}` : "number cleared"}
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
        </div>
      )}

      {/* ── Editor ── */}
      <div className="bg-card border border-border rounded-xl p-4 space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="w-64">
            <Select
              aria-label="Store"
              options={roster.map((s) => ({ value: s.store_id, label: s.store_name }))}
              value={storeId}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                setStoreSel(e.target.value);
                setAddUserId("");
                setAddEmpid("");
              }}
            />
          </div>
          <span className="text-xs text-text-muted">
            {store ? `${store.members.length + addedHere.length} member(s)` : ""}
          </span>
        </div>

        {isLoading ? (
          <div className="p-6 text-center text-text-muted text-sm">Loading…</div>
        ) : !store ? (
          <div className="p-6 text-center text-text-muted text-sm">No stores in the roster.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="px-3 py-2 text-xs font-semibold text-text-secondary">Name</th>
                  <th className="px-3 py-2 text-xs font-semibold text-text-secondary">Email</th>
                  <th className="px-3 py-2 text-xs font-semibold text-text-secondary text-right">EMPID</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {store.members.map((m: EmpidRosterMember) =>
                  renderRow(
                    {
                      user_id: m.user_id,
                      name: m.full_name,
                      email: m.email,
                      empid: m.empid,
                      dormant: !m.is_work_assignment,
                    },
                    false,
                  ),
                )}
                {addedHere.map((a) => {
                  const u = usersById.get(a.user_id);
                  return renderRow(
                    {
                      user_id: a.user_id,
                      name: u ? u.full_name || u.username : a.user_id,
                      email: u?.email ?? null,
                      empid: null,
                      dormant: false,
                    },
                    true,
                  );
                })}
                {store.members.length === 0 && addedHere.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-3 py-6 text-center text-sm text-text-muted">
                      No members in this store yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Add person ── */}
        {store && (
          <div className="flex items-end gap-2 flex-wrap border-t border-border pt-3">
            <div className="w-64">
              <Select
                aria-label="Add person"
                options={[
                  { value: "", label: "Add person…" },
                  ...candidates.map((u) => ({
                    value: u.id,
                    label: `${u.full_name || u.username}${u.email ? ` (${u.email})` : ""}`,
                  })),
                ]}
                value={addUserId}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  setAddUserId(e.target.value)
                }
              />
            </div>
            <input
              type="text"
              inputMode="numeric"
              aria-label="EMPID for new person"
              value={addEmpid}
              onChange={(e) => setAddEmpid(e.target.value)}
              placeholder="EMPID"
              className="w-36 px-2 py-1.5 rounded-lg bg-surface border border-border text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/20"
            />
            <Button variant="secondary" size="sm" onClick={handleAdd} disabled={!addUserId}>
              <Plus size={14} />
              Add
            </Button>
          </div>
        )}

        {/* ── Warnings + actions ── */}
        {dupKeys.size > 0 && (
          <p className="text-xs text-danger">
            Duplicate draft numbers in {dupStoreNames.join(", ")} — each member needs a unique
            number per store.
          </p>
        )}
        {invalidCount > 0 && (
          <p className="text-xs text-danger">Numbers must be whole numbers of 1 or more.</p>
        )}
        {missingNewCount > 0 && (
          <p className="text-xs text-danger">
            Number required for new assignment — enter an EMPID for each NEW row.
          </p>
        )}
        {otherStoreCount > 0 && (
          <p className="text-xs text-text-muted">
            Includes {otherStoreCount} pending change(s) in other stores.
          </p>
        )}

        <div className="flex items-center gap-2 border-t border-border pt-3">
          <Button
            variant="primary"
            onClick={() => void save()}
            isLoading={commit.isPending}
            disabled={!canSave}
          >
            Save changes ({changes.length})
          </Button>
          <Button variant="ghost" onClick={reset} disabled={changes.length === 0}>
            Reset
          </Button>
        </div>
      </div>
    </div>
  );
}
