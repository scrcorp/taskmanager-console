"use client";

import React from "react";
import { ChevronLeft, Pencil, Trash2 } from "lucide-react";
import type { Evaluation } from "@/types";
import { Button, Badge, LoadingSpinner } from "@/components/ui";
import { useEvaluation } from "@/hooks/useEvaluations";
import { useTimezone } from "@/hooks/useTimezone";
import { formatDateTime } from "@/lib/utils";
import { averageScore } from "./criteria";
import { EvaluationFormDoc } from "./EvaluationFormDoc";

interface EvaluationDetailProps {
  evaluationId: string;
  onBack: () => void;
  onEdit: (id: string) => void;
  onDelete: (ev: Evaluation) => void;
}

function StatusBadge({ status }: { status: Evaluation["status"] }): React.ReactElement {
  return status === "submitted" ? (
    <Badge variant="success">Submitted</Badge>
  ) : (
    <Badge variant="warning">Draft</Badge>
  );
}

export function EvaluationDetail({
  evaluationId,
  onBack,
  onEdit,
  onDelete,
}: EvaluationDetailProps): React.ReactElement {
  const tz = useTimezone();
  const { data: ev, isLoading, isError } = useEvaluation(evaluationId);

  if (isLoading) {
    return (
      <div className="py-16 flex justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (isError || !ev) {
    return (
      <div className="max-w-[840px] mx-auto">
        <Button variant="ghost" onClick={onBack} className="gap-1.5 mb-4">
          <ChevronLeft className="h-4 w-4" />
          Back
        </Button>
        <div className="bg-card border border-border rounded-xl p-12 text-center text-text-muted">
          This evaluation could not be loaded. It may have been deleted.
        </div>
      </div>
    );
  }

  const isDraft = ev.status === "draft";
  const avg = ev.average ?? averageScore(ev.template_snapshot, ev.responses);

  return (
    <div className="max-w-[840px] mx-auto pb-10">
      {/* Always-visible toolbar */}
      <div className="sticky top-0 z-20 mb-4 bg-card border border-border rounded-lg px-3 sm:px-4 py-2.5 flex items-center gap-2 flex-wrap shadow-sm">
        <Button variant="ghost" onClick={onBack} className="gap-1.5">
          <ChevronLeft className="h-4 w-4" />
          Back
        </Button>
        <StatusBadge status={ev.status} />
        {avg != null && !isDraft && (
          <span className="text-xs text-text-muted hidden sm:inline">
            avg <b className="text-text">{avg.toFixed(1)}</b> / 5
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Button variant="danger" onClick={() => onDelete(ev)} className="gap-1.5">
            <Trash2 className="h-4 w-4" />
            Delete
          </Button>
          <Button variant="primary" onClick={() => onEdit(ev.id)} className="gap-1.5">
            <Pencil className="h-4 w-4" />
            {isDraft ? "Continue editing" : "Edit"}
          </Button>
        </div>
      </div>

      <div>
        <EvaluationFormDoc
          mode="view"
          config={ev.template_snapshot}
          employeeName={ev.evaluatee_name}
          employeeNo={ev.employee_no}
          storeName={ev.store_name}
          jobTitle={ev.job_title ?? ev.position_name}
          periodStart={ev.period_start}
          periodEnd={ev.period_end}
          dateLabel={formatDateTime(ev.submitted_at ?? ev.created_at, tz)}
          scores={ev.responses}
          improvement={ev.improvement ?? ""}
          goodExamples={ev.good_examples ?? ""}
        />
      </div>
    </div>
  );
}
