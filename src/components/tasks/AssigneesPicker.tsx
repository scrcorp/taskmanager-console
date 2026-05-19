"use client";

/**
 * Task Assignees picker — task 전용 (LinkPicker 와 분리).
 *
 * - 필수 입력: task 는 누군가가 책임지고 처리해야 함.
 * - role chip 매크로 (Owner/GM/SV/Staff/All) — 클릭 시 그 role 의 user 들을
 *   assignees 에 일괄 추가/제거.
 * - 이름/role 검색 + 체크박스 list.
 *
 * 데이터 schema 는 issue report 의 related_user_ids / related_roles 와 동일하게
 * 호환되어 prefill 흐름이 자연스럽게 동작.
 */

import React, { useMemo, useState } from "react";
import { Search, UserCircle2, Users } from "lucide-react";

import { useUsers } from "@/hooks/useUsers";
import { LoadingSpinner } from "@/components/ui";
import { ROLE_PRIORITY } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import type { User } from "@/types";

export interface AssigneesValue {
  user_ids: string[];
  roles: string[]; // role chip 매크로 (owner/gm/sv/staff/all)
}

interface RoleChip {
  key: string;
  label: string;
  match: (u: User) => boolean;
}

const ROLE_CHIPS: RoleChip[] = [
  { key: "owner", label: "Owner", match: (u) => u.role_priority === ROLE_PRIORITY.OWNER },
  { key: "gm", label: "GM", match: (u) => u.role_priority === ROLE_PRIORITY.GM },
  { key: "sv", label: "SV", match: (u) => u.role_priority === ROLE_PRIORITY.SV },
  { key: "staff", label: "Staff", match: (u) => u.role_priority === ROLE_PRIORITY.STAFF },
  { key: "all", label: "All", match: () => true },
];

export function AssigneesPicker({
  storeIds,
  orgWide,
  value,
  onChange,
  required = true,
}: {
  storeIds: string[];
  orgWide: boolean;
  value: AssigneesValue;
  onChange: (next: AssigneesValue) => void;
  required?: boolean;
}): React.ReactElement {
  // org-wide: filter 없이 전체 user. multi-store: 여러 store union. 둘 다 아니면 disabled.
  const usersFilter = orgWide
    ? { is_active: true }
    : storeIds.length > 0
    ? { store_ids: storeIds, is_active: true }
    : undefined;
  const { data: storeUsers, isLoading } = useUsers(usersFilter);
  const [query, setQuery] = useState("");

  const sortedUsers: User[] = useMemo(() => {
    if (!storeUsers) return [];
    return [...storeUsers].sort((a, b) => {
      if (a.role_priority !== b.role_priority) return a.role_priority - b.role_priority;
      return (a.full_name ?? "").localeCompare(b.full_name ?? "");
    });
  }, [storeUsers]);

  const filteredUsers = useMemo(() => {
    if (!query.trim()) return sortedUsers;
    const q = query.toLowerCase();
    return sortedUsers.filter((u) =>
      [u.full_name, u.username, u.role_name].some(
        (s) => typeof s === "string" && s.toLowerCase().includes(q),
      ),
    );
  }, [sortedUsers, query]);

  if (!orgWide && storeIds.length === 0) {
    return (
      <p className="text-xs text-textMuted italic">
        Pick at least one store (or set org-wide) to choose assignees.
      </p>
    );
  }

  const toggleUser = (uid: string) => {
    const has = value.user_ids.includes(uid);
    onChange({
      ...value,
      user_ids: has
        ? value.user_ids.filter((x) => x !== uid)
        : [...value.user_ids, uid],
    });
  };

  const toggleRole = (chip: RoleChip) => {
    const has = value.roles.includes(chip.key);
    const matchedIds = sortedUsers.filter(chip.match).map((u) => u.id);
    let nextRoles: string[];
    let nextUserIds: string[];
    if (has) {
      nextRoles = value.roles.filter((x) => x !== chip.key);
      const stillCovered = (uid: string): boolean => {
        for (const r of nextRoles) {
          const other = ROLE_CHIPS.find((c) => c.key === r);
          if (!other) continue;
          const u = sortedUsers.find((x) => x.id === uid);
          if (u && other.match(u)) return true;
        }
        return false;
      };
      nextUserIds = value.user_ids.filter(
        (uid) => !matchedIds.includes(uid) || stillCovered(uid),
      );
    } else {
      nextRoles = [...value.roles, chip.key];
      nextUserIds = [...value.user_ids];
      matchedIds.forEach((id) => {
        if (!nextUserIds.includes(id)) nextUserIds.push(id);
      });
    }
    onChange({ user_ids: nextUserIds, roles: nextRoles });
  };

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="text-sm font-semibold text-text flex items-center gap-1.5">
          <UserCircle2 className="w-4 h-4 text-accent" />
          Assignees
          {required && <span className="text-danger text-xs">*</span>}
          <span className="text-textMuted text-xs font-normal">
            · who handles this task
          </span>
        </h3>
        <span className="text-xs text-textMuted">
          {value.user_ids.length} selected
        </span>
      </div>

      {/* Quick add by role */}
      <div>
        <div className="text-[11px] uppercase tracking-wide text-textSecondary mb-1.5 flex items-center gap-1">
          <Users className="w-3 h-3 text-warning" />
          Quick add
        </div>
        <div className="flex flex-wrap gap-2">
          {ROLE_CHIPS.map((c) => {
            const active = value.roles.includes(c.key);
            const count = sortedUsers.filter(c.match).length;
            return (
              <button
                key={c.key}
                type="button"
                onClick={() => toggleRole(c)}
                disabled={count === 0}
                className={cn(
                  "px-3 py-1 text-xs rounded-full border transition-colors",
                  count === 0
                    ? "bg-surface text-textMuted border-border opacity-50 cursor-not-allowed"
                    : active
                    ? "bg-accent text-white border-accent"
                    : "bg-surface text-text border-border hover:border-accent/40",
                )}
                title={
                  count === 0
                    ? "No staff with this role"
                    : `${count} ${count === 1 ? "person" : "people"}`
                }
              >
                {c.label}
                {count > 0 && <span className="ml-1 opacity-70">·{count}</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Search + list */}
      <div>
        <div className="relative mb-2">
          <Search
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-textMuted"
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name or role"
            className="w-full text-sm pl-8 pr-3 py-2 bg-surface border border-border rounded-md text-text placeholder:text-textMuted focus:outline-none focus:border-accent"
          />
        </div>
        {isLoading ? (
          <LoadingSpinner size="sm" />
        ) : filteredUsers.length === 0 ? (
          <p className="text-xs text-textMuted italic py-2">
            {query ? "No staff match your search." : "No staff for this store."}
          </p>
        ) : (
          <div className="border border-border rounded-md p-2 max-h-64 overflow-auto space-y-1 bg-surface">
            {filteredUsers.map((u) => {
              const checked = value.user_ids.includes(u.id);
              return (
                <label
                  key={u.id}
                  className="flex items-center gap-2 text-sm cursor-pointer hover:bg-surfaceHover px-2 py-1.5 rounded"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleUser(u.id)}
                    className="accent-accent"
                  />
                  <span className="text-text">{u.full_name ?? u.username}</span>
                  <span className="text-xs text-textMuted">· {u.role_name}</span>
                </label>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
