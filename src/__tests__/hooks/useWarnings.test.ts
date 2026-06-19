/**
 * useSignWarning 훅 — 콘솔 온-디바이스 사인.
 *
 * 테스트 범위:
 * - POST /console/warnings/{id}/sign 로 보내고, body 에 party 가 그대로 실린다.
 * - employee / manager 양쪽 party 경로.
 *
 * 핵심: 콘솔이 한 엔드포인트로 두 서명란(employee/manager)을 party 로 구분해 보낸다.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { useSignWarning } from "@/hooks/useWarnings";
import type { WarningSignRequest } from "@/types";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

// mutationResult 는 imperative-modal(JSX) 체인을 끌어오므로 mock 으로 차단.
vi.mock("@/lib/mutationResult", () => ({
  useMutationResult: () => ({ success: vi.fn(), error: vi.fn() }),
}));

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
}

function body(party: WarningSignRequest["party"]): WarningSignRequest {
  return {
    strokes: [[[0.1, 0.2], [0.3, 0.4]]],
    aspect: 2.6,
    method: "drawn",
    save_as_default: false,
    party,
  };
}

describe("useSignWarning", () => {
  beforeEach(() => vi.clearAllMocks());

  it("posts employee signature with party='employee'", async () => {
    const { default: api } = await import("@/lib/api");
    vi.mocked(api.post).mockResolvedValueOnce({ data: { id: "w1" } });

    const { result } = renderHook(() => useSignWarning(), { wrapper: createWrapper() });
    result.current.mutate({ warningId: "w1", data: body("employee") });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(api.post).toHaveBeenCalledWith(
      "/console/warnings/w1/sign",
      expect.objectContaining({ party: "employee", method: "drawn" }),
    );
  });

  it("posts manager signature with party='manager'", async () => {
    const { default: api } = await import("@/lib/api");
    vi.mocked(api.post).mockResolvedValueOnce({ data: { id: "w2" } });

    const { result } = renderHook(() => useSignWarning(), { wrapper: createWrapper() });
    result.current.mutate({ warningId: "w2", data: body("manager") });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(api.post).toHaveBeenCalledWith(
      "/console/warnings/w2/sign",
      expect.objectContaining({ party: "manager" }),
    );
  });
});
