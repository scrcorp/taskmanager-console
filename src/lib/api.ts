/**
 * Axios API 인스턴스 — 전역 HTTP 클라이언트 설정 파일.
 *
 * 주요 기능:
 * 1. Mock 모드 인터셉터: NEXT_PUBLIC_USE_MOCK=true 시 실제 서버 대신 목 데이터 반환
 * 2. 요청 인터셉터: 모든 요청에 JWT access token 자동 첨부
 * 3. 응답 인터셉터: 401 응답 시 refresh token으로 자동 갱신 (뮤텍스 큐 패턴)
 *
 * 뮤텍스 큐 패턴: 동시 다발적 401 에러 시 refresh 요청을 한 번만 보내고,
 * 나머지 요청은 큐에 대기시킨 후 새 토큰으로 재시도합니다.
 */
import axios from "axios";
import type { InternalAxiosRequestConfig } from "axios";
import { getAccessToken, getRefreshToken, setTokens, clearTokens } from "./auth";
import { isMockMode, handleMockRequest } from "@/mocks/adapter";

/** Axios 인스턴스 생성 — baseURL은 환경변수에서 읽음 */
const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  headers: { "Content-Type": "application/json" },
});

// Mock 모드: 모든 요청을 가로채서 목 데이터 반환
// 요청 인터셉터에서 의도적으로 reject → 응답 인터셉터에서 __MOCK_RESPONSE__ 감지 후 resolve
if (isMockMode()) {
  api.interceptors.request.use(
    async (config: InternalAxiosRequestConfig) => {
      const response = await handleMockRequest(config);
      return Promise.reject({ __MOCK_RESPONSE__: response });
    },
  );

  api.interceptors.response.use(
    undefined,
    (error: unknown) => {
      if (
        error &&
        typeof error === "object" &&
        "__MOCK_RESPONSE__" in (error as Record<string, unknown>)
      ) {
        return Promise.resolve(
          (error as { __MOCK_RESPONSE__: unknown }).__MOCK_RESPONSE__,
        );
      }
      return Promise.reject(error);
    },
  );
}

// 요청 인터셉터: localStorage에서 access token을 읽어 Authorization 헤더에 첨부
api.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// 응답 인터셉터: 401 에러 시 refresh token으로 자동 갱신 (뮤텍스 큐 패턴)
let isRefreshing = false; // refresh 요청 진행 중 플래그
let failedQueue: Array<{
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
}> = [];

/** 대기 중인 요청 큐를 처리 — 새 토큰 전달 시 resolve, 실패 시 reject */
const processQueue = (error: unknown, token: string | null = null) => {
  failedQueue.forEach((prom) => {
    if (token) {
      prom.resolve(token);
    } else {
      prom.reject(error);
    }
  });
  failedQueue = [];
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // 로그인 요청 자체의 401은 refresh 대상이 아님
    const isLoginRequest = originalRequest?.url?.includes("/auth/login");
    if (error.response?.status === 401 && !originalRequest._retry && !isLoginRequest) {
      if (isRefreshing) {
        // 이미 refresh 진행 중 → 큐에 대기
        return new Promise((resolve, reject) => {
          failedQueue.push({
            resolve: (token) => {
              originalRequest.headers.Authorization = `Bearer ${token}`;
              resolve(api(originalRequest));
            },
            reject,
          });
        });
      }

      originalRequest._retry = true; // 무한 루프 방지 플래그
      isRefreshing = true;

      const refreshToken = getRefreshToken();
      if (!refreshToken) {
        // refresh token 없음 → 로그인 페이지로 리다이렉트
        isRefreshing = false;
        processQueue(error, null);
        clearTokens();
        window.location.href = "/login";
        return Promise.reject(error);
      }

      try {
        // refresh token으로 새 access token 요청
        const res = await axios.post(
          `${process.env.NEXT_PUBLIC_API_URL}/auth/refresh`,
          { refresh_token: refreshToken }
        );
        const newToken = res.data.access_token;
        setTokens(newToken, res.data.refresh_token);
        processQueue(null, newToken); // 대기 큐에 새 토큰 전달
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return api(originalRequest); // 원래 요청 재시도
      } catch (refreshError) {
        // refresh 실패 → 토큰 삭제 후 로그인 페이지로
        processQueue(refreshError, null);
        clearTokens();
        window.location.href = "/login";
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    return Promise.reject(error);
  }
);

export default api;
