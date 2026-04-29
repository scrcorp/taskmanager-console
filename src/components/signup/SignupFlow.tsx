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
import type { HiringFormConfig } from "@/hooks/useHiring";
import { WelcomeScreen } from "./WelcomeScreen";
import { AccountScreen } from "./AccountScreen";
import { EmailVerifyScreen } from "./EmailVerifyScreen";
import { CompleteScreen } from "./CompleteScreen";
import { InvalidLinkScreen } from "./InvalidLinkScreen";
import {
  FormStepScreen,
  type AnswerMap,
  type AttachmentMap,
} from "./FormStepScreen";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "";

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
  const [formConfig, setFormConfig] = useState<HiringFormConfig | null>(null);
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

  const [answers, setAnswers] = useState<AnswerMap>({});
  const [attachments, setAttachments] = useState<AttachmentMap>({});

  const [emailLoading, setEmailLoading] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [submittingFinal, setSubmittingFinal] = useState(false);
  const [finalError, setFinalError] = useState<string | null>(null);

  const hasForm =
    !!formConfig &&
    ((formConfig.questions?.length ?? 0) > 0 ||
      (formConfig.attachments?.length ?? 0) > 0 ||
      !!formConfig.welcome_message);

  // 매장 + 폼 fetch
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [storeRes, formRes] = await Promise.all([
          publicApi.get<SignupContext>(`/app/auth/stores/by-code/${encoded}`),
          publicApi.get<{
            store_id: string;
            form_id: string | null;
            config: HiringFormConfig;
          }>(`/app/applications/form/${encoded}`),
        ]);
        if (cancelled) return;
        setCtx(storeRes.data);
        setFormConfig(formRes.data.config);
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

      // 폼 답변 → submit body 형태로 변환
      const answerArr = Object.entries(answers).map(([qid, value]) => ({
        question_id: qid,
        value,
      }));
      const attachmentArr = Object.entries(attachments)
        .filter(([, v]) => v !== null)
        .map(([slotId, v]) => ({
          slot_id: slotId,
          file_key: v!.file_key,
          file_name: v!.file_name,
          file_size: v!.file_size,
          mime_type: v!.mime_type,
        }));

      await publicApi.post("/app/applications/submit", {
        encoded,
        username: account.username,
        password: account.password,
        full_name: account.fullName,
        email: account.email,
        verification_token: verificationToken,
        answers: answerArr,
        attachments: attachmentArr,
      });

      setEmailForm((prev) => ({ ...prev, verified: true }));
      setStep("complete");
    } catch (err) {
      const detail =
        axios.isAxiosError(err) && err.response?.data?.detail;
      let msg = "Verification failed. Check the code and try again.";
      if (detail && typeof detail === "object") {
        const code = (detail as { code?: string }).code;
        const message = (detail as { message?: string }).message;
        if (code === "username_taken") {
          msg = "This username is already in use. Choose a different one.";
        } else if (code === "email_taken") {
          msg =
            "An account with this email exists. If it's yours, log into the app instead of signing up again.";
        } else if (code === "credential_mismatch") {
          msg =
            "An account with this username/email already exists with a different password. Log into the app to apply with your existing account.";
        } else if (code === "active_application_exists") {
          msg = "You already have an active application for this store.";
        } else if (code === "not_eligible") {
          msg = "You are not eligible to apply to this store.";
        } else if (typeof message === "string") {
          msg = message;
        }
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

  switch (step) {
    case "welcome":
      return <WelcomeScreen ctx={ctx} onContinue={() => setStep("account")} />;
    case "account":
      return (
        <AccountScreen
          form={account}
          onChange={handleAccountChange}
          onBack={() => setStep("welcome")}
          onContinue={() => setStep(hasForm ? "form" : "email")}
        />
      );
    case "form":
      if (!formConfig) {
        setStep("email");
        return null;
      }
      return (
        <FormStepScreen
          config={formConfig}
          encoded={encoded}
          apiBase={API_BASE}
          answers={answers}
          setAnswers={setAnswers}
          attachments={attachments}
          setAttachments={setAttachments}
          onBack={() => setStep("account")}
          onContinue={() => setStep("email")}
        />
      );
    case "email":
      return (
        <EmailVerifyScreen
          form={emailForm}
          onChange={setEmailForm}
          onBack={() => setStep(hasForm ? "form" : "account")}
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
            setAnswers({});
            setAttachments({});
            setEmailError(null);
            setFinalError(null);
            setStep("welcome");
          }}
        />
      );
  }
}
