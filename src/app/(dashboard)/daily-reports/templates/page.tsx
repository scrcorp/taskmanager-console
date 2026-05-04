"use client";

/**
 * 일일 보고서 템플릿 관리 페이지 -- 템플릿 CRUD.
 *
 * Daily report template management page with create, edit, and delete.
 */

import React, { useState, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Pencil, ChevronLeft, GripVertical, X, Upload, Download } from "lucide-react";
import {
  useTemplates,
  useCreateTemplate,
  useUpdateTemplate,
  useDeleteTemplate,
  useUploadTemplateExcel,
  downloadSampleExcel,
} from "@/hooks/useDailyReportTemplates";
import { useStores } from "@/hooks/useStores";
import {
  Button,
  Input,
  Select,
  Card,
  Table,
  Modal,
  Badge,
  ConfirmDialog,
  LoadingSpinner,
} from "@/components/ui";
import { useResultModal } from "@/components/ui/ResultModal";
import { parseApiError } from "@/lib/utils";
import type {
  DailyReportTemplate,
  DailyReportTemplateCreate,
  DailyReportTemplateUpdate,
  Store,
} from "@/types";

interface SectionFormItem {
  key: string;
  title: string;
  description: string;
  sort_order: number;
  is_required: boolean;
}

function createEmptySection(sort_order: number): SectionFormItem {
  return {
    key: `new-${Date.now()}-${Math.random()}`,
    title: "",
    description: "",
    sort_order,
    is_required: false,
  };
}

export default function DailyReportTemplatesPage(): React.ReactElement {
  const router = useRouter();
  const { showSuccess, showError } = useResultModal();

  // Data hooks
  const { data: templates, isLoading } = useTemplates();
  const { data: stores } = useStores();
  const createTemplate = useCreateTemplate();
  const updateTemplate = useUpdateTemplate();
  const deleteTemplate = useDeleteTemplate();
  const uploadExcel = useUploadTemplateExcel();

  const activeStores: Store[] = useMemo(
    () => (stores ?? []).filter((s: Store) => s.is_active),
    [stores],
  );

  // Form modal state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formStoreId, setFormStoreId] = useState("");
  const [formIsDefault, setFormIsDefault] = useState(false);
  const [formSections, setFormSections] = useState<SectionFormItem[]>([]);

  // Excel upload modal state
  const [isExcelOpen, setIsExcelOpen] = useState(false);
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [excelName, setExcelName] = useState("");
  const [excelStoreId, setExcelStoreId] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Delete state
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const resetForm = useCallback(() => {
    setEditingId(null);
    setFormName("");
    setFormStoreId("");
    setFormIsDefault(false);
    setFormSections([createEmptySection(1)]);
  }, []);

  const openCreateForm = useCallback(() => {
    resetForm();
    setIsFormOpen(true);
  }, [resetForm]);

  const openEditForm = useCallback((tpl: DailyReportTemplate) => {
    setEditingId(tpl.id);
    setFormName(tpl.name);
    setFormStoreId(tpl.store_id ?? "");
    setFormIsDefault(tpl.is_default);
    setFormSections(
      tpl.sections
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((s) => ({
          key: s.id,
          title: s.title,
          description: s.description ?? "",
          sort_order: s.sort_order,
          is_required: s.is_required,
        })),
    );
    setIsFormOpen(true);
  }, []);

  const handleSave = useCallback(async () => {
    if (!formName.trim()) {
      showError("Template name is required");
      return;
    }
    const validSections = formSections.filter((s) => s.title.trim());
    if (validSections.length === 0) {
      showError("At least one section with a title is required");
      return;
    }
    const sections = validSections.map((s, i) => ({
      title: s.title.trim(),
      description: s.description.trim() || null,
      sort_order: i + 1,
      is_required: s.is_required,
    }));

    try {
      if (editingId) {
        const data: DailyReportTemplateUpdate = {
          name: formName.trim(),
          is_default: formIsDefault,
          sections,
        };
        await updateTemplate.mutateAsync({ id: editingId, data });
        showSuccess("Template updated");
      } else {
        const data: DailyReportTemplateCreate = {
          name: formName.trim(),
          store_id: formStoreId || null,
          is_default: formIsDefault,
          sections,
        };
        await createTemplate.mutateAsync(data);
        showSuccess("Template created");
      }
      setIsFormOpen(false);
      resetForm();
    } catch (err) {
      showError(parseApiError(err, "Failed to save template"));
    }
  }, [formName, formStoreId, formIsDefault, formSections, editingId, createTemplate, updateTemplate, showSuccess, showError, resetForm]);

  const handleDelete = useCallback(async () => {
    if (!deleteId) return;
    try {
      await deleteTemplate.mutateAsync(deleteId);
      showSuccess("Template deleted");
      setDeleteId(null);
    } catch (err) {
      showError(parseApiError(err, "Failed to delete template"));
    }
  }, [deleteId, deleteTemplate, showSuccess, showError]);

  const handleExcelUpload = useCallback(async () => {
    if (!excelFile || !excelName.trim()) {
      showError("File and template name are required");
      return;
    }
    try {
      await uploadExcel.mutateAsync({
        file: excelFile,
        name: excelName.trim(),
        store_id: excelStoreId || undefined,
      });
      showSuccess("Template created from Excel");
      setIsExcelOpen(false);
      setExcelFile(null);
      setExcelName("");
      setExcelStoreId("");
    } catch (err) {
      showError(parseApiError(err, "Failed to upload Excel"));
    }
  }, [excelFile, excelName, excelStoreId, uploadExcel, showSuccess, showError]);

  const handleDownloadSample = useCallback(async () => {
    try {
      await downloadSampleExcel();
    } catch {
      showError("Failed to download sample file");
    }
  }, [showError]);

  const addSection = useCallback(() => {
    setFormSections((prev) => [...prev, createEmptySection(prev.length + 1)]);
  }, []);

  const removeSection = useCallback((key: string) => {
    setFormSections((prev) => prev.filter((s) => s.key !== key));
  }, []);

  const updateSection = useCallback(
    (key: string, field: keyof SectionFormItem, value: string | boolean) => {
      setFormSections((prev) =>
        prev.map((s) => (s.key === key ? { ...s, [field]: value } : s)),
      );
    },
    [],
  );

  const isSaving = createTemplate.isPending || updateTemplate.isPending;

  const storeNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of activeStores) map.set(s.id, s.name);
    return map;
  }, [activeStores]);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/daily-reports")}
        >
          <ChevronLeft size={16} />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl md:text-2xl font-extrabold text-text">Report Templates</h1>
          <p className="text-sm text-text-muted mt-0.5">
            Manage daily report templates for your organization
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setIsExcelOpen(true)}>
            <Upload className="h-4 w-4 mr-1" />
            Excel Upload
          </Button>
          <Button onClick={openCreateForm}>
            <Plus className="h-4 w-4 mr-1" />
            New Template
          </Button>
        </div>
      </div>

      {/* Template list */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <LoadingSpinner size="lg" />
        </div>
      ) : (
        <Card>
          <Table
            columns={[
              { key: "name", header: "Name" },
              { key: "store", header: "Store" },
              { key: "sections_count", header: "Sections" },
              { key: "is_default", header: "Default" },
              { key: "is_active", header: "Status" },
              { key: "actions", header: "" },
            ]}
            data={(templates ?? []).map((tpl: DailyReportTemplate) => ({
              id: tpl.id,
              name: tpl.name,
              store: tpl.store_id
                ? storeNameMap.get(tpl.store_id) ?? "Unknown"
                : "Organization Default",
              sections_count: tpl.sections.length,
              is_default: tpl.is_default ? (
                <Badge variant="accent">Default</Badge>
              ) : null,
              is_active: (
                <Badge variant={tpl.is_active ? "success" : "warning"}>
                  {tpl.is_active ? "Active" : "Inactive"}
                </Badge>
              ),
              actions: (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => openEditForm(tpl)}
                    className="text-text-muted hover:text-accent transition-colors"
                    title="Edit"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => setDeleteId(tpl.id)}
                    className="text-text-muted hover:text-danger transition-colors"
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ),
            }))}
            emptyMessage="No templates yet. Create one to get started."
          />
        </Card>
      )}

      {/* Create/Edit Modal */}
      <Modal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title={editingId ? "Edit Template" : "New Template"}
        size="lg"
        closeOnBackdrop={false}
      >
        <div className="space-y-4">
          <Input
            label="Template Name"
            value={formName}
            onChange={(e) => setFormName(e.target.value)}
            placeholder="e.g. Daily Lunch Report"
          />

          {!editingId && (
            <Select
              label="Store (optional)"
              value={formStoreId}
              onChange={(e) => setFormStoreId(e.target.value)}
              options={[
                { value: "", label: "Organization Default" },
                ...activeStores.map((s) => ({ value: s.id, label: s.name })),
              ]}
            />
          )}

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formIsDefault}
                onChange={(e) => setFormIsDefault(e.target.checked)}
                className="w-4 h-4 rounded border-border bg-surface text-accent focus:ring-accent"
              />
              <span className="text-sm font-medium text-text-secondary">
                Set as default template
              </span>
            </label>
          </div>

          {/* Sections editor */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-text-secondary">
                Sections
              </label>
              <Button variant="ghost" size="sm" onClick={addSection}>
                <Plus className="h-3.5 w-3.5 mr-1" />
                Add Section
              </Button>
            </div>

            <div className="space-y-3">
              {formSections.map((section, idx) => (
                <div
                  key={section.key}
                  className="flex gap-3 items-start p-3 bg-surface rounded-lg border border-border"
                >
                  <div className="text-text-muted pt-2">
                    <GripVertical size={14} />
                  </div>
                  <div className="flex-1 space-y-2">
                    <div className="flex gap-2">
                      <input
                        value={section.title}
                        onChange={(e) =>
                          updateSection(section.key, "title", e.target.value)
                        }
                        placeholder={`Section ${idx + 1} title`}
                        className="flex-1 px-3 py-1.5 text-sm bg-card border border-border rounded-lg text-text placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent"
                      />
                      <label className="flex items-center gap-1.5 text-xs text-text-secondary whitespace-nowrap cursor-pointer">
                        <input
                          type="checkbox"
                          checked={section.is_required}
                          onChange={(e) =>
                            updateSection(section.key, "is_required", e.target.checked)
                          }
                          className="w-3.5 h-3.5 rounded border-border bg-surface text-accent focus:ring-accent"
                        />
                        Required
                      </label>
                    </div>
                    <input
                      value={section.description}
                      onChange={(e) =>
                        updateSection(section.key, "description", e.target.value)
                      }
                      placeholder="Description (optional)"
                      className="w-full px-3 py-1.5 text-sm bg-card border border-border rounded-lg text-text placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent"
                    />
                  </div>
                  {formSections.length > 1 && (
                    <button
                      onClick={() => removeSection(section.key)}
                      className="text-text-muted hover:text-danger transition-colors pt-2"
                      title="Remove section"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setIsFormOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? "Saving..." : editingId ? "Update" : "Create"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Excel Upload Modal */}
      <Modal
        isOpen={isExcelOpen}
        onClose={() => setIsExcelOpen(false)}
        title="Create Template from Excel"
        closeOnBackdrop={false}
      >
        <div className="space-y-4">
          <Input
            label="Template Name"
            value={excelName}
            onChange={(e) => setExcelName(e.target.value)}
            placeholder="e.g. Daily Lunch Report"
          />

          <Select
            label="Store (optional)"
            value={excelStoreId}
            onChange={(e) => setExcelStoreId(e.target.value)}
            options={[
              { value: "", label: "Organization Default" },
              ...activeStores.map((s) => ({ value: s.id, label: s.name })),
            ]}
          />

          <div>
            <label className="text-sm font-medium text-text-secondary block mb-1.5">
              Excel File
            </label>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => setExcelFile(e.target.files?.[0] ?? null)}
              className="hidden"
            />
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="h-4 w-4 mr-1" />
                {excelFile ? excelFile.name : "Choose File"}
              </Button>
              {excelFile && (
                <button
                  onClick={() => {
                    setExcelFile(null);
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                  className="text-text-muted hover:text-danger transition-colors"
                >
                  <X size={14} />
                </button>
              )}
            </div>
            <p className="text-xs text-text-muted mt-1.5">
              Format: Title | Description | Required (Y/N).{" "}
              <button
                onClick={handleDownloadSample}
                className="text-accent hover:underline inline-flex items-center gap-0.5"
              >
                <Download size={10} />
                Download sample
              </button>
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setIsExcelOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleExcelUpload}
              disabled={!excelFile || !excelName.trim() || uploadExcel.isPending}
            >
              {uploadExcel.isPending ? "Uploading..." : "Create"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirm */}
      <ConfirmDialog
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Delete Template"
        message="Are you sure you want to delete this template? This action cannot be undone."
        confirmLabel="Delete"
        isLoading={deleteTemplate.isPending}
      />
    </div>
  );
}
