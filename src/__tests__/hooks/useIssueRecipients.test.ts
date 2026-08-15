/**
 * useIssueRecipients / useIssueViewers 훅 테스트.
 *
 * 지키려는 계약 (2026-08-14 규칙):
 * - 수신자 = GET /console/reports/issue-recipients (store_id 또는 report_id)
 * - 예상 조회자 = GET /console/reports/issue-viewers (scope 필수)
 * - **scope 가 바뀌면 새로 조회한다** — 캐시 키에 scope 가 없으면 범위를 바꿔도
 *   옛 목록이 그대로 남아 "누가 보는지" 를 거짓으로 보여준다.
 * - 폴백 없음 — 404 라고 다른(형태가 다른) 엔드포인트로 갈아타지 않는다.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { useIssueRecipients, useIssueViewers } from "@/hooks/useReports";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

vi.mock("@/lib/mutationResult", () => ({
  useMutationResult: () => ({ success: vi.fn(), error: vi.fn(), rawError: vi.fn() }),
}));

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
}

describe("useIssueRecipients", () => {
  beforeEach(() => vi.clearAllMocks());

  it("작성 화면 — store_id 만으로 후보 조회", async () => {
    const { default: api } = await import("@/lib/api");
    vi.mocked(api.get).mockResolvedValueOnce({
      data: { store_id: "s1", report_id: null, items: [] },
    });

    const { result } = renderHook(() => useIssueRecipients("s1"), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(api.get).toHaveBeenCalledWith("/console/reports/issue-recipients", {
      params: { store_id: "s1" },
    });
  });

  it("상세 화면 — report_id 만으로 조회 (store_id 없이)", async () => {
    const { default: api } = await import("@/lib/api");
    vi.mocked(api.get).mockResolvedValueOnce({
      data: { store_id: "s1", report_id: "r1", items: [] },
    });

    const { result } = renderHook(() => useIssueRecipients(null, "r1"), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(api.get).toHaveBeenCalledWith("/console/reports/issue-recipients", {
      params: { report_id: "r1" },
    });
  });

  it("타깃이 없으면 호출하지 않는다", async () => {
    const { default: api } = await import("@/lib/api");
    renderHook(() => useIssueRecipients(null), { wrapper: createWrapper() });
    expect(api.get).not.toHaveBeenCalled();
  });
});

describe("useIssueViewers", () => {
  beforeEach(() => vi.clearAllMocks());

  const body = (scope: string) => ({
    data: {
      store_id: "s1",
      report_id: null,
      scope,
      mode: scope === "store_all" ? "summary" : "list",
      summary: { label: "…", count: 3 },
      items: [],
    },
  });

  it("scope 를 쿼리로 보낸다", async () => {
    const { default: api } = await import("@/lib/api");
    vi.mocked(api.get).mockResolvedValueOnce(body("managers"));

    const { result } = renderHook(() => useIssueViewers("s1", "managers"), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(api.get).toHaveBeenCalledWith("/console/reports/issue-viewers", {
      params: { scope: "managers", store_id: "s1" },
    });
  });

  it("scope 가 바뀌면 다시 조회한다 (캐시 키에 scope 포함)", async () => {
    const { default: api } = await import("@/lib/api");
    vi.mocked(api.get)
      .mockResolvedValueOnce(body("default"))
      .mockResolvedValueOnce(body("store_all"));

    const wrapper = createWrapper();
    const { result, rerender } = renderHook(
      ({ scope }: { scope: string }) => useIssueViewers("s1", scope),
      { wrapper, initialProps: { scope: "default" } },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.scope).toBe("default");

    rerender({ scope: "store_all" });
    await waitFor(() => expect(result.current.data?.scope).toBe("store_all"));

    expect(api.get).toHaveBeenCalledTimes(2);
    expect(vi.mocked(api.get).mock.calls[1][1]).toEqual({
      params: { scope: "store_all", store_id: "s1" },
    });
  });

  it("실패하면 다른 엔드포인트로 폴백하지 않고 에러를 낸다", async () => {
    const { default: api } = await import("@/lib/api");
    vi.mocked(api.get).mockRejectedValueOnce({ response: { status: 404 } });

    const { result } = renderHook(() => useIssueViewers("s1", "default"), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(api.get).toHaveBeenCalledTimes(1);
    expect(vi.mocked(api.get).mock.calls[0][0]).toBe(
      "/console/reports/issue-viewers",
    );
  });
});
