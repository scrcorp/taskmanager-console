"use client";

import { useState } from "react";
import { CalendarClock } from "lucide-react";
import { useApplicationInterview } from "@/hooks/useInterviews";
import { useUsers } from "@/hooks/useUsers";
import { InterviewStepper, effectiveSubstatus } from "./InterviewStepper";
import { InterviewConfirmModal } from "./InterviewConfirmModal";

interface Props {
  applicationId: string;
  candidateName: string;
}

/** 상세(drawer/풀페이지)용 인터뷰 스케줄 섹션 — 진행 스텝퍼 + 일정 잡기/관리 버튼. */
export function InterviewSchedulingCard({ applicationId, candidateName }: Props) {
  const { data: iv } = useApplicationInterview(applicationId);
  const { data: users = [] } = useUsers();
  const [open, setOpen] = useState(false);
  const interviewerName = users.find((u) => u.id === iv?.interviewer_id)?.full_name;

  const substatus = effectiveSubstatus(
    iv ? (iv.status === "confirmed" ? "confirmed" : iv.status === "picked" ? "picked" : "requested") : "requested",
    iv?.interview_at ?? null,
  );

  return (
    <div className="rounded-2xl border border-[#E2E4EA] bg-white p-4">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-1.5 text-[12.5px] font-semibold uppercase tracking-wider text-[#94A3B8]">
          <CalendarClock size={13} /> Interview scheduling
        </h3>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-lg bg-[#6C5CE7] px-3 py-1.5 text-[11.5px] font-semibold text-white hover:opacity-90"
        >
          {substatus === "confirmed" || substatus === "completed" ? "Manage" : "Schedule time"}
        </button>
      </div>
      <div className="mt-3">
        <InterviewStepper status={substatus} />
      </div>
      {iv?.confirmed && (
        <p className="mt-3 text-[12.5px] text-[#1A1D27]">
          Confirmed:{" "}
          <span className="font-semibold">
            {new Date(iv.confirmed.date + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}
            {" · "}
            {(() => {
              const [h, m] = iv.confirmed.start.split(":").map(Number);
              const am = h < 12;
              const h12 = h % 12 === 0 ? 12 : h % 12;
              return `${h12}:${String(m).padStart(2, "0")} ${am ? "AM" : "PM"}`;
            })()}
          </span>
          <span className="block text-[12px] text-[#64748B]">
            Interviewer: {interviewerName ?? "Not assigned"}
          </span>
        </p>
      )}

      {open && (
        <InterviewConfirmModal
          applicationId={applicationId}
          candidateName={candidateName}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}
