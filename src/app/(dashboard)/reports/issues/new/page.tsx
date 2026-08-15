"use client";

/**
 * 이슈 리포트 작성 페이지.
 *
 * New issue report form: store, title, category, severity, description, attachments.
 */

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ChevronDown, ChevronRight, Link2, MapPin, Plus, X } from "lucide-react";

import { useCreateIssueReport, useLookupReportTemplate } from "@/hooks/useReports";
import { LinkPicker, type LinkValues } from "@/components/reports/LinkPicker";
import { IssueRecipientsPicker } from "@/components/reports/IssueRecipientsPicker";
import { IssueVisibilityScopeField } from "@/components/reports/IssueVisibilityScopeField";
import { IssueViewersPreview } from "@/components/reports/IssueViewersPreview";
import { useStores } from "@/hooks/useStores";
import { describeApiError, type ErrorDisplay } from "@/lib/errorDisplay";
import {
  Button,
  Card,
  Input,
  LoadingSpinner,
  Textarea,
  ImageUpload,
} from "@/components/ui";
import {
  ISSUE_SEVERITIES,
  type IssueAttachment,
  type IssueCategoryDef,
  type IssueSeverity,
  type IssueVisibilityScope,
  type Store,
} from "@/types";

type CategoryDef = IssueCategoryDef;

interface CustomFieldDef {
  type: "short_text" | "long_text" | "number" | "single_choice" | "multi_choice";
  id: string;
  label: string;
  required?: boolean;
  placeholder?: string;
  options?: string[];
  max_length?: number;
  sort_order?: number;
}

function CustomFieldInput({
  field,
  value,
  onChange,
}: {
  field: CustomFieldDef;
  value: unknown;
  onChange: (v: unknown) => void;
}): React.ReactElement {
  const label = (
    <label className="block text-sm text-textSecondary mb-1">
      {field.label}
      {field.required && <span className="text-danger ml-1">*</span>}
    </label>
  );
  if (field.type === "short_text") {
    return (
      <div>
        {label}
        <Input
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder ?? ""}
          maxLength={field.max_length ?? undefined}
        />
      </div>
    );
  }
  if (field.type === "long_text") {
    return (
      <div>
        {label}
        <Textarea
          rows={3}
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder={field.placeholder ?? ""}
          maxLength={field.max_length ?? undefined}
        />
      </div>
    );
  }
  if (field.type === "number") {
    return (
      <div>
        {label}
        <Input
          type="number"
          value={(value as string | number) ?? ""}
          onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
          placeholder={field.placeholder ?? ""}
        />
      </div>
    );
  }
  if (field.type === "single_choice") {
    return (
      <div>
        {label}
        <select
          value={(value as string) ?? ""}
          onChange={(e) => onChange(e.target.value || null)}
          className="w-full bg-surface border border-border rounded-md px-3 py-2 text-sm text-text"
        >
          <option value="">— Select —</option>
          {(field.options ?? []).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      </div>
    );
  }
  if (field.type === "multi_choice") {
    const arr = Array.isArray(value) ? (value as string[]) : [];
    return (
      <div>
        {label}
        <div className="space-y-1">
          {(field.options ?? []).map((o) => (
            <label key={o} className="flex items-center gap-2 text-sm text-text">
              <input
                type="checkbox"
                checked={arr.includes(o)}
                onChange={(e) => {
                  const next = e.target.checked
                    ? [...arr, o]
                    : arr.filter((x) => x !== o);
                  onChange(next);
                }}
                className="accent-accent"
              />
              {o}
            </label>
          ))}
        </div>
      </div>
    );
  }
  return <div />;
}

export default function NewIssuePage(): React.ReactElement {
  const router = useRouter();
  const { data: stores } = useStores();
  const createIssue = useCreateIssueReport();

  const [storeId, setStoreId] = useState<string>("");
  const [title, setTitle] = useState<string>("");
  const [category, setCategory] = useState<string>("");
  const [severity, setSeverity] = useState<IssueSeverity>("medium");
  const [description, setDescription] = useState<string>("");
  // 마지막으로 클라가 집어넣은 프리셋 원문. description 이 이것과 똑같으면
  // 사용자가 손대지 않은 것으로 보고 새 프리셋으로 교체한다.
  const [lastPresetText, setLastPresetText] = useState<string | null>(null);
  const [attachments, setAttachments] = useState<IssueAttachment[]>([]);
  const [extraViewerIds, setExtraViewerIds] = useState<string[]>([]);
  const [visibilityScope, setVisibilityScope] =
    useState<IssueVisibilityScope>("default");
  const [submitFailure, setSubmitFailure] = useState<ErrorDisplay | null>(null);
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, unknown>>({});
  const [links, setLinks] = useState<LinkValues>({
    schedule_ids: [],
    checklist_instance_ids: [],
    position_ids: [],
    work_role_ids: [],
    related_user_ids: [],
    related_roles: [],
  });
  const [linksOpen, setLinksOpen] = useState<boolean>(false);

  const linkCount =
    links.schedule_ids.length +
    links.checklist_instance_ids.length +
    links.position_ids.length +
    links.work_role_ids.length +
    links.related_user_ids.length;

  // store별 form template (categories + custom_fields)
  const { data: template } = useLookupReportTemplate("issue", storeId, !!storeId);
  const categories: CategoryDef[] = useMemo(() => {
    const list = ((template?.payload?.categories as CategoryDef[]) ?? []).filter(
      (c) => c.is_active !== false,
    );
    return list.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  }, [template]);
  const customFields: CustomFieldDef[] = useMemo(() => {
    const list = (template?.payload?.custom_fields as CustomFieldDef[]) ?? [];
    return [...list].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  }, [template]);

  /**
   * 카테고리 전환 + description 프리필.
   *
   * - description 이 비어 있으면 새 프리셋을 채운다.
   * - 직전 프리셋 원문 그대로면 새 프리셋으로 교체한다.
   * - 사용자가 손댄 흔적이 있으면 건드리지 않는다.
   */
  const selectCategory = React.useCallback(
    (nextCode: string) => {
      setCategory(nextCode);
      const nextPreset =
        categories.find((c) => c.code === nextCode)?.description_template ?? null;
      const untouched =
        description.trim() === "" || description === lastPresetText;
      if (!untouched) return;
      setDescription(nextPreset ?? "");
      setLastPresetText(nextPreset);
    },
    [categories, description, lastPresetText],
  );

  // categories 로드되면 첫 번째 카테고리 디폴트 (프리셋도 같은 규칙으로 적용)
  React.useEffect(() => {
    if (categories.length > 0 && !category) {
      selectCategory(categories[0].code);
    }
  }, [categories, category, selectCategory]);

  const activeStores: Store[] = useMemo(
    () => (stores ?? []).filter((s: Store) => s.is_active !== false),
    [stores],
  );

  // 매장이 1개뿐이면 자동 선택 (P0-3 권장 1)
  React.useEffect(() => {
    if (!storeId && activeStores.length === 1) {
      setStoreId(activeStores[0].id);
    }
  }, [activeStores, storeId]);

  const selectedStore: Store | undefined = useMemo(
    () => activeStores.find((s) => s.id === storeId),
    [activeStores, storeId],
  );

  // 매장 바뀌면 수신자 + custom values + category + links 초기화
  React.useEffect(() => {
    setExtraViewerIds([]);
    setCustomFieldValues({});
    setCategory("");
    setLinks({
      schedule_ids: [],
      checklist_instance_ids: [],
      position_ids: [],
      work_role_ids: [],
      related_user_ids: [],
      related_roles: [],
    });
  }, [storeId]);

  const addAttachment = (url: string) => {
    // url에서 파일 종류 추정
    const isVideo = /\.(mp4|mov|webm|avi|mkv)(\?|$)/i.test(url);
    setAttachments((prev) => [
      ...prev,
      { key: url, kind: isVideo ? "video" : "image" },
    ]);
  };

  const removeAttachment = (idx: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== idx));
  };

  const canSubmit = !!storeId && !!title.trim() && !createIssue.isPending;

  const handleSubmit = async () => {
    setSubmitFailure(null);
    try {
      const created = await createIssue.mutateAsync({
        type: "issue",
        store_id: storeId,
        title: title.trim(),
        payload: {
          category,
          severity,
          description: description.trim() || null,
          attachments,
          // 확대 전용 조회 범위 + 추가 인원. share_with_store_all 과
          // notify_excluded_user_ids 는 더 이상 쓰지 않는다(서버가 무시).
          visibility_scope: visibilityScope,
          extra_viewers: { user_ids: extraViewerIds, position_ids: [] },
          custom_field_values: customFieldValues,
          links: {
            schedule_ids: links.schedule_ids,
            checklist_instance_ids: links.checklist_instance_ids,
            position_ids: links.position_ids,
            work_role_ids: links.work_role_ids,
            related_user_ids: links.related_user_ids,
            related_roles: links.related_roles,
          },
        },
      });
      router.push(`/reports/issues/${created.id}`);
    } catch (err) {
      // 훅이 모달을 띄우지만, 폼에서 고쳐야 하는 실패(범위 값·수신자)는 폼 옆에도 남긴다.
      setSubmitFailure(
        describeApiError(err, {
          context: "form",
          fallback: "Couldn't submit this issue.",
        }),
      );
    }
  };

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-text flex items-center gap-2">
          <AlertTriangle className="w-6 h-6 text-warning" />
          New Issue
        </h1>
        <p className="text-textSecondary text-sm mt-1">
          Raise an operational issue. General Managers and above at the store
          are notified immediately.
        </p>
      </div>

      {/* Step 1 — Store selection (prominent) */}
      <Card className="p-6">
        <div className="flex items-start gap-4">
          <div className="w-9 h-9 rounded-full bg-accentMuted text-accent flex items-center justify-center shrink-0 font-semibold">
            1
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold text-text flex items-center gap-2">
              <MapPin className="w-4 h-4 text-accent" />
              Where did this happen?
            </h2>
            <p className="text-xs text-textMuted mt-1 mb-3">
              Choose the store where the issue occurred. This drives categories,
              custom fields, and who can see this report.
            </p>
            <select
              value={storeId}
              onChange={(e) => setStoreId(e.target.value)}
              className="w-full bg-surface border border-accent/40 focus:border-accent rounded-md px-3 py-2.5 text-sm text-text font-medium"
            >
              <option value="">Select a store…</option>
              {activeStores.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            {selectedStore && (
              <div className="mt-2 text-xs text-success flex items-center gap-1.5">
                <MapPin className="w-3 h-3" />
                Selected: <span className="font-medium">{selectedStore.name}</span>
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* Step 2 — Issue details (disabled until store chosen) */}
      <Card
        className={`p-6 space-y-5 transition-opacity ${
          storeId ? "" : "opacity-50 pointer-events-none select-none"
        }`}
        aria-disabled={!storeId}
      >
        <div className="flex items-center gap-3 pb-3 border-b border-border">
          <div className="w-9 h-9 rounded-full bg-accentMuted text-accent flex items-center justify-center shrink-0 font-semibold">
            2
          </div>
          <h2 className="text-base font-semibold text-text">
            Describe the issue
          </h2>
          {!storeId && (
            <span className="text-xs text-textMuted italic ml-auto">
              Select a store to continue
            </span>
          )}
        </div>

        <div>
          <label className="block text-sm text-textSecondary mb-1">Title *</label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Short summary of the issue"
            maxLength={200}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm text-textSecondary mb-1">Category *</label>
            <select
              value={category}
              onChange={(e) => selectCategory(e.target.value)}
              disabled={!storeId}
              className="w-full bg-surface border border-border rounded-md px-3 py-2 text-sm text-text disabled:opacity-50"
            >
              {!storeId && <option value="">Select a store first</option>}
              {categories.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm text-textSecondary mb-1">Severity *</label>
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

        {/* Related items — collapsible 섹션. 기본은 닫혀있고 클릭으로 펼침. */}
        <div className="border border-border rounded-md bg-surface/50">
          <button
            type="button"
            onClick={() => setLinksOpen((v) => !v)}
            className="w-full flex items-center gap-2 px-3 py-2.5 text-sm font-medium text-text hover:bg-surface transition-colors rounded-md"
            aria-expanded={linksOpen}
          >
            {linksOpen ? (
              <ChevronDown className="w-4 h-4 text-textMuted" />
            ) : (
              <ChevronRight className="w-4 h-4 text-textMuted" />
            )}
            <Link2 className="w-4 h-4 text-accent" />
            <span>Related items</span>
            {linkCount > 0 && (
              <span className="ml-1 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-accent text-white text-xs font-semibold">
                {linkCount}
              </span>
            )}
            <span className="ml-auto text-xs text-textMuted font-normal">
              Schedules, checklists, positions, work roles, people
            </span>
          </button>
          {linksOpen && (
            <div className="px-3 pb-3 pt-1 border-t border-border">
              <p className="text-xs text-textMuted mb-3">
                Link this report to anything related. Carried over to the issue when promoted.
              </p>
              <LinkPicker storeId={storeId} value={links} onChange={setLinks} />
            </div>
          )}
        </div>

        {customFields.length > 0 && (
          <div className="space-y-3 border-t border-border pt-4">
            <h3 className="text-sm font-semibold text-text">
              Additional fields (store-specific)
            </h3>
            {customFields.map((f) => (
              <CustomFieldInput
                key={f.id}
                field={f}
                value={customFieldValues[f.id]}
                onChange={(v) =>
                  setCustomFieldValues((prev) => ({ ...prev, [f.id]: v }))
                }
              />
            ))}
          </div>
        )}

        <div>
          <label className="block text-sm text-textSecondary mb-1">Description</label>
          <Textarea
            rows={5}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe what happened, where, when, and any impact…"
          />
        </div>

        <div>
          <label className="block text-sm text-textSecondary mb-2">Attachments</label>
          <div className="flex flex-wrap gap-3">
            {attachments.map((a, idx) => (
              <div
                key={idx}
                className="relative border border-border rounded-md p-2 bg-surface text-xs text-textSecondary"
              >
                <span className="block truncate max-w-[160px]">
                  {a.kind === "video" ? "🎬" : "🖼️"} {a.name ?? a.key.split("/").pop()}
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
            ))}
            <div className="border border-dashed border-border rounded-md p-2 hover:border-accent transition-colors">
              <ImageUpload value={null} onUpload={addAttachment} compact />
            </div>
          </div>
          <p className="text-xs text-textMuted mt-2">
            Images and short videos are supported.
          </p>
        </div>

        {/* 범위와 사람을 한 섹션에 둔다 — 둘 다 "누가 이 리포트에 닿는가"라 나눠 놓으면
            같은 결정을 두 번 하게 된다. 범위는 열람만 넓히고, 알림은 아래 사람 목록만 따른다. */}
        <div className="border-t border-border pt-4 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-text mb-1">
              Who can see this report
            </label>
            <p className="text-xs text-textMuted mb-2">
              Widening only — nobody who would normally see this report loses
              access. Widening does not notify anyone.
            </p>
            <IssueVisibilityScopeField
              value={visibilityScope}
              onChange={setVisibilityScope}
              disabled={!storeId}
            />
            <div className="mt-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-textMuted mb-1.5">
                Who this includes
              </div>
              <IssueViewersPreview
                storeId={storeId || null}
                scope={visibilityScope}
                addedUserIds={extraViewerIds}
                onAddedChange={setExtraViewerIds}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-text mb-1">
              Who gets notified
            </label>
            <p className="text-xs text-textMuted mb-2">
              General Managers and above at this store are always notified —
              they cannot be removed. Anyone you added above is notified too.
              Widening the visibility scope on its own notifies no one.
            </p>
            <IssueRecipientsPicker
              storeId={storeId || null}
              addedUserIds={extraViewerIds}
              onAddedChange={setExtraViewerIds}
            />
          </div>
        </div>

        {submitFailure && (
          <div className="border border-danger/40 bg-dangerMuted rounded-md p-3 text-sm text-danger">
            <div className="font-medium">{submitFailure.message}</div>
            <p className="text-xs mt-1">
              {submitFailure.hint ??
                "Check the visibility option and the people you added, then submit again."}
            </p>
          </div>
        )}

        <div className="flex justify-end gap-3 pt-2 border-t border-border">
          <Button variant="ghost" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit} className="gap-2">
            {createIssue.isPending ? (
              <>
                <LoadingSpinner size="sm" /> Submitting…
              </>
            ) : (
              <>
                <Plus className="w-4 h-4" />
                Submit Issue
              </>
            )}
          </Button>
        </div>
      </Card>
    </div>
  );
}
