"use client";

import { useEffect, useState } from "react";
import { Upload, Check } from "lucide-react";
import type {
  HiringFormConfig,
  QuestionDef,
  AcceptPreset,
} from "@/hooks/useHiring";

interface Props {
  config: HiringFormConfig;
  storeName: string;
}

const ACCEPT_DISPLAY: Record<AcceptPreset, string> = {
  pdf: "PDF · up to 20MB",
  image: "JPG, PNG, WebP, HEIC · up to 20MB",
  pdf_or_image: "PDF, JPG, PNG, WebP, HEIC · up to 20MB",
};

type AnswerValue = string | string[] | number | undefined;

/**
 * Form Builder 옆에 표시되는 모바일 미리보기.
 * 인터랙티브 — 실제로 답변 입력 + 첨부 파일 선택까지 가능 (제출은 안 됨).
 */
export function FormPreview({ config, storeName }: Props) {
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [files, setFiles] = useState<Record<string, File | null>>({});

  // config 형태가 바뀌면(예: 옵션 삭제) 답변에 남은 잔여 값 정리
  useEffect(() => {
    setAnswers((prev) => {
      const next: Record<string, AnswerValue> = {};
      for (const q of config.questions) {
        const v = prev[q.id];
        if (v === undefined) continue;
        if (q.type === "single_choice") {
          if (typeof v === "string" && (q.options ?? []).includes(v)) next[q.id] = v;
        } else if (q.type === "multi_choice") {
          if (Array.isArray(v)) {
            const valid = v.filter((x) => (q.options ?? []).includes(x));
            if (valid.length) next[q.id] = valid;
          }
        } else {
          next[q.id] = v;
        }
      }
      return next;
    });
    setFiles((prev) => {
      const validIds = new Set(config.attachments.map((a) => a.id));
      const next: Record<string, File | null> = {};
      for (const [k, v] of Object.entries(prev)) {
        if (validIds.has(k)) next[k] = v;
      }
      return next;
    });
  }, [config]);

  const isEmpty =
    !config.welcome_message &&
    config.questions.length === 0 &&
    config.attachments.length === 0;

  return (
    <div className="sticky top-0 flex h-fit flex-col items-center">
      <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#94A3B8]">
        <span className="h-1.5 w-1.5 rounded-full bg-[#6C5CE7]" />
        Live preview · applicant view
      </div>

      <div className="overflow-hidden rounded-[28px] border-[6px] border-[#1A1D27] bg-white shadow-xl">
        <div className="flex h-[640px] w-[300px] flex-col overflow-y-auto bg-white">
          <div className="flex items-center justify-between bg-[#1A1D27] px-3 py-1 text-[8px] font-semibold text-white">
            <span>9:41</span>
            <span>•••</span>
          </div>
          <div className="bg-gradient-to-br from-slate-700 via-slate-800 to-slate-900 px-4 py-4 text-white">
            <p className="text-[8px] font-semibold uppercase tracking-[0.18em] text-white/70">
              Application
            </p>
            <h1 className="mt-1 text-[15px] font-semibold leading-tight">
              {storeName}
            </h1>
          </div>

          {isEmpty ? (
            <div className="flex flex-1 items-center justify-center px-5 text-center text-[10.5px] text-[#94A3B8]">
              No form questions yet. Applicants will go straight from Account
              setup to email verification.
            </div>
          ) : (
            <div className="flex-1 px-4 py-4">
              <h2 className="text-[14px] font-semibold leading-tight text-slate-900">
                A few more details
              </h2>
              {config.welcome_message && (
                <p className="mt-1 whitespace-pre-line text-[10.5px] leading-relaxed text-slate-500">
                  {config.welcome_message}
                </p>
              )}

              {config.questions.length > 0 && (
                <div className="mt-3 space-y-3">
                  {config.questions.map((q) => (
                    <PreviewQuestion
                      key={q.id}
                      q={q}
                      value={answers[q.id]}
                      onChange={(v) =>
                        setAnswers((prev) => ({ ...prev, [q.id]: v }))
                      }
                    />
                  ))}
                </div>
              )}

              {config.attachments.length > 0 && (
                <div className="mt-4 space-y-1.5">
                  <p className="text-[8px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                    File uploads
                  </p>
                  {config.attachments.map((slot) => {
                    const file = files[slot.id];
                    return (
                      <div
                        key={slot.id}
                        className="rounded-md border border-slate-200 p-2"
                      >
                        <p className="text-[10px] font-medium text-slate-900">
                          {slot.label || (
                            <span className="italic text-slate-400">
                              (Untitled slot)
                            </span>
                          )}
                          {slot.required && (
                            <span className="ml-1 text-[#EF4444]">*</span>
                          )}
                        </p>
                        {slot.description && (
                          <p className="mt-0.5 text-[9px] leading-snug text-slate-600">
                            {slot.description}
                          </p>
                        )}
                        <p className="mt-0.5 text-[8.5px] text-slate-500">
                          {ACCEPT_DISPLAY[slot.accept]}
                        </p>
                        {file ? (
                          <div className="mt-1 flex items-center justify-between gap-1 rounded-md bg-emerald-50 px-2 py-1.5 text-[9.5px] text-emerald-700">
                            <span className="flex items-center gap-1 truncate">
                              <Check size={9} />
                              <span className="truncate">{file.name}</span>
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                setFiles((p) => ({ ...p, [slot.id]: null }))
                              }
                              className="text-emerald-700 hover:text-emerald-900"
                            >
                              ×
                            </button>
                          </div>
                        ) : (
                          <label className="mt-1 flex cursor-pointer items-center justify-center gap-1 rounded-md border border-dashed border-slate-300 bg-slate-50 py-1.5 text-[9px] text-slate-500 hover:bg-slate-100">
                            <Upload size={9} />
                            Choose file
                            <input
                              type="file"
                              className="hidden"
                              onChange={(e) => {
                                const f = e.target.files?.[0] ?? null;
                                setFiles((p) => ({ ...p, [slot.id]: f }));
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
            </div>
          )}

          <div className="border-t border-slate-100 bg-white px-4 py-3">
            <div className="flex gap-1.5">
              <div className="flex-1 rounded-md border border-slate-200 bg-white py-1.5 text-center text-[10px] font-semibold text-slate-500">
                Back
              </div>
              <div className="flex-[2] rounded-md bg-blue-600 py-1.5 text-center text-[10.5px] font-semibold text-white">
                Continue
              </div>
            </div>
          </div>
        </div>
      </div>
      <p className="mt-2 max-w-[300px] text-center text-[10.5px] text-[#94A3B8]">
        Try filling it out — answers stay local to this preview and aren't
        submitted.
      </p>
    </div>
  );
}

function PreviewQuestion({
  q,
  value,
  onChange,
}: {
  q: QuestionDef;
  value: AnswerValue;
  onChange: (v: AnswerValue) => void;
}) {
  return (
    <div>
      <p className="text-[10px] font-medium text-slate-700">
        {q.label || (
          <span className="italic text-slate-400">(Untitled question)</span>
        )}
        {q.required && <span className="ml-1 text-[#EF4444]">*</span>}
      </p>
      <div className="mt-1">
        {(q.type === "short_text" || (q.type as string) === "text") && (
          <input
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder={q.placeholder ?? ""}
            className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-[10px] outline-none focus:border-blue-500"
          />
        )}
        {q.type === "long_text" && (
          <textarea
            rows={3}
            value={typeof value === "string" ? value : ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder={q.placeholder ?? ""}
            className="w-full resize-none rounded-md border border-slate-200 px-2 py-1.5 text-[10px] outline-none focus:border-blue-500"
          />
        )}
        {q.type === "number" && (
          <input
            type="number"
            value={typeof value === "number" ? value : ""}
            onChange={(e) => onChange(parseFloat(e.target.value))}
            placeholder={q.placeholder ?? ""}
            className="w-full rounded-md border border-slate-200 px-2 py-1.5 text-[10px] outline-none focus:border-blue-500"
          />
        )}
        {q.type === "single_choice" && (
          <div className="space-y-1">
            {(q.options ?? []).map((opt, oi) => {
              const checked = value === opt;
              return (
                <label
                  key={oi}
                  className={
                    checked
                      ? "flex cursor-pointer items-center gap-1.5 rounded-md border border-blue-300 bg-blue-50 px-2 py-1 text-[9.5px] text-slate-900"
                      : "flex cursor-pointer items-center gap-1.5 rounded-md border border-slate-200 px-2 py-1 text-[9.5px] text-slate-700 hover:bg-slate-50"
                  }
                >
                  <span
                    className={
                      checked
                        ? "flex h-2.5 w-2.5 items-center justify-center rounded-full border border-blue-600"
                        : "h-2.5 w-2.5 rounded-full border border-slate-300"
                    }
                  >
                    {checked && (
                      <span className="h-1.5 w-1.5 rounded-full bg-blue-600" />
                    )}
                  </span>
                  <input
                    type="radio"
                    name={q.id}
                    value={opt}
                    checked={checked}
                    onChange={() => onChange(opt)}
                    className="hidden"
                  />
                  <span className="truncate">
                    {opt || <em className="text-slate-400">(empty)</em>}
                  </span>
                </label>
              );
            })}
          </div>
        )}
        {q.type === "multi_choice" && (
          <div className="space-y-1">
            {(q.options ?? []).map((opt, oi) => {
              const arr = Array.isArray(value) ? value : [];
              const checked = arr.includes(opt);
              return (
                <label
                  key={oi}
                  className={
                    checked
                      ? "flex cursor-pointer items-center gap-1.5 rounded-md border border-blue-300 bg-blue-50 px-2 py-1 text-[9.5px] text-slate-900"
                      : "flex cursor-pointer items-center gap-1.5 rounded-md border border-slate-200 px-2 py-1 text-[9.5px] text-slate-700 hover:bg-slate-50"
                  }
                >
                  <span
                    className={
                      checked
                        ? "flex h-2.5 w-2.5 items-center justify-center rounded-sm border border-blue-600 bg-blue-600 text-white"
                        : "h-2.5 w-2.5 rounded-sm border border-slate-300"
                    }
                  >
                    {checked && <Check size={7} strokeWidth={4} />}
                  </span>
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
                    className="hidden"
                  />
                  <span className="truncate">
                    {opt || <em className="text-slate-400">(empty)</em>}
                  </span>
                </label>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
