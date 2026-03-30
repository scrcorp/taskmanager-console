"use client";

/**
 * 스케줄 생성/수정 모달 컴포넌트
 *
 * CREATE mode: 빈 셀 클릭 시 열림 — date/hour 사전 채움
 * EDIT mode: 시프트 바/칩 클릭 시 열림 — 기존 데이터 채움 + 삭제 가능
 *
 * All schedule statuses are handled via the single schedules API.
 * Status-based footer:
 *   - "requested" → Reject | Cancel | Save Changes | Confirm
 *   - "confirmed"  → Delete | Cancel | Save
 *   - "rejected"/"cancelled" → Cancel only (read-only)
 */

import React, { useState, useEffect, useCallback } from "react";
import { Trash2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Badge } from "@/components/ui/Badge";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { useCreateSchedule, useUpdateSchedule, useDeleteSchedule, useConfirmSchedule, useRejectSchedule } from "@/hooks/useSchedules";
import { useWorkRoles } from "@/hooks/useWorkRoles";
import { useUsers } from "@/hooks/useUsers";
import { useOrganization } from "@/hooks/useOrganization";
import { useStore } from "@/hooks/useStores";
import { parseApiError } from "@/lib/utils";
import type { Schedule, ScheduleCreate, ScheduleUpdate } from "@/types";

// ─── Types ────────────────────────────────────────────────────────────────────

/** Status badge mapping for EDIT mode header */
const STATUS_BADGE: Record<string, { label: string; variant: "success" | "warning" | "danger" | "accent" | "default" }> = {
  confirmed:  { label: "Confirmed",  variant: "success" },
  requested:  { label: "Pending",    variant: "accent" },
  cancelled:  { label: "Cancelled",  variant: "danger" },
  modified:   { label: "Modified",   variant: "warning" },
  rejected:   { label: "Rejected",   variant: "danger" },
};

export interface ScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  /** EDIT mode: existing schedule to edit. CREATE mode: undefined. */
  schedule?: Schedule;
  /** Store ID for filtering users and work roles */
  storeId: string;
  /** Pre-filled date (YYYY-MM-DD) for CREATE mode */
  defaultDate?: string;
  /** Pre-filled hour (0–23) for CREATE mode */
  defaultHour?: number;
  /** Pre-filled user ID for CREATE mode (from clicking on a staff row) */
  defaultUserId?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Pad single digit with leading zero */
function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Convert "HH:MM" string to total minutes from midnight */
function timeToMin(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

/** Convert total minutes from midnight to "HH:MM" string */
function minToTime(m: number): string {
  const totalMin = ((m % (24 * 60)) + 24 * 60) % (24 * 60); // wrap around midnight
  return `${pad(Math.floor(totalMin / 60))}:${pad(totalMin % 60)}`;
}

/**
 * 브레이크 자동 계산: 시프트 중간점 기준 ±15분
 * Break auto-calc: midpoint of shift ± 15 minutes (30min break)
 */
function calcBreak(startTime: string, endTime: string): { break_start: string; break_end: string } | null {
  if (!startTime || !endTime) return null;
  let startMin = timeToMin(startTime);
  let endMin = timeToMin(endTime);
  if (endMin <= startMin) endMin += 24 * 60; // overnight shift
  const duration = endMin - startMin;
  if (duration < 60) return null; // too short for a break
  const midpoint = startMin + Math.floor(duration / 2);
  return {
    break_start: minToTime(midpoint - 15),
    break_end: minToTime(midpoint + 15),
  };
}

// ─── Form state ───────────────────────────────────────────────────────────────

interface FormState {
  user_id: string;
  work_role_id: string;
  work_date: string;
  start_time: string;
  end_time: string;
  has_break: boolean;
  break_start_time: string;
  break_end_time: string;
  /** Hourly rate override — empty string means "use server cascade (org→store→user)" */
  hourly_rate: string;
  note: string;
}

function buildInitialForm(
  schedule?: Schedule,
  defaultDate?: string,
  defaultHour?: number,
  defaultUserId?: string,
): FormState {
  if (schedule) {
    // EDIT mode — populate from existing schedule
    const hasBreak = !!(schedule.break_start_time && schedule.break_end_time);
    return {
      user_id: schedule.user_id,
      work_role_id: schedule.work_role_id ?? "",
      work_date: schedule.work_date,
      start_time: schedule.start_time ?? "",
      end_time: schedule.end_time ?? "",
      has_break: hasBreak,
      break_start_time: schedule.break_start_time ?? "",
      break_end_time: schedule.break_end_time ?? "",
      hourly_rate: schedule.hourly_rate > 0 ? String(schedule.hourly_rate) : "",
      note: schedule.note ?? "",
    };
  }

  // CREATE mode — pre-fill date and start time from clicked cell
  // Default shift duration: 8h (TODO: use org/store setting when available)
  const DEFAULT_SHIFT_HOURS = 8;
  const startHour = defaultHour ?? 9;
  const endHour = (startHour + DEFAULT_SHIFT_HOURS) % 24;
  return {
    user_id: defaultUserId ?? "",
    work_role_id: "",
    work_date: defaultDate ?? "",
    start_time: `${pad(startHour)}:00`,
    end_time: `${pad(endHour)}:00`,
    has_break: false,
    break_start_time: "",
    break_end_time: "",
    hourly_rate: "",
    note: "",
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ScheduleModal({
  isOpen,
  onClose,
  schedule,
  storeId,
  defaultDate,
  defaultHour,
  defaultUserId,
}: ScheduleModalProps): React.ReactElement {
  const isEditMode = !!schedule;
  const { toast } = useToast();

  // Derive effective status for footer logic
  const effectiveStatus = schedule?.status ?? null;
  const isRequested = effectiveStatus === "requested";
  const isReadOnly = effectiveStatus === "rejected" || effectiveStatus === "cancelled";

  // Form state
  const [form, setForm] = useState<FormState>(() =>
    buildInitialForm(schedule, defaultDate, defaultHour, defaultUserId),
  );
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isRateEditing, setIsRateEditing] = useState(false);

  // Reset form when modal opens or target schedule changes
  useEffect(() => {
    if (isOpen) {
      setForm(buildInitialForm(schedule, defaultDate, defaultHour, defaultUserId));
      setShowDeleteConfirm(false);
      setIsRateEditing(false);
    }
  }, [isOpen, schedule, defaultDate, defaultHour, defaultUserId]);

  // Data
  const { data: users = [] } = useUsers(storeId ? { store_id: storeId, is_active: true } : undefined);
  const { data: workRoles = [] } = useWorkRoles(storeId || undefined);

  const { data: org } = useOrganization();
  const { data: store } = useStore(storeId || undefined);

  // Auto-fill hourly rate when defaultUserId is set and users load
  useEffect(() => {
    if (isOpen && !schedule && defaultUserId && users.length > 0 && form.user_id === defaultUserId && !form.hourly_rate) {
      const rate = resolveHourlyRate(defaultUserId);
      if (rate > 0) setField("hourly_rate", String(rate));
    }
  }, [isOpen, schedule, defaultUserId, users, form.user_id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Mutations
  const createMutation = useCreateSchedule();
  const updateMutation = useUpdateSchedule();
  const deleteMutation = useDeleteSchedule();
  const confirmMutation = useConfirmSchedule();
  const rejectMutation = useRejectSchedule();

  const isSubmitting = createMutation.isPending || updateMutation.isPending;
  const isDeleting = deleteMutation.isPending;

  // ── Field updater ────────────────────────────────────────────────────────

  const setField = useCallback(
    <K extends keyof FormState>(key: K, value: FormState[K]) => {
      setForm((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  // ── Staff selection → auto-fill hourly rate ──────────────────────────────

  // Resolve hourly rate: user > store > org (cascade)
  function resolveHourlyRate(userId: string): number {
    const selectedUser = users.find((u) => u.id === userId);
    if (selectedUser?.hourly_rate != null && selectedUser.hourly_rate > 0) return selectedUser.hourly_rate;
    if (store?.default_hourly_rate != null && store.default_hourly_rate > 0) return store.default_hourly_rate;
    if (org?.default_hourly_rate != null && org.default_hourly_rate > 0) return org.default_hourly_rate;
    return 0;
  }

  function handleStaffChange(userId: string): void {
    setField("user_id", userId);
    // Auto-fill hourly rate from cascade (only if not manually editing)
    if (!isRateEditing) {
      const rate = resolveHourlyRate(userId);
      setField("hourly_rate", String(rate));
    }
  }

  // ── Break toggle ─────────────────────────────────────────────────────────

  function handleBreakToggle(checked: boolean): void {
    if (checked && form.start_time && form.end_time) {
      // Auto-calculate break position
      const calculated = calcBreak(form.start_time, form.end_time);
      if (calculated) {
        setForm((prev) => ({
          ...prev,
          has_break: true,
          break_start_time: calculated.break_start,
          break_end_time: calculated.break_end,
        }));
        return;
      }
    }
    setForm((prev) => ({
      ...prev,
      has_break: checked,
      break_start_time: checked ? prev.break_start_time : "",
      break_end_time: checked ? prev.break_end_time : "",
    }));
  }

  // Recalculate break when start/end times change and break is active
  function handleTimeChange(field: "start_time" | "end_time", value: string): void {
    setForm((prev) => {
      const updated = { ...prev, [field]: value };
      if (updated.has_break && updated.start_time && updated.end_time) {
        const calculated = calcBreak(updated.start_time, updated.end_time);
        if (calculated) {
          return {
            ...updated,
            break_start_time: calculated.break_start,
            break_end_time: calculated.break_end,
          };
        }
      }
      return updated;
    });
  }

  // ── Submit (Save) ────────────────────────────────────────────────────────

  function handleSubmit(e: React.FormEvent): void {
    e.preventDefault();

    if (!form.user_id) {
      toast({ type: "error", message: "Please select a staff member." });
      return;
    }
    if (!form.work_date) {
      toast({ type: "error", message: "Please enter a date." });
      return;
    }
    if (!form.start_time || !form.end_time) {
      toast({ type: "error", message: "Please enter start and end times." });
      return;
    }

    const breakPayload = form.has_break && form.break_start_time && form.break_end_time
      ? { break_start_time: form.break_start_time, break_end_time: form.break_end_time }
      : { break_start_time: null, break_end_time: null };

    // Parse hourly_rate override — null means "use server cascade"
    const hourlyRateVal = form.hourly_rate.trim() === "" ? null : Number(form.hourly_rate);
    if (hourlyRateVal !== null && (isNaN(hourlyRateVal) || hourlyRateVal < 0)) {
      toast({ type: "error", message: "Hourly rate must be a positive number." });
      return;
    }

    if (isEditMode && schedule) {
      const data: ScheduleUpdate = {
        user_id: form.user_id,
        work_role_id: form.work_role_id || null,
        work_date: form.work_date,
        start_time: form.start_time,
        end_time: form.end_time,
        hourly_rate: hourlyRateVal,
        note: form.note || null,
        ...breakPayload,
      };
      updateMutation.mutate(
        { id: schedule.id, data },
        {
          onSuccess: () => {
            toast({ type: "success", message: "Schedule updated." });
            onClose();
          },
          onError: (err) => {
            toast({ type: "error", message: parseApiError(err, "Failed to update schedule.") });
          },
        },
      );
    } else {
      const data: ScheduleCreate = {
        user_id: form.user_id,
        store_id: storeId,
        work_role_id: form.work_role_id || null,
        work_date: form.work_date,
        start_time: form.start_time,
        end_time: form.end_time,
        hourly_rate: hourlyRateVal,
        note: form.note || null,
        ...breakPayload,
      };
      createMutation.mutate(data, {
        onSuccess: () => {
          toast({ type: "success", message: "Schedule created." });
          onClose();
        },
        onError: (err) => {
          toast({ type: "error", message: parseApiError(err, "Failed to create schedule.") });
        },
      });
    }
  }

  // ── Delete ───────────────────────────────────────────────────────────────

  function handleDelete(): void {
    if (!schedule) return;
    deleteMutation.mutate(schedule.id, {
      onSuccess: () => {
        toast({ type: "success", message: "Schedule deleted." });
        setShowDeleteConfirm(false);
        onClose();
      },
      onError: (err) => {
        toast({ type: "error", message: parseApiError(err, "Failed to delete schedule.") });
        setShowDeleteConfirm(false);
      },
    });
  }

  // ── Confirm / Reject (for "requested" schedules) ─────────────────────────

  function handleConfirm(): void {
    if (!schedule) return;
    confirmMutation.mutate(schedule.id, {
      onSuccess: () => {
        toast({ type: "success", message: "Schedule confirmed." });
        onClose();
      },
      onError: (err) => {
        toast({ type: "error", message: parseApiError(err, "Failed to confirm schedule.") });
      },
    });
  }

  function handleReject(): void {
    if (!schedule) return;
    rejectMutation.mutate(
      { id: schedule.id },
      {
        onSuccess: () => {
          toast({ type: "success", message: "Schedule rejected." });
          onClose();
        },
        onError: (err) => {
          toast({ type: "error", message: parseApiError(err, "Failed to reject schedule.") });
        },
      },
    );
  }

  // ── Dropdown options ─────────────────────────────────────────────────────

  const userOptions = users.map((u) => ({ value: u.id, label: u.full_name }));
  const roleOptions = workRoles.map((r) => ({
    value: r.id,
    label: r.name || `${r.shift_name ?? ""} - ${r.position_name ?? ""}`.trim() || r.id,
  }));

  // ── Net work display (informational) ────────────────────────────────────

  let netMinutes: number | null = null;
  if (form.start_time && form.end_time) {
    let startMin = timeToMin(form.start_time);
    let endMin = timeToMin(form.end_time);
    if (endMin <= startMin) endMin += 24 * 60;
    let total = endMin - startMin;
    if (form.has_break && form.break_start_time && form.break_end_time) {
      let bsMin = timeToMin(form.break_start_time);
      let beMin = timeToMin(form.break_end_time);
      if (beMin <= bsMin) beMin += 24 * 60;
      total -= beMin - bsMin;
    }
    netMinutes = Math.max(0, total);
  }

  const statusInfo = schedule ? (STATUS_BADGE[schedule.status] ?? STATUS_BADGE.confirmed) : null;

  // Modal title
  let modalTitle = "New Schedule";
  if (isEditMode) {
    if (isRequested) modalTitle = "Review Request";
    else modalTitle = "Edit Schedule";
  }

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={modalTitle}
        size="md"
      >
        <form
          onSubmit={handleSubmit}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.target as HTMLElement).tagName !== "TEXTAREA") e.preventDefault(); }}
          className="flex flex-col gap-4"
        >
          {/* EDIT mode: staff name + status badge header */}
          {isEditMode && schedule && (
            <div className="flex items-center justify-between py-2 px-3 rounded-lg bg-surface border border-border">
              <span className="text-sm font-medium text-text">
                {schedule.user_name ?? "Staff"}
              </span>
              {statusInfo && (
                <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
              )}
            </div>
          )}

          {/* Staff selection */}
          <Select
            label="Staff"
            value={form.user_id}
            onChange={(e) => handleStaffChange(e.target.value)}
            options={userOptions}
            placeholder="Select staff member"
            disabled={isReadOnly}
          />

          {/* Work role */}
          <Select
            label="Work Role"
            value={form.work_role_id}
            onChange={(e) => setField("work_role_id", e.target.value)}
            options={roleOptions}
            placeholder="Select work role (optional)"
            disabled={isReadOnly}
          />

          {/* Date */}
          <Input
            label="Date"
            type="date"
            value={form.work_date}
            onChange={(e) => setField("work_date", e.target.value)}
            required
            disabled={isReadOnly}
          />

          {/* Start / End time */}
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-sm font-medium text-text-secondary mb-1.5">
                Start Time
              </label>
              <input
                type="time"
                value={form.start_time}
                onChange={(e) => handleTimeChange("start_time", e.target.value)}
                required
                disabled={isReadOnly}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-text-secondary mb-1.5">
                End Time
              </label>
              <input
                type="time"
                value={form.end_time}
                onChange={(e) => handleTimeChange("end_time", e.target.value)}
                required
                disabled={isReadOnly}
                className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>
          </div>

          {/* Net work time display */}
          {netMinutes !== null && (
            <p className="text-xs text-text-muted -mt-2">
              Net work:{" "}
              <span className="text-text-secondary font-medium">
                {Math.floor(netMinutes / 60)}h {netMinutes % 60 > 0 ? `${netMinutes % 60}m` : ""}
              </span>
              {form.has_break && " (break included)"}
            </p>
          )}

          {/* Hourly rate — text display with edit toggle */}
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-text-secondary">Hourly Rate</span>
            {!isRateEditing ? (
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-text">
                  ${form.hourly_rate && Number(form.hourly_rate) > 0 ? Number(form.hourly_rate).toFixed(2) : "0.00"}
                  <span className="text-text-muted font-normal">/hr</span>
                </span>
                {!isReadOnly && (
                  <button
                    type="button"
                    onClick={() => setIsRateEditing(true)}
                    className="text-xs text-accent hover:text-accent-light font-medium transition-colors"
                  >
                    Edit
                  </button>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <div className="relative">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted text-sm select-none">$</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.hourly_rate}
                    onChange={(e) => setField("hourly_rate", e.target.value)}
                    className="w-28 rounded-lg border border-border bg-surface pl-6 pr-2 py-1.5 text-sm text-text focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition-colors duration-150"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setIsRateEditing(false)}
                  className="text-xs text-text-muted hover:text-text font-medium transition-colors"
                >
                  Done
                </button>
              </div>
            )}
          </div>

          {/* Break toggle */}
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={form.has_break}
                onChange={(e) => handleBreakToggle(e.target.checked)}
                disabled={isReadOnly}
                className="w-4 h-4 rounded accent-accent cursor-pointer disabled:cursor-not-allowed"
              />
              <span className="text-sm text-text-secondary">Add 30min break</span>
            </label>

            {/* Break times (shown when toggled on) */}
            {form.has_break && (
              <div className="flex gap-3 pl-6">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-text-muted mb-1">
                    Break Start
                  </label>
                  <input
                    type="time"
                    value={form.break_start_time}
                    onChange={(e) => setField("break_start_time", e.target.value)}
                    disabled={isReadOnly}
                    className="w-full rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-text focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </div>
                <div className="flex-1">
                  <label className="block text-xs font-medium text-text-muted mb-1">
                    Break End
                  </label>
                  <input
                    type="time"
                    value={form.break_end_time}
                    onChange={(e) => setField("break_end_time", e.target.value)}
                    disabled={isReadOnly}
                    className="w-full rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-text focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Note */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-text-secondary">
              Note <span className="text-text-muted font-normal">(optional)</span>
            </label>
            <textarea
              value={form.note}
              onChange={(e) => setField("note", e.target.value)}
              rows={2}
              disabled={isReadOnly}
              placeholder="Add a note..."
              className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent transition-colors duration-150 resize-none disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>

          {/* Action buttons — vary by status */}
          <div className="flex items-center justify-between gap-3 pt-1">
            {isRequested ? (
              /* ── Requested: Reject | Cancel | Save Changes | Confirm ── */
              <>
                <Button
                  type="button"
                  variant="danger"
                  size="sm"
                  disabled={rejectMutation.isPending || isSubmitting}
                  isLoading={rejectMutation.isPending}
                  onClick={handleReject}
                >
                  Reject
                </Button>
                <div className="flex items-center gap-2 ml-auto">
                  <Button type="button" variant="secondary" size="sm" onClick={onClose}>
                    Cancel
                  </Button>
                  <Button type="submit" variant="secondary" size="sm" isLoading={isSubmitting}>
                    Save Changes
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    disabled={confirmMutation.isPending}
                    isLoading={confirmMutation.isPending}
                    onClick={handleConfirm}
                  >
                    Confirm
                  </Button>
                </div>
              </>
            ) : isReadOnly ? (
              /* ── Rejected / Cancelled: Cancel only ── */
              <div className="ml-auto">
                <Button type="button" variant="secondary" size="sm" onClick={onClose}>
                  Close
                </Button>
              </div>
            ) : (
              /* ── Confirmed / CREATE: Delete | Cancel | Save ── */
              <>
                {isEditMode && (
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    onClick={() => setShowDeleteConfirm(true)}
                    disabled={isDeleting || isSubmitting}
                  >
                    <Trash2 size={14} />
                    Delete
                  </Button>
                )}
                <div className="flex items-center gap-2 ml-auto">
                  <Button type="button" variant="secondary" size="sm" onClick={onClose} disabled={isSubmitting}>
                    Cancel
                  </Button>
                  <Button type="submit" variant="primary" size="sm" isLoading={isSubmitting}>
                    {isEditMode ? "Save" : "Create"}
                  </Button>
                </div>
              </>
            )}
          </div>
        </form>
      </Modal>

      {/* Delete confirmation dialog */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDelete}
        title="Delete Schedule"
        message={`Delete this schedule for ${schedule?.user_name ?? "this staff member"} on ${schedule?.work_date ?? ""}? This action cannot be undone.`}
        confirmLabel="Delete"
        isLoading={isDeleting}
      />
    </>
  );
}
