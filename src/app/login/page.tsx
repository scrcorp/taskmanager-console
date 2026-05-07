"use client";

/**
 * 로그인 페이지 — 관리자 콘솔 인증 진입점.
 *
 * 기능:
 * - 아이디/비밀번호 입력 → POST /admin/auth/login
 * - 에러 처리: 401(인증 실패), 네트워크 오류
 * - 로그인 성공 시 대시보드(/)로 리다이렉트
 *
 * Multi-tenant 비활성화 상태: 회사코드 입력 UI 없음, 서버가 단일 organization 자동 매칭.
 */

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/stores/authStore";
import { AxiosError } from "axios";

/** 로그인 페이지 — Suspense 래퍼 (useSearchParams용) */
export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}

/** 로그인 콘텐츠 — 아이디/비밀번호 인증 */
function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, isLoading } = useAuthStore();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  /** 로그인 폼 제출 — 입력값 검증 후 authStore.login 호출 */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!username.trim() || !password.trim()) {
      setError("Please enter username and password.");
      return;
    }

    try {
      await login(username, password);
      const returnUrl = searchParams.get("returnUrl") || "/";
      router.push(returnUrl);
    } catch (err) {
      if (err instanceof AxiosError) {
        const status = err.response?.status;
        const detail = err.response?.data?.detail;

        if (status === 401) {
          setError("Invalid username or password.");
        } else if (typeof detail === "string") {
          setError(detail);
        } else {
          setError("An error occurred during login.");
        }
      } else {
        setError("Unable to connect to server.");
      }
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-bg">
      <div className="w-full max-w-[400px] mx-4 bg-card border border-border rounded-2xl p-6 md:p-10">
        <div className="text-center mb-9">
          <div className="text-3xl font-extrabold text-text">
            <img src="/taskmanager_icon.png" alt="HTM" className="inline-block w-12 h-12 mr-2 align-middle" /> HTM
          </div>
          <div className="text-text-muted text-sm mt-2">Admin Console</div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {error && (
            <div className="bg-danger-muted text-danger text-sm rounded-lg px-4 py-3">
              {error}
            </div>
          )}
          <div>
            <label className="block text-text-secondary text-sm font-semibold mb-1.5">
              ID
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter ID"
              className="w-full px-4 py-3 rounded-lg border border-border bg-surface text-text text-sm outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="block text-text-secondary text-sm font-semibold mb-1.5">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter password"
              className="w-full px-4 py-3 rounded-lg border border-border bg-surface text-text text-sm outline-none focus:border-accent"
            />
          </div>
          <button
            type="submit"
            disabled={isLoading || !username.trim() || !password.trim()}
            className="w-full py-3 rounded-lg bg-accent text-white font-bold text-sm mt-2 hover:bg-accent-light disabled:opacity-50 transition-colors"
          >
            {isLoading ? "Logging in..." : "Log In"}
          </button>

          {/* 아이디/비밀번호 찾기 링크 */}
          <div className="flex items-center justify-center gap-4 mt-4">
            <Link
              href="/login/find-username"
              className="text-sm text-text-muted hover:text-accent transition-colors"
            >
              Find ID
            </Link>
            <span className="text-border text-sm">|</span>
            <Link
              href="/login/reset-password"
              className="text-sm text-text-muted hover:text-accent transition-colors"
            >
              Forgot Password?
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
