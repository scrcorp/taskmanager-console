"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, GripVertical, Check, Minus, History, Copy, ChevronDown } from "lucide-react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  useHiringForm,
  useSaveHiringFormDraft,
  usePublishHiringForm,
  useDiscardHiringFormDraft,
  type HiringFormConfig,
  type QuestionDef,
  type QuestionType,
  type AttachmentSlotDef,
  type AcceptPreset,
} from "@/hooks/useHiring";
import { useStore } from "@/hooks/useStores";
import { FormPreview } from "./FormPreview";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";

interface Props {
  storeId: string;
}

const QUESTION_TYPES: { value: QuestionType; label: string; hint: string }[] = [
  { value: "short_text", label: "Short text", hint: "One line answer" },
  { value: "long_text", label: "Long text", hint: "Paragraph (multi-line)" },
  { value: "number", label: "Number", hint: "Numeric input" },
  { value: "single_choice", label: "Single choice", hint: "Pick one option" },
  { value: "multi_choice", label: "Multiple choice", hint: "Pick several options" },
];

const ACCEPT_LABELS: Record<AcceptPreset, string> = {
  pdf: "PDF",
  image: "Images (JPG/PNG/WebP/HEIC)",
  pdf_or_image: "PDF or images",
};

const newId = () => `q_${Math.random().toString(36).slice(2, 8)}`;

const newQuestion = (type: QuestionType): QuestionDef => {
  const id = newId();
  if (type === "single_choice" || type === "multi_choice") {
    return { type, id, label: "", required: false, options: [""] };
  }
  return { type, id, label: "", required: false };
};

const duplicateQuestion = (q: QuestionDef): QuestionDef => ({
  ...q,
  id: newId(),
  label: q.label ? `${q.label} (copy)` : "",
});

const newAttachment = (): AttachmentSlotDef => ({
  id: `att_${Math.random().toString(36).slice(2, 8)}`,
  label: "",
  accept: "pdf_or_image",
  required: false,
});

export function QuestionsPanel({ storeId }: Props) {
  const { data, isLoading } = useHiringForm(storeId);
  const saveDraft = useSaveHiringFormDraft(storeId);
  const publish = usePublishHiringForm(storeId);
  const discardDraft = useDiscardHiringFormDraft(storeId);
  const { data: store } = useStore(storeId);
  const [previewMode, setPreviewMode] = useState<"now" | "saved">("now");
  const { toast } = useToast();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  const [draft, setDraft] = useState<HiringFormConfig>({
    welcome_message: "",
    questions: [],
    attachments: [],
  });
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [showCancelDialog, setShowCancelDialog] = useState(false);
  const [showPublishDialog, setShowPublishDialog] = useState(false);
  const [showDiscardDialog, setShowDiscardDialog] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState(false);

  // 옛 'text' type을 short_text로 정규화 (구버전 폼 호환)
  const migrateConfig = (c: HiringFormConfig): HiringFormConfig => ({
    welcome_message: c.welcome_message ?? "",
    questions: (c.questions ?? []).map((q) => {
      const t = (q as { type: string }).type;
      if (t === "text") {
        return { ...q, type: "short_text" } as QuestionDef;
      }
      return q;
    }),
    attachments: c.attachments ?? [],
  });

  // 편집 시작점:
  //   1) 서버 저장된 draft가 있으면 그걸 이어서 편집
  //   2) 없으면 published config로 편집 시작 (변경 없으면 isDirty=false)
  //   3) 둘 다 없으면 빈 폼
  const editStartConfig = useMemo<HiringFormConfig>(
    () =>
      migrateConfig(
        data?.draft?.config ??
          data?.published?.config ?? {
            welcome_message: "",
            questions: [],
            attachments: [],
          },
      ),
    [data],
  );

  const resetDraftToServer = () => {
    setDraft({
      welcome_message: editStartConfig.welcome_message ?? "",
      questions: editStartConfig.questions ?? [],
      attachments: editStartConfig.attachments ?? [],
    });
  };

  useEffect(() => {
    if (!data) return;
    setDraft({
      welcome_message: editStartConfig.welcome_message ?? "",
      questions: editStartConfig.questions ?? [],
      attachments: editStartConfig.attachments ?? [],
    });
  }, [data, editStartConfig]);

  // 서버 형태와 draft 형태가 키 순서/누락 등으로 다를 수 있어 normalize 후 비교.
  const normalize = (c: Partial<HiringFormConfig> | undefined | null): string => {
    const safe: HiringFormConfig = {
      welcome_message: (c?.welcome_message ?? "").trim(),
      questions: (c?.questions ?? []).map((q) => ({
        type: q.type,
        id: q.id,
        label: q.label ?? "",
        required: !!q.required,
        ...(q.placeholder !== undefined && q.placeholder !== null ? { placeholder: q.placeholder } : {}),
        ...(q.options ? { options: q.options } : {}),
        ...(q.min !== undefined && q.min !== null ? { min: q.min } : {}),
        ...(q.max !== undefined && q.max !== null ? { max: q.max } : {}),
      })) as QuestionDef[],
      attachments: (c?.attachments ?? []).map((a) => ({
        id: a.id,
        label: a.label ?? "",
        description: (a.description ?? "").trim() || undefined,
        accept: a.accept,
        required: !!a.required,
      })),
    };
    return JSON.stringify(safe);
  };
  // dirty 비교는 "현재 draft state vs 서버에 저장된 draft (또는 published)"
  // — 서버에 저장된 게 있으면 그걸 기준, 없으면 published, 그것도 없으면 빈
  const isDirty = useMemo(
    () => normalize(editStartConfig) !== normalize(draft),
    [editStartConfig, draft],
  );

  // published와 비교해 어떤 항목이 신규/수정됐는지 — UI 배지용
  type DiffStatus = "added" | "modified" | "unchanged";
  const publishedRef = useMemo(
    () => (data?.published ? migrateConfig(data.published.config) : null),
    [data?.published],
  );

  const oneQuestionSig = (q: QuestionDef): string =>
    JSON.stringify({
      type: q.type,
      label: q.label ?? "",
      required: !!q.required,
      placeholder: q.placeholder ?? "",
      options: q.options ?? null,
    });
  const oneAttachmentSig = (a: AttachmentSlotDef): string =>
    JSON.stringify({
      label: a.label ?? "",
      description: (a.description ?? "").trim(),
      accept: a.accept,
      required: !!a.required,
    });

  const questionDiffs = useMemo<Record<string, DiffStatus>>(() => {
    const out: Record<string, DiffStatus> = {};
    if (!publishedRef) {
      // 처음 만드는 폼 — 모두 'added'로 표시 안 함 (의미 없음). 배지 안 보이게 unchanged.
      for (const q of draft.questions) out[q.id] = "unchanged";
      return out;
    }
    const prev = new Map(publishedRef.questions.map((q) => [q.id, q]));
    for (const q of draft.questions) {
      const prevQ = prev.get(q.id);
      if (!prevQ) out[q.id] = "added";
      else if (oneQuestionSig(prevQ) !== oneQuestionSig(q)) out[q.id] = "modified";
      else out[q.id] = "unchanged";
    }
    return out;
  }, [draft.questions, publishedRef]);

  const attachmentDiffs = useMemo<Record<string, DiffStatus>>(() => {
    const out: Record<string, DiffStatus> = {};
    if (!publishedRef) {
      for (const a of draft.attachments) out[a.id] = "unchanged";
      return out;
    }
    const prev = new Map(publishedRef.attachments.map((a) => [a.id, a]));
    for (const a of draft.attachments) {
      const prevA = prev.get(a.id);
      if (!prevA) out[a.id] = "added";
      else if (oneAttachmentSig(prevA) !== oneAttachmentSig(a)) out[a.id] = "modified";
      else out[a.id] = "unchanged";
    }
    return out;
  }, [draft.attachments, publishedRef]);

  // published에 있었지만 draft에서 빠진 항목 (UI 안내 + restore 용)
  const removedQuestions = useMemo<QuestionDef[]>(() => {
    if (!publishedRef) return [];
    const draftIds = new Set(draft.questions.map((q) => q.id));
    return publishedRef.questions.filter((q) => !draftIds.has(q.id));
  }, [draft.questions, publishedRef]);

  const removedAttachments = useMemo<AttachmentSlotDef[]>(() => {
    if (!publishedRef) return [];
    const draftIds = new Set(draft.attachments.map((a) => a.id));
    return publishedRef.attachments.filter((a) => !draftIds.has(a.id));
  }, [draft.attachments, publishedRef]);

  const restoreQuestion = (q: QuestionDef) =>
    setDraft((d) => {
      if (d.questions.length >= 20) return d;
      return { ...d, questions: [...d.questions, q] };
    });

  const restoreAttachment = (a: AttachmentSlotDef) =>
    setDraft((d) => {
      if (d.attachments.length >= 10) return d;
      return { ...d, attachments: [...d.attachments, a] };
    });

  // Publish 가능 여부: 서버에 draft가 있고, published와 다를 때만.
  const canPublish = useMemo(() => {
    if (!data?.draft) return false;
    return normalize(data.draft.config) !== normalize(data.published?.config ?? null);
  }, [data]);

  const addQuestion = (type: QuestionType) =>
    setDraft((d) => ({ ...d, questions: [...d.questions, newQuestion(type)] }));

  const updateQuestion = (idx: number, patch: Partial<QuestionDef>) =>
    setDraft((d) => ({
      ...d,
      questions: d.questions.map((q, i) => (i === idx ? ({ ...q, ...patch } as QuestionDef) : q)),
    }));

  const removeQuestion = (idx: number) =>
    setDraft((d) => ({ ...d, questions: d.questions.filter((_, i) => i !== idx) }));

  const handleDuplicateQuestion = (idx: number) =>
    setDraft((d) => {
      if (d.questions.length >= 20) return d;
      const next = [...d.questions];
      next.splice(idx + 1, 0, duplicateQuestion(d.questions[idx]));
      return { ...d, questions: next };
    });

  const moveQuestion = (idx: number, dir: -1 | 1) =>
    setDraft((d) => {
      const next = [...d.questions];
      const j = idx + dir;
      if (j < 0 || j >= next.length) return d;
      [next[idx], next[j]] = [next[j], next[idx]];
      return { ...d, questions: next };
    });

  const addAttachment = () =>
    setDraft((d) => ({ ...d, attachments: [...d.attachments, newAttachment()] }));

  const updateAttachment = (idx: number, patch: Partial<AttachmentSlotDef>) =>
    setDraft((d) => ({
      ...d,
      attachments: d.attachments.map((a, i) => (i === idx ? { ...a, ...patch } : a)),
    }));

  const removeAttachment = (idx: number) =>
    setDraft((d) => ({ ...d, attachments: d.attachments.filter((_, i) => i !== idx) }));

  // 저장 직전 trim 검증 — 라벨/옵션이 공백뿐이면 저장 차단
  const validateForSave = (): string | null => {
    for (let i = 0; i < draft.questions.length; i++) {
      const q = draft.questions[i];
      if (!q.label || !q.label.trim()) {
        return `Question ${i + 1} needs a label.`;
      }
      if (q.type === "single_choice" || q.type === "multi_choice") {
        const opts = q.options ?? [];
        if (opts.length === 0 || opts.every((o) => !o.trim())) {
          return `Question ${i + 1} ("${q.label}") needs at least one non-empty option.`;
        }
        const blankIdx = opts.findIndex((o) => !o.trim());
        if (blankIdx !== -1) {
          return `Question ${i + 1} ("${q.label}") has an empty option (option ${blankIdx + 1}).`;
        }
      }
    }
    for (let i = 0; i < draft.attachments.length; i++) {
      const a = draft.attachments[i];
      if (!a.label || !a.label.trim()) {
        return `Attachment slot ${i + 1} needs a label.`;
      }
    }
    return null;
  };

  const handleSaveDraft = async () => {
    const err = validateForSave();
    if (err) {
      toast({ type: "error", message: err });
      return;
    }
    try {
      await saveDraft.mutateAsync(draft);
      setSavedAt(Date.now());
      toast({ type: "success", message: "Saved as draft" });
      setTimeout(() => setSavedAt(null), 2000);
    } catch (e) {
      const err = e as { response?: { data?: { detail?: { message?: string } } } };
      toast({
        type: "error",
        message: `Save failed: ${err.response?.data?.detail?.message ?? "unknown"}`,
      });
    }
  };

  const handlePublish = async () => {
    const err = validateForSave();
    if (err) {
      toast({ type: "error", message: err });
      return;
    }
    try {
      if (isDirty) await saveDraft.mutateAsync(draft);
      await publish.mutateAsync();
      toast({ type: "success", message: "Form published — applicants now see it" });
    } catch (e) {
      const err = e as { response?: { data?: { detail?: { message?: string } } } };
      toast({
        type: "error",
        message: `Publish failed: ${err.response?.data?.detail?.message ?? "unknown"}`,
      });
    }
  };

  const handleDiscardDraft = async () => {
    try {
      await discardDraft.mutateAsync();
      toast({ type: "info", message: "Draft discarded" });
    } catch (e) {
      const err = e as { response?: { data?: { detail?: { message?: string } } } };
      toast({
        type: "error",
        message: `Discard failed: ${err.response?.data?.detail?.message ?? "unknown"}`,
      });
    }
  };

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-[#E2E4EA] bg-white p-6 text-[13px] text-[#94A3B8]">
        Loading form…
      </div>
    );
  }

  const publishedConfig: HiringFormConfig | null = data?.published
    ? {
        welcome_message: data.published.config.welcome_message ?? "",
        questions: data.published.config.questions ?? [],
        attachments: data.published.config.attachments ?? [],
      }
    : null;
  const hasServerDraft = !!data?.draft;

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
      <div className="space-y-5">
      {/* Welcome message */}
      <div className="rounded-2xl border border-[#E2E4EA] bg-white p-5">
        <h3 className="text-[14px] font-semibold text-[#1A1D27]">Welcome message</h3>
        <p className="mt-0.5 text-[12px] text-[#64748B]">
          Optional intro text shown above the form on the public signup page.
        </p>
        <textarea
          rows={2}
          value={draft.welcome_message ?? ""}
          onChange={(e) =>
            setDraft((d) => ({ ...d, welcome_message: e.target.value }))
          }
          placeholder="Welcome! Tell us a bit about yourself…"
          className="mt-3 w-full resize-none rounded-lg border border-[#E2E4EA] px-3 py-2 text-[12px] outline-none focus:border-[#6C5CE7]"
        />
      </div>

      {/* Questions */}
      <div className="rounded-2xl border border-[#E2E4EA] bg-white">
        <div className="flex items-center justify-between border-b border-[#E2E4EA] px-5 py-3.5">
          <div>
            <h3 className="text-[13.5px] font-semibold text-[#1A1D27]">
              Questions ({draft.questions.length} / 20)
            </h3>
            <p className="mt-0.5 text-[11.5px] text-[#64748B]">
              Applicants answer these before submitting.
            </p>
            {publishedRef && (
              <DiffLegend
                added={
                  Object.values(questionDiffs).filter((s) => s === "added").length
                }
                modified={
                  Object.values(questionDiffs).filter((s) => s === "modified").length
                }
                removed={removedQuestions.length}
              />
            )}
          </div>
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowAddMenu((p) => !p)}
              disabled={draft.questions.length >= 20}
              className="flex items-center gap-1.5 rounded-lg bg-[#6C5CE7] px-3 py-1.5 text-[12px] font-medium text-white hover:bg-[#5A4BD1] disabled:opacity-50"
            >
              <Plus size={14} />
              Add question
              <ChevronDown size={12} />
            </button>
            {showAddMenu && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setShowAddMenu(false)}
                />
                <div className="absolute right-0 top-full z-20 mt-1 w-56 overflow-hidden rounded-lg border border-[#E2E4EA] bg-white shadow-lg">
                  {QUESTION_TYPES.map((qt) => (
                    <button
                      key={qt.value}
                      type="button"
                      onClick={() => {
                        addQuestion(qt.value);
                        setShowAddMenu(false);
                      }}
                      className="flex w-full items-start gap-2 px-3 py-2 text-left hover:bg-[#F5F6FA]"
                    >
                      <Plus size={14} className="mt-0.5 flex-shrink-0 text-[#94A3B8]" />
                      <div>
                        <p className="text-[12.5px] font-medium text-[#1A1D27]">
                          {qt.label}
                        </p>
                        <p className="text-[10.5px] text-[#94A3B8]">{qt.hint}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {draft.questions.length === 0 ? (
          <div className="px-5 py-10 text-center text-[12px] text-[#94A3B8]">
            No questions yet. Click a button above to add one.
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={(e: DragEndEvent) => {
              const { active, over } = e;
              if (!over || active.id === over.id) return;
              const oldIdx = draft.questions.findIndex((q) => q.id === active.id);
              const newIdx = draft.questions.findIndex((q) => q.id === over.id);
              if (oldIdx === -1 || newIdx === -1) return;
              setDraft((d) => ({
                ...d,
                questions: arrayMove(d.questions, oldIdx, newIdx),
              }));
            }}
          >
            <SortableContext
              items={draft.questions.map((q) => q.id)}
              strategy={verticalListSortingStrategy}
            >
              <ul className="divide-y divide-[#E2E4EA]">
                {draft.questions.map((q, idx) => (
                  <SortableQuestionRow key={q.id} q={q}>
                    {(handleProps) => (
                      <>
                <button
                  type="button"
                  className="mt-2 flex flex-shrink-0 cursor-grab touch-none items-center text-[#94A3B8] hover:text-[#1A1D27] active:cursor-grabbing"
                  aria-label="Drag to reorder"
                  {...handleProps.attributes}
                  {...(handleProps.listeners ?? {})}
                >
                  <GripVertical size={16} />
                </button>
                <span
                  title={
                    questionDiffs[q.id] === "added"
                      ? "New since published"
                      : questionDiffs[q.id] === "modified"
                        ? "Edited since published"
                        : undefined
                  }
                  className={
                    questionDiffs[q.id] === "added"
                      ? "mt-2 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md bg-[rgba(0,184,148,0.15)] text-[10.5px] font-semibold text-[#00997A] tabular-nums ring-1 ring-[rgba(0,184,148,0.4)]"
                      : questionDiffs[q.id] === "modified"
                        ? "mt-2 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md bg-[rgba(240,165,0,0.15)] text-[10.5px] font-semibold text-[#C28100] tabular-nums ring-1 ring-[rgba(240,165,0,0.4)]"
                        : "mt-2 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md bg-[#F0F1F5] text-[10.5px] font-semibold text-[#64748B] tabular-nums"
                  }
                >
                  {idx + 1}
                </span>
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      value={q.label}
                      onChange={(e) => updateQuestion(idx, { label: e.target.value })}
                      placeholder="Question label"
                      className="flex-1 rounded-lg border border-[#E2E4EA] px-2.5 py-1.5 text-[12.5px] outline-none focus:border-[#6C5CE7]"
                    />
                    <span className="rounded-md bg-[#F0F1F5] px-2 py-0.5 text-[10px] font-medium text-[#64748B]">
                      {QUESTION_TYPES.find((t) => t.value === q.type)?.label ?? q.type}
                    </span>
                    <label className="flex items-center gap-1 text-[11px] text-[#64748B]">
                      <input
                        type="checkbox"
                        checked={!!q.required}
                        onChange={(e) =>
                          updateQuestion(idx, { required: e.target.checked })
                        }
                      />
                      Required
                    </label>
                    <div className="flex items-center gap-0.5 border-l border-[#E2E4EA] pl-2 text-[#94A3B8]">
                      <button
                        type="button"
                        onClick={() => handleDuplicateQuestion(idx)}
                        disabled={draft.questions.length >= 20}
                        className="rounded p-1 hover:bg-[#F0F1F5] hover:text-[#6C5CE7] disabled:opacity-30 disabled:hover:bg-transparent"
                        aria-label="Duplicate question"
                        title="Duplicate"
                      >
                        <Copy size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeQuestion(idx)}
                        className="rounded p-1 hover:bg-[#F0F1F5] hover:text-[#EF4444]"
                        aria-label="Delete question"
                        title="Delete"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>

                  {(q.type === "single_choice" || q.type === "multi_choice") && (
                    <div className="space-y-1">
                      {(q.options ?? []).map((opt, oi) => {
                        const opts = q.options ?? [];
                        const onlyOne = opts.length <= 1;
                        return (
                          <div key={oi} className="flex items-center gap-2">
                            <div className="flex flex-col text-[#94A3B8]">
                              <button
                                type="button"
                                onClick={() => {
                                  const next = [...opts];
                                  if (oi === 0) return;
                                  [next[oi - 1], next[oi]] = [next[oi], next[oi - 1]];
                                  updateQuestion(idx, { options: next });
                                }}
                                disabled={oi === 0}
                                className="text-[9px] hover:text-[#1A1D27] disabled:opacity-30"
                                aria-label="Move option up"
                              >
                                ▲
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  const next = [...opts];
                                  if (oi === opts.length - 1) return;
                                  [next[oi], next[oi + 1]] = [next[oi + 1], next[oi]];
                                  updateQuestion(idx, { options: next });
                                }}
                                disabled={oi === opts.length - 1}
                                className="text-[9px] hover:text-[#1A1D27] disabled:opacity-30"
                                aria-label="Move option down"
                              >
                                ▼
                              </button>
                            </div>
                            <input
                              value={opt}
                              onChange={(e) => {
                                const next = [...opts];
                                next[oi] = e.target.value;
                                updateQuestion(idx, { options: next });
                              }}
                              placeholder={`Option ${oi + 1}`}
                              className="flex-1 rounded-lg border border-[#E2E4EA] px-2.5 py-1 text-[12px] outline-none focus:border-[#6C5CE7]"
                            />
                            <button
                              type="button"
                              disabled={onlyOne}
                              onClick={() => {
                                const next = opts.filter((_, i) => i !== oi);
                                updateQuestion(idx, { options: next });
                              }}
                              title={
                                onlyOne
                                  ? "At least one option is required"
                                  : "Remove this option"
                              }
                              className="text-[#94A3B8] hover:text-[#EF4444] disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:text-[#94A3B8]"
                              aria-label="Remove option"
                            >
                              <Minus size={14} />
                            </button>
                          </div>
                        );
                      })}
                      <button
                        type="button"
                        onClick={() =>
                          updateQuestion(idx, {
                            options: [...(q.options ?? []), ""],
                          })
                        }
                        className="rounded-md border border-dashed border-[#CBD5E1] px-2 py-1 text-[11px] text-[#64748B] hover:border-[#94A3B8]"
                      >
                        + Add option
                      </button>
                    </div>
                  )}

                  {(q.type === "short_text" || q.type === "number") && (
                    <input
                      value={q.placeholder ?? ""}
                      onChange={(e) => updateQuestion(idx, { placeholder: e.target.value })}
                      placeholder="Placeholder (optional)"
                      className="w-full rounded-lg border border-[#E2E4EA] px-2.5 py-1 text-[11.5px] text-[#64748B] outline-none focus:border-[#6C5CE7]"
                    />
                  )}
                  {q.type === "long_text" && (
                    <textarea
                      rows={3}
                      value={q.placeholder ?? ""}
                      onChange={(e) => updateQuestion(idx, { placeholder: e.target.value })}
                      placeholder={"Placeholder (optional)\nApplicants will see this in the textarea."}
                      className="w-full resize-none rounded-lg border border-[#E2E4EA] px-2.5 py-1.5 text-[11.5px] text-[#64748B] outline-none focus:border-[#6C5CE7]"
                    />
                  )}
                </div>
                      </>
                    )}
                  </SortableQuestionRow>
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        )}
        {removedQuestions.length > 0 && (
          <div className="border-t border-[#E2E4EA] bg-[rgba(239,68,68,0.05)] px-5 py-3">
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#EF4444]">
              Removed since published — won&apos;t apply once you publish
            </p>
            <ul className="flex flex-wrap gap-1.5">
              {removedQuestions.map((q) => (
                <li
                  key={q.id}
                  className="flex items-center gap-1.5 rounded-md border border-[rgba(239,68,68,0.3)] bg-white px-2 py-1 text-[11.5px] text-[#1A1D27]"
                >
                  <span className="line-through text-[#94A3B8]">
                    {q.label || "(untitled)"}
                  </span>
                  <button
                    type="button"
                    onClick={() => restoreQuestion(q)}
                    disabled={draft.questions.length >= 20}
                    className="rounded border border-[#E2E4EA] bg-white px-1.5 py-0.5 text-[10.5px] font-medium text-[#64748B] hover:bg-[#F0F1F5] disabled:opacity-40"
                    title="Restore — add this question back to the draft"
                  >
                    Restore
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Attachments */}
      <div className="rounded-2xl border border-[#E2E4EA] bg-white">
        <div className="flex items-center justify-between border-b border-[#E2E4EA] px-5 py-3.5">
          <div>
            <h3 className="text-[13.5px] font-semibold text-[#1A1D27]">
              File attachments ({draft.attachments.length} / 10)
            </h3>
            <p className="mt-0.5 text-[11.5px] text-[#64748B]">
              Files up to 20MB. Limit set system-wide.
            </p>
            {publishedRef && (
              <DiffLegend
                added={
                  Object.values(attachmentDiffs).filter((s) => s === "added").length
                }
                modified={
                  Object.values(attachmentDiffs).filter((s) => s === "modified").length
                }
                removed={removedAttachments.length}
              />
            )}
          </div>
          <button
            type="button"
            onClick={addAttachment}
            disabled={draft.attachments.length >= 10}
            className="flex items-center gap-1.5 rounded-lg bg-[#6C5CE7] px-3 py-1.5 text-[12px] font-medium text-white hover:bg-[#5A4BD1] disabled:opacity-50"
          >
            <Plus size={14} />
            Add slot
          </button>
        </div>

        {draft.attachments.length === 0 ? (
          <div className="px-5 py-10 text-center text-[12px] text-[#94A3B8]">
            No file slots. Add one to require a resume, ID, etc.
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={(e: DragEndEvent) => {
              const { active, over } = e;
              if (!over || active.id === over.id) return;
              const oldIdx = draft.attachments.findIndex((a) => a.id === active.id);
              const newIdx = draft.attachments.findIndex((a) => a.id === over.id);
              if (oldIdx === -1 || newIdx === -1) return;
              setDraft((d) => ({
                ...d,
                attachments: arrayMove(d.attachments, oldIdx, newIdx),
              }));
            }}
          >
            <SortableContext
              items={draft.attachments.map((a) => a.id)}
              strategy={verticalListSortingStrategy}
            >
              <ul className="divide-y divide-[#E2E4EA]">
                {draft.attachments.map((a, idx) => (
                  <SortableAttachmentRow key={a.id} id={a.id}>
                    {(handleProps) => (
                      <>
                <button
                  type="button"
                  className="mt-1 flex flex-shrink-0 cursor-grab touch-none items-center text-[#94A3B8] hover:text-[#1A1D27] active:cursor-grabbing"
                  aria-label="Drag to reorder"
                  {...handleProps.attributes}
                  {...(handleProps.listeners ?? {})}
                >
                  <GripVertical size={16} />
                </button>
                <span
                  title={
                    attachmentDiffs[a.id] === "added"
                      ? "New since published"
                      : attachmentDiffs[a.id] === "modified"
                        ? "Edited since published"
                        : undefined
                  }
                  className={
                    attachmentDiffs[a.id] === "added"
                      ? "mt-1 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md bg-[rgba(0,184,148,0.15)] text-[10.5px] font-semibold text-[#00997A] tabular-nums ring-1 ring-[rgba(0,184,148,0.4)]"
                      : attachmentDiffs[a.id] === "modified"
                        ? "mt-1 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md bg-[rgba(240,165,0,0.15)] text-[10.5px] font-semibold text-[#C28100] tabular-nums ring-1 ring-[rgba(240,165,0,0.4)]"
                        : "mt-1 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md bg-[#F0F1F5] text-[10.5px] font-semibold text-[#64748B] tabular-nums"
                  }
                >
                  {idx + 1}
                </span>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <input
                      value={a.label}
                      onChange={(e) => updateAttachment(idx, { label: e.target.value })}
                      placeholder="Slot label (e.g. Resume)"
                      className="flex-1 rounded-lg border border-[#E2E4EA] px-2.5 py-1.5 text-[12.5px] outline-none focus:border-[#6C5CE7]"
                    />
                    <select
                      value={a.accept}
                      onChange={(e) =>
                        updateAttachment(idx, { accept: e.target.value as AcceptPreset })
                      }
                      className="rounded-lg border border-[#E2E4EA] bg-white px-2.5 py-1.5 text-[12px] outline-none focus:border-[#6C5CE7]"
                    >
                      {(Object.keys(ACCEPT_LABELS) as AcceptPreset[]).map((k) => (
                        <option key={k} value={k}>
                          {ACCEPT_LABELS[k]}
                        </option>
                      ))}
                    </select>
                    <label className="flex items-center gap-1 text-[11px] text-[#64748B]">
                      <input
                        type="checkbox"
                        checked={a.required}
                        onChange={(e) => updateAttachment(idx, { required: e.target.checked })}
                      />
                      Required
                    </label>
                  </div>
                  <input
                    value={a.description ?? ""}
                    onChange={(e) =>
                      updateAttachment(idx, { description: e.target.value })
                    }
                    placeholder="Description (optional) — e.g. Color scan preferred, both sides"
                    className="w-full rounded-lg border border-[#E2E4EA] px-2.5 py-1 text-[11.5px] text-[#64748B] outline-none focus:border-[#6C5CE7]"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeAttachment(idx)}
                  className="mt-1.5 text-[#94A3B8] hover:text-[#EF4444]"
                  aria-label="Delete slot"
                >
                  <Trash2 size={16} />
                </button>
                      </>
                    )}
                  </SortableAttachmentRow>
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        )}
        {removedAttachments.length > 0 && (
          <div className="border-t border-[#E2E4EA] bg-[rgba(239,68,68,0.05)] px-5 py-3">
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-[#EF4444]">
              Removed since published — won&apos;t apply once you publish
            </p>
            <ul className="flex flex-wrap gap-1.5">
              {removedAttachments.map((a) => (
                <li
                  key={a.id}
                  className="flex items-center gap-1.5 rounded-md border border-[rgba(239,68,68,0.3)] bg-white px-2 py-1 text-[11.5px] text-[#1A1D27]"
                >
                  <span className="line-through text-[#94A3B8]">
                    {a.label || "(untitled)"}
                  </span>
                  <button
                    type="button"
                    onClick={() => restoreAttachment(a)}
                    disabled={draft.attachments.length >= 10}
                    className="rounded border border-[#E2E4EA] bg-white px-1.5 py-0.5 text-[10.5px] font-medium text-[#64748B] hover:bg-[#F0F1F5] disabled:opacity-40"
                    title="Restore — add this slot back to the draft"
                  >
                    Restore
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Save bar */}
      <div className="sticky bottom-2 flex items-center justify-between gap-3 rounded-2xl border border-[#E2E4EA] bg-white px-5 py-3 shadow-sm">
        <div className="flex items-center gap-2 text-[11.5px]">
          {savedAt && (
            <span className="flex items-center gap-1 text-[#00B894]">
              <Check size={14} /> Saved
            </span>
          )}
          {!savedAt && isDirty && (
            <span className="text-[#C28100]">Unsaved changes</span>
          )}
          {!savedAt && !isDirty && hasServerDraft && canPublish && (
            <span className="text-[#3B8DD9]">
              Draft saved — not yet visible to applicants
            </span>
          )}
          {!savedAt && !isDirty && hasServerDraft && !canPublish && (
            <span className="text-[#94A3B8]">Draft = published</span>
          )}
          {!savedAt && !isDirty && !hasServerDraft && data?.published && data.published.is_default && (
            <span className="text-[#94A3B8]">
              Default form (V0) — edit & publish to customize
            </span>
          )}
          {!savedAt && !isDirty && !hasServerDraft && data?.published && !data.published.is_default && (
            <span className="text-[#00B894]">Published v{data.published.version}</span>
          )}
          {!savedAt && !isDirty && !hasServerDraft && !data?.published && (
            <span className="text-[#94A3B8]">No form yet</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {hasServerDraft && (
            <button
              type="button"
              onClick={() => setShowDiscardDialog(true)}
              disabled={discardDraft.isPending}
              className="rounded-lg border border-[#E2E4EA] bg-white px-3 py-2 text-[12.5px] font-medium text-[#64748B] hover:bg-[#F0F1F5] disabled:opacity-50"
            >
              Discard draft
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowCancelDialog(true)}
            disabled={!isDirty || saveDraft.isPending}
            className="rounded-lg border border-[#E2E4EA] bg-white px-3 py-2 text-[12.5px] font-medium text-[#64748B] hover:bg-[#F0F1F5] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSaveDraft}
            disabled={!isDirty || saveDraft.isPending}
            className="rounded-lg border border-[#6C5CE7] bg-white px-3 py-2 text-[12.5px] font-medium text-[#6C5CE7] hover:bg-[rgba(108,92,231,0.08)] disabled:opacity-50"
          >
            {saveDraft.isPending ? "Saving…" : "Save draft"}
          </button>
          <button
            type="button"
            onClick={() => setShowPublishDialog(true)}
            disabled={(!isDirty && !canPublish) || publish.isPending}
            className="rounded-lg bg-[#6C5CE7] px-4 py-2 text-[13px] font-medium text-white hover:bg-[#5A4BD1] disabled:opacity-50"
          >
            {publish.isPending ? "Publishing…" : "Publish"}
          </button>
        </div>
      </div>
      </div>

      <div className="hidden lg:block">
        {publishedConfig && (
          <div className="mb-2 flex items-center justify-center">
            <button
              type="button"
              onClick={() =>
                setPreviewMode((m) => (m === "now" ? "saved" : "now"))
              }
              onMouseDown={(e) => e.preventDefault()}
              title={
                previewMode === "now"
                  ? "Click to see what applicants currently see (published)"
                  : "Showing the published (live) version"
              }
              className={
                previewMode === "saved"
                  ? "flex items-center gap-1.5 rounded-full bg-[#1A1D27] px-3 py-1 text-[11px] font-semibold text-white shadow"
                  : "flex items-center gap-1.5 rounded-full border border-[#E2E4EA] bg-white px-3 py-1 text-[11px] font-medium text-[#64748B] hover:bg-[#F0F1F5]"
              }
            >
              <History size={12} />
              {previewMode === "saved"
                ? `Showing published v${data?.published?.version ?? "?"}`
                : "Show published"}
            </button>
          </div>
        )}
        <FormPreview
          config={
            previewMode === "now" || !publishedConfig ? draft : publishedConfig
          }
          storeName={store?.name ?? "Your store"}
        />
      </div>

      <ConfirmDialog
        isOpen={showCancelDialog}
        onClose={() => setShowCancelDialog(false)}
        onConfirm={() => {
          resetDraftToServer();
          setShowCancelDialog(false);
        }}
        title="Discard changes?"
        message="Your unsaved edits to this form will be lost. The applicant-facing form will keep using the last saved version."
        confirmLabel="Discard changes"
      />

      <ConfirmDialog
        isOpen={showDiscardDialog}
        onClose={() => setShowDiscardDialog(false)}
        onConfirm={async () => {
          await handleDiscardDraft();
          setShowDiscardDialog(false);
        }}
        title="Discard draft?"
        message="The saved draft will be removed. The applicant-facing form keeps using the published version."
        confirmLabel="Discard draft"
        isLoading={discardDraft.isPending}
      />

      <Modal
        isOpen={showPublishDialog}
        onClose={() => !publish.isPending && setShowPublishDialog(false)}
        title="Publish this form?"
        size="sm"
      >
        <div className="flex flex-col gap-4">
          <p className="text-sm text-text-secondary leading-relaxed">
            New applicants will see this form immediately. Anyone in the
            middle of applying will keep the version they started with —
            their submissions stay valid.
          </p>
          <div className="flex justify-end gap-3 pt-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowPublishDialog(false)}
              disabled={publish.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={async () => {
                await handlePublish();
                setShowPublishDialog(false);
              }}
              isLoading={publish.isPending || saveDraft.isPending}
            >
              Publish
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function DiffLegend({
  added,
  modified,
  removed,
}: {
  added: number;
  modified: number;
  removed: number;
}) {
  if (added === 0 && modified === 0 && removed === 0) return null;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-2 text-[10.5px] text-[#64748B]">
      {added > 0 && (
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-sm bg-[rgba(0,184,148,0.3)] ring-1 ring-[rgba(0,184,148,0.6)]" />
          {added} new
        </span>
      )}
      {modified > 0 && (
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-sm bg-[rgba(240,165,0,0.3)] ring-1 ring-[rgba(240,165,0,0.6)]" />
          {modified} edited
        </span>
      )}
      {removed > 0 && (
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-sm bg-[rgba(239,68,68,0.2)] ring-1 ring-[rgba(239,68,68,0.6)]" />
          {removed} removed
        </span>
      )}
    </div>
  );
}

interface SortableQuestionRowProps {
  q: QuestionDef;
  children: (handleProps: {
    attributes: ReturnType<typeof useSortable>["attributes"];
    listeners: ReturnType<typeof useSortable>["listeners"];
  }) => React.ReactNode;
}

function SortableQuestionRow({ q, children }: SortableQuestionRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: q.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };
  return (
    <li
      ref={setNodeRef}
      style={style}
      className="flex items-start gap-3 bg-white px-5 py-3"
    >
      {children({ attributes, listeners })}
    </li>
  );
}

interface SortableAttachmentRowProps {
  id: string;
  children: (handleProps: {
    attributes: ReturnType<typeof useSortable>["attributes"];
    listeners: ReturnType<typeof useSortable>["listeners"];
  }) => React.ReactNode;
}

function SortableAttachmentRow({ id, children }: SortableAttachmentRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };
  return (
    <li
      ref={setNodeRef}
      style={style}
      className="flex items-start gap-3 bg-white px-5 py-3"
    >
      {children({ attributes, listeners })}
    </li>
  );
}
