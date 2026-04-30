"use client";

import { useEffect, useRef, useState } from "react";
import type { EmailFormState } from "@/types/signup";
import { StepIndicator } from "./StepIndicator";
import { getSignupSteps } from "./steps";

interface OtpInputProps {
  value: string;
  onChange: (next: string) => void;
}

function OtpInput({ value, onChange }: OtpInputProps) {
  const inputs = useRef<Array<HTMLInputElement | null>>([]);

  const handleChange = (idx: number, ch: string) => {
    const digit = ch.replace(/\D/g, "").slice(-1);
    const arr = value.split("");
    arr[idx] = digit;
    const next = arr.join("").slice(0, 6);
    onChange(next);
    if (digit && idx < 5) inputs.current[idx + 1]?.focus();
  };

  const handleKey = (idx: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !value[idx] && idx > 0) {
      inputs.current[idx - 1]?.focus();
    }
    if (e.key === "ArrowLeft" && idx > 0) inputs.current[idx - 1]?.focus();
    if (e.key === "ArrowRight" && idx < 5) inputs.current[idx + 1]?.focus();
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pasted) {
      onChange(pasted);
      const lastIdx = Math.min(pasted.length - 1, 5);
      inputs.current[lastIdx]?.focus();
    }
  };

  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: 6 }).map((_, idx) => {
        const ch = value[idx] ?? "";
        const isActive = value.length === idx;
        return (
          <input
            key={idx}
            ref={(el) => {
              inputs.current[idx] = el;
            }}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={1}
            value={ch}
            onChange={(e) => handleChange(idx, e.target.value)}
            onKeyDown={(e) => handleKey(idx, e)}
            onPaste={handlePaste}
            className={[
              "h-14 w-full min-w-0 rounded-xl border bg-white text-center font-mono text-[24px] font-semibold text-slate-900 outline-none transition-all",
              ch
                ? "border-slate-300"
                : isActive
                  ? "border-blue-500 ring-2 ring-blue-100"
                  : "border-slate-200",
              "focus:border-blue-500 focus:ring-2 focus:ring-blue-100",
            ].join(" ")}
          />
        );
      })}
    </div>
  );
}

interface Props {
  form: EmailFormState;
  onChange: (next: EmailFormState) => void;
  onBack: () => void;
  onSendCode: () => Promise<void>;
  onVerify: () => Promise<void>;
  loading?: boolean;
  error?: string | null;
  hasForm: boolean;
}

export function EmailVerifyScreen({
  form,
  onChange,
  onBack,
  onSendCode,
  onVerify,
  loading = false,
  error = null,
  hasForm,
}: Props) {
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  const handleSend = async () => {
    await onSendCode();
    setResendCooldown(30);
  };

  return (
    <div className="flex min-h-[100dvh] flex-col bg-white">
      <div className="border-b border-slate-100 bg-white px-5 pt-[max(0.75rem,env(safe-area-inset-top))] pb-4">
        <StepIndicator steps={getSignupSteps(hasForm)} current="email" />
      </div>
      <div className="px-5 pt-3 pb-1">
        <button
          type="button"
          onClick={onBack}
          className="-ml-1 inline-flex items-center gap-1 rounded-md px-1 py-0.5 text-[13px] text-slate-500 transition-colors hover:text-slate-900"
        >
          <svg
            className="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Back
        </button>
      </div>

      <div className="px-5 pt-2">
        <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
          <svg
            className="h-6 w-6"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
            <polyline points="22,6 12,13 2,6" />
          </svg>
        </div>
        <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-slate-900">
          Verify your email
        </h1>
        <p className="mt-1.5 text-[14px] leading-relaxed text-slate-500">
          {form.codeSent
            ? `We sent a 6-digit code to ${form.email || "your email"}.`
            : "We'll send a 6-digit code to confirm it's really you."}
        </p>
      </div>

      <div className="space-y-5 px-5 pt-6 pb-4">
        {!form.codeSent ? (
          <>
            <div className="space-y-1.5">
              <label className="block text-[12px] font-medium text-slate-700">
                Email
              </label>
              <input
                type="email"
                autoComplete="email"
                value={form.email}
                onChange={(e) => onChange({ ...form, email: e.target.value })}
                placeholder="you@example.com"
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-[14px] text-slate-900 placeholder-slate-400 outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>

            <div className="space-y-2.5 rounded-2xl bg-slate-50 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Why verify
              </p>
              <ul className="space-y-2.5 text-[12.5px] leading-relaxed text-slate-600">
                <li className="flex items-start gap-2.5">
                  <svg
                    className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-400"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                    <polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                  Confirms you actually own this email.
                </li>
                <li className="flex items-start gap-2.5">
                  <svg
                    className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-400"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                  Your manager uses it for shift updates.
                </li>
                <li className="flex items-start gap-2.5">
                  <svg
                    className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-400"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                  Used to recover your password later.
                </li>
              </ul>
            </div>
          </>
        ) : (
          <div className="space-y-2.5">
            <label className="block text-[12px] font-medium text-slate-700">
              Enter the 6-digit code
            </label>
            <OtpInput
              value={form.code}
              onChange={(next) => onChange({ ...form, code: next })}
            />
            <div className="flex items-center justify-between pt-0.5 text-[12px]">
              <span className="text-slate-500">
                Didn&apos;t get it? Check spam.
              </span>
              <button
                type="button"
                disabled={resendCooldown > 0 || loading}
                onClick={handleSend}
                className="font-medium text-blue-600 transition-colors enabled:hover:text-blue-700 disabled:text-slate-400"
              >
                {resendCooldown > 0
                  ? `Resend in ${resendCooldown}s`
                  : "Resend code"}
              </button>
            </div>
            {error && (
              <p className="text-[12px] font-medium text-red-500">{error}</p>
            )}
          </div>
        )}
      </div>

      <div className="sticky bottom-0 mt-auto space-y-2 border-t border-slate-100 bg-white px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">
        {!form.codeSent ? (
          <button
            type="button"
            disabled={!/\S+@\S+\.\S+/.test(form.email) || loading}
            onClick={handleSend}
            className={[
              "w-full rounded-xl px-5 py-3.5 text-[14px] font-semibold transition-all",
              /\S+@\S+\.\S+/.test(form.email) && !loading
                ? "bg-blue-600 text-white shadow-sm shadow-blue-500/20 hover:bg-blue-700"
                : "bg-slate-100 text-slate-400",
            ].join(" ")}
          >
            {loading ? "Sending…" : "Send verification code"}
          </button>
        ) : (
          <button
            type="button"
            disabled={form.code.length !== 6 || loading}
            onClick={onVerify}
            className={[
              "w-full rounded-xl px-5 py-3.5 text-[14px] font-semibold transition-all",
              form.code.length === 6 && !loading
                ? "bg-blue-600 text-white shadow-sm shadow-blue-500/20 hover:bg-blue-700"
                : "bg-slate-100 text-slate-400",
            ].join(" ")}
          >
            {loading ? "Verifying…" : "Verify & continue"}
          </button>
        )}
      </div>
    </div>
  );
}
