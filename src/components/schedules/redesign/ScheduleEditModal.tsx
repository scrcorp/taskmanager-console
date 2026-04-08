"use client";

/**
 * ScheduleEditModal — server types 직접 사용. mockup type 의존 없음.
 */

import { useState, useEffect } from "react";
import { useWorkRoles } from "@/hooks/useWorkRoles";
import type { Schedule, User, WorkRole } from "@/types";

export interface ScheduleEditPayload {
  userId: string;
  date: string;
  startTime: string;  // "HH:MM"
  endTime: string;
  workRoleId: string | null;
  notes: string;
  /** stored hourly rate. null = clear (자동 cascade로 표시되지 않음 → No cost). */
  hourlyRate: number | null;
}

// Status 전환은 dedicated actions (submit / confirm / reject / revert / cancel)로만.
// 여기선 편집 불가 — 현재 status는 header에 배지로 read-only 표시.

interface Props {
  open: boolean;
  mode: "add" | "edit";
  schedule?: Schedule | null;
  prefilledUserId?: string;
  prefilledDate?: string;
  users: User[];
  storeId: string;
  /** 선택된 user의 cascade rate (user → store → org) — placeholder/Apply 버튼용 */
  inheritedRate?: number | null;
  /** Cost 정보 표시/편집 가능 여부. false면 hourly_rate input 자체 숨김 (SV/Staff). */
  showCost?: boolean;
  onClose: () => void;
  onSave: (payload: ScheduleEditPayload) => void;
  onDelete?: () => void;
  isSaving?: boolean;
}

function workRoleLabel(wr: WorkRole): string {
  if (wr.name) return wr.name;
  return `${wr.shift_name ?? ""} - ${wr.position_name ?? ""}`.trim();
}

function getInitials(name: string | null | undefined): string {
  if (!name) return "??";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "??";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return ((parts[0]![0] ?? "") + (parts[parts.length - 1]![0] ?? "")).toUpperCase();
}

function rolePriorityToColor(p: number): string {
  if (p <= 20) return "bg-[var(--color-accent-muted)] text-[var(--color-accent)]";
  if (p <= 30) return "bg-[var(--color-warning-muted)] text-[var(--color-warning)]";
  return "bg-[var(--color-success-muted)] text-[var(--color-success)]";
}

export function ScheduleEditModal({ open, mode, schedule, prefilledUserId, prefilledDate, users, storeId, inheritedRate, showCost = true, onClose, onSave, onDelete, isSaving }: Props) {
  const [userId, setUserId] = useState(prefilledUserId || users[0]?.id || "");
  const [date, setDate] = useState(prefilledDate || new Date().toISOString().slice(0, 10));
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [workRoleId, setWorkRoleId] = useState<string>("");
  const [notes, setNotes] = useState("");
  // hourly rate input as string ("" = clear/null)
  const [hourlyRateInput, setHourlyRateInput] = useState<string>("");

  const workRolesQ = useWorkRoles(storeId || undefined);
  const workRoles = workRolesQ.data ?? [];

  useEffect(() => {
    if (!open) return;
    if (mode === "edit" && schedule) {
      setUserId(schedule.user_id);
      setDate(schedule.work_date);
      setStartTime(schedule.start_time?.slice(0, 5) ?? "09:00");
      setEndTime(schedule.end_time?.slice(0, 5) ?? "17:00");
      setWorkRoleId(schedule.work_role_id ?? "");
      setNotes(schedule.note ?? "");
      setHourlyRateInput(schedule.hourly_rate != null && schedule.hourly_rate > 0 ? String(schedule.hourly_rate) : "");
    } else if (mode === "add") {
      setUserId(prefilledUserId || users[0]?.id || "");
      setDate(prefilledDate || new Date().toISOString().slice(0, 10));
      setStartTime("09:00");
      setEndTime("17:00");
      setWorkRoleId("");
      setNotes("");
      setHourlyRateInput("");
    }
  }, [open, mode, schedule, prefilledUserId, prefilledDate, users]);

  // work role 선택 시 default time 자동 채움 (add + edit 모두)
  useEffect(() => {
    if (!workRoleId || !open) return;
    const wr = workRoles.find((w) => w.id === workRoleId);
    if (!wr) return;
    if (wr.default_start_time && wr.default_end_time) {
      setStartTime(wr.default_start_time.slice(0, 5));
      setEndTime(wr.default_end_time.slice(0, 5));
    }
  }, [workRoleId, workRoles, open]);

  if (!open) return null;

  const selectedUser = users.find((u) => u.id === userId);

  function handleSave() {
    let hourlyRate: number | null;
    if (!showCost) {
      // SV/Staff: hourly_rate 편집 권한 없음 → 기존 값 유지 (schedule의 stored 그대로)
      hourlyRate = schedule?.hourly_rate ?? null;
    } else {
      const trimmed = hourlyRateInput.trim();
      const parsedRate = trimmed === "" ? null : Number(trimmed);
      hourlyRate = parsedRate != null && Number.isFinite(parsedRate) && parsedRate > 0 ? parsedRate : null;
    }
    onSave({ userId, date, startTime, endTime, workRoleId: workRoleId || null, notes, hourlyRate });
  }

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-[0_16px_48px_rgba(0,0,0,0.2)] w-full max-w-md max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[var(--color-border)] flex items-center justify-between">
          <h2 className="text-[15px] font-bold text-[var(--color-text)]">
            {mode === "add" ? "Add Schedule" : "Edit Schedule"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-[var(--color-surface-hover)] flex items-center justify-center text-[var(--color-text-muted)]"
            aria-label="Close"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <line x1="4" y1="4" x2="12" y2="12" /><line x1="12" y1="4" x2="4" y2="12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <div className="px-5 py-4 space-y-3.5">
          {/* Staff */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-1.5">Staff</label>
            <div className="flex items-center gap-2">
              {selectedUser && (
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${rolePriorityToColor(selectedUser.role_priority)}`}>
                  {getInitials(selectedUser.full_name)}
                </div>
              )}
              <select
                value={userId}
                onChange={(e) => setUserId(e.target.value)}
                className="flex-1 px-3 py-2 border border-[var(--color-border)] rounded-lg text-[13px] bg-white"
              >
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.full_name || u.username}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Date */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-1.5">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg text-[13px] bg-white"
            />
          </div>

          {/* Time */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-1.5">Start</label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg text-[13px] bg-white"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-1.5">End</label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg text-[13px] bg-white"
              />
            </div>
          </div>

          {/* Work Role */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-1.5">Work Role</label>
            <select
              value={workRoleId}
              onChange={(e) => setWorkRoleId(e.target.value)}
              className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg text-[13px] bg-white"
            >
              <option value="">— None (no role) —</option>
              {workRolesQ.isLoading && <option disabled>Loading…</option>}
              {workRoles.map((wr) => (
                <option key={wr.id} value={wr.id}>{workRoleLabel(wr)}</option>
              ))}
            </select>
            {workRoles.length === 0 && !workRolesQ.isLoading && (
              <p className="text-[11px] text-[var(--color-text-muted)] mt-1">
                No work roles defined for this store yet. Add some in Schedule Settings.
              </p>
            )}
          </div>

          {/* Hourly Rate (override) — GM/Owner only */}
          {showCost && (
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-1.5">
              Hourly Rate <span className="text-[var(--color-text-muted)] normal-case font-normal">(stored on this schedule)</span>
            </label>
            <div className="flex items-center gap-2">
              <div className="flex items-center flex-1 px-3 py-2 border border-[var(--color-border)] rounded-lg bg-white focus-within:border-[var(--color-accent)]">
                <span className="text-[13px] text-[var(--color-text-muted)] mr-1">$</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={hourlyRateInput}
                  onChange={(e) => setHourlyRateInput(e.target.value)}
                  placeholder={inheritedRate != null ? `${inheritedRate} (current default)` : "No rate"}
                  className="flex-1 text-[13px] outline-none bg-transparent tabular-nums"
                />
                <span className="text-[11px] text-[var(--color-text-muted)] ml-1">/hr</span>
              </div>
              {inheritedRate != null && (
                <button
                  type="button"
                  onClick={() => setHourlyRateInput(String(inheritedRate))}
                  className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-[var(--color-accent-muted)] text-[var(--color-accent)] hover:bg-[var(--color-accent)] hover:text-white transition-colors whitespace-nowrap"
                  title="Fill with current cascade rate"
                >
                  Use ${inheritedRate}
                </button>
              )}
            </div>
            <p className="text-[10px] text-[var(--color-text-muted)] mt-1">
              Empty = no cost (must apply rate later via context menu or detail page).
            </p>
          </div>
          )}

          {/* Status (read-only display) — 전환은 detail의 action 버튼으로 */}
          {mode === "edit" && schedule && (
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-1.5">Status</label>
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                  schedule.status === "confirmed" ? "bg-[var(--color-success-muted)] text-[var(--color-success)]" :
                  schedule.status === "requested" ? "bg-[var(--color-warning-muted)] text-[var(--color-warning)]" :
                  schedule.status === "rejected"  ? "bg-[var(--color-danger-muted)] text-[var(--color-danger)]" :
                  schedule.status === "cancelled" ? "bg-[var(--color-bg)] text-[var(--color-text-muted)]" :
                                                    "bg-[var(--color-bg)] text-[var(--color-text-muted)]"
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${
                    schedule.status === "confirmed" ? "bg-[var(--color-success)]" :
                    schedule.status === "requested" ? "bg-[var(--color-warning)]" :
                    schedule.status === "rejected"  ? "bg-[var(--color-danger)]" :
                                                      "bg-[var(--color-text-muted)]"
                  }`} />
                  {schedule.status}
                </span>
                <span className="text-[10px] text-[var(--color-text-muted)]">
                  Use action buttons to change status
                </span>
              </div>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-1.5">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add any notes about this shift..."
              className="w-full min-h-[60px] px-3 py-2 text-[12px] border border-[var(--color-border)] rounded-lg resize-none focus:outline-none focus:border-[var(--color-accent)]"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-[var(--color-border)] flex items-center gap-2">
          {mode === "edit" && onDelete && (
            <button
              type="button"
              onClick={onDelete}
              className="px-3.5 py-2 rounded-lg text-[12px] font-semibold text-[var(--color-danger)] hover:bg-[var(--color-danger-muted)]"
            >
              Delete
            </button>
          )}
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-[13px] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="px-4 py-2 rounded-lg text-[13px] font-semibold bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
