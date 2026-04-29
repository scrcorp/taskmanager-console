"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, GripVertical, Check } from "lucide-react";
import {
  useHiringForm,
  useSaveHiringForm,
  type HiringFormConfig,
  type QuestionDef,
  type QuestionType,
  type AttachmentSlotDef,
  type AcceptPreset,
} from "@/hooks/useHiring";

interface Props {
  storeId: string;
}

const QUESTION_TYPES: { value: QuestionType; label: string }[] = [
  { value: "text", label: "Free text" },
  { value: "number", label: "Number" },
  { value: "single_choice", label: "Single choice" },
  { value: "multi_choice", label: "Multiple choice" },
];

const ACCEPT_LABELS: Record<AcceptPreset, string> = {
  pdf: "PDF",
  image: "Images (JPG/PNG/WebP/HEIC)",
  pdf_or_image: "PDF or images",
};

const newQuestion = (type: QuestionType): QuestionDef => {
  const id = `q_${Math.random().toString(36).slice(2, 8)}`;
  if (type === "single_choice" || type === "multi_choice") {
    return { type, id, label: "", required: false, options: ["Option 1", "Option 2"] };
  }
  return { type, id, label: "", required: false };
};

const newAttachment = (): AttachmentSlotDef => ({
  id: `att_${Math.random().toString(36).slice(2, 8)}`,
  label: "",
  accept: "pdf_or_image",
  required: false,
});

export function QuestionsPanel({ storeId }: Props) {
  const { data, isLoading } = useHiringForm(storeId);
  const save = useSaveHiringForm(storeId);

  const [draft, setDraft] = useState<HiringFormConfig>({
    welcome_message: "",
    questions: [],
    attachments: [],
  });
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    if (data?.config) {
      setDraft({
        welcome_message: data.config.welcome_message ?? "",
        questions: data.config.questions ?? [],
        attachments: data.config.attachments ?? [],
      });
    }
  }, [data]);

  const isDirty = useMemo(() => {
    if (!data?.config) return draft.questions.length > 0 || draft.attachments.length > 0;
    return JSON.stringify(data.config) !== JSON.stringify(draft);
  }, [data, draft]);

  const addQuestion = (type: QuestionType) =>
    setDraft((d) => ({ ...d, questions: [...d.questions, newQuestion(type)] }));

  const updateQuestion = (idx: number, patch: Partial<QuestionDef>) =>
    setDraft((d) => ({
      ...d,
      questions: d.questions.map((q, i) => (i === idx ? ({ ...q, ...patch } as QuestionDef) : q)),
    }));

  const removeQuestion = (idx: number) =>
    setDraft((d) => ({ ...d, questions: d.questions.filter((_, i) => i !== idx) }));

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

  const handleSave = async () => {
    try {
      await save.mutateAsync(draft);
      setSavedAt(Date.now());
      setTimeout(() => setSavedAt(null), 2000);
    } catch (e) {
      const err = e as { response?: { data?: { detail?: { message?: string } } } };
      alert(`Save failed: ${err.response?.data?.detail?.message ?? "unknown"}`);
    }
  };

  if (isLoading) {
    return (
      <div className="rounded-2xl border border-[#E2E4EA] bg-white p-6 text-[13px] text-[#94A3B8]">
        Loading form…
      </div>
    );
  }

  return (
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
          </div>
          <div className="flex gap-1.5">
            {QUESTION_TYPES.map((qt) => (
              <button
                key={qt.value}
                type="button"
                onClick={() => addQuestion(qt.value)}
                disabled={draft.questions.length >= 20}
                className="rounded-lg border border-[#E2E4EA] bg-white px-2.5 py-1.5 text-[11px] font-medium text-[#64748B] hover:bg-[#F0F1F5] disabled:opacity-50"
              >
                + {qt.label}
              </button>
            ))}
          </div>
        </div>

        {draft.questions.length === 0 ? (
          <div className="px-5 py-10 text-center text-[12px] text-[#94A3B8]">
            No questions yet. Click a button above to add one.
          </div>
        ) : (
          <ul className="divide-y divide-[#E2E4EA]">
            {draft.questions.map((q, idx) => (
              <li key={q.id} className="flex items-start gap-3 px-5 py-3">
                <div className="mt-1 flex flex-col text-[#94A3B8]">
                  <button
                    type="button"
                    onClick={() => moveQuestion(idx, -1)}
                    disabled={idx === 0}
                    className="text-[10px] hover:text-[#1A1D27] disabled:opacity-30"
                  >
                    ▲
                  </button>
                  <GripVertical size={12} />
                  <button
                    type="button"
                    onClick={() => moveQuestion(idx, 1)}
                    disabled={idx === draft.questions.length - 1}
                    className="text-[10px] hover:text-[#1A1D27] disabled:opacity-30"
                  >
                    ▼
                  </button>
                </div>
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      value={q.label}
                      onChange={(e) => updateQuestion(idx, { label: e.target.value })}
                      placeholder="Question label"
                      className="flex-1 rounded-lg border border-[#E2E4EA] px-2.5 py-1.5 text-[12.5px] outline-none focus:border-[#6C5CE7]"
                    />
                    <span className="rounded-md bg-[#F0F1F5] px-2 py-0.5 text-[10px] font-medium text-[#64748B]">
                      {QUESTION_TYPES.find((t) => t.value === q.type)?.label}
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
                  </div>

                  {(q.type === "single_choice" || q.type === "multi_choice") && (
                    <div className="space-y-1">
                      {(q.options ?? []).map((opt, oi) => (
                        <div key={oi} className="flex gap-2">
                          <input
                            value={opt}
                            onChange={(e) => {
                              const next = [...(q.options ?? [])];
                              next[oi] = e.target.value;
                              updateQuestion(idx, { options: next });
                            }}
                            placeholder={`Option ${oi + 1}`}
                            className="flex-1 rounded-lg border border-[#E2E4EA] px-2.5 py-1 text-[12px] outline-none focus:border-[#6C5CE7]"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const next = (q.options ?? []).filter((_, i) => i !== oi);
                              updateQuestion(idx, { options: next });
                            }}
                            className="text-[#94A3B8] hover:text-[#EF4444]"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
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

                  {q.type === "text" && (
                    <input
                      value={q.placeholder ?? ""}
                      onChange={(e) => updateQuestion(idx, { placeholder: e.target.value })}
                      placeholder="Placeholder (optional)"
                      className="w-full rounded-lg border border-[#E2E4EA] px-2.5 py-1 text-[11.5px] text-[#64748B] outline-none focus:border-[#6C5CE7]"
                    />
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => removeQuestion(idx)}
                  className="text-[#94A3B8] hover:text-[#EF4444]"
                  aria-label="Delete question"
                >
                  <Trash2 size={16} />
                </button>
              </li>
            ))}
          </ul>
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
          <ul className="divide-y divide-[#E2E4EA]">
            {draft.attachments.map((a, idx) => (
              <li key={a.id} className="flex items-center gap-3 px-5 py-3">
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
                <button
                  type="button"
                  onClick={() => removeAttachment(idx)}
                  className="text-[#94A3B8] hover:text-[#EF4444]"
                  aria-label="Delete slot"
                >
                  <Trash2 size={16} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Save bar */}
      <div className="sticky bottom-2 flex items-center justify-end gap-3 rounded-2xl border border-[#E2E4EA] bg-white px-5 py-3 shadow-sm">
        {savedAt && (
          <span className="flex items-center gap-1 text-[11.5px] text-[#00B894]">
            <Check size={14} /> Saved
          </span>
        )}
        <button
          type="button"
          onClick={handleSave}
          disabled={!isDirty || save.isPending}
          className="rounded-lg bg-[#6C5CE7] px-4 py-2 text-[13px] font-medium text-white hover:bg-[#5A4BD1] disabled:opacity-50"
        >
          {save.isPending ? "Saving…" : "Save form"}
        </button>
      </div>
    </div>
  );
}
