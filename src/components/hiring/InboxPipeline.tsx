"use client";

import { useState } from "react";
import {
  useApplicationsInbox,
  usePatchApplication,
  type InboxApplicationItem,
  type ApplicationStage,
} from "@/hooks/useHiring";
import { useModal } from "@/components/ui/imperative-modal";
import { ApplicantDetailDrawer } from "./ApplicantDetailDrawer";
import { StoreBadge } from "./StoreBadge";

interface Props {
  storeId: string;
  q: string;
}

const STAGES: { key: ApplicationStage; label: string; tone: string }[] = [
  { key: "pending_form", label: "Filling out", tone: "bg-[#F0F1F5] text-[#64748B]" },
  { key: "new", label: "New", tone: "bg-[rgba(108,92,231,0.1)] text-[#6C5CE7]" },
  { key: "screen", label: "Screen", tone: "bg-[rgba(240,165,0,0.12)] text-[#C28100]" },
  { key: "interview", label: "Interview", tone: "bg-[rgba(59,141,217,0.12)] text-[#3B8DD9]" },
  { key: "review", label: "Review", tone: "bg-[rgba(139,92,246,0.12)] text-[#7C3AED]" },
  { key: "hired", label: "Hired", tone: "bg-[rgba(0,184,148,0.12)] text-[#00B894]" },
  { key: "rejected", label: "Rejected", tone: "bg-[rgba(239,68,68,0.1)] text-[#EF4444]" },
];

export function InboxPipeline({ storeId, q }: Props) {
  const { data, isLoading } = useApplicationsInbox({
    storeId: storeId || undefined,
    q: q || undefined,
    perPage: 200,
  });
  // storeId 는 캐시 무효화용으로만 쓰임 — cross-store 패치는 inbox 무효화에 의존.
  const patch = usePatchApplication(storeId);
  const modal = useModal();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<{ id: string; storeId: string } | null>(null);

  const items = data?.items ?? [];
  const showStore = !storeId;

  const handleDrop = (stage: ApplicationStage, app: InboxApplicationItem) => {
    if (stage === "pending_form") return;
    if (stage === "hired") {
      void modal.alert({
        type: "error",
        message: "To hire, open the applicant and use 'Hire — create staff account'.",
      });
      return;
    }
    if (app.stage === "pending_form") {
      void modal.alert({
        type: "error",
        message: "This applicant hasn't submitted their application yet.",
      });
      return;
    }
    if (app.stage === stage) return;
    if (app.stage === "withdrawn") {
      void modal.alert({
        type: "error",
        message: "Withdrawn is set by the applicant. Open the card to override.",
      });
      return;
    }
    patch.mutate({ applicationId: app.id, patch: { stage } });
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-7 gap-3">
        {STAGES.map((stage) => {
          const cards = items.filter((a) =>
            stage.key === "rejected"
              ? a.stage === "rejected" || a.stage === "withdrawn"
              : a.stage === stage.key,
          );
          return (
            <div
              key={stage.key}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData("text/plain");
                const app = items.find((a) => a.id === id);
                if (app) handleDrop(stage.key, app);
                setDraggingId(null);
              }}
              className="flex min-h-[280px] flex-col rounded-2xl bg-[#F0F1F5] p-2.5"
            >
              <div className="flex items-center justify-between px-2 pb-2.5 pt-1">
                <span
                  className={[
                    "inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[11px] font-semibold",
                    stage.tone,
                  ].join(" ")}
                >
                  {stage.label}
                </span>
                <span className="text-[10.5px] font-medium text-[#64748B]">{cards.length}</span>
              </div>

              <div className="flex flex-1 flex-col gap-2">
                {isLoading ? (
                  <div className="text-center text-[11px] text-[#94A3B8]">…</div>
                ) : cards.length === 0 ? (
                  <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-[#CBD5E1] px-3 py-6 text-center text-[11px] text-[#94A3B8]">
                    No one here
                  </div>
                ) : (
                  cards.map((a) => (
                    <div
                      key={a.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/plain", a.id);
                        setDraggingId(a.id);
                      }}
                      onDragEnd={() => setDraggingId(null)}
                      onClick={() => setSelected({ id: a.id, storeId: a.store_id })}
                      className={[
                        "cursor-grab rounded-lg bg-white p-2.5 ring-1 ring-[#E2E4EA] transition-shadow hover:shadow-sm",
                        draggingId === a.id ? "opacity-50" : "",
                      ].join(" ")}
                    >
                      <div className="flex items-center gap-2">
                        <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-[rgba(108,92,231,0.1)] text-[10px] font-semibold text-[#6C5CE7]">
                          {a.candidate.full_name
                            .split(" ")
                            .map((n) => n[0])
                            .join("")
                            .slice(0, 2)
                            .toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[12px] font-medium text-[#1A1D27]">
                            {a.candidate.full_name}
                          </p>
                          <p className="truncate text-[10.5px] text-[#94A3B8]">
                            {a.attempt_no > 1 ? `Attempt #${a.attempt_no}` : "First attempt"}
                          </p>
                        </div>
                        {stage.key === "rejected" && a.stage === "withdrawn" && (
                          <span className="flex-shrink-0 rounded-full bg-[#F0F1F5] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-[#64748B]">
                            Withdrew
                          </span>
                        )}
                      </div>
                      <div className="mt-2 flex items-center justify-between gap-2 text-[10.5px] text-[#64748B]">
                        {showStore ? (
                          <StoreBadge name={a.store.name} id={a.store.id} variant="chip" />
                        ) : (
                          <span>{a.submitted_at.slice(0, 10)}</span>
                        )}
                        {a.score !== null && (
                          <span className="rounded bg-[#F0F1F5] px-1.5 py-0.5 font-mono font-semibold tabular-nums text-[#1A1D27]">
                            {a.score}
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="px-1 text-[11px] text-[#94A3B8]">
        Drag a card between columns to change its stage. Click a card for details. For
        &quot;Hired&quot;, open the card and use the green Hire button.
      </p>

      {selected && (
        <ApplicantDetailDrawer
          storeId={selected.storeId}
          applicationId={selected.id}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
