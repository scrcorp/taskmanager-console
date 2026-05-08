"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Upload, Check, X, AlertCircle } from "lucide-react";
import type {
  HiringFormConfig,
  QuestionDef,
  AttachmentSlotDef,
} from "@/hooks/useHiring";

const ACCEPT_MIMES: Record<string, string> = {
  pdf: "application/pdf",
  image: "image/jpeg,image/png,image/webp,image/heic",
  pdf_or_image:
    "application/pdf,image/jpeg,image/png,image/webp,image/heic",
};

export type AnswerMap = Record<string, string | string[] | number>;
export type AttachmentMap = Record<
  string,
  {
    file_key: string;
    file_name: string;
    file_size: number;
    mime_type: string;
  } | null
>;

interface Props {
  config: HiringFormConfig;
  encoded: string;
  apiBase: string;
  answers: AnswerMap;
  setAnswers: (next: AnswerMap) => void;
  attachments: AttachmentMap;
  setAttachments: (next: AttachmentMap) => void;
  onBack: () => void;
  onContinue: () => void;
}

export function FormStepScreen({
  config,
  encoded,
  apiBase,
  answers,
  setAnswers,
  attachments,
  setAttachments,
  onBack,
  onContinue,
}: Props) {
  const t = useTranslations("signup");
  const [uploadingSlot, setUploadingSlot] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  // accept 키 → 표시 텍스트 (i18n)
  const acceptDisplay = (accept: string): string => {
    if (accept === "pdf") return t("formAcceptPdf");
    if (accept === "image") return t("formAcceptImage");
    if (accept === "pdf_or_image") return t("formAcceptPdfOrImage");
    return accept;
  };

  const handleSetAnswer = (id: string, value: string | string[] | number) => {
    setAnswers({ ...answers, [id]: value });
  };

  const handleUpload = async (slot: AttachmentSlotDef, file: File) => {
    setUploadError(null);
    setUploadingSlot(slot.id);
    try {
      const fd = new FormData();
      fd.append("encoded", encoded);
      fd.append("accept", slot.accept);
      fd.append("file", file);
      const res = await fetch(`${apiBase}/app/applications/attachments`, {
        method: "POST",
        body: fd,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        const detail = err?.detail;
        if (detail?.code === "file_too_large") {
          setUploadError(
            t("formFileTooLarge", {
              name: file.name,
              actual: detail.actual_mb,
              max: detail.max_mb,
            }),
          );
        } else if (detail?.code === "invalid_file_type") {
          setUploadError(
            t("formInvalidFileType", {
              name: file.name,
              accepts: acceptDisplay(slot.accept),
            }),
          );
        } else {
          setUploadError(detail?.message ?? t("formUploadFailedGeneric"));
        }
        return;
      }
      const body = await res.json();
      setAttachments({
        ...attachments,
        [slot.id]: {
          file_key: body.file_key,
          file_name: body.file_name,
          file_size: body.file_size,
          mime_type: body.mime_type,
        },
      });
    } catch {
      setUploadError(t("formUploadFailed"));
    } finally {
      setUploadingSlot(null);
    }
  };

  const validate = (): string | null => {
    for (const q of config.questions) {
      if (!q.required) continue;
      const v = answers[q.id];
      if (
        v === undefined ||
        v === null ||
        v === "" ||
        (Array.isArray(v) && v.length === 0)
      ) {
        return t("formPleaseAnswer", { label: q.label });
      }
    }
    for (const slot of config.attachments) {
      if (slot.required && !attachments[slot.id]) {
        return t("formPleaseUpload", { label: slot.label });
      }
    }
    return null;
  };

  const handleContinue = () => {
    const err = validate();
    if (err) {
      setValidationError(err);
      return;
    }
    setValidationError(null);
    onContinue();
  };

  return (
    <div className="flex min-h-[100dvh] flex-col bg-white">
      <div className="flex-1 px-5 pt-5">
        <h2 className="text-[22px] font-semibold leading-tight tracking-tight text-slate-900">
          {t("formTitle")}
        </h2>
        {config.welcome_message && (
          <p className="mt-1.5 whitespace-pre-line text-[13px] leading-relaxed text-slate-500">
            {config.welcome_message}
          </p>
        )}

        {/* Questions */}
        {config.questions.length > 0 && (
          <div className="mt-5 space-y-4">
            {config.questions.map((q) => (
              <QuestionField
                key={q.id}
                q={q}
                value={answers[q.id]}
                onChange={(v) => handleSetAnswer(q.id, v)}
              />
            ))}
          </div>
        )}

        {/* Attachments */}
        {config.attachments.length > 0 && (
          <div className="mt-6 space-y-3">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-slate-400">
              {t("formFileUploads")}
            </p>
            {config.attachments.map((slot) => {
              const file = attachments[slot.id];
              const accept = ACCEPT_MIMES[slot.accept];
              return (
                <div
                  key={slot.id}
                  className="rounded-xl border border-slate-200 p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-medium text-slate-900">
                        {slot.label}
                        {slot.required && (
                          <span className="ml-1 text-[#EF4444]">*</span>
                        )}
                      </p>
                      {slot.description && (
                        <p className="mt-0.5 text-[12px] leading-relaxed text-slate-600">
                          {slot.description}
                        </p>
                      )}
                      <p className="mt-0.5 text-[11px] text-slate-500">
                        {acceptDisplay(slot.accept)}
                      </p>
                    </div>
                    {file && (
                      <button
                        type="button"
                        onClick={() =>
                          setAttachments({ ...attachments, [slot.id]: null })
                        }
                        className="text-slate-400 hover:text-[#EF4444]"
                        aria-label={t("formRemoveFile")}
                      >
                        <X size={16} />
                      </button>
                    )}
                  </div>
                  {file ? (
                    <div className="mt-2 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-[12px] text-emerald-700">
                      <Check size={14} />
                      <span className="truncate">
                        {file.file_name}{" "}
                        <span className="text-emerald-500">
                          · {Math.round(file.file_size / 1024)} KB
                        </span>
                      </span>
                    </div>
                  ) : (
                    <label className="mt-2 flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 py-3 text-[12px] text-slate-500 hover:bg-slate-100">
                      <Upload size={14} />
                      {uploadingSlot === slot.id ? t("formUploading") : t("formChooseFile")}
                      <input
                        type="file"
                        accept={accept}
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) handleUpload(slot, f);
                          if (e.target) (e.target as HTMLInputElement).value = "";
                        }}
                      />
                    </label>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {(uploadError || validationError) && (
          <div className="mt-4 flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-[12px] text-red-700">
            <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />
            <span>{uploadError ?? validationError}</span>
          </div>
        )}
      </div>

      <div className="border-t border-slate-100 bg-white px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onBack}
            className="flex-1 rounded-xl border border-slate-200 bg-white px-5 py-3 text-[13px] font-semibold text-slate-700 hover:bg-slate-50"
          >
            {t("back")}
          </button>
          <button
            type="button"
            onClick={handleContinue}
            className="flex-[2] rounded-xl bg-blue-600 px-5 py-3 text-[14px] font-semibold text-white shadow-sm hover:bg-blue-700"
          >
            {t("continue")}
          </button>
        </div>
      </div>
    </div>
  );
}

function QuestionField({
  q,
  value,
  onChange,
}: {
  q: QuestionDef;
  value: string | string[] | number | undefined;
  onChange: (v: string | string[] | number) => void;
}) {
  return (
    <div>
      <label className="text-[12.5px] font-medium text-slate-700">
        {q.label}
        {q.required && <span className="ml-1 text-[#EF4444]">*</span>}
      </label>
      <div className="mt-1.5">
        {(q.type === "short_text" || (q.type as string) === "text") && (
          <input
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder={q.placeholder ?? ""}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] outline-none focus:border-blue-500"
          />
        )}
        {q.type === "long_text" && (
          <textarea
            rows={4}
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder={q.placeholder ?? ""}
            className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-[13px] outline-none focus:border-blue-500"
          />
        )}
        {q.type === "number" && (
          <input
            type="number"
            value={typeof value === "number" ? value : ""}
            onChange={(e) => onChange(parseFloat(e.target.value))}
            placeholder={q.placeholder ?? ""}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] outline-none focus:border-blue-500"
          />
        )}
        {q.type === "single_choice" && (
          <div className="space-y-1.5">
            {(q.options ?? []).map((opt) => (
              <label
                key={opt}
                className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-[13px]"
              >
                <input
                  type="radio"
                  name={q.id}
                  checked={value === opt}
                  onChange={() => onChange(opt)}
                />
                <span>{opt}</span>
              </label>
            ))}
          </div>
        )}
        {q.type === "multi_choice" && (
          <div className="space-y-1.5">
            {(q.options ?? []).map((opt) => {
              const arr = Array.isArray(value) ? value : [];
              const checked = arr.includes(opt);
              return (
                <label
                  key={opt}
                  className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-[13px]"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) =>
                      onChange(
                        e.target.checked
                          ? [...arr, opt]
                          : arr.filter((x) => x !== opt),
                      )
                    }
                  />
                  <span>{opt}</span>
                </label>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
