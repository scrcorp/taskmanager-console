"use client";

import type { AccountFormState } from "@/types/signup";
import { StepIndicator } from "./StepIndicator";
import { SIGNUP_STEPS } from "./steps";

interface Props {
  form: AccountFormState;
  onChange: (next: AccountFormState) => void;
  onBack: () => void;
  onContinue: () => void;
}

const Field = ({
  label,
  children,
  hint,
  error,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
  error?: string;
}) => (
  <div className="space-y-1.5">
    <label className="block text-[12px] font-medium text-slate-700">
      {label}
    </label>
    {children}
    {error ? (
      <p className="text-[11px] font-medium text-red-500">{error}</p>
    ) : hint ? (
      <p className="text-[11px] text-slate-400">{hint}</p>
    ) : null}
  </div>
);

const EyeIcon = ({ open }: { open: boolean }) => (
  <svg
    className="h-5 w-5"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {open ? (
      <>
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ) : (
      <>
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
        <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
        <line x1="1" y1="1" x2="23" y2="23" />
      </>
    )}
  </svg>
);

export function AccountScreen({ form, onChange, onBack, onContinue }: Props) {
  const update = <K extends keyof AccountFormState>(
    key: K,
    value: AccountFormState[K],
  ) => onChange({ ...form, [key]: value });

  const passwordMismatch =
    form.confirmPassword.length > 0 && form.password !== form.confirmPassword;

  const canContinue =
    form.fullName.trim().length > 1 &&
    form.username.trim().length > 2 &&
    form.password.length >= 6 &&
    form.password === form.confirmPassword &&
    /\S+@\S+\.\S+/.test(form.email);

  return (
    <div className="flex min-h-[100dvh] flex-col bg-white">
      <div className="border-b border-slate-100 bg-white px-5 pt-[max(0.75rem,env(safe-area-inset-top))] pb-4">
        <StepIndicator steps={SIGNUP_STEPS} current="account" />
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
        <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-slate-900">
          Tell us about you
        </h1>
        <p className="mt-1.5 text-[14px] leading-relaxed text-slate-500">
          Your manager will see your name and email.
        </p>
      </div>

      <div className="space-y-4 px-5 pt-6 pb-4">
        <Field label="Full name">
          <input
            type="text"
            autoComplete="name"
            value={form.fullName}
            onChange={(e) => update("fullName", e.target.value)}
            placeholder="e.g. Sarah Kim"
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-[14px] text-slate-900 placeholder-slate-400 outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
        </Field>

        <Field
          label="ID"
          hint="Used to log in. Lowercase letters and numbers."
        >
          <div className="relative">
            <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[14px] text-slate-400">
              @
            </span>
            <input
              type="text"
              autoComplete="username"
              value={form.username}
              onChange={(e) => update("username", e.target.value.toLowerCase())}
              placeholder="sarahk"
              className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-9 pr-4 text-[14px] text-slate-900 placeholder-slate-400 outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
          </div>
        </Field>

        <Field label="Email">
          <input
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={(e) => update("email", e.target.value)}
            placeholder="you@example.com"
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-[14px] text-slate-900 placeholder-slate-400 outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
          />
        </Field>

        <Field label="Password" hint="At least 6 characters.">
          <div className="relative">
            <input
              type={form.showPassword ? "text" : "password"}
              autoComplete="new-password"
              value={form.password}
              onChange={(e) => update("password", e.target.value)}
              placeholder="••••••••"
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 pr-11 text-[14px] text-slate-900 placeholder-slate-400 outline-none transition-colors focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
            />
            <button
              type="button"
              aria-label={form.showPassword ? "Hide password" : "Show password"}
              onClick={() => update("showPassword", !form.showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-slate-600"
            >
              <EyeIcon open={form.showPassword} />
            </button>
          </div>
        </Field>

        <Field
          label="Confirm password"
          error={passwordMismatch ? "Passwords don't match." : undefined}
        >
          <div className="relative">
            <input
              type={form.showConfirmPassword ? "text" : "password"}
              autoComplete="new-password"
              value={form.confirmPassword}
              onChange={(e) => update("confirmPassword", e.target.value)}
              placeholder="••••••••"
              className={[
                "w-full rounded-xl border bg-white px-4 py-3 pr-11 text-[14px] text-slate-900 placeholder-slate-400 outline-none transition-colors",
                passwordMismatch
                  ? "border-red-300 focus:border-red-500 focus:ring-2 focus:ring-red-100"
                  : "border-slate-200 focus:border-blue-500 focus:ring-2 focus:ring-blue-100",
              ].join(" ")}
            />
            <button
              type="button"
              aria-label={
                form.showConfirmPassword ? "Hide password" : "Show password"
              }
              onClick={() =>
                update("showConfirmPassword", !form.showConfirmPassword)
              }
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-slate-600"
            >
              <EyeIcon open={form.showConfirmPassword} />
            </button>
          </div>
        </Field>

        <div className="flex items-center gap-2 pt-1 text-[11px] text-slate-400">
          <svg
            className="h-3.5 w-3.5 flex-shrink-0"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          <span>Encrypted, used only for account verification.</span>
        </div>
      </div>

      <div className="sticky bottom-0 mt-auto border-t border-slate-100 bg-white px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">
        <button
          type="button"
          disabled={!canContinue}
          onClick={onContinue}
          className={[
            "w-full rounded-xl px-5 py-3.5 text-[14px] font-semibold transition-all",
            canContinue
              ? "bg-blue-600 text-white shadow-sm shadow-blue-500/20 hover:bg-blue-700"
              : "bg-slate-100 text-slate-400",
          ].join(" ")}
        >
          Continue
        </button>
      </div>
    </div>
  );
}
