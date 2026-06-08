"use client";

/**
 * Evaluations — performance reviews across brands.
 *
 * Single-page view machine (ported from the approved mockup):
 *   list            — stats + filters + table (kebab: Open / Edit / Delete)
 *   templates       — the org Basic template card (Preview form; New/Edit = v2)
 *   templatePreview — blank printable form document
 *   editor          — authoring (header pickers open modals; inline 1–5 rating)
 *   detail          — read-only mirror of a submitted/draft evaluation
 *
 * Data + mutations come from the evaluation data layer (`useEvaluations.ts`);
 * mutation result modals fire from `useMutationResult` inside those hooks, so this
 * page never re-shows success/error. Deletes confirm via `useModal`.
 */

import React, { useMemo, useState } from "react";
import { Plus } from "lucide-react";

import { usePersistedFilters } from "@/hooks/usePersistedFilters";
import { usePermissions } from "@/hooks/usePermissions";
import { useModal } from "@/components/ui/imperative-modal";
import {
  useEvalTemplates,
  useEvaluation,
  useCreateEvaluation,
  useUpdateEvaluation,
  useDeleteEvaluation,
} from "@/hooks/useEvaluations";
import { Button, LoadingSpinner } from "@/components/ui";
import { PERMISSIONS } from "@/lib/permissions";
import type {
  Evaluation,
  EvaluationCreate,
  EvaluationUpdate,
  TemplateConfig,
  EvalTemplate,
} from "@/types";

import { EvaluationsList } from "@/components/evaluations/EvaluationsList";
import { TemplatesList } from "@/components/evaluations/TemplatesList";
import { TemplatePreview } from "@/components/evaluations/TemplatePreview";
import { EvaluationDetail } from "@/components/evaluations/EvaluationDetail";
import {
  EvaluationEditor,
  EMPTY_DRAFT,
  type EditorDraft,
} from "@/components/evaluations/EvaluationEditor";
import { BASIC_TEMPLATE_CONFIG } from "@/components/evaluations/criteria";
import { fmtRange } from "@/components/evaluations/format";

type View = "list" | "templates" | "templatePreview" | "editor" | "detail";

const CAPTION: Record<View, string> = {
  list: "Performance reviews across your stores",
  templates: "The form your evaluations are based on",
  templatePreview: "Basic template — form preview",
  editor: "Fill the evaluation form",
  detail: "Evaluation detail",
};

/** Build the editor draft from an existing evaluation record. */
function draftFromEvaluation(ev: Evaluation): EditorDraft {
  return {
    evaluatee_id: ev.evaluatee_id,
    evaluatee_name: ev.evaluatee_name,
    employee_no: ev.employee_no,
    store_id: ev.store_id,
    store_name: ev.store_name,
    position_id: ev.position_id,
    position_name: ev.position_name ?? ev.job_title,
    // The picker re-fetches the candidate's stores on next employee change;
    // prefill the current store so the Store dropdown has at least it.
    employee_stores:
      ev.store_id && ev.store_name ? [{ id: ev.store_id, name: ev.store_name }] : [],
    period_start: ev.period_start ?? "",
    period_end: ev.period_end ?? "",
    responses: ev.responses,
    improvement: ev.improvement ?? "",
    good_examples: ev.good_examples ?? "",
  };
}

export default function EvaluationsPage(): React.ReactElement {
  const { hasPermission } = usePermissions();
  const modal = useModal();

  const canCreate = hasPermission(PERMISSIONS.EVALUATIONS_CREATE);
  const canUpdate = hasPermission(PERMISSIONS.EVALUATIONS_UPDATE);
  const canDelete = hasPermission(PERMISSIONS.EVALUATIONS_DELETE);

  // ── Persisted tab + list filters ──────────────────────────────────────────
  const [filters, setFilters] = usePersistedFilters("evaluations", {
    tab: "list",
    store: "",
    status: "",
    q: "",
    page: "1",
  });
  const tab = (filters.tab === "templates" ? "templates" : "list") as "list" | "templates";
  const page = Number(filters.page) || 1;

  // ── Transient view state (editor/detail/preview live in-page, not in the URL) ─
  const [view, setView] = useState<View>("list");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [previewTemplate, setPreviewTemplate] = useState<EvalTemplate | null>(null);

  // The view shown when on a tab page (list/templates) follows the persisted tab.
  const effectiveView: View =
    view === "list" || view === "templates" ? tab : view;

  // ── Template config for new evaluations (org Basic) ───────────────────────
  const { data: templates } = useEvalTemplates();
  const basicConfig: TemplateConfig = useMemo(
    () =>
      (templates?.find((t) => t.is_default) ?? templates?.[0])?.config ??
      BASIC_TEMPLATE_CONFIG,
    [templates],
  );

  // ── Editing record (existing eval being edited) ───────────────────────────
  const { data: editingEval, isLoading: editingLoading } = useEvaluation(
    view === "editor" && editingId ? editingId : undefined,
  );

  // ── Mutations ─────────────────────────────────────────────────────────────
  const createMut = useCreateEvaluation();
  const updateMut = useUpdateEvaluation();
  const deleteMut = useDeleteEvaluation();
  const saving = createMut.isPending || updateMut.isPending;

  // ── Navigation helpers ────────────────────────────────────────────────────
  function goList(): void {
    setView("list");
    setFilters({ tab: "list" });
  }

  function startFresh(): void {
    setEditingId(null);
    setSelectedId(null);
    setView("editor");
  }

  function openDetail(id: string): void {
    setSelectedId(id);
    setView("detail");
  }

  function editEvaluation(id: string): void {
    setEditingId(id);
    setSelectedId(id);
    setView("editor");
  }

  function previewForm(template: EvalTemplate): void {
    setPreviewTemplate(template);
    setView("templatePreview");
  }

  function setTab(next: "list" | "templates"): void {
    setView(next);
    setFilters({ tab: next, page: "1" });
  }

  // ── Save (create or update) ───────────────────────────────────────────────
  async function persist(d: EditorDraft, status: "draft" | "submitted"): Promise<void> {
    // [M6] A draft needs only an employee; store + valid period are submit-only.
    // Submitting still requires the full header (gated in the editor too).
    if (!d.evaluatee_id) return;
    if (status === "submitted" && (!d.store_id || !d.period_start || !d.period_end)) return;

    // Send only the fields that are actually present — partial drafts omit empties.
    const body: EvaluationCreate & EvaluationUpdate = {
      evaluatee_id: d.evaluatee_id,
      status,
      responses: d.responses,
      improvement: d.improvement,
      good_examples: d.good_examples,
    };
    if (d.store_id) body.store_id = d.store_id;
    body.position_id = d.position_id;
    if (d.period_start) body.period_start = d.period_start;
    if (d.period_end) body.period_end = d.period_end;

    try {
      if (editingId) {
        await updateMut.mutateAsync({ evaluationId: editingId, data: body });
        openDetail(editingId);
      } else {
        const created = await createMut.mutateAsync(body);
        if (status === "submitted") {
          openDetail(created.id);
        } else {
          goList();
        }
      }
    } catch {
      // Hook surfaces the error modal; keep the editor open for correction.
    }
  }

  // ── Delete (confirm → soft delete; hook fires the result modal) ────────────
  async function handleDelete(ev: Evaluation): Promise<void> {
    const who = ev.evaluatee_name ?? "this employee";
    const period = fmtRange(ev.period_start, ev.period_end);
    const ok = await modal.confirm({
      title: "Delete this evaluation?",
      message: `This will permanently remove ${who}'s ${period} evaluation. This can't be undone.`,
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;
    try {
      await deleteMut.mutateAsync(ev.id);
      goList();
    } catch {
      // Hook surfaces the error modal.
    }
  }

  // ── Editor draft + config resolution ──────────────────────────────────────
  const editorInitial: EditorDraft = useMemo(() => {
    if (editingId && editingEval) return draftFromEvaluation(editingEval);
    return EMPTY_DRAFT;
  }, [editingId, editingEval]);

  const editorConfig: TemplateConfig =
    editingId && editingEval ? editingEval.template_snapshot : basicConfig;

  const showTabs = effectiveView === "list" || effectiveView === "templates";

  return (
    <div className="space-y-0">
      {/* Page header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text">Evaluations</h1>
          <p className="text-sm text-text-secondary mt-1">{CAPTION[effectiveView]}</p>
        </div>
        {effectiveView === "list" && canCreate && (
          <Button variant="primary" size="lg" onClick={startFresh} className="gap-1.5">
            <Plus className="h-4 w-4" />
            Start Evaluation
          </Button>
        )}
      </div>

      {/* Section tabs */}
      {showTabs ? (
        <div className="flex items-center gap-1.5 mt-4 mb-6">
          {(
            [
              ["list", "Evaluations"],
              ["templates", "Templates"],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              type="button"
              onClick={() => setTab(v)}
              className={
                tab === v
                  ? "px-4 h-9 rounded-lg text-sm font-semibold bg-accent text-white shadow-sm"
                  : "px-4 h-9 rounded-lg text-sm font-semibold bg-surface border border-border text-text-secondary hover:text-text transition-colors"
              }
            >
              {label}
            </button>
          ))}
        </div>
      ) : (
        <div className="mb-6" />
      )}

      {/* Body */}
      {effectiveView === "list" && (
        <EvaluationsList
          storeFilter={filters.store}
          statusFilter={filters.status}
          query={filters.q}
          page={page}
          onStoreFilter={(v) => setFilters({ store: v || null, page: "1" })}
          onStatusFilter={(v) => setFilters({ status: v || null, page: "1" })}
          onQuery={(v) => setFilters({ q: v || null })}
          onPage={(p) => setFilters({ page: String(p) })}
          onStart={startFresh}
          onOpen={openDetail}
          onEdit={canUpdate ? editEvaluation : openDetail}
          onDelete={canDelete ? handleDelete : () => undefined}
        />
      )}

      {effectiveView === "templates" && <TemplatesList onPreview={previewForm} />}

      {effectiveView === "templatePreview" && previewTemplate && (
        <TemplatePreview
          config={previewTemplate.config}
          onBack={() => setTab("templates")}
        />
      )}

      {effectiveView === "editor" &&
        (editingId && editingLoading ? (
          <div className="py-16 flex justify-center">
            <LoadingSpinner />
          </div>
        ) : (
          <EvaluationEditor
            key={editingId ?? "new"}
            config={editorConfig}
            initial={editorInitial}
            editingStatus={editingEval?.status ?? null}
            saving={saving}
            onBack={() => (editingId ? openDetail(editingId) : goList())}
            onSaveDraft={(d) => void persist(d, "draft")}
            onSubmit={(d) => void persist(d, "submitted")}
          />
        ))}

      {effectiveView === "detail" && selectedId && (
        <EvaluationDetail
          evaluationId={selectedId}
          onBack={goList}
          onEdit={canUpdate ? editEvaluation : () => undefined}
          onDelete={canDelete ? handleDelete : () => undefined}
        />
      )}
    </div>
  );
}
