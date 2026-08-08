/**
 * useHiring — useHireApplication 에러 모달 dedup.
 *
 * 테스트 범위:
 * - username_taken / pin_conflict 409 → hire 다이얼로그가 인라인 렌더하므로
 *   훅의 일반 에러 모달 생략 (이중 표시 방지, payroll 패턴)
 * - 그 외 에러 → 일반 에러 모달 발사
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { useHireApplication } from "@/hooks/useHiring";

// 모달 발사 여부를 추적하기 위한 hoisted mock (vi.mock 팩토리가 위로 끌어올려지므로).
const mocks = vi.hoisted(() => {
  const errorHandler = vi.fn();
  return {
    success: vi.fn(),
    error: vi.fn(() => errorHandler),
    errorHandler,
    rawError: vi.fn(),
  };
});

vi.mock("@/lib/api", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
  // 실제 구현과 동일한 순수 함수 — detail 이 {code,...} 객체일 때 code 추출.
  getErrorCode: (error: unknown): string | undefined => {
    const detail = (error as { response?: { data?: { detail?: unknown } } })
      ?.response?.data?.detail;
    if (detail && typeof detail === "object" && "code" in detail) {
      return (detail as { code?: string }).code;
    }
    return undefined;
  },
}));

// mutationResult 는 imperative-modal(JSX) 체인을 끌어오므로 mock 으로 차단.
vi.mock("@/lib/mutationResult", () => ({
  useMutationResult: () => ({
    success: mocks.success,
    error: mocks.error,
    rawError: mocks.rawError,
  }),
}));

function conflictError(code: string, message: string) {
  return {
    response: { status: 409, data: { detail: { code, message } } },
  };
}

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
}

describe("useHireApplication error modal dedup", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each(["username_taken", "pin_conflict"])(
    "skips the generic error modal on %s (inline rendering in dialog)",
    async (code) => {
      const { default: api } = await import("@/lib/api");
      vi.mocked(api.post).mockRejectedValueOnce(
        conflictError(code, "conflict"),
      );

      const { result } = renderHook(() => useHireApplication("s1"), {
        wrapper: createWrapper(),
      });
      result.current.mutate({ applicationId: "a1" });
      await waitFor(() => expect(result.current.isError).toBe(true));

      expect(mocks.error).not.toHaveBeenCalled();
      expect(mocks.errorHandler).not.toHaveBeenCalled();
      expect(mocks.rawError).not.toHaveBeenCalled();
    },
  );

  it("fires the generic error modal on other errors", async () => {
    const { default: api } = await import("@/lib/api");
    const err = { response: { status: 403, data: { detail: "Forbidden" } } };
    vi.mocked(api.post).mockRejectedValueOnce(err);

    const { result } = renderHook(() => useHireApplication("s1"), {
      wrapper: createWrapper(),
    });
    result.current.mutate({ applicationId: "a1" });
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(mocks.error).toHaveBeenCalledWith("Couldn't hire applicant");
    expect(mocks.errorHandler).toHaveBeenCalledWith(err);
  });
});
