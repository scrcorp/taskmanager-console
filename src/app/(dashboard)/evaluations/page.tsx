"use client";

/**
 * 평가 관리 페이지 -- 평가 템플릿 목록 + 평가 목록을 탭으로 관리합니다.
 *
 * Evaluations management page — Templates and evaluations in tabbed view.
 */

import React, { useState, useCallback } from "react";
import { useUrlParams } from "@/hooks/useUrlParams";
import { Plus, Trash2 } from "lucide-react";
import {
  useEvalTemplates,
  useCreateEvalTemplate,
  useDeleteEvalTemplate,
  useEvaluations,
  useSubmitEvaluation,
} from "@/hooks/useEvaluations";
import {
  Button,
  Input,
  Select,
  Card,
  Table,
  Modal,
  Badge,
  Pagination,
  ConfirmDialog,
  LoadingSpinner,
} from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { formatDate, parseApiError } from "@/lib/utils";
import { useTimezone } from "@/hooks/useTimezone";
import { usePermissions } from "@/hooks/usePermissions";
import { PERMISSIONS } from "@/lib/permissions";
import type { EvalTemplate, Evaluation as EvalType } from "@/types";

const PER_PAGE: number = 20;

export default function EvaluationsPage(): React.ReactElement {
  const { toast } = useToast();
  const { hasPermission } = usePermissions();
  const tz = useTimezone();
  const isGMOrAbove = hasPermission(PERMISSIONS.EVALUATIONS_CREATE);

  const [urlParams, setUrlParams] = useUrlParams({ tab: "templates", tpage: "1", epage: "1" });
  const activeTab = (urlParams.tab === "evaluations" ? "evaluations" : "templates") as "templates" | "evaluations";
  const templatePage = Number(urlParams.tpage);
  const evalPage = Number(urlParams.epage);

  // Template modal
  const [isTemplateFormOpen, setIsTemplateFormOpen] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [templateTargetRole, setTemplateTargetRole] = useState("");
  const [templateEvalType, setTemplateEvalType] = useState("adhoc");
  const [deleteTemplateId, setDeleteTemplateId] = useState<string | null>(null);

  // Data hooks
  const { data: templatesData, isLoading: templatesLoading } = useEvalTemplates(templatePage, PER_PAGE);
  const { data: evalsData, isLoading: evalsLoading } = useEvaluations({ page: evalPage, per_page: PER_PAGE });
  const createTemplate = useCreateEvalTemplate();
  const deleteTemplate = useDeleteEvalTemplate();
  const submitEvaluation = useSubmitEvaluation();

  const templates: EvalTemplate[] = templatesData?.items ?? [];
  const evaluations: EvalType[] = evalsData?.items ?? [];

  // Template handlers
  const handleCreateTemplate = useCallback(async () => {
    if (!templateName.trim()) return;
    try {
      await createTemplate.mutateAsync({
        name: templateName.trim(),
        target_role: templateTargetRole || null,
        eval_type: templateEvalType,
      });
      toast({ type: "success", message: "Template created" });
      setIsTemplateFormOpen(false);
      setTemplateName("");
      setTemplateTargetRole("");
      setTemplateEvalType("adhoc");
    } catch (err) {
      toast({ type: "error", message: parseApiError(err, "Failed to create template") });
    }
  }, [templateName, templateTargetRole, templateEvalType, createTemplate, toast]);

  const handleDeleteTemplate = useCallback(async () => {
    if (!deleteTemplateId) return;
    try {
      await deleteTemplate.mutateAsync(deleteTemplateId);
      toast({ type: "success", message: "Template deleted" });
      setDeleteTemplateId(null);
    } catch (err) {
      toast({ type: "error", message: parseApiError(err, "Failed to delete template") });
    }
  }, [deleteTemplateId, deleteTemplate, toast]);

  const handleSubmitEval = useCallback(async (evalId: string) => {
    try {
      await submitEvaluation.mutateAsync(evalId);
      toast({ type: "success", message: "Evaluation submitted" });
    } catch (err) {
      toast({ type: "error", message: parseApiError(err, "Failed to submit evaluation") });
    }
  }, [submitEvaluation, toast]);

  const isLoading = activeTab === "templates" ? templatesLoading : evalsLoading;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl md:text-2xl font-extrabold text-text">Evaluations</h1>
        {isGMOrAbove && activeTab === "templates" && (
          <Button onClick={() => setIsTemplateFormOpen(true)}>
            <Plus className="h-4 w-4 mr-1" />
            New Template
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setUrlParams({ tab: "templates" })}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
            activeTab === "templates"
              ? "bg-accent text-white"
              : "bg-surface text-text-secondary hover:bg-surface-hover"
          }`}
        >
          Templates ({templatesData?.total ?? 0})
        </button>
        <button
          onClick={() => setUrlParams({ tab: "evaluations" })}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
            activeTab === "evaluations"
              ? "bg-accent text-white"
              : "bg-surface text-text-secondary hover:bg-surface-hover"
          }`}
        >
          Evaluations ({evalsData?.total ?? 0})
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <LoadingSpinner size="lg" />
        </div>
      ) : activeTab === "templates" ? (
        <Card>
          <Table
            columns={[
              { key: "name", header: "Name" },
              { key: "target_role", header: "Target Role" },
              { key: "eval_type", header: "Type" },
              { key: "item_count", header: "Items" },
              { key: "created_at", header: "Created", hideOnMobile: true },
              ...(isGMOrAbove ? [{ key: "actions" as const, header: "" }] : []),
            ]}
            data={templates.map((t) => ({
              id: t.id,
              name: t.name,
              target_role: t.target_role || "-",
              eval_type: (
                <Badge variant={t.eval_type === "regular" ? "accent" : "default"}>
                  {t.eval_type}
                </Badge>
              ),
              item_count: t.item_count,
              created_at: formatDate(t.created_at, tz),
              ...(isGMOrAbove
                ? {
                    actions: (
                      <button
                        onClick={() => setDeleteTemplateId(t.id)}
                        className="text-text-muted hover:text-danger transition-colors"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    ),
                  }
                : {}),
            }))}
            emptyMessage="No evaluation templates yet."
          />
          {(templatesData?.total ?? 0) > PER_PAGE && (
            <Pagination
              page={templatePage}
              totalPages={Math.ceil((templatesData?.total ?? 0) / PER_PAGE)}
              onPageChange={(p: number) => setUrlParams({ tpage: String(p) })}
            />
          )}
        </Card>
      ) : (
        <Card>
          <Table
            columns={[
              { key: "evaluatee_name", header: "Evaluatee" },
              { key: "evaluator_name", header: "Evaluator" },
              { key: "template_name", header: "Template" },
              { key: "status", header: "Status" },
              { key: "created_at", header: "Created", hideOnMobile: true },
              { key: "actions", header: "" },
            ]}
            data={evaluations.map((e) => ({
              id: e.id,
              evaluatee_name: e.evaluatee_name || "-",
              evaluator_name: e.evaluator_name || "-",
              template_name: e.template_name || "-",
              status: (
                <Badge variant={e.status === "submitted" ? "success" : "warning"}>
                  {e.status}
                </Badge>
              ),
              created_at: formatDate(e.created_at, tz),
              actions: e.status === "draft" ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleSubmitEval(e.id)}
                >
                  Submit
                </Button>
              ) : null,
            }))}
            emptyMessage="No evaluations yet."
          />
          {(evalsData?.total ?? 0) > PER_PAGE && (
            <Pagination
              page={evalPage}
              totalPages={Math.ceil((evalsData?.total ?? 0) / PER_PAGE)}
              onPageChange={(p: number) => setUrlParams({ epage: String(p) })}
            />
          )}
        </Card>
      )}

      {/* Create Template Modal */}
      <Modal
        isOpen={isTemplateFormOpen}
        onClose={() => setIsTemplateFormOpen(false)}
        title="New Evaluation Template"
      >
        <div className="space-y-4">
          <Input
            label="Template Name"
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            placeholder="e.g. Monthly Staff Evaluation"
          />
          <Select
            label="Target Role"
            value={templateTargetRole}
            onChange={(e) => setTemplateTargetRole(e.target.value)}
            placeholder="All Roles"
            options={[
              { value: "", label: "All Roles" },
              { value: "staff", label: "Staff" },
              { value: "supervisor", label: "Supervisor" },
              { value: "gm", label: "GM" },
            ]}
          />
          <Select
            label="Evaluation Type"
            value={templateEvalType}
            onChange={(e) => setTemplateEvalType(e.target.value)}
            options={[
              { value: "adhoc", label: "Ad-hoc (수시)" },
              { value: "regular", label: "Regular (정기)" },
            ]}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setIsTemplateFormOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateTemplate}
              disabled={!templateName.trim() || createTemplate.isPending}
            >
              {createTemplate.isPending ? "Creating..." : "Create"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Template Confirm */}
      <ConfirmDialog
        isOpen={!!deleteTemplateId}
        onClose={() => setDeleteTemplateId(null)}
        onConfirm={handleDeleteTemplate}
        title="Delete Template"
        message="Are you sure you want to delete this evaluation template? This action cannot be undone."
        confirmLabel="Delete"
        isLoading={deleteTemplate.isPending}
      />
    </div>
  );
}
