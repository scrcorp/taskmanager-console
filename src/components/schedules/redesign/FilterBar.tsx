"use client";

/**
 * FilterBar — server User/Schedule 직접 사용. positions/shifts는 schedules 데이터에서 동적 추출.
 */

import { useState, useRef, useEffect, useMemo } from "react";
import type { User, Schedule } from "@/types";
import { ROLE_PRIORITY } from "@/lib/permissions";

export interface FilterState {
  staffIds: string[];
  roles: string[];
  statuses: string[];
  positions: string[];
  shifts: string[];
}

interface Props {
  filters: FilterState;
  onChange: (filters: FilterState) => void;
  users: User[];
  schedules: Schedule[];
  selectedStoreId: string;
}

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

export function FilterBar({ filters, onChange, users, schedules, selectedStoreId }: Props) {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

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
    setSearchQuery("");
    setOpenMenu(null);
  }

  const filteredUserSearch = users.filter((u) => !searchQuery.trim() || (u.full_name ?? u.username).toLowerCase().includes(searchQuery.toLowerCase()));

  function FilterButton({ id, label, count }: { id: string; label: string; count: number }) {
    const isActive = openMenu === id;
    return (
      <button
        type="button"
        onClick={() => setOpenMenu(isActive ? null : id)}
        className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold border flex items-center gap-1.5 transition-colors ${
          count > 0
            ? "bg-[var(--color-accent-muted)] text-[var(--color-accent)] border-[var(--color-accent)]/30"
            : "bg-[var(--color-surface)] text-[var(--color-text-secondary)] border-[var(--color-border)] hover:border-[var(--color-text-muted)] hover:text-[var(--color-text)]"
        } ${isActive ? "ring-2 ring-[var(--color-accent)]/20" : ""}`}
      >
        {label}
        {count > 0 && (
          <span className="bg-[var(--color-accent)] text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
            {count}
          </span>
        )}
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className={`transition-transform ${isActive ? "rotate-180" : ""}`}>
          <polyline points="2.5 4 5 6.5 7.5 4" />
        </svg>
      </button>
    );
  }

  function CheckboxList({ items, selected, onToggle }: { items: { id: string; label: string; meta?: React.ReactNode }[]; selected: string[]; onToggle: (id: string) => void }) {
    return (
      <div className="py-1 max-h-[280px] overflow-y-auto">
        {items.length === 0 && (
          <div className="px-3 py-4 text-[12px] text-[var(--color-text-muted)] italic text-center">No options</div>
        )}
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onToggle(item.id)}
            className={`w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-left transition-colors ${selected.includes(item.id) ? "bg-[var(--color-accent-muted)]" : "hover:bg-[var(--color-surface-hover)]"}`}
          >
            <span className={`w-4 h-4 rounded border-[1.5px] flex items-center justify-center shrink-0 transition-colors ${selected.includes(item.id) ? "bg-[var(--color-accent)] border-[var(--color-accent)]" : "border-[var(--color-border)]"}`}>
              {selected.includes(item.id) && (
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="2 5 4.5 7.5 8 3" />
                </svg>
              )}
            </span>
            <span className="flex-1 font-medium text-[var(--color-text)]">{item.label}</span>
            {item.meta}
          </button>
        ))}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl px-4 py-3 mb-4">
      {/* Filter buttons row */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Staff search */}
        <div className="relative">
          <FilterButton id="staff" label="Staff" count={filters.staffIds.length} />
          {openMenu === "staff" && (
            <div className="absolute top-full left-0 mt-1.5 w-[300px] bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl shadow-[0_8px_24px_rgba(0,0,0,0.12)] z-30 overflow-hidden">
              <div className="p-2 border-b border-[var(--color-border)]">
                <div className="flex items-center gap-1.5 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-1.5">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="var(--color-text-muted)" strokeWidth="1.5" strokeLinecap="round"><circle cx="6" cy="6" r="4" /><line x1="9" y1="9" x2="12" y2="12" /></svg>
                  <input
                    type="text"
                    autoFocus
                    placeholder="Search by name..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="bg-transparent outline-none text-[13px] w-full"
                  />
                  {searchQuery && (
                    <button type="button" onClick={() => setSearchQuery("")} className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]">
                      <svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="8" y1="3" x2="3" y2="8" /><line x1="3" y1="3" x2="8" y2="8" /></svg>
                    </button>
                  )}
                </div>
              </div>
              <div className="max-h-[280px] overflow-y-auto py-1">
                {filteredUserSearch.length === 0 ? (
                  <div className="px-4 py-8 text-center">
                    <div className="text-[12px] text-[var(--color-text-muted)] mb-1">No staff found</div>
                  </div>
                ) : (
                  filteredUserSearch.map((u) => {
                    const hasSchedule = usersWithSchedule.has(u.id);
                    const roleId = rolePriorityToBadge(u.role_priority);
                    return (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => toggle("staffIds", u.id)}
                        className={`w-full flex items-center justify-between px-3 py-2 text-[13px] cursor-pointer transition-colors ${filters.staffIds.includes(u.id) ? "bg-[var(--color-accent-muted)]" : "hover:bg-[var(--color-surface-hover)]"}`}
                      >
                        <div className="flex items-center gap-2.5">
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold ${rolePriorityToColorClass(u.role_priority)}`}>{getInitials(u.full_name)}</div>
                          <span className="font-medium text-[var(--color-text)]">{u.full_name || u.username}</span>
                          <span className="text-[10px] text-[var(--color-text-muted)] uppercase">{roleId}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${hasSchedule ? "bg-[var(--color-success-muted)] text-[var(--color-success)]" : "bg-[var(--color-bg)] text-[var(--color-text-muted)]"}`}>
                            {hasSchedule ? "Scheduled" : "No schedule"}
                          </span>
                          {filters.staffIds.includes(u.id) && (
                            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="var(--color-accent)" strokeWidth="2" strokeLinecap="round"><polyline points="2 6 5 9 10 3" /></svg>
                          )}
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

        {/* Role */}
        <div className="relative">
          <FilterButton id="role" label="Role" count={filters.roles.length} />
          {openMenu === "role" && (
            <div className="absolute top-full left-0 mt-1.5 w-[200px] bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl shadow-[0_8px_24px_rgba(0,0,0,0.12)] z-30 overflow-hidden">
              <CheckboxList
                items={ALL_ROLES.map((r) => ({ id: r.id, label: r.label }))}
                selected={filters.roles}
                onToggle={(id) => toggle("roles", id)}
              />
            </div>
          )}
        </div>

        {/* Status */}
        <div className="relative">
          <FilterButton id="status" label="Status" count={filters.statuses.length} />
          {openMenu === "status" && (
            <div className="absolute top-full left-0 mt-1.5 w-[200px] bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl shadow-[0_8px_24px_rgba(0,0,0,0.12)] z-30 overflow-hidden">
              <CheckboxList
                items={ALL_STATUSES.map((s) => ({
                  id: s.id,
                  label: s.label,
                  meta: <span className="w-2.5 h-2.5 rounded-full" style={{ background: s.color }} />,
                }))}
                selected={filters.statuses}
                onToggle={(id) => toggle("statuses", id)}
              />
            </div>
          )}
        </div>

        {/* Position (dynamic) */}
        <div className="relative">
          <FilterButton id="position" label="Position" count={filters.positions.length} />
          {openMenu === "position" && (
            <div className="absolute top-full left-0 mt-1.5 w-[200px] bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl shadow-[0_8px_24px_rgba(0,0,0,0.12)] z-30 overflow-hidden">
              <CheckboxList
                items={dynamicPositions.map((p) => ({ id: p, label: p }))}
                selected={filters.positions}
                onToggle={(id) => toggle("positions", id)}
              />
            </div>
          )}
        </div>

        {/* Shift (dynamic — work role names) */}
        <div className="relative">
          <FilterButton id="shift" label="Work Role" count={filters.shifts.length} />
          {openMenu === "shift" && (
            <div className="absolute top-full left-0 mt-1.5 w-[220px] bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl shadow-[0_8px_24px_rgba(0,0,0,0.12)] z-30 overflow-hidden">
              <CheckboxList
                items={dynamicShifts.map((s) => ({ id: s, label: s }))}
                selected={filters.shifts}
                onToggle={(id) => toggle("shifts", id)}
              />
            </div>
          )}
        </div>

        {totalActive > 0 && (
          <button type="button" onClick={clearAll} className="ml-auto text-[12px] text-[var(--color-text-muted)] hover:text-[var(--color-danger)] flex items-center gap-1 transition-colors">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="9" y1="3" x2="3" y2="9" /><line x1="3" y1="3" x2="9" y2="9" /></svg>
            Clear All ({totalActive})
          </button>
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
