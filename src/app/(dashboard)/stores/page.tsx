"use client";

/**
 * 매장 목록 페이지 -- 매장 CRUD 관리 페이지입니다.
 * 검색, 생성, 수정, 삭제 기능을 제공합니다.
 *
 * Stores List Page -- Full store management page with CRUD operations.
 * Provides search, create, edit, and delete functionality.
 */

import React, { useState, useMemo, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { usePersistedFilters } from "@/hooks/usePersistedFilters";
import { Plus, Search, Edit, Trash2, X, GripVertical } from "lucide-react";
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
import type { Store, StoreStatus } from "@/types";
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
  shifts: [],
  positions: [],
};

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
      const store = await createStore.mutateAsync({
        name: createForm.name.trim(),
        code: createForm.code.trim() || undefined, // 비우면 서버가 자동 생성
        address: createForm.address.trim() || undefined,
        phone: createForm.phone.trim() || null,
        email: createForm.email.trim() || null,
        status: createForm.status,
        timezone: createForm.timezone || null,
      });

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
  }, [createForm, createStore, createShift, createPosition, modal, router]);

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
      await updateStore.mutateAsync({
        id: editingStoreId,
        name: editForm.name.trim(),
        code: editForm.code.trim() || null,
        address: editForm.address.trim() || undefined,
        phone: editForm.phone.trim() || null,
        email: editForm.email.trim() || null,
        status: editForm.status,
        timezone: editForm.timezone || null,
      });
      setIsEditOpen(false);
      setEditingStoreId(null);
      setEditForm(INITIAL_FORM);
    } catch {
      // hook 이 자동으로 에러 모달
    }
  }, [editingStoreId, editForm, updateStore]);

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
          <Button
            variant="primary"
            onClick={() => setIsCreateOpen(true)}
          >
            <Plus className="h-4 w-4" />
            Add Store
          </Button>
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

      {/* Stores Table — 검색 중이 아닐 때만 드래그 정렬 (순서는 org 전역) */}
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
    </div>
  );
}
