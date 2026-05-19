"use client";

/**
 * 이슈 폼 템플릿 관리 view — Hiring form 패턴 차용.
 *
 * - Scope = Organization defaults (기본, 항상 편집 가능. 비어있으면 system default 카테고리 자동 채움.)
 * - Scope = Specific store: store template 없으면 org 상속 (read-only).
 *   "Customize for this store" 로 org 기본을 그대로 복사해 store template 생성.
 *   "Sync from organization" 으로 현재 store template 을 최신 org 거로 덮어쓰기.
 *   "Reset to org defaults" 로 store override 제거.
 * - Fields list: 표준 fields (Title / Category / Severity / Description / Attachments) 가
 *   항상 list 상단에 잠긴 형태로 노출, 그 아래 custom fields 를 추가/순서변경 가능.
 * - 우측 미리보기는 staff 작성 폼 그대로 + 직접 값 입력 가능 (검증용).
 */

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Plus,
  Save,
  Trash2,
  GripVertical,
  Sparkles,
  Eye,
  RotateCcw,
  Building2,
  Lock,
  RefreshCw,
} from "lucide-react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import {
  useDeleteReportTemplate,
  useLookupReportTemplate,
  useReportTemplates,
  useSaveReportTemplate,
} from "@/hooks/useReports";
import { useStores } from "@/hooks/useStores";
import { usePermissions } from "@/hooks/usePermissions";
import {
  Button,
  Card,
  Input,
  LoadingSpinner,
  Textarea,
} from "@/components/ui";
import { useModal } from "@/components/ui/imperative-modal";
import { PERMISSIONS } from "@/lib/permissions";
import { ISSUE_SEVERITIES, type Store } from "@/types";

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

interface CategoryDef {
  code: string;
  label: string;
  color?: string | null;
  sort_order: number;
  is_active: boolean;
}

interface FieldDef {
  type: "short_text" | "long_text" | "number" | "single_choice" | "multi_choice";
  id: string;
  label: string;
  required: boolean;
  placeholder?: string;
  helper_text?: string;
  options?: string[];
  max_length?: number;
  sort_order: number;
}

const FIELD_TYPES: { value: FieldDef["type"]; label: string }[] = [
  { value: "short_text", label: "Short text" },
  { value: "long_text", label: "Long text" },
  { value: "number", label: "Number" },
  { value: "single_choice", label: "Single choice" },
  { value: "multi_choice", label: "Multi choice" },
];

const SEVERITY_LABELS: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

// 신규 org template 진입 시 채워둘 기본 카테고리 (system default).
const SEED_CATEGORIES: Omit<CategoryDef, "sort_order">[] = [
  { code: "equipment", label: "Equipment", is_active: true },
  { code: "safety", label: "Safety", is_active: true },
  { code: "customer", label: "Customer", is_active: true },
  { code: "staff", label: "Staff", is_active: true },
  { code: "inventory", label: "Inventory", is_active: true },
  { code: "other", label: "Other", is_active: true },
];

type Scope = "org" | "store";

function genUuidish(prefix: string): string {
  const raw =
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  return `${prefix}_${raw.slice(0, 8)}`;
}

/* -------------------------------------------------------------------------- */
/*  Main view                                                                 */
/* -------------------------------------------------------------------------- */

export function IssueTemplatesView({
  showHeader = true,
}: {
  showHeader?: boolean;
} = {}): React.ReactElement {
  const router = useRouter();
  const { hasPermission } = usePermissions();
  const modal = useModal();

  const [scope, setScope] = useState<Scope>("org");
  const [storeId, setStoreId] = useState<string>("");
  const { data: stores } = useStores();
  const activeStores: Store[] = useMemo(
    () => (stores ?? []).filter((s: Store) => s.is_active !== false),
    [stores],
  );

  const { data: allTemplates } = useReportTemplates("issue");
  const orgTemplate = useMemo(
    () =>
      allTemplates?.items?.find(
        (t) => t.store_id == null && t.organization_id != null,
      ),
    [allTemplates],
  );
  const storeTemplate = useMemo(
    () =>
      allTemplates?.items?.find((t) => storeId && t.store_id === storeId),
    [allTemplates, storeId],
  );
  const { data: effective } = useLookupReportTemplate(
    "issue",
    scope === "store" ? storeId : undefined,
    scope === "store" && !!storeId,
  );

  const editingTemplate = scope === "org" ? orgTemplate : storeTemplate ?? null;
  const isCustomizing = scope === "org" || !!storeTemplate;
  const isInheritingFromOrg =
    scope === "store" && !!storeId && !storeTemplate;

  const [categories, setCategories] = useState<CategoryDef[]>([]);
  const [fields, setFields] = useState<FieldDef[]>([]);
  const [fieldOrder, setFieldOrder] = useState<string[]>([]);

  // 초기화: edit target 의 payload 로드. org template 비어있으면 SEED 채우기.
  useEffect(() => {
    const base = scope === "org" ? orgTemplate : storeTemplate ?? effective;
    const src = base?.payload as
      | {
          categories?: CategoryDef[];
          custom_fields?: FieldDef[];
          field_order?: string[];
        }
      | undefined;
    let cats = (src?.categories ?? []).map((c, i) => ({
      ...c,
      sort_order: c.sort_order ?? i,
      is_active: c.is_active ?? true,
    }));
    // org template 이 처음 생성될 때 (orgTemplate 없음, scope=org) seed 채우기.
    if (scope === "org" && !orgTemplate && cats.length === 0) {
      cats = SEED_CATEGORIES.map((c, i) => ({ ...c, sort_order: i }));
    }
    setCategories(cats);
    const customs = (src?.custom_fields ?? []).map((f, i) => ({
      ...f,
      sort_order: f.sort_order ?? i,
      required: f.required ?? false,
    }));
    setFields(customs);
    setFieldOrder(
      src?.field_order && src.field_order.length > 0
        ? src.field_order
        : [
            "__title",
            "__category",
            "__severity",
            ...customs.map((f) => f.id),
            "__description",
            "__attachments",
          ],
    );
  }, [scope, orgTemplate, storeTemplate, effective]);

  const save = useSaveReportTemplate();
  const del = useDeleteReportTemplate();
  const canEdit = hasPermission(PERMISSIONS.REPORTS_UPDATE);

  // -- handlers --

  const handleSave = async () => {
    const codes = categories.map((c) => c.code.trim());
    if (codes.some((c) => !c) || new Set(codes).size !== codes.length) {
      void modal.alert({
        type: "error",
        message: "Internal category id problem — please reload.",
      });
      return;
    }
    const fieldIds = fields.map((f) => f.id.trim());
    if (new Set(fieldIds).size !== fieldIds.length) {
      void modal.alert({
        type: "error",
        message: "Internal field id collision — please reload.",
      });
      return;
    }
    const defaultName =
      scope === "org" ? "Organization issue form" : "Store issue form";
    try {
      await save.mutateAsync({
        id: editingTemplate?.id,
        type: "issue",
        name: editingTemplate?.name ?? defaultName,
        store_id: scope === "org" ? null : storeId,
        payload: { categories, custom_fields: fields, field_order: fieldOrder },
      });
    } catch {
      // hook 자동 모달
    }
  };

  /** Org 기본을 그대로 복사해 store template 생성. */
  const handleCustomize = async () => {
    if (!storeId) return;
    try {
      await save.mutateAsync({
        type: "issue",
        name: "Store issue form",
        store_id: storeId,
        payload: { categories, custom_fields: fields, field_order: fieldOrder },
      });
    } catch {
      // hook 자동 모달
    }
  };

  /** Store template 을 현재 org template 으로 덮어쓰기. (store extras 잃음) */
  const handleSyncFromOrg = async () => {
    if (!storeTemplate || !orgTemplate) return;
    const ok = await modal.confirm({
      title: "Sync from organization?",
      message:
        "This will overwrite the store template with the current organization defaults. Any store-specific changes will be lost.",
      confirmLabel: "Sync",
      variant: "danger",
    });
    if (!ok) return;
    const orgPayload = (orgTemplate.payload as
      | { categories?: CategoryDef[]; custom_fields?: FieldDef[] }
      | null) ?? {};
    try {
      await save.mutateAsync({
        id: storeTemplate.id,
        type: "issue",
        name: storeTemplate.name ?? "Store issue form",
        store_id: storeId,
        payload: {
          categories: orgPayload.categories ?? [],
          custom_fields: orgPayload.custom_fields ?? [],
        },
      });
    } catch {
      // hook 자동 모달
    }
  };

  const handleResetToOrg = async () => {
    if (!storeTemplate) return;
    const ok = await modal.confirm({
      title: "Reset to organization defaults?",
      message:
        "This store will go back to using the organization template. The store-specific customizations will be lost.",
      confirmLabel: "Reset",
      variant: "danger",
    });
    if (!ok) return;
    try {
      await del.mutateAsync(storeTemplate.id);
    } catch {
      // hook 자동 모달
    }
  };

  // -- Category mutations --
  const addCategory = () => {
    setCategories((prev) => [
      ...prev,
      {
        code: genUuidish("cat"),
        label: "New category",
        color: null,
        sort_order: prev.length,
        is_active: true,
      },
    ]);
  };
  const updateCategory = (idx: number, patch: Partial<CategoryDef>) => {
    setCategories((prev) =>
      prev.map((c, i) => (i === idx ? { ...c, ...patch } : c)),
    );
  };
  const removeCategory = (idx: number) => {
    setCategories((prev) => prev.filter((_, i) => i !== idx));
  };

  // -- Field mutations --
  const addField = () => {
    const newF: FieldDef = {
      type: "short_text",
      id: genUuidish("f"),
      label: "New field",
      required: false,
      placeholder: "",
      helper_text: "",
      sort_order: fields.length,
    };
    setFields((prev) => [...prev, newF]);
    setFieldOrder((prev) => [...prev, newF.id]);
  };
  const updateField = (idx: number, patch: Partial<FieldDef>) => {
    setFields((prev) =>
      prev.map((f, i) => (i === idx ? { ...f, ...patch } : f)),
    );
  };
  const removeField = (idx: number) => {
    setFields((prev) => {
      const removedId = prev[idx]?.id;
      const next = prev.filter((_, i) => i !== idx);
      if (removedId) {
        setFieldOrder((order) => order.filter((id) => id !== removedId));
      }
      return next;
    });
  };

  // DnD sensors + reorder
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        {showHeader ? (
          <button
            onClick={() => router.push("/reports?type=issue")}
            className="flex items-center gap-1 text-textSecondary hover:text-text text-sm"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to issues
          </button>
        ) : (
          <div />
        )}
        <div className="flex items-center gap-2">
          {scope === "store" && storeTemplate && orgTemplate && canEdit && (
            <Button variant="ghost" onClick={handleSyncFromOrg} className="gap-1">
              <RefreshCw className="w-4 h-4" />
              Sync from org
            </Button>
          )}
          {scope === "store" && storeTemplate && canEdit && (
            <Button variant="ghost" onClick={handleResetToOrg} className="gap-1">
              <RotateCcw className="w-4 h-4" />
              Reset to org
            </Button>
          )}
          {canEdit && isCustomizing && (
            <Button onClick={handleSave} disabled={save.isPending} className="gap-2">
              {save.isPending ? <LoadingSpinner size="sm" /> : <Save className="w-4 h-4" />}
              Save template
            </Button>
          )}
        </div>
      </div>

      {showHeader && (
        <div>
          <h1 className="text-2xl font-bold text-text">Issue Form Template</h1>
          <p className="text-textSecondary text-sm mt-1">
            Set defaults at the organization level. Stores customize when they need to.
          </p>
        </div>
      )}

      {/* Scope picker */}
      <Card className="p-4 space-y-3">
        <div>
          <label className="block text-sm text-textSecondary mb-1.5">Scope</label>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setScope("org")}
              className={`flex-1 px-3 py-2 rounded-md border text-sm transition-colors ${
                scope === "org"
                  ? "bg-accentMuted border-accent text-accent font-medium"
                  : "bg-surface border-border text-textSecondary hover:border-accent/40"
              }`}
            >
              <Building2 className="inline-block w-3.5 h-3.5 mr-1.5 -mt-0.5" />
              Organization defaults
            </button>
            <button
              type="button"
              onClick={() => setScope("store")}
              className={`flex-1 px-3 py-2 rounded-md border text-sm transition-colors ${
                scope === "store"
                  ? "bg-accentMuted border-accent text-accent font-medium"
                  : "bg-surface border-border text-textSecondary hover:border-accent/40"
              }`}
            >
              Specific store
            </button>
          </div>
        </div>

        {scope === "store" && (
          <div>
            <label className="block text-sm text-textSecondary mb-1">Store</label>
            <select
              value={storeId}
              onChange={(e) => setStoreId(e.target.value)}
              className="w-full bg-surface border border-border rounded-md px-3 py-2 text-sm text-text"
            >
              <option value="">Select a store…</option>
              {activeStores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </Card>

      {scope === "store" && !storeId ? null : (
        <>
          {isInheritingFromOrg && (
            <div className="bg-accentMuted border border-accent/30 rounded-md p-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Sparkles className="w-5 h-5 text-accent shrink-0" />
                <div>
                  <p className="text-sm font-medium text-text">
                    Using organization defaults
                  </p>
                  <p className="text-xs text-textMuted mt-0.5">
                    This store inherits everything from the org template. Customize
                    to override.
                  </p>
                </div>
              </div>
              {canEdit && (
                <Button onClick={handleCustomize} disabled={save.isPending} className="gap-2 shrink-0">
                  {save.isPending ? <LoadingSpinner size="sm" /> : <Sparkles className="w-4 h-4" />}
                  Customize for this store
                </Button>
              )}
            </div>
          )}

          {/* 2-column: editor + preview */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-5 items-start">
            <div className="space-y-4">
              {/* Categories */}
              <Card className="p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-text">Categories</h2>
                    <p className="text-xs text-textMuted mt-0.5">
                      What kind of issue is it? Staff picks one when filing a report.
                    </p>
                  </div>
                  {isCustomizing && (
                    <Button variant="ghost" onClick={addCategory} className="gap-1">
                      <Plus className="w-4 h-4" /> Add category
                    </Button>
                  )}
                </div>
                <CategoryList
                  categories={categories}
                  setCategories={setCategories}
                  updateCategory={updateCategory}
                  removeCategory={removeCategory}
                  sensors={sensors}
                  disabled={!isCustomizing}
                />
              </Card>

              {/* Fields */}
              <Card className="p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-text">Fields</h2>
                    <p className="text-xs text-textMuted mt-0.5">
                      Standard fields are always shown. Add custom fields below — drag to reorder.
                    </p>
                  </div>
                  {isCustomizing && (
                    <Button variant="ghost" onClick={addField} className="gap-1">
                      <Plus className="w-4 h-4" /> Add field
                    </Button>
                  )}
                </div>
                <FieldList
                  fields={fields}
                  setFields={setFields}
                  updateField={updateField}
                  removeField={removeField}
                  fieldOrder={fieldOrder}
                  setFieldOrder={setFieldOrder}
                  sensors={sensors}
                  disabled={!isCustomizing}
                />
              </Card>
            </div>

            {/* Right: interactive preview */}
            <div className="lg:sticky lg:top-4">
              <Card className="p-5 space-y-4 bg-bg">
                <div className="flex items-center gap-2 pb-2 border-b border-border">
                  <Eye className="w-4 h-4 text-textMuted" />
                  <h3 className="text-sm font-semibold text-text">Preview</h3>
                  <span className="text-[11px] text-textMuted">Interactive — try it</span>
                </div>
                <IssueFormPreview
                  categories={categories.filter((c) => c.is_active)}
                  fields={fields}
                />
              </Card>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Category list (drag reorder)                                              */
/* -------------------------------------------------------------------------- */

function CategoryList({
  categories,
  setCategories,
  updateCategory,
  removeCategory,
  sensors,
  disabled,
}: {
  categories: CategoryDef[];
  setCategories: React.Dispatch<React.SetStateAction<CategoryDef[]>>;
  updateCategory: (idx: number, patch: Partial<CategoryDef>) => void;
  removeCategory: (idx: number) => void;
  sensors: ReturnType<typeof useSensors>;
  disabled: boolean;
}): React.ReactElement {
  if (categories.length === 0) {
    return <p className="text-sm text-textMuted italic">No categories defined.</p>;
  }
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={(e: DragEndEvent) => {
        const { active, over } = e;
        if (!over || active.id === over.id) return;
        const oldIdx = categories.findIndex((c) => c.code === active.id);
        const newIdx = categories.findIndex((c) => c.code === over.id);
        if (oldIdx === -1 || newIdx === -1) return;
        setCategories((prev) => arrayMove(prev, oldIdx, newIdx));
      }}
    >
      <SortableContext
        items={categories.map((c) => c.code)}
        strategy={verticalListSortingStrategy}
      >
        <div className="space-y-2">
          <div className="grid grid-cols-[24px_1fr_72px_28px] gap-2 items-center px-2 text-[11px] font-semibold uppercase tracking-wide text-textMuted">
            <span />
            <span>Name</span>
            <span className="text-center">Active</span>
            <span />
          </div>
          {categories.map((c, idx) => (
            <SortableCategoryRow key={c.code} id={c.code}>
              {(handle) => (
                <div className="grid grid-cols-[24px_1fr_72px_28px] gap-2 items-center bg-surface p-2 rounded-md border border-border">
                  <button
                    type="button"
                    aria-label="Drag"
                    disabled={disabled}
                    className="text-textMuted hover:text-text cursor-grab active:cursor-grabbing disabled:opacity-40 disabled:cursor-not-allowed"
                    {...handle.attributes}
                    {...(handle.listeners ?? {})}
                  >
                    <GripVertical className="w-4 h-4" />
                  </button>
                  <Input
                    value={c.label}
                    disabled={disabled}
                    onChange={(e) => updateCategory(idx, { label: e.target.value })}
                    placeholder="e.g. Kitchen fire"
                  />
                  <label className="flex items-center justify-center">
                    <input
                      type="checkbox"
                      checked={c.is_active}
                      disabled={disabled}
                      onChange={(e) =>
                        updateCategory(idx, { is_active: e.target.checked })
                      }
                      className="accent-accent"
                    />
                  </label>
                  <button
                    onClick={() => removeCategory(idx)}
                    disabled={disabled}
                    className="text-danger hover:bg-dangerMuted p-1 rounded disabled:text-textMuted disabled:hover:bg-transparent justify-self-end"
                    aria-label="Remove"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )}
            </SortableCategoryRow>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function SortableCategoryRow({
  id,
  children,
}: {
  id: string;
  children: (handle: {
    attributes: ReturnType<typeof useSortable>["attributes"];
    listeners: ReturnType<typeof useSortable>["listeners"];
  }) => React.ReactNode;
}): React.ReactElement {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : undefined,
  };
  return (
    <div ref={setNodeRef} style={style}>
      {children({ attributes, listeners })}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Field list — standard + custom (drag reorder for custom only)             */
/* -------------------------------------------------------------------------- */

interface StandardField {
  id: string;
  label: string;
  description: string;
}

const STANDARD_FIELDS: StandardField[] = [
  { id: "__title", label: "Title", description: "Short summary — always required" },
  { id: "__category", label: "Category", description: "Pick from categories above" },
  { id: "__severity", label: "Severity", description: "Low / Medium / High / Critical" },
  { id: "__description", label: "Description", description: "Long text — optional" },
  { id: "__attachments", label: "Attachments", description: "Photos and short video" },
];

interface UnifiedRow {
  id: string;
  kind: "standard" | "custom";
  standard?: StandardField;
  field?: FieldDef;
  customIdx?: number;
}

function FieldList({
  fields,
  setFields,
  updateField,
  removeField,
  fieldOrder,
  setFieldOrder,
  sensors,
  disabled,
}: {
  fields: FieldDef[];
  setFields: React.Dispatch<React.SetStateAction<FieldDef[]>>;
  updateField: (idx: number, patch: Partial<FieldDef>) => void;
  removeField: (idx: number) => void;
  fieldOrder: string[];
  setFieldOrder: React.Dispatch<React.SetStateAction<string[]>>;
  sensors: ReturnType<typeof useSensors>;
  disabled: boolean;
}): React.ReactElement {
  // Standard + custom 통합 list. fieldOrder 따라 정렬 — 없는 id 는 마지막에.
  const rows: UnifiedRow[] = useMemo(() => {
    const standardById = new Map(STANDARD_FIELDS.map((s) => [s.id, s]));
    const customById = new Map(fields.map((f, i) => [f.id, { f, i }]));
    const all: UnifiedRow[] = [];
    const seen = new Set<string>();
    for (const id of fieldOrder) {
      if (seen.has(id)) continue;
      seen.add(id);
      if (standardById.has(id)) {
        all.push({ id, kind: "standard", standard: standardById.get(id)! });
      } else if (customById.has(id)) {
        const c = customById.get(id)!;
        all.push({ id, kind: "custom", field: c.f, customIdx: c.i });
      }
    }
    // order에 없는 standard들 (신규)
    for (const sf of STANDARD_FIELDS) {
      if (!seen.has(sf.id)) {
        all.push({ id: sf.id, kind: "standard", standard: sf });
        seen.add(sf.id);
      }
    }
    // order에 없는 custom들 (신규 추가)
    fields.forEach((f, i) => {
      if (!seen.has(f.id)) {
        all.push({ id: f.id, kind: "custom", field: f, customIdx: i });
        seen.add(f.id);
      }
    });
    return all;
  }, [fields, fieldOrder]);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={(e: DragEndEvent) => {
        const { active, over } = e;
        if (!over || active.id === over.id) return;
        const oldIdx = rows.findIndex((r) => r.id === active.id);
        const newIdx = rows.findIndex((r) => r.id === over.id);
        if (oldIdx === -1 || newIdx === -1) return;
        const next = arrayMove(rows, oldIdx, newIdx);
        // fieldOrder 갱신
        setFieldOrder(next.map((r) => r.id));
        // custom fields 의 setFields 순서도 갱신 (저장 시 같이 보존)
        const newCustomOrder = next
          .filter((r) => r.kind === "custom")
          .map((r) => r.field!);
        setFields(newCustomOrder);
      }}
    >
      <SortableContext
        items={rows.map((r) => r.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="space-y-2">
          {rows.map((r) => (
            <SortableFieldRow key={r.id} id={r.id}>
              {(handle) =>
                r.kind === "standard" ? (
                  <div className="flex items-center gap-3 bg-bg border border-border rounded-md p-2.5">
                    <button
                      type="button"
                      aria-label="Drag"
                      disabled={disabled}
                      className="text-textMuted hover:text-text cursor-grab active:cursor-grabbing disabled:opacity-40 disabled:cursor-not-allowed"
                      {...handle.attributes}
                      {...(handle.listeners ?? {})}
                    >
                      <GripVertical className="w-4 h-4" />
                    </button>
                    <Lock className="w-3.5 h-3.5 text-textMuted shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-text">
                        {r.standard!.label}
                      </p>
                      <p className="text-xs text-textMuted truncate">
                        {r.standard!.description}
                      </p>
                    </div>
                    <span className="text-[10px] uppercase tracking-wide text-textMuted">
                      Standard
                    </span>
                  </div>
                ) : (
                  <div className="bg-surface border border-border rounded-md p-3 space-y-2">
                    <div className="flex items-start gap-2">
                      <button
                        type="button"
                        aria-label="Drag"
                        disabled={disabled}
                        className="mt-2 text-textMuted hover:text-text cursor-grab active:cursor-grabbing disabled:opacity-40 disabled:cursor-not-allowed"
                        {...handle.attributes}
                        {...(handle.listeners ?? {})}
                      >
                        <GripVertical className="w-4 h-4" />
                      </button>
                      <div className="flex-1 grid grid-cols-[1fr_160px_60px_28px] gap-2 items-center">
                        <Input
                          value={r.field!.label}
                          disabled={disabled}
                          onChange={(e) =>
                            updateField(r.customIdx!, { label: e.target.value })
                          }
                          placeholder="Field label (e.g. Incident count)"
                        />
                        <select
                          value={r.field!.type}
                          disabled={disabled}
                          onChange={(e) =>
                            updateField(r.customIdx!, {
                              type: e.target.value as FieldDef["type"],
                            })
                          }
                          className="bg-bg border border-border rounded-md px-2 py-1.5 text-sm text-text disabled:opacity-60"
                        >
                          {FIELD_TYPES.map((t) => (
                            <option key={t.value} value={t.value}>
                              {t.label}
                            </option>
                          ))}
                        </select>
                        <label className="flex items-center justify-center text-xs text-textSecondary">
                          <input
                            type="checkbox"
                            checked={r.field!.required}
                            disabled={disabled}
                            onChange={(e) =>
                              updateField(r.customIdx!, {
                                required: e.target.checked,
                              })
                            }
                            className="accent-accent"
                          />
                        </label>
                        <button
                          onClick={() => removeField(r.customIdx!)}
                          disabled={disabled}
                          className="text-danger hover:bg-dangerMuted p-1 rounded disabled:text-textMuted disabled:hover:bg-transparent justify-self-end"
                          aria-label="Remove"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 pl-6">
                      <Input
                        value={r.field!.placeholder ?? ""}
                        disabled={disabled}
                        onChange={(e) =>
                          updateField(r.customIdx!, {
                            placeholder: e.target.value,
                          })
                        }
                        placeholder="Example value (placeholder)"
                      />
                      <Input
                        value={r.field!.helper_text ?? ""}
                        disabled={disabled}
                        onChange={(e) =>
                          updateField(r.customIdx!, {
                            helper_text: e.target.value,
                          })
                        }
                        placeholder="Helper text (small note below the input)"
                      />
                    </div>

                    {(r.field!.type === "single_choice" ||
                      r.field!.type === "multi_choice") && (
                      <div className="pl-6">
                        <Textarea
                          rows={2}
                          disabled={disabled}
                          value={(r.field!.options ?? []).join("\n")}
                          onChange={(e) =>
                            updateField(r.customIdx!, {
                              options: e.target.value
                                .split("\n")
                                .map((s) => s.trim())
                                .filter(Boolean),
                            })
                          }
                          placeholder="Options (one per line)"
                        />
                      </div>
                    )}
                  </div>
                )
              }
            </SortableFieldRow>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function SortableFieldRow({
  id,
  children,
}: {
  id: string;
  children: (handle: {
    attributes: ReturnType<typeof useSortable>["attributes"];
    listeners: ReturnType<typeof useSortable>["listeners"];
  }) => React.ReactNode;
}): React.ReactElement {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : undefined,
  };
  return (
    <div ref={setNodeRef} style={style}>
      {children({ attributes, listeners })}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Interactive preview                                                       */
/* -------------------------------------------------------------------------- */

type PreviewAnswer = string | number | string[] | undefined;

function IssueFormPreview({
  categories,
  fields,
}: {
  categories: CategoryDef[];
  fields: FieldDef[];
}): React.ReactElement {
  const [title, setTitle] = useState("");
  const [categoryCode, setCategoryCode] = useState("");
  const [severity, setSeverity] = useState<string>("medium");
  const [description, setDescription] = useState("");
  const [answers, setAnswers] = useState<Record<string, PreviewAnswer>>({});

  // active 카테고리 첫 번째를 default 로
  useEffect(() => {
    if (!categoryCode && categories.length > 0) {
      setCategoryCode(categories[0].code);
    } else if (
      categoryCode &&
      !categories.some((c) => c.code === categoryCode)
    ) {
      setCategoryCode(categories[0]?.code ?? "");
    }
  }, [categories, categoryCode]);

  return (
    <div className="space-y-3 text-sm">
      <PreviewField label="Title" required>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Short summary of the issue"
          className="w-full bg-surface border border-border rounded-md px-3 py-2 text-xs text-text"
        />
      </PreviewField>

      <div className="grid grid-cols-2 gap-2">
        <PreviewField label="Category" required>
          <select
            value={categoryCode}
            onChange={(e) => setCategoryCode(e.target.value)}
            className="w-full bg-surface border border-border rounded-md px-2 py-1.5 text-xs text-text"
          >
            {categories.length === 0 ? (
              <option value="">(none)</option>
            ) : (
              categories.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label || "(unnamed)"}
                </option>
              ))
            )}
          </select>
        </PreviewField>
        <PreviewField label="Severity" required>
          <select
            value={severity}
            onChange={(e) => setSeverity(e.target.value)}
            className="w-full bg-surface border border-border rounded-md px-2 py-1.5 text-xs text-text"
          >
            {ISSUE_SEVERITIES.map((s) => (
              <option key={s} value={s}>
                {SEVERITY_LABELS[s]}
              </option>
            ))}
          </select>
        </PreviewField>
      </div>

      {fields.length > 0 && (
        <div className="border-t border-border pt-3 space-y-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-textMuted">
            Custom fields
          </p>
          {fields.map((f) => (
            <PreviewField
              key={f.id}
              label={f.label || "(unnamed)"}
              required={f.required}
              helper={f.helper_text}
            >
              {renderPreviewControl(f, answers[f.id], (v) =>
                setAnswers((prev) => ({ ...prev, [f.id]: v })),
              )}
            </PreviewField>
          ))}
        </div>
      )}

      <PreviewField label="Description">
        <textarea
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What happened, where, when, impact…"
          className="w-full bg-surface border border-border rounded-md px-3 py-2 text-xs text-text resize-none"
        />
      </PreviewField>

      <PreviewField label="Attachments">
        <div className="border border-dashed border-border rounded-md px-3 py-2 text-xs text-textMuted bg-surface text-center">
          📎 Photo or video
        </div>
      </PreviewField>

      <button
        type="button"
        disabled
        className="w-full mt-2 px-3 py-2 rounded-md bg-accent/40 text-white text-xs font-medium cursor-not-allowed"
      >
        Submit Issue (preview)
      </button>
    </div>
  );
}

function PreviewField({
  label,
  required,
  helper,
  children,
}: {
  label: string;
  required?: boolean;
  helper?: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div>
      <label className="block text-[11px] text-textSecondary mb-1">
        {label}
        {required && <span className="text-danger ml-0.5">*</span>}
      </label>
      {children}
      {helper && (
        <p className="text-[10px] text-textMuted mt-0.5">{helper}</p>
      )}
    </div>
  );
}

function renderPreviewControl(
  f: FieldDef,
  value: PreviewAnswer,
  onChange: (v: PreviewAnswer) => void,
): React.ReactElement {
  switch (f.type) {
    case "short_text":
      return (
        <input
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={f.placeholder ?? ""}
          className="w-full bg-surface border border-border rounded-md px-3 py-1.5 text-xs text-text"
        />
      );
    case "long_text":
      return (
        <textarea
          rows={2}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={f.placeholder ?? ""}
          className="w-full bg-surface border border-border rounded-md px-3 py-1.5 text-xs text-text resize-none"
        />
      );
    case "number":
      return (
        <input
          type="number"
          value={(value as number | undefined) ?? ""}
          onChange={(e) =>
            onChange(e.target.value === "" ? undefined : Number(e.target.value))
          }
          placeholder={f.placeholder ?? ""}
          className="w-full bg-surface border border-border rounded-md px-3 py-1.5 text-xs text-text"
        />
      );
    case "single_choice":
      return (
        <select
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value || undefined)}
          className="w-full bg-surface border border-border rounded-md px-2 py-1.5 text-xs text-text"
        >
          <option value="">— Select —</option>
          {(f.options ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      );
    case "multi_choice": {
      const arr = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div className="space-y-0.5">
          {(f.options ?? []).length === 0 ? (
            <p className="text-[11px] text-textMuted italic">(no options)</p>
          ) : (
            (f.options ?? []).map((o) => (
              <label
                key={o}
                className="flex items-center gap-1.5 text-xs text-text cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={arr.includes(o)}
                  onChange={(e) => {
                    const next = e.target.checked
                      ? [...arr, o]
                      : arr.filter((x) => x !== o);
                    onChange(next);
                  }}
                  className="accent-accent"
                />
                {o}
              </label>
            ))
          )}
        </div>
      );
    }
  }
}
