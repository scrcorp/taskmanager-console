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
import { useUrlParams } from "@/hooks/useUrlParams";
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
import { useStores, useCreateStore, useUpdateStore, useDeleteStore } from "@/hooks/useStores";
import { useCreateShift } from "@/hooks/useShifts";
import { useCreatePosition } from "@/hooks/usePositions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Table, Badge, Modal, ConfirmDialog } from "@/components/ui";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useToast } from "@/components/ui/Toast";
import { formatDate, parseApiError } from "@/lib/utils";
import { useTimezone } from "@/hooks/useTimezone";
import { TIMEZONE_OPTIONS } from "@/lib/timezones";
import { usePermissions } from "@/hooks/usePermissions";
import { PERMISSIONS } from "@/lib/permissions";
import type { Store } from "@/types";

/** 폼 내 드래그 가능한 아이템 / Draggable item in form */
interface FormItem {
  id: string;
  name: string;
}

/** 매장 폼 데이터 인터페이스 / Store form data interface */
interface StoreFormData {
  name: string;
  address: string;
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
  address: "",
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
  const { toast } = useToast();

  /** 권한 훅 / Permission hook */
  const { hasPermission } = usePermissions();
  const tz = useTimezone();
  const canWrite = hasPermission(PERMISSIONS.STORES_CREATE);

  /** 매장 데이터 훅 / Store data hooks */
  const { data: stores, isLoading } = useStores();
  const createStore = useCreateStore();
  const updateStore = useUpdateStore();
  const deleteStore = useDeleteStore();
  const createShift = useCreateShift();
  const createPosition = useCreatePosition();

  /** 검색어 상태 (URL-persisted) / Search query state */
  const [urlParams, setUrlParams] = useUrlParams({ search: "" });
  const searchQuery = urlParams.search;

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

  /** 삭제 확인 다이얼로그 상태 / Delete confirmation dialog state */
  const [isDeleteOpen, setIsDeleteOpen] = useState<boolean>(false);
  const [deletingStoreId, setDeletingStoreId] = useState<string | null>(null);
  const [deletingStoreName, setDeletingStoreName] = useState<string>("");

  /** 검색으로 필터링된 매장 목록 / Filtered stores by search query */
  const filteredStores: Store[] = useMemo(() => {
    if (!Array.isArray(stores)) return [];
    if (!searchQuery.trim()) return stores;
    const query: string = searchQuery.toLowerCase();
    return stores.filter(
      (store: Store) =>
        store.name.toLowerCase().includes(query) ||
        (store.address && store.address.toLowerCase().includes(query)),
    );
  }, [stores, searchQuery]);

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
    try {
      const store = await createStore.mutateAsync({
        name: createForm.name.trim(),
        address: createForm.address.trim() || undefined,
        timezone: createForm.timezone || null,
      });

      const storeId: string = store.id;

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

      toast({ type: "success", message: "Store created successfully!" });
      setIsCreateOpen(false);
      setCreateForm(INITIAL_FORM);
      setNewShiftName("");
      setNewPositionName("");
    } catch (err) {
      toast({ type: "error", message: parseApiError(err, "Failed to create store.") });
    } finally {
      setIsCreating(false);
    }
  }, [createForm, createStore, createShift, createPosition, toast]);

  /** 수정 모달 열기 / Open edit modal */
  const handleOpenEdit = useCallback(
    (store: Store, e: React.MouseEvent): void => {
      e.stopPropagation();
      setEditingStoreId(store.id);
      setEditForm({ name: store.name, address: store.address || "", timezone: store.timezone || "", shifts: [], positions: [] });
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
        address: editForm.address.trim() || undefined,
        timezone: editForm.timezone || null,
      });
      toast({ type: "success", message: "Store updated successfully!" });
      setIsEditOpen(false);
      setEditingStoreId(null);
      setEditForm(INITIAL_FORM);
    } catch (err) {
      toast({ type: "error", message: parseApiError(err, "Failed to update store.") });
    }
  }, [editingStoreId, editForm, updateStore, toast]);

  /** 삭제 확인 열기 / Open delete confirmation */
  const handleOpenDelete = useCallback(
    (store: Store, e: React.MouseEvent): void => {
      e.stopPropagation();
      setDeletingStoreId(store.id);
      setDeletingStoreName(store.name);
      setIsDeleteOpen(true);
    },
    [],
  );

  /** 매장 삭제 핸들러 / Handle store deletion */
  const handleDelete = useCallback(async (): Promise<void> => {
    if (!deletingStoreId) return;
    try {
      await deleteStore.mutateAsync(deletingStoreId);
      toast({ type: "success", message: "Store deleted successfully!" });
      setIsDeleteOpen(false);
      setDeletingStoreId(null);
      setDeletingStoreName("");
    } catch (err) {
      toast({ type: "error", message: parseApiError(err, "Failed to delete store.") });
    }
  }, [deletingStoreId, deleteStore, toast]);

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
        key: "name",
        header: "Name",
        render: (store: Store) => (
          <span className="font-medium text-text">{store.name}</span>
        ),
      },
      {
        key: "address",
        header: "Address",
        render: (store: Store) => (
          <span className="text-text-secondary">
            {store.address || "-"}
          </span>
        ),
      },
      {
        key: "is_active",
        header: "Status",
        render: (store: Store) => (
          <Badge variant={store.is_active ? "success" : "danger"}>
            {store.is_active ? "Active" : "Inactive"}
          </Badge>
        ),
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
                    onClick={(e: React.MouseEvent) => handleOpenDelete(store, e)}
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

      {/* Search Bar */}
      <div className="mb-4 max-w-sm">
        <div className="relative">
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
      </div>

      {/* Stores Table */}
      <Table<Store>
        columns={columns}
        data={filteredStores}
        isLoading={isLoading}
        onRowClick={handleRowClick}
        emptyMessage="No stores found. Create your first store to get started."
      />

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

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={isDeleteOpen}
        onClose={() => {
          setIsDeleteOpen(false);
          setDeletingStoreId(null);
          setDeletingStoreName("");
        }}
        onConfirm={handleDelete}
        title="Delete Store"
        message={`Are you sure you want to delete "${deletingStoreName}"? This action cannot be undone.`}
        confirmLabel="Delete"
        isLoading={deleteStore.isPending}
      />
    </div>
  );
}
