"use client";

/**
 * 매장 상세 페이지 -- 매장 정보, 근무 시간대, 포지션, 체크리스트를 관리합니다.
 * 탭 구조: Shifts | Positions | Checklists
 *
 * Store Detail Page -- Manages store info, shifts, positions, and checklists.
 * Tab structure: Shifts | Positions | Checklists
 */

import React, { useState, useMemo, useCallback, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { useUrlParams } from "@/hooks/useUrlParams";
import {
  ChevronLeft,
  Plus,
  Edit,
  Trash2,
  ChevronRight,
  Clock,
  Globe,
  Settings,
  Scale,
} from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useStore, useUpdateStore } from "@/hooks/useStores";
import {
  useShifts,
  useCreateShift,
  useUpdateShift,
  useDeleteShift,
} from "@/hooks/useShifts";
import {
  usePositions,
  useCreatePosition,
  useUpdatePosition,
  useDeletePosition,
} from "@/hooks/usePositions";
import {
  useChecklistTemplates,
  useChecklistItems,
  useCreateChecklistTemplate,
  useUpdateChecklistTemplate,
  useDeleteChecklistTemplate,
  useCreateChecklistItem,
  useUpdateChecklistItem,
  useDeleteChecklistItem,
} from "@/hooks/useChecklists";
import {
  useShiftPresets,
  useCreateShiftPreset,
  useUpdateShiftPreset,
  useDeleteShiftPreset,
} from "@/hooks/useShiftPresets";
import { useLaborLaw, useUpsertLaborLaw } from "@/hooks/useLaborLaw";
import { useWorkRoles } from "@/hooks/useWorkRoles";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  Badge,
  Modal,
  Select,
  ConfirmDialog,
} from "@/components/ui";
import { SortableList } from "@/components/ui/SortableList";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useToast } from "@/components/ui/Toast";
import { cn, parseApiError } from "@/lib/utils";
import { TIMEZONE_OPTIONS } from "@/lib/timezones";
import { usePermissions } from "@/hooks/usePermissions";
import { PERMISSIONS } from "@/lib/permissions";
import type {
  Shift,
  Position,
  ChecklistTemplate,
  ChecklistItem,
  ShiftPreset,
  WorkRole,
} from "@/types";

/* -------------------------------------------------------------------------- */
/*  Type Definitions                                                          */
/* -------------------------------------------------------------------------- */

/** 탭 이름 타입 / Tab name type */
type TabName = "shifts-positions" | "checklists" | "settings";

/** 시프트/포지션 폼 데이터 / Shift/Position form data */
interface ShiftPositionFormData {
  name: string;
}

/** 체크리스트 템플릿 폼 데이터 / Checklist template form data */
interface TemplateFormData {
  title: string;
  shift_id: string;
  position_id: string;
}

/** 체크리스트 아이템 폼 데이터 / Checklist item form data */
interface ItemFormData {
  title: string;
  description: string;
  verification_type: string;
}

/** 시프트 프리셋 폼 데이터 / Shift preset form data */
interface PresetFormData {
  name: string;
  shift_id: string;
  start_time: string;
  end_time: string;
}

/** 노동법 설정 폼 데이터 / Labor law settings form data */
interface LaborLawFormData {
  federal_max_weekly: number;
  state_max_weekly: string;
  store_max_weekly: string;
  overtime_threshold_daily: string;
}

/* -------------------------------------------------------------------------- */
/*  Constants                                                                 */
/* -------------------------------------------------------------------------- */

const INITIAL_SHIFT_FORM: ShiftPositionFormData = { name: "" };
const INITIAL_TEMPLATE_FORM: TemplateFormData = {
  title: "",
  shift_id: "",
  position_id: "",
};
const INITIAL_ITEM_FORM: ItemFormData = {
  title: "",
  description: "",
  verification_type: "none",
};
const INITIAL_PRESET_FORM: PresetFormData = {
  name: "",
  shift_id: "",
  start_time: "",
  end_time: "",
};
const INITIAL_LABOR_FORM: LaborLawFormData = {
  federal_max_weekly: 40,
  state_max_weekly: "",
  store_max_weekly: "",
  overtime_threshold_daily: "",
};

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

const TAB_OPTIONS: { value: TabName; label: string }[] = [
  { value: "shifts-positions", label: "Shifts & Positions" },
  // Work Roles moved to /schedules/settings
  { value: "checklists", label: "Checklists" },
  { value: "settings", label: "Settings" },
];

/* -------------------------------------------------------------------------- */
/*  Main Component                                                            */
/* -------------------------------------------------------------------------- */

export default function StoreDetailPage(): React.ReactElement {
  const router = useRouter();
  const params = useParams();
  const storeId: string = params.id as string;
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { hasPermission } = usePermissions();
  const canManageStoreConfig = hasPermission(PERMISSIONS.STORES_UPDATE);
  const canCreateStoreConfig = hasPermission(PERMISSIONS.STORES_CREATE);
  const canManageChecklists = hasPermission(PERMISSIONS.CHECKLISTS_CREATE);
  const canUpdateSettings = hasPermission(PERMISSIONS.STORES_UPDATE);

  /** 현재 활성 탭 (URL-persisted) / Currently active tab */
  const [urlParams, setUrlParams] = useUrlParams({ tab: "shifts-positions" });
  const activeTab: TabName = (["shifts-positions", "checklists", "settings"] as TabName[]).includes(urlParams.tab as TabName)
    ? (urlParams.tab as TabName)
    : "shifts-positions";
  const setActiveTab = useCallback((tab: TabName) => setUrlParams({ tab }), [setUrlParams]);

  /* ---- Data hooks -------------------------------------------------------- */
  const { data: store, isLoading: storeLoading } = useStore(storeId);
  const { data: shifts, isLoading: shiftsLoading } = useShifts(storeId);
  const { data: positions, isLoading: positionsLoading } =
    usePositions(storeId);
  const { data: templates, isLoading: templatesLoading } =
    useChecklistTemplates(storeId);
  const { data: workRoles, isLoading: workRolesLoading } = useWorkRoles(storeId);

  /* ---- Shift CRUD -------------------------------------------------------- */
  const createShift = useCreateShift();
  const updateShift = useUpdateShift();
  const deleteShift = useDeleteShift();

  const [isShiftCreateOpen, setIsShiftCreateOpen] = useState<boolean>(false);
  const [shiftCreateForm, setShiftCreateForm] =
    useState<ShiftPositionFormData>(INITIAL_SHIFT_FORM);
  const [isShiftEditOpen, setIsShiftEditOpen] = useState<boolean>(false);
  const [shiftEditForm, setShiftEditForm] =
    useState<ShiftPositionFormData>(INITIAL_SHIFT_FORM);
  const [editingShiftId, setEditingShiftId] = useState<string | null>(null);
  const [isShiftDeleteOpen, setIsShiftDeleteOpen] = useState<boolean>(false);
  const [deletingShiftId, setDeletingShiftId] = useState<string | null>(null);
  const [deletingShiftName, setDeletingShiftName] = useState<string>("");

  /* ---- Position CRUD ----------------------------------------------------- */
  const createPosition = useCreatePosition();
  const updatePosition = useUpdatePosition();
  const deletePosition = useDeletePosition();

  const [isPosCreateOpen, setIsPosCreateOpen] = useState<boolean>(false);
  const [posCreateForm, setPosCreateForm] =
    useState<ShiftPositionFormData>(INITIAL_SHIFT_FORM);
  const [isPosEditOpen, setIsPosEditOpen] = useState<boolean>(false);
  const [posEditForm, setPosEditForm] =
    useState<ShiftPositionFormData>(INITIAL_SHIFT_FORM);
  const [editingPosId, setEditingPosId] = useState<string | null>(null);
  const [isPosDeleteOpen, setIsPosDeleteOpen] = useState<boolean>(false);
  const [deletingPosId, setDeletingPosId] = useState<string | null>(null);
  const [deletingPosName, setDeletingPosName] = useState<string>("");

  /* ---- Checklist Template CRUD ------------------------------------------- */
  const createTemplate = useCreateChecklistTemplate();
  const updateTemplate = useUpdateChecklistTemplate();
  const deleteTemplate = useDeleteChecklistTemplate();

  const [isTemplateCreateOpen, setIsTemplateCreateOpen] =
    useState<boolean>(false);
  const [templateCreateForm, setTemplateCreateForm] =
    useState<TemplateFormData>(INITIAL_TEMPLATE_FORM);
  const [isTemplateEditOpen, setIsTemplateEditOpen] =
    useState<boolean>(false);
  const [templateEditForm, setTemplateEditForm] =
    useState<TemplateFormData>(INITIAL_TEMPLATE_FORM);
  const [editingTemplateId, setEditingTemplateId] = useState<string | null>(
    null,
  );
  const [isTemplateDeleteOpen, setIsTemplateDeleteOpen] =
    useState<boolean>(false);
  const [deletingTemplateId, setDeletingTemplateId] = useState<string | null>(
    null,
  );
  const [deletingTemplateName, setDeletingTemplateName] =
    useState<string>("");

  /** 체크리스트 필터 상태 / Checklist filter state */
  const [filterShiftId, setFilterShiftId] = useState<string>("");
  const [filterPositionId, setFilterPositionId] = useState<string>("");

  /** 펼쳐진 템플릿 (아이템 보기) / Expanded template for viewing items */
  const [expandedTemplateId, setExpandedTemplateId] = useState<string | null>(
    null,
  );

  /* ---- Checklist Item CRUD ----------------------------------------------- */
  const createItem = useCreateChecklistItem();
  const updateItem = useUpdateChecklistItem();
  const deleteItem = useDeleteChecklistItem();

  const { data: checklistItems, isLoading: itemsLoading } = useChecklistItems(
    expandedTemplateId || "",
  );

  const [isItemCreateOpen, setIsItemCreateOpen] = useState<boolean>(false);
  const [itemCreateForm, setItemCreateForm] =
    useState<ItemFormData>(INITIAL_ITEM_FORM);
  const [isItemEditOpen, setIsItemEditOpen] = useState<boolean>(false);
  const [itemEditForm, setItemEditForm] =
    useState<ItemFormData>(INITIAL_ITEM_FORM);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [isItemDeleteOpen, setIsItemDeleteOpen] = useState<boolean>(false);
  const [deletingItemId, setDeletingItemId] = useState<string | null>(null);
  const [deletingItemTitle, setDeletingItemTitle] = useState<string>("");

  /* ---- Settings: Store Update -------------------------------------------- */
  const updateStore = useUpdateStore();
  const [maxWorkHoursWeekly, setMaxWorkHoursWeekly] = useState<string>("");
  const [storeTimezone, setStoreTimezone] = useState<string>("");
  const [storeDefaultHourlyRate, setStoreDefaultHourlyRate] = useState<string>("");

  /* ---- Settings: Shift Presets ------------------------------------------- */
  const { data: shiftPresets, isLoading: presetsLoading } = useShiftPresets(storeId);
  const createPreset = useCreateShiftPreset();
  const updatePreset = useUpdateShiftPreset();
  const deletePreset = useDeleteShiftPreset();

  const [isPresetCreateOpen, setIsPresetCreateOpen] = useState<boolean>(false);
  const [presetCreateForm, setPresetCreateForm] = useState<PresetFormData>(INITIAL_PRESET_FORM);
  const [isPresetDeleteOpen, setIsPresetDeleteOpen] = useState<boolean>(false);
  const [deletingPresetId, setDeletingPresetId] = useState<string | null>(null);
  const [deletingPresetName, setDeletingPresetName] = useState<string>("");

  /* ---- Settings: Labor Law ----------------------------------------------- */
  const { data: laborLaw, isLoading: laborLawLoading } = useLaborLaw(storeId);
  const upsertLaborLaw = useUpsertLaborLaw();
  const [laborForm, setLaborForm] = useState<LaborLawFormData>(INITIAL_LABOR_FORM);

  /** 매장 데이터가 로드되면 설정 동기화 / Sync settings when store data loads */
  useEffect(() => {
    if (store) {
      setMaxWorkHoursWeekly(store.max_work_hours_weekly?.toString() ?? "");
      setStoreTimezone(store.timezone ?? "");
      setStoreDefaultHourlyRate(store.default_hourly_rate != null ? String(store.default_hourly_rate) : "");
    }
  }, [store]);

  /** 노동법 데이터 로드 시 폼 동기화 / Sync labor form when data loads */
  useEffect(() => {
    if (laborLaw) {
      setLaborForm({
        federal_max_weekly: laborLaw.federal_max_weekly,
        state_max_weekly: laborLaw.state_max_weekly?.toString() ?? "",
        store_max_weekly: laborLaw.store_max_weekly?.toString() ?? "",
        overtime_threshold_daily: laborLaw.overtime_threshold_daily?.toString() ?? "",
      });
    }
  }, [laborLaw]);

  const presetList: ShiftPreset[] = useMemo(
    () => (Array.isArray(shiftPresets) ? shiftPresets : []),
    [shiftPresets],
  );

  /* ---- Derived data ------------------------------------------------------ */

  const shiftList: Shift[] = useMemo(
    () => (Array.isArray(shifts) ? shifts : []),
    [shifts],
  );
  const positionList: Position[] = useMemo(
    () => (Array.isArray(positions) ? positions : []),
    [positions],
  );
  const templateList: ChecklistTemplate[] = useMemo(
    () => (Array.isArray(templates) ? templates : []),
    [templates],
  );
  const itemList: ChecklistItem[] = useMemo(
    () => (Array.isArray(checklistItems) ? checklistItems : []),
    [checklistItems],
  );

  /** 필터링된 체크리스트 템플릿 / Filtered checklist templates */
  const filteredTemplates: ChecklistTemplate[] = useMemo(() => {
    let result: ChecklistTemplate[] = templateList;
    if (filterShiftId) {
      result = result.filter(
        (t: ChecklistTemplate) => t.shift_id === filterShiftId,
      );
    }
    if (filterPositionId) {
      result = result.filter(
        (t: ChecklistTemplate) => t.position_id === filterPositionId,
      );
    }
    return result;
  }, [templateList, filterShiftId, filterPositionId]);

  /** 시프트 이름 조회 / Look up shift name by ID */
  const getShiftName = useCallback(
    (shiftId: string): string => {
      const shift: Shift | undefined = shiftList.find(
        (s: Shift) => s.id === shiftId,
      );
      return shift ? shift.name : "-";
    },
    [shiftList],
  );

  /** 포지션 이름 조회 / Look up position name by ID */
  const getPositionName = useCallback(
    (positionId: string): string => {
      const position: Position | undefined = positionList.find(
        (p: Position) => p.id === positionId,
      );
      return position ? position.name : "-";
    },
    [positionList],
  );

  /* ======================================================================== */
  /*  Shift Handlers                                                          */
  /* ======================================================================== */

  const handleCreateShift = useCallback(async (): Promise<void> => {
    if (!shiftCreateForm.name.trim()) return;
    const nextOrder: number =
      shiftList.length > 0
        ? Math.max(...shiftList.map((s: Shift) => s.sort_order)) + 1
        : 1;
    try {
      await createShift.mutateAsync({
        storeId: storeId,
        name: shiftCreateForm.name.trim(),
        sort_order: nextOrder,
      });
      toast({ type: "success", message: "Shift created successfully!" });
      setIsShiftCreateOpen(false);
      setShiftCreateForm(INITIAL_SHIFT_FORM);
    } catch (err) {
      toast({ type: "error", message: parseApiError(err, "Failed to create shift.") });
    }
  }, [shiftCreateForm, createShift, storeId, toast, shiftList]);

  const handleOpenShiftEdit = useCallback(
    (shift: Shift, e: React.MouseEvent): void => {
      e.stopPropagation();
      setEditingShiftId(shift.id);
      setShiftEditForm({ name: shift.name });
      setIsShiftEditOpen(true);
    },
    [],
  );

  const handleUpdateShift = useCallback(async (): Promise<void> => {
    if (!editingShiftId || !shiftEditForm.name.trim()) return;
    try {
      await updateShift.mutateAsync({
        storeId: storeId,
        id: editingShiftId,
        name: shiftEditForm.name.trim(),
      });
      toast({ type: "success", message: "Shift updated successfully!" });
      setIsShiftEditOpen(false);
      setEditingShiftId(null);
      setShiftEditForm(INITIAL_SHIFT_FORM);
    } catch (err) {
      toast({ type: "error", message: parseApiError(err, "Failed to update shift.") });
    }
  }, [editingShiftId, shiftEditForm, updateShift, storeId, toast]);

  /** 시프트 드래그앤드롭 정렬 / Shift drag-and-drop reorder */
  const handleReorderShifts = useCallback(
    async (reordered: Shift[]): Promise<void> => {
      try {
        await Promise.all(
          reordered.map((shift: Shift) =>
            updateShift.mutateAsync({
              storeId: storeId,
              id: shift.id,
              sort_order: shift.sort_order,
            }),
          ),
        );
        queryClient.invalidateQueries({ queryKey: ["shifts", storeId] });
      } catch (err) {
        toast({ type: "error", message: parseApiError(err, "Failed to reorder shifts.") });
        queryClient.invalidateQueries({ queryKey: ["shifts", storeId] });
      }
    },
    [updateShift, storeId, queryClient, toast],
  );

  const handleOpenShiftDelete = useCallback(
    (shift: Shift, e: React.MouseEvent): void => {
      e.stopPropagation();
      setDeletingShiftId(shift.id);
      setDeletingShiftName(shift.name);
      setIsShiftDeleteOpen(true);
    },
    [],
  );

  const handleDeleteShift = useCallback(async (): Promise<void> => {
    if (!deletingShiftId) return;
    try {
      await deleteShift.mutateAsync({ storeId: storeId, id: deletingShiftId });
      toast({ type: "success", message: "Shift deleted successfully!" });
      setIsShiftDeleteOpen(false);
      setDeletingShiftId(null);
      setDeletingShiftName("");
    } catch (err) {
      toast({ type: "error", message: parseApiError(err, "Failed to delete shift.") });
    }
  }, [deletingShiftId, deleteShift, storeId, toast]);

  /* ======================================================================== */
  /*  Position Handlers                                                       */
  /* ======================================================================== */

  const handleCreatePosition = useCallback(async (): Promise<void> => {
    if (!posCreateForm.name.trim()) return;
    const nextOrder: number =
      positionList.length > 0
        ? Math.max(...positionList.map((p: Position) => p.sort_order)) + 1
        : 1;
    try {
      await createPosition.mutateAsync({
        storeId: storeId,
        name: posCreateForm.name.trim(),
        sort_order: nextOrder,
      });
      toast({ type: "success", message: "Position created successfully!" });
      setIsPosCreateOpen(false);
      setPosCreateForm(INITIAL_SHIFT_FORM);
    } catch (err) {
      toast({ type: "error", message: parseApiError(err, "Failed to create position.") });
    }
  }, [posCreateForm, createPosition, storeId, toast, positionList]);

  const handleOpenPosEdit = useCallback(
    (position: Position, e: React.MouseEvent): void => {
      e.stopPropagation();
      setEditingPosId(position.id);
      setPosEditForm({ name: position.name });
      setIsPosEditOpen(true);
    },
    [],
  );

  const handleUpdatePosition = useCallback(async (): Promise<void> => {
    if (!editingPosId || !posEditForm.name.trim()) return;
    try {
      await updatePosition.mutateAsync({
        storeId: storeId,
        id: editingPosId,
        name: posEditForm.name.trim(),
      });
      toast({ type: "success", message: "Position updated successfully!" });
      setIsPosEditOpen(false);
      setEditingPosId(null);
      setPosEditForm(INITIAL_SHIFT_FORM);
    } catch (err) {
      toast({ type: "error", message: parseApiError(err, "Failed to update position.") });
    }
  }, [editingPosId, posEditForm, updatePosition, storeId, toast]);

  /** 포지션 드래그앤드롭 정렬 / Position drag-and-drop reorder */
  const handleReorderPositions = useCallback(
    async (reordered: Position[]): Promise<void> => {
      try {
        await Promise.all(
          reordered.map((position: Position) =>
            updatePosition.mutateAsync({
              storeId: storeId,
              id: position.id,
              sort_order: position.sort_order,
            }),
          ),
        );
        queryClient.invalidateQueries({ queryKey: ["positions", storeId] });
      } catch (err) {
        toast({ type: "error", message: parseApiError(err, "Failed to reorder positions.") });
        queryClient.invalidateQueries({ queryKey: ["positions", storeId] });
      }
    },
    [updatePosition, storeId, queryClient, toast],
  );

  const handleOpenPosDelete = useCallback(
    (position: Position, e: React.MouseEvent): void => {
      e.stopPropagation();
      setDeletingPosId(position.id);
      setDeletingPosName(position.name);
      setIsPosDeleteOpen(true);
    },
    [],
  );

  const handleDeletePosition = useCallback(async (): Promise<void> => {
    if (!deletingPosId) return;
    try {
      await deletePosition.mutateAsync({ storeId: storeId, id: deletingPosId });
      toast({ type: "success", message: "Position deleted successfully!" });
      setIsPosDeleteOpen(false);
      setDeletingPosId(null);
      setDeletingPosName("");
    } catch (err) {
      toast({ type: "error", message: parseApiError(err, "Failed to delete position.") });
    }
  }, [deletingPosId, deletePosition, storeId, toast]);

  /* ======================================================================== */
  /*  Checklist Template Handlers                                             */
  /* ======================================================================== */

  const handleCreateTemplate = useCallback(async (): Promise<void> => {
    if (
      !templateCreateForm.title.trim() ||
      !templateCreateForm.shift_id ||
      !templateCreateForm.position_id
    )
      return;
    try {
      await createTemplate.mutateAsync({
        storeId: storeId,
        title: templateCreateForm.title.trim(),
        shift_id: templateCreateForm.shift_id,
        position_id: templateCreateForm.position_id,
      });
      toast({ type: "success", message: "Checklist template created!" });
      setIsTemplateCreateOpen(false);
      setTemplateCreateForm(INITIAL_TEMPLATE_FORM);
    } catch (err) {
      toast({ type: "error", message: parseApiError(err, "Failed to create checklist template.") });
    }
  }, [templateCreateForm, createTemplate, storeId, toast]);

  const handleOpenTemplateEdit = useCallback(
    (template: ChecklistTemplate, e: React.MouseEvent): void => {
      e.stopPropagation();
      setEditingTemplateId(template.id);
      setTemplateEditForm({
        title: template.title,
        shift_id: template.shift_id,
        position_id: template.position_id,
      });
      setIsTemplateEditOpen(true);
    },
    [],
  );

  const handleUpdateTemplate = useCallback(async (): Promise<void> => {
    if (!editingTemplateId || !templateEditForm.title.trim()) return;
    try {
      await updateTemplate.mutateAsync({
        id: editingTemplateId,
        title: templateEditForm.title.trim(),
        shift_id: templateEditForm.shift_id,
        position_id: templateEditForm.position_id,
      });
      toast({ type: "success", message: "Checklist template updated!" });
      setIsTemplateEditOpen(false);
      setEditingTemplateId(null);
      setTemplateEditForm(INITIAL_TEMPLATE_FORM);
    } catch (err) {
      toast({ type: "error", message: parseApiError(err, "Failed to update checklist template.") });
    }
  }, [editingTemplateId, templateEditForm, updateTemplate, toast]);

  const handleOpenTemplateDelete = useCallback(
    (template: ChecklistTemplate, e: React.MouseEvent): void => {
      e.stopPropagation();
      setDeletingTemplateId(template.id);
      setDeletingTemplateName(template.title);
      setIsTemplateDeleteOpen(true);
    },
    [],
  );

  const handleDeleteTemplate = useCallback(async (): Promise<void> => {
    if (!deletingTemplateId) return;
    try {
      await deleteTemplate.mutateAsync(deletingTemplateId);
      toast({ type: "success", message: "Checklist template deleted!" });
      setIsTemplateDeleteOpen(false);
      setDeletingTemplateId(null);
      setDeletingTemplateName("");
      if (expandedTemplateId === deletingTemplateId) {
        setExpandedTemplateId(null);
      }
    } catch (err) {
      toast({ type: "error", message: parseApiError(err, "Failed to delete checklist template.") });
    }
  }, [deletingTemplateId, deleteTemplate, expandedTemplateId, toast]);

  /** 템플릿 펼치기/접기 토글 / Toggle template expansion */
  const toggleTemplateExpand = useCallback(
    (templateId: string): void => {
      setExpandedTemplateId((prev: string | null) =>
        prev === templateId ? null : templateId,
      );
    },
    [],
  );

  /* ======================================================================== */
  /*  Checklist Item Handlers                                                 */
  /* ======================================================================== */

  const handleCreateItem = useCallback(async (): Promise<void> => {
    if (!expandedTemplateId || !itemCreateForm.title.trim()) return;
    const nextOrder: number =
      itemList.length > 0
        ? Math.max(...itemList.map((i: ChecklistItem) => i.sort_order)) + 1
        : 1;
    try {
      await createItem.mutateAsync({
        templateId: expandedTemplateId,
        title: itemCreateForm.title.trim(),
        description: itemCreateForm.description.trim() || undefined,
        verification_type: itemCreateForm.verification_type,
        sort_order: nextOrder,
      });
      toast({ type: "success", message: "Checklist item created!" });
      setIsItemCreateOpen(false);
      setItemCreateForm(INITIAL_ITEM_FORM);
    } catch (err) {
      toast({ type: "error", message: parseApiError(err, "Failed to create checklist item.") });
    }
  }, [expandedTemplateId, itemCreateForm, createItem, toast, itemList]);

  const handleOpenItemEdit = useCallback(
    (item: ChecklistItem, e: React.MouseEvent): void => {
      e.stopPropagation();
      setEditingItemId(item.id);
      setItemEditForm({
        title: item.title,
        description: item.description || "",
        verification_type: item.verification_type,
      });
      setIsItemEditOpen(true);
    },
    [],
  );

  const handleUpdateItem = useCallback(async (): Promise<void> => {
    if (!editingItemId || !itemEditForm.title.trim()) return;
    try {
      await updateItem.mutateAsync({
        id: editingItemId,
        templateId: expandedTemplateId || "",
        title: itemEditForm.title.trim(),
        description: itemEditForm.description.trim() || undefined,
        verification_type: itemEditForm.verification_type,
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

  /** 체크리스트 아이템 드래그앤드롭 정렬 / Checklist item drag-and-drop reorder */
  const handleReorderItems = useCallback(
    async (reordered: ChecklistItem[]): Promise<void> => {
      if (!expandedTemplateId) return;
      try {
        await Promise.all(
          reordered.map((item: ChecklistItem) =>
            updateItem.mutateAsync({
              id: item.id,
              templateId: expandedTemplateId,
              sort_order: item.sort_order,
            }),
          ),
        );
        queryClient.invalidateQueries({
          queryKey: ["checklistItems", expandedTemplateId],
        });
      } catch (err) {
        toast({ type: "error", message: parseApiError(err, "Failed to reorder items.") });
        queryClient.invalidateQueries({
          queryKey: ["checklistItems", expandedTemplateId],
        });
      }
    },
    [updateItem, expandedTemplateId, queryClient, toast],
  );

  /** sort_order 기준 정렬된 체크리스트 아이템 / Checklist items sorted by sort_order */
  const sortedItems: ChecklistItem[] = useMemo(
    () =>
      [...itemList].sort(
        (a: ChecklistItem, b: ChecklistItem) => a.sort_order - b.sort_order,
      ),
    [itemList],
  );

  /** 체크리스트 아이템 커스텀 렌더 / Checklist item custom content renderer */
  const renderItemContent = useCallback(
    (item: ChecklistItem, index: number): React.ReactNode => (
      <div>
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
    ),
    [],
  );

  /** 체크리스트 아이템 추가 UI (verification badge) */
  const renderItemExtra = useCallback(
    (item: ChecklistItem): React.ReactNode =>
      item.verification_type !== "none" ? (
        <span className="flex gap-1">
          {item.verification_type.split(",").map((vt: string) => (
            <Badge key={vt} variant="warning">
              {vt}
            </Badge>
          ))}
        </span>
      ) : null,
    [],
  );

  /** sort_order 기준 정렬된 시프트 / Shifts sorted by sort_order */
  const sortedShifts: Shift[] = useMemo(
    () => [...shiftList].sort((a: Shift, b: Shift) => a.sort_order - b.sort_order),
    [shiftList],
  );

  /** sort_order 기준 정렬된 포지션 / Positions sorted by sort_order */
  const sortedPositions: Position[] = useMemo(
    () => [...positionList].sort((a: Position, b: Position) => a.sort_order - b.sort_order),
    [positionList],
  );

  /* ======================================================================== */
  /*  Settings Handlers                                                       */
  /* ======================================================================== */

  /** 최대 주간 근무시간 저장 / Save max work hours weekly */
  const handleSaveMaxWorkHours = useCallback(async (): Promise<void> => {
    const val = maxWorkHoursWeekly.trim() === "" ? null : Number(maxWorkHoursWeekly);
    if (val !== null && (isNaN(val) || val <= 0)) {
      toast({ type: "error", message: "Please enter a valid number." });
      return;
    }
    try {
      await updateStore.mutateAsync({ id: storeId, max_work_hours_weekly: val });
      toast({ type: "success", message: "Max work hours updated!" });
    } catch (err) {
      toast({ type: "error", message: parseApiError(err, "Failed to update max work hours.") });
    }
  }, [maxWorkHoursWeekly, updateStore, storeId, toast]);

  /** 매장 타임존 저장 / Save store timezone */
  const handleSaveTimezone = useCallback(async (): Promise<void> => {
    try {
      await updateStore.mutateAsync({ id: storeId, timezone: storeTimezone || null });
      toast({ type: "success", message: "Timezone updated!" });
    } catch (err) {
      toast({ type: "error", message: parseApiError(err, "Failed to update timezone.") });
    }
  }, [storeTimezone, updateStore, storeId, toast]);

  /** 매장 기본 시급 저장 / Save store default hourly rate */
  const handleSaveDefaultHourlyRate = useCallback(async (): Promise<void> => {
    const rateStr = storeDefaultHourlyRate.trim();
    const val = rateStr === "" ? null : Number(rateStr);
    if (val !== null && (isNaN(val) || val < 0)) {
      toast({ type: "error", message: "Please enter a valid hourly rate." });
      return;
    }
    try {
      await updateStore.mutateAsync({ id: storeId, default_hourly_rate: val });
      toast({ type: "success", message: "Default hourly rate updated!" });
    } catch (err) {
      toast({ type: "error", message: parseApiError(err, "Failed to update hourly rate.") });
    }
  }, [storeDefaultHourlyRate, updateStore, storeId, toast]);

  /** 시프트 프리셋 생성 / Create shift preset */
  const handleCreatePreset = useCallback(async (): Promise<void> => {
    if (!presetCreateForm.name.trim() || !presetCreateForm.shift_id || !presetCreateForm.start_time || !presetCreateForm.end_time) return;
    try {
      await createPreset.mutateAsync({
        storeId,
        shift_id: presetCreateForm.shift_id,
        name: presetCreateForm.name.trim(),
        start_time: presetCreateForm.start_time,
        end_time: presetCreateForm.end_time,
      });
      toast({ type: "success", message: "Shift preset created!" });
      setIsPresetCreateOpen(false);
      setPresetCreateForm(INITIAL_PRESET_FORM);
    } catch (err) {
      toast({ type: "error", message: parseApiError(err, "Failed to create shift preset.") });
    }
  }, [presetCreateForm, createPreset, storeId, toast]);

  /** 시프트 프리셋 활성/비활성 토글 / Toggle shift preset active status */
  const handleTogglePresetActive = useCallback(
    async (preset: ShiftPreset): Promise<void> => {
      try {
        await updatePreset.mutateAsync({
          id: preset.id,
          storeId,
          is_active: !preset.is_active,
        });
        toast({ type: "success", message: `Preset ${preset.is_active ? "deactivated" : "activated"}!` });
      } catch (err) {
        toast({ type: "error", message: parseApiError(err, "Failed to update preset.") });
      }
    },
    [updatePreset, storeId, toast],
  );

  /** 시프트 프리셋 삭제 확인 열기 / Open preset delete confirmation */
  const handleOpenPresetDelete = useCallback(
    (preset: ShiftPreset): void => {
      setDeletingPresetId(preset.id);
      setDeletingPresetName(preset.name);
      setIsPresetDeleteOpen(true);
    },
    [],
  );

  /** 시프트 프리셋 삭제 / Delete shift preset */
  const handleDeletePreset = useCallback(async (): Promise<void> => {
    if (!deletingPresetId) return;
    try {
      await deletePreset.mutateAsync({ id: deletingPresetId, storeId });
      toast({ type: "success", message: "Shift preset deleted!" });
      setIsPresetDeleteOpen(false);
      setDeletingPresetId(null);
      setDeletingPresetName("");
    } catch (err) {
      toast({ type: "error", message: parseApiError(err, "Failed to delete shift preset.") });
    }
  }, [deletingPresetId, deletePreset, storeId, toast]);

  /** 노동법 설정 저장 / Save labor law settings */
  const handleSaveLaborLaw = useCallback(async (): Promise<void> => {
    try {
      await upsertLaborLaw.mutateAsync({
        storeId,
        federal_max_weekly: laborForm.federal_max_weekly,
        state_max_weekly: laborForm.state_max_weekly ? Number(laborForm.state_max_weekly) : null,
        store_max_weekly: laborForm.store_max_weekly ? Number(laborForm.store_max_weekly) : null,
        overtime_threshold_daily: laborForm.overtime_threshold_daily ? Number(laborForm.overtime_threshold_daily) : null,
      });
      toast({ type: "success", message: "Labor law settings saved!" });
    } catch (err) {
      toast({ type: "error", message: parseApiError(err, "Failed to save labor law settings.") });
    }
  }, [laborForm, upsertLaborLaw, storeId, toast]);

  /* ======================================================================== */
  /*  Loading State                                                           */
  /* ======================================================================== */

  if (storeLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!store) {
    return (
      <div className="text-center py-12">
        <p className="text-text-secondary">Store not found.</p>
        <Button
          variant="ghost"
          className="mt-4"
          onClick={() => router.push("/stores")}
        >
          <ChevronLeft className="h-4 w-4" />
          Back to Stores
        </Button>
      </div>
    );
  }

  /* ======================================================================== */
  /*  Render                                                                  */
  /* ======================================================================== */

  return (
    <div>
      {/* Back Navigation */}
      <button
        type="button"
        onClick={() => router.push("/stores")}
        className="flex items-center gap-1 text-sm text-text-secondary hover:text-text transition-colors mb-4"
      >
        <ChevronLeft className="h-4 w-4" />
        Back to Stores
      </button>

      {/* Store Header */}
      <div className="bg-card border border-border rounded-xl p-6 mb-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2 flex-wrap">
              <h1 className="text-xl md:text-2xl font-extrabold text-text">
                {store.name}
              </h1>
              <Badge variant={store.is_active ? "success" : "danger"}>
                {store.is_active ? "Active" : "Inactive"}
              </Badge>
            </div>
            {store.address && (
              <p className="text-sm text-text-secondary">{store.address}</p>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-border overflow-x-auto">
        {TAB_OPTIONS.map((tab: { value: TabName; label: string }) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setActiveTab(tab.value)}
            className={cn(
              "px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px",
              activeTab === tab.value
                ? "text-accent border-accent"
                : "text-text-secondary border-transparent hover:text-text hover:border-border",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ================================================================== */}
      {/*  Shifts & Positions Tab (2-split view)                             */}
      {/* ================================================================== */}
      {activeTab === "shifts-positions" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* ---- Left: Shifts ---- */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-text">Shifts</h2>
              {canManageStoreConfig && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    if (!canCreateStoreConfig) {
                      toast({ type: "info", message: "Only the Owner can create shifts. Please contact your Owner." });
                      return;
                    }
                    setIsShiftCreateOpen(true);
                  }}
                >
                  <Plus className="h-4 w-4" />
                  Add Shift
                </Button>
              )}
            </div>

            <SortableList<Shift>
              items={sortedShifts}
              isLoading={shiftsLoading}
              emptyMessage="No shifts yet. Add a shift to get started."
              onReorder={canManageStoreConfig ? handleReorderShifts : undefined}
              onEdit={canManageStoreConfig ? handleOpenShiftEdit : undefined}
              onDelete={canManageStoreConfig ? handleOpenShiftDelete : undefined}
            />
          </div>

          {/* ---- Right: Positions ---- */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-text">Positions</h2>
              {canManageStoreConfig && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    if (!canCreateStoreConfig) {
                      toast({ type: "info", message: "Only the Owner can create positions. Please contact your Owner." });
                      return;
                    }
                    setIsPosCreateOpen(true);
                  }}
                >
                  <Plus className="h-4 w-4" />
                  Add Position
                </Button>
              )}
            </div>

            <SortableList<Position>
              items={sortedPositions}
              isLoading={positionsLoading}
              emptyMessage="No positions yet. Add a position to get started."
              onReorder={canManageStoreConfig ? handleReorderPositions : undefined}
              onEdit={canManageStoreConfig ? handleOpenPosEdit : undefined}
              onDelete={canManageStoreConfig ? handleOpenPosDelete : undefined}
            />
          </div>

          {/* Create Shift Modal */}
          <Modal
            isOpen={isShiftCreateOpen}
            onClose={() => {
              setIsShiftCreateOpen(false);
              setShiftCreateForm(INITIAL_SHIFT_FORM);
            }}
            title="Create Shift"
          >
            <div className="space-y-4">
              <Input
                label="Shift Name"
                placeholder="e.g. Morning, Afternoon, Night"
                value={shiftCreateForm.name}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setShiftCreateForm((prev: ShiftPositionFormData) => ({
                    ...prev,
                    name: e.target.value,
                  }))
                }
              />
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setIsShiftCreateOpen(false);
                    setShiftCreateForm(INITIAL_SHIFT_FORM);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  onClick={handleCreateShift}
                  isLoading={createShift.isPending}
                  disabled={!shiftCreateForm.name.trim()}
                >
                  Create
                </Button>
              </div>
            </div>
          </Modal>

          {/* Edit Shift Modal */}
          <Modal
            isOpen={isShiftEditOpen}
            onClose={() => {
              setIsShiftEditOpen(false);
              setEditingShiftId(null);
              setShiftEditForm(INITIAL_SHIFT_FORM);
            }}
            title="Edit Shift"
          >
            <div className="space-y-4">
              <Input
                label="Shift Name"
                placeholder="e.g. Morning, Afternoon, Night"
                value={shiftEditForm.name}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setShiftEditForm((prev: ShiftPositionFormData) => ({
                    ...prev,
                    name: e.target.value,
                  }))
                }
              />
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setIsShiftEditOpen(false);
                    setEditingShiftId(null);
                    setShiftEditForm(INITIAL_SHIFT_FORM);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  onClick={handleUpdateShift}
                  isLoading={updateShift.isPending}
                  disabled={!shiftEditForm.name.trim()}
                >
                  Save Changes
                </Button>
              </div>
            </div>
          </Modal>

          {/* Delete Shift Dialog */}
          <ConfirmDialog
            isOpen={isShiftDeleteOpen}
            onClose={() => {
              setIsShiftDeleteOpen(false);
              setDeletingShiftId(null);
              setDeletingShiftName("");
            }}
            onConfirm={handleDeleteShift}
            title="Delete Shift"
            message={`Are you sure you want to delete "${deletingShiftName}"? This action cannot be undone.`}
            confirmLabel="Delete"
            isLoading={deleteShift.isPending}
          />

          {/* Create Position Modal */}
          <Modal
            isOpen={isPosCreateOpen}
            onClose={() => {
              setIsPosCreateOpen(false);
              setPosCreateForm(INITIAL_SHIFT_FORM);
            }}
            title="Create Position"
          >
            <div className="space-y-4">
              <Input
                label="Position Name"
                placeholder="e.g. Barista, Manager, Cashier"
                value={posCreateForm.name}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setPosCreateForm((prev: ShiftPositionFormData) => ({
                    ...prev,
                    name: e.target.value,
                  }))
                }
              />
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setIsPosCreateOpen(false);
                    setPosCreateForm(INITIAL_SHIFT_FORM);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  onClick={handleCreatePosition}
                  isLoading={createPosition.isPending}
                  disabled={!posCreateForm.name.trim()}
                >
                  Create
                </Button>
              </div>
            </div>
          </Modal>

          {/* Edit Position Modal */}
          <Modal
            isOpen={isPosEditOpen}
            onClose={() => {
              setIsPosEditOpen(false);
              setEditingPosId(null);
              setPosEditForm(INITIAL_SHIFT_FORM);
            }}
            title="Edit Position"
          >
            <div className="space-y-4">
              <Input
                label="Position Name"
                placeholder="e.g. Barista, Manager, Cashier"
                value={posEditForm.name}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setPosEditForm((prev: ShiftPositionFormData) => ({
                    ...prev,
                    name: e.target.value,
                  }))
                }
              />
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setIsPosEditOpen(false);
                    setEditingPosId(null);
                    setPosEditForm(INITIAL_SHIFT_FORM);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  onClick={handleUpdatePosition}
                  isLoading={updatePosition.isPending}
                  disabled={!posEditForm.name.trim()}
                >
                  Save Changes
                </Button>
              </div>
            </div>
          </Modal>

          {/* Delete Position Dialog */}
          <ConfirmDialog
            isOpen={isPosDeleteOpen}
            onClose={() => {
              setIsPosDeleteOpen(false);
              setDeletingPosId(null);
              setDeletingPosName("");
            }}
            onConfirm={handleDeletePosition}
            title="Delete Position"
            message={`Are you sure you want to delete "${deletingPosName}"? This action cannot be undone.`}
            confirmLabel="Delete"
            isLoading={deletePosition.isPending}
          />
        </div>
      )}

      {/* Work Roles tab moved to /schedules/settings */}

      {/* ================================================================== */}
      {/*  Checklists Tab                                                    */}
      {/* ================================================================== */}
      {activeTab === "checklists" && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-text">
              Checklist Templates
            </h2>
            {canManageChecklists && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => setIsTemplateCreateOpen(true)}
              >
                <Plus className="h-4 w-4" />
                Add Template
              </Button>
            )}
          </div>

          {/* Filters */}
          <div className="flex gap-3 mb-4">
            <div className="w-48">
              <Select
                value={filterShiftId}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  setFilterShiftId(e.target.value)
                }
                label="Filter by Shift"
                options={[
                  { value: "", label: "All Shifts" },
                  ...shiftList.map((shift: Shift) => ({
                    value: shift.id,
                    label: shift.name,
                  })),
                ]}
              />
            </div>
            <div className="w-48">
              <Select
                value={filterPositionId}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  setFilterPositionId(e.target.value)
                }
                label="Filter by Position"
                options={[
                  { value: "", label: "All Positions" },
                  ...positionList.map((position: Position) => ({
                    value: position.id,
                    label: position.name,
                  })),
                ]}
              />
            </div>
          </div>

          {/* Templates List */}
          {templatesLoading ? (
            <div className="flex items-center justify-center h-32">
              <LoadingSpinner size="md" />
            </div>
          ) : filteredTemplates.length === 0 ? (
            <div className="bg-card border border-border rounded-xl p-8 text-center">
              <p className="text-sm text-text-muted">
                No checklist templates found. Create one to get started.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredTemplates.map((template: ChecklistTemplate) => (
                <div
                  key={template.id}
                  className="bg-card border border-border rounded-xl overflow-hidden"
                >
                  {/* Template Header Row */}
                  <div
                    className="flex items-center justify-between px-5 py-4 hover:bg-surface-hover transition-colors cursor-pointer"
                    onClick={() => toggleTemplateExpand(template.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e: React.KeyboardEvent) => {
                      if (e.key === "Enter" || e.key === " ") {
                        toggleTemplateExpand(template.id);
                      }
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
                            {template.shift_name || getShiftName(template.shift_id)}
                          </Badge>
                          <Badge variant="default">
                            {template.position_name || getPositionName(template.position_id)}
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
                          onClick={(e: React.MouseEvent) =>
                            handleOpenTemplateEdit(template, e)
                          }
                          className="p-1.5 rounded-md text-text-muted hover:text-text hover:bg-surface-hover transition-colors"
                          aria-label={`Edit ${template.title}`}
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={(e: React.MouseEvent) =>
                            handleOpenTemplateDelete(template, e)
                          }
                          className="p-1.5 rounded-md text-text-muted hover:text-danger hover:bg-danger-muted transition-colors"
                          aria-label={`Delete ${template.title}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Expanded Items Section */}
                  {expandedTemplateId === template.id && (
                    <div className="border-t border-border bg-surface px-5 py-4">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-semibold text-text-secondary">
                          Checklist Items
                        </h3>
                        {canManageChecklists && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setIsItemCreateOpen(true)}
                          >
                            <Plus className="h-3.5 w-3.5" />
                            Add Item
                          </Button>
                        )}
                      </div>

                      <SortableList<ChecklistItem>
                        items={sortedItems}
                        isLoading={itemsLoading}
                        emptyMessage="No items yet. Add items to this checklist."
                        onReorder={canManageChecklists ? handleReorderItems : undefined}
                        onEdit={canManageChecklists ? handleOpenItemEdit : undefined}
                        onDelete={canManageChecklists ? handleOpenItemDelete : undefined}
                        renderContent={renderItemContent}
                        renderExtra={renderItemExtra}
                        compact
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Create Template Modal */}
          <Modal
            isOpen={isTemplateCreateOpen}
            onClose={() => {
              setIsTemplateCreateOpen(false);
              setTemplateCreateForm(INITIAL_TEMPLATE_FORM);
            }}
            title="Create Checklist Template"
          >
            <div className="space-y-4">
              <Input
                label="Template Title"
                placeholder="e.g. Opening Checklist"
                value={templateCreateForm.title}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setTemplateCreateForm((prev: TemplateFormData) => ({
                    ...prev,
                    title: e.target.value,
                  }))
                }
              />
              <Select
                label="Shift"
                value={templateCreateForm.shift_id}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  setTemplateCreateForm((prev: TemplateFormData) => ({
                    ...prev,
                    shift_id: e.target.value,
                  }))
                }
                options={[
                  { value: "", label: "Select a shift" },
                  ...shiftList.map((shift: Shift) => ({
                    value: shift.id,
                    label: shift.name,
                  })),
                ]}
              />
              <Select
                label="Position"
                value={templateCreateForm.position_id}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  setTemplateCreateForm((prev: TemplateFormData) => ({
                    ...prev,
                    position_id: e.target.value,
                  }))
                }
                options={[
                  { value: "", label: "Select a position" },
                  ...positionList.map((position: Position) => ({
                    value: position.id,
                    label: position.name,
                  })),
                ]}
              />
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setIsTemplateCreateOpen(false);
                    setTemplateCreateForm(INITIAL_TEMPLATE_FORM);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  onClick={handleCreateTemplate}
                  isLoading={createTemplate.isPending}
                  disabled={
                    !templateCreateForm.title.trim() ||
                    !templateCreateForm.shift_id ||
                    !templateCreateForm.position_id
                  }
                >
                  Create
                </Button>
              </div>
            </div>
          </Modal>

          {/* Edit Template Modal */}
          <Modal
            isOpen={isTemplateEditOpen}
            onClose={() => {
              setIsTemplateEditOpen(false);
              setEditingTemplateId(null);
              setTemplateEditForm(INITIAL_TEMPLATE_FORM);
            }}
            title="Edit Checklist Template"
          >
            <div className="space-y-4">
              <Input
                label="Template Title"
                placeholder="e.g. Opening Checklist"
                value={templateEditForm.title}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setTemplateEditForm((prev: TemplateFormData) => ({
                    ...prev,
                    title: e.target.value,
                  }))
                }
              />
              <Select
                label="Shift"
                value={templateEditForm.shift_id}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  setTemplateEditForm((prev: TemplateFormData) => ({
                    ...prev,
                    shift_id: e.target.value,
                  }))
                }
                options={[
                  { value: "", label: "Select a shift" },
                  ...shiftList.map((shift: Shift) => ({
                    value: shift.id,
                    label: shift.name,
                  })),
                ]}
              />
              <Select
                label="Position"
                value={templateEditForm.position_id}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  setTemplateEditForm((prev: TemplateFormData) => ({
                    ...prev,
                    position_id: e.target.value,
                  }))
                }
                options={[
                  { value: "", label: "Select a position" },
                  ...positionList.map((position: Position) => ({
                    value: position.id,
                    label: position.name,
                  })),
                ]}
              />
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setIsTemplateEditOpen(false);
                    setEditingTemplateId(null);
                    setTemplateEditForm(INITIAL_TEMPLATE_FORM);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  onClick={handleUpdateTemplate}
                  isLoading={updateTemplate.isPending}
                  disabled={!templateEditForm.title.trim()}
                >
                  Save Changes
                </Button>
              </div>
            </div>
          </Modal>

          {/* Delete Template Dialog */}
          <ConfirmDialog
            isOpen={isTemplateDeleteOpen}
            onClose={() => {
              setIsTemplateDeleteOpen(false);
              setDeletingTemplateId(null);
              setDeletingTemplateName("");
            }}
            onConfirm={handleDeleteTemplate}
            title="Delete Checklist Template"
            message={`Are you sure you want to delete "${deletingTemplateName}"? All items within this template will also be deleted.`}
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
        </div>
      )}

      {/* ================================================================== */}
      {/*  Settings Tab                                                      */}
      {/* ================================================================== */}
      {activeTab === "settings" && (
        <div className="space-y-8">
          {/* ---- Section 1: Operating Hours ---- */}
          <div className="bg-card border border-border rounded-xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <Clock className="h-5 w-5 text-accent" />
              <h2 className="text-lg font-bold text-text">Operating Hours</h2>
            </div>
            <div className="max-w-sm space-y-4">
              <Input
                label="Max Work Hours (Weekly)"
                type="number"
                placeholder="e.g. 40"
                value={maxWorkHoursWeekly}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setMaxWorkHoursWeekly(e.target.value)
                }
              />
              <div className="flex justify-end">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleSaveMaxWorkHours}
                  isLoading={updateStore.isPending}
                  disabled={!canUpdateSettings}
                >
                  Save
                </Button>
              </div>
            </div>
          </div>

          {/* ---- Section 2: Default Hourly Rate ---- */}
          <div className="bg-card border border-border rounded-xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <Scale className="h-5 w-5 text-accent" />
              <h2 className="text-lg font-bold text-text">Default Hourly Rate</h2>
            </div>
            <div className="max-w-sm space-y-4">
              <Input
                label="Default Hourly Rate ($/hr)"
                type="number"
                min="0"
                step="0.01"
                placeholder="e.g. 15.00 — leave blank to use org default"
                value={storeDefaultHourlyRate}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setStoreDefaultHourlyRate(e.target.value)
                }
                disabled={!canUpdateSettings}
              />
              <div className="flex justify-end">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleSaveDefaultHourlyRate}
                  isLoading={updateStore.isPending}
                  disabled={!canUpdateSettings}
                >
                  Save
                </Button>
              </div>
            </div>
          </div>

          {/* ---- Section 3: Timezone ---- */}
          <div className="bg-card border border-border rounded-xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <Globe className="h-5 w-5 text-accent" />
              <h2 className="text-lg font-bold text-text">Timezone</h2>
            </div>
            <div className="max-w-sm space-y-4">
              <Select
                label="Store Timezone"
                placeholder="Use Organization Default"
                options={TIMEZONE_OPTIONS}
                value={storeTimezone}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  setStoreTimezone(e.target.value)
                }
                disabled={!canUpdateSettings}
              />
              <div className="flex justify-end">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleSaveTimezone}
                  isLoading={updateStore.isPending}
                  disabled={!canUpdateSettings}
                >
                  Save
                </Button>
              </div>
            </div>
          </div>

          {/* ---- Section 3: Shift Presets ---- */}
          <div className="bg-card border border-border rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Settings className="h-5 w-5 text-accent" />
                <h2 className="text-lg font-bold text-text">Shift Presets</h2>
              </div>
              {canUpdateSettings && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => setIsPresetCreateOpen(true)}
                >
                  <Plus className="h-4 w-4" />
                  Add Preset
                </Button>
              )}
            </div>

            {presetsLoading ? (
              <div className="flex items-center justify-center h-24">
                <LoadingSpinner size="md" />
              </div>
            ) : presetList.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-sm text-text-muted">
                  No shift presets yet. Add one to get started.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {presetList.map((preset: ShiftPreset) => (
                  <div
                    key={preset.id}
                    className="bg-surface border border-border rounded-lg p-4 flex flex-col gap-2"
                  >
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-text text-sm">
                        {preset.name}
                      </p>
                      <Badge variant={preset.is_active ? "success" : "danger"}>
                        {preset.is_active ? "Active" : "Inactive"}
                      </Badge>
                    </div>
                    <p className="text-xs text-text-secondary">
                      Shift: {getShiftName(preset.shift_id)}
                    </p>
                    <p className="text-xs text-text-muted">
                      {preset.start_time} - {preset.end_time}
                    </p>
                    {canUpdateSettings && (
                      <div className="flex items-center gap-2 mt-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleTogglePresetActive(preset)}
                          isLoading={updatePreset.isPending}
                        >
                          {preset.is_active ? "Deactivate" : "Activate"}
                        </Button>
                        <Button
                          variant="danger"
                          size="sm"
                          onClick={() => handleOpenPresetDelete(preset)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ---- Section 3: Labor Law Settings ---- */}
          <div className="bg-card border border-border rounded-xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <Scale className="h-5 w-5 text-accent" />
              <h2 className="text-lg font-bold text-text">
                Labor Law Settings
              </h2>
            </div>

            {laborLawLoading ? (
              <div className="flex items-center justify-center h-24">
                <LoadingSpinner size="md" />
              </div>
            ) : (
              <div className="max-w-md space-y-4">
                <Input
                  label="Federal Max Weekly Hours"
                  type="number"
                  placeholder="40"
                  value={laborForm.federal_max_weekly.toString()}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setLaborForm((prev: LaborLawFormData) => ({
                      ...prev,
                      federal_max_weekly: Number(e.target.value) || 0,
                    }))
                  }
                />
                <Input
                  label="State Max Weekly Hours"
                  type="number"
                  placeholder="Optional"
                  value={laborForm.state_max_weekly}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setLaborForm((prev: LaborLawFormData) => ({
                      ...prev,
                      state_max_weekly: e.target.value,
                    }))
                  }
                />
                <Input
                  label="Store Max Weekly Hours"
                  type="number"
                  placeholder="Optional"
                  value={laborForm.store_max_weekly}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setLaborForm((prev: LaborLawFormData) => ({
                      ...prev,
                      store_max_weekly: e.target.value,
                    }))
                  }
                />
                <Input
                  label="Overtime Threshold (Daily Hours)"
                  type="number"
                  placeholder="Optional"
                  value={laborForm.overtime_threshold_daily}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setLaborForm((prev: LaborLawFormData) => ({
                      ...prev,
                      overtime_threshold_daily: e.target.value,
                    }))
                  }
                />
                <div className="flex justify-end pt-2">
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={handleSaveLaborLaw}
                    isLoading={upsertLaborLaw.isPending}
                    disabled={!canUpdateSettings}
                  >
                    Save Settings
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Create Shift Preset Modal */}
          <Modal
            isOpen={isPresetCreateOpen}
            onClose={() => {
              setIsPresetCreateOpen(false);
              setPresetCreateForm(INITIAL_PRESET_FORM);
            }}
            title="Create Shift Preset"
          >
            <div className="space-y-4">
              <Input
                label="Preset Name"
                placeholder="e.g. Morning Standard"
                value={presetCreateForm.name}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setPresetCreateForm((prev: PresetFormData) => ({
                    ...prev,
                    name: e.target.value,
                  }))
                }
              />
              <Select
                label="Shift"
                value={presetCreateForm.shift_id}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  setPresetCreateForm((prev: PresetFormData) => ({
                    ...prev,
                    shift_id: e.target.value,
                  }))
                }
                options={[
                  { value: "", label: "Select a shift" },
                  ...shiftList.map((shift: Shift) => ({
                    value: shift.id,
                    label: shift.name,
                  })),
                ]}
              />
              <Input
                label="Start Time"
                type="time"
                value={presetCreateForm.start_time}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setPresetCreateForm((prev: PresetFormData) => ({
                    ...prev,
                    start_time: e.target.value,
                  }))
                }
              />
              <Input
                label="End Time"
                type="time"
                value={presetCreateForm.end_time}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setPresetCreateForm((prev: PresetFormData) => ({
                    ...prev,
                    end_time: e.target.value,
                  }))
                }
              />
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setIsPresetCreateOpen(false);
                    setPresetCreateForm(INITIAL_PRESET_FORM);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  onClick={handleCreatePreset}
                  isLoading={createPreset.isPending}
                  disabled={
                    !presetCreateForm.name.trim() ||
                    !presetCreateForm.shift_id ||
                    !presetCreateForm.start_time ||
                    !presetCreateForm.end_time
                  }
                >
                  Create
                </Button>
              </div>
            </div>
          </Modal>

          {/* Delete Preset Dialog */}
          <ConfirmDialog
            isOpen={isPresetDeleteOpen}
            onClose={() => {
              setIsPresetDeleteOpen(false);
              setDeletingPresetId(null);
              setDeletingPresetName("");
            }}
            onConfirm={handleDeletePreset}
            title="Delete Shift Preset"
            message={`Are you sure you want to delete "${deletingPresetName}"? This action cannot be undone.`}
            confirmLabel="Delete"
            isLoading={deletePreset.isPending}
          />
        </div>
      )}
    </div>
  );
}
