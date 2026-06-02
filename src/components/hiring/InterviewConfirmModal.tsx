"use client";

import { useEffect, useState } from "react";
import { X, CalendarClock, Check, Pencil, Link2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUsers } from "@/hooks/useUsers";
import {
  useApplicationInterview,
  useInterviewSlots,
  useConfirmInterview,
  useCancelInterview,
  useUpdateInterviewer,
  useCompleteInterview,
  useIssueInterviewToken,
} from "@/hooks/useInterviews";
import { InterviewStepper, type InterviewSubstatus } from "./InterviewStepper";
import { SlotCalendarPicker } from "./SlotCalendarPicker";

interface Props {
  applicationId: string;
  candidateName: string;
  onClose: () => void;
  /** true면 모달 대신 패널(인라인) 형태로 렌더 — Overview 우측 패널용. */
  inline?: boolean;
}

function fmtTime(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const am = h < 12;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${am ? "AM" : "PM"}`;
}
function fmtDate(iso: string): string {
  return new Date(iso + "T00:00:00").toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function InterviewConfirmModal({ applicationId, candidateName, onClose, inline = false }: Props) {
  const { data: iv, isLoading } = useApplicationInterview(applicationId);
  const { data: slotsData } = useInterviewSlots();
  const { data: users = [] } = useUsers();
  const confirm = useConfirmInterview(applicationId);
  const cancel = useCancelInterview(applicationId);
  const updateInterviewer = useUpdateInterviewer(applicationId);
  const complete = useCompleteInterview(applicationId);
  const issueToken = useIssueInterviewToken(applicationId);

  const [slotId, setSlotId] = useState<string>("");
  const [linkCopied, setLinkCopied] = useState(false);
  const [interviewerId, setInterviewerId] = useState<string>("");
  const [showAll, setShowAll] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [rescheduling, setRescheduling] = useState(false);
  const [editingInterviewer, setEditingInterviewer] = useState(false);
  const [completing, setCompleting] = useState(false);

  useEffect(() => {
    if (iv?.interviewer_id) setInterviewerId(iv.interviewer_id);
  }, [iv?.interviewer_id]);

  // ESC로 닫기 (사이드 클릭은 유지)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const prefs = iv?.preferences ?? [];
  const prefIds = new Set(prefs.map((p) => p.id));
  const hasPicks = prefs.length > 0;
  // 다른 지원자가 이미 확정한 슬롯 (본인 확정은 제외 — reschedule 시 본인 슬롯은 선택 가능)
  const takenIds = new Set(
    (slotsData?.items ?? [])
      .filter((s) => s.confirmed && s.confirmed.application_id !== applicationId)
      .map((s) => s.id),
  );
  // 캘린더 피커용 — taken은 회색 'Booked'로 표시, 지원자 희망은 ★
  const pickerSlots = (slotsData?.items ?? []).map((s) => ({
    id: s.id,
    date: s.date,
    start: s.start,
    taken: takenIds.has(s.id),
    preferred: prefIds.has(s.id),
  }));

  // 선택한 슬롯 / 면접관 (요약 컨펌용)
  const selectedSlot = pickerSlots.find((s) => s.id === slotId);
  const interviewerName = users.find((u) => u.id === interviewerId)?.full_name;
  const isPick = !!slotId && prefIds.has(slotId);

  const doConfirm = async () => {
    if (!slotId) return;
    try {
      await confirm.mutateAsync({ slotId, interviewerId: interviewerId || undefined });
      onClose();
    } catch {
      /* hook surfaces error */
    }
  };
  const doCancel = async () => {
    try {
      await cancel.mutateAsync();
      onClose();
    } catch {
      /* hook surfaces error */
    }
  };
  // 인터뷰 완료 — 시각이 안 지났으면 확인 후 진행
  const onCompleteClick = () => {
    const passed = !!iv?.interview_at && new Date(iv.interview_at).getTime() < Date.now();
    if (passed) void doComplete();
    else setCompleting(true);
  };
  const doComplete = async () => {
    try {
      await complete.mutateAsync();
      onClose();
    } catch {
      /* hook surfaces error */
    }
  };
  // 지원자용 스케줄 링크 복사 — 토큰 발급(회전) 후 현재 origin 기준 링크 조립.
  // 회전이므로 이전에 메일로 나간 링크는 무효화됨 (title 로 안내).
  const copyLink = async () => {
    try {
      const { token } = await issueToken.mutateAsync();
      const link = `${window.location.origin}/interview/${token}`;
      await navigator.clipboard.writeText(link);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      /* hook surfaces error */
    }
  };

  const inner = (
    <>
        {/* sticky header — 스크롤해도 항상 보임 */}
        <div className="flex flex-shrink-0 items-start justify-between border-b border-[#F0F1F5] px-5 pb-3 pt-5">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-[#94A3B8]">
              Interview
            </p>
            <h3 className="mt-0.5 text-[16px] font-semibold text-[#1A1D27]">{candidateName}</h3>
          </div>
          <button type="button" onClick={onClose} className="flex flex-shrink-0 items-center gap-1 rounded-lg px-1.5 py-1.5 text-[#64748B] hover:bg-[#F0F1F5]">
            {inline ? <span className="text-[12px] font-semibold text-[#6C5CE7]">← Back to slots</span> : <X size={18} />}
          </button>
        </div>

        {/* 스크롤 영역 */}
        <div className={cn("overflow-y-auto px-5 py-4", inline && "max-h-[56vh]")}>
        {iv && (
          <div className="rounded-lg bg-[#F8F9FB] px-3 py-2.5">
            <InterviewStepper
              status={
                (iv.status === "confirmed" ? "confirmed" : iv.status === "picked" ? "picked" : "requested") as InterviewSubstatus
              }
            />
          </div>
        )}

        {/* 지원자용 스케줄 링크 복사 — 메일 미수신/분실 시 직접 전달용. 모든 substate 에서 노출 */}
        {iv && (
          <button
            type="button"
            onClick={copyLink}
            disabled={issueToken.isPending}
            title="Copy this applicant's unique scheduling link. A fresh link is generated — any link sent earlier will stop working."
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-[#E2E4EA] bg-white px-3 py-2 text-[12px] font-semibold text-[#64748B] transition-colors hover:bg-[#F5F6FA] disabled:opacity-50"
          >
            {linkCopied ? <Check size={13} className="text-[#00997A]" /> : <Link2 size={13} />}
            {issueToken.isPending ? "Generating…" : linkCopied ? "Link copied" : "Copy interview link"}
          </button>
        )}

        {isLoading || !iv ? (
          <p className="py-8 text-center text-[12px] text-[#94A3B8]">Loading…</p>
        ) : iv.status === "confirmed" && iv.confirmed && !rescheduling ? (
          <div className="mt-4">
            <div className="rounded-xl border border-[#00B894]/30 bg-[rgba(0,184,148,0.08)] px-4 py-4 text-center">
              <div className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-[#00997A]">
                <Check size={12} /> Confirmed
              </div>
              <div className="mt-1.5 text-[18px] font-semibold text-[#1A1D27]">
                {fmtDate(iv.confirmed.date)} · {fmtTime(iv.confirmed.start)}
              </div>
              {/* 인터뷰어 — 이름 옆 연필 아이콘으로 그 자리에서 변경 */}
              {editingInterviewer ? (
                <div className="mt-2 flex items-center justify-center gap-1.5">
                  <select
                    value={interviewerId}
                    onChange={(e) => setInterviewerId(e.target.value)}
                    className="rounded-lg border border-[#E2E4EA] bg-white px-2.5 py-1.5 text-[13px] outline-none focus:border-[#6C5CE7]"
                  >
                    <option value="">— Not assigned —</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>{u.full_name} ({u.role_name})</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={updateInterviewer.isPending || interviewerId === (iv.interviewer_id ?? "")}
                    onClick={async () => {
                      try { await updateInterviewer.mutateAsync(interviewerId || null); setEditingInterviewer(false); } catch { /* hook surfaces */ }
                    }}
                    title={interviewerId === (iv.interviewer_id ?? "") ? "No change" : "Save"}
                    className="rounded-lg bg-[#6C5CE7] p-1.5 text-white hover:opacity-90 disabled:opacity-40"
                  >
                    <Check size={15} />
                  </button>
                  <button
                    type="button"
                    onClick={() => { setEditingInterviewer(false); setInterviewerId(iv.interviewer_id ?? ""); }}
                    title="Cancel"
                    className="rounded-lg border border-[#E2E4EA] bg-white p-1.5 text-[#64748B] hover:bg-[#F5F6FA]"
                  >
                    <X size={15} />
                  </button>
                </div>
              ) : (
                <div className="mt-2 inline-flex items-center gap-1.5 text-[14px] font-semibold text-[#1A1D27]">
                  Interviewer: {interviewerName ?? "Not assigned"}
                  <button
                    type="button"
                    onClick={() => setEditingInterviewer(true)}
                    title="Change interviewer"
                    className="rounded p-0.5 text-[#94A3B8] hover:bg-[#00B894]/10 hover:text-[#00997A]"
                  >
                    <Pencil size={13} />
                  </button>
                </div>
              )}
            </div>

            {completing ? (
              <div className="mt-4 rounded-lg border border-[#F0A500]/40 bg-[rgba(240,165,0,0.08)] p-3">
                <p className="text-[12.5px] font-semibold text-[#C28100]">Interview time hasn&apos;t passed yet</p>
                <p className="mt-1 text-[12px] leading-relaxed text-[#64748B]">
                  This interview is scheduled for {fmtDate(iv.confirmed.date)} · {fmtTime(iv.confirmed.start)}. Mark it complete and move to review anyway?
                </p>
                <div className="mt-3 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setCompleting(false)}
                    className="rounded-lg border border-[#E2E4EA] bg-white px-3 py-1.5 text-[12.5px] font-medium text-[#64748B] hover:bg-[#F5F6FA]"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={doComplete}
                    disabled={complete.isPending}
                    className="rounded-lg bg-[#F0A500] px-4 py-1.5 text-[12.5px] font-semibold text-white hover:opacity-90 disabled:opacity-50"
                  >
                    {complete.isPending ? "Completing…" : "Yes, complete anyway"}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onCompleteClick}
                  disabled={complete.isPending}
                  className="mt-4 w-full rounded-lg bg-[#00B894] px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-[#00997A] disabled:opacity-50"
                >
                  {complete.isPending ? "Completing…" : "Complete interview"}
                </button>
                <button
                  type="button"
                  onClick={() => { setRescheduling(true); setShowAll(true); setSlotId(""); setReviewing(false); }}
                  className="mt-2 w-full rounded-lg border border-[#E2E4EA] px-4 py-2.5 text-[13px] font-semibold text-[#64748B] hover:bg-[#F5F6FA]"
                >
                  Change time
                </button>
                <button
                  type="button"
                  onClick={doCancel}
                  disabled={cancel.isPending}
                  className="mt-2 w-full rounded-lg border border-[#EF4444] px-4 py-2.5 text-[13px] font-semibold text-[#EF4444] hover:bg-[rgba(239,68,68,0.06)] disabled:opacity-50"
                >
                  {cancel.isPending ? "Cancelling…" : "Cancel interview"}
                </button>
              </>
            )}
          </div>
        ) : reviewing ? (
          <div className="mt-4">
            <p className="text-[13px] font-semibold text-[#1A1D27]">Confirm this time?</p>
            <div className="mt-3 divide-y divide-[#F0F1F5] rounded-xl border border-[#E2E4EA]">
              {[
                { label: "Applicant", value: candidateName },
                { label: "When", value: selectedSlot ? `${fmtDate(selectedSlot.date)} · ${fmtTime(selectedSlot.start)}` : "—" },
                { label: "Interviewer", value: interviewerName ?? "Assign later" },
              ].map((r) => (
                <div key={r.label} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <span className="text-[12px] text-[#94A3B8]">{r.label}</span>
                  <span className="text-right text-[13px] font-semibold text-[#1A1D27]">{r.value}</span>
                </div>
              ))}
            </div>
            {!isPick && (
              <p className="mt-3 rounded-lg bg-[rgba(240,165,0,0.1)] px-3 py-2 text-[12px] text-[#C28100]">
                Heads up — this isn&apos;t one of {candidateName}&apos;s picked times.
              </p>
            )}
            <p className="mt-3 text-[12px] text-[#64748B]">
              A confirmation email will be sent to {candidateName}.
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setReviewing(false)}
                className="rounded-lg border border-[#E2E4EA] bg-white px-4 py-2.5 text-[13px] font-semibold text-[#64748B] hover:bg-[#F5F6FA]"
              >
                ← Back
              </button>
              <button
                type="button"
                onClick={doConfirm}
                disabled={confirm.isPending}
                className="flex-1 rounded-lg bg-[#00B894] px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-[#00997A] disabled:opacity-40"
              >
                {confirm.isPending ? "Confirming…" : "Confirm & send email"}
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            {rescheduling && (
              <div className="flex items-center justify-between gap-2 rounded-lg bg-[rgba(108,92,231,0.08)] px-3 py-2">
                <p className="text-[12px] font-medium text-[#6C5CE7]">
                  Rescheduling — pick a new time{iv.confirmed ? ` (now ${fmtDate(iv.confirmed.date)} · ${fmtTime(iv.confirmed.start)})` : ""}.
                </p>
                <button
                  type="button"
                  onClick={() => { setRescheduling(false); setReviewing(false); setShowAll(false); setSlotId(""); }}
                  className="flex-shrink-0 text-[12px] font-semibold text-[#64748B] hover:underline"
                >
                  Keep current
                </button>
              </div>
            )}
            <div>
              {hasPicks && !showAll ? (
                <>
                  <p className="mb-1.5 text-[12px] font-semibold text-[#64748B]">{candidateName}&apos;s preferred times</p>
                  <div className="flex flex-wrap gap-2">
                    {prefs.map((s) => {
                      const taken = takenIds.has(s.id);
                      if (taken) {
                        return (
                          <div
                            key={s.id}
                            title="Already booked by another applicant — removed from open times"
                            className="rounded-lg border border-[#E2E4EA] bg-[#F5F6FA] px-3 py-2 text-[12.5px] font-semibold text-[#94A3B8]"
                          >
                            <span className="mr-1 text-[#B9AEF0]">★</span>
                            <span className="line-through">{fmtDate(s.date)} · {fmtTime(s.start)}</span>
                            <span className="ml-1.5 text-[10px] font-bold uppercase tracking-wide text-[#CBD5E1]">Booked</span>
                          </div>
                        );
                      }
                      return (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => { setSlotId(s.id); setReviewing(false); }}
                          className={cn(
                            "rounded-lg border px-3 py-2 text-[12.5px] font-semibold transition-colors",
                            slotId === s.id
                              ? "border-[#6C5CE7] bg-[#6C5CE7] text-white"
                              : "border-[#6C5CE7] bg-[rgba(108,92,231,0.08)] text-[#1A1D27] hover:bg-[rgba(108,92,231,0.16)]",
                          )}
                        >
                          <span className="mr-1 text-[#6C5CE7]">★</span>
                          {fmtDate(s.date)} · {fmtTime(s.start)}
                        </button>
                      );
                    })}
                  </div>
                  <button type="button" onClick={() => setShowAll(true)} className="mt-2 text-[12px] font-semibold text-[#6C5CE7] hover:underline">
                    Choose another time →
                  </button>
                </>
              ) : !hasPicks && !showAll ? (
                <div className="rounded-lg border border-[#F0A500]/30 bg-[rgba(240,165,0,0.06)] px-3 py-3">
                  <p className="text-[12.5px] text-[#64748B]">
                    {candidateName} hasn&apos;t picked any times yet.
                  </p>
                  <button type="button" onClick={() => setShowAll(true)} className="mt-2 text-[12px] font-semibold text-[#6C5CE7] hover:underline">
                    Choose another time →
                  </button>
                </div>
              ) : (
                <>
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <p className="text-[12px] font-semibold text-[#64748B]">
                      Pick a date{hasPicks && <span className="font-normal text-[#94A3B8]"> · ★ = applicant&apos;s pick</span>}
                    </p>
                    <button type="button" onClick={() => setShowAll(false)} className="flex-shrink-0 text-[12px] font-semibold text-[#6C5CE7] hover:underline">
                      ← Back
                    </button>
                  </div>
                  <SlotCalendarPicker
                    slots={pickerSlots}
                    selected={slotId ? [slotId] : []}
                    onToggle={(id) => { setSlotId(id); setReviewing(false); }}
                    max={1}
                    showTaken
                  />
                </>
              )}
            </div>

            <div>
              <p className="mb-1.5 text-[12px] font-semibold text-[#64748B]">Interviewer (optional)</p>
              <select
                value={interviewerId}
                onChange={(e) => setInterviewerId(e.target.value)}
                className="w-full rounded-lg border border-[#E2E4EA] bg-white px-3 py-2 text-[13px] outline-none focus:border-[#6C5CE7]"
              >
                <option value="">— Assign later —</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.full_name} ({u.role_name})
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={() => slotId && setReviewing(true)}
              disabled={!slotId}
              className="w-full rounded-lg bg-[#00B894] px-4 py-2.5 text-[13px] font-semibold text-white hover:bg-[#00997A] disabled:opacity-40"
            >
              Continue →
            </button>
          </div>
        )}
        </div>
    </>
  );

  if (inline) {
    return (
      <div className="flex flex-col overflow-hidden rounded-2xl border border-[#E2E4EA] bg-white">
        {inner}
      </div>
    );
  }
  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {inner}
      </div>
    </div>
  );
}
