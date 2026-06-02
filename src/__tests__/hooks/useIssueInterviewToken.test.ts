/**
 * useIssueInterviewToken 훅 테스트 — 인터뷰 링크 토큰 발급(회전) 검증.
 *
 * 테스트 범위:
 * - 올바른 엔드포인트(POST .../interview/issue-token)로 호출
 * - 성공 시 raw 토큰을 그대로 반환
 * - 실패 시 mutateAsync 가 reject (호출 측에서 catch)
 *
 * 링크 조립(`${origin}/interview/${token}`)·클립보드 복사는 컴포넌트
 * (InterviewConfirmModal) 책임이라 브라우저에서 검증 — 훅은 토큰 수급만 담당.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { useIssueInterviewToken } from "@/hooks/useInterviews";

vi.mock("@/lib/api", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

// 결과 모달 피드백은 훅 단위 테스트 범위 밖 — stub 으로 대체해
// imperative-modal 체인(.tsx) import 를 회피한다.
vi.mock("@/lib/mutationResult", () => ({
  useMutationResult: () => ({
    success: vi.fn(),
    error: () => vi.fn(),
    rawError: vi.fn(),
  }),
}));

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
}

const APP_ID = "app-123";

describe("useIssueInterviewToken", () => {
  beforeEach(() => vi.clearAllMocks());

  it("posts to the issue-token endpoint and returns the raw token", async () => {
    const { default: api } = await import("@/lib/api");
    vi.mocked(api.post).mockResolvedValueOnce({ data: { token: "raw.jwt.token" } });

    const { result } = renderHook(() => useIssueInterviewToken(APP_ID), {
      wrapper: createWrapper(),
    });

    const res = await result.current.mutateAsync();

    expect(api.post).toHaveBeenCalledWith(
      `/console/hiring/applications/${APP_ID}/interview/issue-token`,
    );
    expect(res).toEqual({ token: "raw.jwt.token" });
  });

  it("rejects when the request fails", async () => {
    const { default: api } = await import("@/lib/api");
    vi.mocked(api.post).mockRejectedValueOnce(new Error("403"));

    const { result } = renderHook(() => useIssueInterviewToken(APP_ID), {
      wrapper: createWrapper(),
    });

    await expect(result.current.mutateAsync()).rejects.toThrow();
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
