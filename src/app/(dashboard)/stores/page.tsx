"use client";

/**
 * 매장 목록 페이지 -- 매장 CRUD 관리 페이지입니다.
 * 검색, 생성, 수정, 삭제 기능을 제공합니다.
 *
 * Stores List Page -- Full store management page with CRUD operations.
 * Provides search, create, edit, and delete functionality.
 */

import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { usePersistedFilters } from "@/hooks/usePersistedFilters";
import { Plus, Search, Edit, Trash2, X, GripVertical, Layers } from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useStores, useCreateStore, useUpdateStore, useDeleteStore, useReorderStores } from "@/hooks/useStores";
import {
  useStoreGroups,
  useCreateStoreGroup,
  useUpdateStoreGroup,
  useDeleteStoreGroup,
  useReorderStoreGroups,
} from "@/hooks/useStoreGroups";
import { useCreateShift } from "@/hooks/useShifts";
import { useCreatePosition } from "@/hooks/usePositions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Table, Badge, Modal } from "@/components/ui";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useModal } from "@/components/ui/imperative-modal";
import { formatDate, parseApiError } from "@/lib/utils";
import { previewStoreCode } from "@/lib/storeCode";
import { useTimezone } from "@/hooks/useTimezone";
import { TIMEZONE_OPTIONS } from "@/lib/timezones";
import { usePermissions } from "@/hooks/usePermissions";
import { PERMISSIONS } from "@/lib/permissions";
import type { Store, StoreGroup, StoreStatus } from "@/types";
import { STORE_STATUS_OPTIONS } from "@/types";

/** status → Badge variant 매핑 / Store status → badge variant */
const STATUS_BADGE: Record<StoreStatus, { variant: "success" | "warning" | "danger" | "default"; label: string }> = {
  open: { variant: "success", label: "Open" },
  preparing: { variant: "warning", label: "Preparing" },
  paused: { variant: "default", label: "Paused" },
  closed: { variant: "danger", label: "Closed" },
};

/** 폼 내 드래그 가능한 아이템 / Draggable item in form */
interface FormItem {
  id: string;
  name: string;
}

/** 매장 폼 데이터 인터페이스 / Store form data interface */
interface StoreFormData {
  name: string;
  code: string;
  address: string;
  phone: string;
  email: string;
  status: StoreStatus;
  timezone: string;
  /** 소속 그룹 ID ("" = None) / Group id, empty string = none */
  groupId: string;
  /** EMPID 시작 번호 입력값 ("" = null) / Number range start input, empty = null */
  numberRangeStart: string;
  shifts: FormItem[];
  positions: FormItem[];
}

/** 테이블 컬럼 타입 / Table column type */
interface Column<T> {
  key: string;
  header: string;
  render?: (item: T) => React.ReactNode;
  className?: string;
  hideOnMobile?: boolean;
}

/** 초기 폼 상태 / Initial form state */
const INITIAL_FORM: StoreFormData = {
  name: "",
  code: "",
  address: "",
  phone: "",
  email: "",
  status: "open",
  timezone: "",
  groupId: "",
  numberRangeStart: "",
  shifts: [],
  positions: [],
};

/** numbering 모드 라벨 / Numbering mode labels */
const NUMBERING_MODE_LABEL: Record<StoreGroup["numbering_mode"], string> = {
  group: "Shared numbering",
  store: "Per-store numbering",
};

/** 빈 값/비정상 입력 → null, 1 이상 정수만 유효 / Parse range-start input ("" = null, server ge=1) */
function parseRangeStart(value: string): number | null {
  const parsed: number = parseInt(value.trim(), 10);
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : null;
}

/** 그룹 섹션 (마지막은 Ungrouped) / One rendered store section (last = Ungrouped) */
interface StoreSection {
  groupId: string | null;
  name: string;
  group: StoreGroup | null;
  stores: Store[];
}

/** EMPID 중복 경고 문구 / Duplicate-EMPID warning copy */
function duplicateEmpidMessage(count: number): string {
  return `${count} duplicate EMPIDs in this group's shared numbering scope — resolve them in Users → Bulk Edit → EMPID Import.`;
}

/** 드래그 가능한 문자열 행 컴포넌트 / Draggable string row component */
function DraggableStringRow({
  id,
  name,
  index,
  onRemove,
}: {
  id: string;
  name: string;
  index: number;
  onRemove: () => void;
}): React.ReactElement {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface border border-border ${isDragging ? "opacity-50 shadow-lg z-10 relative" : ""}`}
    >
      <button
        type="button"
        className="cursor-grab active:cursor-grabbing text-text-muted hover:text-text transition-colors touch-none shrink-0"
        aria-label="Drag to reorder"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <span className="text-xs font-mono text-text-muted w-5">{index + 1}.</span>
      <span className="text-sm text-text flex-1">{name}</span>
      <button
        type="button"
        onClick={onRemove}
        className="p-0.5 text-text-muted hover:text-danger transition-colors"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/** 그룹 관리 모달의 드래그 가능한 그룹 행 / Sortable group row inside the Manage Groups modal */
function SortableGroupRow({
  group,
  onUpdate,
  onDelete,
}: {
  group: StoreGroup;
  /** 저장 시도 — 성공 여부 반환 (실패 시 로컬 값 복원용) / Attempt save, resolves success (false → revert local edit) */
  onUpdate: (data: {
    name?: string;
    numbering_mode?: "group" | "store";
    number_range_start?: number | null;
  }) => Promise<boolean>;
  onDelete: () => void;
}): React.ReactElement {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: group.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  /** 인라인 편집 로컬 상태 — 저장 성공 시 서버 값으로 재동기화 / Local inline-edit state, re-synced from server values */
  const [name, setName] = useState<string>(group.name);
  const [rangeStart, setRangeStart] = useState<string>(
    group.number_range_start != null ? String(group.number_range_start) : "",
  );
  useEffect(() => {
    setName(group.name);
  }, [group.name]);
  useEffect(() => {
    setRangeStart(group.number_range_start != null ? String(group.number_range_start) : "");
  }, [group.number_range_start]);

  /** 이름 커밋 (blur/Enter) — 저장 실패 시 서버 값 복원 / Commit name edit, revert on failed save */
  const commitName = (): void => {
    const trimmed: string = name.trim();
    if (!trimmed) {
      setName(group.name);
      return;
    }
    if (trimmed !== group.name) {
      void onUpdate({ name: trimmed }).then((ok) => {
        if (!ok) setName(group.name);
      });
    }
  };

  /** 시작 번호 커밋 (blur/Enter, 빈값 = null) — 저장 실패 시 서버 값 복원 / Commit range-start edit (empty = null), revert on failed save */
  const commitRangeStart = (): void => {
    const parsed: number | null = parseRangeStart(rangeStart);
    setRangeStart(parsed != null ? String(parsed) : "");
    if (parsed !== (group.number_range_start ?? null)) {
      void onUpdate({ number_range_start: parsed }).then((ok) => {
        if (!ok) setRangeStart(group.number_range_start != null ? String(group.number_range_start) : "");
      });
    }
  };

  const blurOnEnter = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.currentTarget.blur();
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rounded-lg bg-surface border border-border px-3 py-2 ${isDragging ? "opacity-50 shadow-lg z-10 relative" : ""}`}
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="cursor-grab active:cursor-grabbing text-text-muted hover:text-text transition-colors touch-none shrink-0"
          aria-label="Drag to reorder"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
        <input
          type="text"
          value={name}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
          onBlur={commitName}
          onKeyDown={blurOnEnter}
          aria-label={`Group name for ${group.name}`}
          className="flex-1 min-w-0 rounded-md border border-transparent bg-transparent px-2 py-1 text-sm text-text hover:border-border focus:border-accent focus:bg-surface focus:outline-none focus:ring-2 focus:ring-accent/50 transition-colors"
        />
        <span className="text-xs text-text-muted shrink-0">
          {group.store_count} {group.store_count === 1 ? "store" : "stores"}
        </span>
        <button
          type="button"
          onClick={onDelete}
          className="p-1.5 rounded-md text-text-muted hover:text-danger hover:bg-danger-muted transition-colors shrink-0"
          aria-label={`Delete group ${group.name}`}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 pl-7">
        <div className="inline-flex rounded-lg border border-border overflow-hidden">
          {(["group", "store"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => {
                if (group.numbering_mode !== mode) void onUpdate({ numbering_mode: mode });
              }}
              className={`px-2.5 py-1 text-xs transition-colors ${
                group.numbering_mode === mode
                  ? "bg-accent-muted text-accent font-medium"
                  : "text-text-muted hover:text-text hover:bg-surface-hover"
              }`}
            >
              {NUMBERING_MODE_LABEL[mode]}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-xs text-text-muted">
          Range start
          <input
            type="number"
            min={1}
            value={rangeStart}
            placeholder="Default"
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRangeStart(e.target.value)}
            onBlur={commitRangeStart}
            onKeyDown={blurOnEnter}
            aria-label={`Number range start for ${group.name}`}
            className="w-20 rounded-md border border-border bg-surface px-2 py-1 text-xs text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent"
          />
        </label>
      </div>
    </div>
  );
}

/** 그룹 관리 모달 — 목록 정렬/이름 수정/모드 토글/삭제/추가 / Manage Groups modal */
function ManageGroupsModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}): React.ReactElement {
  const modal = useModal();
  const { data: groups, isLoading } = useStoreGroups();
  // silent — 인라인 저장마다 결과 모달이 뜨지 않도록, 에러는 아래서 직접 표시 (handleCreate 패턴)
  const createGroup = useCreateStoreGroup({ silent: true });
  const updateGroup = useUpdateStoreGroup({ silent: true });
  const deleteGroup = useDeleteStoreGroup();
  const reorderGroups = useReorderStoreGroups();

  const [newName, setNewName] = useState<string>("");
  /** 그룹별 EMPID 중복 경고 (group.id 키) — 다른 그룹 저장에 덮이지 않음 / Per-group duplicate-EMPID warnings keyed by group id */
  const [dupWarnings, setDupWarnings] = useState<Record<string, { groupName: string; count: number }>>({});

  const groupList: StoreGroup[] = useMemo(
    () =>
      Array.isArray(groups) ? [...groups].sort((a, b) => a.sort_order - b.sort_order) : [],
    [groups],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  /** 그룹 드래그 정렬 / Group drag-and-drop reorder */
  const handleDragEnd = useCallback(
    (event: DragEndEvent): void => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      const ids: string[] = groupList.map((g) => g.id);
      const oldIndex: number = ids.indexOf(String(active.id));
      const newIndex: number = ids.indexOf(String(over.id));
      if (oldIndex === -1 || newIndex === -1) return;
      reorderGroups.mutate(arrayMove(ids, oldIndex, newIndex));
    },
    [groupList, reorderGroups],
  );

  /** 그룹 저장 — 해당 그룹의 EMPID 중복 경고만 갱신, 성공 여부 반환 / Save group, refresh only its warning, return success */
  const handleUpdate = useCallback(
    async (
      group: StoreGroup,
      data: {
        name?: string;
        numbering_mode?: "group" | "store";
        number_range_start?: number | null;
      },
    ): Promise<boolean> => {
      try {
        const updated = await updateGroup.mutateAsync({ id: group.id, ...data });
        setDupWarnings((prev) => {
          const next = { ...prev };
          if (updated.duplicate_empids.length > 0) {
            next[group.id] = { groupName: updated.name, count: updated.duplicate_empids.length };
          } else {
            delete next[group.id];
          }
          return next;
        });
        return true;
      } catch (err) {
        void modal.alert({ type: "error", message: parseApiError(err, "Couldn't update group") });
        return false;
      }
    },
    [updateGroup, modal],
  );

  /** 그룹 추가 / Add a new group */
  const handleAdd = useCallback(async (): Promise<void> => {
    const trimmed: string = newName.trim();
    if (!trimmed) return;
    try {
      await createGroup.mutateAsync({ name: trimmed });
      setNewName("");
    } catch (err) {
      void modal.alert({ type: "error", message: parseApiError(err, "Couldn't create group") });
    }
  }, [newName, createGroup, modal]);

  /** 그룹 삭제 — 매장은 Ungrouped 로 이동 / Delete group (stores become ungrouped) */
  const handleDelete = useCallback(
    async (group: StoreGroup): Promise<void> => {
      const ok = await modal.confirm({
        title: "Delete group",
        message:
          `Delete "${group.name}"? Its ${group.store_count} ${group.store_count === 1 ? "store" : "stores"} will move to Ungrouped. ` +
          `Stores themselves are not deleted.`,
        confirmLabel: "Delete",
        variant: "danger",
      });
      if (!ok) return;
      try {
        await deleteGroup.mutateAsync(group.id);
        // 사라진 그룹의 경고 제거 / Drop the deleted group's warning
        setDupWarnings((prev) => {
          const next = { ...prev };
          delete next[group.id];
          return next;
        });
      } catch {
        // hook 이 자동으로 에러 모달
      }
    },
    [modal, deleteGroup],
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Manage Groups"
      size="lg"
      closeOnBackdrop={false}
    >
      <div className="space-y-4">
        {Object.entries(dupWarnings).map(([groupId, warning]) => (
          <div
            key={groupId}
            className="rounded-lg border border-warning/40 bg-warning-muted px-3 py-2 text-xs text-text"
          >
            <span className="font-semibold">{warning.groupName}:</span>{" "}
            {duplicateEmpidMessage(warning.count)}
          </div>
        ))}
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <LoadingSpinner />
          </div>
        ) : groupList.length === 0 ? (
          <p className="py-4 text-center text-sm text-text-muted">
            No groups yet. Add one below to organize stores into sections.
          </p>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext
              items={groupList.map((g) => g.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-2">
                {groupList.map((group: StoreGroup) => (
                  <SortableGroupRow
                    key={group.id}
                    group={group}
                    onUpdate={(data) => handleUpdate(group, data)}
                    onDelete={() => void handleDelete(group)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="New group name"
            value={newName}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewName(e.target.value)}
            onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void handleAdd();
              }
            }}
            className="flex-1 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent"
          />
          <Button
            variant="secondary"
            size="sm"
            onClick={() => void handleAdd()}
            disabled={!newName.trim() || createGroup.isPending}
          >
            Add
          </Button>
        </div>
        <div className="flex justify-end pt-2">
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export default function StoresPage(): React.ReactElement {
  const router = useRouter();
  const modal = useModal();

  /** 권한 훅 / Permission hook */
  const { hasPermission } = usePermissions();
  const tz = useTimezone();
  const canWrite = hasPermission(PERMISSIONS.STORES_CREATE);

  /** 검색어 + 상태 필터 (URL-persisted) / Search + status filter state */
  const [urlParams, setUrlParams] = usePersistedFilters("stores", {
    search: "",
    status: "active", // active = closed 제외 전체 (기본). open/preparing/paused/closed = 해당만
  });
  const searchQuery = urlParams.search;
  const statusFilter = urlParams.status;
  const includeClosed = statusFilter === "closed";

  /** 매장 데이터 훅 / Store data hooks */
  const { data: stores, isLoading } = useStores({ includeClosed });
  const { data: groups } = useStoreGroups();
  const queryClient = useQueryClient();
  // 매장 생성/수정/삭제 — handleCreate 가 매장+shifts+positions chain 을 통합 결과 1번으로 표시하려고 silent 옵션 사용
  const createStore = useCreateStore({ silent: true });
  const updateStore = useUpdateStore();
  const deleteStore = useDeleteStore();
  const reorderStores = useReorderStores();
  const createShift = useCreateShift({ silent: true });
  const createPosition = useCreatePosition({ silent: true });

  /** 생성 모달 상태 / Create modal state */
  const [isCreateOpen, setIsCreateOpen] = useState<boolean>(false);
  const [createForm, setCreateForm] = useState<StoreFormData>(INITIAL_FORM);
  const [newShiftName, setNewShiftName] = useState<string>("");
  const [newPositionName, setNewPositionName] = useState<string>("");
  const [isCreating, setIsCreating] = useState<boolean>(false);

  /** 수정 모달 상태 / Edit modal state */
  const [isEditOpen, setIsEditOpen] = useState<boolean>(false);
  const [editForm, setEditForm] = useState<StoreFormData>(INITIAL_FORM);
  const [editingStoreId, setEditingStoreId] = useState<string | null>(null);

  /** 그룹 관리 모달 상태 / Manage Groups modal state */
  const [isGroupsOpen, setIsGroupsOpen] = useState<boolean>(false);

  /** 검색 + 상태로 필터링된 매장 목록 / Filtered stores by search + status */
  const filteredStores: Store[] = useMemo(() => {
    if (!Array.isArray(stores)) return [];
    let result = stores;
    // 상태 필터: active = closed 제외 전체, 그 외 = 해당 status 만
    if (statusFilter === "active") {
      result = result.filter((s) => s.status !== "closed");
    } else if (statusFilter !== "all") {
      result = result.filter((s) => s.status === statusFilter);
    }
    const query: string = searchQuery.trim().toLowerCase();
    if (query) {
      result = result.filter(
        (store: Store) =>
          store.name.toLowerCase().includes(query) ||
          (store.code && store.code.toLowerCase().includes(query)) ||
          (store.address && store.address.toLowerCase().includes(query)),
      );
    }
    return result;
  }, [stores, searchQuery, statusFilter]);

  /** 사용 중인 코드 집합 — 폐점 매장은 코드를 반납하므로 제외 (서버 dedup과 일치) */
  const liveCodes: string[] = useMemo(
    () =>
      Array.isArray(stores)
        ? stores
            .filter((s) => s.status !== "closed")
            .map((s) => s.code)
            .filter((c): c is string => Boolean(c))
        : [],
    [stores],
  );

  /** 코드 미리보기 — 이름 입력 시 비워두면 자동 생성될 코드를 placeholder로 안내 */
  const codePreview: string = useMemo(
    () => (createForm.name.trim() ? previewStoreCode(createForm.name, liveCodes) : ""),
    [createForm.name, liveCodes],
  );

  /** 드래그 정렬 가능 여부 — 기본 active 뷰 + 검색 없을 때만 (순서는 org 전역) */
  const canReorder = canWrite && statusFilter === "active" && !searchQuery.trim();

  /** sort_order 순 그룹 목록 / Groups sorted by sort_order */
  const groupList: StoreGroup[] = useMemo(
    () =>
      Array.isArray(groups) ? [...groups].sort((a, b) => a.sort_order - b.sort_order) : [],
    [groups],
  );

  /** Create/Edit 모달의 Group select 옵션 / Group select options */
  const groupOptions = useMemo(
    () => [
      { value: "", label: "None" },
      ...groupList.map((g: StoreGroup) => ({ value: g.id, label: g.name })),
    ],
    [groupList],
  );

  /** 그룹 섹션 (sort_order 순) + 마지막 Ungrouped / Group sections in sort_order, Ungrouped last */
  const sections: StoreSection[] = useMemo(() => {
    const byGroup = new Map<string, Store[]>();
    const ungrouped: Store[] = [];
    const knownGroupIds = new Set(groupList.map((g) => g.id));
    for (const store of filteredStores) {
      const gid = store.group_id ?? null;
      if (gid && knownGroupIds.has(gid)) {
        const list = byGroup.get(gid);
        if (list) list.push(store);
        else byGroup.set(gid, [store]);
      } else {
        ungrouped.push(store);
      }
    }
    const result: StoreSection[] = groupList.map((g: StoreGroup) => ({
      groupId: g.id,
      name: g.name,
      group: g,
      stores: byGroup.get(g.id) ?? [],
    }));
    result.push({ groupId: null, name: "Ungrouped", group: null, stores: ungrouped });
    return result;
  }, [filteredStores, groupList]);

  /** 검색/상태 필터 중에는 빈 섹션 숨김, 빈 Ungrouped 는 항상 숨김 / Visible sections */
  const isFiltering: boolean = Boolean(searchQuery.trim()) || statusFilter !== "active";
  const visibleSections: StoreSection[] = useMemo(
    () => sections.filter((s) => s.stores.length > 0 || (!isFiltering && s.groupId !== null)),
    [sections, isFiltering],
  );

  /**
   * 섹션 내 재정렬을 화면 전체 store 순서 배열로 확장 — 다른 매장의 전역
   * 위치는 보존하고, 드래그한 섹션이 차지한 슬롯만 새 섹션 내 순서로 교체.
   * 서버 PUT /console/stores/reorder 와 useReorderStores 의 낙관적 캐시는
   * "완전한 전체 순서 배열"을 가정하므로 부분 배열을 절대 넘기면 안 됨.
   *
   * Expand a within-section reorder into the complete flat order of every
   * store on screen, preserving every other store's global position — only
   * the dragged section's slots are reassigned. The server and the
   * optimistic cache both assume the full ordered array (a partial array
   * would drop other stores from cache).
   */
  const buildFlatOrder = useCallback(
    (groupId: string | null, idsInGroup: string[]): string[] => {
      // Keep every other store's global position: walk the current global order
      // (cache order) and reassign only the dragged section's slots to the new
      // in-section order.
      const sectionIds = new Set(
        sections.find((s: StoreSection) => s.groupId === groupId)?.stores.map((x: Store) => x.id) ?? [],
      );
      let i = 0;
      return filteredStores.map((store: Store) =>
        sectionIds.has(store.id) ? (idsInGroup[i++] ?? store.id) : store.id,
      );
    },
    [filteredStores, sections],
  );

  /** 고유 ID 카운터 / Unique ID counter for form items */
  const idCounter = useRef(0);
  const nextId = useCallback((): string => {
    idCounter.current += 1;
    return `item-${idCounter.current}`;
  }, []);

  /** Shift 추가 핸들러 / Add shift to create form */
  const handleAddShift = useCallback((): void => {
    if (!newShiftName.trim()) return;
    setCreateForm((prev: StoreFormData) => ({
      ...prev,
      shifts: [...prev.shifts, { id: nextId(), name: newShiftName.trim() }],
    }));
    setNewShiftName("");
  }, [newShiftName, nextId]);

  /** Position 추가 핸들러 / Add position to create form */
  const handleAddPosition = useCallback((): void => {
    if (!newPositionName.trim()) return;
    setCreateForm((prev: StoreFormData) => ({
      ...prev,
      positions: [...prev.positions, { id: nextId(), name: newPositionName.trim() }],
    }));
    setNewPositionName("");
  }, [newPositionName, nextId]);

  /** Shift 제거 핸들러 / Remove shift from create form */
  const handleRemoveShift = useCallback((id: string): void => {
    setCreateForm((prev: StoreFormData) => ({
      ...prev,
      shifts: prev.shifts.filter((item: FormItem) => item.id !== id),
    }));
  }, []);

  /** Position 제거 핸들러 / Remove position from create form */
  const handleRemovePosition = useCallback((id: string): void => {
    setCreateForm((prev: StoreFormData) => ({
      ...prev,
      positions: prev.positions.filter((item: FormItem) => item.id !== id),
    }));
  }, []);

  /** dnd-kit 센서 / dnd-kit sensors */
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  /** Shift 드래그앤드롭 핸들러 / Shift drag-and-drop reorder */
  const handleDragEndShifts = useCallback((event: DragEndEvent): void => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setCreateForm((prev: StoreFormData) => {
      const oldIndex = prev.shifts.findIndex((item: FormItem) => item.id === active.id);
      const newIndex = prev.shifts.findIndex((item: FormItem) => item.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return prev;
      return { ...prev, shifts: arrayMove(prev.shifts, oldIndex, newIndex) };
    });
  }, []);

  /** Position 드래그앤드롭 핸들러 / Position drag-and-drop reorder */
  const handleDragEndPositions = useCallback((event: DragEndEvent): void => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setCreateForm((prev: StoreFormData) => {
      const oldIndex = prev.positions.findIndex((item: FormItem) => item.id === active.id);
      const newIndex = prev.positions.findIndex((item: FormItem) => item.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return prev;
      return { ...prev, positions: arrayMove(prev.positions, oldIndex, newIndex) };
    });
  }, []);

  /** 매장 생성 핸들러 / Handle store creation with shifts/positions */
  const handleCreate = useCallback(async (): Promise<void> => {
    if (!createForm.name.trim()) return;
    setIsCreating(true);
    // 매장 생성과 shift/position 생성은 분리된 호출이라 비원자적이다.
    // 매장이 만들어진 뒤 자식 생성이 실패하면 매장은 남으므로, 그 경우를 구분해 안내한다.
    let createdStoreId: string | null = null;
    try {
      // 변수로 구성 — useStores 의 CreateStoreData 에 아직 없는 group 필드를 함께 전송
      const payload = {
        name: createForm.name.trim(),
        code: createForm.code.trim() || undefined, // 비우면 서버가 자동 생성
        address: createForm.address.trim() || undefined,
        phone: createForm.phone.trim() || null,
        email: createForm.email.trim() || null,
        status: createForm.status,
        timezone: createForm.timezone || null,
        group_id: createForm.groupId || null,
        number_range_start: parseRangeStart(createForm.numberRangeStart),
      };
      const store = await createStore.mutateAsync(payload);
      // 그룹 store_count 갱신 / Refresh group store counts
      queryClient.invalidateQueries({ queryKey: ["store-groups"] });

      const storeId: string = store.id;
      createdStoreId = storeId;

      if (createForm.shifts.length > 0) {
        await Promise.all(
          createForm.shifts.map((item: FormItem, index: number) =>
            createShift.mutateAsync({ storeId: storeId, name: item.name, sort_order: index + 1 }),
          ),
        );
      }

      if (createForm.positions.length > 0) {
        await Promise.all(
          createForm.positions.map((item: FormItem, index: number) =>
            createPosition.mutateAsync({ storeId: storeId, name: item.name, sort_order: index + 1 }),
          ),
        );
      }

      setIsCreateOpen(false);
      setCreateForm(INITIAL_FORM);
      setNewShiftName("");
      setNewPositionName("");
      void modal.alert({ type: "success", message: "Brand created." });
    } catch (err) {
      if (createdStoreId) {
        // 매장은 생성됨 — 자식(shift/position) 일부 실패. 상세에서 마저 설정하도록 안내.
        setIsCreateOpen(false);
        setCreateForm(INITIAL_FORM);
        setNewShiftName("");
        setNewPositionName("");
        void modal.alert({
          type: "error",
          message:
            "The store was created, but some shifts or positions didn't save. " +
            "Open the store and finish setting them up.",
        });
        router.push(`/stores/${createdStoreId}`);
      } else {
        void modal.alert({ type: "error", message: parseApiError(err, "Couldn't create brand") });
      }
    } finally {
      setIsCreating(false);
    }
  }, [createForm, createStore, createShift, createPosition, modal, router, queryClient]);

  /** 수정 모달 열기 / Open edit modal */
  const handleOpenEdit = useCallback(
    (store: Store, e: React.MouseEvent): void => {
      e.stopPropagation();
      setEditingStoreId(store.id);
      setEditForm({
        name: store.name,
        code: store.code || "",
        address: store.address || "",
        phone: store.phone || "",
        email: store.email || "",
        status: store.status,
        timezone: store.timezone || "",
        groupId: store.group_id ?? "",
        numberRangeStart: store.number_range_start != null ? String(store.number_range_start) : "",
        shifts: [],
        positions: [],
      });
      setIsEditOpen(true);
    },
    [],
  );

  /** 매장 수정 핸들러 / Handle store update */
  const handleUpdate = useCallback(async (): Promise<void> => {
    if (!editingStoreId || !editForm.name.trim()) return;
    try {
      // 변수로 구성 — useStores 의 UpdateStoreData 에 아직 없는 group 필드를 함께 전송
      const payload = {
        id: editingStoreId,
        name: editForm.name.trim(),
        code: editForm.code.trim() || null,
        address: editForm.address.trim() || undefined,
        phone: editForm.phone.trim() || null,
        email: editForm.email.trim() || null,
        status: editForm.status,
        timezone: editForm.timezone || null,
        group_id: editForm.groupId || null, // 명시적 null = 그룹 해제
        number_range_start: parseRangeStart(editForm.numberRangeStart),
      };
      const updated = await updateStore.mutateAsync(payload);
      // 그룹 편성이 바뀌었을 수 있으므로 store_count 갱신 / Group membership may have changed
      queryClient.invalidateQueries({ queryKey: ["store-groups"] });
      setIsEditOpen(false);
      setEditingStoreId(null);
      setEditForm(INITIAL_FORM);
      // 그룹 편성 변경 응답에만 실리는 EMPID 중복 경고 / Duplicate-EMPID warning from group-change responses
      if (updated.duplicate_empids && updated.duplicate_empids.length > 0) {
        void modal.alert({
          type: "info",
          title: "Duplicate EMPIDs",
          message: duplicateEmpidMessage(updated.duplicate_empids.length),
        });
      }
    } catch {
      // hook 이 자동으로 에러 모달
    }
  }, [editingStoreId, editForm, updateStore, queryClient, modal]);

  /** 매장 삭제 핸들러 / Handle store deletion (inline confirm) */
  const handleOpenDelete = useCallback(
    async (store: Store, e: React.MouseEvent): Promise<void> => {
      e.stopPropagation();
      // Hard delete 가드 — 데이터 영구 삭제. store 이름을 직접 입력해야 진행.
      const typed = await modal.confirm({
        title: "Permanently delete store",
        message:
          `This permanently deletes "${store.name}" and all its data (shifts, positions, schedules, assignments). ` +
          `This cannot be undone. To only stop operating, set status to Paused or Closed instead.\n\n` +
          `Type the store name to confirm.`,
        confirmLabel: "Delete forever",
        variant: "danger",
        requiresReason: true,
        reasonLabel: `Type "${store.name}" to confirm`,
      });
      if (typed === undefined) return; // 취소
      if (typed.trim() !== store.name) {
        void modal.alert({ type: "error", message: "The name you typed doesn't match. Deletion cancelled." });
        return;
      }
      try {
        await deleteStore.mutateAsync(store.id);
      } catch {
        // hook 이 자동으로 에러 모달
      }
    },
    [modal, deleteStore],
  );

  /** 행 클릭으로 상세 페이지 이동 / Navigate to detail on row click */
  const handleRowClick = useCallback(
    (store: Store): void => {
      router.push(`/stores/${store.id}`);
    },
    [router],
  );

  /** 테이블 컬럼 정의 / Table column definitions */
  const columns: Column<Store>[] = useMemo(
    () => [
      {
        key: "code",
        header: "Code",
        className: "w-24",
        render: (store: Store) =>
          store.code ? (
            <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-surface border border-border text-text-secondary">
              {store.code}
            </span>
          ) : (
            <span className="text-text-muted">-</span>
          ),
      },
      {
        key: "name",
        header: "Name",
        render: (store: Store) => (
          <span className="font-medium text-text">{store.name}</span>
        ),
      },
      {
        key: "address",
        header: "Address",
        hideOnMobile: true,
        render: (store: Store) => (
          <span className="text-text-secondary">
            {store.address || "-"}
          </span>
        ),
      },
      {
        key: "status",
        header: "Status",
        render: (store: Store) => {
          const s = STATUS_BADGE[store.status] ?? STATUS_BADGE.open;
          return <Badge variant={s.variant}>{s.label}</Badge>;
        },
      },
      {
        key: "created_at",
        header: "Created",
        hideOnMobile: true,
        render: (store: Store) => (
          <span className="text-text-muted text-xs">
            {formatDate(store.created_at, tz)}
          </span>
        ),
      },
      ...(canWrite
        ? [
            {
              key: "actions",
              header: "",
              className: "w-24 text-right",
              render: (store: Store) => (
                <div className="flex items-center justify-end gap-1">
                  <button
                    type="button"
                    onClick={(e: React.MouseEvent) => handleOpenEdit(store, e)}
                    className="p-1.5 rounded-md text-text-muted hover:text-text hover:bg-surface-hover transition-colors"
                    aria-label={`Edit ${store.name}`}
                  >
                    <Edit className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={(e: React.MouseEvent) => void handleOpenDelete(store, e)}
                    className="p-1.5 rounded-md text-text-muted hover:text-danger hover:bg-danger-muted transition-colors"
                    aria-label={`Delete ${store.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ),
            },
          ]
        : []),
    ],
    [handleOpenEdit, handleOpenDelete, canWrite, tz],
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div>
      {/* Page Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-extrabold text-text">Stores</h1>
        {canWrite && (
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              onClick={() => setIsGroupsOpen(true)}
            >
              <Layers className="h-4 w-4" />
              Manage Groups
            </Button>
            <Button
              variant="primary"
              onClick={() => setIsCreateOpen(true)}
            >
              <Plus className="h-4 w-4" />
              Add Store
            </Button>
          </div>
        )}
      </div>

      {/* Search + Status Filter */}
      <div className="mb-4 flex items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
          <input
            type="text"
            placeholder="Search stores..."
            value={searchQuery}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setUrlParams({ search: e.target.value })
            }
            className="w-full rounded-lg border border-border bg-surface pl-9 pr-3 py-2 text-sm text-text placeholder:text-text-muted transition-colors focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setUrlParams({ status: e.target.value })}
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent"
          aria-label="Filter by status"
        >
          <option value="active">All active</option>
          <option value="open">Open</option>
          <option value="preparing">Preparing</option>
          <option value="paused">Paused</option>
          <option value="closed">Closed</option>
        </select>
      </div>

      {/* Stores — 그룹이 없으면 기존 단일 테이블, 있으면 그룹 섹션 렌더 (검색 중 드래그 정렬 불가, 순서는 org 전역) */}
      {groupList.length === 0 ? (
        <Table<Store>
          columns={columns}
          data={filteredStores}
          isLoading={isLoading}
          onRowClick={handleRowClick}
          onReorder={
            canReorder ? (ids: string[]) => reorderStores.mutate(ids) : undefined
          }
          emptyMessage={
            statusFilter === "closed"
              ? "No closed stores."
              : "No stores found. Create your first store to get started."
          }
        />
      ) : visibleSections.length === 0 ? (
        <Table<Store>
          columns={columns}
          data={[]}
          isLoading={isLoading}
          emptyMessage={
            statusFilter === "closed"
              ? "No closed stores."
              : "No stores found. Create your first store to get started."
          }
        />
      ) : (
        <div className="space-y-8">
          {visibleSections.map((section: StoreSection) => (
            <div key={section.groupId ?? "ungrouped"}>
              {/* Section Header — 그룹명 + store 수 + numbering 뱃지 (checklists 의 store 섹션 헤더 패턴) */}
              <div className="flex items-center gap-3 mb-2">
                <h2 className="text-sm font-semibold text-text">{section.name}</h2>
                <span className="text-xs text-text-muted">
                  {section.group ? section.group.store_count : section.stores.length}{" "}
                  {(section.group ? section.group.store_count : section.stores.length) === 1
                    ? "store"
                    : "stores"}
                </span>
                {section.group && (
                  <Badge variant="accent">
                    {NUMBERING_MODE_LABEL[section.group.numbering_mode]}
                  </Badge>
                )}
                {section.group?.number_range_start != null && (
                  <span className="text-xs text-text-muted">
                    Starts at {section.group.number_range_start}
                  </span>
                )}
                <div className="flex-1 border-t border-border" />
              </div>

              {/* Stores in this group — onReorder 는 전체 순서 배열로 확장해서 전달 */}
              <Table<Store>
                columns={columns}
                data={section.stores}
                isLoading={isLoading}
                onRowClick={handleRowClick}
                onReorder={
                  canReorder
                    ? (ids: string[]) =>
                        reorderStores.mutate(buildFlatOrder(section.groupId, ids))
                    : undefined
                }
                emptyMessage={
                  section.groupId ? "No stores in this group yet." : "No ungrouped stores."
                }
              />
            </div>
          ))}
        </div>
      )}
      {canReorder && filteredStores.length > 1 && (
        <p className="mt-2 text-xs text-text-muted">
          Drag the handle to reorder how stores appear across the console.
        </p>
      )}
      {statusFilter === "closed" && filteredStores.length > 0 && (
        <p className="mt-2 text-xs text-text-muted">
          Closed stores are hidden from staff and block new schedules/clock-ins. Edit one and set its status back to Open to reopen it.
        </p>
      )}

      {/* Create Store Modal */}
      <Modal
        isOpen={isCreateOpen}
        onClose={() => {
          setIsCreateOpen(false);
          setCreateForm(INITIAL_FORM);
          setNewShiftName("");
          setNewPositionName("");
        }}
        title="Create Store"
        size="lg"
        closeOnBackdrop={false}
      >
        <div className="space-y-4">
          <Input
            label="Store Name"
            placeholder="Enter store name"
            value={createForm.name}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setCreateForm((prev: StoreFormData) => ({
                ...prev,
                name: e.target.value,
              }))
            }
          />
          <div>
            <Input
              label="Code"
              placeholder={codePreview ? `${codePreview} (auto)` : "Auto from name if blank (e.g. SWC)"}
              value={createForm.code}
              maxLength={10}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setCreateForm((prev: StoreFormData) => ({
                  ...prev,
                  code: e.target.value.toUpperCase(),
                }))
              }
            />
            <p className="mt-1 text-xs text-text-muted">
              {codePreview && !createForm.code.trim() ? (
                <>
                  2–10 letters/numbers. Leave blank to use{" "}
                  <span className="font-semibold text-text-secondary">{codePreview}</span>,
                  auto-generated from the name.
                </>
              ) : (
                <>2–10 letters/numbers. Leave blank to auto-generate from the name (first 3 letters).</>
              )}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Phone"
              placeholder="Optional"
              value={createForm.phone}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setCreateForm((prev: StoreFormData) => ({ ...prev, phone: e.target.value }))
              }
            />
            <Input
              label="Email"
              placeholder="Optional"
              value={createForm.email}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setCreateForm((prev: StoreFormData) => ({ ...prev, email: e.target.value }))
              }
            />
          </div>
          <Input
            label="Address"
            placeholder="Enter address (optional)"
            value={createForm.address}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setCreateForm((prev: StoreFormData) => ({
                ...prev,
                address: e.target.value,
              }))
            }
          />
          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Status"
              options={STORE_STATUS_OPTIONS}
              value={createForm.status}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                setCreateForm((prev: StoreFormData) => ({
                  ...prev,
                  status: e.target.value as StoreStatus,
                }))
              }
            />
            <Select
              label="Timezone"
              placeholder="Use Organization Default"
              options={TIMEZONE_OPTIONS}
              value={createForm.timezone}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                setCreateForm((prev: StoreFormData) => ({
                  ...prev,
                  timezone: e.target.value,
                }))
              }
            />
          </div>
          <div>
            <div className="grid grid-cols-2 gap-3">
              <Select
                label="Group"
                options={groupOptions}
                value={createForm.groupId}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  setCreateForm((prev: StoreFormData) => ({
                    ...prev,
                    groupId: e.target.value,
                  }))
                }
              />
              <Input
                label="Number Range Start"
                type="number"
                min={1}
                placeholder="Optional"
                value={createForm.numberRangeStart}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setCreateForm((prev: StoreFormData) => ({
                    ...prev,
                    numberRangeStart: e.target.value,
                  }))
                }
              />
            </div>
            <p className="mt-1 text-xs text-text-muted">
              Number range start sets the first EMPID for this store&apos;s own numbering. Leave blank for the default.
            </p>
          </div>

          {/* Shifts Section */}
          <div>
            <label className="text-sm font-medium text-text-secondary block mb-2">
              Shifts (optional)
            </label>
            {createForm.shifts.length > 0 && (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEndShifts}
              >
                <SortableContext
                  items={createForm.shifts.map((item: FormItem) => item.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-1 mb-2">
                    {createForm.shifts.map((item: FormItem, index: number) => (
                      <DraggableStringRow
                        key={item.id}
                        id={item.id}
                        name={item.name}
                        index={index}
                        onRemove={() => handleRemoveShift(item.id)}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="e.g. Morning, Afternoon, Night"
                value={newShiftName}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setNewShiftName(e.target.value)
                }
                onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddShift();
                  }
                }}
                className="flex-1 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent"
              />
              <Button
                variant="secondary"
                size="sm"
                onClick={handleAddShift}
                disabled={!newShiftName.trim()}
              >
                Add
              </Button>
            </div>
          </div>

          {/* Positions Section */}
          <div>
            <label className="text-sm font-medium text-text-secondary block mb-2">
              Positions (optional)
            </label>
            {createForm.positions.length > 0 && (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEndPositions}
              >
                <SortableContext
                  items={createForm.positions.map((item: FormItem) => item.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-1 mb-2">
                    {createForm.positions.map((item: FormItem, index: number) => (
                      <DraggableStringRow
                        key={item.id}
                        id={item.id}
                        name={item.name}
                        index={index}
                        onRemove={() => handleRemovePosition(item.id)}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="e.g. Barista, Manager, Cashier"
                value={newPositionName}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setNewPositionName(e.target.value)
                }
                onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddPosition();
                  }
                }}
                className="flex-1 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent"
              />
              <Button
                variant="secondary"
                size="sm"
                onClick={handleAddPosition}
                disabled={!newPositionName.trim()}
              >
                Add
              </Button>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="secondary"
              onClick={() => {
                setIsCreateOpen(false);
                setCreateForm(INITIAL_FORM);
                setNewShiftName("");
                setNewPositionName("");
              }}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleCreate}
              isLoading={isCreating}
              disabled={!createForm.name.trim()}
            >
              Create
            </Button>
          </div>
        </div>
      </Modal>

      {/* Edit Store Modal */}
      <Modal
        isOpen={isEditOpen}
        onClose={() => {
          setIsEditOpen(false);
          setEditingStoreId(null);
          setEditForm(INITIAL_FORM);
        }}
        title="Edit Store"
        closeOnBackdrop={false}
      >
        <div className="space-y-4">
          <Input
            label="Store Name"
            placeholder="Enter store name"
            value={editForm.name}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setEditForm((prev: StoreFormData) => ({
                ...prev,
                name: e.target.value,
              }))
            }
          />
          <div>
            <Input
              label="Code"
              placeholder="e.g. SWC"
              value={editForm.code}
              maxLength={10}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setEditForm((prev: StoreFormData) => ({
                  ...prev,
                  code: e.target.value.toUpperCase(),
                }))
              }
            />
            <p className="mt-1 text-xs text-text-muted">
              2–10 letters/numbers, unique within your organization.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Phone"
              placeholder="Optional"
              value={editForm.phone}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setEditForm((prev: StoreFormData) => ({ ...prev, phone: e.target.value }))
              }
            />
            <Input
              label="Email"
              placeholder="Optional"
              value={editForm.email}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setEditForm((prev: StoreFormData) => ({ ...prev, email: e.target.value }))
              }
            />
          </div>
          <Input
            label="Address"
            placeholder="Enter address (optional)"
            value={editForm.address}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setEditForm((prev: StoreFormData) => ({
                ...prev,
                address: e.target.value,
              }))
            }
          />
          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Status"
              options={STORE_STATUS_OPTIONS}
              value={editForm.status}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                setEditForm((prev: StoreFormData) => ({
                  ...prev,
                  status: e.target.value as StoreStatus,
                }))
              }
            />
            <Select
              label="Timezone"
              placeholder="Use Organization Default"
              options={TIMEZONE_OPTIONS}
              value={editForm.timezone}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                setEditForm((prev: StoreFormData) => ({
                  ...prev,
                  timezone: e.target.value,
                }))
              }
            />
          </div>
          <div>
            <div className="grid grid-cols-2 gap-3">
              <Select
                label="Group"
                options={groupOptions}
                value={editForm.groupId}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  setEditForm((prev: StoreFormData) => ({
                    ...prev,
                    groupId: e.target.value,
                  }))
                }
              />
              <Input
                label="Number Range Start"
                type="number"
                min={1}
                placeholder="Optional"
                value={editForm.numberRangeStart}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setEditForm((prev: StoreFormData) => ({
                    ...prev,
                    numberRangeStart: e.target.value,
                  }))
                }
              />
            </div>
            <p className="mt-1 text-xs text-text-muted">
              Number range start sets the first EMPID for this store&apos;s own numbering. Leave blank for the default.
            </p>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="secondary"
              onClick={() => {
                setIsEditOpen(false);
                setEditingStoreId(null);
                setEditForm(INITIAL_FORM);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleUpdate}
              isLoading={updateStore.isPending}
              disabled={!editForm.name.trim()}
            >
              Save Changes
            </Button>
          </div>
        </div>
      </Modal>

      {/* Manage Groups Modal */}
      <ManageGroupsModal isOpen={isGroupsOpen} onClose={() => setIsGroupsOpen(false)} />
    </div>
  );
}
