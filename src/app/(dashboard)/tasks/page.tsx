"use client";

/**
 * 추가 작업 목록 페이지 -- 추가 작업을 관리하고 새 작업을 생성/삭제합니다.
 *
 * Additional tasks list page with filtering, table view, pagination, create modal, and delete confirmation.
 */

import React, { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { usePersistedFilters } from "@/hooks/usePersistedFilters";
import { Plus, Trash2 } from "lucide-react";
import { useTasks, useCreateTask, useDeleteTask } from "@/hooks/useTasks";
import { useStores } from "@/hooks/useStores";
import { useUsers } from "@/hooks/useUsers";
import {
  Button,
  Input,
  Select,
  Textarea,
  Card,
  Table,
  Modal,
  Badge,
  Pagination,
  ConfirmDialog,
  LoadingSpinner,
} from "@/components/ui";
import { useResultModal } from "@/components/ui/ResultModal";
import { formatFixedDate, parseApiError } from "@/lib/utils";
import { usePermissions } from "@/hooks/usePermissions";
import { PERMISSIONS } from "@/lib/permissions";
import type { AdditionalTask, Store, User } from "@/types";

/** 작업 상태에 따른 뱃지 변형 매핑 (Status to badge variant mapping) */
const statusBadgeVariant: Record<string, "default" | "warning" | "success"> = {
  pending: "default",
  in_progress: "warning",
  completed: "success",
};

/** 작업 상태 라벨 매핑 (Status label mapping) */
const statusLabel: Record<string, string> = {
  pending: "Pending",
  in_progress: "In Progress",
  completed: "Completed",
};

/** 우선순위 뱃지 변형 매핑 (Priority to badge variant mapping) */
const priorityBadgeVariant: Record<string, "default" | "danger"> = {
  normal: "default",
  urgent: "danger",
};

const PER_PAGE: number = 20;

export default function TasksPage(): React.ReactElement {
  const router = useRouter();
  const { showSuccess, showError } = useResultModal();
  const { hasPermission } = usePermissions();
  const canManageTasks = hasPermission(PERMISSIONS.TASKS_CREATE);

  // -- Filter state (URL-persisted) --
  const [urlParams, setUrlParams] = usePersistedFilters("tasks", { store: "", status: "", priority: "", page: "1" });
  const filterStoreId = urlParams.store;
  const filterStatus = urlParams.status;
  const filterPriority = urlParams.priority;
  const page = Number(urlParams.page);

  // -- Create modal state --
  const [isCreateOpen, setIsCreateOpen] = useState<boolean>(false);
  const [formTitle, setFormTitle] = useState<string>("");
  const [formDescription, setFormDescription] = useState<string>("");
  const [formStoreId, setFormStoreId] = useState<string>("");
  const [formPriority, setFormPriority] = useState<string>("normal");
  const [formDueDate, setFormDueDate] = useState<string>("");
  const [formAssigneeIds, setFormAssigneeIds] = useState<string[]>([]);

  // -- Delete state --
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // -- Data hooks --
  const { data: tasksData, isLoading } = useTasks({
    store_id: filterStoreId || undefined,
    status: (filterStatus || undefined) as "pending" | "in_progress" | "completed" | undefined,
    priority: (filterPriority || undefined) as "normal" | "urgent" | undefined,
    page,
    per_page: PER_PAGE,
  });
  const { data: stores } = useStores();
  const { data: users } = useUsers();
  const createTask = useCreateTask();
  const deleteTask = useDeleteTask();

  const tasks: AdditionalTask[] = tasksData?.items ?? [];
  const totalPages: number = tasksData
    ? Math.ceil(tasksData.total / tasksData.per_page)
    : 1;

  const storeFilterOptions: { value: string; label: string }[] = [
    { value: "", label: "All Stores" },
    ...(stores ?? []).map((b: Store) => ({ value: b.id, label: b.name })),
  ];

  const statusOptions: { value: string; label: string }[] = [
    { value: "", label: "All Status" },
    { value: "pending", label: "Pending" },
    { value: "in_progress", label: "In Progress" },
    { value: "completed", label: "Completed" },
  ];

  const priorityFilterOptions: { value: string; label: string }[] = [
    { value: "", label: "All Priority" },
    { value: "normal", label: "Normal" },
    { value: "urgent", label: "Urgent" },
  ];

  const formStoreOptions: { value: string; label: string }[] = [
    { value: "", label: "All Stores (org-wide)" },
    ...(stores ?? []).map((b: Store) => ({ value: b.id, label: b.name })),
  ];

  const formPriorityOptions: { value: string; label: string }[] = [
    { value: "normal", label: "Normal" },
    { value: "urgent", label: "Urgent" },
  ];

  const allUsers: User[] = users ?? [];

  /** 테이블 컬럼 정의 (Table column definitions) */
  const columns: {
    key: string;
    header: string;
    render?: (item: AdditionalTask) => React.ReactNode;
    className?: string;
  }[] = [
    {
      key: "title",
      header: "Title",
      className: "min-w-[180px]",
    },
    {
      key: "store_name",
      header: "Store",
      render: (item: AdditionalTask): React.ReactNode => (
        <span className="text-text-secondary">{item.store_name ?? "All"}</span>
      ),
    },
    {
      key: "priority",
      header: "Priority",
      render: (item: AdditionalTask): React.ReactNode => (
        <Badge variant={priorityBadgeVariant[item.priority] ?? "default"}>
          {item.priority === "urgent" ? "Urgent" : "Normal"}
        </Badge>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (item: AdditionalTask): React.ReactNode => (
        <Badge variant={statusBadgeVariant[item.status] ?? "default"}>
          {statusLabel[item.status] ?? item.status}
        </Badge>
      ),
    },
    {
      key: "due_date",
      header: "Due Date",
      render: (item: AdditionalTask): React.ReactNode =>
        item.due_date ? formatFixedDate(item.due_date) : "-",
    },
    {
      key: "assignee_names",
      header: "Assignees",
      render: (item: AdditionalTask): React.ReactNode => (
        <span className="text-xs text-text-secondary">
          {item.assignee_names.length > 0
            ? item.assignee_names.join(", ")
            : "-"}
        </span>
      ),
    },
    ...(canManageTasks
      ? [
          {
            key: "actions",
            header: "Actions",
            render: (item: AdditionalTask): React.ReactNode => (
              <button
                type="button"
                onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                  e.stopPropagation();
                  setDeleteId(item.id);
                }}
                className="p-1.5 rounded-lg text-text-muted hover:text-danger hover:bg-danger-muted transition-colors cursor-pointer"
                title="Delete"
              >
                <Trash2 size={14} />
              </button>
            ),
          },
        ]
      : []),
  ];

  const handleRowClick: (item: AdditionalTask) => void = useCallback(
    (item: AdditionalTask): void => {
      router.push(`/tasks/${item.id}`);
    },
    [router],
  );

  const handleOpenCreate: () => void = useCallback((): void => {
    setFormTitle("");
    setFormDescription("");
    setFormStoreId("");
    setFormPriority("normal");
    setFormDueDate("");
    setFormAssigneeIds([]);
    setIsCreateOpen(true);
  }, []);

  /** 담당자 체크박스 토글 (Toggle assignee checkbox) */
  const handleToggleAssignee: (userId: string) => void = useCallback(
    (userId: string): void => {
      setFormAssigneeIds((prev: string[]) =>
        prev.includes(userId)
          ? prev.filter((id: string) => id !== userId)
          : [...prev, userId],
      );
    },
    [],
  );

  const handleCreateSubmit: () => void = useCallback((): void => {
    if (!formTitle.trim()) {
      showError("Task title is required.");
      return;
    }

    createTask.mutate(
      {
        title: formTitle.trim(),
        description: formDescription.trim() || undefined,
        store_id: formStoreId || null,
        priority: formPriority as "normal" | "urgent",
        due_date: formDueDate || null,
        assignee_ids: formAssigneeIds.length > 0 ? formAssigneeIds : undefined,
      },
      {
        onSuccess: (): void => {
          showSuccess("Task created successfully.");
          setIsCreateOpen(false);
        },
        onError: (err): void => {
          showError(parseApiError(err, "Failed to create task."));
        },
      },
    );
  }, [formTitle, formDescription, formStoreId, formPriority, formDueDate, formAssigneeIds, createTask, showSuccess, showError]);

  const handleDelete: () => void = useCallback((): void => {
    if (!deleteId) return;
    deleteTask.mutate(deleteId, {
      onSuccess: (): void => {
        showSuccess("Task deleted successfully.");
        setDeleteId(null);
      },
      onError: (err): void => {
        showError(parseApiError(err, "Failed to delete task."));
      },
    });
  }, [deleteId, deleteTask, showSuccess, showError]);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-extrabold text-text">Tasks</h1>
        {canManageTasks && (
          <Button variant="primary" size="md" onClick={handleOpenCreate}>
            <Plus size={16} />
            Create Task
          </Button>
        )}
      </div>

      {/* Filter bar */}
      <Card className="mb-6" padding="p-4">
        <div className="flex flex-col md:flex-row md:items-end gap-3 flex-wrap">
          <div className="w-full md:w-44">
            <Select
              label="Store"
              options={storeFilterOptions}
              value={filterStoreId}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                setUrlParams({ store: e.target.value, page: null });
              }}
            />
          </div>
          <div className="w-full md:w-44">
            <Select
              label="Status"
              options={statusOptions}
              value={filterStatus}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                setUrlParams({ status: e.target.value, page: null });
              }}
            />
          </div>
          <div className="w-full md:w-44">
            <Select
              label="Priority"
              options={priorityFilterOptions}
              value={filterPriority}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                setUrlParams({ priority: e.target.value, page: null });
              }}
            />
          </div>
        </div>
      </Card>

      {/* Table */}
      <Card padding="p-0">
        <Table<AdditionalTask>
          columns={columns}
          data={tasks}
          isLoading={isLoading}
          onRowClick={handleRowClick}
          emptyMessage="No tasks found."
        />
      </Card>

      {/* Pagination */}
      <div className="mt-4 flex justify-center">
        <Pagination page={page} totalPages={totalPages} onPageChange={(p: number) => setUrlParams({ page: String(p) })} />
      </div>

      {/* Create Task Modal */}
      <Modal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Create Task"
        size="lg"
        closeOnBackdrop={false}
      >
        <div className="flex flex-col gap-4">
          <Input
            label="Title"
            value={formTitle}
            placeholder="Enter task title"
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setFormTitle(e.target.value)
            }
          />
          <Textarea
            label="Description"
            value={formDescription}
            placeholder="Enter task description (optional)"
            rows={4}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
              setFormDescription(e.target.value)
            }
          />
          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Store (optional)"
              options={formStoreOptions}
              value={formStoreId}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                setFormStoreId(e.target.value)
              }
            />
            <Select
              label="Priority"
              options={formPriorityOptions}
              value={formPriority}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                setFormPriority(e.target.value)
              }
            />
          </div>
          <Input
            label="Due Date (optional)"
            type="date"
            value={formDueDate}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setFormDueDate(e.target.value)
            }
          />
          {/* Assignees */}
          <div>
            <label className="text-sm font-medium text-text-secondary block mb-2">
              Assignees
            </label>
            <div className="max-h-40 overflow-y-auto border border-border rounded-lg p-2 space-y-1">
              {allUsers.length === 0 ? (
                <p className="text-xs text-text-muted py-2 text-center">
                  No users available.
                </p>
              ) : (
                allUsers.map((u: User) => {
                  const isChecked: boolean = formAssigneeIds.includes(u.id);
                  return (
                    <label
                      key={u.id}
                      className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-surface-hover cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => handleToggleAssignee(u.id)}
                        className="rounded border-border bg-surface text-accent focus:ring-accent/50 cursor-pointer"
                      />
                      <span className="text-sm text-text">{u.full_name}</span>
                      <span className="text-xs text-text-muted ml-auto">
                        {u.role_name}
                      </span>
                    </label>
                  );
                })
              )}
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button variant="secondary" size="sm" onClick={() => setIsCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleCreateSubmit}
              isLoading={createTask.isPending}
            >
              Create
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirm Dialog */}
      <ConfirmDialog
        isOpen={deleteId !== null}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Delete Task"
        message="Are you sure you want to delete this task? This action cannot be undone."
        confirmLabel="Delete"
        isLoading={deleteTask.isPending}
      />
    </div>
  );
}
