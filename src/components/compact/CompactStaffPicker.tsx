"use client";

/**
 * 담당 직원 선택 시트.
 *
 * 네이티브 `<select>` 는 매장 직원이 30명만 넘어가도 폰에서 스크롤 노동이 된다.
 * 이름·역할·EMPID 로 좁힐 수 있게 하고, 그날 이미 잡힌 근무를 배지로 미리 보여준다 —
 * 고르고 나서야 겹침 경고를 만나는 순서가 뒤집힌다.
 *
 * 목록은 이미 매장 스코프다 (`useUsers({ store_id })`). 여기서 추가로 좁히지 않는다.
 */

import { useMemo, useState } from "react";
import { Check, ChevronRight, Search, X } from "lucide-react";
import { useUsers } from "@/hooks/useUsers";
import { cn } from "@/lib/utils";
import { wallClock } from "@/lib/compactDay";
import type { Schedule, User } from "@/types";
import { searchHaystack } from "@/lib/staffLabel";
import { useSearchState } from "@/hooks/useSearchState";

function initials(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function CompactStaffPicker({
  storeId,
  currentUserId,
  daySchedules,
  onPick,
}: {
  storeId: string;
  currentUserId: string | null;
  /** 같은 날짜의 스케줄 — 이미 근무가 잡힌 사람을 표시하는 데만 쓴다. */
  daySchedules: Schedule[];
  onPick: (user: User | undefined) => void;
}) {
  const { data: users, isLoading } = useUsers({ store_id: storeId, is_active: true });
  // 검색 동작 통일. 이 화면은 역할·EMPID 로도 찾는다("Name, role or EMPID").
  const search = useSearchState({ delay: 0 });
  const query = search.committed;

  const busyByUser = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of daySchedules) {
      if (s.status === "cancelled" || s.status === "deleted" || s.status === "rejected") continue;
      const start = wallClock(s.start_at) ?? s.start_time;
      const end = wallClock(s.end_at) ?? s.end_time;
      if (start && end && !map.has(s.user_id)) map.set(s.user_id, `${start}–${end}`);
    }
    return map;
  }, [daySchedules]);

  const groups = useMemo(() => {
    const q = query.toLowerCase();
    const matched = (users ?? []).filter((u) => {
      if (!q) return true;
      return searchHaystack(u, { includeRole: true }).includes(q);
    });
    const byRole = new Map<string, User[]>();
    for (const u of matched) {
      const key = u.role_name || "Other";
      const list = byRole.get(key);
      if (list) list.push(u);
      else byRole.set(key, [u]);
    }
    return [...byRole.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([role, list]) => [role, list.sort((a, b) => a.full_name.localeCompare(b.full_name))] as const);
  }, [users, query]);

  const total = groups.reduce((n, [, list]) => n + list.length, 0);

  return (
    <div className="flex max-h-[70vh] flex-col px-1 pb-1">
      <div className="relative shrink-0 pb-2">
        <Search size={14} className="pointer-events-none absolute left-3 top-3.5 text-text-muted" />
        <input
          value={search.value}
          {...search.imeProps}
          onChange={search.onChange}
          placeholder="Name, role or EMPID"
          aria-label="Search staff"
          className="h-11 w-full rounded-lg border border-border bg-surface pl-9 pr-9 text-sm text-text focus:outline-none focus:ring-2 focus:ring-accent"
        />
        {query && (
          <button
            type="button"
            onClick={() => search.clear()}
            aria-label="Clear search"
            className="absolute right-2 top-2.5 flex h-6 w-6 items-center justify-center rounded-full bg-surface-hover text-text-secondary"
          >
            <X size={12} />
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {isLoading && <p className="py-8 text-center text-sm text-text-secondary">Loading staff…</p>}

        {!isLoading && total === 0 && (
          <p className="py-10 text-center text-sm text-text-secondary">
            No staff match that search.
          </p>
        )}

        {groups.map(([role, list]) => (
          <div key={role}>
            <div className="px-1 pb-1 pt-3 text-[11px] font-extrabold uppercase tracking-wide text-text-muted">
              {role}
            </div>
            <div className="space-y-1.5">
              {list.map((u) => {
                const current = u.id === currentUserId;
                const busy = busyByUser.get(u.id);
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => onPick(u)}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-colors active:bg-surface-hover",
                      current ? "border-accent bg-accent-muted" : "border-border bg-card",
                    )}
                  >
                    <span
                      className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-extrabold",
                        current ? "bg-accent text-white" : "bg-surface-hover text-text-secondary",
                      )}
                    >
                      {initials(u.full_name)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-text">{u.full_name}</span>
                      <span className="flex items-center gap-1.5">
                        {u.employee_no && (
                          <span className="text-xs text-text-secondary">EMPID {u.employee_no}</span>
                        )}
                        {busy && (
                          <span className="truncate rounded-full bg-warning-muted px-1.5 py-0.5 text-[10px] font-bold text-warning">
                            {busy} today
                          </span>
                        )}
                      </span>
                    </span>
                    {current ? (
                      <Check size={16} className="shrink-0 text-accent" />
                    ) : (
                      <ChevronRight size={15} className="shrink-0 text-text-muted" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
