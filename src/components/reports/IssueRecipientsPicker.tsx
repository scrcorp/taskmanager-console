"use client";

/**
 * Issue 알림 수신자 표시 (작성 + 수정 공용).
 *
 * 2차 규칙: 알림 대상 = (그 매장에 배정된 GM 이상 전원) ∪ (지목해 추가한 사람).
 * - 자동 수신자(GM+)는 **해제할 수 없다.** 잠긴 칩으로만 보여준다.
 * - 추가한 사람만 X 로 뺄 수 있다. 추가는 위쪽 "Who can see this report" 목록에서 한다
 *   (추가 = 조회권 + 알림이라 한 곳에서만 고르게 한다).
 *
 * 스냅샷이 아니라 '추가 목록'만 저장하므로, 나중에 부임한 GM 도 자동으로 수신자가 된다.
 */

import React, { useMemo } from "react";
import { Lock, X } from "lucide-react";

import { useIssueRecipients } from "@/hooks/useReports";
import { useUsers } from "@/hooks/useUsers";
import { describeApiError } from "@/lib/errorDisplay";
import { LoadingSpinner } from "@/components/ui";
import type { IssueRecipientItem, User } from "@/types";

/** DB role name 원문 → 화면 라벨. 커스텀 role 은 원문을 사람이 읽게 다듬어 표시. */
const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  general_manager: "General Manager",
  supervisor: "Supervisor",
  staff: "Staff",
};

export function formatRoleLabel(roleName: string | null | undefined): string {
  if (!roleName) return "—";
  return (
    ROLE_LABELS[roleName] ??
    roleName
      .split("_")
      .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
      .join(" ")
  );
}

export function IssueRecipientsPicker({
  storeId,
  reportId,
  addedUserIds,
  onAddedChange,
}: {
  storeId: string | null;
  /** 수정 화면에서만 전달. 없으면 후보 목록 모드. */
  reportId?: string;
  addedUserIds: string[];
  onAddedChange: (next: string[]) => void;
}): React.ReactElement {
  const {
    data: recipients,
    isLoading,
    error,
  } = useIssueRecipients(storeId, reportId, !!storeId || !!reportId);

  const { data: storeUsers } = useUsers(
    storeId ? { store_id: storeId, is_active: true } : undefined,
  );

  // 자동 수신자 — 서버가 role_priority → 이름 순으로 정렬해서 준다.
  const autoItems: IssueRecipientItem[] = useMemo(
    () => (recipients?.items ?? []).filter((i) => i.source === "auto"),
    [recipients],
  );
  const autoIds = useMemo(
    () => new Set(autoItems.map((i) => i.user_id)),
    [autoItems],
  );

  // 추가 인원 이름 — 저장 전에는 서버 응답에 없으므로 매장 직원 목록에서 찾는다.
  const userById = useMemo(() => {
    const map = new Map<string, { name: string; role: string }>();
    (storeUsers ?? []).forEach((u: User) => {
      map.set(u.id, {
        name: u.full_name ?? u.username,
        role: formatRoleLabel(u.role_name),
      });
    });
    (recipients?.items ?? []).forEach((i) => {
      if (!map.has(i.user_id)) {
        map.set(i.user_id, {
          name: i.full_name,
          role: formatRoleLabel(i.role_label),
        });
      }
    });
    return map;
  }, [storeUsers, recipients]);

  const removeAdded = (userId: string) => {
    onAddedChange(addedUserIds.filter((id) => id !== userId));
  };

  // 자동 수신자와 겹치는 추가 인원은 중복으로 보이지 않게 접는다(어차피 항상 받는다).
  const extraOnlyIds = useMemo(
    () => addedUserIds.filter((id) => !autoIds.has(id)),
    [addedUserIds, autoIds],
  );

  if (!storeId && !reportId) {
    return (
      <p className="text-xs text-textMuted italic">
        Select a store first to see who will be notified.
      </p>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-xs text-textMuted">
        <LoadingSpinner size="sm" /> Loading recipients…
      </div>
    );
  }

  if (error) {
    const failure = describeApiError(error, {
      context: "load",
      fallback: "Couldn't load the recipient list.",
    });
    return (
      <div className="border border-danger/40 bg-dangerMuted rounded-md p-3 text-sm text-danger">
        <div className="font-medium">{failure.message}</div>
        <p className="text-xs mt-1">
          {failure.hint ??
            "Reload the page to try again. You can still submit — General Managers and above at this store are notified either way."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="border border-border rounded-md bg-surface divide-y divide-border">
        {autoItems.length === 0 && extraOnlyIds.length === 0 && (
          <p className="text-xs text-textMuted italic px-3 py-3">
            No General Manager or above is assigned to this store, so no one is
            notified automatically. Add someone above if they should hear about
            this.
          </p>
        )}

        {autoItems.map((item) => (
          <div
            key={item.user_id}
            className="flex items-center gap-2 px-3 py-2 text-sm"
          >
            <Lock className="w-3.5 h-3.5 text-textMuted shrink-0" />
            <span className="text-text">{item.full_name}</span>
            <span className="text-xs text-textMuted">
              ({formatRoleLabel(item.role_label)})
            </span>
            <span className="ml-auto text-[11px] uppercase tracking-wide text-textMuted">
              Always notified
            </span>
          </div>
        ))}

        {extraOnlyIds.map((userId) => {
          const info = userById.get(userId);
          return (
            <div
              key={userId}
              className="flex items-center gap-2 px-3 py-2 text-sm"
            >
              <span className="text-text">{info?.name ?? "Selected person"}</span>
              {info?.role && (
                <span className="text-xs text-textMuted">({info.role})</span>
              )}
              <span className="ml-auto flex items-center gap-2">
                <span className="text-[11px] uppercase tracking-wide text-accent">
                  Added
                </span>
                <button
                  type="button"
                  onClick={() => removeAdded(userId)}
                  className="text-textMuted hover:text-danger"
                  aria-label="Remove recipient"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </span>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-textMuted">
        General Managers and above at this store are always notified and cannot
        be removed. Widening the visibility scope above does not notify anyone —
        only the people listed here get an email.
      </p>
    </div>
  );
}
