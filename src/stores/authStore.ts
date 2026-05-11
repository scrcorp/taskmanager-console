/**
 * 인증 전역 상태 스토어 (Zustand).
 *
 * 관리하는 상태:
 * - user: 현재 로그인한 사용자 정보 (UserMe)
 * - isLoading: 로그인 진행 중 여부
 *
 * 주요 액션:
 * - login: 관리자 로그인 → 토큰 저장 → /auth/me로 사용자 정보 조회
 * - logout: 서버에 로그아웃 요청 → 토큰 삭제 → /login으로 리다이렉트
 * - fetchMe: 저장된 토큰으로 사용자 정보 재조회 (페이지 새로고침 시)
 */
import { create } from "zustand";
import type { UserMe } from "@/types";
import { clearTokens, setTokens, getRefreshToken } from "@/lib/auth";
import api from "@/lib/api";

/** 인증 상태 인터페이스 */
interface AuthState {
  user: UserMe | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  fetchMe: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: false,

  /** 관리자 로그인 — 서버가 단일 organization 자동 매칭 */
  login: async (username, password) => {
    set({ isLoading: true });
    try {
      const res = await api.post("/console/auth/login", { username, password });
      setTokens(res.data.access_token, res.data.refresh_token);
      // 토큰 저장 후 사용자 정보 조회
      const me = await api.get("/auth/me");
      set({ user: me.data, isLoading: false });
    } catch (error) {
      set({ isLoading: false });
      throw error;
    }
  },

  /** 로그아웃 — 서버에 refresh token 무효화 요청 후 로컬 토큰 삭제 */
  logout: () => {
    const refreshToken = getRefreshToken();
    if (refreshToken) {
      // 서버 측 토큰 무효화 (실패해도 무시)
      api.post("/auth/logout", { refresh_token: refreshToken }).catch(() => {});
    }
    clearTokens();
    set({ user: null });
    window.location.href = "/login";
  },

  /** 사용자 정보 재조회 — 401/403만 토큰 삭제 (네트워크 에러 등은 토큰 유지) */
  fetchMe: async () => {
    try {
      const res = await api.get("/auth/me");
      set({ user: res.data });
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 401 || status === 403) {
        clearTokens();
        set({ user: null });
      }
    }
  },
}));
