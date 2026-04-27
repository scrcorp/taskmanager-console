"use client";

/**
 * ChangeStaffModal — 2-step: 직원 검색/선택 → 확인 프리뷰.
 */

import { useState, useMemo } from "react";
import type { Schedule, User } from "@/types";

interface Props {
  open: boolean;
  onClose: () => void;
  schedule: Schedule | null;
  currentUser: User | null;
  users: User[];
  onChange: (newUserId: string) => void;
  isSubmitting?: boolean;
}

function fmt(t: string | null): string {
  if (!t) return "";
  const [hh, mm] = t.split(":");
  const h = Number(hh); const m = mm ?? "00";
  const suf = h >= 12 ? "PM" : "AM";
  const hr = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hr}:${m} ${suf}`;
}

export function ChangeStaffModal({ open, onClose, schedule, currentUser, users, onChange, isSubmitting }: Props) {
  const [search, setSearch] = useState("");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [step, setStep] = useState<"select" | "confirm">("select");

  const candidates = useMemo(() => {
    if (!schedule) return [];
    let list = users.filter((u) => u.id !== schedule.user_id);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((u) => (u.full_name || u.username || "").toLowerCase().includes(q));
    }
    return list;
  }, [users, schedule, search]);

  const selectedUser = users.find((u) => u.id === selectedUserId);

  if (!open || !schedule) return null;

  const curName = currentUser?.full_name || currentUser?.username || "Unknown";
  const newName = selectedUser?.full_name || selectedUser?.username || "";
  const time = `${fmt(schedule.start_time)}–${fmt(schedule.end_time)}`;

  function reset() {
    setSearch(""); setSelectedUserId(""); setStep("select");
  }
  function handleClose() { reset(); onClose(); }
  function handleBack() { setStep("select"); }
  function handleNext() { if (selectedUserId) setStep("confirm"); }

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/40">
      <div className="bg-[var(--color-surface)] rounded-2xl shadow-2xl w-full max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-[var(--color-border)]">
          <h2 className="text-[16px] font-bold text-[var(--color-text)]">Change Staff</h2>
          <div className="text-[12px] text-[var(--color-text-secondary)] mt-0.5">
            {schedule.work_date} · {time} · {schedule.work_role_name || "No role"}
          </div>
        </div>

        {step === "select" ? (
          <>
            <div className="px-6 py-4 space-y-3">
              {/* Search */}
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search staff..."
                className="w-full px-3 py-2 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg text-[13px] outline-none focus:border-[var(--color-accent)]"
                autoFocus
              />
              {/* Staff list */}
              <div className="max-h-[240px] overflow-y-auto rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)]">
                {candidates.length === 0 && (
                  <div className="px-4 py-3 text-[12px] text-[var(--color-text-muted)]">No staff found</div>
                )}
                {candidates.map((u) => {
                  const selected = selectedUserId === u.id;
                  return (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => setSelectedUserId(u.id)}
                      className={`w-full text-left px-4 py-2.5 border-b border-[var(--color-border)] last:border-b-0 transition-colors ${
                        selected ? "bg-[var(--color-accent-muted)]" : "hover:bg-[var(--color-surface-hover)]"
                      }`}
                    >
                      <div className="text-[13px] font-semibold text-[var(--color-text)]">{u.full_name || u.username}</div>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="px-6 py-4 border-t border-[var(--color-border)] flex justify-end gap-2">
              <button type="button" onClick={handleClose} className="px-4 py-2 rounded-lg text-[13px] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]">Cancel</button>
              <button
                type="button"
                disabled={!selectedUserId}
                onClick={handleNext}
                className="px-4 py-2 rounded-lg text-[13px] font-semibold bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
              >Next</button>
            </div>
          </>
        ) : (
          <>
            {/* Confirm preview */}
            <div className="px-6 py-5 space-y-4">
              <div className="flex items-center gap-3">
                {/* From */}
                <div className="flex-1 bg-[var(--color-bg)] rounded-lg p-3 text-center">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)] mb-1">Current</div>
                  <div className="text-[14px] font-bold text-[var(--color-text)]">{curName}</div>
                </div>
                {/* Arrow */}
                <div className="text-[var(--color-text-muted)] shrink-0">
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 10h12M12 6l4 4-4 4"/></svg>
                </div>
                {/* To */}
                <div className="flex-1 bg-[var(--color-accent-muted)] rounded-lg p-3 text-center">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-accent)] mb-1">New</div>
                  <div className="text-[14px] font-bold text-[var(--color-text)]">{newName}</div>
                </div>
              </div>
              <div className="text-[12px] text-[var(--color-text-secondary)] text-center">
                Hourly rate will be recalculated for the new staff member.
              </div>
            </div>
            <div className="px-6 py-4 border-t border-[var(--color-border)] flex justify-between">
              <button type="button" onClick={handleBack} className="px-4 py-2 rounded-lg text-[13px] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]">Back</button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => onChange(selectedUserId)}
                className="px-4 py-2 rounded-lg text-[13px] font-semibold bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
              >{"Confirm Change"}</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
