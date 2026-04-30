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
  const [formId, setFormId] = useState<string | null>(null);
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

  // 기존 candidate 로그인 — "가입만 하고 이탈" 케이스
  const [showLogin, setShowLogin] = useState(false);
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [prefilledToken, setPrefilledToken] = useState<string | null>(null);

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
        setFormId(formRes.data.form_id);
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

  const handleLogin = async () => {
    setLoginError(null);
    setLoginLoading(true);
    try {
      const res = await publicApi.post<{
        candidate_id: string;
        username: string;
        email: string;
        full_name: string;
        verification_token: string;
      }>("/app/applications/login", {
        encoded,
        username: loginUsername,
        password: loginPassword,
      });
      // candidate 정보로 account state 채움
      setAccount({
        fullName: res.data.full_name,
        username: res.data.username,
        password: loginPassword,
        confirmPassword: loginPassword,
        email: res.data.email,
        showPassword: false,
        showConfirmPassword: false,
      });
      setEmailForm((prev) => ({ ...prev, email: res.data.email, verified: true }));
      setPrefilledToken(res.data.verification_token);
      setShowLogin(false);
      // 폼이 있으면 form step, 없으면 바로 submit (verify step 건너뛰기)
      if (hasForm) {
        setStep("form");
      } else {
        // 폼 없으면 즉시 submit
        await submitWithToken(res.data.verification_token);
      }
    } catch (err) {
      const detail = axios.isAxiosError(err) && err.response?.data?.detail;
      let msg = "Login failed.";
      if (detail && typeof detail === "object") {
        const code = (detail as { code?: string }).code;
        const m = (detail as { message?: string }).message;
        if (code === "invalid_credentials") msg = "ID or password incorrect.";
        else if (code === "active_application_exists")
          msg = "You already have an active application for this store.";
        else if (code === "not_eligible")
          msg = "You are not eligible to apply to this store.";
        else if (typeof m === "string") msg = m;
      }
      setLoginError(msg);
    } finally {
      setLoginLoading(false);
    }
  };

  const submitWithToken = async (verificationToken: string) => {
    if (!ctx) return;
    setSubmittingFinal(true);
    try {
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
        form_id: formId,
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
    } finally {
      setSubmittingFinal(false);
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
        form_id: formId,
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

  // 로그인 모달은 어떤 step에서든 표시 가능
  const loginModal = showLogin ? (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={() => setShowLogin(false)}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-[16px] font-semibold text-slate-900">
          Log in to continue
        </h3>
        <p className="mt-1 text-[12.5px] leading-relaxed text-slate-500">
          Already have an account from a previous application? Log in and
          we&apos;ll skip the account/email step.
        </p>
        <div className="mt-4 space-y-2">
          <input
            value={loginUsername}
            onChange={(e) => setLoginUsername(e.target.value)}
            placeholder="ID"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] outline-none focus:border-blue-500"
          />
          <input
            type="password"
            value={loginPassword}
            onChange={(e) => setLoginPassword(e.target.value)}
            placeholder="Password"
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] outline-none focus:border-blue-500"
          />
        </div>
        {loginError && (
          <p className="mt-2 text-[12px] text-red-600">{loginError}</p>
        )}
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => setShowLogin(false)}
            disabled={loginLoading}
            className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-[13px] font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleLogin}
            disabled={loginLoading || !loginUsername || !loginPassword}
            className="flex-[2] rounded-lg bg-blue-600 px-3 py-2 text-[13px] font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {loginLoading ? "Logging in…" : "Log in"}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  switch (step) {
    case "welcome":
      return (
        <>
          <div className="relative">
            <WelcomeScreen ctx={ctx} onContinue={() => setStep("account")} />
            <div className="border-t border-slate-100 bg-white px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2">
              <p className="text-center text-[12px] text-slate-500">
                Already applied somewhere?{" "}
                <button
                  type="button"
                  onClick={() => setShowLogin(true)}
                  className="font-semibold text-blue-600 underline-offset-2 hover:underline"
                >
                  Log in
                </button>
              </p>
            </div>
          </div>
          {loginModal}
        </>
      );
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
          onBack={() => setStep(prefilledToken ? "welcome" : "account")}
          onContinue={async () => {
            if (prefilledToken) {
              // 이미 로그인된 candidate — email step 건너뛰고 바로 submit
              try {
                await submitWithToken(prefilledToken);
              } catch (err) {
                const detail =
                  axios.isAxiosError(err) && err.response?.data?.detail;
                const m =
                  (detail && typeof detail === "object" && (detail as { message?: string }).message) ||
                  "Submit failed.";
                setFinalError(typeof m === "string" ? m : "Submit failed.");
              }
            } else {
              setStep("email");
            }
          }}
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
