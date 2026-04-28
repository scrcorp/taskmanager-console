"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import type {
  AccountFormState,
  EmailFormState,
  LinkErrorCode,
  SignupContext,
  SignupStep,
} from "@/types/signup";
import { WelcomeScreen } from "./WelcomeScreen";
import { AccountScreen } from "./AccountScreen";
import { EmailVerifyScreen } from "./EmailVerifyScreen";
import { CompleteScreen } from "./CompleteScreen";
import { InvalidLinkScreen } from "./InvalidLinkScreen";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

/** 공개 가입 페이지 — 토큰 없이 호출 가능한 axios 인스턴스. */
const publicApi = axios.create({
  baseURL: API_BASE,
  headers: { "Content-Type": "application/json" },
});

interface Props {
  encoded: string;
}

export function SignupFlow({ encoded }: Props) {
  const [loading, setLoading] = useState(true);
  const [linkError, setLinkError] = useState<LinkErrorCode | null>(null);
  const [ctx, setCtx] = useState<SignupContext | null>(null);
  const [step, setStep] = useState<SignupStep>("welcome");

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
  const [finalError, setFinalError] = useState<string | null>(null);

  // 매장 정보 fetch
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await publicApi.get<SignupContext>(
          `/app/auth/stores/by-code/${encoded}`,
        );
        if (!cancelled) {
          setCtx(res.data);
          setLoading(false);
        }
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

  // Account → Email로 넘어갈 때 email pre-fill
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
    if (!ctx) return;
    setEmailLoading(true);
    setEmailError(null);
    setFinalError(null);
    try {
      const verifyRes = await publicApi.post("/app/auth/verify-email-code", {
        email: emailForm.email,
        code: emailForm.code,
      });
      const verificationToken: string = verifyRes.data.verification_token;

      setSubmittingFinal(true);
      await publicApi.post("/app/auth/register", {
        username: account.username,
        password: account.password,
        full_name: account.fullName,
        email: account.email,
        company_code: ctx.organization.company_code,
        verification_token: verificationToken,
        store_ids: [ctx.store.id],
      });

      setEmailForm((prev) => ({ ...prev, verified: true }));
      setStep("complete");
    } catch (err) {
      const msg =
        (axios.isAxiosError(err) && err.response?.data?.detail) ||
        "Verification failed. Check the code and try again.";
      setEmailError(typeof msg === "string" ? msg : "Verification failed.");
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

  switch (step) {
    case "welcome":
      return <WelcomeScreen ctx={ctx} onContinue={() => setStep("account")} />;
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
          error={emailError ?? finalError}
        />
      );
    case "complete":
      return (
        <CompleteScreen
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
            setEmailError(null);
            setFinalError(null);
            setStep("welcome");
          }}
        />
      );
  }
}
