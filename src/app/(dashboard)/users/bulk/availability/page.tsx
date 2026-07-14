"use client";

/**
 * Set Work Availability (admin registration path) — master-detail.
 *
 * Third tab of Bulk Staff Management (renders below the shared bulk tab shell).
 * Left: every active staff member with a set/not-set status dot + a weekly
 * strip. Right: the selected member's weekly editor (AvailabilityDayEditor)
 * with a preset toolbar. Presets (top-left) apply a saved template or save the
 * current week as a new one; navigation + Reset + Save sit top-right. Save
 * persists the current member only (no auto-advance); Prev/Next step through
 * the list; Reset reverts to the last saved (server) state.
 *
 * Gated by `availability:manage` (also enforced page-level via PAGE_PERMISSIONS).
 */

import React, { useState, useMemo, useEffect, useCallback } from "react";
import { Search, ChevronLeft, ChevronRight, RotateCcw } from "lucide-react";
import { useUsers } from "@/hooks/useUsers";
import {
  useAvailabilityBulk,
  useStaffAvailability,
  useSaveAvailability,
  usePresets,
} from "@/hooks/useAvailability";
import { usePermissions } from "@/hooks/usePermissions";
import { useTimezone } from "@/hooks/useTimezone";
import { PERMISSIONS } from "@/lib/permissions";
import { formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useModal } from "@/components/ui/imperative-modal";
import { AvailabilityStrip } from "@/components/availability/AvailabilityStrip";
import { AvailabilityDayEditor } from "@/components/availability/AvailabilityDayEditor";
import { AvailabilityPresetPicker } from "@/components/availability/AvailabilityPresetPicker";
import {
  toRoutine,
  toDaysInput,
  validateRoutine,
  routinesEqual,
  type AvailabilityDay,
  type AvailabilityMember,
  type User,
} from "@/types";

/** initials from a display name, e.g. "John Smith" → "JS" */
function initials(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export default function BulkAvailabilityPage(): React.ReactElement {
  const tz = useTimezone();
  const modal = useModal();
  const { hasPermission } = usePermissions();
  const canManage = hasPermission(PERMISSIONS.AVAILABILITY_MANAGE);

  const { data: usersData, isLoading: usersLoading } = useUsers();
  const { data: availData } = useAvailabilityBulk(undefined, true);
  const { data: presets } = usePresets(canManage);

  const staff: User[] = useMemo(
    () => (Array.isArray(usersData) ? usersData.filter((u) => u.is_active) : []),
    [usersData],
  );

  const availMap = useMemo(
    () => new Map((availData ?? []).map((m: AvailabilityMember) => [m.user_id, m])),
    [availData],
  );

  /** A member counts as "set" once its availability has been saved at least once. */
  const isSet = useCallback(
    (userId: string): boolean => availMap.get(userId)?.updated_at != null,
    [availMap],
  );

  const [search, setSearch] = useState("");
  const [selId, setSelId] = useState<string>("");

  const filtered: User[] = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return staff;
    return staff.filter(
      (u) =>
        u.full_name.toLowerCase().includes(q) ||
        u.username.toLowerCase().includes(q),
    );
  }, [staff, search]);

  // Pick an initial selection once staff load: first unset, else first.
  useEffect(() => {
    if (selId || staff.length === 0) return;
    const firstUnset = staff.find((u) => !isSet(u.id));
    setSelId((firstUnset ?? staff[0]).id);
  }, [staff, selId, isSet]);

  const selected: User | undefined = useMemo(
    () => staff.find((u) => u.id === selId),
    [staff, selId],
  );

  // Selected member's current week + save mutation.
  const { data: detail, isLoading: detailLoading } = useStaffAvailability(
    selId || undefined,
    !!selId,
  );
  const save = useSaveAvailability(selId);

  const [routine, setRoutine] = useState<AvailabilityDay[]>(() => toRoutine(undefined));
  const serverDays = detail?.member.days;
  useEffect(() => {
    setRoutine(toRoutine(serverDays));
  }, [serverDays, selId]);

  // Unsaved changes vs. the last saved (server) state — drives Reset/Save.
  const dirty = useMemo(
    () => !routinesEqual(routine, toRoutine(serverDays)),
    [routine, serverDays],
  );

  // Position of the selected member within the currently-shown list (for nav).
  const idxInList = useMemo(
    () => filtered.findIndex((u) => u.id === selId),
    [filtered, selId],
  );

  const doneCount = useMemo(
    () => staff.filter((u) => isSet(u.id)).length,
    [staff, isSet],
  );
  const pct = staff.length > 0 ? Math.round((doneCount / staff.length) * 100) : 0;

  function change(day: number, value: AvailabilityDay): void {
    setRoutine((prev) => {
      const next = [...prev];
      next[day] = value;
      return next;
    });
  }

  /** Apply a whole week (e.g. from a preset). */
  function applyRoutine(next: AvailabilityDay[]): void {
    setRoutine(next);
  }

  /** Switch to another member, guarding unsaved edits first. */
  async function switchTo(id: string): Promise<void> {
    if (id === selId) return;
    // 저장 진행 중에는 전환 금지 — 미저장 프롬프트 오표시 + 저장 실패 시 편집 유실 방지.
    if (save.isPending) return;
    if (dirty) {
      const ok = await modal.confirm({
        title: "Discard unsaved changes?",
        message: `You have unsaved availability edits${
          selected ? " for " + (selected.full_name ?? "this staff") : ""
        }. Discard them?`,
        confirmLabel: "Discard",
        variant: "danger",
      });
      if (!ok) return;
    }
    setSelId(id);
  }

  /** Step to another member in the visible list. */
  function goto(i: number): void {
    if (i >= 0 && i < filtered.length) void switchTo(filtered[i].id);
  }

  /** Revert the editor to the last saved (server) state. */
  function reset(): void {
    setRoutine(toRoutine(serverDays));
  }

  async function handleSave(): Promise<void> {
    if (!selId) return;
    const err = validateRoutine(routine);
    if (err) {
      void modal.alert({ type: "error", message: err });
      return;
    }
    try {
      await save.mutateAsync(toDaysInput(routine));
      // Saved in place — no auto-advance; the refetched server state clears dirty.
    } catch {
      // save hook fires its own error modal
    }
  }

  if (usersLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <h1 className="text-2xl font-extrabold text-text">Set Work Availability</h1>
      <p className="mt-1 max-w-[680px] text-[13px] text-text-secondary">
        Set each person&apos;s weekly availability here, one at a time. Use
        presets to go fast. Staff can also self-enter from the app.
      </p>

      {/* Progress */}
      <div className="mt-4 flex items-center gap-3">
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-surface-hover">
          <div
            className="h-full rounded-full bg-accent transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="whitespace-nowrap text-[13px] font-semibold text-text-secondary">
          {doneCount} of {staff.length} set
        </span>
      </div>

      <div className="mt-5 flex flex-col gap-4 lg:flex-row">
        {/* Left — staff list */}
        <div className="shrink-0 overflow-hidden rounded-xl border border-border bg-surface lg:w-[320px]">
          <div className="border-b border-border p-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" />
              <input
                type="text"
                placeholder="Search staff..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-lg border border-border bg-bg py-1.5 pl-8 pr-3 text-[12px] text-text placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/50"
              />
            </div>
          </div>
          <div className="max-h-[560px] overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="px-4 py-6 text-center text-[13px] text-text-muted">
                No staff found.
              </p>
            ) : (
              filtered.map((u) => {
                const set = isSet(u.id);
                const active = u.id === selId;
                const member = availMap.get(u.id);
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => void switchTo(u.id)}
                    className={`flex w-full items-center gap-3 border-b border-border px-4 py-2.5 text-left last:border-0 transition-colors ${
                      active ? "bg-accent-muted" : "hover:bg-surface-hover"
                    }`}
                  >
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${
                        set ? "bg-success" : "bg-warning"
                      }`}
                      title={set ? "Set" : "Not set"}
                    />
                    <span className="min-w-0 flex-1">
                      <span
                        className={`block truncate text-[13px] ${
                          active ? "font-bold text-accent" : "font-medium text-text"
                        }`}
                      >
                        {u.full_name || u.username}
                      </span>
                      <span className="block truncate text-[11px] uppercase text-text-muted">
                        {u.role_name}
                      </span>
                    </span>
                    <AvailabilityStrip routine={toRoutine(member?.days)} />
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right — selected member editor */}
        <div className="flex-1 overflow-hidden rounded-xl border border-border bg-surface">
          {!selected ? (
            <div className="flex h-64 items-center justify-center text-[13px] text-text-muted">
              Select a staff member to set their availability.
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 border-b border-border px-5 py-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-muted text-[12px] font-bold text-accent">
                  {initials(selected.full_name || selected.username)}
                </div>
                <div className="min-w-0">
                  <div className="truncate text-[15px] font-bold text-text">
                    {selected.full_name || selected.username}
                  </div>
                  <div className="truncate text-[12px] text-text-secondary">
                    {selected.role_name}
                    {selected.employee_no ? ` · ${selected.employee_no}` : ""}
                  </div>
                </div>
                <div className="ml-auto flex shrink-0 items-center gap-3">
                  {idxInList >= 0 && (
                    <span className="text-[12px] font-medium tabular-nums text-text-muted">
                      {idxInList + 1} / {filtered.length}
                    </span>
                  )}
                  <span
                    className="text-[12px] font-semibold"
                    style={{
                      color: isSet(selected.id)
                        ? "var(--color-success)"
                        : "var(--color-warning)",
                    }}
                  >
                    {isSet(selected.id) ? "Set" : "Not set"}
                  </span>
                </div>
              </div>
              <div className="p-5">
                {/* Toolbar — presets (left) · nav + Reset + Save (right) */}
                {canManage && (
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                    <AvailabilityPresetPicker
                      presets={presets ?? []}
                      onApply={applyRoutine}
                      showSaveAs
                      currentRoutine={routine}
                      disabled={detailLoading}
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => goto(idxInList - 1)}
                        disabled={idxInList <= 0 || save.isPending}
                        className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[12px] font-semibold text-text-secondary hover:bg-surface-hover disabled:opacity-40"
                      >
                        <ChevronLeft className="h-3.5 w-3.5" />
                        Prev
                      </button>
                      <button
                        type="button"
                        onClick={() => goto(idxInList + 1)}
                        disabled={
                          idxInList < 0 ||
                          idxInList >= filtered.length - 1 ||
                          save.isPending
                        }
                        className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[12px] font-semibold text-text-secondary hover:bg-surface-hover disabled:opacity-40"
                      >
                        Next
                        <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                      <span className="mx-1 h-4 w-px bg-border" />
                      <button
                        type="button"
                        onClick={reset}
                        disabled={!dirty || detailLoading}
                        className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[12px] font-semibold text-text-secondary hover:bg-surface-hover disabled:opacity-40"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        Reset
                      </button>
                      <Button
                        variant="primary"
                        onClick={handleSave}
                        isLoading={save.isPending}
                        disabled={detailLoading || !dirty}
                      >
                        Save
                      </Button>
                    </div>
                  </div>
                )}
                <p className="mb-3 text-[12px] text-text-secondary">
                  Set each day: Off, a time range, or Full day. Week starts Sunday.
                </p>
                {detailLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <LoadingSpinner size="lg" />
                  </div>
                ) : (
                  <AvailabilityDayEditor
                    routine={routine}
                    onChange={change}
                    disabled={!canManage}
                  />
                )}
                <div className="mt-4 text-[12px] text-text-muted">
                  {availMap.get(selected.id)?.updated_at
                    ? `Last updated ${formatDate(
                        availMap.get(selected.id)!.updated_at,
                        tz,
                      )}`
                    : "Not set yet"}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
