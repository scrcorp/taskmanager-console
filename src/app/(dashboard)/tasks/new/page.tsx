"use client";

/**
 * 새 Task 작성 페이지.
 *
 * 흐름:
 *   1. 페이지 상단에 "Pre-fill from issue report (optional)" 셀렉터.
 *      URL `?source_report=XXX` 로 들어오면 자동 선택 + title/description/severity 자동 채움.
 *   2. Store / Title / Description / Priority·Severity·Due / Related items / Assignees.
 *   3. Server 가 source_report_id 받으면 links 자동 계승 + linked_task_id 설정.
 */

import React, {
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ExternalLink,
  FileText,
  Paperclip,
  Plus,
  Sparkles,
  X,
  Zap,
} from "lucide-react";

import { useCreateTask } from "@/hooks/useTasks";
import { useStores } from "@/hooks/useStores";
import {
  useReport,
  useReports,
  useLookupReportTemplate,
} from "@/hooks/useReports";
import {
  Button,
  Card,
  Input,
  LoadingSpinner,
  Textarea,
} from "@/components/ui";
import { DateField } from "@/components/ui/DateField";
import { ImageUpload } from "@/components/ui/ImageUpload";
import {
  AssigneesPicker,
  type AssigneesValue,
} from "@/components/tasks/AssigneesPicker";
import {
  RelatedSchedulesPicker,
  type RelatedSchedulesValue,
} from "@/components/tasks/RelatedSchedulesPicker";
import { useTimezone } from "@/hooks/useTimezone";
import { todayInTimezone } from "@/lib/utils";
import {
  ISSUE_CATEGORIES,
  ISSUE_SEVERITIES,
  type IssueReportPayload,
  type IssueSeverity,
  type Report,
  type Store,
  type TaskAttachment,
} from "@/types";

function NewTaskPageBody(): React.ReactElement {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlSourceReportId = searchParams.get("source_report") ?? "";
  const create = useCreateTask();
  const orgTz = useTimezone();
  const today = todayInTimezone(orgTz);
  /** 오늘 + 1일 (org tz). 진입 시 due date 기본값. */
  const tomorrow = useMemo(() => {
    const d = new Date(`${today}T00:00:00`);
    d.setDate(d.getDate() + 1);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }, [today]);

  // Scope: orgWide=true → 조직 전체. false면 storeIds 의 store 들.
  const [orgWide, setOrgWide] = useState<boolean>(false);
  const [storeIds, setStoreIds] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<"normal" | "urgent">("normal");
  const [severity, setSeverity] = useState<IssueSeverity | "">("");
  const [category, setCategory] = useState<string>("");
  /** ISO date "YYYY-MM-DD". 진입 시 자동으로 내일 (org tz). 사용자가 비우거나 변경 가능. */
  const [dueDate, setDueDate] = useState<string>(tomorrow);
  const [sourceReportId, setSourceReportId] = useState<string>("");
  const [attachments, setAttachments] = useState<TaskAttachment[]>([]);

  // task 의 first-class 입력: assignees (필수) + related schedules (옵션).
  // schema 는 issue report links 와 호환되므로 prefill 자연스럽게 매핑됨.
  const [assignees, setAssignees] = useState<AssigneesValue>({
    user_ids: [],
    roles: [],
  });
  const [relatedSchedules, setRelatedSchedules] = useState<RelatedSchedulesValue>({
    schedule_ids: [],
    checklist_instance_ids: [],
  });

  // URL 로 들어온 source report 정보를 자동 prefill.
  // store 변경 시 reset 은 effect 로 처리하지 않고 select onChange handler 에서
  // 직접 처리 (handleStoreChange) — strict-mode 의 effect double-invoke 가
  // prefill 된 값을 다시 비우던 race 제거.
  const { data: sourceReport } = useReport(urlSourceReportId);
  const prefilledRef = useRef(false);
  useEffect(() => {
    if (!sourceReport || prefilledRef.current) return;
    prefilledRef.current = true;
    const p = (sourceReport.payload ?? {}) as Partial<IssueReportPayload>;
    if (sourceReport.store_id) {
      setStoreIds([sourceReport.store_id]);
      setOrgWide(false);
    }
    if (sourceReport.title) setTitle(sourceReport.title);
    if (p.description) setDescription(p.description);
    if (p.severity) {
      setSeverity(p.severity);
      if (p.severity === "high" || p.severity === "critical") {
        setPriority("urgent");
      }
    }
    if (p.category) setCategory(p.category);
    setSourceReportId(sourceReport.id);
    // issue report 의 related people / roles → task assignees 로 prefill.
    // 사용자가 task 단계에서 수정 가능.
    if (p.links) {
      setAssignees({
        user_ids: [...(p.links.related_user_ids ?? [])],
        roles: [...(p.links.related_roles ?? [])],
      });
      setRelatedSchedules({
        schedule_ids: [...(p.links.schedule_ids ?? [])],
        checklist_instance_ids: [...(p.links.checklist_instance_ids ?? [])],
      });
    }
  }, [sourceReport]);

  /** 사용자가 scope/store 변경 — 의존하는 입력값 reset. */
  const resetScopeDependent = () => {
    setSourceReportId("");
    setCategory("");
    setAttachments([]);
    setAssignees({ user_ids: [], roles: [] });
    setRelatedSchedules({ schedule_ids: [], checklist_instance_ids: [] });
  };

  const setOrgWideScope = (on: boolean) => {
    setOrgWide(on);
    if (on) setStoreIds([]);
    resetScopeDependent();
  };

  const toggleStoreId = (sid: string) => {
    setStoreIds((prev) =>
      prev.includes(sid) ? prev.filter((x) => x !== sid) : [...prev, sid],
    );
    setOrgWide(false);
    resetScopeDependent();
  };

  const addAttachment = (url: string) => {
    const isVideo = /\.(mp4|mov|webm|avi|mkv)(\?|$)/i.test(url);
    setAttachments((prev) => [
      ...prev,
      { key: url, url, kind: isVideo ? "video" : "image" },
    ]);
  };

  const removeAttachment = (idx: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
  };

  const { data: stores } = useStores();
  const activeStores: Store[] = useMemo(
    () => (stores ?? []).filter((s: Store) => s.is_active !== false),
    [stores],
  );

  // storeUsers / store / workRoles fetch 는 LinkPicker 가 자체 처리 — 이 페이지에선 안 함.

  // Single store mode 일 때만 매장별 issue report template (categories) 조회.
  const singleStoreId = !orgWide && storeIds.length === 1 ? storeIds[0] : "";
  const { data: issueTemplate } = useLookupReportTemplate(
    "issue",
    singleStoreId || undefined,
    !!singleStoreId,
  );
  // Category 옵션 = org default (수정 불가, 모든 scope 공통) + single store mode
  // 일 때만 그 store template 의 custom categories. multi/org-wide 면 store custom 은
  // 의미가 약해 노출하지 않고 org default 만.
  const categoryOptions = useMemo<{ code: string; label: string; custom?: boolean }[]>(() => {
    const orgDefaults: { code: string; label: string; custom?: boolean }[] =
      ISSUE_CATEGORIES.map((c) => ({
        code: c,
        label: c[0].toUpperCase() + c.slice(1),
      }));
    if (!singleStoreId) return orgDefaults;
    const storeCustoms =
      ((issueTemplate?.payload as
        | { categories?: { code: string; label: string; is_active?: boolean }[] }
        | undefined)?.categories ?? [])
        .filter((c) => c.is_active !== false)
        .filter((c) => !orgDefaults.some((o) => o.code === c.code))
        .map((c) => ({ code: c.code, label: c.label, custom: true }));
    return [...orgDefaults, ...storeCustoms];
  }, [issueTemplate, singleStoreId]);

  // Pre-fill 후보: single-store mode 에서만 같은 매장의 issue_report 후보 목록.
  // multi/org 면 issue report 와 1:1 매핑 의미가 약해 후보 X.
  const { data: reportsData } = useReports({
    type: "issue",
    store_id: singleStoreId || undefined,
    per_page: 50,
    page: 1,
  });
  const availableReports = useMemo<Report[]>(() => {
    const items = reportsData?.items ?? [];
    const filtered = items.filter((r) => {
      const p = (r.payload ?? {}) as Partial<IssueReportPayload>;
      return !p.linked_task_id && r.status !== "closed";
    });
    // URL prefill 로 들어온 sourceReport 가 위 filter 에서 빠질 수 있어 강제 포함.
    if (sourceReport && !filtered.some((r) => r.id === sourceReport.id)) {
      return [sourceReport, ...filtered];
    }
    return filtered;
  }, [reportsData, sourceReport]);

  // 사용자가 selector 로 직접 선택했을 때 prefill.
  // store/title/desc/severity/category/assignees/schedules 모두 source report 기준으로 채움.
  const handlePrefillFromReport = (reportId: string) => {
    setSourceReportId(reportId);
    if (!reportId) return;
    const r =
      availableReports.find((x) => x.id === reportId) ??
      reportsData?.items?.find((x) => x.id === reportId);
    if (!r) return;
    const p = (r.payload ?? {}) as Partial<IssueReportPayload>;
    if (r.store_id) {
      setStoreIds([r.store_id]);
      setOrgWide(false);
    }
    if (r.title) setTitle(r.title);
    if (p.description) setDescription(p.description);
    if (p.severity) setSeverity(p.severity);
    if (p.severity === "high" || p.severity === "critical") {
      setPriority("urgent");
    }
    if (p.category) setCategory(p.category);
    if (p.links) {
      setAssignees({
        user_ids: [...(p.links.related_user_ids ?? [])],
        roles: [...(p.links.related_roles ?? [])],
      });
      setRelatedSchedules({
        schedule_ids: [...(p.links.schedule_ids ?? [])],
        checklist_instance_ids: [...(p.links.checklist_instance_ids ?? [])],
      });
    }
  };

  const canSubmit =
    !!title.trim() && assignees.user_ids.length > 0 && !create.isPending;

  const handleSubmit = async () => {
    try {
      const created = await create.mutateAsync({
        store_ids: orgWide ? [] : storeIds,
        title: title.trim(),
        description: description.trim() || null,
        priority,
        severity: severity ? severity : null,
        category: category || null,
        // due_date 는 ISO date "YYYY-MM-DD" → 그 날 23:59 (local) 로 변환.
        due_date: dueDate
          ? new Date(`${dueDate}T23:59:59`).toISOString()
          : null,
        assignee_ids: assignees.user_ids,
        source_report_id: sourceReportId || undefined,
        // task.links: schedule + 1:1 checklist + role 매크로만. position/work_role 은 legacy.
        links:
          relatedSchedules.schedule_ids.length > 0 || assignees.roles.length > 0
            ? {
                schedule_ids: relatedSchedules.schedule_ids,
                checklist_instance_ids: relatedSchedules.checklist_instance_ids,
                related_user_ids: assignees.user_ids,
                related_roles: assignees.roles,
                position_ids: [],
                work_role_ids: [],
              }
            : undefined,
        attachments: attachments.length > 0 ? attachments : undefined,
      });
      router.push(`/tasks/${created.id}`);
    } catch {
      // hook 자동 모달
    }
  };

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold text-text flex items-center gap-2">
        <Zap className="w-6 h-6 text-accent" />
        New Task
      </h1>

      {urlSourceReportId && sourceReport && (
        <div className="bg-accentMuted border border-accent/30 rounded-md p-3 flex items-start gap-3">
          <Sparkles className="w-4 h-4 text-accent mt-0.5 shrink-0" />
          <div className="flex-1 text-sm">
            <p className="text-text font-medium">
              Pre-filled from issue report &quot;{sourceReport.title ?? "(no title)"}&quot;
            </p>
            <p className="text-xs text-textMuted mt-0.5">
              Title, description, severity and category were carried over. Pick
              related items and assignees for this task — they are not copied
              from the report.
            </p>
          </div>
          {/* 새 탭에서 열기 — 현재 폼 작성 내용 유지 */}
          <a
            href={`/reports/issues/${urlSourceReportId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-accent hover:underline shrink-0 inline-flex items-center gap-1"
          >
            View source
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      )}

      {/* 1) Pre-fill selector — 최상단 (사용자가 들어오자마자 source 선택 가능) */}
      <Card className="p-4 space-y-2 bg-surface/50">
        <label className="text-xs text-textSecondary font-semibold flex items-center gap-1">
          <FileText className="w-3.5 h-3.5 text-accent" />
          Pre-fill from issue report (optional)
        </label>
        <select
          value={sourceReportId}
          onChange={(e) => handlePrefillFromReport(e.target.value)}
          className="w-full bg-bg border border-border rounded-md px-3 py-2 text-sm text-text"
        >
          <option value="">— No source report —</option>
          {availableReports.map((r) => (
            <option key={r.id} value={r.id}>
              {r.title ?? "(no title)"}
            </option>
          ))}
        </select>
        <p className="text-[11px] text-textMuted">
          Selecting a report auto-fills title / description / severity / category
          only. Related items and assignees are picked separately for the task.
        </p>
      </Card>

      <Card className="p-6 space-y-5">
        <div>
          <label className="block text-sm text-textSecondary mb-2">Scope</label>
          <div className="flex items-center gap-3 mb-3">
            <label className="flex items-center gap-1.5 text-sm cursor-pointer">
              <input
                type="radio"
                name="task-scope"
                checked={!orgWide}
                onChange={() => setOrgWideScope(false)}
                className="accent-accent"
              />
              <span className="text-text">Specific store(s)</span>
            </label>
            <label className="flex items-center gap-1.5 text-sm cursor-pointer">
              <input
                type="radio"
                name="task-scope"
                checked={orgWide}
                onChange={() => setOrgWideScope(true)}
                className="accent-accent"
              />
              <span className="text-text">Organization-wide (all stores)</span>
            </label>
          </div>
          {!orgWide && (
            <div className="border border-border rounded-md p-3 bg-surface max-h-48 overflow-auto space-y-1">
              {activeStores.length === 0 ? (
                <p className="text-xs text-textMuted italic">No active stores.</p>
              ) : (
                activeStores.map((s) => (
                  <label
                    key={s.id}
                    className="flex items-center gap-2 text-sm cursor-pointer hover:bg-surfaceHover px-2 py-1 rounded"
                  >
                    <input
                      type="checkbox"
                      checked={storeIds.includes(s.id)}
                      onChange={() => toggleStoreId(s.id)}
                      className="accent-accent"
                    />
                    <span className="text-text">{s.name}</span>
                  </label>
                ))
              )}
            </div>
          )}
          {!orgWide && storeIds.length === 0 && (
            <p className="text-xs text-textMuted mt-1.5 italic">
              Pick at least one store, or switch to organization-wide.
            </p>
          )}
        </div>

        <div>
          <label className="block text-sm text-textSecondary mb-1">Title *</label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={500}
          />
        </div>

        <div>
          <label className="block text-sm text-textSecondary mb-1">
            Description
          </label>
          <Textarea
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Explain what needs to be done. Attach reference photos below if helpful."
          />
        </div>

        {/* Attachments — 관리자가 task 설명용으로 첨부 (담당자가 참고). */}
        <div>
          <label className="block text-sm text-textSecondary mb-2 flex items-center gap-1.5">
            <Paperclip className="w-3.5 h-3.5 text-accent" />
            Attachments
            <span className="text-textMuted text-xs font-normal">
              · reference photos / videos / files
            </span>
          </label>
          <div className="flex flex-wrap gap-3">
            {attachments.map((a, idx) => {
              const isImage = a.kind === "image";
              return (
                <div
                  key={`${a.key}-${idx}`}
                  className="relative border border-border rounded-md p-2 bg-surface"
                >
                  {isImage && a.url ? (
                    <img
                      src={a.url}
                      alt={a.name ?? ""}
                      className="w-24 h-24 object-cover rounded"
                    />
                  ) : (
                    <div className="w-24 h-24 flex items-center justify-center text-2xl text-textSecondary">
                      {a.kind === "video" ? "🎬" : "📄"}
                    </div>
                  )}
                  <span className="block text-xs text-textSecondary truncate max-w-[96px] mt-1">
                    {a.name ?? a.key.split("/").pop()}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeAttachment(idx)}
                    className="absolute -top-2 -right-2 bg-danger text-white rounded-full p-0.5"
                    aria-label="Remove"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              );
            })}
            <div className="border border-dashed border-border rounded-md p-2 hover:border-accent transition-colors">
              <ImageUpload value={null} onUpload={addAttachment} compact folder="tasks" />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm text-textSecondary mb-1">Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full bg-surface border border-border rounded-md px-3 py-2 text-sm text-text"
            >
              <option value="">— None —</option>
              {categoryOptions.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                  {c.custom ? " (store)" : ""}
                </option>
              ))}
            </select>
            {!singleStoreId && (
              <p className="text-[10px] text-textMuted mt-1">
                Org default categories. Pick a single store to also see its
                custom categories.
              </p>
            )}
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
            <DateField
              value={dueDate}
              onChange={setDueDate}
              fallbackDate={tomorrow}
              placeholder="Pick a date"
              clearable
            />
          </div>
        </div>

        {/* Assignees — 필수 */}
        <div className="border-t border-border pt-5">
          <AssigneesPicker
            storeIds={storeIds}
            orgWide={orgWide}
            value={assignees}
            onChange={setAssignees}
            required
          />
          {assignees.user_ids.length === 0 && (
            <p className="text-xs text-danger mt-2">
              At least one assignee is required.
            </p>
          )}
        </div>

        {/* Related schedules — single store mode 일 때만 표시. */}
        {!orgWide && storeIds.length === 1 && (
          <div className="border-t border-border pt-5">
            <RelatedSchedulesPicker
              storeIds={storeIds}
              orgWide={orgWide}
              value={relatedSchedules}
              onChange={setRelatedSchedules}
            />
          </div>
        )}

        <div className="flex justify-end gap-3 pt-2 border-t border-border">
          <Button variant="ghost" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit} className="gap-2">
            {create.isPending ? <LoadingSpinner size="sm" /> : <Plus className="w-4 h-4" />}
            Create
          </Button>
        </div>
      </Card>
    </div>
  );
}

export default function NewTaskPage(): React.ReactElement {
  return (
    <Suspense>
      <NewTaskPageBody />
    </Suspense>
  );
}
