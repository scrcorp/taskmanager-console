"use client";

import { cn } from "@/lib/utils";

export type InterviewSubstatus = "not_requested" | "requested" | "picked" | "confirmed" | "completed";

// 4스텝: 요청 → 선택 → 확정 → 완료. (완료 = 확정된 인터뷰 시각이 지남)
const STEPS: { key: string; label: string }[] = [
  { key: "requested", label: "Times requested" },
  { key: "picked", label: "Applicant picked" },
  { key: "confirmed", label: "Confirmed" },
  { key: "completed", label: "Interview done" },
];

// 현재 "진행중"인 스텝 인덱스. null = 전부 완료.
const CURRENT: Record<InterviewSubstatus, number | null> = {
  not_requested: 0,
  requested: 1,
  picked: 2,
  confirmed: 3,
  completed: null,
};

type StepState = "done" | "active" | "todo";
function stepState(i: number, status: InterviewSubstatus): StepState {
  const cur = CURRENT[status];
  if (cur === null) return "done"; // completed → 전부 done
  if (i < cur) return "done";
  if (i === cur) return "active";
  return "todo";
}
const STATE_WORD: Record<StepState, string> = { done: "done", active: "in progress", todo: "not started" };

/** compact = 점 + 호버 툴팁 (행용). full = 라벨 포함 (모달/상세용). */
export function InterviewStepper({ status, compact = false }: { status: InterviewSubstatus; compact?: boolean }) {
  if (compact) {
    return (
      <div className="flex items-center">
        {STEPS.map((s, i) => {
          const st = stepState(i, status);
          return (
            <span key={s.key} className="flex items-center">
              <span title={`Step ${i + 1}/4 · ${s.label} — ${STATE_WORD[st]}`} className="flex cursor-help items-center justify-center p-1">
                <span
                  className={cn(
                    "h-2.5 w-2.5 rounded-full transition-colors",
                    st === "done" && "bg-[#00B894]",
                    st === "active" && "bg-[#3B8DD9] ring-2 ring-[#3B8DD9]/30 animate-pulse",
                    st === "todo" && "bg-[#E2E4EA]",
                  )}
                />
              </span>
              {i < STEPS.length - 1 && (
                <span className={cn("h-0.5 w-3", stepState(i + 1, status) === "todo" && stepState(i, status) !== "done" ? "bg-[#E2E4EA]" : i < (CURRENT[status] ?? 99) ? "bg-[#00B894]" : "bg-[#E2E4EA]")} />
              )}
            </span>
          );
        })}
      </div>
    );
  }
  return (
    <ol className="flex flex-wrap items-center gap-x-1 gap-y-2">
      {STEPS.map((s, i) => {
        const st = stepState(i, status);
        return (
          <li key={s.key} className="flex items-center gap-1" title={`${s.label} — ${STATE_WORD[st]}`}>
            <span
              className={cn(
                "flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold transition-colors",
                st === "done" && "bg-[#00B894] text-white",
                st === "active" && "bg-[#3B8DD9] text-white ring-2 ring-[#3B8DD9]/30 animate-pulse",
                st === "todo" && "bg-[#F0F1F5] text-[#94A3B8]",
              )}
            >
              {st === "done" ? "✓" : i + 1}
            </span>
            <span className={cn("text-[11.5px]", st === "active" ? "font-semibold text-[#1A1D27]" : st === "done" ? "text-[#64748B]" : "text-[#94A3B8]")}>
              {s.label}
            </span>
            {i < STEPS.length - 1 && <span className={cn("mx-1 h-px w-4", st === "done" ? "bg-[#00B894]" : "bg-[#E2E4EA]")} />}
          </li>
        );
      })}
    </ol>
  );
}

/** substatus + 확정시각으로 effective status 계산 (확정인데 시각 지났으면 completed). */
export function effectiveSubstatus(
  substatus: string | undefined,
  interviewAt: string | null,
): InterviewSubstatus {
  const s = (substatus ?? "requested") as InterviewSubstatus;
  if (s === "confirmed" && interviewAt && new Date(interviewAt).getTime() < Date.now()) {
    return "completed";
  }
  return s;
}
