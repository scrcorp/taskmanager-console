"use client";

import { useState } from "react";
import type {
  ApplicationStageClient,
  SignupContext,
} from "@/types/signup";

interface Stage {
  key: ApplicationStageClient | "submit";
  label: string;
  sub: string;
}

function buildTimeline(hasForm: boolean): Stage[] {
  return [
    { key: "pending_form", label: "Sign up", sub: "Account created" },
    ...(hasForm
      ? [
          {
            key: "submit" as const,
            label: "Submit application",
            sub: "Tell the manager about you",
          },
        ]
      : []),
    { key: "reviewing" as const, label: "Manager review", sub: "We look it over" },
    { key: "interview" as const, label: "Interview", sub: "Meet the team" },
    { key: "hired" as const, label: "Hired", sub: "Start your first shift" },
  ];
}

function stageIndex(
  stage: ApplicationStageClient,
  hasForm: boolean,
): { active: number; failed: boolean; withdrawn: boolean } {
  const stages = buildTimeline(hasForm);
  if (stage === "rejected") {
    return { active: -1, failed: true, withdrawn: false };
  }
  if (stage === "withdrawn") {
    return { active: -1, failed: false, withdrawn: true };
  }
  if (stage === "pending_form") {
    // 회원가입은 끝남 (Done) → 현재 active 는 "Submit application" (hasForm) 또는 "Manager review" (no form)
    return {
      active: hasForm
        ? stages.findIndex((s) => s.key === "submit")
        : stages.findIndex((s) => s.key === "reviewing"),
      failed: false,
      withdrawn: false,
    };
  }
  if (stage === "new") {
    // 제출 완료 → Submit application Done, 현재 active 는 Manager review
    return {
      active: stages.findIndex((s) => s.key === "reviewing"),
      failed: false,
      withdrawn: false,
    };
  }
  if (stage === "reviewing") {
    return {
      active: stages.findIndex((s) => s.key === "reviewing"),
      failed: false,
      withdrawn: false,
    };
  }
  if (stage === "interview") {
    return {
      active: stages.findIndex((s) => s.key === "interview"),
      failed: false,
      withdrawn: false,
    };
  }
  if (stage === "hired") {
    return {
      active: stages.findIndex((s) => s.key === "hired"),
      failed: false,
      withdrawn: false,
    };
  }
  return { active: 0, failed: false, withdrawn: false };
}

interface Props {
  ctx: SignupContext;
  fullName: string;
  username: string;
  stage: ApplicationStageClient;
  hasForm: boolean;
  onContinueForm?: () => void; // pending_form + hasForm
  onWithdraw?: () => void;
  onGoToApp?: () => void;
  onRefresh?: () => void;
}

export function StatusScreen({
  ctx,
  fullName,
  username,
  stage,
  hasForm,
  onContinueForm,
  onWithdraw,
  onGoToApp,
  onRefresh,
}: Props) {
  const [showWithdrawConfirm, setShowWithdrawConfirm] = useState(false);
  const stages = buildTimeline(hasForm);
  const { active, failed, withdrawn } = stageIndex(stage, hasForm);

  const isActiveStage =
    stage === "pending_form" ||
    stage === "new" ||
    stage === "reviewing" ||
    stage === "interview";

  // pending_form 은 제출 전이라 자진 철회 불필요 — 그냥 안 만들면 끝.
  // 제출 완료된 application 만 withdraw 노출.
  const canWithdraw =
    stage === "new" || stage === "reviewing" || stage === "interview";

  const headlineByStage: Record<ApplicationStageClient, { title: string; sub: string }> = {
    pending_form: {
      title: hasForm ? "You're signed up. One last step!" : "You're signed up",
      sub: hasForm
        ? "Submit your application to get reviewed."
        : "The manager will reach out shortly.",
    },
    new: {
      title: "Application submitted",
      sub: "The manager will review and reach out to you soon.",
    },
    reviewing: {
      title: "Under review",
      sub: "The manager is reviewing your application.",
    },
    interview: {
      title: "Interview stage",
      sub: "An interview is being arranged. Watch for an email.",
    },
    hired: {
      title: "Welcome aboard!",
      sub: "You're hired. Open the staff app to start working.",
    },
    rejected: {
      title: "Not a match this time",
      sub: "Thanks for applying. You're welcome to apply again later.",
    },
    withdrawn: {
      title: "Application withdrawn",
      sub: "You withdrew this application. You can apply again later.",
    },
  };

  const headline = headlineByStage[stage];

  return (
    <div className="flex min-h-[100dvh] flex-col bg-white">
      {/* signed-in header */}
      <div className="border-b border-slate-100 bg-slate-50 px-5 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 text-[11px] font-semibold uppercase text-blue-700">
              {fullName
                .split(" ")
                .map((n) => n[0])
                .join("")
                .slice(0, 2) || username.slice(0, 2).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate text-[12.5px] font-semibold text-slate-900">
                {fullName || username}
              </p>
              <p className="truncate text-[10.5px] text-slate-500">
                Signed in · @{username}
              </p>
            </div>
          </div>
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              className="rounded-md p-1.5 text-slate-500 hover:bg-slate-200 hover:text-slate-700"
              aria-label="Refresh status"
            >
              <svg
                className="h-4 w-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="23 4 23 10 17 10" />
                <polyline points="1 20 1 14 7 14" />
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <div className="px-5 pt-6 pb-3">
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.16em] text-slate-400">
          {ctx.organization.name} · {ctx.store.name}
        </p>
        <h1 className="mt-2 text-[24px] font-semibold leading-tight tracking-tight text-slate-900">
          {headline.title}
          {stage === "hired" && " 🎉"}
        </h1>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-slate-500">
          {headline.sub}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-4">
        {/* Hired stage banner */}
        {stage === "hired" && (
          <div className="mb-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
                <svg
                  className="h-5 w-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-emerald-900">
                  You&apos;re officially hired!
                </p>
                <p className="text-[11.5px] text-emerald-700">
                  Open the staff app to clock in and view shifts.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Failure banners */}
        {failed && (
          <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 p-4">
            <p className="text-[13px] font-semibold text-rose-900">
              Application not accepted
            </p>
            <p className="mt-1 text-[11.5px] text-rose-700">
              The manager has decided not to move forward this time. You can
              re-apply to other stores anytime.
            </p>
          </div>
        )}
        {withdrawn && (
          <div className="mb-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-[13px] font-semibold text-slate-900">
              Withdrawn by you
            </p>
            <p className="mt-1 text-[11.5px] text-slate-600">
              You withdrew this application. You can apply again to a different
              store any time.
            </p>
          </div>
        )}

        {/* Timeline */}
        <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-slate-400">
          Application progress
        </p>
        <ol className="space-y-2">
          {stages.map((s, idx) => {
            const isActive = idx === active && isActiveStage;
            const isDone = active > idx && isActiveStage;
            const dim = failed || withdrawn;

            return (
              <li
                key={s.key}
                className={[
                  "flex items-start gap-3 rounded-xl border px-3 py-2.5",
                  isActive
                    ? "border-blue-300 bg-blue-50"
                    : isDone
                      ? "border-emerald-200 bg-white"
                      : "border-slate-100 bg-white",
                  dim ? "opacity-50" : "",
                ].join(" ")}
              >
                <span
                  className={[
                    "flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full text-[11.5px] font-semibold",
                    isActive
                      ? "bg-blue-600 text-white"
                      : isDone
                        ? "bg-emerald-500 text-white"
                        : "bg-slate-100 text-slate-500",
                  ].join(" ")}
                >
                  {isDone ? (
                    <svg
                      className="h-3.5 w-3.5"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    idx + 1
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p
                    className={[
                      "text-[12.5px] leading-snug",
                      isActive
                        ? "font-semibold text-blue-900"
                        : isDone
                          ? "font-medium text-slate-900"
                          : "font-medium text-slate-700",
                    ].join(" ")}
                  >
                    {s.label}
                    {isActive && (
                      <span className="ml-2 rounded-full bg-blue-600 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-white">
                        Now
                      </span>
                    )}
                  </p>
                  <p className="text-[11px] leading-snug text-slate-500">
                    {s.sub}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      </div>

      {/* Sticky CTA bar */}
      <div className="border-t border-slate-100 bg-white px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 space-y-2">
        {stage === "pending_form" && hasForm && onContinueForm && (
          <button
            type="button"
            onClick={onContinueForm}
            className="w-full rounded-xl bg-blue-600 px-5 py-3.5 text-[14px] font-semibold text-white shadow-sm shadow-blue-500/20 hover:bg-blue-700"
          >
            Continue your application
          </button>
        )}
        {stage === "hired" && onGoToApp && (
          <button
            type="button"
            onClick={onGoToApp}
            className="w-full rounded-xl bg-emerald-600 px-5 py-3.5 text-[14px] font-semibold text-white shadow-sm shadow-emerald-500/20 hover:bg-emerald-700"
          >
            Go to staff app
          </button>
        )}
        {canWithdraw && onWithdraw && (
          <button
            type="button"
            onClick={() => setShowWithdrawConfirm(true)}
            className="w-full rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-[12.5px] font-medium text-slate-600 hover:bg-slate-50"
          >
            Withdraw application
          </button>
        )}
        {!isActiveStage && stage !== "hired" && (
          <p className="text-center text-[11px] text-slate-400">
            You can close this page — we&apos;ll email you with updates.
          </p>
        )}
      </div>

      {showWithdrawConfirm && onWithdraw && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setShowWithdrawConfirm(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-[16px] font-semibold text-slate-900">
              Withdraw your application?
            </h3>
            <p className="mt-1 text-[12.5px] leading-relaxed text-slate-500">
              Your application will be removed from the manager&apos;s queue.
              You can apply again later.
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setShowWithdrawConfirm(false)}
                className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-[13px] font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowWithdrawConfirm(false);
                  onWithdraw();
                }}
                className="flex-[2] rounded-lg bg-rose-600 px-3 py-2 text-[13px] font-semibold text-white hover:bg-rose-700"
              >
                Withdraw
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
