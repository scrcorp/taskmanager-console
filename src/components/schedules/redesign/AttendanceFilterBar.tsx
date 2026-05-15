"use client";

/**
 * Attendance 페이지 전용 필터바.
 *
 * Daily / Weekly view 공통으로 사용. schedules/redesign/FilterBar.tsx 패턴 참고.
 *  - Staff (검색 + 아바타)
 *  - Role (Owner/GM/SV/Staff)
 *  - Status (Upcoming/Clocked In/On Break/Late/No Show/Done)
 *  - Edited only 토글 (correction_count > 0)
 *
 * 필터 상태는 부모(AttendancePage) 가 보유하고 setFilters 로 전달받는다.
 */

import { useState } from "react";
import { MultiSelectFilter } from "@/components/ui";
import { ROLE_PRIORITY } from "@/lib/permissions";
import type { User } from "@/types";

export type AttendanceStatusKey =
  | "upcoming"
  | "working"
  | "on_break"
  | "late"
  | "no_show"
  | "clocked_out";

export interface AttendanceUiFilters {
  staffIds: string[];
  roles: string[];
  statuses: AttendanceStatusKey[];
  editedOnly: boolean;
}

export const EMPTY_ATTENDANCE_FILTERS: AttendanceUiFilters = {
  staffIds: [],
  roles: [],
  statuses: [],
  editedOnly: false,
};

const ALL_ROLES = [
  { id: "owner", label: "Owner" },
  { id: "gm", label: "GM" },
  { id: "sv", label: "SV" },
  { id: "staff", label: "Staff" },
];

const ALL_STATUSES: { id: AttendanceStatusKey; label: string; color: string }[] = [
  { id: "upcoming", label: "Upcoming", color: "var(--color-text-muted)" },
  { id: "working", label: "Clocked In", color: "var(--color-success)" },
  { id: "on_break", label: "On Break", color: "var(--color-warning)" },
  { id: "late", label: "Late", color: "var(--color-danger)" },
  { id: "no_show", label: "No Show", color: "var(--color-danger)" },
  { id: "clocked_out", label: "Done", color: "var(--color-info, #7AB7FF)" },
];

export function rolePriorityToBadgeId(p: number): string {
  if (p <= ROLE_PRIORITY.OWNER) return "owner";
  if (p <= ROLE_PRIORITY.GM) return "gm";
  if (p <= ROLE_PRIORITY.SV) return "sv";
  return "staff";
}

function rolePriorityToColorClass(p: number): string {
  if (p <= ROLE_PRIORITY.GM) return "bg-[var(--color-accent-muted)] text-[var(--color-accent)]";
  if (p <= ROLE_PRIORITY.SV) return "bg-[var(--color-warning-muted)] text-[var(--color-warning)]";
  return "bg-[var(--color-success-muted)] text-[var(--color-success)]";
}

function getInitials(name: string | null | undefined): string {
  if (!name) return "??";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "??";
  return parts.slice(0, 2).map((s) => s[0] ?? "").join("").toUpperCase();
}

interface StaffOption {
  id: string;
  label: string;
  user: User;
}

interface Props {
  filters: AttendanceUiFilters;
  onChange: (next: AttendanceUiFilters) => void;
  /** 해당 매장의 활성 직원 — Staff 옵션 source. 비어 있으면 Staff 드롭다운에 "No staff" 표시. */
  storeUsers: User[];
}

export function AttendanceFilterBar({ filters, onChange, storeUsers }: Props) {
  // 한 번에 하나의 dropdown 만 열림 — 상호배타 제어.
  const [openMenu, setOpenMenu] = useState<
    null | "staff" | "role" | "status"
  >(null);
  const handleOpenChange = (key: NonNullable<typeof openMenu>) => (next: boolean) => {
    setOpenMenu(next ? key : openMenu === key ? null : openMenu);
  };

  function toggle<K extends keyof AttendanceUiFilters>(
    key: K,
    id: AttendanceUiFilters[K] extends string[] ? string : never,
  ) {
    const list = filters[key] as unknown as string[];
    const next = list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
    onChange({ ...filters, [key]: next as AttendanceUiFilters[K] });
  }

  const staffOptions: StaffOption[] = storeUsers.map((u) => ({
    id: u.id,
    label: u.full_name || u.username,
    user: u,
  }));

  const totalActive =
    filters.staffIds.length +
    filters.roles.length +
    filters.statuses.length +
    (filters.editedOnly ? 1 : 0);

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl px-4 py-3 mb-4">
      <div className="flex items-center gap-2 flex-wrap">
        <MultiSelectFilter<StaffOption>
          label="Staff"
          options={staffOptions}
          selected={filters.staffIds}
          onToggle={(id) => toggle("staffIds", id as never)}
          onClearAll={() => onChange({ ...filters, staffIds: [] })}
          searchable
          searchPlaceholder="Search by name..."
          width={280}
          open={openMenu === "staff"}
          onOpenChange={handleOpenChange("staff")}
          filterFn={(opt, q) => {
            const u = opt.user;
            const needle = q.trim().toLowerCase();
            return (u.full_name ?? u.username).toLowerCase().includes(needle)
              || u.username.toLowerCase().includes(needle);
          }}
          renderOption={(opt) => {
            const u = opt.user;
            const roleId = rolePriorityToBadgeId(u.role_priority);
            return (
              <div className="flex-1 flex items-center gap-2.5 min-w-0">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 ${rolePriorityToColorClass(u.role_priority)}`}>
                  {getInitials(u.full_name)}
                </div>
                <span className="font-medium text-[var(--color-text)] truncate">{u.full_name || u.username}</span>
                <span className="text-[10px] text-[var(--color-text-muted)] uppercase shrink-0">{roleId}</span>
              </div>
            );
          }}
        />

        <MultiSelectFilter
          label="Role"
          options={ALL_ROLES}
          selected={filters.roles}
          onToggle={(id) => toggle("roles", id as never)}
          onClearAll={() => onChange({ ...filters, roles: [] })}
          width={180}
          open={openMenu === "role"}
          onOpenChange={handleOpenChange("role")}
        />

        <MultiSelectFilter
          label="Status"
          options={ALL_STATUSES.map((s) => ({
            id: s.id,
            label: s.label,
            meta: <span className="w-2.5 h-2.5 rounded-full" style={{ background: s.color }} />,
          }))}
          selected={filters.statuses}
          onToggle={(id) => toggle("statuses", id as never)}
          onClearAll={() => onChange({ ...filters, statuses: [] })}
          width={200}
          open={openMenu === "status"}
          onOpenChange={handleOpenChange("status")}
        />

        {/* Edited only — 토글 chip */}
        <button
          type="button"
          onClick={() => onChange({ ...filters, editedOnly: !filters.editedOnly })}
          aria-pressed={filters.editedOnly}
          className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold border flex items-center gap-1.5 transition-colors ${
            filters.editedOnly
              ? "bg-[var(--color-warning-muted)] text-[var(--color-warning)] border-[var(--color-warning)]/40"
              : "bg-[var(--color-surface)] text-[var(--color-text-secondary)] border-[var(--color-border)] hover:border-[var(--color-text-muted)] hover:text-[var(--color-text)]"
          }`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-warning)]" />
          Edited only
        </button>

        {totalActive > 0 && (
          <button
            type="button"
            onClick={() => onChange(EMPTY_ATTENDANCE_FILTERS)}
            className="text-[12px] text-[var(--color-text-muted)] hover:text-[var(--color-danger)] flex items-center gap-1 transition-colors ml-1"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="9" y1="3" x2="3" y2="9" />
              <line x1="3" y1="3" x2="9" y2="9" />
            </svg>
            Clear All ({totalActive})
          </button>
        )}
      </div>
    </div>
  );
}

/** Attendance status 한 건이 status 필터 set 에 매칭되는지.
 *  - 'late' 필터는 status === 'late' OR anomalies 에 'late' 포함도 매칭. */
export function matchesStatusFilter(
  attStatus: string,
  anomalies: string[] | null | undefined,
  set: readonly AttendanceStatusKey[],
): boolean {
  if (set.length === 0) return true;
  if (set.includes("late") && (attStatus === "late" || (anomalies?.includes("late") ?? false))) return true;
  return set.includes(attStatus as AttendanceStatusKey);
}
