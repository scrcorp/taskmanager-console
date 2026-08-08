"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
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
  const t = useTranslations("signup");
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
    preferredLanguage: "en",
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
  // 중복 안내 모달 — 인라인 문구만으로는 "그냥 안 넘어간다"고 오해하게 된다.
  const [showEmailInUseModal, setShowEmailInUseModal] = useState(false);
  const [showUsernameTakenModal, setShowUsernameTakenModal] = useState(false);

  // 계정 정보 단계의 중복 선체크 — 이메일 인증을 시작하기 전에 걸러낸다.
  const [accountChecking, setAccountChecking] = useState(false);
  const [accountUsernameError, setAccountUsernameError] = useState<string | null>(null);
  const [accountEmailError, setAccountEmailError] = useState<string | null>(null);

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
    // 값을 고치는 순간 이전 선체크 결과는 무효 — 경고를 남겨두면 또 오해를 부른다.
    if (next.username !== account.username) setAccountUsernameError(null);
    if (next.email !== account.email) setAccountEmailError(null);
    setAccount(next);
    setEmailForm((prev) => ({ ...prev, email: next.email }));
  };

  /// 계정 정보 → 이메일 인증으로 넘어가기 전, 아이디/이메일이 이미 쓰이는지 먼저 묻는다.
  /// 선체크가 실패하면(네트워크/서버 오류) 진행을 막지 않는다 — 생성 시점 409 가 최종 방어선.
  const handleAccountContinue = async () => {
    setAccountChecking(true);
    setAccountUsernameError(null);
    setAccountEmailError(null);
    try {
      const res = await publicApi.post<{
        username_available: boolean;
        email_available: boolean;
        resumable: boolean;
      }>("/app/auth/check-availability", {
        encoded,
        username: account.username,
        email: account.email,
        mode: "direct",
      });
      const { username_available, email_available } = res.data;
      if (!username_available) setAccountUsernameError(t("usernameTakenInline"));
      if (!email_available) setAccountEmailError(t("emailTakenInline"));
      if (username_available && email_available) setStep("email");
    } catch {
      setStep("email");
    } finally {
      setAccountChecking(false);
    }
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
      const detail = axios.isAxiosError(err) && err.response?.data?.detail;
      const text =
        typeof detail === "string"
          ? detail
          : (detail as { message?: string } | undefined)?.message ??
            t("emailVerifyFailedSend");
      setEmailError(text);
      // 409 = 이미 가입된 이메일. 모달로 원인과 다음 행동을 먼저 알린다.
      if (axios.isAxiosError(err) && err.response?.status === 409) {
        setShowEmailInUseModal(true);
      }
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
        preferred_language: account.preferredLanguage,
      });
      setEmailForm((p) => ({ ...p, verified: true }));
      setStep("complete");
    } catch (err) {
      const detail = axios.isAxiosError(err) && err.response?.data?.detail;
      let msg = t("emailVerifyFailed");
      let duplicate: "username" | "email" | null = null;
      if (detail && typeof detail === "object") {
        const code = (detail as { code?: string }).code;
        const m = (detail as { message?: string }).message;
        if (typeof m === "string") msg = m;
        if (code === "username_taken") duplicate = "username";
        else if (code === "email_taken") duplicate = "email";
      } else if (typeof detail === "string") {
        msg = detail;
      }
      // direct-signup 의 아이디 중복은 DuplicateError(문자열 detail, code 없음)로 온다.
      if (
        duplicate === null &&
        axios.isAxiosError(err) &&
        err.response?.status === 409 &&
        typeof detail === "string" &&
        /username/i.test(detail)
      ) {
        duplicate = "username";
      }
      setEmailError(msg);
      if (duplicate === "username") {
        setShowUsernameTakenModal(true);
      } else if (duplicate === "email") {
        setShowEmailInUseModal(true);
      }
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

  // Direct 진입 시 사용자에게 명확히 알림 (지원이 아니라 즉시 staff 등록)
  if (step === "welcome") {
    return (
      <div className="flex min-h-[100dvh] flex-col bg-white">
        <WelcomeScreen
          ctx={ctx}
          hasForm={false}
          onContinue={() => setStep("account")}
        />
        <div className="border-t border-slate-100 bg-emerald-50 px-5 py-3">
          <div className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 flex-shrink-0 text-emerald-600" size={16} />
            <p className="text-[11.5px] leading-relaxed text-emerald-800">
              <strong>{t("directBannerTitlePrefix")}</strong>{" "}
              {t("directBannerBodyPrefix")}{" "}
              <span className="font-semibold">{ctx.store.name}</span>{" "}
              {t("directBannerBodySuffix")}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // 이미 가입된 이메일 안내 — 코드 발송 단계에서 409 시 표시.
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
          {/* direct 모달에는 로그인 버튼이 없으므로 로그인 유도 문구가 다르다 */}
          {t("emailInUseBodySuffixDirect")}
        </p>
        <div className="mt-4">
          <button
            type="button"
            onClick={() => {
              setShowEmailInUseModal(false);
              setEmailError(null);
              setStep("account");
            }}
            className="w-full rounded-lg bg-blue-600 px-3 py-2.5 text-[13px] font-semibold text-white hover:bg-blue-700"
          >
            {t("emailInUseUseDifferent")}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  // 이미 쓰이는 아이디 안내 — 마지막 Verify 단계에서 409 시 표시.
  const usernameTakenModal = showUsernameTakenModal ? (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={() => setShowUsernameTakenModal(false)}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-[16px] font-semibold text-slate-900">
          {t("usernameTakenTitle")}
        </h3>
        <p className="mt-1.5 text-[13px] leading-relaxed text-slate-500">
          {t("usernameTakenBodyPrefix")}{" "}
          <span className="font-semibold text-slate-700">
            {account.username}
          </span>
          {t("usernameTakenBodySuffix")}
        </p>
        <div className="mt-4">
          <button
            type="button"
            onClick={() => {
              setShowUsernameTakenModal(false);
              setEmailError(null);
              setStep("account");
            }}
            className="w-full rounded-lg bg-blue-600 px-3 py-2.5 text-[13px] font-semibold text-white hover:bg-blue-700"
          >
            {t("usernameTakenChange")}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  switch (step) {
    case "account":
      return (
        <AccountScreen
          form={account}
          onChange={handleAccountChange}
          onBack={() => setStep("welcome")}
          onContinue={handleAccountContinue}
          hasForm={false}
          checking={accountChecking}
          usernameError={accountUsernameError}
          emailError={accountEmailError}
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
            error={emailError}
            hasForm={false}
          />
          {emailInUseModal}
          {usernameTakenModal}
        </>
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
              preferredLanguage: "en",
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
