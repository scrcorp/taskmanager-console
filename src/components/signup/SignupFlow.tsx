"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import axios from "axios";
import type {
  AccountFormState,
  ApplicationStageClient,
  EmailFormState,
  LinkErrorCode,
  SignupContext,
  SignupStep,
} from "@/types/signup";
import type { HiringFormConfig } from "@/hooks/useHiring";
import { WelcomeScreen } from "./WelcomeScreen";
import { AccountScreen } from "./AccountScreen";
import { EmailVerifyScreen } from "./EmailVerifyScreen";
import { StatusScreen } from "./StatusScreen";
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
  const t = useTranslations("signup");
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
    preferredLanguage: "en",
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

  // 진행형 가입 — /start로 받은 pending_form application id 보관
  const [applicationId, setApplicationId] = useState<string | null>(null);
  // status screen 에서 보여줄 application stage (signup 완료 후 갱신)
  const [appStage, setAppStage] = useState<ApplicationStageClient>("pending_form");
  // 이미 가입된 이메일 안내 모달
  const [showEmailInUseModal, setShowEmailInUseModal] = useState(false);

  // 기존 candidate 로그인 — "가입만 하고 이탈" 케이스
  const [showLogin, setShowLogin] = useState(false);
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

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
        // candidate_reg: hiring 가입 — 서버가 User + Candidate 양쪽 중복 체크해서
        // 이미 가입된 이메일이면 409 ConflictError 반환.
        purpose: "candidate_reg",
      });
      setEmailForm((prev) => ({ ...prev, codeSent: true, code: "" }));
    } catch (err) {
      const status = axios.isAxiosError(err) && err.response?.status;
      const detail = axios.isAxiosError(err) && err.response?.data?.detail;
      // detail 은 string (BadRequestError) 또는 {message: string} (ConflictError) 형태
      const text =
        typeof detail === "string"
          ? detail
          : (detail && typeof detail === "object" && typeof (detail as { message?: string }).message === "string")
            ? (detail as { message: string }).message
            : t("emailVerifyFailedSend");
      // 이미 가입된 이메일 → 모달
      if (status === 409 && /already registered|already.*use/i.test(text)) {
        setShowEmailInUseModal(true);
        return;
      }
      // 쿨다운 안내 (60초 안에 재요청한 케이스)
      if (status === 400 && /wait/i.test(text)) {
        setEmailError(t("emailVerifyCooldown"));
        return;
      }
      setEmailError(text);
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
        pending_application: { id: string; store_id: string; stage: string } | null;
      }>("/app/applications/login", {
        encoded,
        username: loginUsername,
        password: loginPassword,
      });
      setAccount({
        fullName: res.data.full_name,
        username: res.data.username,
        password: loginPassword,
        confirmPassword: loginPassword,
        email: res.data.email,
        showPassword: false,
        showConfirmPassword: false,
        preferredLanguage: "en",
      });
      setEmailForm((prev) => ({ ...prev, email: res.data.email, verified: true }));
      setShowLogin(false);

      const pending = res.data.pending_application;
      if (pending) {
        // 어느 stage 든 status 화면으로 — pending_form 이면 status 에서 "Continue your application"
        // 버튼으로 form 진입, 다른 stage 면 진행 상황 확인.
        setApplicationId(pending.id);
        setAppStage(pending.stage as ApplicationStageClient);
        if (pending.stage === "pending_form" && !hasForm) {
          // 폼 없는 매장에서 pending_form 으로 남아있는 비정상 케이스 — 자동 complete
          await completePendingApplication(pending.id);
        } else {
          setStep("status");
        }
      } else {
        // pending 없음 = 이 매장에서 새로 시작해야. 일단은 안내.
        setLoginError(t("loginNoApplication"));
      }
    } catch (err) {
      const detail = axios.isAxiosError(err) && err.response?.data?.detail;
      let msg = t("loginFailed");
      if (detail && typeof detail === "object") {
        const code = (detail as { code?: string }).code;
        const m = (detail as { message?: string }).message;
        if (code === "invalid_credentials") msg = t("loginInvalidCredentials");
        else if (code === "active_application_exists")
          msg = t("emailVerifyActiveApplication");
        else if (code === "not_eligible") msg = t("emailVerifyNotEligible");
        else if (typeof m === "string") msg = m;
      }
      setLoginError(msg);
    } finally {
      setLoginLoading(false);
    }
  };

  const completePendingApplication = async (appId: string) => {
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
      await publicApi.post("/app/applications/complete", {
        application_id: appId,
        form_id: formId,
        answers: answerArr,
        attachments: attachmentArr,
      });
      setEmailForm((prev) => ({ ...prev, verified: true }));
      setAppStage("new");
      setStep("status");
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

      // Step 1 — /start로 회원가입만 진행. application_id 받아 form step으로.
      const startRes = await publicApi.post<{
        application_id: string;
        candidate_id: string;
        stage: string;
        resumed: boolean;
      }>("/app/applications/start", {
        encoded,
        username: account.username,
        password: account.password,
        full_name: account.fullName,
        email: account.email,
        verification_token: verificationToken,
        preferred_language: account.preferredLanguage,
      });

      const newAppId = startRes.data.application_id;
      setApplicationId(newAppId);
      setAppStage("pending_form");
      setEmailForm((prev) => ({ ...prev, verified: true }));

      // 폼이 있으면 status로 가서 "지원서 제출" CTA 보여주거나 form 으로 직행
      // (UX: 가입 직후 logged-in 인지를 명확히 하기 위해 일단 status 로 이동하고
      // pending_form 상태에서 'Continue your application' 버튼으로 form 진입)
      if (hasForm) {
        setStep("status");
      } else {
        await completePendingApplication(newAppId);
      }
    } catch (err) {
      const detail =
        axios.isAxiosError(err) && err.response?.data?.detail;
      let msg = t("emailVerifyFailed");
      if (detail && typeof detail === "object") {
        const code = (detail as { code?: string }).code;
        const message = (detail as { message?: string }).message;
        if (code === "username_taken") {
          msg = t("emailVerifyUsernameTaken");
        } else if (code === "email_taken") {
          msg = t("emailVerifyEmailTaken");
        } else if (code === "credential_mismatch") {
          msg = t("emailVerifyCredentialMismatch");
        } else if (code === "active_application_exists") {
          msg = t("emailVerifyActiveApplication");
        } else if (code === "not_eligible") {
          msg = t("emailVerifyNotEligible");
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
          <p className="text-[12px]">{t("loading")}</p>
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
          {t("loginTitle")}
        </h3>
        <p className="mt-1 text-[12.5px] leading-relaxed text-slate-500">
          {t("loginSubtitle")}
        </p>
        <div className="mt-4 space-y-2">
          <input
            value={loginUsername}
            onChange={(e) => setLoginUsername(e.target.value)}
            placeholder={t("loginIdPlaceholder")}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] outline-none focus:border-blue-500"
          />
          <input
            type="password"
            value={loginPassword}
            onChange={(e) => setLoginPassword(e.target.value)}
            placeholder={t("loginPasswordPlaceholder")}
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
            {t("cancel")}
          </button>
          <button
            type="button"
            onClick={handleLogin}
            disabled={loginLoading || !loginUsername || !loginPassword}
            className="flex-[2] rounded-lg bg-blue-600 px-3 py-2 text-[13px] font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {loginLoading ? t("loginButtonLoading") : t("loginButton")}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  // 이미 가입된 이메일 안내 모달 — Send code 단계에서 409 시 표시.
  // "이미 가입되어 있는 메일입니다" — 사용자가 로그인 또는 다른 이메일로 시도하도록 안내.
  const emailInUseModal = showEmailInUseModal ? (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={() => setShowEmailInUseModal(false)}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-[16px] font-semibold text-slate-900">
          {t("emailInUseTitle")}
        </h3>
        <p className="mt-1.5 text-[13px] leading-relaxed text-slate-500">
          {t("emailInUseBodyPrefix")}{" "}
          <span className="font-semibold text-slate-700">
            {emailForm.email || account.email}
          </span>
          {t("emailInUseBodySuffix")}
        </p>
        <div className="mt-4 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => {
              setLoginUsername("");
              setLoginPassword("");
              setLoginError(null);
              setShowEmailInUseModal(false);
              setShowLogin(true);
            }}
            className="w-full rounded-lg bg-blue-600 px-3 py-2.5 text-[13px] font-semibold text-white hover:bg-blue-700"
          >
            {t("emailInUseLogIn")}
          </button>
          <button
            type="button"
            onClick={() => {
              setShowEmailInUseModal(false);
              setStep("account");
            }}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-[13px] font-medium text-slate-700 hover:bg-slate-50"
          >
            {t("emailInUseUseDifferent")}
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
            <WelcomeScreen
              ctx={ctx}
              hasForm={hasForm}
              onContinue={() => setStep("account")}
            />
            <div className="border-t border-slate-100 bg-white px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-2">
              <p className="text-center text-[12px] text-slate-500">
                {t("welcomeAlreadyApplied")}{" "}
                <button
                  type="button"
                  onClick={() => setShowLogin(true)}
                  className="font-semibold text-blue-600 underline-offset-2 hover:underline"
                >
                  {t("welcomeLogIn")}
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
          onContinue={() => setStep("email")}
          hasForm={hasForm}
        />
      );
    case "email":
      return (
        <>
          <EmailVerifyScreen
            form={emailForm}
            onChange={setEmailForm}
            onBack={() => setStep("account")}
            onSendCode={handleSendCode}
            onVerify={handleVerify}
            loading={emailLoading || submittingFinal}
            error={emailError ?? finalError}
            hasForm={hasForm}
          />
          {emailInUseModal}
          {loginModal}
        </>
      );
    case "form":
      if (!formConfig) {
        setStep("status");
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
          onBack={() => setStep("status")}
          onContinue={async () => {
            if (!applicationId) {
              setFinalError(t("formApplicationNotInitialized"));
              return;
            }
            try {
              await completePendingApplication(applicationId);
            } catch (err) {
              const detail =
                axios.isAxiosError(err) && err.response?.data?.detail;
              const m =
                (detail && typeof detail === "object" && (detail as { message?: string }).message) ||
                t("formSubmitFailed");
              setFinalError(typeof m === "string" ? m : t("formSubmitFailed"));
            }
          }}
        />
      );
    case "status":
      return (
        <StatusScreen
          ctx={ctx}
          fullName={account.fullName}
          username={account.username}
          stage={appStage}
          hasForm={hasForm}
          onContinueForm={
            hasForm && appStage === "pending_form"
              ? () => setStep("form")
              : undefined
          }
          onWithdraw={
            applicationId
              ? async () => {
                  try {
                    await publicApi.post(
                      `/app/applications/${applicationId}/withdraw`,
                      {
                        username: account.username,
                        password: account.password,
                      },
                    );
                    setAppStage("withdrawn");
                  } catch {
                    // no-op fallback — UI 표시만 일단 갱신
                    setAppStage("withdrawn");
                  }
                }
              : undefined
          }
          onGoToApp={
            appStage === "hired"
              ? () => {
                  window.location.href = "/login";
                }
              : undefined
          }
          onRefresh={
            applicationId
              ? async () => {
                  try {
                    const res = await publicApi.post<{
                      pending_application: {
                        id: string;
                        store_id: string;
                        stage: ApplicationStageClient;
                      } | null;
                    }>("/app/applications/login", {
                      encoded,
                      username: account.username,
                      password: account.password,
                    });
                    const pa = res.data.pending_application;
                    if (pa) setAppStage(pa.stage);
                  } catch {
                    // no-op
                  }
                }
              : undefined
          }
        />
      );
  }
}
