"use client";

/**
 * 조회 범위 미리보기 — 지금 고른 범위에서 실제로 누가 이 리포트를 볼 수 있는지.
 *
 * - 범위(default / managers)는 서버가 사람 목록(mode="list")을 계산해서 준다.
 *   scope 가 queryKey 에 있어 범위를 바꾸면 즉시 다시 조회한다.
 * - store_all 은 인원이 많아 목록을 만들지 않는다(mode="summary") — 요약 문구 + 인원 수만.
 * - 목록 아래에서 사람을 추가하면 payload.extra_viewers.user_ids 로 나간다
 *   (조회권 + 알림을 함께 받는다).
 *
 * 저장 전 편집 상태는 **클라에서 합친다**: 서버 응답은 저장된 payload 기준이라
 * 방금 추가한 사람은 없고 방금 뺀 사람은 남아 있다. 그대로 그리면 화면이 거짓말을 한다.
 * (서버 재조회로 처리하지 않는 이유: extra_user_ids 를 안 보내면 저장값 폴백,
 *  빈 배열은 "미지정" 과 구분되지 않아 '전부 제거' 를 표현할 수 없다.)
 */

import React, { useMemo, useState } from "react";
import { Plus, X } from "lucide-react";

import { useIssueViewers } from "@/hooks/useReports";
import { useUsers } from "@/hooks/useUsers";
import { describeApiError } from "@/lib/errorDisplay";
import { LoadingSpinner } from "@/components/ui";
import { formatRoleLabel } from "@/components/reports/IssueRecipientsPicker";
import type { IssueViewerItem, IssueVisibilityScope, User } from "@/types";

/** 서버가 준 reason_label 을 그대로 쓴다. 없을 때만 코드에서 문구를 만든다. */
function describeReason(item: IssueViewerItem): string {
  if (item.reason_label && item.reason_label.trim()) {
    return item.reason_label.trim();
  }
  switch (item.reason) {
    case "author":
      return "Author";
    case "gm_or_above":
      return "GM or above at this store";
    case "store_manager":
      return "Manager of this store";
    case "added":
      return "Added by the author";
    default:
      return item.reason ? item.reason.replace(/_/g, " ") : "Included by scope";
  }
}

export function IssueViewersPreview({
  storeId,
  reportId,
  scope,
  addedUserIds,
  onAddedChange,
}: {
  storeId: string | null;
  /** 수정 화면에서만 전달. */
  reportId?: string;
  scope: IssueVisibilityScope;
  addedUserIds: string[];
  onAddedChange: (next: string[]) => void;
}): React.ReactElement {
  const [addOpen, setAddOpen] = useState(false);
  const [search, setSearch] = useState("");

  const hasTarget = !!storeId || !!reportId;

  const { data, isLoading, error } = useIssueViewers(
    storeId,
    scope,
    reportId,
    hasTarget,
  );

  const { data: storeUsers } = useUsers(
    storeId ? { store_id: storeId, is_active: true } : undefined,
  );

  /**
   * 서버 목록 + 로컬 편집 반영.
   * - reason="added" 인데 지금 추가 목록에 없는 사람 = 방금 뺀 사람 → 제외.
   *   (GM/manager/author 로도 들어온 사람은 reason 이 그쪽이라 그대로 남는다 — 정확하다)
   */
  const items: IssueViewerItem[] = useMemo(() => {
    const raw = Array.isArray(data?.items) ? data.items : [];
    return raw.filter(
      (i) =>
        !!i &&
        !!i.user_id &&
        (i.reason !== "added" || addedUserIds.includes(i.user_id)),
    );
  }, [data, addedUserIds]);

  const listedIds = useMemo(
    () => new Set(items.map((i) => i.user_id)),
    [items],
  );

  // 아직 저장 전이라 서버 목록에 없는 '추가한 사람' 은 매장 직원 목록에서 이름을 찾는다.
  const userById = useMemo(() => {
    const map = new Map<string, { name: string; role: string }>();
    (storeUsers ?? []).forEach((u: User) => {
      map.set(u.id, {
        name: u.full_name ?? u.username,
        role: formatRoleLabel(u.role_name),
      });
    });
    return map;
  }, [storeUsers]);

  const pendingAdded = useMemo(
    () => addedUserIds.filter((id) => !listedIds.has(id)),
    [addedUserIds, listedIds],
  );

  const addUser = (userId: string) => {
    if (addedUserIds.includes(userId)) return;
    onAddedChange([...addedUserIds, userId]);
    setSearch("");
    setAddOpen(false);
  };

  const removeAdded = (userId: string) => {
    onAddedChange(addedUserIds.filter((id) => id !== userId));
  };

  const addableUsers: User[] = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (storeUsers ?? [])
      .filter(
        (u) =>
          !addedUserIds.includes(u.id) &&
          (q === "" ||
            (u.full_name ?? "").toLowerCase().includes(q) ||
            u.username.toLowerCase().includes(q)),
      )
      .sort((a, b) => {
        if (a.role_priority !== b.role_priority)
          return a.role_priority - b.role_priority;
        return (a.full_name ?? "").localeCompare(b.full_name ?? "");
      })
      .slice(0, 30);
  }, [storeUsers, addedUserIds, search]);

  /** 아직 저장되지 않은 '추가한 사람' 줄 — 목록/요약 어느 모드에서도 보여야 뺄 수 있다. */
  const pendingAddedRows = pendingAdded.map((userId) => {
    const info = userById.get(userId);
    return (
      <div key={userId} className="flex items-center gap-2 px-3 py-2 text-sm">
        <span className="text-text">{info?.name ?? "Selected person"}</span>
        {info?.role && (
          <span className="text-xs text-textMuted">({info.role})</span>
        )}
        <span className="ml-auto flex items-center gap-2">
          <span className="text-[11px] text-accent">Added by you</span>
          <button
            type="button"
            onClick={() => removeAdded(userId)}
            className="text-textMuted hover:text-danger"
            aria-label="Remove person"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </span>
      </div>
    );
  });

  const addControl = (
    <div>
      {addOpen ? (
        <div className="border border-border rounded-md bg-surface p-2 space-y-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search staff at this store…"
            className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-text"
            autoFocus
          />
          <div className="max-h-48 overflow-auto space-y-1">
            {addableUsers.length === 0 ? (
              <p className="text-xs text-textMuted italic px-2 py-1">
                No one else to add.
              </p>
            ) : (
              addableUsers.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => addUser(u.id)}
                  className="w-full text-left px-2 py-1.5 rounded text-sm text-text hover:bg-surfaceHover flex items-center gap-2"
                >
                  <span>{u.full_name ?? u.username}</span>
                  <span className="text-xs text-textMuted">
                    ({formatRoleLabel(u.role_name)})
                  </span>
                </button>
              ))
            )}
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => {
                setAddOpen(false);
                setSearch("");
              }}
              className="text-xs text-textMuted hover:text-text px-2 py-1"
            >
              Done
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          disabled={!storeId}
          className="inline-flex items-center gap-1.5 text-sm text-accent hover:opacity-80 disabled:opacity-40"
        >
          <Plus className="w-4 h-4" />
          Add someone else
        </button>
      )}
      <p className="text-xs text-textMuted mt-2">
        People you add can open this report and are notified by email.
      </p>
    </div>
  );

  if (!hasTarget) {
    return (
      <p className="text-xs text-textMuted italic">
        Select a store first to see who will be able to open this report.
      </p>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-xs text-textMuted">
        <LoadingSpinner size="sm" /> Loading who can see this…
      </div>
    );
  }

  // 실패는 실패로 보여준다 — 빈 목록으로 떨어지면 "아무도 못 본다" 로 읽힌다.
  if (error || !data) {
    const failure = describeApiError(error, {
      context: "load",
      fallback: "Couldn't load the list of people who can see this report.",
    });
    return (
      <div className="space-y-3">
        <div className="border border-danger/40 bg-dangerMuted rounded-md p-3 text-sm text-danger">
          <div className="font-medium">{failure.message}</div>
          <p className="text-xs mt-1">
            {failure.hint ??
              "This list couldn't be loaded — it does not mean nobody can see the report. Reload the page to try again; the scope you picked is applied either way."}
          </p>
        </div>
        {pendingAdded.length > 0 && (
          <div className="border border-border rounded-md bg-surface divide-y divide-border">
            {pendingAddedRows}
          </div>
        )}
        {addControl}
      </div>
    );
  }

  // store_all — 서버가 목록 대신 요약만 준다 (mode="summary").
  if (data.mode === "summary") {
    return (
      <div className="space-y-3">
        <div className="border border-border rounded-md bg-surface px-3 py-3">
          <p className="text-sm text-text">
            {data.summary?.label ?? "Everyone assigned to this store"}
            {typeof data.summary?.count === "number" && (
              <span className="text-textMuted"> · {data.summary.count} people</span>
            )}
          </p>
          <p className="text-xs text-textMuted mt-1">
            Too many people to list individually. Anyone currently assigned to
            this store can open the report.
          </p>
        </div>
        {pendingAdded.length > 0 && (
          <div className="border border-border rounded-md bg-surface divide-y divide-border">
            {pendingAddedRows}
          </div>
        )}
        {addControl}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="border border-border rounded-md bg-surface divide-y divide-border">
        {items.length === 0 && pendingAdded.length === 0 ? (
          <p className="text-xs text-textMuted italic px-3 py-3">
            No one is listed for this scope yet. Add people below if someone
            should be able to open it.
          </p>
        ) : (
          items.map((item) => {
            const added = item.reason === "added";
            return (
              <div
                key={item.user_id}
                className="flex items-center gap-2 px-3 py-2 text-sm"
              >
                <span className="text-text">
                  {item.full_name ||
                    userById.get(item.user_id)?.name ||
                    "Staff member"}
                </span>
                <span className="text-xs text-textMuted">
                  ({formatRoleLabel(item.role_label)})
                </span>
                <span className="ml-auto flex items-center gap-2">
                  <span
                    className={`text-[11px] ${added ? "text-accent" : "text-textMuted"}`}
                  >
                    {describeReason(item)}
                  </span>
                  {added && (
                    <button
                      type="button"
                      onClick={() => removeAdded(item.user_id)}
                      className="text-textMuted hover:text-danger"
                      aria-label="Remove person"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </span>
              </div>
            );
          })
        )}

        {/* 아직 저장되지 않아 서버 목록에 없는 추가 인원. */}
        {pendingAddedRows}
      </div>

      {addControl}
    </div>
  );
}
