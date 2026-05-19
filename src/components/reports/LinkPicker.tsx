"use client";

/**
 * 이슈 리포트 + 이슈(work item) 공용 Related Items picker.
 *
 * 단순화된 3섹션:
 *   - Related schedules — schedule + (1:1) checklist instance 통합 표시 (work_role / 시간 / 진행률)
 *   - Related people — 매장 user 개별 검색
 *   - Related role — staff / sv / gm / owner / all chip (issue 의 assignees 매크로 역할)
 *
 * 매장 컨텍스트(work_role / position) 가 매장마다 다르고 의미가 모호해, 현시점에서는
 * 시스템 role (priority) 만 chip 으로 노출. position/work_role 섹션은 schema 상
 * payload 에는 유지(backward-compat) 하지만 UI 에서는 안 보임.
 *
 * role chip 클릭은 매크로 — 그 role 의 user 들을 related_user_ids 에 toggle.
 */

import React, { useMemo, useState } from "react";
import {
  CalendarClock,
  Search,
  UserCircle2,
  Users,
  X,
} from "lucide-react";
import {
  useStoreSchedulesForLink,
  useStoreChecklistInstancesForLink,
} from "@/hooks/useReports";
import { useUsers } from "@/hooks/useUsers";
import { LoadingSpinner } from "@/components/ui";
import { DateField } from "@/components/ui/DateField";
import { ROLE_PRIORITY } from "@/lib/permissions";
import { cn, formatFixedDate } from "@/lib/utils";
import type { User } from "@/types";

export interface LinkValues {
  schedule_ids: string[];
  checklist_instance_ids: string[];
  position_ids: string[];
  work_role_ids: string[];
  related_user_ids: string[];
  related_roles: string[];
}

const formatHm = (t: string | null | undefined): string | null => {
  if (!t) return null;
  const m = /^(\d{2}:\d{2})/.exec(t);
  return m ? m[1] : t;
};

const joinWithDot = (parts: Array<string | null | undefined>): string =>
  parts.filter((p): p is string => !!p && p.trim() !== "").join(" · ");

// role chip 정의 — 표시 라벨 + role_name 매칭 함수.
interface RoleChip {
  key: string;
  label: string;
  match: (u: User) => boolean;
}

const ROLE_CHIPS: RoleChip[] = [
  {
    key: "owner",
    label: "Owner",
    match: (u) => u.role_priority === ROLE_PRIORITY.OWNER,
  },
  {
    key: "gm",
    label: "GM",
    match: (u) => u.role_priority === ROLE_PRIORITY.GM,
  },
  {
    key: "sv",
    label: "SV",
    match: (u) => u.role_priority === ROLE_PRIORITY.SV,
  },
  {
    key: "staff",
    label: "Staff",
    match: (u) => u.role_priority === ROLE_PRIORITY.STAFF,
  },
  {
    key: "all",
    label: "All",
    match: () => true,
  },
];

export function LinkPicker({
  storeId,
  value,
  onChange,
}: {
  storeId: string | null | undefined;
  value: LinkValues;
  onChange: (next: LinkValues) => void;
}): React.ReactElement {
  const { data: scheduleData, isLoading: schedLoading } =
    useStoreSchedulesForLink(storeId);
  const { data: checklistData } = useStoreChecklistInstancesForLink(storeId);
  const { data: storeUsers, isLoading: usersLoading } = useUsers(
    storeId ? { store_id: storeId, is_active: true } : undefined,
  );

  const [schedDate, setSchedDate] = useState<string>("");
  const [schedQuery, setSchedQuery] = useState<string>("");
  const [peopleQuery, setPeopleQuery] = useState<string>("");

  // schedule + (1:1) checklist instance 매핑. checklist.schedule_id 로 link.
  const checklistByScheduleId = useMemo(() => {
    const map = new Map<string, { id: string; total: number; completed: number }>();
    (checklistData?.items ?? []).forEach((c) => {
      if (c.schedule_id) {
        map.set(c.schedule_id, {
          id: c.id,
          total: c.total_items,
          completed: c.completed_items,
        });
      }
    });
    return map;
  }, [checklistData]);

  // 최신순 (work_date desc) 정렬 + date / free-text 필터.
  // 검색 토큰은 이름/role/work_date 모두에 매칭.
  const schedules = useMemo(() => {
    const items = [...(scheduleData?.items ?? [])].sort((a, b) =>
      (b.work_date ?? "").localeCompare(a.work_date ?? ""),
    );
    const dateFiltered = schedDate
      ? items.filter((s) => s.work_date === schedDate)
      : items;
    const q = schedQuery.trim().toLowerCase();
    if (!q) return dateFiltered;
    return dateFiltered.filter((s) => {
      const fields = [
        s.work_date,
        s.user_name,
        s.work_role_name,
        s.work_role_name_snapshot,
        s.position_snapshot,
      ];
      return fields.some(
        (v) => typeof v === "string" && v.toLowerCase().includes(q),
      );
    });
  }, [scheduleData, schedDate, schedQuery]);

  const sortedUsers: User[] = useMemo(() => {
    if (!storeUsers) return [];
    return [...storeUsers].sort((a, b) => {
      if (a.role_priority !== b.role_priority) return a.role_priority - b.role_priority;
      return (a.full_name ?? "").localeCompare(b.full_name ?? "");
    });
  }, [storeUsers]);

  const filteredUsers = useMemo(() => {
    if (!peopleQuery.trim()) return sortedUsers;
    const q = peopleQuery.toLowerCase();
    return sortedUsers.filter((u) => {
      const fields = [u.full_name, u.username, u.role_name];
      return fields.some(
        (s) => typeof s === "string" && s.toLowerCase().includes(q),
      );
    });
  }, [sortedUsers, peopleQuery]);

  if (!storeId) {
    return (
      <p className="text-xs text-textMuted italic">
        Select a store first to choose related items.
      </p>
    );
  }

  // 선택 토글
  const isUserChecked = (uid: string) => value.related_user_ids.includes(uid);

  const toggleSchedule = (s: { id: string }) => {
    const sid = s.id;
    const cl = checklistByScheduleId.get(sid);
    const scheduleSelected = value.schedule_ids.includes(sid);
    const nextSchedule = scheduleSelected
      ? value.schedule_ids.filter((x) => x !== sid)
      : [...value.schedule_ids, sid];
    // 1:1 checklist 동기화
    let nextChecklist = value.checklist_instance_ids;
    if (cl) {
      if (scheduleSelected) {
        nextChecklist = nextChecklist.filter((x) => x !== cl.id);
      } else if (!nextChecklist.includes(cl.id)) {
        nextChecklist = [...nextChecklist, cl.id];
      }
    }
    onChange({
      ...value,
      schedule_ids: nextSchedule,
      checklist_instance_ids: nextChecklist,
    });
  };

  const toggleUser = (uid: string) => {
    const has = value.related_user_ids.includes(uid);
    onChange({
      ...value,
      related_user_ids: has
        ? value.related_user_ids.filter((x) => x !== uid)
        : [...value.related_user_ids, uid],
    });
  };

  const toggleRole = (chip: RoleChip) => {
    const has = value.related_roles.includes(chip.key);
    // role chip toggle + 매장 user 매크로 add/remove
    const matchedIds = sortedUsers.filter(chip.match).map((u) => u.id);
    let nextRelatedRoles: string[];
    let nextUserIds: string[];
    if (has) {
      nextRelatedRoles = value.related_roles.filter((x) => x !== chip.key);
      // 그 role 의 user 들 제거 (다른 role chip 으로도 선택돼 있으면 보존)
      const stillCovered = (uid: string): boolean => {
        for (const r of nextRelatedRoles) {
          const other = ROLE_CHIPS.find((c) => c.key === r);
          if (!other) continue;
          const u = sortedUsers.find((x) => x.id === uid);
          if (u && other.match(u)) return true;
        }
        return false;
      };
      nextUserIds = value.related_user_ids.filter(
        (uid) => !matchedIds.includes(uid) || stillCovered(uid),
      );
    } else {
      nextRelatedRoles = [...value.related_roles, chip.key];
      nextUserIds = [...value.related_user_ids];
      matchedIds.forEach((id) => {
        if (!nextUserIds.includes(id)) nextUserIds.push(id);
      });
    }
    onChange({
      ...value,
      related_roles: nextRelatedRoles,
      related_user_ids: nextUserIds,
    });
  };

  return (
    <div className="space-y-5">
      {/* Schedules — search/date filter + checklist 통합. 최신순 정렬. */}
      <div>
        <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-textSecondary flex items-center gap-1.5">
            <CalendarClock className="w-3.5 h-3.5 text-accent" />
            Related schedules
            {schedDate && (
              <span className="text-textMuted normal-case font-normal">
                · {formatFixedDate(schedDate)}
              </span>
            )}
          </h4>
          <div className="flex items-center gap-1.5 flex-wrap">
            <div className="relative">
              <Search
                size={12}
                className="absolute left-2 top-1/2 -translate-y-1/2 text-textMuted"
              />
              <input
                type="text"
                value={schedQuery}
                onChange={(e) => setSchedQuery(e.target.value)}
                placeholder="Search name / date / role"
                className="text-xs pl-7 pr-2 py-1 bg-surface border border-border rounded-md text-text placeholder:text-textMuted w-56 focus:outline-none focus:border-accent"
              />
            </div>
            <DateField
              value={schedDate}
              onChange={setSchedDate}
              placeholder="Filter by date"
            />
            {schedDate && (
              <button
                type="button"
                onClick={() => setSchedDate("")}
                className="text-textMuted hover:text-text"
                aria-label="Clear date"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>
        {schedLoading ? (
          <LoadingSpinner size="sm" />
        ) : schedules.length === 0 ? (
          <p className="text-xs text-textMuted italic">
            {schedDate
              ? "No schedules on this date."
              : schedQuery
              ? "No schedules match your search."
              : "No schedules available."}
          </p>
        ) : (
          <div className="border border-border rounded-md p-2 max-h-56 overflow-auto space-y-1 bg-surface">
            {schedules.map((s) => {
              const start = formatHm(s.start_time);
              const end = formatHm(s.end_time);
              const timeRange = start && end ? `${start}–${end}` : start ?? end;
              const role =
                s.work_role_name ??
                s.work_role_name_snapshot ??
                s.position_snapshot ??
                null;
              const cl = checklistByScheduleId.get(s.id);
              const progress = cl ? `${cl.completed}/${cl.total} checklist` : null;
              const meta = joinWithDot([role, timeRange, s.user_name, progress]);
              const checked = value.schedule_ids.includes(s.id);
              return (
                <label
                  key={s.id}
                  className="flex items-center gap-2 text-sm cursor-pointer hover:bg-surfaceHover px-2 py-1.5 rounded"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleSchedule(s)}
                    className="accent-accent"
                  />
                  <CalendarClock className="w-3.5 h-3.5 text-textMuted shrink-0" />
                  <span className="text-text font-medium">
                    {formatFixedDate(s.work_date)}
                  </span>
                  {meta && <span className="text-textMuted">· {meta}</span>}
                </label>
              );
            })}
          </div>
        )}
      </div>

      {/* Related roles — chip toggle (assignees 매크로) */}
      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-textSecondary mb-2 flex items-center gap-1.5">
          <Users className="w-3.5 h-3.5 text-warning" />
          Related role
          <span className="text-textMuted normal-case font-normal">
            · adds everyone with that role
          </span>
        </h4>
        <div className="flex flex-wrap gap-2">
          {ROLE_CHIPS.map((c) => {
            const active = value.related_roles.includes(c.key);
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

      {/* Related people — search */}
      <div>
        <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-textSecondary flex items-center gap-1.5">
            <UserCircle2 className="w-3.5 h-3.5 text-textSecondary" />
            Related people
            {value.related_user_ids.length > 0 && (
              <span className="text-accent normal-case font-semibold">
                · {value.related_user_ids.length} selected
              </span>
            )}
          </h4>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-textMuted pointer-events-none" />
            <input
              value={peopleQuery}
              onChange={(e) => setPeopleQuery(e.target.value)}
              placeholder="Search name or role"
              className="pl-7 pr-7 py-1.5 text-xs bg-surface border border-border rounded-md text-text w-56 focus:outline-none focus:ring-1 focus:ring-accent"
            />
            {peopleQuery && (
              <button
                type="button"
                onClick={() => setPeopleQuery("")}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 text-textMuted hover:text-text"
                aria-label="Clear search"
              >
                <X size={12} />
              </button>
            )}
          </div>
        </div>
        {usersLoading ? (
          <LoadingSpinner size="sm" />
        ) : filteredUsers.length === 0 ? (
          <p className="text-xs text-textMuted italic">
            {peopleQuery ? "No matching staff." : "No staff for this store."}
          </p>
        ) : (
          <div className="border border-border rounded-md p-2 max-h-56 overflow-auto space-y-1 bg-surface">
            {filteredUsers.map((u) => (
              <label
                key={u.id}
                className="flex items-center gap-2 text-sm cursor-pointer hover:bg-surfaceHover px-2 py-1.5 rounded"
              >
                <input
                  type="checkbox"
                  checked={isUserChecked(u.id)}
                  onChange={() => toggleUser(u.id)}
                  className="accent-accent"
                />
                <UserCircle2 className="w-3.5 h-3.5 text-textMuted shrink-0" />
                <span className="text-text">{u.full_name ?? u.username}</span>
                {u.role_name && (
                  <span className="text-xs text-textMuted">· {u.role_name}</span>
                )}
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
