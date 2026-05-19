"use client";

/**
 * Issue Report 디테일 페이지.
 *
 * Status / Level / Category 명시 라벨, 작성자+관리자 edit, promote(Open Issue),
 * 상태 전이 (Mark In Progress / Close), 댓글, 첨부.
 */

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  Calendar,
  ExternalLink,
  MapPin,
  MessageSquare,
  Pencil,
  Send,
  Trash2,
  User,
} from "lucide-react";

import {
  useReport,
  useAddReportComment,
  useDeleteReport,
  useTransitionIssue,
  useUpdateReport,
  useStoreSchedulesForLink,
  useStoreChecklistInstancesForLink,
} from "@/hooks/useReports";
import { useUsers } from "@/hooks/useUsers";
import { useTask } from "@/hooks/useTasks";
import { useAuthStore } from "@/stores/authStore";
import { usePermissions } from "@/hooks/usePermissions";
import {
  Badge,
  Button,
  Card,
  Input,
  LoadingSpinner,
  Lightbox,
  Modal,
  Textarea,
} from "@/components/ui";
import { useModal } from "@/components/ui/imperative-modal";
import { formatFixedDate } from "@/lib/utils";
import { PERMISSIONS } from "@/lib/permissions";
import { LinkPicker, type LinkValues } from "@/components/reports/LinkPicker";
import {
  ISSUE_CATEGORIES,
  ISSUE_SEVERITIES,
  type IssueAttachment,
  type IssueReportPayload,
  type IssueSeverity,
} from "@/types";

const statusMeta: Record<
  string,
  { label: string; variant: "warning" | "accent" | "success" | "default" }
> = {
  open: { label: "Open", variant: "warning" },
  in_progress: { label: "In Progress", variant: "accent" },
  closed: { label: "Closed", variant: "success" },
};

const severityMeta: Record<
  string,
  { label: string; variant: "default" | "warning" | "danger" | "accent" }
> = {
  low: { label: "Low", variant: "default" },
  medium: { label: "Medium", variant: "accent" },
  high: { label: "High", variant: "warning" },
  critical: { label: "Critical", variant: "danger" },
};

export default function IssueReportDetailPage(): React.ReactElement {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;
  const { hasPermission, isGMPlus } = usePermissions();
  const { user } = useAuthStore();
  const modal = useModal();

  const { data: report, isLoading } = useReport(id);
  const transition = useTransitionIssue();
  const addComment = useAddReportComment();
  const deleteReport = useDeleteReport();
  const updateReport = useUpdateReport();

  // linked task 가 stale 인지 확인용 — 화면에 stale 상태 표시 + 사용자가 명시적으로 unlink.
  // payload 에는 신규 키 linked_task_id 와 구버전 키 linked_issue_id 둘 다 인식.
  const reportPayloadEarly = (report?.payload ?? {}) as Partial<IssueReportPayload>;
  const linkedTaskIdEarly =
    (reportPayloadEarly as { linked_task_id?: string; linked_issue_id?: string })
      .linked_task_id ??
    (reportPayloadEarly as { linked_issue_id?: string }).linked_issue_id ??
    "";
  const linkedTaskQuery = useTask(linkedTaskIdEarly);
  const linkedTaskStale =
    !!linkedTaskIdEarly &&
    linkedTaskQuery.isFetched &&
    (linkedTaskQuery.isError || !linkedTaskQuery.data);

  const [comment, setComment] = useState<string>("");
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <LoadingSpinner />
      </div>
    );
  }

  if (!report) {
    return (
      <Card className="p-8 text-center text-textSecondary">
        Issue report not found.
      </Card>
    );
  }

  const p = (report.payload ?? {}) as Partial<IssueReportPayload>;
  const sb = statusMeta[report.status] ?? { label: report.status, variant: "default" as const };
  const sv = p.severity ? severityMeta[p.severity] : null;
  const isClosed = report.status === "closed";
  const linkedTaskId =
    (p as { linked_task_id?: string }).linked_task_id ??
    (p as { linked_issue_id?: string }).linked_issue_id;

  const isAuthor = user?.id === report.author_id;
  const canManager = isGMPlus;
  const canEdit =
    !isClosed &&
    hasPermission(PERMISSIONS.REPORTS_UPDATE) &&
    (isAuthor || canManager);
  const canTransition = canManager && hasPermission(PERMISSIONS.REPORTS_UPDATE);
  const canDelete = hasPermission(PERMISSIONS.REPORTS_DELETE);
  const canComment = hasPermission(PERMISSIONS.REPORTS_UPDATE);
  const canPromote =
    !isClosed &&
    !linkedTaskId &&
    canManager &&
    hasPermission(PERMISSIONS.TASKS_CREATE);

  // "Open Task" 클릭 시 즉시 promote 하지 않고 task 작성 폼으로 이동.
  // 작성 폼이 source_report 를 자동 prefill (제목·본문·severity·links·매장)
  // — 사용자가 담당자/우선순위 등을 직접 채우고 Submit 누를 때 생성.
  const handleOpenTaskDraft = () => {
    router.push(`/tasks/new?source_report=${id}`);
  };

  // Linked task 가 삭제됐을 때 사용자가 명시적으로 unlink. update_report 로 payload 갱신.
  // 신/구 키 모두 정리.
  const handleUnlinkTask = async () => {
    if (!report) return;
    const nextPayload: Record<string, unknown> = {
      ...(report.payload as Record<string, unknown>),
    };
    delete nextPayload.linked_task_id;
    delete nextPayload.linked_issue_id;
    try {
      await updateReport.mutateAsync({ reportId: id, data: { payload: nextPayload } });
    } catch {
      // hook 자동 모달
    }
  };

  const handleTransition = async (next: "open" | "in_progress" | "closed") => {
    try {
      await transition.mutateAsync({ reportId: id, status: next });
    } catch {
      // 훅이 모달 띄움
    }
  };

  const handleComment = async () => {
    const content = comment.trim();
    if (!content) return;
    try {
      await addComment.mutateAsync({ reportId: id, content });
      setComment("");
    } catch {
      // 훅이 모달 띄움
    }
  };

  const handleDelete = async () => {
    const ok = await modal.confirm({
      title: "Delete report?",
      message: "This action cannot be undone.",
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;
    try {
      await deleteReport.mutateAsync(id);
      router.push("/reports/issues");
    } catch {
      // hook 자동 모달
    }
  };

  const attachments: IssueAttachment[] = p.attachments ?? [];

  return (
    <div className="max-w-4xl space-y-6">
      <div className="flex items-center justify-between gap-3">
        <button
          onClick={() => router.push("/reports/issues")}
          className="flex items-center gap-1 text-textSecondary hover:text-text text-sm"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to issue reports
        </button>
        {canDelete && (
          <Button
            variant="ghost"
            onClick={handleDelete}
            className="gap-2 text-danger"
          >
            <Trash2 className="w-4 h-4" />
            Delete
          </Button>
        )}
      </div>

      <Card className="p-6 space-y-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            {report.store_name && (
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-accentMuted text-accent text-xs font-semibold uppercase tracking-wide mb-3">
                <MapPin className="w-3.5 h-3.5" />
                {report.store_name}
              </div>
            )}
            <h1 className="text-2xl font-bold text-text">
              <AlertTriangle className="w-5 h-5 inline-block mr-2 text-warning" />
              {report.title ?? "(no title)"}
            </h1>
            <div className="flex items-center gap-4 mt-3 text-xs text-textMuted flex-wrap">
              {report.author_name && (
                <span className="flex items-center gap-1">
                  <User className="w-3 h-3" />
                  {report.author_name}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                {formatFixedDate(report.created_at)}
              </span>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap justify-end">
            {canEdit && (
              <Button variant="ghost" onClick={() => setEditOpen(true)} className="gap-1">
                <Pencil className="w-4 h-4" />
                Edit
              </Button>
            )}
            {canTransition && !isClosed && (
              <>
                {report.status === "open" && (
                  <Button
                    variant="primary"
                    onClick={() => handleTransition("in_progress")}
                    disabled={transition.isPending}
                  >
                    Mark In Progress
                  </Button>
                )}
                {report.status === "in_progress" && (
                  <Button
                    variant="primary"
                    onClick={() => handleTransition("closed")}
                    disabled={transition.isPending}
                  >
                    Mark Closed
                  </Button>
                )}
              </>
            )}
          </div>
        </div>

        {/* Explicit labels: Status / Severity / Category */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 border-y border-border py-4">
          <LabelPair label="Status">
            <Badge variant={sb.variant}>{sb.label}</Badge>
          </LabelPair>
          <LabelPair label="Severity">
            {sv ? (
              <Badge variant={sv.variant}>{sv.label}</Badge>
            ) : (
              <span className="text-textMuted text-sm">—</span>
            )}
          </LabelPair>
          <LabelPair label="Category">
            {p.category ? (
              <Badge variant="default">{p.category}</Badge>
            ) : (
              <span className="text-textMuted text-sm">—</span>
            )}
          </LabelPair>
        </div>

        {/* Related Resources — schedule / checklist instance / position / work role */}
        <RelatedResources storeId={report.store_id} links={p.links} />

        {/* Linked Task (work item) — promote 상태 명시 */}
        <div className="flex items-center justify-between gap-3 bg-surface border border-border rounded-md px-4 py-3">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wide text-textMuted">
              Linked Task (Work Item)
            </div>
            <div className="mt-1 text-sm">
              {linkedTaskId && linkedTaskStale ? (
                <span className="text-warning">
                  Linked task no longer exists — unlink to allow reopening.
                </span>
              ) : linkedTaskId ? (
                <span className="text-success">Opened — see linked task →</span>
              ) : (
                <span className="text-textMuted">Not opened yet</span>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            {linkedTaskId && linkedTaskStale ? (
              <Button
                variant="ghost"
                onClick={handleUnlinkTask}
                disabled={updateReport.isPending}
                className="gap-1"
              >
                <Trash2 className="w-4 h-4" /> Unlink
              </Button>
            ) : linkedTaskId ? (
              <Button
                variant="ghost"
                onClick={() => router.push(`/tasks/${linkedTaskId}`)}
                className="gap-1"
              >
                View Task
                <ExternalLink className="w-4 h-4" />
              </Button>
            ) : canPromote ? (
              <Button
                variant="primary"
                onClick={handleOpenTaskDraft}
              >
                Open Task
              </Button>
            ) : (
              <span className="text-xs text-textMuted italic">
                A manager can open it as a work item.
              </span>
            )}
          </div>
        </div>

        {p.description && (
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-textSecondary mb-2">
              Description
            </h3>
            <p className="text-text whitespace-pre-wrap">{p.description}</p>
          </div>
        )}

        {attachments.length > 0 && (
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-textSecondary mb-2">
              Attachments
            </h3>
            <div className="flex flex-wrap gap-3">
              {attachments.map((a, idx) => {
                const url = a.url ?? a.key;
                if (a.kind === "video") {
                  return (
                    <video
                      key={idx}
                      src={url}
                      controls
                      className="max-w-[280px] rounded-md border border-border"
                    />
                  );
                }
                return (
                  <button
                    key={idx}
                    onClick={() => setLightboxUrl(url)}
                    className="rounded-md border border-border overflow-hidden hover:border-accent transition-colors"
                  >
                    <img
                      src={url}
                      alt={a.name ?? `attachment-${idx}`}
                      className="w-32 h-32 object-cover"
                    />
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </Card>

      <Card className="p-6">
        <h2 className="text-lg font-semibold text-text mb-4 flex items-center gap-2">
          <MessageSquare className="w-5 h-5" />
          Comments
          {report.comment_count > 0 && (
            <span className="text-textMuted text-sm font-normal">
              ({report.comment_count})
            </span>
          )}
        </h2>

        <div className="space-y-3 mb-4">
          {(report.comments ?? []).map((c) => (
            <div
              key={c.id}
              className="bg-surface border border-border rounded-md p-3"
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-text font-medium text-sm">
                  {c.user_name ?? "Unknown"}
                </span>
                <span className="text-xs text-textMuted">
                  {formatFixedDate(c.created_at)}
                </span>
              </div>
              <p className="text-text text-sm whitespace-pre-wrap">{c.content}</p>
            </div>
          ))}
          {(report.comments ?? []).length === 0 && (
            <p className="text-textMuted text-sm text-center py-4">
              No comments yet.
            </p>
          )}
        </div>

        {canComment && (
          <div className="space-y-2">
            <Textarea
              rows={3}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Write a comment…"
            />
            <div className="flex justify-end">
              <Button
                onClick={handleComment}
                disabled={!comment.trim() || addComment.isPending}
                className="gap-2"
              >
                <Send className="w-4 h-4" />
                Post
              </Button>
            </div>
          </div>
        )}
      </Card>

      <Lightbox
        isOpen={!!lightboxUrl}
        src={lightboxUrl ?? undefined}
        onClose={() => setLightboxUrl(null)}
      />

      {editOpen && (
        <EditIssueReportModal
          reportId={id}
          storeId={report.store_id}
          initialTitle={report.title ?? ""}
          initialPayload={p}
          onClose={() => setEditOpen(false)}
          onSaved={() => setEditOpen(false)}
          updateMutation={updateReport}
        />
      )}
    </div>
  );
}

function RelatedResources({
  storeId,
  links,
}: {
  storeId: string | null;
  links?: {
    schedule_ids?: string[];
    checklist_instance_ids?: string[];
    position_ids?: string[];
    work_role_ids?: string[];
    related_user_ids?: string[];
  };
}): React.ReactElement {
  const router = useRouter();
  const schedules = links?.schedule_ids ?? [];
  const checklists = links?.checklist_instance_ids ?? [];
  // position_ids / work_role_ids 는 legacy — UI 에 안 보임 (data 만 보존).
  const people = links?.related_user_ids ?? [];

  // Name lookups — fetched per-store and cached by React Query.
  const safeStoreId = storeId ?? undefined;
  const { data: schedData } = useStoreSchedulesForLink(safeStoreId);
  const { data: clData } = useStoreChecklistInstancesForLink(safeStoreId);
  const { data: storeUsers } = useUsers(
    safeStoreId ? { store_id: safeStoreId, is_active: true } : undefined,
  );

  // schedule → 1:1 매핑된 checklist instance lookup.
  const checklistByScheduleId = React.useMemo(() => {
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

  // schedule chip 라벨에 매핑된 checklist 진행률 같이 표시.
  const scheduleLabels = React.useMemo(() => {
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

  const checklistLabels = React.useMemo(() => {
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

  const userLabels = React.useMemo(() => {
    const map = new Map<string, string>();
    (storeUsers ?? []).forEach((u) => {
      const display = u.full_name ?? u.username;
      map.set(u.id, `${display} (${u.role_name})`);
    });
    return map;
  }, [storeUsers]);

  // schedule 에 매핑된 checklist 은 schedule 라인에 합쳐 표시. standalone 체크리스트만
  // 별도 섹션 (schedule 없는 ad-hoc instance 케이스 대응).
  const scheduleLinkedChecklistIds = React.useMemo(() => {
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

function LabelPair({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-wide text-textMuted mb-1.5">
        {label}
      </div>
      <div>{children}</div>
    </div>
  );
}

function EditIssueReportModal({
  reportId,
  storeId,
  initialTitle,
  initialPayload,
  onClose,
  onSaved,
  updateMutation,
}: {
  reportId: string;
  storeId: string | null;
  initialTitle: string;
  initialPayload: Partial<IssueReportPayload>;
  onClose: () => void;
  onSaved: () => void;
  updateMutation: ReturnType<typeof useUpdateReport>;
}): React.ReactElement {
  const [title, setTitle] = useState(initialTitle);
  const [category, setCategory] = useState<string>(
    initialPayload.category ?? "other",
  );
  const [severity, setSeverity] = useState<IssueSeverity>(
    (initialPayload.severity as IssueSeverity) ?? "medium",
  );
  const [description, setDescription] = useState<string>(
    initialPayload.description ?? "",
  );
  const [shareWithStore, setShareWithStore] = useState<boolean>(
    Boolean(
      (initialPayload as { share_with_store_all?: boolean }).share_with_store_all,
    ),
  );
  const [links, setLinks] = useState<LinkValues>({
    schedule_ids: initialPayload.links?.schedule_ids ?? [],
    checklist_instance_ids: initialPayload.links?.checklist_instance_ids ?? [],
    position_ids: initialPayload.links?.position_ids ?? [],
    work_role_ids: initialPayload.links?.work_role_ids ?? [],
    related_user_ids: initialPayload.links?.related_user_ids ?? [],
    related_roles: initialPayload.links?.related_roles ?? [],
  });

  const handleSave = async () => {
    try {
      // payload는 통째 PUT (서버는 받은 payload로 교체). 모달은 훅이 처리.
      await updateMutation.mutateAsync({
        reportId,
        data: {
          title: title.trim() || undefined,
          payload: {
            ...initialPayload,
            category,
            severity,
            description: description.trim() || null,
            share_with_store_all: shareWithStore,
            links: {
              ...(initialPayload.links ?? {}),
              schedule_ids: links.schedule_ids,
              checklist_instance_ids: links.checklist_instance_ids,
              position_ids: links.position_ids,
              work_role_ids: links.work_role_ids,
              related_user_ids: links.related_user_ids,
              related_roles: links.related_roles,
            },
          } as unknown as Record<string, unknown>,
        },
      });
      onSaved();
    } catch {
      // 훅이 모달 띄움
    }
  };

  return (
    <Modal isOpen onClose={onClose} title="Edit issue report" size="md">
      <div className="space-y-4">
        <div>
          <label className="block text-sm text-textSecondary mb-1">Title</label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={200}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm text-textSecondary mb-1">
              Category
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full bg-surface border border-border rounded-md px-3 py-2 text-sm text-text"
            >
              {ISSUE_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-textSecondary mb-1">
              Severity
            </label>
            <select
              value={severity}
              onChange={(e) => setSeverity(e.target.value as IssueSeverity)}
              className="w-full bg-surface border border-border rounded-md px-3 py-2 text-sm text-text"
            >
              {ISSUE_SEVERITIES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="block text-sm text-textSecondary mb-1">
            Description
          </label>
          <Textarea
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className="flex items-start gap-2 bg-surface border border-border rounded-md p-3">
          <input
            type="checkbox"
            id="share-with-store"
            checked={shareWithStore}
            onChange={(e) => setShareWithStore(e.target.checked)}
            className="accent-accent mt-0.5"
          />
          <label htmlFor="share-with-store" className="text-sm text-text cursor-pointer flex-1">
            <span className="font-medium">Share with entire store</span>
            <p className="text-xs text-textMuted mt-0.5">
              All staff at this store can see this report (not just managers + named viewers).
            </p>
          </label>
        </div>

        <div className="border-t border-border pt-4">
          <label className="block text-sm text-textSecondary mb-2">
            Related schedule / checklist
          </label>
          <LinkPicker storeId={storeId} value={links} onChange={setLinks} />
        </div>
        <div className="flex justify-end gap-2 pt-2 border-t border-border">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={updateMutation.isPending}
          >
            Save
          </Button>
        </div>
      </div>
    </Modal>
  );
}
