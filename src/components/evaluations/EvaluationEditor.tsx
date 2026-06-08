"use client";

import React, { useMemo, useState } from "react";
import { ChevronLeft } from "lucide-react";
import type { TemplateConfig, EvaluationScores, EvaluationStatus } from "@/types";
import { Button } from "@/components/ui";
import { useModal } from "@/components/ui/imperative-modal";
import { useTimezone } from "@/hooks/useTimezone";
import { todayInTimezone, formatDateTime } from "@/lib/utils";
import { completedCount, averageScore } from "./criteria";
import { EvaluationFormDoc } from "./EvaluationFormDoc";
import { EmployeeModal, AssignmentModal, PeriodModal } from "./EditorPickers";

/** The mutable shape the editor edits. Names mirror the API write fields. */
export interface EditorDraft {
  evaluatee_id: string | null;
  evaluatee_name: string | null;
  employee_no: string | null;
  store_id: string | null;
  store_name: string | null;
  position_id: string | null;
  position_name: string | null;
  /** Stores the selected employee belongs to (drives the Store dropdown). */
  employee_stores: { id: string; name: string }[];
  period_start: string;
  period_end: string;
  responses: EvaluationScores;
  improvement: string;
  good_examples: string;
}

export const EMPTY_DRAFT: EditorDraft = {
  evaluatee_id: null,
  evaluatee_name: null,
  employee_no: null,
  store_id: null,
  store_name: null,
  position_id: null,
  position_name: null,
  employee_stores: [],
  period_start: "",
  period_end: "",
  responses: {},
  improvement: "",
  good_examples: "",
};

interface EvaluationEditorProps {
  /** The criteria/scale this evaluation is scored against. */
  config: TemplateConfig;
  initial: EditorDraft;
  /** Status of the record being edited (null for a brand-new evaluation). */
  editingStatus: EvaluationStatus | null;
  saving: boolean;
  onBack: () => void;
  onSaveDraft: (d: EditorDraft) => void;
  onSubmit: (d: EditorDraft) => void;
}

export function EvaluationEditor({
  config,
  initial,
  editingStatus,
  saving,
  onBack,
  onSaveDraft,
  onSubmit,
}: EvaluationEditorProps): React.ReactElement {
  const modal = useModal();
  const tz = useTimezone();
  const today = todayInTimezone(tz);
  // [M4] New evaluations stamp the current datetime (date + time); the form
  // header shows it as a fixed value for this editing session.
  const [nowIso] = useState(() => new Date().toISOString());

  // New evaluations start with the period pre-filled to today → today (yyyy-mm-dd);
  // editing an existing record keeps its saved period.
  const [draft, setDraft] = useState<EditorDraft>(() => ({
    ...initial,
    period_start: initial.period_start || today,
    period_end: initial.period_end || today,
  }));
  const [activeModal, setActiveModal] = useState<null | "employee" | "assignment" | "period">(null);

  const editingSubmitted = editingStatus === "submitted";
  const criteriaCount = config.criteria.length;
  const done = completedCount(config, draft.responses);
  const avg = averageScore(config, draft.responses);

  const dirty = useMemo(
    () => JSON.stringify(draft) !== JSON.stringify(initial),
    [draft, initial],
  );

  // Submit requires an employee, a store, and a valid (non-future) period.
  // Position is optional ([M3]).
  const setupComplete = !!(
    draft.evaluatee_id &&
    draft.store_id &&
    draft.period_start &&
    draft.period_end &&
    draft.period_start <= draft.period_end &&
    draft.period_end <= today
  );
  const canSubmit = setupComplete && done === criteriaCount;
  // [M6] A draft can be saved with only an employee picked (everything else partial).
  const canSaveDraft = !!draft.evaluatee_id;

  function patch(p: Partial<EditorDraft>): void {
    setDraft((prev) => ({ ...prev, ...p }));
  }

  async function handleBack(): Promise<void> {
    if (dirty) {
      const ok = await modal.confirm({
        title: "Discard changes?",
        message: "This evaluation hasn't been saved.",
        confirmLabel: "Discard",
        cancelLabel: "Keep editing",
        variant: "danger",
      });
      if (!ok) return;
    }
    onBack();
  }

  return (
    <div className="max-w-[840px] mx-auto pb-10">
      {/* Always-visible action bar (sticks to the top while scrolling the form) */}
      <div className="sticky top-0 z-20 mb-4 bg-card border border-border rounded-lg px-3 sm:px-4 py-2.5 flex items-center gap-3 shadow-sm">
        <Button variant="ghost" onClick={() => void handleBack()} className="gap-1.5">
          <ChevronLeft className="h-4 w-4" />
          Back
        </Button>
        <div className="flex items-center gap-2.5 ml-1 min-w-0">
          <div className="w-16 sm:w-24 h-1.5 rounded-full bg-surface-hover overflow-hidden shrink-0">
            <div
              className="h-full rounded-full bg-accent transition-all"
              style={{ width: `${(done / criteriaCount) * 100}%` }}
            />
          </div>
          <span className="text-[13px] font-semibold text-text-secondary whitespace-nowrap">
            {done}/{criteriaCount}
          </span>
          {avg != null && (
            <span className="text-[13px] font-semibold text-text-muted whitespace-nowrap hidden lg:inline">
              · avg {avg.toFixed(1)}
            </span>
          )}
        </div>
        <div className="ml-auto flex items-center gap-2.5">
          {!canSubmit && (
            <span className="text-xs text-text-muted hidden lg:inline whitespace-nowrap">
              {!setupComplete ? "fill the header fields" : `rate all ${criteriaCount} to submit`}
            </span>
          )}
          <Button
            variant="secondary"
            disabled={!canSaveDraft || saving}
            onClick={() => onSaveDraft(draft)}
          >
            Save draft
          </Button>
          <Button
            variant="primary"
            disabled={!canSubmit || saving}
            isLoading={saving}
            onClick={() => onSubmit(draft)}
          >
            {editingSubmitted ? "Update" : "Submit"}
          </Button>
        </div>
      </div>

      <div>
        <EvaluationFormDoc
          mode="edit"
          config={config}
          employeeName={draft.evaluatee_name}
          employeeNo={draft.employee_no}
          storeName={draft.store_name}
          jobTitle={draft.position_name}
          periodStart={draft.period_start}
          periodEnd={draft.period_end}
          dateLabel={formatDateTime(nowIso, tz)}
          scores={draft.responses}
          improvement={draft.improvement}
          goodExamples={draft.good_examples}
          onPickEmployee={() => setActiveModal("employee")}
          onPickAssignment={() => setActiveModal("assignment")}
          onPickPeriod={() => setActiveModal("period")}
          onScore={(code, n) => patch({ responses: { ...draft.responses, [code]: n } })}
          onImprovement={(s) => patch({ improvement: s })}
          onGoodExamples={(s) => patch({ good_examples: s })}
        />
      </div>

      {activeModal === "employee" && (
        <EmployeeModal
          current={draft.evaluatee_id}
          onClose={() => setActiveModal(null)}
          onSelect={(user) => {
            // [M2] Changing the employee RESETS store + position, then re-prefills
            // from the new employee's primary (home) store / position.
            patch({
              evaluatee_id: user.id,
              evaluatee_name: user.full_name,
              employee_no: user.employee_no,
              employee_stores: user.stores,
              store_id: user.store_id,
              store_name: user.store_name,
              position_id: user.position_id,
              position_name: user.position_name,
            });
          }}
        />
      )}
      {activeModal === "assignment" && (
        <AssignmentModal
          storeId={draft.store_id}
          positionId={draft.position_id}
          employeeStores={draft.employee_stores}
          onClose={() => setActiveModal(null)}
          onApply={(storeId, storeName, positionId, positionName) =>
            patch({
              store_id: storeId,
              store_name: storeName,
              position_id: positionId,
              position_name: positionName,
            })
          }
        />
      )}
      {activeModal === "period" && (
        <PeriodModal
          start={draft.period_start}
          end={draft.period_end}
          today={today}
          onClose={() => setActiveModal(null)}
          onApply={(start, end) => patch({ period_start: start, period_end: end })}
        />
      )}
    </div>
  );
}
