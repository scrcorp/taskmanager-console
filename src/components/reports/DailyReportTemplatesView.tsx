"use client";

/**
 * 일일 보고서 템플릿 관리 view -- 템플릿 CRUD.
 *
 * Daily report template management view with create, edit, and delete.
 * Templates are grouped by store (Organization-wide first, then per-store).
 * 통합 `/reports/templates` 와 legacy `/daily-reports/templates` 양쪽에서
 * 재사용. 헤더(back button + title)는 props.showHeader 로 토글.
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
  LoadingSpinner,
} from "@/components/ui";
import { useModal } from "@/components/ui/imperative-modal";
import { cn } from "@/lib/utils";
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

/** 그룹 키: store_id 가 null 이면 organization-wide. */
type GroupKey = string | null;

interface TemplateGroup {
  key: GroupKey;
  label: string;
  subtitle: string;
  templates: DailyReportTemplate[];
}

export function DailyReportTemplatesView({
  showHeader = true,
}: {
  showHeader?: boolean;
} = {}): React.ReactElement {
  const router = useRouter();
  const modal = useModal();

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
  const [formIsActive, setFormIsActive] = useState(true);
  const [formSections, setFormSections] = useState<SectionFormItem[]>([]);

  // Excel upload modal state
  const [isExcelOpen, setIsExcelOpen] = useState(false);
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [excelName, setExcelName] = useState("");
  const [excelStoreId, setExcelStoreId] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Inline toggle pending state (id-level disable while mutation flies)
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const resetForm = useCallback(() => {
    setEditingId(null);
    setFormName("");
    setFormStoreId("");
    setFormIsDefault(false);
    setFormIsActive(true);
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
    setFormIsActive(tpl.is_active);
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
      void modal.alert({ type: "error", message: "Template name is required" });
      return;
    }
    const validSections = formSections.filter((s) => s.title.trim());
    if (validSections.length === 0) {
      void modal.alert({
        type: "error",
        message: "At least one section with a title is required",
      });
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
          is_active: formIsActive,
          sections,
        };
        await updateTemplate.mutateAsync({ id: editingId, data });
      } else {
        // 신규 템플릿은 항상 active 로 생성 (서버 default). Active 체크박스는 편집 시에만 노출.
        const data: DailyReportTemplateCreate = {
          name: formName.trim(),
          store_id: formStoreId || null,
          is_default: formIsDefault,
          sections,
        };
        await createTemplate.mutateAsync(data);
      }
      setIsFormOpen(false);
      resetForm();
    } catch {
      // hook 자동 모달
    }
  }, [formName, formStoreId, formIsDefault, formIsActive, formSections, editingId, createTemplate, updateTemplate, modal, resetForm]);

  const handleDelete = useCallback(async (id: string) => {
    const ok = await modal.confirm({
      title: "Delete Template",
      message: "Are you sure you want to delete this template? This action cannot be undone.",
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;
    deleteTemplate.mutate(id);
  }, [deleteTemplate, modal]);

  const handleExcelUpload = useCallback(async () => {
    if (!excelFile || !excelName.trim()) {
      void modal.alert({
        type: "error",
        message: "File and template name are required",
      });
      return;
    }
    try {
      await uploadExcel.mutateAsync({
        file: excelFile,
        name: excelName.trim(),
        store_id: excelStoreId || undefined,
      });
      setIsExcelOpen(false);
      setExcelFile(null);
      setExcelName("");
      setExcelStoreId("");
    } catch {
      // hook 자동 모달
    }
  }, [excelFile, excelName, excelStoreId, uploadExcel, modal]);

  const handleDownloadSample = useCallback(async () => {
    try {
      await downloadSampleExcel();
    } catch {
      void modal.alert({
        type: "error",
        message: "Failed to download sample file",
      });
    }
  }, [modal]);

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

  // --- Inline toggles ---

  /** Default 칩 클릭: 이 템플릿을 default 로 promote.
   * 서버가 같은 scope 의 기존 default 를 자동으로 해제한다 (service guard). */
  const handleToggleDefault = useCallback(
    async (tpl: DailyReportTemplate) => {
      if (tpl.is_default) return;
      setTogglingId(tpl.id);
      try {
        await updateTemplate.mutateAsync({
          id: tpl.id,
          data: { is_default: true },
        });
      } catch {
        // hook 자동 모달
      } finally {
        setTogglingId(null);
      }
    },
    [updateTemplate],
  );

  /** Active 칩 클릭: is_active 를 토글.
   * 서버가 마지막 active 보호 가드를 갖고 있어 거부될 수 있다. */
  const handleToggleActive = useCallback(
    async (tpl: DailyReportTemplate) => {
      setTogglingId(tpl.id);
      try {
        await updateTemplate.mutateAsync({
          id: tpl.id,
          data: { is_active: !tpl.is_active },
        });
      } catch {
        // hook 자동 모달
      } finally {
        setTogglingId(null);
      }
    },
    [updateTemplate],
  );

  const isSaving = createTemplate.isPending || updateTemplate.isPending;

  // --- Group templates by store ---

  const groups: TemplateGroup[] = useMemo(() => {
    const list = templates ?? [];
    const orgWide = list.filter((t) => !t.store_id);
    const byStore = new Map<string, DailyReportTemplate[]>();
    for (const t of list) {
      if (!t.store_id) continue;
      const arr = byStore.get(t.store_id) ?? [];
      arr.push(t);
      byStore.set(t.store_id, arr);
    }

    const result: TemplateGroup[] = [];
    if (orgWide.length > 0) {
      result.push({
        key: null,
        label: "Organization-wide",
        subtitle: `${orgWide.filter((t) => t.is_active).length} active`,
        templates: orgWide,
      });
    }
    for (const store of activeStores) {
      const arr = byStore.get(store.id);
      if (!arr || arr.length === 0) continue;
      result.push({
        key: store.id,
        label: store.name,
        subtitle: `${arr.filter((t) => t.is_active).length} active`,
        templates: arr,
      });
    }
    return result;
  }, [templates, activeStores]);

  const renderTemplateRows = (rows: DailyReportTemplate[]) =>
    rows.map((tpl: DailyReportTemplate) => ({
      id: tpl.id,
      name: tpl.name,
      sections_count: tpl.sections.length,
      is_default: tpl.is_default ? (
        <Badge variant="accent">Default</Badge>
      ) : (
        <button
          type="button"
          onClick={() => handleToggleDefault(tpl)}
          disabled={togglingId === tpl.id}
          className="text-xs text-text-muted hover:text-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed underline-offset-2 hover:underline"
          title="Set as default for this scope"
        >
          Set default
        </button>
      ),
      is_active: (
        <button
          type="button"
          onClick={() => handleToggleActive(tpl)}
          disabled={togglingId === tpl.id}
          className="inline-flex disabled:opacity-50 disabled:cursor-not-allowed"
          title={tpl.is_active ? "Click to deactivate" : "Click to activate"}
        >
          <Badge variant={tpl.is_active ? "success" : "warning"}>
            {tpl.is_active ? "Active" : "Inactive"}
          </Badge>
        </button>
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
            onClick={() => handleDelete(tpl.id)}
            className="text-text-muted hover:text-danger transition-colors"
            title="Delete"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ),
    }));

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        {showHeader && (
          <>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push("/reports?type=daily")}
            >
              <ChevronLeft size={16} />
            </Button>
            <div className="flex-1">
              <h1 className="text-xl md:text-2xl font-extrabold text-text">Report Templates</h1>
              <p className="text-sm text-text-muted mt-0.5">
                Manage daily report templates for your organization
              </p>
            </div>
          </>
        )}
        <div className={cn("flex items-center gap-2", !showHeader && "ml-auto")}>
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

      {/* Template list — grouped by store */}
      {isLoading ? (
        <div className="flex justify-center py-12">
          <LoadingSpinner size="lg" />
        </div>
      ) : groups.length === 0 ? (
        <Card>
          <div className="py-8 text-center text-sm text-text-muted">
            No templates yet. Create one to get started.
          </div>
        </Card>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <Card key={group.key ?? "__org__"}>
              <div className="flex items-baseline gap-2 px-4 pt-4 pb-2">
                <h2 className="text-sm font-semibold text-text">{group.label}</h2>
                <span className="text-xs text-text-muted">· {group.subtitle}</span>
              </div>
              <Table
                columns={[
                  { key: "name", header: "Name" },
                  { key: "sections_count", header: "Sections" },
                  { key: "is_default", header: "Default" },
                  { key: "is_active", header: "Status" },
                  { key: "actions", header: "" },
                ]}
                data={renderTemplateRows(group.templates)}
                emptyMessage="No templates in this scope."
              />
            </Card>
          ))}
        </div>
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

          <div className="flex flex-col gap-3">
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={formIsDefault}
                onChange={(e) => setFormIsDefault(e.target.checked)}
                className="w-4 h-4 mt-0.5 rounded border-border bg-surface text-accent focus:ring-accent"
              />
              <span className="text-sm font-medium text-text-secondary">
                Set as default template
              </span>
            </label>
            {editingId && (
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formIsActive}
                  onChange={(e) => setFormIsActive(e.target.checked)}
                  className="w-4 h-4 mt-0.5 rounded border-border bg-surface text-accent focus:ring-accent"
                />
                <span className="text-sm">
                  <span className="font-medium text-text-secondary block">Active</span>
                  <span className="text-xs text-text-muted">
                    Inactive templates won&apos;t show up when creating reports.
                  </span>
                </span>
              </label>
            )}
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

    </div>
  );
}
