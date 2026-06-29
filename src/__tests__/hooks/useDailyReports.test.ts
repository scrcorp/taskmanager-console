/**
 * useDailyReports / useReports 훅 테스트 — 통합 reports 엔드포인트 cutover 검증.
 *
 * 테스트 범위:
 * - useDailyReports: GET /console/reports?type=daily (+ 필터)
 * - useDailyReport: GET /console/reports/{id}
 * - useReviewReport: POST /console/reports/{id}/review (feedback)
 * - useAcknowledgeReport: POST /console/reports/{id}/acknowledge
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { useDailyReports, useDailyReport } from "@/hooks/useDailyReports";
import { useReviewReport, useAcknowledgeReport } from "@/hooks/useReports";

vi.mock("@/lib/api", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
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

describe("useDailyReports (unified cutover)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lists daily reports via /console/reports with type=daily and filters", async () => {
    const { default: api } = await import("@/lib/api");
    vi.mocked(api.get).mockResolvedValueOnce({
      data: { items: [], total: 0, page: 1, per_page: 20 },
    });

    const { result } = renderHook(
      () =>
        useDailyReports({
          store_id: "store-1",
          period: "lunch",
          status: "submitted",
          date_from: "2026-06-01",
          date_to: "2026-06-29",
        }),
      { wrapper: createWrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(api.get).toHaveBeenCalledWith("/console/reports", {
      params: {
        type: "daily",
        store_id: "store-1",
        period: "lunch",
        status: "submitted",
        date_from: "2026-06-01",
        date_to: "2026-06-29",
        page: 1,
        per_page: 20,
      },
    });
  });

  it("fetches a single daily report via /console/reports/{id}", async () => {
    const { default: api } = await import("@/lib/api");
    vi.mocked(api.get).mockResolvedValueOnce({ data: { id: "r1" } });

    const { result } = renderHook(() => useDailyReport("r1"), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(api.get).toHaveBeenCalledWith("/console/reports/r1");
  });
});

describe("review / acknowledge", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reviews a report with feedback", async () => {
    const { default: api } = await import("@/lib/api");
    vi.mocked(api.post).mockResolvedValueOnce({ data: { id: "r1", status: "reviewed" } });

    const { result } = renderHook(() => useReviewReport(), {
      wrapper: createWrapper(),
    });
    await result.current.mutateAsync({ reportId: "r1", feedback: "Nice work" });

    expect(api.post).toHaveBeenCalledWith("/console/reports/r1/review", {
      feedback: "Nice work",
    });
  });

  it("reviews without feedback sends empty body", async () => {
    const { default: api } = await import("@/lib/api");
    vi.mocked(api.post).mockResolvedValueOnce({ data: { id: "r1" } });

    const { result } = renderHook(() => useReviewReport(), {
      wrapper: createWrapper(),
    });
    await result.current.mutateAsync({ reportId: "r1" });

    expect(api.post).toHaveBeenCalledWith("/console/reports/r1/review", {});
  });

  it("acknowledges a report", async () => {
    const { default: api } = await import("@/lib/api");
    vi.mocked(api.post).mockResolvedValueOnce({ data: { id: "r1" } });

    const { result } = renderHook(() => useAcknowledgeReport(), {
      wrapper: createWrapper(),
    });
    await result.current.mutateAsync("r1");

    expect(api.post).toHaveBeenCalledWith("/console/reports/r1/acknowledge");
  });
});
