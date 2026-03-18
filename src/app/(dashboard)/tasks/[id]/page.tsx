"use client";

import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import {
  ArrowLeft,
  Calendar,
  Clock,
  Edit2,
  FileText,
  Image,
  Trash2,
  User,
} from "lucide-react";
import { useTask, useUpdateTask, useDeleteTask, useTaskEvidences } from "@/hooks";
import { useTimezone } from "@/hooks/useTimezone";
import type { TaskEvidence } from "@/types";
import {
  Button,
  Card,
  Badge,
  Modal,
  Input,
  Textarea,
  Select,
  ConfirmDialog,
  LoadingSpinner,
} from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { formatDateTime, formatFixedDate, timeAgo, parseApiError } from "@/lib/utils";


/** 추가 업무 상세 페이지 — 업무 상세 조회, 수정, 상태 변경, 삭제.
 *
 * Additional Task detail page — view, edit, status change, and delete.
 */
export default function TaskDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const tz = useTimezone();

  const { data: task, isLoading } = useTask(id);
  const { data: evidences, isLoading: evidencesLoading } = useTaskEvidences(id);
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();

  const [showEdit, setShowEdit] = useState<boolean>(false);
  const [showDelete, setShowDelete] = useState<boolean>(false);

  /* ── 수정 폼 상태 (Edit form state) ── */
  const [editTitle, setEditTitle] = useState<string>("");
  const [editDesc, setEditDesc] = useState<string>("");
  const [editPriority, setEditPriority] = useState<string>("normal");
  const [editStatus, setEditStatus] = useState<string>("pending");
  const [editDueDate, setEditDueDate] = useState<string>("");

  /** 수정 모달을 열고 기존 값을 폼에 채웁니다.
   *  Open edit modal and populate form with current values. */
  const openEdit = (): void => {
    if (!task) return;
    setEditTitle(task.title);
    setEditDesc(task.description || "");
    setEditPriority(task.priority);
    setEditStatus(task.status);
    setEditDueDate(task.due_date || "");
    setShowEdit(true);
  };

  /** 수정 사항을 서버에 제출합니다.
   *  Submit edits to server. */
  const handleUpdate = (): void => {
    const payload: Record<string, string | undefined> = {
      title: editTitle,
      description: editDesc || undefined,
      priority: editPriority,
      status: editStatus,
      due_date: editDueDate || undefined,
    };
    updateTask.mutate(
      { id, ...payload },
      {
        onSuccess: () => {
          toast({ type: "success", message: "업무가 수정되었습니다 (Task updated)" });
          setShowEdit(false);
        },
        onError: (err) => toast({ type: "error", message: parseApiError(err, "수정 실패 (Update failed)") }),
      }
    );
  };

  /** 업무를 삭제하고 목록으로 이동합니다.
   *  Delete task and navigate back to list. */
  const handleDelete = (): void => {
    deleteTask.mutate(id, {
      onSuccess: () => {
        toast({ type: "success", message: "업무가 삭제되었습니다 (Task deleted)" });
        router.push("/tasks");
      },
      onError: (err) => toast({ type: "error", message: parseApiError(err, "삭제 실패 (Delete failed)") }),
    });
  };

  /** 상태를 빠르게 변경합니다.
   *  Quick status change. */
  const quickStatus = (status: "pending" | "in_progress" | "completed"): void => {
    updateTask.mutate(
      { id, status },
      {
        onSuccess: () =>
          toast({ type: "success", message: "상태가 변경되었습니다 (Status changed)" }),
        onError: (err) => toast({ type: "error", message: parseApiError(err, "상태 변경 실패 (Status change failed)") }),
      }
    );
  };

  /* ── 우선순위 배지 매핑 (Priority badge map) ── */
  const priorityBadge: Record<string, { variant: "danger" | "default"; label: string }> = {
    urgent: { variant: "danger", label: "Urgent" },
    normal: { variant: "default", label: "Normal" },
  };

  /* ── 상태 배지 매핑 (Status badge map) ── */
  const statusBadge: Record<string, { variant: "warning" | "accent" | "success"; label: string }> = {
    pending: { variant: "warning", label: "Pending" },
    in_progress: { variant: "accent", label: "In Progress" },
    completed: { variant: "success", label: "Completed" },
  };

  if (isLoading) return <LoadingSpinner size="lg" className="mt-32" />;
  if (!task) {
    return (
      <div className="text-center py-20 text-text-secondary">
        업무를 찾을 수 없습니다 (Task not found)
      </div>
    );
  }

  const pBadge = priorityBadge[task.priority] || priorityBadge.normal;
  const sBadge = statusBadge[task.status] || statusBadge.pending;

  return (
    <div>
      {/* ── 헤더 (Header) ── */}
      <div className="flex items-center gap-2 md:gap-3 mb-6 flex-wrap">
        <button
          onClick={() => router.push("/tasks")}
          className="p-1.5 rounded-lg hover:bg-surface-hover text-text-secondary transition-colors shrink-0"
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-xl md:text-2xl font-extrabold flex-1 min-w-0 truncate">{task.title}</h1>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="secondary" size="sm" onClick={openEdit}>
            <Edit2 size={14} className="mr-1" /> Edit
          </Button>
          <Button variant="danger" size="sm" onClick={() => setShowDelete(true)}>
            <Trash2 size={14} className="mr-1" /> Delete
          </Button>
        </div>
      </div>

      {/* ── 상세 카드 (Detail card) ── */}
      <Card className="p-6 space-y-5">
        {/* 배지 행 (Badge row) */}
        <div className="flex items-center gap-2">
          <Badge variant={pBadge.variant}>{pBadge.label}</Badge>
          <Badge variant={sBadge.variant}>{sBadge.label}</Badge>
        </div>

        {/* 설명 (Description) */}
        {task.description && (
          <div>
            <div className="text-xs text-text-muted mb-1">Description</div>
            <p className="text-sm text-text-secondary whitespace-pre-wrap">
              {task.description}
            </p>
          </div>
        )}

        {/* 메타 정보 그리드 (Meta info grid) */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          {task.store_name && (
            <div>
              <div className="text-xs text-text-muted mb-0.5">Store</div>
              <div className="text-text">{task.store_name}</div>
            </div>
          )}
          {task.due_date && (
            <div>
              <div className="text-xs text-text-muted mb-0.5">
                <Calendar size={12} className="inline mr-1" />
                Due Date
              </div>
              <div className="text-text">{formatFixedDate(task.due_date)}</div>
            </div>
          )}
          <div>
            <div className="text-xs text-text-muted mb-0.5">
              <User size={12} className="inline mr-1" />
              Created By
            </div>
            <div className="text-text">{task.created_by_name ?? "Unknown"}</div>
          </div>
          <div>
            <div className="text-xs text-text-muted mb-0.5">
              <Clock size={12} className="inline mr-1" />
              Created At
            </div>
            <div className="text-text">{formatDateTime(task.created_at, tz)}</div>
          </div>
        </div>

        {/* 담당자 목록 (Assignees) */}
        {task.assignee_names.length > 0 && (
          <div>
            <div className="text-xs text-text-muted mb-1">Assignees</div>
            <div className="flex flex-wrap gap-1.5">
              {task.assignee_names.map((name: string) => (
                <Badge key={name} variant="accent">
                  {name}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* 빠른 상태 변경 (Quick status change) */}
        {task.status !== "completed" && (
          <div className="pt-3 border-t border-border">
            <div className="text-xs text-text-muted mb-2">Quick Status Change</div>
            <div className="flex gap-2">
              {task.status !== "pending" && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => quickStatus("pending")}
                  isLoading={updateTask.isPending}
                >
                  Pending
                </Button>
              )}
              {task.status !== "in_progress" && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => quickStatus("in_progress")}
                  isLoading={updateTask.isPending}
                >
                  In Progress
                </Button>
              )}
              <Button
                variant="primary"
                size="sm"
                onClick={() => quickStatus("completed")}
                isLoading={updateTask.isPending}
              >
                Complete
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* ── 증빙 섹션 (Evidence Section) ── */}
      <Card className="p-6 mt-6">
        <div className="flex items-center gap-2 mb-4">
          <Image size={16} className="text-text-secondary" />
          <h2 className="text-lg font-bold">Evidence</h2>
          {evidences && evidences.length > 0 && (
            <Badge variant="accent">{evidences.length}</Badge>
          )}
        </div>

        {evidencesLoading ? (
          <div className="text-sm text-text-muted py-4">Loading evidences...</div>
        ) : !evidences || evidences.length === 0 ? (
          <div className="text-sm text-text-muted py-4">
            No evidence submitted yet.
          </div>
        ) : (
          <div className="space-y-3">
            {evidences.map((evidence: TaskEvidence) => (
              <div
                key={evidence.id}
                className="flex gap-4 p-3 rounded-lg bg-surface-hover border border-border"
              >
                {/* 파일 미리보기 (File preview) */}
                {evidence.file_type === "photo" ? (
                  <a
                    href={evidence.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-shrink-0 w-20 h-20 rounded-md overflow-hidden bg-bg border border-border"
                  >
                    <img
                      src={evidence.file_url}
                      alt="Evidence"
                      className="w-full h-full object-cover"
                    />
                  </a>
                ) : (
                  <a
                    href={evidence.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-shrink-0 w-20 h-20 rounded-md bg-bg border border-border flex items-center justify-center"
                  >
                    <FileText size={28} className="text-text-muted" />
                  </a>
                )}

                {/* 증빙 정보 (Evidence info) */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-sm">
                    <User size={12} className="text-text-muted" />
                    <span className="text-text">
                      {evidence.user_name || "Unknown"}
                    </span>
                    <span className="text-text-muted">
                      {timeAgo(evidence.created_at)}
                    </span>
                  </div>
                  {evidence.note && (
                    <p className="text-sm text-text-secondary mt-1 truncate">
                      {evidence.note}
                    </p>
                  )}
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="default">{evidence.file_type}</Badge>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ── 수정 모달 (Edit Modal) ── */}
      <Modal
        isOpen={showEdit}
        onClose={() => setShowEdit(false)}
        title="Edit Task"
      >
        <div className="space-y-4">
          <Input
            label="Title"
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
          />
          <Textarea
            label="Description"
            value={editDesc}
            onChange={(e) => setEditDesc(e.target.value)}
            rows={3}
          />
          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Priority"
              value={editPriority}
              onChange={(e) => setEditPriority(e.target.value)}
              options={[
                { value: "normal", label: "Normal" },
                { value: "urgent", label: "Urgent" },
              ]}
            />
            <Select
              label="Status"
              value={editStatus}
              onChange={(e) => setEditStatus(e.target.value)}
              options={[
                { value: "pending", label: "Pending" },
                { value: "in_progress", label: "In Progress" },
                { value: "completed", label: "Completed" },
              ]}
            />
          </div>
          <Input
            label="Due Date"
            type="date"
            value={editDueDate}
            onChange={(e) => setEditDueDate(e.target.value)}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => setShowEdit(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpdate} isLoading={updateTask.isPending}>
              Save
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── 삭제 확인 (Delete Confirm) ── */}
      <ConfirmDialog
        isOpen={showDelete}
        onClose={() => setShowDelete(false)}
        onConfirm={handleDelete}
        title="Delete Task"
        message={`"${task.title}" 업무를 삭제하시겠습니까? (Delete this task?)`}
        isLoading={deleteTask.isPending}
      />
    </div>
  );
}
