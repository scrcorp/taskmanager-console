"use client";

/**
 * 비밀번호 재설정 페이지 — 4단계 흐름:
 * 1. Username + 이메일 입력 → POST /auth/reset-password/send-code
 * 2. 인증코드 입력 → POST /auth/reset-password/verify-code → reset_token
 * 3. 새 비밀번호 + 확인 입력 → POST /auth/reset-password/confirm
 * 4. 성공 → "Go to Login" 버튼
 */

import { useState } from "react";
import Link from "next/link";
import {
  useResetPasswordSendCode,
  useResetPasswordVerifyCode,
  useResetPasswordConfirm,
} from "@/hooks/usePassword";

type Step = "identity" | "code" | "new-password" | "done";

export default function ResetPasswordPage() {
  const [step, setStep] = useState<Step>("identity");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");

  const sendCode = useResetPasswordSendCode();
  const verifyCode = useResetPasswordVerifyCode();
  const confirmReset = useResetPasswordConfirm();

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await sendCode.mutateAsync({ username, email });
      setStep("code");
    } catch (err) {
      setError(err instanceof Error ? err.message : "No account found with this information.");
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      const res = await verifyCode.mutateAsync({ email, code });
      setResetToken(res.reset_token);
      setStep("new-password");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid or expired code.");
    }
  };

  const handleConfirmReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    try {
      await confirmReset.mutateAsync({ reset_token: resetToken, new_password: newPassword });
      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reset password.");
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-bg">
      <div className="w-full max-w-[400px] mx-4 bg-card border border-border rounded-2xl p-8">
        {/* Step 1: Username + Email 입력 */}
        {step === "identity" && (
          <>
            <div className="text-center mb-8">
              <h1 className="text-xl font-extrabold text-text">Reset Password</h1>
              <p className="text-sm text-text-secondary mt-2">
                Enter your username and email to verify your identity.
              </p>
            </div>

            <form onSubmit={handleSendCode} className="space-y-4">
              {error && (
                <div className="bg-danger/10 text-danger text-sm rounded-lg px-4 py-3">
                  {error}
                </div>
              )}
              <div>
                <label className="block text-sm font-semibold text-text-secondary mb-1.5">
                  Username
                </label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="Enter your username"
                  className="w-full px-4 py-3 rounded-lg border border-border bg-surface text-text text-sm outline-none focus:border-accent transition-colors"
                  required
                />
              </div>
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
                disabled={!username.trim() || !email.trim() || sendCode.isPending}
                className="w-full py-3 rounded-lg bg-accent text-white font-bold text-sm hover:bg-accent-light disabled:opacity-50 transition-colors"
              >
                {sendCode.isPending ? "Sending..." : "Send Verification Code"}
              </button>
            </form>
          </>
        )}

        {/* Step 2: 인증코드 입력 */}
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
                setStep("identity");
                setCode("");
                setError("");
              }}
              className="w-full mt-3 text-[13px] text-accent underline hover:text-accent-light transition-colors"
            >
              Use different email
            </button>
          </>
        )}

        {/* Step 3: 새 비밀번호 입력 */}
        {step === "new-password" && (
          <>
            <div className="text-center mb-8">
              <h1 className="text-xl font-extrabold text-text">Set New Password</h1>
              <p className="text-sm text-text-secondary mt-2">
                Choose a new password for your account.
              </p>
            </div>

            <form onSubmit={handleConfirmReset} className="space-y-4">
              {error && (
                <div className="bg-danger/10 text-danger text-sm rounded-lg px-4 py-3">
                  {error}
                </div>
              )}
              <div>
                <label className="block text-sm font-semibold text-text-secondary mb-1.5">
                  New Password
                </label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Enter new password"
                  className="w-full px-4 py-3 rounded-lg border border-border bg-surface text-text text-sm outline-none focus:border-accent transition-colors"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-text-secondary mb-1.5">
                  Confirm New Password
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter new password"
                  className={`w-full px-4 py-3 rounded-lg border bg-surface text-text text-sm outline-none focus:border-accent transition-colors ${
                    confirmPassword && newPassword !== confirmPassword
                      ? "border-danger"
                      : "border-border"
                  }`}
                  required
                />
                {confirmPassword && newPassword !== confirmPassword && (
                  <p className="mt-1 text-xs text-danger">Passwords do not match.</p>
                )}
              </div>
              <button
                type="submit"
                disabled={
                  !newPassword || !confirmPassword || newPassword !== confirmPassword || confirmReset.isPending
                }
                className="w-full py-3 rounded-lg bg-accent text-white font-bold text-sm hover:bg-accent-light disabled:opacity-50 transition-colors"
              >
                {confirmReset.isPending ? "Resetting..." : "Reset Password"}
              </button>
            </form>
          </>
        )}

        {/* Step 4: 성공 */}
        {step === "done" && (
          <>
            <div className="text-center mb-8">
              <div className="w-12 h-12 rounded-full bg-success/10 flex items-center justify-center text-success text-2xl mx-auto mb-4">
                ✓
              </div>
              <h1 className="text-xl font-extrabold text-text">Password Reset</h1>
              <p className="text-sm text-text-secondary mt-2">
                Your password has been successfully reset.
              </p>
            </div>

            <Link
              href="/login"
              className="block w-full py-3 rounded-lg bg-accent text-white font-bold text-sm text-center hover:bg-accent-light transition-colors"
            >
              Go to Login
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
