"use client";

/**
 * FilterBar — server User/Schedule 직접 사용. positions/shifts는 schedules 데이터에서 동적 추출.
 *
 * Multi-select dropdown 5종 (Staff/Role/Status/Position/Work Role) 은
 * 공통 컴포넌트 `<MultiSelectFilter>` 로 통일. Empty staff dropdown 은
 * radio + hide toggle 구조라 별도로 인라인 유지.
 */

import { useState, useRef, useEffect, useMemo } from "react";
import { MultiSelectFilter } from "@/components/ui";
import type { User, Schedule } from "@/types";
import { ROLE_PRIORITY } from "@/lib/permissions";

export interface FilterState {
  staffIds: string[];
  roles: string[];
  statuses: string[];
  positions: string[];
  shifts: string[];
}

/** 빈 직원 정렬 차원 — bottom(기본) / top / in-order */
export type EmptyStaffSort = "bottom" | "top" | "in-order";

interface Props {
  filters: FilterState;
  onChange: (filters: FilterState) => void;
  users: User[];
  schedules: Schedule[];
  selectedStoreId: string;
  /** 필터 row 우측 끝에 추가로 노출할 컨트롤 */
  rightSlot?: React.ReactNode;
  /** 빈 직원 정렬 (bottom 기본). hide=true면 무시 */
  emptyStaffSort?: EmptyStaffSort;
  onEmptyStaffSortChange?: (sort: EmptyStaffSort) => void;
  /** 빈 직원 숨김 여부 */
  emptyStaffHide?: boolean;
  onEmptyStaffHideChange?: (hide: boolean) => void;
}

const EMPTY_SORT_OPTIONS: { id: EmptyStaffSort; label: string; description: string }[] = [
  { id: "bottom", label: "Bottom", description: "Sort empty staff to the bottom" },
  { id: "top", label: "Top", description: "Sort empty staff to the top" },
  { id: "in-order", label: "In order", description: "Keep default sort — no reorder" },
];

const ALL_STATUSES = [
  { id: "confirmed", label: "Confirmed", color: "var(--color-success)" },
  { id: "requested", label: "Requested", color: "var(--color-warning)" },
  { id: "draft", label: "Draft", color: "var(--color-text-muted)" },
  { id: "rejected", label: "Rejected", color: "var(--color-danger)" },
  { id: "cancelled", label: "Cancelled", color: "var(--color-text-muted)" },
];

const ALL_ROLES = [
  { id: "owner", label: "Owner" },
  { id: "gm", label: "GM" },
  { id: "sv", label: "SV" },
  { id: "staff", label: "Staff" },
];

function rolePriorityToBadge(p: number): string {
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
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return ((parts[0]![0] ?? "") + (parts[parts.length - 1]![0] ?? "")).toUpperCase();
}

export function FilterBar({ filters, onChange, users, schedules, selectedStoreId, rightSlot, emptyStaffSort, onEmptyStaffSortChange, emptyStaffHide, onEmptyStaffHideChange }: Props) {
  // 5개 multi-select + empty-staff 가 상호배타적으로 열리도록 부모 state 로 제어.
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const emptyStaffRef = useRef<HTMLDivElement>(null);

  // empty-staff 메뉴만 outside-click + ESC 처리 (MultiSelectFilter 는 자체 처리).
  useEffect(() => {
    if (openMenu !== "empty-staff") return;
    function handleClick(e: MouseEvent) {
      if (emptyStaffRef.current && !emptyStaffRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpenMenu(null);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [openMenu]);

  // 동적 positions / shifts 추출
  const dynamicPositions = useMemo(() => {
    const set = new Set<string>();
    schedules.forEach((s) => {
      if (s.position_snapshot) set.add(s.position_snapshot);
    });
    return Array.from(set).sort();
  }, [schedules]);

  const dynamicShifts = useMemo(() => {
    const set = new Set<string>();
    schedules.forEach((s) => {
      const name = s.work_role_name_snapshot || s.work_role_name;
      if (name) set.add(name);
    });
    return Array.from(set).sort();
  }, [schedules]);

  // 어느 유저가 현재 매장에서 schedule을 가지고 있는지
  const usersWithSchedule = useMemo(() => {
    const set = new Set<string>();
    schedules.forEach((s) => {
      if (s.store_id === selectedStoreId) set.add(s.user_id);
    });
    return set;
  }, [schedules, selectedStoreId]);

  const totalActive = filters.staffIds.length + filters.roles.length + filters.statuses.length + filters.positions.length + filters.shifts.length;

  function toggle<K extends keyof FilterState>(key: K, value: string) {
    const current = filters[key] as string[];
    const next = current.includes(value) ? current.filter((v) => v !== value) : [...current, value];
    onChange({ ...filters, [key]: next });
  }

  function clearAll() {
    onChange({ staffIds: [], roles: [], statuses: [], positions: [], shifts: [] });
    setOpenMenu(null);
  }

  /** 한 dropdown 만 열려있도록 — 다른 거 열려있으면 자동으로 닫음 */
  const handleOpenChange = (menuId: string) => (next: boolean) => {
    setOpenMenu(next ? menuId : (openMenu === menuId ? null : openMenu));
  };

  // ── Staff 옵션 (검색 + 커스텀 row: 아바타 + role 약어 + Scheduled 뱃지)
  const staffOptions = users.map((u) => ({
    id: u.id,
    label: u.full_name || u.username,
    user: u,
  }));

  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl px-4 py-3 mb-4">
      {/* Filter buttons row */}
      <div className="flex items-center gap-2 flex-wrap">
        <MultiSelectFilter
          label="Staff"
          options={staffOptions}
          selected={filters.staffIds}
          onToggle={(id) => toggle("staffIds", id)}
          onClearAll={() => onChange({ ...filters, staffIds: [] })}
          searchable
          searchPlaceholder="Search by name..."
          width={300}
          open={openMenu === "staff"}
          onOpenChange={handleOpenChange("staff")}
          filterFn={(opt, q) => {
            const u = opt.user;
            const needle = q.trim().toLowerCase();
            return (u.full_name ?? u.username).toLowerCase().includes(needle)
              || u.username.toLowerCase().includes(needle);
          }}
          renderOption={(opt, isSelected) => {
            const u = opt.user;
            const hasSchedule = usersWithSchedule.has(u.id);
            const roleId = rolePriorityToBadge(u.role_priority);
            return (
              <div className="flex-1 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 ${rolePriorityToColorClass(u.role_priority)}`}>
                    {getInitials(u.full_name)}
                  </div>
                  <span className="font-medium text-[var(--color-text)] truncate">{u.full_name || u.username}</span>
                  <span className="text-[10px] text-[var(--color-text-muted)] uppercase shrink-0">{roleId}</span>
                </div>
                <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded shrink-0 ${hasSchedule ? "bg-[var(--color-success-muted)] text-[var(--color-success)]" : "bg-[var(--color-bg)] text-[var(--color-text-muted)]"}`}>
                  {hasSchedule ? "Scheduled" : "No schedule"}
                </span>
                {/* checkmark 는 부모가 그리지만, 기존 디자인은 row 우측에도 별도 체크가 있었음 — 생략해도 무방. */}
                {isSelected ? null : null}
              </div>
            );
          }}
        />

        <MultiSelectFilter
          label="Role"
          options={ALL_ROLES.map((r) => ({ id: r.id, label: r.label }))}
          selected={filters.roles}
          onToggle={(id) => toggle("roles", id)}
          onClearAll={() => onChange({ ...filters, roles: [] })}
          width={200}
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
          onToggle={(id) => toggle("statuses", id)}
          onClearAll={() => onChange({ ...filters, statuses: [] })}
          width={200}
          open={openMenu === "status"}
          onOpenChange={handleOpenChange("status")}
        />

        <MultiSelectFilter
          label="Position"
          options={dynamicPositions.map((p) => ({ id: p, label: p }))}
          selected={filters.positions}
          onToggle={(id) => toggle("positions", id)}
          onClearAll={() => onChange({ ...filters, positions: [] })}
          width={200}
          open={openMenu === "position"}
          onOpenChange={handleOpenChange("position")}
        />

        <MultiSelectFilter
          label="Work Role"
          options={dynamicShifts.map((s) => ({ id: s, label: s }))}
          selected={filters.shifts}
          onToggle={(id) => toggle("shifts", id)}
          onClearAll={() => onChange({ ...filters, shifts: [] })}
          width={220}
          open={openMenu === "shift"}
          onOpenChange={handleOpenChange("shift")}
        />

        {totalActive > 0 && (
          <button type="button" onClick={clearAll} className="text-[12px] text-[var(--color-text-muted)] hover:text-[var(--color-danger)] flex items-center gap-1 transition-colors">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="9" y1="3" x2="3" y2="9" /><line x1="3" y1="3" x2="9" y2="9" /></svg>
            Clear All ({totalActive})
          </button>
        )}

        {/* Empty staff — multi-select 가 아닌 radio + toggle 구조라 그대로 인라인 유지 */}
        {emptyStaffSort && onEmptyStaffSortChange && onEmptyStaffHideChange && (() => {
          const isDefault = !emptyStaffHide && emptyStaffSort === "bottom";
          const chipLabel = emptyStaffHide
            ? "Hidden"
            : EMPTY_SORT_OPTIONS.find((o) => o.id === emptyStaffSort)?.label ?? "Bottom";
          return (
            <div ref={emptyStaffRef} className="relative ml-auto">
              <button
                type="button"
                onClick={() => setOpenMenu(openMenu === "empty-staff" ? null : "empty-staff")}
                title="How to display staff without any schedule in this view"
                className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold border flex items-center gap-1.5 transition-colors ${
                  !isDefault
                    ? "bg-[var(--color-accent-muted)] text-[var(--color-accent)] border-[var(--color-accent)]/30"
                    : "bg-[var(--color-surface)] text-[var(--color-text-secondary)] border-[var(--color-border)] hover:border-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                } ${openMenu === "empty-staff" ? "ring-2 ring-[var(--color-accent)]/20" : ""}`}
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="6" cy="4" r="2" />
                  <path d="M2 11c0-2 1.8-3.5 4-3.5s4 1.5 4 3.5" />
                </svg>
                <span>Empty staff: {chipLabel}</span>
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className={`transition-transform ${openMenu === "empty-staff" ? "rotate-180" : ""}`}>
                  <polyline points="2.5 4 5 6.5 7.5 4" />
                </svg>
              </button>
              {openMenu === "empty-staff" && (
                <div className="absolute top-full right-0 mt-1.5 w-[300px] bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl shadow-[0_8px_24px_rgba(0,0,0,0.12)] z-30 overflow-hidden">
                  <div className="px-3 py-2 border-b border-[var(--color-border)] text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                    Staff with no schedule
                  </div>
                  {/* Hide toggle */}
                  <button
                    type="button"
                    onClick={() => onEmptyStaffHideChange(!emptyStaffHide)}
                    className={`w-full flex items-start gap-2.5 px-3 py-2.5 text-left transition-colors border-b border-[var(--color-border)] ${emptyStaffHide ? "bg-[var(--color-accent-muted)]" : "hover:bg-[var(--color-surface-hover)]"}`}
                  >
                    <span className={`mt-0.5 w-3.5 h-3.5 rounded border-2 flex-shrink-0 flex items-center justify-center ${emptyStaffHide ? "bg-[var(--color-accent)] border-[var(--color-accent)]" : "border-[var(--color-border)]"}`}>
                      {emptyStaffHide && (
                        <svg width="8" height="8" viewBox="0 0 8 8" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1.5 4.5 3.5 6.5 6.5 1.5" /></svg>
                      )}
                    </span>
                    <div className="min-w-0">
                      <div className={`text-[13px] font-semibold ${emptyStaffHide ? "text-[var(--color-accent)]" : "text-[var(--color-text)]"}`}>Hide them entirely</div>
                      <div className="text-[11px] text-[var(--color-text-muted)] mt-0.5 leading-snug">Don&apos;t show staff with no schedule</div>
                    </div>
                  </button>
                  {/* Sort group */}
                  <div className={`px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider ${emptyStaffHide ? "text-[var(--color-text-muted)]/40" : "text-[var(--color-text-muted)]"}`}>
                    Sort {emptyStaffHide && <span className="normal-case font-normal">— disabled while hidden</span>}
                  </div>
                  <div className="py-1">
                    {EMPTY_SORT_OPTIONS.map((opt) => {
                      const selected = emptyStaffSort === opt.id;
                      const dim = !!emptyStaffHide;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          disabled={dim}
                          onClick={() => {
                            onEmptyStaffSortChange(opt.id);
                            setOpenMenu(null);
                          }}
                          className={`w-full flex items-start gap-2.5 px-3 py-2 text-left transition-colors ${dim ? "opacity-40 cursor-not-allowed" : selected ? "bg-[var(--color-accent-muted)]" : "hover:bg-[var(--color-surface-hover)]"}`}
                        >
                          <span className={`mt-0.5 w-3.5 h-3.5 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${selected ? "border-[var(--color-accent)]" : "border-[var(--color-border)]"}`}>
                            {selected && <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-accent)]" />}
                          </span>
                          <div className="min-w-0">
                            <div className={`text-[13px] font-semibold ${selected && !dim ? "text-[var(--color-accent)]" : "text-[var(--color-text)]"}`}>{opt.label}</div>
                            <div className="text-[11px] text-[var(--color-text-muted)] mt-0.5 leading-snug">{opt.description}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {rightSlot && (
          <div className={emptyStaffSort || totalActive > 0 ? "" : "ml-auto"}>{rightSlot}</div>
        )}
      </div>

      {/* Active filter chips line */}
      {totalActive > 0 && (
        <div className="flex items-center gap-1.5 mt-2.5 pt-2.5 border-t border-[var(--color-border)] flex-wrap">
          <span className="text-[11px] text-[var(--color-text-muted)] mr-1">Active:</span>
          {filters.staffIds.map((id) => {
            const u = users.find((x) => x.id === id);
            if (!u) return null;
            return (
              <span key={`s${id}`} className="inline-flex items-center gap-1 px-2.5 py-1 bg-[var(--color-accent-muted)] text-[var(--color-accent)] rounded-full text-[11px] font-semibold">
                {u.full_name || u.username}
                <button type="button" onClick={() => toggle("staffIds", id)} className="opacity-60 hover:opacity-100 ml-0.5">×</button>
              </span>
            );
          })}
          {filters.roles.map((r) => (
            <span key={`r${r}`} className="inline-flex items-center gap-1 px-2.5 py-1 bg-[var(--color-accent-muted)] text-[var(--color-accent)] rounded-full text-[11px] font-semibold">
              {ALL_ROLES.find((x) => x.id === r)?.label ?? r}
              <button type="button" onClick={() => toggle("roles", r)} className="opacity-60 hover:opacity-100 ml-0.5">×</button>
            </span>
          ))}
          {filters.statuses.map((st) => {
            const status = ALL_STATUSES.find((s) => s.id === st);
            return (
              <span key={`st${st}`} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold" style={{ background: `${status?.color}20`, color: status?.color }}>
                {status?.label}
                <button type="button" onClick={() => toggle("statuses", st)} className="opacity-60 hover:opacity-100 ml-0.5">×</button>
              </span>
            );
          })}
          {filters.positions.map((p) => (
            <span key={`p${p}`} className="inline-flex items-center gap-1 px-2.5 py-1 bg-[var(--color-info-muted)] text-[var(--color-info)] rounded-full text-[11px] font-semibold">
              {p}
              <button type="button" onClick={() => toggle("positions", p)} className="opacity-60 hover:opacity-100 ml-0.5">×</button>
            </span>
          ))}
          {filters.shifts.map((sh) => (
            <span key={`sh${sh}`} className="inline-flex items-center gap-1 px-2.5 py-1 bg-[var(--color-warning-muted)] text-[var(--color-warning)] rounded-full text-[11px] font-semibold">
              {sh}
              <button type="button" onClick={() => toggle("shifts", sh)} className="opacity-60 hover:opacity-100 ml-0.5">×</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
