"use client";

/**
 * BlockEditModal — 선택된 스케줄 블록들을 일괄 수정하는 모달.
 *
 * 각 행: 체크박스 + 직원명/날짜 + 현재 시간 → 새 Work Role/Start/End
 * unchecked 행은 건너뜀.
 * "Apply to N" 클릭 → checked 행에 대해 PATCH /bulk 호출.
 */

import { useState, useRef, useEffect } from "react";
import type { Schedule, WorkRole } from "@/types";

const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => {
  const h = Math.floor(i / 2);
  const m = i % 2 === 0 ? "00" : "30";
  return `${String(h).padStart(2, "0")}:${m}`;
});

interface Override {
  workRoleId?: string;
  startTime?: string;
  endTime?: string;
  breakStartTime?: string;
  breakEndTime?: string;
  status?: "draft" | "requested" | "confirmed";
}

interface BlockEditModalProps {
  open: boolean;
  selectedSchedules: Schedule[];
  workRoles: WorkRole[];
  isSubmitting: boolean;
  onApply: (updates: { id: string; workRoleId: string | null | undefined; startTime: string | undefined; endTime: string | undefined; breakStartTime?: string; breakEndTime?: string; resetChecklist?: boolean; status?: "draft" | "requested" | "confirmed" }[]) => void;
  onClose: () => void;
}

function workRoleLabel(wr: WorkRole): string {
  return wr.name || `${wr.shift_name ?? ""} - ${wr.position_name ?? ""}`.replace(/^[\s-]+|[\s-]+$/g, "") || "Unnamed role";
}

function fmtDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function getInitials(name: string | null | undefined): string {
  if (!name) return "??";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "??";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return ((parts[0]![0] ?? "") + (parts[parts.length - 1]![0] ?? "")).toUpperCase();
}

const STATUS_COLORS: Record<string, string> = {
  confirmed: "bg-[var(--color-success-muted)] text-[var(--color-success)]",
  requested: "bg-[var(--color-warning-muted)] text-[var(--color-warning)]",
  draft: "bg-[var(--color-border)] text-[var(--color-text-secondary)]",
};

export function BlockEditModal({
  open,
  selectedSchedules,
  workRoles,
  isSubmitting,
  onApply,
  onClose,
}: BlockEditModalProps) {
  const [unchecked, setUnchecked] = useState<Set<string>>(new Set());
  const [overrides, setOverrides] = useState<Map<string, Override>>(new Map());
  const [globalWorkRole, setGlobalWorkRole] = useState("");
  const [globalStart, setGlobalStart] = useState("");
  const [globalEnd, setGlobalEnd] = useState("");
  const [globalBreakStart, setGlobalBreakStart] = useState("");
  const [globalBreakEnd, setGlobalBreakEnd] = useState("");
  const [globalStatus, setGlobalStatus] = useState<"" | "draft" | "requested" | "confirmed">("");
  /** Work Role 변경 시 각 스케줄의 체크리스트 인스턴스를 새 템플릿으로 교체할지 여부 */
  const [resetChecklists, setResetChecklists] = useState<boolean>(true);

  useEffect(() => {
    if (open) {
      setUnchecked(new Set());
      setOverrides(new Map());
      setGlobalWorkRole("");
      setGlobalStart("");
      setGlobalEnd("");
      setGlobalBreakStart("");
      setGlobalBreakEnd("");
      setGlobalStatus("");
      setResetChecklists(true);
    }
  }, [open]);

  const headerCheckRef = useRef<HTMLInputElement>(null);
  const checkedCount = selectedSchedules.filter((s) => !unchecked.has(s.id)).length;

  useEffect(() => {
    if (!headerCheckRef.current) return;
    const allChecked = unchecked.size === 0 && selectedSchedules.length > 0;
    const allUnchecked = unchecked.size === selectedSchedules.length;
    headerCheckRef.current.indeterminate = !allChecked && !allUnchecked;
    headerCheckRef.current.checked = allChecked;
  }, [unchecked, selectedSchedules.length]);

  function toggleRow(id: string) {
    setUnchecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (unchecked.size === 0) {
      setUnchecked(new Set(selectedSchedules.map((s) => s.id)));
    } else {
      setUnchecked(new Set());
    }
  }

  function setOverride(id: string, field: keyof Override, value: string) {
    setOverrides((prev) => {
      const next = new Map(prev);
      const cur = next.get(id) ?? {};
      next.set(id, { ...cur, [field]: value || undefined });
      return next;
    });
  }

  function applyGlobal(field: keyof Override, value: string) {
    setOverrides((prev) => {
      const next = new Map(prev);
      for (const s of selectedSchedules) {
        if (unchecked.has(s.id)) continue;
        const cur = next.get(s.id) ?? {};
        next.set(s.id, { ...cur, [field]: value || undefined });
      }
      return next;
    });
  }

  function handleApply() {
    const updates = selectedSchedules
      .filter((s) => !unchecked.has(s.id))
      .map((s) => {
        const ov = overrides.get(s.id) ?? {};
        const workRoleChanged = "workRoleId" in ov && (ov.workRoleId || null) !== (s.work_role_id ?? null);
        // status는 현재값과 다를 때만 보낸다 (no-op 호출 줄이기)
        const statusChanged = ov.status !== undefined && ov.status !== s.status;
        return {
          id: s.id,
          workRoleId: "workRoleId" in ov ? (ov.workRoleId || null) : undefined,
          startTime: ov.startTime,
          endTime: ov.endTime,
          breakStartTime: ov.breakStartTime,
          breakEndTime: ov.breakEndTime,
          resetChecklist: workRoleChanged ? resetChecklists : undefined,
          status: statusChanged ? ov.status : undefined,
        };
      });
    if (updates.length === 0) return;
    onApply(updates);
  }

  // 변경사항이 있는 checked 행만 카운트 — status도 포함.
  // status는 현재값과 다를 때만 "변경"으로 친다 (no-op select 클릭은 제외).
  const hasChanges = selectedSchedules
    .filter((s) => !unchecked.has(s.id))
    .some((s) => {
      const ov = overrides.get(s.id);
      if (!ov) return false;
      const fieldChanged = ov.workRoleId !== undefined || ov.startTime !== undefined || ov.endTime !== undefined || ov.breakStartTime !== undefined || ov.breakEndTime !== undefined;
      const statusChanged = ov.status !== undefined && ov.status !== s.status;
      return fieldChanged || statusChanged;
    });

  // work_role이 실제로 변경되는 checked 행 수 — reset_checklist UI 조건부 노출용
  const workRoleChangeCount = selectedSchedules
    .filter((s) => !unchecked.has(s.id))
    .filter((s) => {
      const ov = overrides.get(s.id);
      return ov && "workRoleId" in ov && (ov.workRoleId || null) !== (s.work_role_id ?? null);
    }).length;

  if (!open) return null;

  const activeWorkRoles = workRoles.filter((wr) => wr.is_active);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" />
      <div className="relative bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl shadow-2xl w-[min(940px,96vw)] max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)]">
          <div>
            <h2 className="text-[16px] font-semibold text-[var(--color-text)]">Edit Selected Schedules</h2>
            <p className="text-[12px] text-[var(--color-text-secondary)] mt-0.5">
              {selectedSchedules.length} schedules selected · Uncheck rows to skip
            </p>
          </div>
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] transition-colors">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="1" y1="1" x2="13" y2="13" /><line x1="13" y1="1" x2="1" y2="13" /></svg>
          </button>
        </div>

        {/* Global override row */}
        <div className="px-5 py-3 bg-[var(--color-bg)] border-b border-[var(--color-border)] flex items-center gap-3">
          <span className="text-[12px] font-semibold text-[var(--color-text-secondary)] shrink-0 w-[100px]">Apply to all:</span>
          <select
            value={globalWorkRole}
            onChange={(e) => { setGlobalWorkRole(e.target.value); applyGlobal("workRoleId", e.target.value); }}
            className="flex-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-2 py-1.5 text-[12px] text-[var(--color-text)] min-w-0"
          >
            <option value="">— Work Role —</option>
            {activeWorkRoles.map((wr) => (
              <option key={wr.id} value={wr.id}>{workRoleLabel(wr)}</option>
            ))}
          </select>
          <select
            value={globalStart}
            onChange={(e) => { setGlobalStart(e.target.value); applyGlobal("startTime", e.target.value); }}
            className="w-[90px] bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-2 py-1.5 text-[12px] text-[var(--color-text)] shrink-0"
          >
            <option value="">Start</option>
            {TIME_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <span className="text-[var(--color-text-muted)] text-[12px] shrink-0">→</span>
          <select
            value={globalEnd}
            onChange={(e) => { setGlobalEnd(e.target.value); applyGlobal("endTime", e.target.value); }}
            className="w-[80px] bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-2 py-1.5 text-[12px] text-[var(--color-text)] shrink-0"
          >
            <option value="">End</option>
            {TIME_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <span className="text-[var(--color-text-muted)] text-[11px] shrink-0">Break:</span>
          <select
            value={globalBreakStart}
            onChange={(e) => { setGlobalBreakStart(e.target.value); applyGlobal("breakStartTime", e.target.value); }}
            className="w-[80px] bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-2 py-1.5 text-[12px] text-[var(--color-text)] shrink-0"
          >
            <option value="">—</option>
            {TIME_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <span className="text-[var(--color-text-muted)] text-[11px] shrink-0">→</span>
          <select
            value={globalBreakEnd}
            onChange={(e) => { setGlobalBreakEnd(e.target.value); applyGlobal("breakEndTime", e.target.value); }}
            className="w-[80px] bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-2 py-1.5 text-[12px] text-[var(--color-text)] shrink-0"
          >
            <option value="">—</option>
            {TIME_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select
            value={globalStatus}
            onChange={(e) => {
              const v = e.target.value as "" | "requested" | "confirmed";
              setGlobalStatus(v);
              if (v) applyGlobal("status", v);
            }}
            title="Apply status to all checked rows"
            className="w-[100px] bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg px-2 py-1.5 text-[12px] text-[var(--color-text)] shrink-0"
          >
            <option value="">— Status —</option>
            <option value="confirmed">Confirmed</option>
            <option value="requested">Requested</option>
          </select>
        </div>

        {/* Table header */}
        <div className="grid grid-cols-[40px_1fr_90px_110px_80px_16px_80px_80px_16px_80px] items-center gap-2 px-5 py-2 border-b border-[var(--color-border)] bg-[var(--color-bg)]">
          <div className="flex items-center justify-center">
            <input ref={headerCheckRef} type="checkbox" onChange={toggleAll} className="w-4 h-4 accent-[var(--color-accent)] cursor-pointer" />
          </div>
          <span className="text-[11px] font-semibold text-[var(--color-text-secondary)] uppercase tracking-wide">Staff / Date</span>
          <span className="text-[11px] font-semibold text-[var(--color-text-secondary)] uppercase tracking-wide">Current</span>
          <span className="text-[11px] font-semibold text-[var(--color-text-secondary)] uppercase tracking-wide">Work Role</span>
          <span className="text-[11px] font-semibold text-[var(--color-text-secondary)] uppercase tracking-wide">Start</span>
          <span />
          <span className="text-[11px] font-semibold text-[var(--color-text-secondary)] uppercase tracking-wide">End</span>
          <span className="text-[11px] font-semibold text-[var(--color-text-secondary)] uppercase tracking-wide">Break</span>
          <span />
          <span className="text-[11px] font-semibold text-[var(--color-text-secondary)] uppercase tracking-wide" />
        </div>

        {/* Rows */}
        <div className="overflow-y-auto flex-1">
          {selectedSchedules.map((s) => {
            const isUnchecked = unchecked.has(s.id);
            const ov = overrides.get(s.id) ?? {};
            const statusColor = STATUS_COLORS[s.status] ?? STATUS_COLORS.draft!;
            const workRoleName = s.work_role_name_snapshot ?? s.work_role_name ?? "—";

            return (
              <div
                key={s.id}
                className={`grid grid-cols-[40px_1fr_90px_110px_80px_16px_80px_80px_16px_80px] items-center gap-2 px-5 py-2.5 border-b border-[var(--color-border)] last:border-0 transition-opacity ${isUnchecked ? "opacity-40" : ""}`}
              >
                {/* Checkbox */}
                <div className="flex items-center justify-center">
                  <input
                    type="checkbox"
                    checked={!isUnchecked}
                    onChange={() => toggleRow(s.id)}
                    className="w-4 h-4 accent-[var(--color-accent)] cursor-pointer"
                  />
                </div>
                {/* Staff + Date + Store */}
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-7 h-7 rounded-full bg-[var(--color-accent-muted)] text-[var(--color-accent)] flex items-center justify-center text-[10px] font-bold shrink-0">
                    {getInitials(s.user_name)}
                  </div>
                  <div className="min-w-0">
                    <div className="text-[12px] font-semibold text-[var(--color-text)] truncate">{s.user_name ?? "Unknown"}</div>
                    <div className="text-[11px] text-[var(--color-text-muted)] truncate">{fmtDate(s.work_date)} · {s.store_name ?? "—"}</div>
                  </div>
                </div>
                {/* Status select (editable) + current times.
                    Confirmed/Requested only — draft is the system-internal initial state
                    for unsaved previews and shouldn't be reachable for existing schedules. */}
                <div className="min-w-0">
                  {(() => {
                    // 현재 status가 draft (preview 행)이면 select 노출값은 confirmed로 normalize.
                    const rawStatus = (ov.status ?? s.status) as string;
                    const effStatus = rawStatus === "draft" ? "confirmed" : rawStatus;
                    const effColor = STATUS_COLORS[effStatus] ?? statusColor;
                    return (
                      <select
                        value={effStatus}
                        onChange={(e) => setOverride(s.id, "status", e.target.value)}
                        disabled={isUnchecked}
                        title="Change status on save"
                        className={`text-[10px] font-semibold rounded px-1.5 py-0.5 border-0 cursor-pointer disabled:cursor-not-allowed ${effColor}`}
                      >
                        <option value="confirmed">Confirmed</option>
                        <option value="requested">Requested</option>
                      </select>
                    );
                  })()}
                  <div className="text-[11px] text-[var(--color-text-muted)] mt-0.5 truncate">
                    {s.start_time}–{s.end_time}
                  </div>
                </div>
                {/* Work Role override */}
                <select
                  value={ov.workRoleId ?? (s.work_role_id ?? "")}
                  onChange={(e) => setOverride(s.id, "workRoleId", e.target.value)}
                  disabled={isUnchecked}
                  title={workRoleName}
                  className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-2 py-1 text-[11px] text-[var(--color-text)] disabled:cursor-not-allowed truncate"
                >
                  <option value="">— Keep current —</option>
                  {activeWorkRoles.map((wr) => (
                    <option key={wr.id} value={wr.id}>{workRoleLabel(wr)}</option>
                  ))}
                </select>
                {/* Start override */}
                <select
                  value={ov.startTime ?? ""}
                  onChange={(e) => setOverride(s.id, "startTime", e.target.value)}
                  disabled={isUnchecked}
                  className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-2 py-1 text-[11px] text-[var(--color-text)] disabled:cursor-not-allowed"
                >
                  <option value="">{s.start_time ?? "—"}</option>
                  {TIME_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <span className="text-[var(--color-text-muted)] text-[10px] text-center">→</span>
                {/* End override */}
                <select
                  value={ov.endTime ?? ""}
                  onChange={(e) => setOverride(s.id, "endTime", e.target.value)}
                  disabled={isUnchecked}
                  className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-2 py-1 text-[11px] text-[var(--color-text)] disabled:cursor-not-allowed"
                >
                  <option value="">{s.end_time ?? "—"}</option>
                  {TIME_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                {/* Break start */}
                <select
                  value={ov.breakStartTime ?? ""}
                  onChange={(e) => setOverride(s.id, "breakStartTime", e.target.value)}
                  disabled={isUnchecked}
                  className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-2 py-1 text-[11px] text-[var(--color-text)] disabled:cursor-not-allowed"
                >
                  <option value="">{s.break_start_time ?? "—"}</option>
                  {TIME_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
                <span className="text-[var(--color-text-muted)] text-[10px] text-center">→</span>
                {/* Break end */}
                <select
                  value={ov.breakEndTime ?? ""}
                  onChange={(e) => setOverride(s.id, "breakEndTime", e.target.value)}
                  disabled={isUnchecked}
                  className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-2 py-1 text-[11px] text-[var(--color-text)] disabled:cursor-not-allowed"
                >
                  <option value="">{s.break_end_time ?? "—"}</option>
                  {TIME_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-[var(--color-border)] gap-3 flex-wrap">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-[12px] text-[var(--color-text-secondary)]">
              {checkedCount} of {selectedSchedules.length} will be updated
            </span>
            {workRoleChangeCount > 0 && (
              <label className="flex items-center gap-1.5 text-[12px] text-[var(--color-text-secondary)] cursor-pointer">
                <input
                  type="checkbox"
                  checked={resetChecklists}
                  onChange={(e) => setResetChecklists(e.target.checked)}
                  className="w-3.5 h-3.5 accent-[var(--color-accent)]"
                />
                <span>Reset checklist on {workRoleChangeCount} work-role change{workRoleChangeCount === 1 ? "" : "s"}</span>
              </label>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-[13px] font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] transition-colors">
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApply}
              disabled={!hasChanges || isSubmitting}
              title={checkedCount > 0 && !hasChanges ? "No changes made" : undefined}
              className="px-5 py-2 rounded-lg text-[13px] font-semibold bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isSubmitting ? "Updating…" : `Apply to ${checkedCount}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
