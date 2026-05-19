"use client";

/**
 * 강제 비밀번호 변경 페이지 — must_change_password=true 인 사용자를 위한 1회성 변경 화면.
 *
 * 진입 조건: 인증된 사용자 + must_change_password=true (dashboard layout 가 redirect).
 * 완료 시 must_change_password=false → 대시보드(/)로 이동.
 * dashboard 바깥에 위치 — sidebar 없이 단독 화면, 무한 redirect 방지.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AxiosError } from "axios";
import api from "@/lib/api";
import { setTokens, isAuthenticated } from "@/lib/auth";
import { useAuthStore } from "@/stores/authStore";

export default function ChangePasswordPage() {
  const router = useRouter();
  const { user, fetchMe } = useAuthStore();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // 인증 안 됐으면 로그인으로
  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace("/login");
      return;
    }
    if (!user) void fetchMe();
  }, []);

  // 이미 변경 완료된 상태로 이 페이지 접근 시 대시보드로
  useEffect(() => {
    if (user && !user.must_change_password) {
      router.replace("/");
    }
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (newPassword.length < 4) {
      setError("New password must be at least 4 characters.");
      return;
    }
    if (newPassword === currentPassword) {
      setError("New password must be different from the current password.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.post("/auth/change-password", {
        current_password: currentPassword,
        new_password: newPassword,
      });
      // 응답에 새 토큰 포함 — storage 갱신
      const { access_token, refresh_token } = res.data ?? {};
      if (access_token && refresh_token) {
        setTokens(access_token, refresh_token);
      }
      // user.must_change_password 갱신
      await fetchMe();
      router.replace("/");
    } catch (err) {
      if (err instanceof AxiosError) {
        const detail = err.response?.data?.detail;
        setError(typeof detail === "string" ? detail : "Failed to change password.");
      } else {
        setError("Unable to connect to server.");
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-bg">
      <div className="w-full max-w-[420px] mx-4 bg-card border border-border rounded-2xl p-6 md:p-10">
        <div className="text-center mb-6">
          <div className="text-2xl font-extrabold text-text">Change Password</div>
          <div className="text-text-muted text-sm mt-2">
            You must change your initial password before continuing.
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {error && (
            <div className="bg-danger-muted text-danger text-sm rounded-lg px-4 py-3">
              {error}
            </div>
          )}
          <div>
            <label className="block text-text-secondary text-sm font-semibold mb-1.5">
              Current Password
            </label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Enter current password"
              className="w-full px-4 py-3 rounded-lg border border-border bg-surface text-text text-sm outline-none focus:border-accent"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-text-secondary text-sm font-semibold mb-1.5">
              New Password
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="At least 4 characters"
              className="w-full px-4 py-3 rounded-lg border border-border bg-surface text-text text-sm outline-none focus:border-accent"
            />
          </div>
          <div>
            <label className="block text-text-secondary text-sm font-semibold mb-1.5">
              Confirm New Password
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter new password"
              className="w-full px-4 py-3 rounded-lg border border-border bg-surface text-text text-sm outline-none focus:border-accent"
            />
          </div>
          <button
            type="submit"
            disabled={submitting || !currentPassword || !newPassword || !confirmPassword}
            className="w-full py-3 rounded-lg bg-accent text-white font-bold text-sm mt-2 hover:bg-accent-light disabled:opacity-50 transition-colors"
          >
            {submitting ? "Changing..." : "Change Password"}
          </button>
        </form>
      </div>
    </div>
  );
}
