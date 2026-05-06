"use client";

/**
 * 이메일 인증 페이지 — email_verified=false인 관리자용.
 *
 * 로그인 후 이메일 미인증 시 대시보드 layout에서 리다이렉트.
 * 이메일 입력 → 코드 발송 → 코드 검증 → fetchMe() → 대시보드로 이동.
 */

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/authStore";
import { isAuthenticated } from "@/lib/auth";
import api from "@/lib/api";

/** 서버 에러 응답에서 사용자 친화적 메시지 추출 */
function parseApiError(e: unknown, fallback: string): string {
  const err = e as { response?: { data?: { detail?: unknown } } };
  const detail = err.response?.data?.detail;
  if (typeof detail === "string") return detail;
  if (detail && typeof detail === "object") {
    const d = detail as Record<string, unknown>;
    const msg = d.message as string | undefined;
    if (msg) return msg;
  }
  return fallback;
}

export default function VerifyEmailPage() {
  const router = useRouter();
  const { user, fetchMe, logout } = useAuthStore();

  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [verified, setVerified] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [remaining, setRemaining] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Pre-fill email & redirect if already verified (but not during success screen)
  useEffect(() => {
    if (!isAuthenticated()) {
      router.push("/login");
      return;
    }
    if (user?.email && !email) setEmail(user.email);
    if (user?.email_verified && !verified) router.push("/");
  }, [user]);

  // Countdown timer
  useEffect(() => {
    if (remaining <= 0) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }
    timerRef.current = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          clearInterval(timerRef.current!);
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [codeSent]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const handleSendCode = async () => {
    if (!email.trim()) return;
    setIsLoading(true);
    setError("");
    try {
      await api.post("/app/auth/send-verification-code", {
        email: email.trim(),
        purpose: "login_verify",
      });
      setCodeSent(true);
      setRemaining(300);
    } catch (e) {
      setError(parseApiError(e, "Failed to send code"));
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerify = async () => {
    if (!code.trim() || code.length !== 6) return;
    setIsLoading(true);
    setError("");
    try {
      await api.post("/app/auth/confirm-email", {
        email: email.trim(),
        code: code.trim(),
      });
      setVerified(true);
      await fetchMe();
    } catch (e) {
      setError(parseApiError(e, "Verification failed"));
    } finally {
      setIsLoading(false);
    }
  };

  // 성공 화면
  if (verified) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="bg-surface rounded-2xl p-8 border border-border text-center">
            <div className="flex justify-center mb-6">
              <div className="w-20 h-20 rounded-full bg-success-muted flex items-center justify-center">
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-success">
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              </div>
            </div>
            <h1 className="text-2xl font-extrabold text-text mb-2">
              Email Verified
            </h1>
            <p className="text-text-secondary text-sm mb-8">
              Your email has been verified successfully.<br />
              You can now use all features of HTM.
            </p>
            <button
              onClick={() => router.push("/")}
              className="w-full py-3 bg-accent text-white text-sm font-semibold rounded-xl hover:bg-accent-light transition-colors"
            >
              Go to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-surface rounded-2xl p-8 border border-border">
          {/* Icon */}
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 rounded-full bg-accent-muted flex items-center justify-center">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-accent">
                <rect x="2" y="4" width="20" height="16" rx="2" />
                <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
              </svg>
            </div>
          </div>

          <h1 className="text-2xl font-extrabold text-text text-center mb-2">
            Verify Your Email
          </h1>
          <p className="text-text-secondary text-sm text-center mb-8">
            To continue using HTM Admin,
            <br />
            please verify your email address.
          </p>

          {/* Email field */}
          <label className="text-xs font-semibold text-text-secondary block mb-2">
            Email
          </label>
          <div className="flex gap-2 mb-1">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={codeSent}
              placeholder="example@email.com"
              className="flex-1 px-4 py-3 bg-bg border border-border rounded-xl text-text text-sm placeholder:text-text-muted focus:outline-none focus:border-accent disabled:opacity-50"
            />
            <button
              onClick={handleSendCode}
              disabled={isLoading || !email.trim()}
              className="px-4 py-3 bg-accent-muted text-accent text-sm font-semibold rounded-xl hover:bg-[rgba(108,92,231,0.25)] transition-colors disabled:opacity-40 whitespace-nowrap"
            >
              {codeSent ? "Resend" : "Send Code"}
            </button>
          </div>
          <p className="text-xs text-text-muted mb-5">
            You can change your email address if needed.
          </p>

          {/* Code field */}
          {codeSent && (
            <>
              <label className="text-xs font-semibold text-text-secondary block mb-2">
                Verification Code
              </label>
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="6-digit code"
                  maxLength={6}
                  className="flex-1 px-4 py-3 bg-bg border border-border rounded-xl text-text text-sm placeholder:text-text-muted focus:outline-none focus:border-accent tracking-widest"
                />
                <button
                  onClick={handleVerify}
                  disabled={isLoading || code.length !== 6}
                  className="px-4 py-3 bg-accent text-white text-sm font-semibold rounded-xl hover:bg-accent-light transition-colors disabled:opacity-40 whitespace-nowrap"
                >
                  Verify
                </button>
              </div>
              {remaining > 0 && (
                <p className="text-xs font-semibold text-danger">
                  ⏱ {formatTime(remaining)} remaining
                </p>
              )}
            </>
          )}

          {/* Error */}
          {error && (
            <div className="mt-4 p-3 bg-danger-muted border border-danger/30 rounded-xl">
              <p className="text-sm text-danger whitespace-pre-line">{error}</p>
            </div>
          )}

          {/* Logout */}
          <div className="text-center mt-8">
            <button
              onClick={logout}
              className="text-sm text-text-muted hover:text-text-secondary underline transition-colors"
            >
              Log out
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
