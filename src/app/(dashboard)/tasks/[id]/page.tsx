"use client";

/**
 * Task 디테일 페이지.
 *
 * - 상단: status badge + workflow 버튼 (담당자 "Submit for review" / 매니저 "Approve" · "Reopen")
 * - 본문: title/description/meta + Edit 버튼 (모달)
 * - Related resources (schedule + checklist 통합 + people)
 * - Attachments (이미지/영상 업로드 + 그리드)
 * - Assignees
 * - Comments timeline (system + user 댓글)
 */

import React, { useState, useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  Calendar,
  Check,
  CheckCircle2,
  Circle,
  ExternalLink,
  MapPin,
  Pencil,
  Play,
  RotateCcw,
  Send,
  ThumbsDown,
  Trash2,
  User,
  Users as UsersIcon,
  X,
  Zap,
} from "lucide-react";

import type {
  Task,
  TaskAttachment,
  TaskComment,
  TaskLinks,
  IssueSeverity,
  Store,
} from "@/types";

import {
  useTask,
  useUpdateTask,
  useDeleteTask,
  useTransitionTask,
  useTaskComments,
  useAddTaskComment,
} from "@/hooks/useTasks";
import { useUsers } from "@/hooks/useUsers";
import { useStores } from "@/hooks/useStores";
import {
  useStoreSchedulesForLink,
  useStoreChecklistInstancesForLink,
} from "@/hooks/useReports";
import { usePermissions } from "@/hooks/usePermissions";
import {
  Badge,
  Button,
  Card,
  Input,
  Lightbox,
  LoadingSpinner,
  Modal,
  Textarea,
} from "@/components/ui";
import { ImageUpload } from "@/components/ui/ImageUpload";
import { DateField } from "@/components/ui/DateField";
import { useModal } from "@/components/ui/imperative-modal";
import { formatFixedDate } from "@/lib/utils";
import { PERMISSIONS } from "@/lib/permissions";
import { ISSUE_SEVERITIES } from "@/types";

const statusBadge: Record<
  Task["status"],
  { label: string; variant: "warning" | "accent" | "success" | "default" }
> = {
  pending: { label: "Pending", variant: "warning" },
  in_progress: { label: "In Progress", variant: "accent" },
  under_review: { label: "Under review", variant: "warning" },
  completed: { label: "Completed", variant: "success" },
};

export default function TaskDetailPage(): React.ReactElement {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;
  const { hasPermission, isGMPlus } = usePermissions();
  const modal = useModal();

  const { data: task, isLoading } = useTask(id);
  const update = useUpdateTask();
  const transition = useTransitionTask();
  const remove = useDeleteTask();

  const [editOpen, setEditOpen] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <LoadingSpinner />
      </div>
    );
  }

  if (!task) {
    return <Card className="p-8 text-center text-textSecondary">Task not found.</Card>;
  }

  const sb = statusBadge[task.status] ?? {
    label: task.status,
    variant: "default" as const,
  };
  const canUpdate = hasPermission(PERMISSIONS.TASKS_UPDATE);
  const canDelete = hasPermission(PERMISSIONS.TASKS_DELETE);
  const canManager = isGMPlus;
  const myAssignee = task.assignees.some(
    (a) =>
      // we don't have current user id easily here — assume canUpdate covers it.
      a.user_id !== null,
  );

  /** Status 전이 — 단순 클릭. 보고/사유는 별도 comment 에서. */
  const handleQuickTransition = async (next: Task["status"]) => {
    try {
      await transition.mutateAsync({ taskId: id, data: { status: next } });
    } catch {
      /* hook 자동 모달 */
    }
  };

  const handleDelete = async () => {
    const ok = await modal.confirm({
      title: "Delete task?",
      message: "This action cannot be undone.",
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;
    try {
      await remove.mutateAsync(id);
      router.push("/tasks");
    } catch {
      /* hook 자동 모달 */
    }
  };

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <button
          onClick={() => router.push("/tasks")}
          className="flex items-center gap-1 text-textSecondary hover:text-text text-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to tasks
        </button>
        {canDelete && (
          <Button
            variant="ghost"
            onClick={handleDelete}
            className="gap-2 text-danger"
          >
            <Trash2 className="w-4 h-4" /> Delete
          </Button>
        )}
      </div>

      {/* 본체 — 한 카드 안에 divider 로 섹션 구분 (게시물 형태) */}
      <Card className="p-6 space-y-5">
        {/* ── HERO ── */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <Badge variant={sb.variant}>{sb.label}</Badge>
              {task.priority === "urgent" && <Badge variant="danger">Urgent</Badge>}
              {task.severity && (
                <Badge
                  variant={
                    task.severity === "critical"
                      ? "danger"
                      : task.severity === "high"
                      ? "warning"
                      : task.severity === "medium"
                      ? "accent"
                      : "default"
                  }
                >
                  {task.severity[0].toUpperCase() + task.severity.slice(1)}
                </Badge>
              )}
              {task.category && (
                <Badge variant="default">{task.category}</Badge>
              )}
              {task.source_report_id && (
                <button
                  onClick={() =>
                    router.push(`/reports/issues/${task.source_report_id}`)
                  }
                  className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-accentMuted text-accent hover:underline"
                >
                  Source report
                  <ExternalLink className="w-3 h-3" />
                </button>
              )}
            </div>
            <h1 className="text-2xl font-bold text-text">
              <Zap className="w-5 h-5 inline-block mr-2 text-accent" />
              {task.title}
            </h1>
            {/* Scope (store(s) / org-wide) */}
            <div className="flex items-start gap-1.5 mt-3 text-xs text-textMuted flex-wrap">
              <MapPin className="w-3 h-3 mt-0.5 shrink-0" />
              {task.store_names && task.store_names.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {task.store_names.map((n, i) => (
                    <span
                      key={i}
                      className="px-1.5 py-0.5 bg-surface border border-border rounded text-text"
                    >
                      {n}
                    </span>
                  ))}
                </div>
              ) : (
                <span className="italic">Organization-wide (all stores)</span>
              )}
            </div>
            {/* Assignees inline */}
            <div className="flex items-start gap-1.5 mt-2 text-xs text-textMuted flex-wrap">
              <UsersIcon className="w-3 h-3 mt-0.5 shrink-0" />
              {task.assignees.length === 0 ? (
                <span className="italic text-danger">No assignees</span>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {task.assignees.map((a, idx) => (
                    <span
                      key={idx}
                      className="px-1.5 py-0.5 bg-accentMuted text-accent rounded font-medium"
                    >
                      {a.user_name ?? "—"}
                    </span>
                  ))}
                </div>
              )}
              {canUpdate && (
                <button
                  onClick={() => setEditOpen(true)}
                  className="text-accent hover:underline ml-1"
                >
                  Edit
                </button>
              )}
            </div>
            {/* 기간 / 작성자 메타 */}
            <div className="flex items-center gap-4 mt-3 text-xs text-textMuted flex-wrap">
              {task.created_by_name && (
                <span className="flex items-center gap-1">
                  <User className="w-3 h-3" />
                  By {task.created_by_name}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                Created {formatFixedDate(task.created_at)}
              </span>
              {task.due_date && (
                <span className="flex items-center gap-1 text-warning font-medium">
                  Due {formatFixedDate(task.due_date)}
                </span>
              )}
            </div>
          </div>
          {canUpdate && (
            <Button
              variant="ghost"
              onClick={() => setEditOpen(true)}
              className="gap-1 shrink-0"
            >
              <Pencil className="w-4 h-4" />
              Edit
            </Button>
          )}
        </div>

        {/* ── DETAILS ── */}
        <div className="border-t border-border pt-5 space-y-4">
          {task.description ? (
            <div className="text-text whitespace-pre-wrap">{task.description}</div>
          ) : (
            <p className="text-textMuted text-sm italic">No description.</p>
          )}

          {task.source_report_id && (
            <div className="bg-surface border border-border rounded-md px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-textMuted mb-1">
                Source Report
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-textSecondary">
                  Opened from an issue report.
                </span>
                <Button
                  variant="ghost"
                  onClick={() =>
                    router.push(`/reports/issues/${task.source_report_id}`)
                  }
                  className="gap-1"
                >
                  View Report
                  <ExternalLink className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}

          <AttachmentsSection
            attachments={task.attachments ?? []}
            canUpdate={canUpdate}
            pending={update.isPending}
            onSave={async (next) => {
              try {
                await update.mutateAsync({
                  taskId: id,
                  data: { attachments: next },
                });
              } catch {
                /* hook 자동 모달 */
              }
            }}
            onPreview={(url) => setLightboxUrl(url)}
          />

          <RelatedResources storeId={task.store_id} links={task.links} />
        </div>

        {/* ── PROGRESS ── */}
        <div className="border-t border-border pt-5">
          <ProgressSection
            task={task}
            canUpdate={canUpdate}
            isManager={canManager}
            pending={transition.isPending}
            onTransition={handleQuickTransition}
          />
        </div>

        {/* ── REVIEW — manager + under_review 일 때만 ── */}
        {canManager && task.status === "under_review" && (
          <div className="border-t border-border pt-5">
            <ReviewSection
              pending={transition.isPending}
              onApprove={() => handleQuickTransition("completed")}
              onReject={() => handleQuickTransition("in_progress")}
            />
          </div>
        )}
      </Card>

      {/* Comments 는 interactive 영역이 길어 별도 카드로 유지 */}
      <CommentsCard taskId={id} canComment={canUpdate} />

      {editOpen && (
        <EditTaskModal
          task={task}
          onClose={() => setEditOpen(false)}
          onSaved={() => setEditOpen(false)}
        />
      )}

      <Lightbox
        isOpen={!!lightboxUrl}
        src={lightboxUrl ?? undefined}
        onClose={() => setLightboxUrl(null)}
      />

      {/* myAssignee is kept for future "is current user an assignee" check. */}
      {!myAssignee && null}
    </div>
  );
}

// ── Progress card — status timeline + 현재 단계 액션 버튼 ─────────────
const PROGRESS_STEPS: { key: Task["status"]; label: string }[] = [
  { key: "pending", label: "Pending" },
  { key: "in_progress", label: "In Progress" },
  { key: "under_review", label: "Under review" },
  { key: "completed", label: "Completed" },
];

function ProgressSection({
  task,
  canUpdate,
  isManager,
  pending,
  onTransition,
}: {
  task: Task;
  canUpdate: boolean;
  isManager: boolean;
  pending: boolean;
  onTransition: (next: Task["status"]) => void;
}): React.ReactElement {
  const currentIdx = PROGRESS_STEPS.findIndex((s) => s.key === task.status);
  return (
    <div className="space-y-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-textSecondary">
        Progress
      </h2>
      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {PROGRESS_STEPS.map((step, idx) => {
          const reached = idx <= currentIdx;
          const active = idx === currentIdx;
          return (
            <React.Fragment key={step.key}>
              <div className="flex flex-col items-center min-w-[88px]">
                <div
                  className={
                    "w-7 h-7 rounded-full flex items-center justify-center transition-colors " +
                    (active
                      ? "bg-accent text-white"
                      : reached
                      ? "bg-accent/40 text-white"
                      : "bg-surface border border-border text-textMuted")
                  }
                >
                  {reached ? (
                    <Check className="w-4 h-4" />
                  ) : (
                    <Circle className="w-4 h-4" />
                  )}
                </div>
                <span
                  className={
                    "mt-1 text-[11px] font-medium " +
                    (active
                      ? "text-text"
                      : reached
                      ? "text-textSecondary"
                      : "text-textMuted")
                  }
                >
                  {step.label}
                </span>
              </div>
              {idx < PROGRESS_STEPS.length - 1 && (
                <div
                  className={
                    "flex-1 h-0.5 " +
                    (idx < currentIdx ? "bg-accent/40" : "bg-border")
                  }
                />
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Timestamps (있을 때만) */}
      <div className="flex flex-wrap gap-3 text-xs text-textMuted border-t border-border pt-3">
        {task.submitted_at && (
          <span>
            Submitted by {task.submitted_by_name ?? "—"} ·{" "}
            {formatFixedDate(task.submitted_at)}
          </span>
        )}
        {task.reviewed_at && task.status === "completed" && (
          <span className="text-success">
            Approved by {task.reviewed_by_name ?? "—"} ·{" "}
            {formatFixedDate(task.reviewed_at)}
          </span>
        )}
        {task.reviewed_at && task.status === "in_progress" && (
          <span className="text-warning">
            Sent back by {task.reviewed_by_name ?? "—"} ·{" "}
            {formatFixedDate(task.reviewed_at)}
          </span>
        )}
      </div>

      {/* 담당자 액션 — 단순 클릭. 보고/사유는 별도 comment 에서. */}
      {canUpdate && task.status === "pending" && (
        <div className="flex items-center justify-between gap-3 bg-surface border border-border rounded-md p-3">
          <span className="text-sm text-textSecondary">
            Ready to start? Mark in-progress and begin work.
          </span>
          <Button
            onClick={() => onTransition("in_progress")}
            disabled={pending}
            className="gap-1.5"
          >
            <Play className="w-4 h-4" /> Start
          </Button>
        </div>
      )}
      {canUpdate && task.status === "in_progress" && (
        <div className="flex items-center justify-between gap-3 bg-surface border border-border rounded-md p-3">
          <span className="text-sm text-textSecondary">
            Done? Send it for review. Use the message box below for your report
            (text + photos).
          </span>
          <Button
            onClick={() => onTransition("under_review")}
            disabled={pending}
            className="gap-1.5"
          >
            <Check className="w-4 h-4" /> Done
          </Button>
        </div>
      )}
      {task.status === "under_review" && !isManager && (
        <p className="text-xs text-textMuted italic">
          Waiting for manager review.
        </p>
      )}
      {canUpdate && task.status === "completed" && isManager && (
        <div className="flex items-center justify-between gap-3 bg-surface border border-border rounded-md p-3">
          <span className="text-sm text-textSecondary">
            Need more work after completion? Leave a message below first.
          </span>
          <Button
            variant="ghost"
            onClick={() => onTransition("in_progress")}
            disabled={pending}
            className="gap-1.5"
          >
            <RotateCcw className="w-4 h-4" /> Reopen
          </Button>
        </div>
      )}
    </div>
  );
}

// ── Review section — 매니저 + submitted 상태 — Confirm / Reject ──────────
function ReviewSection({
  pending,
  onApprove,
  onReject,
}: {
  pending: boolean;
  onApprove: () => void;
  onReject: () => void;
}): React.ReactElement {
  return (
    <div className="space-y-3 border border-accent/30 bg-accentMuted/30 rounded-md p-4">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wide text-accent flex items-center gap-2">
          <ThumbsDown className="w-4 h-4 rotate-180" />
          Review
        </h2>
        <p className="text-sm text-textSecondary mt-1">
          The assignee submitted this task — it is under review. Confirm if the
          work is done, or reject to send it back. (Leave a message below first
          if you want to explain.)
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <button
          type="button"
          onClick={onApprove}
          disabled={pending}
          className="flex items-center justify-center gap-2 px-4 py-3 bg-success text-white rounded-md font-semibold hover:bg-success/90 transition-colors disabled:opacity-50"
        >
          <CheckCircle2 className="w-5 h-5" />
          Confirm
        </button>
        <button
          type="button"
          onClick={onReject}
          disabled={pending}
          className="flex items-center justify-center gap-2 px-4 py-3 bg-danger text-white rounded-md font-semibold hover:bg-danger/90 transition-colors disabled:opacity-50"
        >
          <RotateCcw className="w-5 h-5" />
          Reject
        </button>
      </div>
    </div>
  );
}

// ── Attachments section — Details 카드 안에 inline. ────────────────────
function AttachmentsSection({
  attachments,
  canUpdate,
  pending,
  onSave,
  onPreview,
}: {
  attachments: TaskAttachment[];
  canUpdate: boolean;
  pending: boolean;
  onSave: (next: TaskAttachment[]) => Promise<void>;
  onPreview: (url: string) => void;
}): React.ReactElement | null {
  const [items, setItems] = useState<TaskAttachment[]>(attachments);
  useEffect(() => {
    setItems(attachments);
  }, [attachments]);

  if (items.length === 0 && !canUpdate) return null;

  const handleAdd = async (a: TaskAttachment) => {
    const next = [...items, a];
    setItems(next);
    await onSave(next);
  };
  const handleRemove = async (idx: number) => {
    const next = items.filter((_, i) => i !== idx);
    setItems(next);
    await onSave(next);
  };

  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wide text-textSecondary mb-2">
        Reference attachments
      </div>
      <div className="flex flex-wrap gap-3">
        {items.map((a, idx) => {
          const isImage =
            a.kind === "image" || (a.mime_type ?? "").startsWith("image/");
          const isVideo =
            a.kind === "video" || (a.mime_type ?? "").startsWith("video/");
          return (
            <div
              key={`${a.key}-${idx}`}
              className="relative border border-border rounded-md p-2 bg-surface"
            >
              {isImage && a.url ? (
                <button
                  type="button"
                  onClick={() => onPreview(a.url!)}
                  className="block"
                >
                  <img
                    src={a.url}
                    alt={a.name ?? ""}
                    className="w-28 h-28 object-cover rounded"
                  />
                </button>
              ) : (
                <div className="w-28 h-28 flex items-center justify-center text-2xl text-textSecondary">
                  {isVideo ? "🎬" : "📄"}
                </div>
              )}
              <span className="block text-[11px] text-textSecondary truncate max-w-[112px] mt-1">
                {a.name ?? a.key.split("/").pop()}
              </span>
              {canUpdate && (
                <button
                  type="button"
                  onClick={() => handleRemove(idx)}
                  disabled={pending}
                  className="absolute -top-2 -right-2 bg-danger text-white rounded-full p-0.5"
                  aria-label="Remove"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          );
        })}
        {canUpdate && (
          <div className="border border-dashed border-border rounded-md p-2 hover:border-accent transition-colors">
            <ImageUpload
              value={null}
              onUpload={(url) => {
                const isVideo = /\.(mp4|mov|webm|avi|mkv)(\?|$)/i.test(url);
                handleAdd({
                  key: url,
                  url,
                  kind: isVideo ? "video" : "image",
                });
              }}
              compact
              folder="tasks"
            />
          </div>
        )}
      </div>
    </div>
  );
}


// ── Edit modal — task 의 모든 편집 가능한 필드 통합 ────────────────────
function EditTaskModal({
  task,
  onClose,
  onSaved,
}: {
  task: Task;
  onClose: () => void;
  onSaved: () => void;
}): React.ReactElement {
  const update = useUpdateTask();
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [priority, setPriority] = useState<"normal" | "urgent">(task.priority);
  const [severity, setSeverity] = useState<IssueSeverity | "">(task.severity ?? "");
  const [category, setCategory] = useState(task.category ?? "");
  const [dueDate, setDueDate] = useState<string>(
    task.due_date ? task.due_date.slice(0, 10) : "",
  );
  // Scope (org-wide / specific stores)
  const initialStoreIds = task.store_ids ?? [];
  const [orgWide, setOrgWide] = useState<boolean>(initialStoreIds.length === 0);
  const [storeIds, setStoreIds] = useState<string[]>(initialStoreIds);
  // Assignees
  const [assigneeIds, setAssigneeIds] = useState<string[]>(
    task.assignees.map((a) => a.user_id).filter(Boolean) as string[],
  );

  const { data: stores } = useStores();
  const activeStores = useMemo(
    () => (stores ?? []).filter((s: Store) => s.is_active !== false),
    [stores],
  );

  // Assignees lookup — orgWide / storeIds 에 따라.
  const usersFilter = orgWide
    ? { is_active: true }
    : storeIds.length > 0
    ? { store_ids: storeIds, is_active: true }
    : undefined;
  const { data: availableUsers } = useUsers(usersFilter);
  const sortedUsers = useMemo(() => {
    if (!availableUsers) return [];
    return [...availableUsers].sort((a, b) => {
      if (a.role_priority !== b.role_priority) return a.role_priority - b.role_priority;
      return (a.full_name ?? "").localeCompare(b.full_name ?? "");
    });
  }, [availableUsers]);

  // scope 변경 시: assignee 가 새 user 풀에 없으면 정리.
  useEffect(() => {
    if (!availableUsers) return;
    const validIds = new Set(availableUsers.map((u) => u.id));
    setAssigneeIds((prev) => prev.filter((id) => validIds.has(id)));
  }, [availableUsers]);

  const toggleStore = (sid: string) => {
    setStoreIds((prev) =>
      prev.includes(sid) ? prev.filter((x) => x !== sid) : [...prev, sid],
    );
    setOrgWide(false);
  };

  const handleSave = async () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    if (!orgWide && storeIds.length === 0) return;
    if (assigneeIds.length === 0) return;
    try {
      await update.mutateAsync({
        taskId: task.id,
        data: {
          title: trimmed,
          description: description.trim() || null,
          priority,
          severity: severity ? severity : null,
          category: category || null,
          due_date: dueDate
            ? new Date(`${dueDate}T23:59:59`).toISOString()
            : null,
          store_ids: orgWide ? [] : storeIds,
          assignee_ids: assigneeIds,
        },
      });
      onSaved();
    } catch {
      /* hook 자동 모달 */
    }
  };

  const scopeValid = orgWide || storeIds.length > 0;
  const canSave = !!title.trim() && scopeValid && assigneeIds.length > 0;

  return (
    <Modal isOpen onClose={onClose} title="Edit task" size="lg">
      <div className="space-y-5">
        <div>
          <label className="block text-sm text-textSecondary mb-1">Title *</label>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={500} />
        </div>
        <div>
          <label className="block text-sm text-textSecondary mb-1">Description</label>
          <Textarea
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="block text-sm text-textSecondary mb-1">Category</label>
            <Input value={category} onChange={(e) => setCategory(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm text-textSecondary mb-1">Severity</label>
            <select
              value={severity}
              onChange={(e) => setSeverity(e.target.value as IssueSeverity | "")}
              className="w-full bg-surface border border-border rounded-md px-3 py-2 text-sm text-text"
            >
              <option value="">— None —</option>
              {ISSUE_SEVERITIES.map((s) => (
                <option key={s} value={s}>
                  {s[0].toUpperCase() + s.slice(1)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-textSecondary mb-1">Priority</label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as "normal" | "urgent")}
              className="w-full bg-surface border border-border rounded-md px-3 py-2 text-sm text-text"
            >
              <option value="normal">Normal</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>
          <div>
            <label className="block text-sm text-textSecondary mb-1">Due date</label>
            <DateField value={dueDate} onChange={setDueDate} placeholder="Pick a date" clearable />
          </div>
        </div>

        {/* Scope */}
        <div className="border-t border-border pt-4">
          <label className="block text-sm text-textSecondary mb-2 font-semibold">
            Scope *
          </label>
          <div className="flex items-center gap-3 mb-2">
            <label className="flex items-center gap-1.5 text-sm cursor-pointer">
              <input
                type="radio"
                name="edit-task-scope"
                checked={!orgWide}
                onChange={() => setOrgWide(false)}
                className="accent-accent"
              />
              <span className="text-text">Specific store(s)</span>
            </label>
            <label className="flex items-center gap-1.5 text-sm cursor-pointer">
              <input
                type="radio"
                name="edit-task-scope"
                checked={orgWide}
                onChange={() => {
                  setOrgWide(true);
                  setStoreIds([]);
                }}
                className="accent-accent"
              />
              <span className="text-text">Organization-wide (all stores)</span>
            </label>
          </div>
          {!orgWide && (
            <div className="border border-border rounded-md p-2 bg-surface max-h-40 overflow-auto space-y-0.5">
              {activeStores.length === 0 ? (
                <p className="text-xs text-textMuted italic px-2 py-1">
                  No active stores.
                </p>
              ) : (
                activeStores.map((s) => (
                  <label
                    key={s.id}
                    className="flex items-center gap-2 text-sm cursor-pointer hover:bg-surfaceHover px-2 py-1 rounded"
                  >
                    <input
                      type="checkbox"
                      checked={storeIds.includes(s.id)}
                      onChange={() => toggleStore(s.id)}
                      className="accent-accent"
                    />
                    <span className="text-text">{s.name}</span>
                  </label>
                ))
              )}
            </div>
          )}
          {!scopeValid && (
            <p className="text-xs text-danger mt-1">
              Pick at least one store, or switch to organization-wide.
            </p>
          )}
        </div>

        {/* Assignees */}
        <div className="border-t border-border pt-4">
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm text-textSecondary font-semibold">
              Assignees *
            </label>
            <span className="text-xs text-textMuted">
              {assigneeIds.length} selected
            </span>
          </div>
          {!scopeValid ? (
            <p className="text-xs text-textMuted italic">
              Set scope first to choose assignees.
            </p>
          ) : sortedUsers.length === 0 ? (
            <p className="text-xs text-textMuted italic">
              No staff available for this scope.
            </p>
          ) : (
            <div className="border border-border rounded-md p-2 bg-surface max-h-48 overflow-auto space-y-0.5">
              {sortedUsers.map((u) => (
                <label
                  key={u.id}
                  className="flex items-center gap-2 text-sm cursor-pointer hover:bg-surfaceHover px-2 py-1 rounded"
                >
                  <input
                    type="checkbox"
                    checked={assigneeIds.includes(u.id)}
                    onChange={() =>
                      setAssigneeIds((prev) =>
                        prev.includes(u.id)
                          ? prev.filter((x) => x !== u.id)
                          : [...prev, u.id],
                      )
                    }
                    className="accent-accent"
                  />
                  <span className="text-text">{u.full_name ?? u.username}</span>
                  <span className="text-xs text-textMuted">· {u.role_name}</span>
                </label>
              ))}
            </div>
          )}
          {scopeValid && assigneeIds.length === 0 && (
            <p className="text-xs text-danger mt-1">
              At least one assignee is required.
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2 border-t border-border">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={update.isPending || !canSave}>
            Save
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ── Comments ────────────────────────────────────────────────────────────
function CommentsCard({
  taskId,
  canComment,
}: {
  taskId: string;
  canComment: boolean;
}): React.ReactElement {
  const { data: comments, isLoading } = useTaskComments(taskId);
  const add = useAddTaskComment();
  const [draft, setDraft] = useState("");
  const [draftAttachments, setDraftAttachments] = useState<TaskAttachment[]>([]);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  const addAttachment = (url: string) => {
    const isVideo = /\.(mp4|mov|webm|avi|mkv)(\?|$)/i.test(url);
    setDraftAttachments((prev) => [
      ...prev,
      { key: url, url, kind: isVideo ? "video" : "image" },
    ]);
  };
  const removeAttachment = (idx: number) => {
    setDraftAttachments((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleAdd = async () => {
    const text = draft.trim();
    if (!text && draftAttachments.length === 0) return;
    try {
      await add.mutateAsync({
        taskId,
        content: text,
        attachments: draftAttachments,
      });
      setDraft("");
      setDraftAttachments([]);
    } catch {
      /* hook */
    }
  };

  return (
    <Card className="p-6">
      <h2 className="text-lg font-semibold text-text mb-3">Activity</h2>
      {isLoading ? (
        <LoadingSpinner size="sm" />
      ) : !comments || comments.length === 0 ? (
        <p className="text-textMuted text-sm mb-4">No activity yet.</p>
      ) : (
        <div className="space-y-3 mb-4">
          {comments.map((c) => (
            <CommentRow
              key={c.id}
              comment={c}
              onPreview={(url) => setLightboxUrl(url)}
            />
          ))}
        </div>
      )}
      {canComment && (
        <div className="space-y-2">
          <Textarea
            rows={2}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Write a message…"
          />
          {draftAttachments.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {draftAttachments.map((a, idx) => (
                <div
                  key={`${a.key}-${idx}`}
                  className="relative border border-border rounded-md p-1 bg-surface"
                >
                  {a.kind === "image" && a.url ? (
                    <img
                      src={a.url}
                      alt=""
                      className="w-14 h-14 object-cover rounded"
                    />
                  ) : (
                    <div className="w-14 h-14 flex items-center justify-center text-xl text-textSecondary">
                      {a.kind === "video" ? "🎬" : "📄"}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={() => removeAttachment(idx)}
                    className="absolute -top-1.5 -right-1.5 bg-danger text-white rounded-full p-0.5"
                    aria-label="Remove"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center justify-between gap-2">
            <div className="border border-dashed border-border rounded-md px-2 py-1 hover:border-accent transition-colors">
              <ImageUpload value={null} onUpload={addAttachment} compact folder="tasks" />
            </div>
            <Button
              onClick={handleAdd}
              disabled={
                add.isPending ||
                (!draft.trim() && draftAttachments.length === 0)
              }
            >
              Send
            </Button>
          </div>
        </div>
      )}
      <Lightbox
        isOpen={!!lightboxUrl}
        src={lightboxUrl ?? undefined}
        onClose={() => setLightboxUrl(null)}
      />
    </Card>
  );
}

function CommentRow({
  comment,
  onPreview,
}: {
  comment: TaskComment;
  onPreview: (url: string) => void;
}): React.ReactElement {
  if (comment.kind === "system") {
    return (
      <div className="text-xs text-textMuted italic flex items-center gap-2">
        <span>
          {comment.user_name ?? "—"} · {comment.content} ·{" "}
          {formatFixedDate(comment.created_at)}
        </span>
      </div>
    );
  }
  const attachments = comment.attachments ?? [];
  return (
    <div className="border-l-2 border-accent pl-3">
      <div className="flex items-center gap-2 text-xs text-textMuted mb-1">
        <User className="w-3 h-3" />
        {comment.user_name ?? "—"} · {formatFixedDate(comment.created_at)}
      </div>
      {comment.content && (
        <div className="text-text text-sm whitespace-pre-wrap">
          {comment.content}
        </div>
      )}
      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {attachments.map((a, idx) => {
            const isImage = a.kind === "image";
            return (
              <button
                key={`${a.key}-${idx}`}
                type="button"
                onClick={() => a.url && onPreview(a.url)}
                className="border border-border rounded-md p-1 bg-surface hover:border-accent transition-colors"
              >
                {isImage && a.url ? (
                  <img
                    src={a.url}
                    alt=""
                    className="w-20 h-20 object-cover rounded"
                  />
                ) : (
                  <div className="w-20 h-20 flex items-center justify-center text-xl text-textSecondary">
                    {a.kind === "video" ? "🎬" : "📄"}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── RelatedResources (unchanged from prior cleanup) ─────────────────────
function RelatedResources({
  storeId,
  links,
}: {
  storeId: string | null;
  links?: TaskLinks;
}): React.ReactElement {
  const router = useRouter();
  const schedules = links?.schedule_ids ?? [];
  const checklists = links?.checklist_instance_ids ?? [];
  const people = links?.related_user_ids ?? [];

  const safeStoreId = storeId ?? undefined;
  const { data: schedData } = useStoreSchedulesForLink(safeStoreId);
  const { data: clData } = useStoreChecklistInstancesForLink(safeStoreId);
  const { data: storeUsers } = useUsers(
    safeStoreId ? { store_id: safeStoreId, is_active: true } : undefined,
  );

  const checklistByScheduleId = useMemo(() => {
    const map = new Map<string, { id: string; total: number; completed: number }>();
    (clData?.items ?? []).forEach((c) => {
      if (c.schedule_id) {
        map.set(c.schedule_id, {
          id: c.id,
          total: c.total_items,
          completed: c.completed_items,
        });
      }
    });
    return map;
  }, [clData]);

  const scheduleLabels = useMemo(() => {
    const map = new Map<string, string>();
    (schedData?.items ?? []).forEach((s) => {
      const role =
        s.work_role_name ?? s.work_role_name_snapshot ?? s.position_snapshot;
      const cl = checklistByScheduleId.get(s.id);
      const progress = cl ? `${cl.completed}/${cl.total} checklist` : null;
      const parts = [
        formatFixedDate(s.work_date),
        role,
        s.user_name,
        progress,
      ].filter((p): p is string => !!p && p.trim() !== "");
      map.set(s.id, parts.join(" · "));
    });
    return map;
  }, [schedData, checklistByScheduleId]);

  const checklistLabels = useMemo(() => {
    const map = new Map<string, string>();
    (clData?.items ?? []).forEach((c) => {
      const parts = [
        formatFixedDate(c.work_date),
        c.template_title,
        c.user_name,
      ].filter((p): p is string => !!p && p.trim() !== "");
      map.set(c.id, parts.join(" · "));
    });
    return map;
  }, [clData]);

  const userLabels = useMemo(() => {
    const map = new Map<string, string>();
    (storeUsers ?? []).forEach((u) => {
      const display = u.full_name ?? u.username;
      map.set(u.id, `${display} (${u.role_name})`);
    });
    return map;
  }, [storeUsers]);

  const scheduleLinkedChecklistIds = useMemo(() => {
    const set = new Set<string>();
    schedules.forEach((sid) => {
      const cl = checklistByScheduleId.get(sid);
      if (cl) set.add(cl.id);
    });
    return set;
  }, [schedules, checklistByScheduleId]);

  const standaloneChecklistIds = checklists.filter(
    (id) => !scheduleLinkedChecklistIds.has(id),
  );

  const hasAny =
    schedules.length || standaloneChecklistIds.length || people.length;

  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-textSecondary mb-2">
        Related Resources
      </h3>
      {!hasAny ? (
        <p className="text-sm text-textMuted italic">— No related resources linked.</p>
      ) : (
        <div className="space-y-2 text-sm">
          <ResourceRow
            label="Schedules"
            ids={schedules}
            labels={scheduleLabels}
            onClick={(id) => router.push(`/schedules/${id}`)}
          />
          <ResourceRow
            label="Checklists"
            ids={standaloneChecklistIds}
            labels={checklistLabels}
            onClick={(id) => router.push(`/checklists/instances/${id}`)}
          />
          <ResourceRow label="Related people" ids={people} labels={userLabels} />
        </div>
      )}
    </div>
  );
}

function ResourceRow({
  label,
  ids,
  labels,
  onClick,
}: {
  label: string;
  ids: string[];
  labels?: Map<string, string>;
  onClick?: (id: string) => void;
}): React.ReactElement | null {
  if (ids.length === 0) return null;
  return (
    <div className="flex items-start gap-2">
      <span className="text-textSecondary text-xs uppercase tracking-wide min-w-[120px] mt-1">
        {label}
      </span>
      <div className="flex flex-wrap gap-2">
        {ids.map((id) => {
          const text = labels?.get(id) ?? `${id.slice(0, 8)}…`;
          return (
            <button
              key={id}
              onClick={onClick ? () => onClick(id) : undefined}
              disabled={!onClick}
              className={
                onClick
                  ? "px-2 py-1 bg-surface border border-border rounded text-xs text-text hover:border-accent hover:text-accent transition-colors"
                  : "px-2 py-1 bg-surface border border-border rounded text-xs text-textSecondary cursor-default"
              }
            >
              {text}
            </button>
          );
        })}
      </div>
    </div>
  );
}
