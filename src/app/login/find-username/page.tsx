"use client";

/**
 * 아이디 찾기 페이지 — 3단계 흐름:
 * 1. 이메일 입력 → POST /auth/find-username → 마스킹된 username 표시
 * 2. "Send Code" 버튼 → POST /auth/find-username/send-code → 인증코드 입력 활성화
 * 3. 인증코드 입력 → POST /auth/find-username/verify-code → full username 표시
 */

import { useState } from "react";
import Link from "next/link";
import {
  useFindUsername,
  useFindUsernameSendCode,
  useFindUsernameVerifyCode,
} from "@/hooks/usePassword";

type Step = "email" | "masked" | "code" | "done";

export default function FindUsernamePage() {
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [maskedUsername, setMaskedUsername] = useState("");
  const [code, setCode] = useState("");
  const [fullUsername, setFullUsername] = useState("");
  const [error, setError] = useState("");

  const findUsername = useFindUsername();
  const sendCode = useFindUsernameSendCode();
  const verifyCode = useFindUsernameVerifyCode();

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      const res = await findUsername.mutateAsync({ email });
      setMaskedUsername(res.masked_username);
      setStep("masked");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No account found with this email.");
    }
  };

  const handleSendCode = async () => {
    setError("");
    try {
      await sendCode.mutateAsync({ email });
      setStep("code");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send verification code.");
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      const res = await verifyCode.mutateAsync({ email, code });
      setFullUsername(res.username);
      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid or expired code.");
    }
  };

  const handleRetry = () => {
    setStep("email");
    setEmail("");
    setMaskedUsername("");
    setCode("");
    setFullUsername("");
    setError("");
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-bg">
      <div className="w-full max-w-[400px] mx-4 bg-card border border-border rounded-2xl p-8">
        {/* Step 1: 이메일 입력 */}
        {step === "email" && (
          <>
            <div className="text-center mb-8">
              <h1 className="text-xl font-extrabold text-text">Find ID</h1>
              <p className="text-sm text-text-secondary mt-2">
                Enter the email associated with your account.
              </p>
            </div>

            <form onSubmit={handleSearch} className="space-y-4">
              {error && (
                <div className="bg-danger/10 text-danger text-sm rounded-lg px-4 py-3">
                  {error}
                </div>
              )}
              <div>
                <label className="block text-sm font-semibold text-text-secondary mb-1.5">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="example@email.com"
                  className="w-full px-4 py-3 rounded-lg border border-border bg-surface text-text text-sm outline-none focus:border-accent transition-colors"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={!email.trim() || findUsername.isPending}
                className="w-full py-3 rounded-lg bg-accent text-white font-bold text-sm hover:bg-accent-light disabled:opacity-50 transition-colors"
              >
                {findUsername.isPending ? "Searching..." : "Search"}
              </button>
            </form>
          </>
        )}

        {/* Step 2: 마스킹된 username 표시 */}
        {step === "masked" && (
          <>
            <div className="text-center mb-8">
              <h1 className="text-xl font-extrabold text-text">Find ID</h1>
              <p className="text-sm text-text-secondary mt-2">
                We found an account associated with your email.
              </p>
            </div>

            <div className="bg-accent/10 border border-accent/20 rounded-lg px-5 py-4 text-center mb-6">
              <p className="text-xs text-text-secondary mb-1">Your username</p>
              <p className="text-xl font-extrabold text-accent tracking-wider font-mono">
                {maskedUsername}
              </p>
            </div>

            {error && (
              <div className="bg-danger/10 text-danger text-sm rounded-lg px-4 py-3 mb-4">
                {error}
              </div>
            )}

            <button
              type="button"
              onClick={handleSendCode}
              disabled={sendCode.isPending}
              className="w-full py-3 rounded-lg bg-accent text-white font-bold text-sm hover:bg-accent-light disabled:opacity-50 transition-colors"
            >
              {sendCode.isPending ? "Sending..." : "Send Code to Reveal Full Username"}
            </button>

            <button
              type="button"
              onClick={handleRetry}
              className="w-full mt-2 py-2 text-sm text-text-muted hover:text-text transition-colors"
            >
              Try a different email
            </button>
          </>
        )}

        {/* Step 3: 인증코드 입력 */}
        {step === "code" && (
          <>
            <div className="text-center mb-8">
              <h1 className="text-xl font-extrabold text-text">Verify Code</h1>
              <p className="text-sm text-text-secondary mt-2">
                Enter the 6-digit code sent to{" "}
                <span className="text-text font-medium">{email}</span>.
              </p>
            </div>

            <form onSubmit={handleVerifyCode} className="space-y-4">
              {error && (
                <div className="bg-danger/10 text-danger text-sm rounded-lg px-4 py-3">
                  {error}
                </div>
              )}
              <div>
                <label className="block text-sm font-semibold text-text-secondary mb-1.5">
                  Verification Code
                </label>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="Enter 6-digit code"
                  maxLength={6}
                  className="w-full px-4 py-3 rounded-lg border border-border bg-surface text-text text-sm outline-none focus:border-accent transition-colors text-center tracking-widest text-lg font-mono"
                  required
                />
              </div>
              <button
                type="submit"
                disabled={code.length < 4 || verifyCode.isPending}
                className="w-full py-3 rounded-lg bg-accent text-white font-bold text-sm hover:bg-accent-light disabled:opacity-50 transition-colors"
              >
                {verifyCode.isPending ? "Verifying..." : "Verify"}
              </button>
            </form>

            <button
              type="button"
              onClick={() => {
                setStep("email");
                setCode("");
                setError("");
              }}
              className="w-full mt-3 text-[13px] text-accent underline hover:text-accent-light transition-colors"
            >
              Use different email
            </button>
          </>
        )}

        {/* Step 4: Full username 표시 */}
        {step === "done" && (
          <>
            <div className="text-center mb-8">
              <div className="w-12 h-12 rounded-full bg-success/10 flex items-center justify-center text-success text-2xl mx-auto mb-4">
                ✓
              </div>
              <h1 className="text-xl font-extrabold text-text">Username Found</h1>
              <p className="text-sm text-text-secondary mt-2">
                Your username has been verified.
              </p>
            </div>

            <div className="bg-success/10 border border-success/20 rounded-lg px-5 py-4 text-center mb-6">
              <p className="text-xs text-text-secondary mb-1">Your username</p>
              <p className="text-xl font-extrabold text-success tracking-wider font-mono">
                {fullUsername}
              </p>
            </div>

            <Link
              href="/login"
              className="block w-full py-3 rounded-lg bg-accent text-white font-bold text-sm text-center hover:bg-accent-light transition-colors"
            >
              Back to Login
            </Link>
          </>
        )}

        {/* 로그인으로 돌아가기 링크 (done 제외) */}
        {step !== "done" && (
          <div className="text-center mt-5">
            <Link
              href="/login"
              className="text-sm text-text-muted hover:text-accent transition-colors"
            >
              ← Back to Login
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
