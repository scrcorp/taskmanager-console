/**
 * useAttendanceDevices — useSetAccessCode 뮤테이션.
 *
 * 테스트 범위:
 * - PUT /console/access-codes/{service_key} + {code} 본문
 * - 성공 시 access-codes 캐시 갱신(setQueryData) + 성공 모달
 * - 409 access_code_taken → 전용 메시지 모달 (일반 에러 모달 생략 — 이중 모달 금지)
 * - 그 외 에러 → 일반 에러 모달
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { useSetAccessCode } from "@/hooks/useAttendanceDevices";
import type { AccessCode } from "@/types";

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

const manualCode: AccessCode = {
  service_key: "attendance",
  code: "TIGER1",
  source: "manual",
  rotated_at: null,
  created_at: "2026-08-01T00:00:00Z",
};

let qc: QueryClient;

function createWrapper() {
  qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
}

describe("useSetAccessCode", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sets code via PUT and updates the access-codes cache on success", async () => {
    const { default: api } = await import("@/lib/api");
    vi.mocked(api.put).mockResolvedValueOnce({ data: manualCode });

    const { result } = renderHook(() => useSetAccessCode(), {
      wrapper: createWrapper(),
    });
    result.current.mutate({ serviceKey: "attendance", code: "TIGER1" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(api.put).toHaveBeenCalledWith("/console/access-codes/attendance", {
      code: "TIGER1",
    });
    expect(qc.getQueryData<AccessCode>(["access-codes", "attendance"])).toEqual(
      manualCode,
    );
    expect(mocks.success).toHaveBeenCalledWith("Access code updated.");
    expect(mocks.rawError).not.toHaveBeenCalled();
    expect(mocks.errorHandler).not.toHaveBeenCalled();
  });

  it("shows dedicated modal on 409 access_code_taken (no generic modal)", async () => {
    const { default: api } = await import("@/lib/api");
    vi.mocked(api.put).mockRejectedValueOnce({
      response: {
        status: 409,
        data: {
          detail: {
            code: "access_code_taken",
            message:
              "This code is already used by another organization. Choose a different code.",
          },
        },
      },
    });

    const { result } = renderHook(() => useSetAccessCode(), {
      wrapper: createWrapper(),
    });
    result.current.mutate({ serviceKey: "attendance", code: "TIGER1" });
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(mocks.rawError).toHaveBeenCalledWith(
      "This code is already used by another organization. Choose a different code.",
      { title: "Couldn't update access code" },
    );
    // 일반 에러 모달은 생략 — 이중 모달 금지.
    expect(mocks.errorHandler).not.toHaveBeenCalled();
    expect(mocks.success).not.toHaveBeenCalled();
  });

  it("falls back to the generic error modal on other errors", async () => {
    const { default: api } = await import("@/lib/api");
    const err = {
      response: { status: 422, data: { detail: "String should have at least 4 characters" } },
    };
    vi.mocked(api.put).mockRejectedValueOnce(err);

    const { result } = renderHook(() => useSetAccessCode(), {
      wrapper: createWrapper(),
    });
    result.current.mutate({ serviceKey: "attendance", code: "ABC" });
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(mocks.error).toHaveBeenCalledWith("Couldn't update access code");
    expect(mocks.errorHandler).toHaveBeenCalledWith(err);
    expect(mocks.rawError).not.toHaveBeenCalled();
  });
});
