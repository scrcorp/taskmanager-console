"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import type {
  AccountFormState,
  EmailFormState,
  LinkErrorCode,
  SignupContext,
} from "@/types/signup";
import { ShieldCheck } from "lucide-react";
import { WelcomeScreen } from "./WelcomeScreen";
import { AccountScreen } from "./AccountScreen";
import { EmailVerifyScreen } from "./EmailVerifyScreen";
import { CompleteScreen } from "./CompleteScreen";
import { InvalidLinkScreen } from "./InvalidLinkScreen";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

const publicApi = axios.create({
  baseURL: API_BASE,
  headers: { "Content-Type": "application/json" },
});

type DirectStep = "welcome" | "account" | "email" | "complete";

interface Props {
  encoded: string;
}

/**
 * Direct staff signup flow.
 * 폼/지원자 단계 없이 즉시 staff 등록. `/direct/{encoded}`에서 사용.
 */
export function DirectSignupFlow({ encoded }: Props) {
  const [loading, setLoading] = useState(true);
  const [linkError, setLinkError] = useState<LinkErrorCode | null>(null);
  const [ctx, setCtx] = useState<SignupContext | null>(null);
  const [step, setStep] = useState<DirectStep>("welcome");

  const [account, setAccount] = useState<AccountFormState>({
    fullName: "",
    username: "",
    password: "",
    confirmPassword: "",
    email: "",
    showPassword: false,
    showConfirmPassword: false,
  });
  const [emailForm, setEmailForm] = useState<EmailFormState>({
    email: "",
    codeSent: false,
    code: "",
    verified: false,
  });
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [submittingFinal, setSubmittingFinal] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await publicApi.get<SignupContext>(
          `/app/auth/stores/by-code/${encoded}`,
        );
        if (cancelled) return;
        setCtx(res.data);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        const code =
          (axios.isAxiosError(err) && err.response?.data?.detail?.code) ||
          "invalid_link";
        setLinkError(code as LinkErrorCode);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [encoded]);

  const handleAccountChange = (next: AccountFormState) => {
    setAccount(next);
    setEmailForm((prev) => ({ ...prev, email: next.email }));
  };

  const handleSendCode = async () => {
    setEmailLoading(true);
    setEmailError(null);
    try {
      await publicApi.post("/app/auth/send-verification-code", {
        email: emailForm.email,
        purpose: "registration",
      });
      setEmailForm((prev) => ({ ...prev, codeSent: true, code: "" }));
    } catch (err) {
      const msg =
        (axios.isAxiosError(err) && err.response?.data?.detail) ||
        "Failed to send code. Try again.";
      setEmailError(typeof msg === "string" ? msg : "Failed to send code.");
    } finally {
      setEmailLoading(false);
    }
  };

  const handleVerify = async () => {
    setEmailLoading(true);
    setEmailError(null);
    try {
      const verifyRes = await publicApi.post("/app/auth/verify-email-code", {
        email: emailForm.email,
        code: emailForm.code,
      });
      const verificationToken: string = verifyRes.data.verification_token;

      setSubmittingFinal(true);
      await publicApi.post("/app/auth/direct-signup", {
        encoded,
        username: account.username,
        password: account.password,
        full_name: account.fullName,
        email: account.email,
        verification_token: verificationToken,
      });
      setEmailForm((p) => ({ ...p, verified: true }));
      setStep("complete");
    } catch (err) {
      const detail = axios.isAxiosError(err) && err.response?.data?.detail;
      let msg = "Verification failed.";
      if (detail && typeof detail === "object") {
        const m = (detail as { message?: string }).message;
        if (typeof m === "string") msg = m;
      } else if (typeof detail === "string") {
        msg = detail;
      }
      setEmailError(msg);
    } finally {
      setEmailLoading(false);
      setSubmittingFinal(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center bg-white">
        <div className="flex flex-col items-center gap-3 text-slate-400">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-blue-500" />
          <p className="text-[12px]">Loading…</p>
        </div>
      </div>
    );
  }

  if (linkError || !ctx) {
    return <InvalidLinkScreen reason={linkError ?? "invalid_link"} />;
  }

  // Direct 진입 시 사용자에게 명확히 알림 (지원이 아니라 즉시 staff 등록)
  if (step === "welcome") {
    return (
      <div className="flex min-h-[100dvh] flex-col bg-white">
        <WelcomeScreen ctx={ctx} onContinue={() => setStep("account")} />
        <div className="border-t border-slate-100 bg-emerald-50 px-5 py-3">
          <div className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 flex-shrink-0 text-emerald-600" size={16} />
            <p className="text-[11.5px] leading-relaxed text-emerald-800">
              <strong>Direct staff signup.</strong> This link skips the
              applicant review step. You&apos;ll be added to{" "}
              <span className="font-semibold">{ctx.store.name}</span> as a staff
              member immediately after verifying your email.
            </p>
          </div>
        </div>
      </div>
    );
  }

  switch (step) {
    case "account":
      return (
        <AccountScreen
          form={account}
          onChange={handleAccountChange}
          onBack={() => setStep("welcome")}
          onContinue={() => setStep("email")}
        />
      );
    case "email":
      return (
        <EmailVerifyScreen
          form={emailForm}
          onChange={setEmailForm}
          onBack={() => setStep("account")}
          onSendCode={handleSendCode}
          onVerify={handleVerify}
          loading={emailLoading || submittingFinal}
          error={emailError}
        />
      );
    case "complete":
      return (
        <CompleteScreen
          mode="direct"
          ctx={ctx}
          fullName={account.fullName}
          onRestart={() => {
            setAccount({
              fullName: "",
              username: "",
              password: "",
              confirmPassword: "",
              email: "",
              showPassword: false,
              showConfirmPassword: false,
            });
            setEmailForm({
              email: "",
              codeSent: false,
              code: "",
              verified: false,
            });
            setStep("welcome");
          }}
        />
      );
  }
}
