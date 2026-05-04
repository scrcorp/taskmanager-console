"use client";

/**
 * SwapModal (Switch Schedule) — 3-step: 직원 검색/선택 → 스케줄 선택 → 확인 프리뷰.
 */

import { useState, useMemo, useEffect } from "react";
import type { Schedule, User } from "@/types";

interface Props {
  open: boolean;
  onClose: () => void;
  fromSchedule: Schedule | null;
  fromUser: User | null;
  candidateSchedules: Schedule[];
  users: User[];
  onSwap?: (otherScheduleId: string, reason?: string) => void;
  isSubmitting?: boolean;
  errorMessage?: string | null;
  onClearError?: () => void;
}

function parseSwitchError(raw: string): { title: string; details: string[] } {
  const conflictPrefix = "Switch would cause conflicts:";
  if (raw.startsWith(conflictPrefix)) {
    const tail = raw.slice(conflictPrefix.length).trim();
    const details = tail.split(";").map((s) => s.trim()).filter(Boolean);
    return { title: "Switch would cause schedule conflicts", details };
  }
  if (raw.includes("checklists are in_progress or completed")) {
    return {
      title: "Active checklists detected",
      details: [
        "One or both schedules have checklists already in progress or completed.",
        "Resetting them is not yet supported in this UI. Please review the checklists first.",
      ],
    };
  }
  if (raw === "Both schedules must be confirmed to switch") {
    return {
      title: "Both schedules must be confirmed",
      details: ["Only confirmed schedules can be switched. Confirm both schedules first."],
    };
  }
  if (raw === "Cannot switch a schedule with itself") {
    return { title: "Cannot switch a schedule with itself", details: [] };
  }
  if (raw === "Schedule not found") {
    return {
      title: "Schedule not found",
      details: ["One of the schedules may have been deleted or modified. Refresh and try again."],
    };
  }
  return { title: "Switch failed", details: [raw] };
}

function fmt(t: string | null): string {
  if (!t) return "";
  const [hh, mm] = t.split(":");
  const h = Number(hh); const m = mm ?? "00";
  const suf = h >= 12 ? "PM" : "AM";
  const hr = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hr}:${m} ${suf}`;
}

type Step = "staff" | "schedule" | "confirm";

export function SwapModal({ open, onClose, fromSchedule, fromUser, candidateSchedules, users, onSwap, isSubmitting, errorMessage, onClearError }: Props) {
  const [step, setStep] = useState<Step>("staff");
  const [search, setSearch] = useState("");
  const [targetUserId, setTargetUserId] = useState("");
  const [targetScheduleId, setTargetScheduleId] = useState("");
  const [reason, setReason] = useState("");

  const today = new Date().toISOString().slice(0, 10);

  // 모달 열릴 때 상태 초기화
  useEffect(() => {
    if (open) { setStep("staff"); setSearch(""); setTargetUserId(""); setTargetScheduleId(""); setReason(""); }
  }, [open]);

  // Step 1: 다른 직원 목록 (검색 필터)
  const staffCandidates = useMemo(() => {
    if (!fromSchedule) return [];
    const others = users.filter((u) => u.id !== fromSchedule.user_id);
    // 오늘 이후 + confirmed 스케줄이 있는 직원만
    const hasSchedule = new Set(
      candidateSchedules
        .filter((s) => s.status === "confirmed" && s.id !== fromSchedule.id && s.work_date >= today)
        .map((s) => s.user_id)
    );
    let list = others.filter((u) => hasSchedule.has(u.id));
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((u) => (u.full_name || u.username || "").toLowerCase().includes(q));
    }
    return list;
  }, [users, fromSchedule, candidateSchedules, search]);

  // Step 2: 선택된 직원의 confirmed 스케줄 (오늘 이후만)
  const targetSchedules = useMemo(() => {
    if (!fromSchedule || !targetUserId) return [];
    return candidateSchedules.filter((s) =>
      s.user_id === targetUserId && s.status === "confirmed" && s.id !== fromSchedule.id && s.work_date >= today
    );
  }, [candidateSchedules, fromSchedule, targetUserId, today]);

  const targetUser = users.find((u) => u.id === targetUserId);
  const targetSchedule = candidateSchedules.find((s) => s.id === targetScheduleId);

  if (!open || !fromSchedule) return null;

  const fromName = fromUser?.full_name || fromUser?.username || "—";
  const fromTime = `${fmt(fromSchedule.start_time)}–${fmt(fromSchedule.end_time)}`;
  const toName = targetUser?.full_name || targetUser?.username || "—";
  const toTime = targetSchedule ? `${fmt(targetSchedule.start_time)}–${fmt(targetSchedule.end_time)}` : "";

  function reset() { setStep("staff"); setSearch(""); setTargetUserId(""); setTargetScheduleId(""); setReason(""); }
  function handleClose() { reset(); onClearError?.(); onClose(); }

  const parsedError = errorMessage ? parseSwitchError(errorMessage) : null;

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/40">
      <div className="bg-[var(--color-surface)] rounded-2xl shadow-2xl w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="px-6 py-4 border-b border-[var(--color-border)]">
          <h2 className="text-[16px] font-bold text-[var(--color-text)]">Switch Schedule</h2>
          <div className="text-[12px] text-[var(--color-text-secondary)] mt-0.5">
            {fromName} · {fromSchedule.work_date} · {fromTime}
          </div>
          {/* Step indicator */}
          <div className="flex gap-1.5 mt-3">
            {(["staff", "schedule", "confirm"] as Step[]).map((s, i) => (
              <div key={s} className={`h-1 rounded-full flex-1 ${
                i <= ["staff", "schedule", "confirm"].indexOf(step)
                  ? "bg-[var(--color-accent)]"
                  : "bg-[var(--color-border)]"
              }`} />
            ))}
          </div>
        </div>

        {/* Step 1: Staff selection */}
        {step === "staff" && (
          <>
            <div className="px-6 py-4 space-y-3">
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search staff..."
                className="w-full px-3 py-2 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg text-[13px] outline-none focus:border-[var(--color-accent)]"
                autoFocus
              />
              <div className="max-h-[240px] overflow-y-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)]">
                {staffCandidates.length === 0 && (
                  <div className="px-4 py-3 text-[12px] text-[var(--color-text-muted)]">No staff with confirmed schedules</div>
                )}
                {staffCandidates.map((u) => {
                  const count = candidateSchedules.filter((s) => s.user_id === u.id && s.status === "confirmed" && s.id !== fromSchedule.id && s.work_date >= today).length;
                  const sel = targetUserId === u.id;
                  return (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => { setTargetUserId(u.id); setTargetScheduleId(""); }}
                      className={`w-full text-left px-4 py-2.5 border-b border-[var(--color-border)] last:border-b-0 transition-colors ${
                        sel ? "bg-[var(--color-accent-muted)]" : "hover:bg-[var(--color-surface-hover)]"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[13px] font-semibold text-[var(--color-text)]">{u.full_name || u.username}</span>
                        <span className="text-[11px] text-[var(--color-text-muted)]">{count} schedule{count > 1 ? "s" : ""}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="px-6 py-4 border-t border-[var(--color-border)] flex justify-end gap-2">
              <button type="button" onClick={handleClose} className="px-4 py-2 rounded-lg text-[13px] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]">Cancel</button>
              <button
                type="button"
                disabled={!targetUserId}
                onClick={() => setStep("schedule")}
                className="px-4 py-2 rounded-lg text-[13px] font-semibold bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
              >Next</button>
            </div>
          </>
        )}

        {/* Step 2: Schedule selection */}
        {step === "schedule" && (
          <>
            <div className="px-6 py-4 space-y-3">
              <div className="text-[13px] font-medium text-[var(--color-text)]">
                Select {toName}&apos;s schedule to switch with
              </div>
              <div className="max-h-[240px] overflow-y-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)]">
                {targetSchedules.map((s) => {
                  const t = `${fmt(s.start_time)}–${fmt(s.end_time)}`;
                  const sel = targetScheduleId === s.id;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setTargetScheduleId(s.id)}
                      className={`w-full text-left px-4 py-2.5 border-b border-[var(--color-border)] last:border-b-0 transition-colors ${
                        sel ? "bg-[var(--color-accent-muted)]" : "hover:bg-[var(--color-surface-hover)]"
                      }`}
                    >
                      <div className="text-[13px] font-semibold text-[var(--color-text)]">{s.work_date}</div>
                      <div className="text-[11px] text-[var(--color-text-secondary)] mt-0.5">
                        {t} · {s.work_role_name || "No role"}{s.hourly_rate ? ` · $${s.hourly_rate}` : ""}
                      </div>
                    </button>
                  );
                })}
              </div>
              <div>
                <label className="block text-[12px] font-medium text-[var(--color-text-secondary)] mb-1">Reason (optional)</label>
                <input
                  type="text"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Why is this switch happening?"
                  className="w-full px-3 py-2 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg text-[13px]"
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-[var(--color-border)] flex justify-between">
              <button type="button" onClick={() => setStep("staff")} className="px-4 py-2 rounded-lg text-[13px] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]">Back</button>
              <button
                type="button"
                disabled={!targetScheduleId}
                onClick={() => setStep("confirm")}
                className="px-4 py-2 rounded-lg text-[13px] font-semibold bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
              >Next</button>
            </div>
          </>
        )}

        {/* Step 3: Confirm */}
        {step === "confirm" && targetSchedule && (
          <>
            <div className="px-6 py-5 space-y-4">
              <div className="grid grid-cols-[1fr_auto_1fr] gap-3 items-stretch">
                {/* Schedule A */}
                <div className="bg-[var(--color-bg)] rounded-lg p-3">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)] mb-1.5">Schedule A</div>
                  <div className="text-[13px] font-bold text-[var(--color-text)]">{fromName}</div>
                  <div className="text-[11px] text-[var(--color-text-secondary)] mt-1 space-y-0.5">
                    <div>{fromSchedule.work_date}</div>
                    <div>{fromTime}</div>
                    <div>{fromSchedule.work_role_name || "No role"}</div>
                  </div>
                </div>
                {/* Swap icon */}
                <div className="flex items-center text-[var(--color-accent)]">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M7 16l-4-4 4-4"/><path d="M17 8l4 4-4 4"/><path d="M3 12h18"/></svg>
                </div>
                {/* Schedule B */}
                <div className="bg-[var(--color-bg)] rounded-lg p-3">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)] mb-1.5">Schedule B</div>
                  <div className="text-[13px] font-bold text-[var(--color-text)]">{toName}</div>
                  <div className="text-[11px] text-[var(--color-text-secondary)] mt-1 space-y-0.5">
                    <div>{targetSchedule.work_date}</div>
                    <div>{toTime}</div>
                    <div>{targetSchedule.work_role_name || "No role"}</div>
                  </div>
                </div>
              </div>
              {/* Result preview */}
              <div className="bg-[var(--color-accent-muted)] rounded-lg p-3 text-[12px] text-[var(--color-text-secondary)] space-y-1">
                <div className="font-semibold text-[var(--color-accent)] text-[11px] uppercase tracking-wider mb-1">After switch</div>
                <div>{fromName} → Schedule B ({targetSchedule.work_date} {toTime})</div>
                <div>{toName} → Schedule A ({fromSchedule.work_date} {fromTime})</div>
                <div className="text-[11px] text-[var(--color-text-muted)] mt-1">Hourly rates will be recalculated.</div>
              </div>

              {/* Error message */}
              {parsedError && (
                <div role="alert" className="rounded-lg p-3 border border-[var(--color-danger)]/40 bg-[var(--color-danger-muted)] space-y-1.5">
                  <div className="flex items-start gap-2">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-[var(--color-danger)] mt-0.5 shrink-0">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="12" y1="8" x2="12" y2="12" />
                      <line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    <div className="text-[12px] font-semibold text-[var(--color-danger)] leading-snug">{parsedError.title}</div>
                  </div>
                  {parsedError.details.length > 0 && (
                    <ul className="list-disc list-inside text-[11.5px] text-[var(--color-text-secondary)] space-y-0.5 pl-1">
                      {parsedError.details.map((d, i) => (
                        <li key={i} className="leading-snug">{d}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-[var(--color-border)] flex justify-between">
              <button type="button" onClick={() => setStep("schedule")} className="px-4 py-2 rounded-lg text-[13px] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]">Back</button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => onSwap?.(targetScheduleId, reason.trim() || undefined)}
                className="px-4 py-2 rounded-lg text-[13px] font-semibold bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
              >{isSubmitting ? "Switching..." : "Confirm Switch"}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
