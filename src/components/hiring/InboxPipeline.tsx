"use client";

import { useState } from "react";
import { CalendarClock } from "lucide-react";
import {
  useApplicationsInbox,
  usePatchApplication,
  type InboxApplicationItem,
  type ApplicationStage,
} from "@/hooks/useHiring";
import { useModal } from "@/components/ui/imperative-modal";
import { ApplicantDetailDrawer } from "./ApplicantDetailDrawer";
import { StoreBadge } from "./StoreBadge";
import { effectiveSubstatus, type InterviewSubstatus } from "./InterviewStepper";

interface Props {
  storeId: string;
  q: string;
}

type StaleBucket = "rejected" | "pending_form";

const STAGES: { key: ApplicationStage; label: string; tone: string }[] = [
  { key: "pending_form", label: "Filling out", tone: "bg-[#F0F1F5] text-[#64748B]" },
  { key: "new", label: "New", tone: "bg-[rgba(108,92,231,0.1)] text-[#6C5CE7]" },
  { key: "screen", label: "Screen", tone: "bg-[rgba(240,165,0,0.12)] text-[#C28100]" },
  { key: "interview", label: "Interview", tone: "bg-[rgba(59,141,217,0.12)] text-[#3B8DD9]" },
  { key: "review", label: "Review", tone: "bg-[rgba(139,92,246,0.12)] text-[#7C3AED]" },
  { key: "hired", label: "Hired", tone: "bg-[rgba(0,184,148,0.12)] text-[#00B894]" },
  { key: "rejected", label: "Rejected", tone: "bg-[rgba(239,68,68,0.1)] text-[#EF4444]" },
];

/** 이 일수보다 오래 방치된 Rejected/Filling out 카드는 기본으로 접는다. */
const STALE_DAYS = 7;
const STALE_MS = STALE_DAYS * 24 * 60 * 60 * 1000;
/** 접기 대상 컬럼 → 서버 stale 버킷 키 (rejected 컬럼은 withdrawn 도 포함). */
const STALE_BUCKET: Partial<Record<ApplicationStage, StaleBucket>> = {
  rejected: "rejected",
  pending_form: "pending_form",
};

/** 서버의 stale 판정과 같은 기준 — rejected 는 rejected_at(없으면 updated_at), 나머지는 updated_at. */
function isStale(a: InboxApplicationItem, bucket: StaleBucket): boolean {
  const ts = bucket === "rejected" ? (a.rejected_at ?? a.updated_at) : a.updated_at;
  return Date.now() - new Date(ts).getTime() > STALE_MS;
}

// 인터뷰 진행 상태 → 카드에 뿌릴 문구/색. 확정 전에도 "무엇을 기다리는 중인지" 보이게 한다.
const INTERVIEW_STATE: Record<
  InterviewSubstatus,
  { label: string; hint?: string; dot: string; text: string }
> = {
  not_requested: {
    label: "Not requested",
    hint: "No times sent yet",
    dot: "bg-[#CBD5E1]",
    text: "text-[#94A3B8]",
  },
  requested: {
    label: "Times requested",
    hint: "Waiting on applicant",
    dot: "bg-[#3B8DD9]",
    text: "text-[#3B8DD9]",
  },
  picked: {
    label: "Applicant picked",
    hint: "Needs confirmation",
    dot: "bg-[#F0A500]",
    text: "text-[#C28100]",
  },
  confirmed: { label: "Confirmed", dot: "bg-[#00B894]", text: "text-[#00B894]" },
  completed: { label: "Interview done", dot: "bg-[#94A3B8]", text: "text-[#64748B]" },
};

function formatInterviewAt(iso: string, orgTz?: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    ...(orgTz ? { timeZone: orgTz } : {}),
  });
}

/** Interview 컬럼 카드에만 붙는 인터뷰 일정 블록. */
function InterviewInfo({ app, orgTz }: { app: InboxApplicationItem; orgTz?: string }) {
  const status = effectiveSubstatus(app.interview_substatus, app.interview_at);
  const s = INTERVIEW_STATE[status];
  const scheduled = (status === "confirmed" || status === "completed") && app.interview_at;

  return (
    <div className="mt-2 rounded-md bg-[#F8F9FC] px-2 py-1.5">
      <p className={`flex items-center gap-1.5 text-[10.5px] font-semibold ${s.text}`}>
        <span className={`h-1.5 w-1.5 flex-shrink-0 rounded-full ${s.dot}`} />
        <span className="truncate">{s.label}</span>
      </p>
      {scheduled ? (
        <>
          <p className="mt-1 flex items-center gap-1 text-[11px] font-semibold tabular-nums text-[#1A1D27]">
            <CalendarClock size={11} className="flex-shrink-0 text-[#64748B]" />
            <span className="truncate">{formatInterviewAt(app.interview_at!, orgTz)}</span>
          </p>
          <p className="truncate pl-[15px] text-[10px] text-[#64748B]">
            {app.interviewer_name ?? "No interviewer"}
          </p>
        </>
      ) : (
        <p className="mt-0.5 pl-[15px] text-[10px] text-[#94A3B8]">
          {s.hint ?? "Date not set"}
        </p>
      )}
    </div>
  );
}

interface CardProps {
  app: InboxApplicationItem;
  columnKey: ApplicationStage;
  showStore: boolean;
  orgTz?: string;
  dragging: boolean;
  /** older 그룹 카드 — 지난 이력이라 한 톤 죽여서 최근 카드와 구분한다. */
  muted?: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onClick: () => void;
}

function ApplicantCard({
  app: a,
  columnKey,
  showStore,
  orgTz,
  dragging,
  muted = false,
  onDragStart,
  onDragEnd,
  onClick,
}: CardProps) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      className={[
        "cursor-grab rounded-lg p-2.5 ring-1 transition-shadow hover:shadow-sm",
        muted
          ? "bg-white/60 opacity-75 ring-[#E7E9EF] hover:opacity-100"
          : "bg-white ring-[#E2E4EA]",
        dragging ? "opacity-50" : "",
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
        {columnKey === "rejected" && a.stage === "withdrawn" && (
          <span className="flex-shrink-0 rounded-full bg-[#F0F1F5] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-[#64748B]">
            Withdrew
          </span>
        )}
      </div>
      {columnKey === "interview" && <InterviewInfo app={a} orgTz={orgTz} />}
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
  );
}

export function InboxPipeline({ storeId, q }: Props) {
  // 'Show older' 를 켠 컬럼 — 서버 stale 제외에서 면제된다 (컬럼별 독립).
  const [showOlder, setShowOlder] = useState<StaleBucket[]>([]);

  const { data, isLoading } = useApplicationsInbox({
    storeId: storeId || undefined,
    q: q || undefined,
    perPage: 200,
    staleDays: STALE_DAYS,
    includeStale: showOlder,
  });
  // storeId 는 캐시 무효화용으로만 쓰임 — cross-store 패치는 inbox 무효화에 의존.
  const patch = usePatchApplication(storeId);
  const modal = useModal();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [selected, setSelected] = useState<{ id: string; storeId: string } | null>(null);

  const items = data?.items ?? [];
  const showStore = !storeId;
  const orgTz = data?.org_timezone;
  const staleHidden = data?.stale_hidden;

  const toggleOlder = (bucket: StaleBucket): void =>
    setShowOlder((prev) =>
      prev.includes(bucket) ? prev.filter((b) => b !== bucket) : [...prev, bucket],
    );

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
          const inColumn = items.filter((a) =>
            stage.key === "rejected"
              ? a.stage === "rejected" || a.stage === "withdrawn"
              : a.stage === stage.key,
          );
          const bucket = STALE_BUCKET[stage.key];
          // 펼쳤을 때만 older 가 섞여 들어온다 — 최근/older 를 갈라서 따로 그린다.
          const recent = bucket ? inColumn.filter((a) => !isStale(a, bucket)) : inColumn;
          const older = bucket ? inColumn.filter((a) => isStale(a, bucket)) : [];
          const hiddenCount = bucket ? (staleHidden?.[bucket] ?? 0) : 0;
          const expanded = bucket ? showOlder.includes(bucket) : false;

          const renderCard = (a: InboxApplicationItem, muted = false) => (
            <ApplicantCard
              key={a.id}
              app={a}
              columnKey={stage.key}
              showStore={showStore}
              orgTz={orgTz}
              muted={muted}
              dragging={draggingId === a.id}
              onDragStart={(e) => {
                e.dataTransfer.setData("text/plain", a.id);
                setDraggingId(a.id);
              }}
              onDragEnd={() => setDraggingId(null)}
              onClick={() => setSelected({ id: a.id, storeId: a.store_id })}
            />
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
                <span className="text-[10.5px] font-medium text-[#64748B]">
                  {inColumn.length}
                </span>
              </div>

              {/* 최근(7일 이내) 카드 — 비어 있고 접힌 older 도 없을 때만 빈 상태가 컬럼을 채운다 */}
              <div
                className={[
                  "flex flex-col gap-2",
                  recent.length === 0 && hiddenCount === 0 ? "flex-1" : "",
                ].join(" ")}
              >
                {isLoading ? (
                  <div className="text-center text-[11px] text-[#94A3B8]">…</div>
                ) : recent.length === 0 ? (
                  <div
                    className={[
                      "flex items-center justify-center rounded-lg border border-dashed border-[#CBD5E1] px-3 text-center text-[11px] text-[#94A3B8]",
                      hiddenCount > 0 ? "py-4" : "flex-1 py-6",
                    ].join(" ")}
                  >
                    No one here
                  </div>
                ) : (
                  recent.map((a) => renderCard(a))
                )}
              </div>

              {/* older 영역 — 마지막 카드 바로 아래에 붙되, 구분선 + 여백으로 최근 영역과 분리 */}
              {bucket && hiddenCount > 0 && !isLoading && (
                <div className="mt-4 border-t border-dashed border-[#CBD5E1] pt-2">
                  <button
                    type="button"
                    onClick={() => toggleOlder(bucket)}
                    className="w-full rounded-lg px-2 py-1 text-[10.5px] font-semibold text-[#64748B] transition-colors hover:bg-black/[0.05]"
                  >
                    {expanded ? `Hide ${hiddenCount} older` : `Show ${hiddenCount} older`}
                  </button>
                  {expanded && (
                    <div className="mt-1.5 flex flex-col gap-2">
                      <p className="px-1 text-[9px] font-semibold uppercase tracking-wider text-[#A3ADBD]">
                        Older than {STALE_DAYS} days
                      </p>
                      {older.map((a) => renderCard(a, true))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <p className="px-1 text-[11px] text-[#94A3B8]">
        Drag a card between columns to change its stage. Click a card for details. For
        &quot;Hired&quot;, open the card and use the green Hire button. Rejected and Filling
        out cards older than {STALE_DAYS} days are folded away — use &quot;Show older&quot; to
        see them.
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
