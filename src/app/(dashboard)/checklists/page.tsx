"use client";

/**
 * 체크리스트 관리 페이지 -- 전체 체크리스트 템플릿 목록 및 생성.
 * Store/Shift/Position 필터 지원, 일괄 등록 기능 포함.
 *
 * Checklists management page -- List all checklist templates across stores.
 * Supports Store/Shift/Position filters and bulk item registration.
 */

import React, { useState, useMemo, useCallback, useRef, DragEvent } from "react";
import { useUrlParams } from "@/hooks/useUrlParams";
import { Plus, ChevronRight, Trash2, Edit, Upload, Download, FileSpreadsheet, X } from "lucide-react";
import {
  useAllChecklistTemplates,
  useChecklistTemplates,
  useCreateChecklistTemplate,
  useDeleteChecklistTemplate,
  useChecklistItems,
  useBulkCreateChecklistItems,
  useCreateChecklistItem,
  useUpdateChecklistItem,
  useDeleteChecklistItem,
  useImportChecklistTemplates,
  downloadSampleExcel,
} from "@/hooks/useChecklists";
import { useStores } from "@/hooks/useStores";
import { useShifts, useCreateShift } from "@/hooks/useShifts";
import { usePositions, useCreatePosition } from "@/hooks/usePositions";
import {
  Button,
  Input,
  Select,
  Card,
  Badge,
  Modal,
  ConfirmDialog,
} from "@/components/ui";
import { Textarea } from "@/components/ui/Textarea";
import { SortableList } from "@/components/ui/SortableList";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useToast } from "@/components/ui/Toast";
import { cn, parseApiError } from "@/lib/utils";
import { usePermissions } from "@/hooks/usePermissions";
import { PERMISSIONS } from "@/lib/permissions";
import type {
  Store,
  Shift,
  Position,
  ChecklistTemplate,
  ChecklistItem,
  ExcelImportResponse,
} from "@/types";

/** 요일 약어 → 인덱스 매핑 (Bulk add parsing) */
const BULK_DAY_MAP: Record<string, number> = {
  mon: 0, tue: 1, wed: 2, thu: 3, fri: 4, sat: 5, sun: 6,
};

/** 일괄 등록 파싱 결과 타입 (Bulk parsed item type) */
interface ParsedItem {
  title: string;
  verification_type: string;
  recurrence_type: "daily" | "weekly";
  recurrence_days: number[] | null;
  warnings: string[];
}

/** 체크리스트 아이템 폼 데이터 / Checklist item form data */
interface ItemFormData {
  title: string;
  description: string;
  verification_type: string;
  recurrence_days: number[];
}

const INITIAL_ITEM_FORM: ItemFormData = {
  title: "",
  description: "",
  verification_type: "none",
  recurrence_days: [],
};

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Derive recurrence_type and recurrence_days for API from selected days */
function deriveRecurrence(days: number[]): { recurrence_type: "daily" | "weekly"; recurrence_days: number[] | null } {
  if (days.length === 0 || days.length === 7) {
    return { recurrence_type: "daily", recurrence_days: null };
  }
  return { recurrence_type: "weekly", recurrence_days: [...days].sort() };
}

/** Toggle a verification type in a comma-separated string */
function toggleVerificationType(current: string, type: "photo" | "text"): string {
  const types = current.split(",").filter((t) => t && t !== "none");
  const idx = types.indexOf(type);
  if (idx >= 0) {
    types.splice(idx, 1);
  } else {
    types.push(type);
  }
  return types.length > 0 ? types.sort().join(",") : "none";
}

/** Check if a verification type string contains a specific type */
function hasVerificationType(value: string, type: "photo" | "text"): boolean {
  return value.split(",").includes(type);
}

export default function ChecklistsPage(): React.ReactElement {
  const { toast } = useToast();
  const { hasPermission } = usePermissions();
  const canManageChecklists = hasPermission(PERMISSIONS.CHECKLISTS_CREATE);

  /* ---- Filter state (URL-persisted) ---- */
  const [urlParams, setUrlParams] = useUrlParams({ store: "", shift: "", position: "" });
  const filterStoreId = urlParams.store;
  const filterShiftId = urlParams.shift;
  const filterPositionId = urlParams.position;

  /* ---- Data hooks ---- */
  const { data: stores } = useStores();
  const { data: templates, isLoading } = useAllChecklistTemplates({
    store_id: filterStoreId || undefined,
    shift_id: filterShiftId || undefined,
    position_id: filterPositionId || undefined,
  });

  /* ---- Create template state ---- */
  const [isCreateOpen, setIsCreateOpen] = useState<boolean>(false);
  const [createStoreId, setCreateStoreId] = useState<string>("");
  const [createShiftId, setCreateShiftId] = useState<string>("");
  const [createPositionId, setCreatePositionId] = useState<string>("");
  const [createTitle, setCreateTitle] = useState<string>("");
  const [isCreatingShift, setIsCreatingShift] = useState(false);
  const [newShiftName, setNewShiftName] = useState("");
  const [isCreatingPosition, setIsCreatingPosition] = useState(false);
  const [newPositionName, setNewPositionName] = useState("");

  /* ---- Excel import state ---- */
  const [isImportOpen, setIsImportOpen] = useState<boolean>(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [duplicateAction, setDuplicateAction] = useState<"skip" | "overwrite" | "append">("skip");
  const [importResult, setImportResult] = useState<ExcelImportResponse | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState<boolean>(false);

  /* ---- Cascading selects: load shifts/positions for selected store ---- */
  const { data: createShifts } = useShifts(createStoreId || undefined);
  const { data: createPositions } = usePositions(createStoreId || undefined);

  /* ---- 생성 매장의 기존 템플릿 조회 (Existing templates for create store) ---- */
  const { data: existingTemplatesForStore } = useChecklistTemplates(createStoreId || undefined);

  /** 선택한 매장의 기존 shift+position 조합 Set (Existing combos for selected store) */
  const existingCombos: Set<string> = useMemo(() => {
    const set = new Set<string>();
    if (existingTemplatesForStore) {
      for (const t of existingTemplatesForStore) {
        set.add(`${t.shift_id}::${t.position_id}`);
      }
    }
    return set;
  }, [existingTemplatesForStore]);

  /** 선택한 shift에서 사용 가능한 position이 있는지 확인 (Check if shift has available positions) */
  const getAvailablePositionCount = useCallback(
    (shiftId: string): number => {
      if (!createPositions) return 0;
      return createPositions.filter(
        (p: Position) => !existingCombos.has(`${shiftId}::${p.id}`),
      ).length;
    },
    [createPositions, existingCombos],
  );

  /* ---- Filter cascading: load shifts/positions for filter store ---- */
  const { data: filterShifts } = useShifts(filterStoreId || undefined);
  const { data: filterPositions } = usePositions(filterStoreId || undefined);

  /* ---- Delete state ---- */
  const [isDeleteOpen, setIsDeleteOpen] = useState<boolean>(false);
  const [deletingTemplateId, setDeletingTemplateId] = useState<string | null>(null);
  const [deletingTemplateName, setDeletingTemplateName] = useState<string>("");

  /* ---- Expanded template (view items) ---- */
  const [expandedTemplateId, setExpandedTemplateId] = useState<string | null>(null);

  /* ---- Bulk add state ---- */
  const [isBulkOpen, setIsBulkOpen] = useState<boolean>(false);
  const [bulkText, setBulkText] = useState<string>("");
  const [isBulkAdding, setIsBulkAdding] = useState<boolean>(false);

  /* ---- Item CRUD state ---- */
  const [isItemCreateOpen, setIsItemCreateOpen] = useState<boolean>(false);
  const [itemCreateForm, setItemCreateForm] = useState<ItemFormData>(INITIAL_ITEM_FORM);
  const [isItemEditOpen, setIsItemEditOpen] = useState<boolean>(false);
  const [itemEditForm, setItemEditForm] = useState<ItemFormData>(INITIAL_ITEM_FORM);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [isItemDeleteOpen, setIsItemDeleteOpen] = useState<boolean>(false);
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);
  const [deletingItemTitle, setDeletingItemTitle] = useState<string>("");

  /* ---- Mutations ---- */
  const createTemplate = useCreateChecklistTemplate();
  const deleteTemplate = useDeleteChecklistTemplate();
  const bulkCreateItems = useBulkCreateChecklistItems();
  const createItem = useCreateChecklistItem();
  const updateItem = useUpdateChecklistItem();
  const deleteItem = useDeleteChecklistItem();
  const importTemplates = useImportChecklistTemplates();
  const createNewShift = useCreateShift();
  const createNewPosition = useCreatePosition();

  const { data: checklistItems, isLoading: itemsLoading } = useChecklistItems(
    expandedTemplateId || "",
  );

  /* ---- Derived data ---- */
  const storeList: Store[] = useMemo(() => stores ?? [], [stores]);
  const templateList: ChecklistTemplate[] = useMemo(
    () => (Array.isArray(templates) ? templates : []),
    [templates],
  );

  /** store별 그룹핑 + store명 정렬 (Group templates by store, sorted by store name) */
  const groupedTemplates: Array<{ storeId: string; storeName: string; templates: ChecklistTemplate[] }> = useMemo(() => {
    const map = new Map<string, { storeName: string; templates: ChecklistTemplate[] }>();
    for (const t of templateList) {
      const existing = map.get(t.store_id);
      if (existing) {
        existing.templates.push(t);
      } else {
        const storeName = storeList.find((s: Store) => s.id === t.store_id)?.name ?? "-";
        map.set(t.store_id, { storeName, templates: [t] });
      }
    }
    return [...map.entries()]
      .sort(([, a], [, b]) => a.storeName.localeCompare(b.storeName))
      .map(([storeId, { storeName, templates: tmps }]) => ({ storeId, storeName, templates: tmps }));
  }, [templateList, storeList]);
  const itemList: ChecklistItem[] = useMemo(
    () => (Array.isArray(checklistItems) ? checklistItems : []),
    [checklistItems],
  );
  const sortedItems: ChecklistItem[] = useMemo(
    () => [...itemList].sort((a, b) => a.sort_order - b.sort_order),
    [itemList],
  );

  /* ---- Name lookups ---- */
  const getShiftName = useCallback(
    (shiftId: string, shifts: Shift[] | undefined): string => {
      if (!shifts) return "-";
      const shift = shifts.find((s: Shift) => s.id === shiftId);
      return shift ? shift.name : "-";
    },
    [],
  );

  const getPositionName = useCallback(
    (positionId: string, positions: Position[] | undefined): string => {
      if (!positions) return "-";
      const pos = positions.find((p: Position) => p.id === positionId);
      return pos ? pos.name : "-";
    },
    [],
  );

  /* ---- Handlers ---- */
  const handleCreate = useCallback(async (): Promise<void> => {
    if (!createStoreId || !createShiftId || !createPositionId) return;
    try {
      const created = await createTemplate.mutateAsync({
        storeId: createStoreId,
        title: createTitle.trim() || undefined,
        shift_id: createShiftId,
        position_id: createPositionId,
      });
      toast({ type: "success", message: "Checklist template created! Add items below." });
      setIsCreateOpen(false);
      // 필터를 생성한 템플릿의 store로 설정하여 목록에 보이게 함
      setUrlParams({ store: createStoreId, shift: null, position: null });
      setCreateTitle("");
      setCreateStoreId("");
      setCreateShiftId("");
      setCreatePositionId("");
      // 생성 후 아이템 추가 화면으로 자동 전환
      setExpandedTemplateId(created.id);
    } catch (err) {
      toast({ type: "error", message: parseApiError(err, "Failed to create checklist template.") });
    }
  }, [createTitle, createStoreId, createShiftId, createPositionId, createTemplate, toast]);

  const handleCreateInlineShift = useCallback(async (): Promise<void> => {
    if (!createStoreId || !newShiftName.trim()) return;
    try {
      const created = await createNewShift.mutateAsync({
        storeId: createStoreId,
        name: newShiftName.trim(),
      });
      setCreateShiftId(created.id);
      setCreatePositionId("");
      setIsCreatingShift(false);
      setNewShiftName("");
      toast({ type: "success", message: "Shift created!" });
    } catch (err) {
      toast({ type: "error", message: parseApiError(err, "Failed to create shift.") });
    }
  }, [createStoreId, newShiftName, createNewShift, toast]);

  const handleCreateInlinePosition = useCallback(async (): Promise<void> => {
    if (!createStoreId || !newPositionName.trim()) return;
    try {
      const created = await createNewPosition.mutateAsync({
        storeId: createStoreId,
        name: newPositionName.trim(),
      });
      setCreatePositionId(created.id);
      setIsCreatingPosition(false);
      setNewPositionName("");
      toast({ type: "success", message: "Position created!" });
    } catch (err) {
      toast({ type: "error", message: parseApiError(err, "Failed to create position.") });
    }
  }, [createStoreId, newPositionName, createNewPosition, toast]);

  const handleImport = useCallback(async (): Promise<void> => {
    if (!importFile) return;
    try {
      const result = await importTemplates.mutateAsync({
        file: importFile,
        duplicate_action: duplicateAction,
      });
      setImportResult(result);
      toast({ type: "success", message: `Import complete! ${result.created_templates} templates created.` });
    } catch (err) {
      toast({ type: "error", message: parseApiError(err, "Failed to import Excel file.") });
    }
  }, [importFile, duplicateAction, importTemplates, toast]);

  const handleDownloadSample = useCallback(async (): Promise<void> => {
    try {
      await downloadSampleExcel();
      toast({ type: "success", message: "Sample template downloaded!" });
    } catch (err) {
      toast({ type: "error", message: parseApiError(err, "Failed to download sample template.") });
    }
  }, [toast]);

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.name.endsWith(".xlsx")) {
      setImportFile(file);
    } else if (file) {
      toast({ type: "error", message: "Only .xlsx files are supported." });
    }
  }, [toast]);

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleOpenDelete = useCallback(
    (template: ChecklistTemplate, e: React.MouseEvent): void => {
      e.stopPropagation();
      setDeletingTemplateId(template.id);
      setDeletingTemplateName(template.title);
      setIsDeleteOpen(true);
    },
    [],
  );

  const handleDelete = useCallback(async (): Promise<void> => {
    if (!deletingTemplateId) return;
    try {
      await deleteTemplate.mutateAsync(deletingTemplateId);
      toast({ type: "success", message: "Checklist template deleted!" });
      setIsDeleteOpen(false);
      setDeletingTemplateId(null);
      if (expandedTemplateId === deletingTemplateId) {
        setExpandedTemplateId(null);
      }
    } catch (err) {
      toast({ type: "error", message: parseApiError(err, "Failed to delete checklist template.") });
    }
  }, [deletingTemplateId, deleteTemplate, expandedTemplateId, toast]);

  const toggleExpand = useCallback((templateId: string): void => {
    setExpandedTemplateId((prev) => (prev === templateId ? null : templateId));
  }, []);

  /* ---- Bulk add parsing ---- */
  const parsedItems: ParsedItem[] = useMemo(() => {
    if (!bulkText.trim()) return [];
    return bulkText
      .split("\n")
      .filter((line: string) => line.trim())
      .map((line: string): ParsedItem => {
        const parts: string[] = line.split("|").map((s: string) => s.trim());
        const title: string = parts[0] || "";
        const warnings: string[] = [];

        // verification_type parsing
        let verType = "none";
        if (parts[1]) {
          const rawTokens = parts[1].toLowerCase().split(",").map((t: string) => t.trim()).filter(Boolean);
          const validTypes = new Set(["photo", "text"]);
          const valid = rawTokens.filter((t: string) => validTypes.has(t));
          const invalid = rawTokens.filter((t: string) => !validTypes.has(t) && t !== "none");
          if (invalid.length > 0) {
            warnings.push(`Unknown verification "${invalid.join(", ")}" → ignored`);
          }
          verType = valid.length > 0 ? valid.sort().join(",") : "none";
        }

        // recurrence parsing (3rd segment)
        let recurrenceType: "daily" | "weekly" = "daily";
        let recurrenceDays: number[] | null = null;
        if (parts[2]) {
          const recRaw = parts[2].toLowerCase().trim();
          if (recRaw && recRaw !== "daily") {
            const rawDays = recRaw.split(",").map((d: string) => d.trim()).filter(Boolean);
            const validDays: number[] = [];
            const invalidDays: string[] = [];
            for (const d of rawDays) {
              const mapped = BULK_DAY_MAP[d];
              if (mapped !== undefined) {
                validDays.push(mapped);
              } else {
                invalidDays.push(d);
              }
            }
            if (invalidDays.length > 0) {
              warnings.push(`Unknown day "${invalidDays.join(", ")}" → ignored`);
            }
            const uniqueDays = [...new Set(validDays)].sort();
            if (uniqueDays.length > 0 && uniqueDays.length < 7) {
              recurrenceType = "weekly";
              recurrenceDays = uniqueDays;
            } else if (uniqueDays.length === 0 && invalidDays.length > 0) {
              warnings.push("No valid days → defaulted to daily");
            }
          }
        }

        return { title, verification_type: verType, recurrence_type: recurrenceType, recurrence_days: recurrenceDays, warnings };
      })
      .filter((item: ParsedItem) => item.title.length > 0);
  }, [bulkText]);

  const handleBulkAdd = useCallback(async (): Promise<void> => {
    if (!expandedTemplateId || parsedItems.length === 0) return;
    setIsBulkAdding(true);
    try {
      const startOrder: number =
        sortedItems.length > 0
          ? Math.max(...sortedItems.map((i: ChecklistItem) => i.sort_order)) + 1
          : 1;

      await bulkCreateItems.mutateAsync({
        templateId: expandedTemplateId,
        items: parsedItems.map((item: ParsedItem, index: number) => ({
          title: item.title,
          verification_type: item.verification_type,
          recurrence_type: item.recurrence_type,
          recurrence_days: item.recurrence_days,
          sort_order: startOrder + index,
        })),
      });
      toast({ type: "success", message: `${parsedItems.length} items added!` });
      setIsBulkOpen(false);
      setBulkText("");
    } catch (err) {
      toast({ type: "error", message: parseApiError(err, "Failed to add items.") });
    } finally {
      setIsBulkAdding(false);
    }
  }, [expandedTemplateId, parsedItems, sortedItems, bulkCreateItems, toast]);

  /* ---- Item CRUD handlers ---- */
  const handleCreateItem = useCallback(async (): Promise<void> => {
    if (!expandedTemplateId || !itemCreateForm.title.trim()) return;
    const nextOrder: number =
      sortedItems.length > 0
        ? Math.max(...sortedItems.map((i: ChecklistItem) => i.sort_order)) + 1
        : 1;
    const recurrence = deriveRecurrence(itemCreateForm.recurrence_days);
    try {
      await createItem.mutateAsync({
        templateId: expandedTemplateId,
        title: itemCreateForm.title.trim(),
        description: itemCreateForm.description.trim() || undefined,
        verification_type: itemCreateForm.verification_type,
        recurrence_type: recurrence.recurrence_type,
        recurrence_days: recurrence.recurrence_days,
        sort_order: nextOrder,
      });
      toast({ type: "success", message: "Checklist item created!" });
      setIsItemCreateOpen(false);
      setItemCreateForm(INITIAL_ITEM_FORM);
    } catch (err) {
      toast({ type: "error", message: parseApiError(err, "Failed to create checklist item.") });
    }
  }, [expandedTemplateId, itemCreateForm, createItem, toast, sortedItems]);

  const handleOpenItemEdit = useCallback(
    (item: ChecklistItem, e: React.MouseEvent): void => {
      e.stopPropagation();
      setEditingItemId(item.id);
      setItemEditForm({
        title: item.title,
        description: item.description || "",
        verification_type: item.verification_type,
        recurrence_days: item.recurrence_type === "daily" ? [] : (item.recurrence_days || []),
      });
      setIsItemEditOpen(true);
    },
    [],
  );

  const handleUpdateItem = useCallback(async (): Promise<void> => {
    if (!editingItemId || !itemEditForm.title.trim()) return;
    const recurrence = deriveRecurrence(itemEditForm.recurrence_days);
    try {
      await updateItem.mutateAsync({
        id: editingItemId,
        templateId: expandedTemplateId || "",
        title: itemEditForm.title.trim(),
        description: itemEditForm.description.trim() || undefined,
        verification_type: itemEditForm.verification_type,
        recurrence_type: recurrence.recurrence_type,
        recurrence_days: recurrence.recurrence_days,
      });
      toast({ type: "success", message: "Checklist item updated!" });
      setIsItemEditOpen(false);
      setEditingItemId(null);
      setItemEditForm(INITIAL_ITEM_FORM);
    } catch (err) {
      toast({ type: "error", message: parseApiError(err, "Failed to update checklist item.") });
    }
  }, [editingItemId, itemEditForm, updateItem, expandedTemplateId, toast]);

  const handleOpenItemDelete = useCallback(
    (item: ChecklistItem, e: React.MouseEvent): void => {
      e.stopPropagation();
      setDeletingItemId(item.id);
      setDeletingItemTitle(item.title);
      setIsItemDeleteOpen(true);
    },
    [],
  );

  const handleDeleteItem = useCallback(async (): Promise<void> => {
    if (!deletingItemId) return;
    try {
      await deleteItem.mutateAsync({ id: deletingItemId, templateId: expandedTemplateId || "" });
      toast({ type: "success", message: "Checklist item deleted!" });
      setIsItemDeleteOpen(false);
      setDeletingItemId(null);
      setDeletingItemTitle("");
    } catch (err) {
      toast({ type: "error", message: parseApiError(err, "Failed to delete checklist item.") });
    }
  }, [deletingItemId, deleteItem, expandedTemplateId, toast]);

  /* ---- Store-specific shift/position data for display ---- */
  // For each unique store_id in templates, we'd need shifts/positions
  // We'll use the filter shifts/positions or fall back to IDs

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-extrabold text-text">Checklists</h1>
        {canManageChecklists && (
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={() => {
              setIsImportOpen(true);
              setImportFile(null);
              setImportResult(null);
              setDuplicateAction("skip");
            }}>
              <Upload className="h-4 w-4" />
              Excel Import
            </Button>
            <Button variant="primary" onClick={() => setIsCreateOpen(true)}>
              <Plus className="h-4 w-4" />
              Add Template
            </Button>
          </div>
        )}
      </div>

      {/* Filters */}
      <Card className="mb-6" padding="p-4">
        <div className="flex items-end gap-3 flex-wrap">
          <div className="w-44">
            <Select
              label="Store"
              value={filterStoreId}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                setUrlParams({ store: e.target.value, shift: null, position: null });
              }}
              options={[
                { value: "", label: "All Stores" },
                ...storeList.map((b: Store) => ({ value: b.id, label: b.name })),
              ]}
            />
          </div>
          <div className="w-44">
            <Select
              label="Shift"
              value={filterShiftId}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                setUrlParams({ shift: e.target.value })
              }
              options={[
                { value: "", label: "All Shifts" },
                ...(filterShifts ?? []).map((s: Shift) => ({
                  value: s.id,
                  label: s.name,
                })),
              ]}
              disabled={!filterStoreId}
            />
          </div>
          <div className="w-44">
            <Select
              label="Position"
              value={filterPositionId}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                setUrlParams({ position: e.target.value })
              }
              options={[
                { value: "", label: "All Positions" },
                ...(filterPositions ?? []).map((p: Position) => ({
                  value: p.id,
                  label: p.name,
                })),
              ]}
              disabled={!filterStoreId}
            />
          </div>
        </div>
      </Card>

      {/* Template List */}
      {isLoading ? (
        <div className="flex items-center justify-center h-32">
          <LoadingSpinner size="lg" />
        </div>
      ) : templateList.length === 0 ? (
        <Card className="text-center py-8">
          <p className="text-sm text-text-muted">
            No checklist templates found. Create one to get started.
          </p>
        </Card>
      ) : (
        <div className="space-y-6">
          {groupedTemplates.map((group) => (
            <div key={group.storeId}>
              {/* Store Header */}
              <div className="flex items-center gap-3 mb-2">
                <h2 className="text-sm font-semibold text-text">
                  {group.storeName}
                </h2>
                <span className="text-xs text-text-muted">
                  {group.templates.length} templates
                </span>
                <div className="flex-1 border-t border-border" />
              </div>

              {/* Templates in this store */}
              <div className="space-y-2">
                {group.templates.map((template: ChecklistTemplate) => (
                  <div
                    key={template.id}
                    className="bg-card border border-border rounded-xl overflow-hidden"
                  >
                    {/* Template Header */}
                    <div
                      className="flex items-center justify-between px-5 py-4 hover:bg-surface-hover transition-colors cursor-pointer"
                      onClick={() => toggleExpand(template.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e: React.KeyboardEvent) => {
                        if (e.key === "Enter" || e.key === " ") toggleExpand(template.id);
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={cn(
                            "transition-transform",
                            expandedTemplateId === template.id && "rotate-90",
                          )}
                        >
                          <ChevronRight className="h-4 w-4 text-text-muted" />
                        </div>
                        <div>
                          <p className="font-medium text-text text-sm">
                            {template.title}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="accent">
                              {template.shift_name || template.shift_id}
                            </Badge>
                            <Badge variant="default">
                              {template.position_name || template.position_id}
                            </Badge>
                            <span className="text-xs text-text-muted">
                              {template.item_count} items
                            </span>
                          </div>
                        </div>
                      </div>
                      {canManageChecklists && (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={(e: React.MouseEvent) => handleOpenDelete(template, e)}
                            className="p-1.5 rounded-md text-text-muted hover:text-danger hover:bg-danger-muted transition-colors"
                            aria-label={`Delete ${template.title}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Expanded Items */}
                    {expandedTemplateId === template.id && (
                      <div className="border-t border-border bg-surface px-5 py-4">
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="text-sm font-semibold text-text-secondary">
                            Checklist Items
                          </h3>
                          {canManageChecklists && (
                            <div className="flex items-center gap-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setIsItemCreateOpen(true)}
                              >
                                <Plus className="h-3.5 w-3.5" />
                                Add Item
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setBulkText("");
                                  setIsBulkOpen(true);
                                }}
                              >
                                <Plus className="h-3.5 w-3.5" />
                                Bulk Add
                              </Button>
                            </div>
                          )}
                        </div>

                        {itemsLoading ? (
                          <div className="flex items-center justify-center h-16">
                            <LoadingSpinner size="sm" />
                          </div>
                        ) : sortedItems.length === 0 ? (
                          <p className="text-xs text-text-muted text-center py-4">
                            No items yet. Add items to this checklist.
                          </p>
                        ) : (
                          <div className="space-y-1">
                            {sortedItems.map((item: ChecklistItem, index: number) => (
                              <div
                                key={item.id}
                                className="flex items-center gap-2 px-3 py-2 rounded-lg bg-card border border-border group"
                              >
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm text-text">
                                    <span className="text-xs font-mono text-text-muted mr-2">
                                      {index + 1}.
                                    </span>
                                    {item.title}
                                  </p>
                                  {item.description && (
                                    <p className="text-xs text-text-muted mt-0.5 ml-6">
                                      {item.description}
                                    </p>
                                  )}
                                </div>
                                <Badge variant={item.recurrence_type === "daily" ? "accent" : "warning"}>
                                  {item.recurrence_type === "daily"
                                    ? "Daily"
                                    : (item.recurrence_days ?? [])
                                        .map((d: number) => ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][d])
                                        .join(",")}
                                </Badge>
                                {item.verification_type !== "none" &&
                                  item.verification_type
                                    .split(",")
                                    .map((vt: string) => (
                                      <Badge key={vt} variant="warning">
                                        {vt}
                                      </Badge>
                                    ))}
                                {canManageChecklists && (
                                  <div className="flex items-center gap-0.5">
                                    <button
                                      type="button"
                                      onClick={(e: React.MouseEvent) => handleOpenItemEdit(item, e)}
                                      className="p-1 rounded-md text-text-muted hover:text-text hover:bg-surface-hover transition-colors"
                                      aria-label={`Edit ${item.title}`}
                                    >
                                      <Edit className="h-3.5 w-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={(e: React.MouseEvent) => handleOpenItemDelete(item, e)}
                                      className="p-1 rounded-md text-text-muted hover:text-danger hover:bg-danger-muted transition-colors"
                                      aria-label={`Delete ${item.title}`}
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Template Modal */}
      <Modal
        isOpen={isCreateOpen}
        onClose={() => {
          setIsCreateOpen(false);
          setCreateTitle("");
          setCreateStoreId("");
          setCreateShiftId("");
          setCreatePositionId("");
          setIsCreatingShift(false);
          setNewShiftName("");
          setIsCreatingPosition(false);
          setNewPositionName("");
        }}
        title="Create Checklist Template"
      >
        <div className="space-y-4">
          {/* 제목 프리뷰 — 맨 위에 표시, 선택할 때마다 점진적으로 빌드 */}
          <div className="rounded-lg border border-border bg-surface p-3 min-h-[52px]">
            <p className="mb-1 text-xs font-medium text-text-muted">Template Title</p>
            {createStoreId ? (
              <p className="text-sm font-semibold text-text">
                {storeList.find((s: Store) => s.id === createStoreId)?.name ?? ""}
                {createShiftId && (
                  <span>
                    {" - "}
                    {(createShifts ?? []).find((s: Shift) => s.id === createShiftId)?.name ?? ""}
                  </span>
                )}
                {createPositionId && (
                  <span>
                    {" - "}
                    {(createPositions ?? []).find((p: Position) => p.id === createPositionId)?.name ?? ""}
                  </span>
                )}
                {createTitle.trim() && (
                  <span className="text-text-secondary"> ({createTitle.trim()})</span>
                )}
              </p>
            ) : (
              <p className="text-sm text-text-muted italic">Select store, shift, position below...</p>
            )}
          </div>

          <Select
            label="Store"
            value={createStoreId}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
              setCreateStoreId(e.target.value);
              setCreateShiftId("");
              setCreatePositionId("");
              setIsCreatingShift(false);
              setNewShiftName("");
              setIsCreatingPosition(false);
              setNewPositionName("");
            }}
            options={[
              { value: "", label: "Select a store" },
              ...storeList.map((b: Store) => ({ value: b.id, label: b.name })),
            ]}
          />
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-sm font-medium text-text-secondary">Shift</label>
              {createStoreId && !isCreatingShift && (
                <button
                  type="button"
                  onClick={() => setIsCreatingShift(true)}
                  className="text-xs text-primary hover:text-primary-hover transition-colors"
                >
                  + Add new
                </button>
              )}
            </div>
            {isCreatingShift ? (
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <Input
                    placeholder="New shift name"
                    value={newShiftName}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewShiftName(e.target.value)}
                    onKeyDown={(e: React.KeyboardEvent) => { if (e.key === "Enter") handleCreateInlineShift(); }}
                  />
                </div>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleCreateInlineShift}
                  isLoading={createNewShift.isPending}
                  disabled={!newShiftName.trim()}
                >
                  Create
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setIsCreatingShift(false); setNewShiftName(""); }}
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <Select
                value={createShiftId}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                  setCreateShiftId(e.target.value);
                  setCreatePositionId("");
                }}
                options={[
                  { value: "", label: "Select a shift" },
                  ...[...(createShifts ?? [])].sort((a: Shift, b: Shift) => {
                    const aTaken = createPositions && createPositions.length > 0 && getAvailablePositionCount(a.id) === 0;
                    const bTaken = createPositions && createPositions.length > 0 && getAvailablePositionCount(b.id) === 0;
                    if (aTaken === bTaken) return 0;
                    return aTaken ? 1 : -1;
                  }).map((s: Shift) => {
                    const availableCount = getAvailablePositionCount(s.id);
                    const allTaken = createPositions && createPositions.length > 0 && availableCount === 0;
                    return {
                      value: s.id,
                      label: allTaken ? `${s.name} (all positions taken)` : s.name,
                      disabled: allTaken,
                    };
                  }),
                ]}
                disabled={!createStoreId}
              />
            )}
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-sm font-medium text-text-secondary">Position</label>
              {createStoreId && !isCreatingPosition && (
                <button
                  type="button"
                  onClick={() => setIsCreatingPosition(true)}
                  className="text-xs text-primary hover:text-primary-hover transition-colors"
                >
                  + Add new
                </button>
              )}
            </div>
            {isCreatingPosition ? (
              <div className="flex items-center gap-2">
                <div className="flex-1">
                  <Input
                    placeholder="New position name"
                    value={newPositionName}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewPositionName(e.target.value)}
                    onKeyDown={(e: React.KeyboardEvent) => { if (e.key === "Enter") handleCreateInlinePosition(); }}
                  />
                </div>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleCreateInlinePosition}
                  isLoading={createNewPosition.isPending}
                  disabled={!newPositionName.trim()}
                >
                  Create
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setIsCreatingPosition(false); setNewPositionName(""); }}
                >
                  Cancel
                </Button>
              </div>
            ) : (
              <Select
                value={createPositionId}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  setCreatePositionId(e.target.value)
                }
                options={[
                  { value: "", label: "Select a position" },
                  ...[...(createPositions ?? [])].sort((a: Position, b: Position) => {
                    const aTaken = !!(createShiftId && existingCombos.has(`${createShiftId}::${a.id}`));
                    const bTaken = !!(createShiftId && existingCombos.has(`${createShiftId}::${b.id}`));
                    if (aTaken === bTaken) return 0;
                    return aTaken ? 1 : -1;
                  }).map((p: Position) => {
                    const taken = createShiftId && existingCombos.has(`${createShiftId}::${p.id}`);
                    return {
                      value: p.id,
                      label: taken ? `${p.name} (already exists)` : p.name,
                      disabled: !!taken,
                    };
                  }),
                ]}
                disabled={!createStoreId}
              />
            )}
          </div>
          <Input
            label="Additional Name (Optional)"
            placeholder={createStoreId && createShiftId && createPositionId ? "e.g. Opening Checklist" : "Select store, shift, position first"}
            value={createTitle}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setCreateTitle(e.target.value)
            }
            disabled={!createStoreId || !createShiftId || !createPositionId}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="secondary"
              onClick={() => {
                setIsCreateOpen(false);
                setCreateTitle("");
                setCreateStoreId("");
                setCreateShiftId("");
                setCreatePositionId("");
                setIsCreatingShift(false);
                setNewShiftName("");
                setIsCreatingPosition(false);
                setNewPositionName("");
              }}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleCreate}
              isLoading={createTemplate.isPending}
              disabled={!createStoreId || !createShiftId || !createPositionId}
            >
              Create
            </Button>
          </div>
        </div>
      </Modal>

      {/* Bulk Add Items Modal */}
      <Modal
        isOpen={isBulkOpen}
        onClose={() => {
          setIsBulkOpen(false);
          setBulkText("");
        }}
        title="Bulk Add Checklist Items"
        size="lg"
      >
        <div className="space-y-4">
          <div>
            <p className="text-xs text-text-muted mb-2">
              Format: <code className="bg-surface px-1 py-0.5 rounded text-accent">Item title | verification | recurrence</code> (one per line)
            </p>
            <p className="text-xs text-text-muted mb-1">
              Verification: <code className="bg-surface px-1 py-0.5 rounded">photo</code>, <code className="bg-surface px-1 py-0.5 rounded">text</code>, or <code className="bg-surface px-1 py-0.5 rounded">photo,text</code>. Omit for none.
            </p>
            <p className="text-xs text-text-muted mb-3">
              Recurrence: <code className="bg-surface px-1 py-0.5 rounded">daily</code> or days like <code className="bg-surface px-1 py-0.5 rounded">mon,wed,fri</code>. Omit for daily.
            </p>
            <Textarea
              label="Items"
              placeholder={`Clean the counter | photo\nRestock supplies\nCheck temperature | text | mon,wed,fri\nWeekend inventory | photo,text | sat,sun`}
              value={bulkText}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                setBulkText(e.target.value)
              }
              rows={8}
            />
          </div>

          {parsedItems.length > 0 && (
            <div>
              <p className="text-sm font-medium text-text-secondary mb-2">
                Preview: {parsedItems.length} items
                {parsedItems.some((item: ParsedItem) => item.warnings.length > 0) && (
                  <span className="ml-2 text-xs text-amber-500 font-normal">
                    ({parsedItems.filter((item: ParsedItem) => item.warnings.length > 0).length} with warnings)
                  </span>
                )}
              </p>
              <div className="max-h-48 overflow-y-auto space-y-1 border border-border rounded-lg p-2">
                {parsedItems.map((item: ParsedItem, index: number) => (
                  <div key={index}>
                    <div className="flex items-center gap-2 px-2 py-1 text-sm">
                      <span className="text-xs font-mono text-text-muted w-6">
                        {index + 1}.
                      </span>
                      <span className="text-text flex-1">{item.title}</span>
                      <Badge variant={item.recurrence_type === "daily" ? "accent" : "warning"}>
                        {item.recurrence_type === "daily"
                          ? "Daily"
                          : (item.recurrence_days ?? []).map((d: number) => DAY_LABELS[d]).join(",")}
                      </Badge>
                      {item.verification_type !== "none" && (
                        <Badge variant="warning">{item.verification_type}</Badge>
                      )}
                    </div>
                    {item.warnings.length > 0 && (
                      <div className="ml-8 mb-1">
                        {item.warnings.map((w: string, wi: number) => (
                          <p key={wi} className="text-xs text-amber-500">⚠ {w}</p>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="secondary"
              onClick={() => {
                setIsBulkOpen(false);
                setBulkText("");
              }}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleBulkAdd}
              isLoading={isBulkAdding}
              disabled={parsedItems.length === 0}
            >
              Add {parsedItems.length} Items
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Template Dialog */}
      <ConfirmDialog
        isOpen={isDeleteOpen}
        onClose={() => {
          setIsDeleteOpen(false);
          setDeletingTemplateId(null);
          setDeletingTemplateName("");
        }}
        onConfirm={handleDelete}
        title="Delete Checklist Template"
        message={`Are you sure you want to delete "${deletingTemplateName}"? All items will also be deleted.`}
        confirmLabel="Delete"
        isLoading={deleteTemplate.isPending}
      />

      {/* Create Item Modal */}
      <Modal
        isOpen={isItemCreateOpen}
        onClose={() => {
          setIsItemCreateOpen(false);
          setItemCreateForm(INITIAL_ITEM_FORM);
        }}
        title="Add Checklist Item"
      >
        <div className="space-y-4">
          <Input
            label="Item Title"
            placeholder="e.g. Clean the counter"
            value={itemCreateForm.title}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setItemCreateForm((prev: ItemFormData) => ({
                ...prev,
                title: e.target.value,
              }))
            }
          />
          <Input
            label="Description (optional)"
            placeholder="Additional instructions..."
            value={itemCreateForm.description}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setItemCreateForm((prev: ItemFormData) => ({
                ...prev,
                description: e.target.value,
              }))
            }
          />
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">
              Recurrence
            </label>
            <p className="text-xs text-text-muted mb-2">
              No selection = every day. Select specific days to limit.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() =>
                  setItemCreateForm((prev: ItemFormData) => ({
                    ...prev,
                    recurrence_days: prev.recurrence_days.length === 7 ? [] : [0, 1, 2, 3, 4, 5, 6],
                  }))
                }
                className={cn(
                  "px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors",
                  itemCreateForm.recurrence_days.length === 7
                    ? "bg-primary text-white border-primary"
                    : "bg-card text-text-secondary border-border hover:border-primary",
                )}
              >
                All
              </button>
              {DAY_LABELS.map((day: string, idx: number) => (
                <button
                  key={day}
                  type="button"
                  onClick={() =>
                    setItemCreateForm((prev: ItemFormData) => ({
                      ...prev,
                      recurrence_days: prev.recurrence_days.includes(idx)
                        ? prev.recurrence_days.filter((d: number) => d !== idx)
                        : [...prev.recurrence_days, idx].sort(),
                    }))
                  }
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors",
                    itemCreateForm.recurrence_days.includes(idx)
                      ? "bg-primary text-white border-primary"
                      : "bg-card text-text-secondary border-border hover:border-primary",
                  )}
                >
                  {day}
                </button>
              ))}
            </div>
            <p className="text-xs text-text-muted mt-1.5">
              {itemCreateForm.recurrence_days.length === 0 || itemCreateForm.recurrence_days.length === 7
                ? "Daily (every day)"
                : `${itemCreateForm.recurrence_days.map((d: number) => DAY_LABELS[d]).join(", ")} only`}
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-secondary mb-2">
              Verification Type
            </label>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hasVerificationType(itemCreateForm.verification_type, "photo")}
                  onChange={() =>
                    setItemCreateForm((prev: ItemFormData) => ({
                      ...prev,
                      verification_type: toggleVerificationType(prev.verification_type, "photo"),
                    }))
                  }
                  className="rounded border-default"
                />
                <span className="text-sm">Photo</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hasVerificationType(itemCreateForm.verification_type, "text")}
                  onChange={() =>
                    setItemCreateForm((prev: ItemFormData) => ({
                      ...prev,
                      verification_type: toggleVerificationType(prev.verification_type, "text"),
                    }))
                  }
                  className="rounded border-default"
                />
                <span className="text-sm">Text</span>
              </label>
              <span className="text-xs text-tertiary ml-2">
                {itemCreateForm.verification_type === "none"
                  ? "No verification"
                  : itemCreateForm.verification_type}
              </span>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="secondary"
              onClick={() => {
                setIsItemCreateOpen(false);
                setItemCreateForm(INITIAL_ITEM_FORM);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleCreateItem}
              isLoading={createItem.isPending}
              disabled={!itemCreateForm.title.trim()}
            >
              Add Item
            </Button>
          </div>
        </div>
      </Modal>

      {/* Edit Item Modal */}
      <Modal
        isOpen={isItemEditOpen}
        onClose={() => {
          setIsItemEditOpen(false);
          setEditingItemId(null);
          setItemEditForm(INITIAL_ITEM_FORM);
        }}
        title="Edit Checklist Item"
      >
        <div className="space-y-4">
          <Input
            label="Item Title"
            placeholder="e.g. Clean the counter"
            value={itemEditForm.title}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setItemEditForm((prev: ItemFormData) => ({
                ...prev,
                title: e.target.value,
              }))
            }
          />
          <Input
            label="Description (optional)"
            placeholder="Additional instructions..."
            value={itemEditForm.description}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setItemEditForm((prev: ItemFormData) => ({
                ...prev,
                description: e.target.value,
              }))
            }
          />
          <div>
            <label className="block text-sm font-medium text-text-secondary mb-1.5">
              Recurrence
            </label>
            <p className="text-xs text-text-muted mb-2">
              No selection = every day. Select specific days to limit.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() =>
                  setItemEditForm((prev: ItemFormData) => ({
                    ...prev,
                    recurrence_days: prev.recurrence_days.length === 7 ? [] : [0, 1, 2, 3, 4, 5, 6],
                  }))
                }
                className={cn(
                  "px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors",
                  itemEditForm.recurrence_days.length === 7
                    ? "bg-primary text-white border-primary"
                    : "bg-card text-text-secondary border-border hover:border-primary",
                )}
              >
                All
              </button>
              {DAY_LABELS.map((day: string, idx: number) => (
                <button
                  key={day}
                  type="button"
                  onClick={() =>
                    setItemEditForm((prev: ItemFormData) => ({
                      ...prev,
                      recurrence_days: prev.recurrence_days.includes(idx)
                        ? prev.recurrence_days.filter((d: number) => d !== idx)
                        : [...prev.recurrence_days, idx].sort(),
                    }))
                  }
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors",
                    itemEditForm.recurrence_days.includes(idx)
                      ? "bg-primary text-white border-primary"
                      : "bg-card text-text-secondary border-border hover:border-primary",
                  )}
                >
                  {day}
                </button>
              ))}
            </div>
            <p className="text-xs text-text-muted mt-1.5">
              {itemEditForm.recurrence_days.length === 0 || itemEditForm.recurrence_days.length === 7
                ? "Daily (every day)"
                : `${itemEditForm.recurrence_days.map((d: number) => DAY_LABELS[d]).join(", ")} only`}
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-secondary mb-2">
              Verification Type
            </label>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hasVerificationType(itemEditForm.verification_type, "photo")}
                  onChange={() =>
                    setItemEditForm((prev: ItemFormData) => ({
                      ...prev,
                      verification_type: toggleVerificationType(prev.verification_type, "photo"),
                    }))
                  }
                  className="rounded border-default"
                />
                <span className="text-sm">Photo</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hasVerificationType(itemEditForm.verification_type, "text")}
                  onChange={() =>
                    setItemEditForm((prev: ItemFormData) => ({
                      ...prev,
                      verification_type: toggleVerificationType(prev.verification_type, "text"),
                    }))
                  }
                  className="rounded border-default"
                />
                <span className="text-sm">Text</span>
              </label>
              <span className="text-xs text-tertiary ml-2">
                {itemEditForm.verification_type === "none"
                  ? "No verification"
                  : itemEditForm.verification_type}
              </span>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="secondary"
              onClick={() => {
                setIsItemEditOpen(false);
                setEditingItemId(null);
                setItemEditForm(INITIAL_ITEM_FORM);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleUpdateItem}
              isLoading={updateItem.isPending}
              disabled={!itemEditForm.title.trim()}
            >
              Save Changes
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Item Dialog */}
      <ConfirmDialog
        isOpen={isItemDeleteOpen}
        onClose={() => {
          setIsItemDeleteOpen(false);
          setDeletingItemId(null);
          setDeletingItemTitle("");
        }}
        onConfirm={handleDeleteItem}
        title="Delete Checklist Item"
        message={`Are you sure you want to delete "${deletingItemTitle}"?`}
        confirmLabel="Delete"
        isLoading={deleteItem.isPending}
      />

      {/* Excel Import Modal */}
      <Modal
        isOpen={isImportOpen}
        onClose={() => {
          setIsImportOpen(false);
          setImportFile(null);
          setImportResult(null);
          setIsDragOver(false);
        }}
        title="Import Checklists from Excel"
        size="lg"
      >
        <div className="space-y-4">
          {!importResult ? (
            <>
              <div className="flex items-center gap-2 mb-2">
                <button
                  type="button"
                  onClick={handleDownloadSample}
                  className="flex items-center gap-1.5 text-sm text-primary hover:text-primary-hover transition-colors"
                >
                  <Download className="h-4 w-4" />
                  Download sample template
                </button>
              </div>

              <div
                className={cn(
                  "border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all",
                  isDragOver
                    ? "border-primary bg-primary/5 scale-[1.01]"
                    : importFile
                      ? "border-success bg-success/5"
                      : "border-border hover:border-primary"
                )}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                {importFile ? (
                  <div className="flex items-center justify-center gap-3">
                    <FileSpreadsheet className="h-8 w-8 text-success flex-shrink-0" />
                    <div className="text-left">
                      <p className="text-sm text-text font-medium">{importFile.name}</p>
                      <p className="text-xs text-text-muted">{formatFileSize(importFile.size)}</p>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setImportFile(null);
                      }}
                      className="p-1 rounded-full hover:bg-surface transition-colors"
                    >
                      <X className="h-4 w-4 text-text-muted" />
                    </button>
                  </div>
                ) : (
                  <>
                    <Upload className={cn("h-8 w-8 mx-auto mb-2", isDragOver ? "text-primary" : "text-text-muted")} />
                    <p className={cn("text-sm", isDragOver ? "text-primary font-medium" : "text-text-muted")}>
                      {isDragOver ? "Drop .xlsx file here" : "Drag & drop or click to select an .xlsx file"}
                    </p>
                  </>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx"
                  className="hidden"
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                    const file = e.target.files?.[0] ?? null;
                    setImportFile(file);
                    e.target.value = "";
                  }}
                />
              </div>

              <Select
                label="Duplicate Handling"
                value={duplicateAction}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  setDuplicateAction(e.target.value as "skip" | "overwrite" | "append")
                }
                options={[
                  { value: "skip", label: "Skip (keep existing)" },
                  { value: "overwrite", label: "Overwrite (replace items)" },
                  { value: "append", label: "Append (add after existing)" },
                ]}
              />

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setIsImportOpen(false);
                    setImportFile(null);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  onClick={handleImport}
                  isLoading={importTemplates.isPending}
                  disabled={!importFile}
                >
                  <Upload className="h-4 w-4" />
                  Import
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-text">Import Results</h3>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-surface rounded-lg p-3">
                    <p className="text-2xl font-bold text-primary">{importResult.created_templates}</p>
                    <p className="text-xs text-text-muted">Templates Created</p>
                  </div>
                  <div className="bg-surface rounded-lg p-3">
                    <p className="text-2xl font-bold text-primary">{importResult.created_items}</p>
                    <p className="text-xs text-text-muted">Items Created</p>
                  </div>
                  {importResult.created_stores > 0 && (
                    <div className="bg-surface rounded-lg p-3">
                      <p className="text-2xl font-bold text-success">{importResult.created_stores}</p>
                      <p className="text-xs text-text-muted">Stores Created</p>
                    </div>
                  )}
                  {importResult.created_shifts > 0 && (
                    <div className="bg-surface rounded-lg p-3">
                      <p className="text-2xl font-bold text-success">{importResult.created_shifts}</p>
                      <p className="text-xs text-text-muted">Shifts Created</p>
                    </div>
                  )}
                  {importResult.created_positions > 0 && (
                    <div className="bg-surface rounded-lg p-3">
                      <p className="text-2xl font-bold text-success">{importResult.created_positions}</p>
                      <p className="text-xs text-text-muted">Positions Created</p>
                    </div>
                  )}
                  {importResult.skipped_templates > 0 && (
                    <div className="bg-surface rounded-lg p-3">
                      <p className="text-2xl font-bold text-warning">{importResult.skipped_templates}</p>
                      <p className="text-xs text-text-muted">Skipped (duplicate)</p>
                    </div>
                  )}
                  {importResult.updated_templates > 0 && (
                    <div className="bg-surface rounded-lg p-3">
                      <p className="text-2xl font-bold text-accent">{importResult.updated_templates}</p>
                      <p className="text-xs text-text-muted">Templates Updated</p>
                    </div>
                  )}
                </div>

                {importResult.errors.length > 0 && (
                  <div className="mt-3">
                    <p className="text-sm font-medium text-danger mb-1">
                      Errors ({importResult.errors.length})
                    </p>
                    <div className="max-h-32 overflow-y-auto bg-surface rounded-lg p-2 space-y-1">
                      {importResult.errors.map((err: string, idx: number) => (
                        <p key={idx} className="text-xs text-danger">{err}</p>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end pt-2">
                <Button
                  variant="primary"
                  onClick={() => {
                    setIsImportOpen(false);
                    setImportFile(null);
                    setImportResult(null);
                  }}
                >
                  Done
                </Button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}
