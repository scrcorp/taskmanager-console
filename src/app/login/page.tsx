"use client";

/**
 * 로그인 페이지 — 관리자 콘솔 인증 진입점.
 *
 * 기능:
 * - 회사 코드(6자리) 설정/표시 — 조직 식별용
 * - 아이디/비밀번호 입력 → POST /admin/auth/login
 * - 에러 처리: 404(잘못된 회사코드), 401(인증 실패), 네트워크 오류
 * - 로그인 성공 시 대시보드(/)로 리다이렉트
 */

import { Suspense, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/stores/authStore";
import { getCompanyCode } from "@/lib/auth";
import { CompanyCodeModal } from "@/components/ui/CompanyCodeModal";
import { AxiosError } from "axios";

/** 로그인 페이지 — Suspense 래퍼 (useSearchParams용) */
export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}

/** 로그인 콘텐츠 — 회사코드 + 아이디/비밀번호 인증 */
function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { login, isLoading } = useAuthStore();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [companyCode, setCompanyCode] = useState<string | null>(null);
  const [showCodeModal, setShowCodeModal] = useState(false);

  // 마운트 시 localStorage에서 저장된 회사 코드 불러오기
  useEffect(() => {
    const saved = getCompanyCode();
    setCompanyCode(saved);
  }, []);

  /** 로그인 폼 제출 — 입력값 검증 후 authStore.login 호출 */
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!username.trim() || !password.trim()) {
      setError("Please enter username and password.");
      return;
    }

    if (!companyCode) {
      setError("Please set a company code first.");
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

        if (status === 404) {
          setError("Invalid company code.");
        } else if (status === 401) {
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
            <img src="/taskmanager_icon.png" alt="TaskManager" className="inline-block w-12 h-12 mr-2 align-middle" /> TaskManager
          </div>
          <div className="text-text-muted text-sm mt-2">Admin Console</div>
          {companyCode && (
            <button
              type="button"
              onClick={() => setShowCodeModal(true)}
              className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent/10 text-accent text-sm font-bold tracking-widest hover:bg-accent/20 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/><path d="M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2"/></svg>
              {companyCode}
              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/></svg>
            </button>
          )}
          {!companyCode && (
            <button
              type="button"
              onClick={() => setShowCodeModal(true)}
              className="mt-3 text-accent text-sm font-medium hover:underline"
            >
              Set Company Code
            </button>
          )}
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {error && (
            <div className="bg-danger-muted text-danger text-sm rounded-lg px-4 py-3">
              {error}
            </div>
          )}
          <div>
            <label className="block text-text-secondary text-sm font-semibold mb-1.5">
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter username"
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
              Find Username
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

      <CompanyCodeModal
        isOpen={showCodeModal}
        onClose={() => setShowCodeModal(false)}
        onSave={(code) => setCompanyCode(code)}
      />
    </div>
  );
}
