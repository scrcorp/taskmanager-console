"use client";

/**
 * EMPID Edit — 파일 없이 매장별 empid 를 직접 추가/삭제/수정하는 bulk 에디터.
 * roster(GET /console/empid-import/roster) 를 매장 select + 멤버 테이블로 표시,
 * 변경은 로컬 draft 에 쌓아 useCommitEmpidImport 로 일괄 커밋 (empid null = 번호 삭제).
 */

import React, { Suspense, useState, useMemo, useCallback } from "react";
import { useSearchParams } from "next/navigation";
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
import { useStores } from "@/hooks/useStores";
import { useStoreGroups } from "@/hooks/useStoreGroups";
import { EmpidCommitSummary } from "@/components/users/EmpidCommitSummary";
import type { EmpidKind, EmpidKindFields, Store, StoreGroup, User } from "@/types";
import { displayName } from "@/lib/staffLabel";

/**
 * 채번 계약(§3-4·§3-6)으로 넓어진 요청/응답 모양. roster/commit 훅 타입은 다른
 * 트랙이 소유하고 있어 여기서 얹어 쓴다 — 필드 이름은 계약 그대로다.
 *
 * Contract-widened shapes; the hook types are owned by another track, so they
 * are intersected here with the exact contract field names.
 */
type RosterMember = EmpidRosterMember & {
  /** 번호 구분 (§3-6) — 없으면 sequence / Number kind; absent = sequence */
  empid_kind?: EmpidKind;
};
type CommitAssignment = EmpidCommitAssignment & EmpidKindFields;
type CommitResult = EmpidCommitResult & {
  exception_count?: number;
  cursor_after?: Record<string, number>;
};

/** 번호 구분 — 서버가 안 주면 계약 기본값 sequence (INV-6). */
const kindOf = (m: EmpidRosterMember): EmpidKind =>
  (m as RosterMember).empid_kind ?? "sequence";

/** 구분 필터 — 조용한 컬럼이지 경고가 아니다 (a column, not a warning). */
type KindFilter = "all" | EmpidKind;

/** 구분 라벨 (English UI labels for the kind column). */
const KIND_LABEL: Record<EmpidKind, string> = {
  sequence: "Sequence",
  exception: "Exception",
};

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
  /** 커밋할 번호 구분 (Kind to commit) */
  empid_kind: EmpidKind;
  isNew: boolean;
  /** Raw input is neither empty nor a whole number ≥ 1. */
  invalid: boolean;
}

function EmpidEditPageBody(): React.ReactElement {
  const { hasPermission } = usePermissions();
  const canUpdate = hasPermission(PERMISSIONS.USERS_UPDATE);
  const modal = useModal();
  const queryClient: QueryClient = useQueryClient();
  const searchParams = useSearchParams();
  const { data: rosterData, isLoading } = useEmpidRoster();
  const { data: usersData } = useUsers();
  // 커서(numbering.next_empid)와 스코프 이름 — 판정은 서버가 하고 여기선 비교/표시만
  const { data: storesData } = useStores();
  const { data: groupsData } = useStoreGroups();
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

  // ── Store selection — ?store= 프리셀렉트 (stores 페이지 EMPIDs 링크 진입점),
  // roster 에 없는 값이면 첫 매장으로 폴백 / URL param preselects; unknown ids fall back ──
  const [storeSel, setStoreSel] = useState(searchParams.get("store") ?? "");
  const storeId =
    storeSel && roster.some((s) => s.store_id === storeSel)
      ? storeSel
      : roster[0]?.store_id || "";
  const store = roster.find((s) => s.store_id === storeId);

  // ── Draft — raw input strings keyed by store|user; added people tracked separately ──
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [added, setAdded] = useState<{ store_id: string; user_id: string }[]>([]);
  const [result, setResult] = useState<CommitResult | null>(null);
  /** 구분 변경 초안 — store|user → kind (Kind draft per row). */
  const [kindDraft, setKindDraft] = useState<Record<string, EmpidKind>>({});
  /** 목록 필터 — 구분별로 좁혀 본다 (quiet column filter). */
  const [kindFilter, setKindFilter] = useState<KindFilter>("all");

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

  /** 구분 선택 — 현재 값과 같으면 초안에서 뺀다 (kind pick; same value clears). */
  const setKindDraftValue = useCallback(
    (k: string, value: EmpidKind, current: EmpidKind) => {
      setKindDraft((prev) => {
        const n = { ...prev };
        if (value === current) delete n[k];
        else n[k] = value;
        return n;
      });
    },
    [],
  );

  const removeAdded = useCallback((sid: string, uid: string) => {
    setAdded((prev) => prev.filter((a) => !(a.store_id === sid && a.user_id === uid)));
    setDraft((prev) => {
      const n = { ...prev };
      delete n[keyOf(sid, uid)];
      return n;
    });
    setKindDraft((prev) => {
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
      kind: EmpidKind,
    ): void => {
      const t = raw.trim();
      const valid = /^\d+$/.test(t) && parseInt(t, 10) >= 1;
      out.push({
        store_id: s.store_id,
        store_name: s.store_name,
        user_id: userId,
        empid: valid ? parseInt(t, 10) : null,
        empid_kind: kind,
        isNew,
        invalid: t !== "" && !valid,
      });
    };
    roster.forEach((s) => {
      s.members.forEach((m) => {
        const k = keyOf(s.store_id, m.user_id);
        const v = draft[k];
        const current = kindOf(m);
        const numberChanged = v !== undefined && !isSameAsCurrent(v, m.empid);
        // 구분만 바꾼 행도 변경이다 — 번호는 현재 값 그대로 다시 보낸다
        const kindChanged =
          kindDraft[k] !== undefined && kindDraft[k] !== current;
        if (!numberChanged && !kindChanged) return;
        const raw = numberChanged
          ? (v as string)
          : m.empid !== null
            ? String(m.empid)
            : "";
        push(s, m.user_id, raw, false, kindDraft[k] ?? current);
      });
    });
    added.forEach((a) => {
      const s = roster.find((r) => r.store_id === a.store_id);
      if (!s) return;
      const k = keyOf(a.store_id, a.user_id);
      push(s, a.user_id, draft[k] ?? "", true, kindDraft[k] ?? "sequence");
    });
    return out;
  }, [roster, draft, added, kindDraft]);

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
    setKindDraft({});
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

  /**
   * 매장의 현재 커서 — 서버가 매장/그룹 응답에 실어 준 numbering.next_empid.
   * 커서가 안 오면(구버전 서버) 이탈 판정을 하지 않는다.
   *
   * The store's current cursor, straight from the server. No cursor = no check.
   */
  const cursorFor = useCallback(
    (sid: string): number | null => {
      const stores: Store[] = Array.isArray(storesData) ? storesData : [];
      return stores.find((x) => x.id === sid)?.numbering?.next_empid ?? null;
    },
    [storesData],
  );

  /** 확인창에 쓸 사람 이름 (Display name for the confirm dialog). */
  const nameOf = useCallback(
    (sid: string, uid: string): string => {
      const member = roster
        .find((r) => r.store_id === sid)
        ?.members.find((m) => m.user_id === uid);
      if (member) return member.full_name;
      const u = usersById.get(uid);
      return u ? displayName(u) : uid;
    },
    [roster, usersById],
  );

  /**
   * 커밋 응답 cursor_after 의 스코프 id → 이름 (그룹 커서일 수도, 매장일 수도).
   * Resolve a cursor scope id (group or store) to a display name.
   */
  const scopeName = useCallback(
    (id: string): string | undefined => {
      const stores: Store[] = Array.isArray(storesData) ? storesData : [];
      const groups: StoreGroup[] = Array.isArray(groupsData) ? groupsData : [];
      return (
        stores.find((st) => st.id === id)?.name ??
        groups.find((g) => g.id === id)?.name
      );
    },
    [storesData, groupsData],
  );

  const save = useCallback(async () => {
    if (!canSave) return;
    const storeCount = new Set(changes.map((c) => c.store_id)).size;
    const base =
      `${changes.length} change(s) across ${storeCount} store(s). ` +
      "Existing numbers may be renumbered to make room; empty values release the number.";

    // RULE-D — 서버가 준 커서와 다른 값을 직접 기입하면 확인 + 사유. 다음 번호를
    // 콘솔이 계산하지 않는다(INV-8): numbering.next_empid 와 비교만 한다.
    const offSequence = changes.filter((c) => {
      if (c.empid === null || c.invalid) return false;
      const cursor = cursorFor(c.store_id);
      return cursor !== null && c.empid !== cursor;
    });

    let reason: string | undefined;
    if (offSequence.length > 0) {
      const lines = offSequence
        .slice(0, 8)
        .map(
          (c) =>
            `· ${nameOf(c.store_id, c.user_id)} — ${c.store_name}: ${c.empid}` +
            ` (next EMPID ${cursorFor(c.store_id)})`,
        )
        .join("\n");
      const more =
        offSequence.length > 8 ? `\n· and ${offSequence.length - 8} more` : "";
      const answer = await modal.confirm({
        title: `Save ${changes.length} change(s)?`,
        message:
          `${offSequence.length} number(s) are not the next EMPID for their store:\n` +
          `${lines}${more}\n\n` +
          "Saving keeps the next EMPID where it is. Set the kind to Exception on " +
          "rows that should stay out of the sequence.\n\n" +
          base,
        confirmLabel: "Save",
        variant: "warning",
        requiresReason: true,
        reasonMandatory: true,
        reasonLabel: "Reason",
      });
      if (!answer) return;
      reason = answer;
    } else {
      const ok = await modal.confirm({
        title: `Save ${changes.length} change(s)?`,
        message: base,
        confirmLabel: "Save",
        variant: "warning",
      });
      if (!ok) return;
    }

    const offKeys = new Set(
      offSequence.map((c) => keyOf(c.store_id, c.user_id)),
    );
    const assignments: CommitAssignment[] = changes.map((c) => ({
      user_id: c.user_id,
      store_id: c.store_id,
      empid: c.empid,
      empid_kind: c.empid_kind,
      // 사유는 이탈값을 기입한 행에만 붙인다 (§3-4 reason)
      ...(reason && offKeys.has(keyOf(c.store_id, c.user_id))
        ? { reason }
        : {}),
    }));
    commit.mutate(
      { assignments },
      {
        onSuccess: (data) => {
          setResult(data);
          reset();
          void queryClient.invalidateQueries({ queryKey: ["empid-roster"] });
          // 결과 패널은 페이지 상단 — 긴 로스터 하단에서 저장해도 보이게 스크롤 (QA 발견)
          requestAnimationFrame(() => {
            window.scrollTo({ top: 0, behavior: "smooth" });
          });
        },
        // hook shows the error modal
      },
    );
  }, [canSave, changes, modal, commit, reset, queryClient, cursorFor, nameOf]);

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
    .sort((a, b) => (displayName(a)).localeCompare(displayName(b)));

  // ── 구분(kind) 카운트 · 필터 — 선택된 매장 기준. 경고가 아니라 조용한 분류다 ──
  const members: EmpidRosterMember[] = store?.members ?? [];
  const kindCounts = {
    all: members.length,
    sequence: members.filter((m) => m.empid !== null && kindOf(m) === "sequence")
      .length,
    exception: members.filter(
      (m) => m.empid !== null && kindOf(m) === "exception",
    ).length,
  };
  const visibleMembers = members.filter(
    (m) =>
      kindFilter === "all" || (m.empid !== null && kindOf(m) === kindFilter),
  );
  const KIND_FILTERS: { value: KindFilter; label: string; count: number }[] = [
    { value: "all", label: "All", count: kindCounts.all },
    { value: "sequence", label: "Sequence", count: kindCounts.sequence },
    { value: "exception", label: "Exception", count: kindCounts.exception },
  ];

  const inputClass = (changed: boolean, bad: boolean): string =>
    `w-24 px-2 py-1 rounded-lg bg-surface border text-sm text-text text-right focus:outline-none focus:ring-2 focus:ring-accent/20 ${
      bad ? "border-danger" : changed ? "border-accent" : "border-border"
    }`;

  const renderRow = (
    m: {
      user_id: string;
      name: string;
      email: string | null;
      empid: number | null;
      dormant: boolean;
      /** 서버가 준 현재 구분 (Current kind from the server) */
      kind: EmpidKind;
    },
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
        {/* 구분 — 번호가 있는 행에서만 의미가 있다 (§1-2) */}
        <td className="px-3 py-2">
          <select
            aria-label={`Number kind for ${m.name}`}
            value={kindDraft[k] ?? m.kind}
            onChange={(e) =>
              setKindDraftValue(k, e.target.value as EmpidKind, m.kind)
            }
            disabled={t === ""}
            className={`px-2 py-1 rounded-md bg-surface border text-xs focus:outline-none focus:ring-2 focus:ring-accent/20 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ${
              kindDraft[k] !== undefined && kindDraft[k] !== m.kind
                ? "border-accent text-text"
                : "border-border text-text-secondary"
            }`}
          >
            <option value="sequence">{KIND_LABEL.sequence}</option>
            <option value="exception">{KIND_LABEL.exception}</option>
          </select>
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

          {/* 예외 제외 건수 + 저장 후 커서 (§3-4) — 값은 전부 서버가 준 것 */}
          <EmpidCommitSummary
            exceptionCount={result.exception_count}
            cursorAfter={result.cursor_after}
            scopeName={scopeName}
          />

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
          {/* 구분 필터 — 임포트 인원 대다수는 그냥 sequence 다. 조용한 분류. */}
          {store && (
            <div className="inline-flex items-center gap-1 ml-auto">
              {KIND_FILTERS.map((f) => (
                <button
                  key={f.value}
                  type="button"
                  onClick={() => setKindFilter(f.value)}
                  className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                    kindFilter === f.value
                      ? "border-accent bg-accent-muted text-accent font-semibold"
                      : "border-border text-text-secondary hover:bg-surface-hover"
                  }`}
                >
                  {f.label} {f.count}
                </button>
              ))}
            </div>
          )}
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
                  <th className="px-3 py-2 text-xs font-semibold text-text-secondary">Kind</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {visibleMembers.map((m: EmpidRosterMember) =>
                  renderRow(
                    {
                      user_id: m.user_id,
                      name: m.full_name,
                      email: m.email,
                      empid: m.empid,
                      dormant: !m.is_work_assignment,
                      kind: kindOf(m),
                    },
                    false,
                  ),
                )}
                {addedHere.map((a) => {
                  const u = usersById.get(a.user_id);
                  return renderRow(
                    {
                      user_id: a.user_id,
                      name: u ? displayName(u) : a.user_id,
                      email: u?.email ?? null,
                      empid: null,
                      dormant: false,
                      kind: "sequence",
                    },
                    true,
                  );
                })}
                {visibleMembers.length === 0 && addedHere.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-sm text-text-muted">
                      {members.length === 0
                        ? "No members in this store yet."
                        : "No members match this filter."}
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
                    label: `${displayName(u)}${u.email ? ` (${u.email})` : ""}`,
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

/** useSearchParams 는 Suspense 경계가 필요 — tasks/new 페이지와 동일 패턴 */
export default function EmpidEditPage(): React.ReactElement {
  return (
    <Suspense>
      <EmpidEditPageBody />
    </Suspense>
  );
}
