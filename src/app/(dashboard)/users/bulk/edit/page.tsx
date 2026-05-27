"use client";

/**
 * Bulk Edit — 여러 직원을 골라(Selected 바스켓) 선택한 필드를 한 번에 변경.
 * 좌: 필터 + 직원 목록(체크박스) / 우: Selected(N) 바스켓 + Apply Changes 패널.
 * 적용 필드(이번): Department / Status(active) / Hourly rate.  Role·Store 는 다음 증분.
 */

import React, { useState, useMemo, useCallback } from "react";
import { Search } from "lucide-react";
import { useUsers, useBulkUpdateUsers } from "@/hooks/useUsers";
import { usePermissions } from "@/hooks/usePermissions";
import { PERMISSIONS } from "@/lib/permissions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge, Select } from "@/components/ui";
import { useModal } from "@/components/ui/imperative-modal";
import type { User } from "@/types";

/** 일괄 변경 payload — useBulkUpdateUsers 와 구조 호환 (보낸 필드만 적용) */
interface BulkPayload {
  user_ids: string[];
  department?: "FOH" | "BOH" | null;
  is_active?: boolean;
  hourly_rate?: number | null;
}

function DeptBadge({ value }: { value?: "FOH" | "BOH" | null }): React.ReactElement {
  if (!value) return <span className="text-text-muted text-xs">—</span>;
  return <Badge variant={value === "FOH" ? "info" : "warning"}>{value}</Badge>;
}

export default function BulkEditPage(): React.ReactElement {
  const { hasPermission } = usePermissions();
  const canUpdate = hasPermission(PERMISSIONS.USERS_UPDATE);
  const modal = useModal();
  const { data: usersData, isLoading } = useUsers();
  const bulkUpdate = useBulkUpdateUsers();

  const users: User[] = useMemo(
    () => (Array.isArray(usersData) ? usersData : []),
    [usersData],
  );

  // ── 필터 ──
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [deptFilter, setDeptFilter] = useState("");

  // ── 선택 (필터 넘어 유지) ──
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // ── Apply 패널 — 켠 필드만 적용 ──
  const [applyDept, setApplyDept] = useState(false);
  const [deptVal, setDeptVal] = useState<"FOH" | "BOH" | "unassigned">("FOH");
  const [applyActive, setApplyActive] = useState(false);
  const [activeVal, setActiveVal] = useState<"activate" | "deactivate">("activate");
  const [applyHourly, setApplyHourly] = useState(false);
  const [hourlyVal, setHourlyVal] = useState("");

  const uniqueRoles = useMemo(
    () => Array.from(new Set(users.map((u) => u.role_name))).sort(),
    [users],
  );

  const filtered = useMemo(() => {
    let r = users;
    const q = search.trim().toLowerCase();
    if (q) {
      r = r.filter(
        (u) =>
          (u.full_name?.toLowerCase().includes(q) ?? false) ||
          u.username.toLowerCase().includes(q),
      );
    }
    if (roleFilter) r = r.filter((u) => u.role_name === roleFilter);
    if (deptFilter) r = r.filter((u) => (u.department ?? "unassigned") === deptFilter);
    return r;
  }, [users, search, roleFilter, deptFilter]);

  const selectedUsers = useMemo(
    () => users.filter((u) => selectedIds.has(u.id)),
    [users, selectedIds],
  );

  const toggle = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }, []);

  const allFilteredSelected =
    filtered.length > 0 && filtered.every((u) => selectedIds.has(u.id));

  const toggleAll = useCallback(() => {
    setSelectedIds((prev) => {
      const allSel = filtered.length > 0 && filtered.every((u) => prev.has(u.id));
      const n = new Set(prev);
      filtered.forEach((u) => (allSel ? n.delete(u.id) : n.add(u.id)));
      return n;
    });
  }, [filtered]);

  const clearSel = useCallback(() => setSelectedIds(new Set()), []);

  const anyFieldEnabled = applyDept || applyActive || applyHourly;

  const apply = useCallback(async () => {
    if (selectedIds.size === 0 || !anyFieldEnabled) return;

    const summary: string[] = [];
    if (applyDept) summary.push(`Department → ${deptVal === "unassigned" ? "Unassigned" : deptVal}`);
    if (applyActive) summary.push(`Status → ${activeVal === "activate" ? "Active" : "Inactive"}`);
    if (applyHourly) summary.push(`Hourly rate → ${hourlyVal.trim() ? `$${hourlyVal}` : "inherit default"}`);

    const ok = await modal.confirm({
      title: `Apply to ${selectedIds.size} staff?`,
      message: summary.join("  ·  "),
      confirmLabel: "Apply",
      variant: "primary",
    });
    if (!ok) return;

    const payload: BulkPayload = { user_ids: Array.from(selectedIds) };
    if (applyDept) payload.department = deptVal === "unassigned" ? null : deptVal;
    if (applyActive) payload.is_active = activeVal === "activate";
    if (applyHourly) payload.hourly_rate = hourlyVal.trim() ? Number(hourlyVal) : null;

    try {
      await bulkUpdate.mutateAsync(payload);
      setSelectedIds(new Set());
      setApplyDept(false);
      setApplyActive(false);
      setApplyHourly(false);
      setHourlyVal("");
    } catch {
      // hook 이 결과 모달 자동 표시
    }
  }, [
    selectedIds, anyFieldEnabled, applyDept, deptVal, applyActive, activeVal,
    applyHourly, hourlyVal, modal, bulkUpdate,
  ]);

  if (!canUpdate) {
    return (
      <div className="bg-card border border-border rounded-xl p-10 text-center text-text-secondary">
        You don&apos;t have permission to edit staff.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Left — filter + list */}
      <div className="lg:col-span-2 bg-card border border-border rounded-xl p-4">
        <div className="flex items-center gap-2 flex-wrap mb-3">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search staff…"
              className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-surface border border-border text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/20"
            />
          </div>
          <div className="w-36">
            <Select
              options={[{ value: "", label: "All roles" }, ...uniqueRoles.map((r) => ({ value: r, label: r }))]}
              value={roleFilter}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setRoleFilter(e.target.value)}
            />
          </div>
          <div className="w-40">
            <Select
              options={[
                { value: "", label: "All depts" },
                { value: "FOH", label: "FOH" },
                { value: "BOH", label: "BOH" },
                { value: "unassigned", label: "Unassigned" },
              ]}
              value={deptFilter}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setDeptFilter(e.target.value)}
            />
          </div>
        </div>

        <div className="flex items-center gap-2 px-2 py-2 border-b border-border">
          <input
            type="checkbox"
            aria-label="Select all filtered"
            checked={allFilteredSelected}
            onChange={toggleAll}
            className="cursor-pointer accent-accent"
          />
          <span className="text-xs text-text-muted">
            {filtered.length} staff · {selectedIds.size} selected
          </span>
        </div>

        <div className="max-h-[60vh] overflow-y-auto">
          {isLoading ? (
            <div className="p-6 text-center text-text-muted text-sm">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="p-6 text-center text-text-muted text-sm">No staff match the filters.</div>
          ) : (
            filtered.map((u) => (
              <label
                key={u.id}
                className="flex items-center gap-3 px-2 py-2.5 border-b border-border/50 hover:bg-surface-hover cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selectedIds.has(u.id)}
                  onChange={() => toggle(u.id)}
                  className="cursor-pointer accent-accent"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text truncate">
                    {u.full_name || u.username}
                    {!u.is_active && <span className="text-[10px] text-danger ml-1">inactive</span>}
                  </p>
                  <p className="text-xs text-text-muted">@{u.username} · {u.role_name}</p>
                </div>
                <DeptBadge value={u.department} />
              </label>
            ))
          )}
        </div>
      </div>

      {/* Right — Selected basket + Apply panel */}
      <div className="lg:col-span-1 space-y-4">
        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-bold text-text">Selected ({selectedIds.size})</h3>
            {selectedIds.size > 0 && (
              <button type="button" onClick={clearSel} className="text-xs text-text-muted hover:text-danger transition-colors">
                Clear all
              </button>
            )}
          </div>
          {selectedIds.size === 0 ? (
            <p className="text-xs text-text-muted py-2">Pick staff from the list to build your set.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5 max-h-44 overflow-y-auto">
              {selectedUsers.map((u) => (
                <span
                  key={u.id}
                  className="inline-flex items-center gap-1 px-2 py-0.5 bg-accent-muted text-accent rounded-full text-[11px] font-medium"
                >
                  {u.full_name || u.username}
                  <button type="button" onClick={() => toggle(u.id)} className="opacity-60 hover:opacity-100">×</button>
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="bg-card border border-border rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-bold text-text">Apply Changes</h3>

          <div>
            <label className="flex items-center gap-2 text-sm text-text mb-1.5">
              <input type="checkbox" checked={applyDept} onChange={(e) => setApplyDept(e.target.checked)} className="accent-accent" />
              Department
            </label>
            {applyDept && (
              <Select
                options={[
                  { value: "FOH", label: "FOH" },
                  { value: "BOH", label: "BOH" },
                  { value: "unassigned", label: "Unassigned" },
                ]}
                value={deptVal}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  setDeptVal(e.target.value as "FOH" | "BOH" | "unassigned")
                }
              />
            )}
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm text-text mb-1.5">
              <input type="checkbox" checked={applyActive} onChange={(e) => setApplyActive(e.target.checked)} className="accent-accent" />
              Status
            </label>
            {applyActive && (
              <Select
                options={[
                  { value: "activate", label: "Activate" },
                  { value: "deactivate", label: "Deactivate" },
                ]}
                value={activeVal}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  setActiveVal(e.target.value as "activate" | "deactivate")
                }
              />
            )}
          </div>

          <div>
            <label className="flex items-center gap-2 text-sm text-text mb-1.5">
              <input type="checkbox" checked={applyHourly} onChange={(e) => setApplyHourly(e.target.checked)} className="accent-accent" />
              Hourly rate
            </label>
            {applyHourly && (
              <Input
                type="number"
                min={0}
                step={0.01}
                placeholder="Empty = inherit default"
                value={hourlyVal}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setHourlyVal(e.target.value)}
              />
            )}
          </div>

          <Button
            variant="primary"
            onClick={() => void apply()}
            isLoading={bulkUpdate.isPending}
            disabled={selectedIds.size === 0 || !anyFieldEnabled || bulkUpdate.isPending}
            className="w-full"
          >
            Apply to {selectedIds.size} staff
          </Button>
          <p className="text-[11px] text-text-muted">Role and store assignment will be added here next.</p>
        </div>
      </div>
    </div>
  );
}
