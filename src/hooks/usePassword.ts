/**
 * 비밀번호 관련 API 훅.
 *
 * - 공개 API (인증 불필요): find-username, reset-password 흐름
 *   → fetch 사용 (Axios 인스턴스 불필요)
 * - 인증 API: change-password, admin reset-password
 *   → api (Axios 인스턴스) 사용
 */

import { useMutation } from "@tanstack/react-query";
import type { UseMutationResult } from "@tanstack/react-query";
import api from "@/lib/api";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "";

/** 공개 엔드포인트 호출 헬퍼 — 인증 헤더 없는 fetch */
async function publicPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.detail || "Request failed");
  }
  return data as T;
}

// ─── Find Username ──────────────────────────────────────────────────────────

export interface FindUsernameResponse {
  masked_username: string;
}

export interface FindUsernameSendCodeResponse {
  message: string;
  expires_in: number;
}

export interface FindUsernameVerifyResponse {
  username: string;
}

/** 아이디 찾기 — 이메일로 마스킹된 username 조회 */
export function useFindUsername(): UseMutationResult<
  FindUsernameResponse,
  Error,
  { email: string }
> {
  return useMutation({
    mutationFn: ({ email }) =>
      publicPost<FindUsernameResponse>("/auth/find-username", { email }),
  });
}

/** 아이디 찾기 인증코드 발송 */
export function useFindUsernameSendCode(): UseMutationResult<
  FindUsernameSendCodeResponse,
  Error,
  { email: string }
> {
  return useMutation({
    mutationFn: ({ email }) =>
      publicPost<FindUsernameSendCodeResponse>(
        "/auth/find-username/send-code",
        { email },
      ),
  });
}

/** 아이디 찾기 인증코드 검증 → full username 반환 */
export function useFindUsernameVerifyCode(): UseMutationResult<
  FindUsernameVerifyResponse,
  Error,
  { email: string; code: string }
> {
  return useMutation({
    mutationFn: (data) =>
      publicPost<FindUsernameVerifyResponse>(
        "/auth/find-username/verify-code",
        data,
      ),
  });
}

// ─── Reset Password ─────────────────────────────────────────────────────────

export interface ResetPasswordSendCodeResponse {
  message: string;
  expires_in: number;
}

export interface ResetPasswordVerifyResponse {
  reset_token: string;
}

export interface ResetPasswordConfirmResponse {
  message: string;
}

/** 비밀번호 재설정 인증코드 발송 */
export function useResetPasswordSendCode(): UseMutationResult<
  ResetPasswordSendCodeResponse,
  Error,
  { username: string; email: string }
> {
  return useMutation({
    mutationFn: (data) =>
      publicPost<ResetPasswordSendCodeResponse>(
        "/auth/reset-password/send-code",
        data,
      ),
  });
}

/** 비밀번호 재설정 인증코드 검증 → reset_token 반환 */
export function useResetPasswordVerifyCode(): UseMutationResult<
  ResetPasswordVerifyResponse,
  Error,
  { email: string; code: string }
> {
  return useMutation({
    mutationFn: (data) =>
      publicPost<ResetPasswordVerifyResponse>(
        "/auth/reset-password/verify-code",
        data,
      ),
  });
}

/** 비밀번호 재설정 확인 — reset_token + 새 비밀번호 */
export function useResetPasswordConfirm(): UseMutationResult<
  ResetPasswordConfirmResponse,
  Error,
  { reset_token: string; new_password: string }
> {
  return useMutation({
    mutationFn: (data) =>
      publicPost<ResetPasswordConfirmResponse>(
        "/auth/reset-password/confirm",
        data,
      ),
  });
}

// ─── Change Password (인증 필요) ─────────────────────────────────────────────

export interface ChangePasswordResponse {
  access_token: string;
  refresh_token: string;
  message: string;
}

/** 비밀번호 변경 — JWT 인증 필요. 성공 시 새 토큰 쌍 반환 */
export function useChangePassword(): UseMutationResult<
  ChangePasswordResponse,
  Error,
  { current_password: string; new_password: string }
> {
  return useMutation({
    mutationFn: async (data) => {
      const res = await api.post<ChangePasswordResponse>(
        "/auth/change-password",
        data,
      );
      return res.data;
    },
  });
}

// ─── Admin Reset Password (인증 + 권한 필요) ────────────────────────────────

export interface AdminResetPasswordResponse {
  temporary_password: string;
  message: string;
}

/** 관리자 비밀번호 초기화 — JWT + 권한 필요 */
export function useAdminResetPassword(): UseMutationResult<
  AdminResetPasswordResponse,
  Error,
  string
> {
  return useMutation({
    mutationFn: async (userId: string) => {
      const res = await api.post<AdminResetPasswordResponse>(
        `/admin/users/${userId}/reset-password`,
      );
      return res.data;
    },
  });
}
