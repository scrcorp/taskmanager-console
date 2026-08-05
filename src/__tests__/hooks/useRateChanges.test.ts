/**
 * useRateChanges 훅 테스트 — 시급 변경 이력 조회/등록 (Payroll v1 R4).
 *
 * 테스트 범위:
 * - useRateChanges: 이력 목록 조회 + enabled 게이트 (cost visibility 차단용)
 * - useCreateRateChange: POST payload 형태 (new_rate/effective_date/reason)
 * - nextPayPeriodStart: 다음 급여기간 시작일 (1일/16일) 계산
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import api from "@/lib/api";
import {
  useRateChanges,
  useCreateRateChange,
  nextPayPeriodStart,
  type RateChangeEntry,
  type RateChangeResult,
} from "@/hooks/useRateChanges";

vi.mock("@/lib/api", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

// mutationResult 는 imperative-modal(JSX) 체인을 끌어오므로 mock 으로 차단.
vi.mock("@/lib/mutationResult", () => ({
  useMutationResult: () => ({ success: vi.fn(), error: () => vi.fn() }),
}));

const mockedApi = vi.mocked(api, true);

const mockEntries: RateChangeEntry[] = [
  {
    id: "rc2",
    old_rate: 15,
    new_rate: 18,
    effective_date: "2026-08-16",
    applied: false,
    reason: "Annual raise",
    changed_by: "gm-1",
    changed_by_name: "GM Kim",
    created_at: "2026-08-01T00:00:00Z",
  },
  {
    id: "rc1",
    old_rate: null,
    new_rate: 15,
    effective_date: "2026-01-01",
    applied: true,
    reason: null,
    changed_by: null,
    changed_by_name: null,
    created_at: "2026-01-01T00:00:00Z",
  },
];

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
}

describe("useRateChanges", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fetches rate change history for a user", async () => {
    mockedApi.get.mockResolvedValueOnce({ data: mockEntries });
    const { result } = renderHook(() => useRateChanges("u1"), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockedApi.get).toHaveBeenCalledWith("/console/users/u1/rate-changes");
    expect(result.current.data).toHaveLength(2);
    expect(result.current.data?.[0].applied).toBe(false);
  });

  it("does not fetch when disabled (cost visibility gate)", async () => {
    const { result } = renderHook(() => useRateChanges("u1", false), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.fetchStatus).toBe("idle"));
    expect(mockedApi.get).not.toHaveBeenCalled();
  });

  it("does not fetch without a user id", async () => {
    const { result } = renderHook(() => useRateChanges(undefined), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.fetchStatus).toBe("idle"));
    expect(mockedApi.get).not.toHaveBeenCalled();
  });
});

describe("useCreateRateChange", () => {
  beforeEach(() => vi.clearAllMocks());

  it("posts the rate change payload and returns the result", async () => {
    const created: RateChangeResult = { recorded: true, entry: mockEntries[0] };
    mockedApi.post.mockResolvedValueOnce({ data: created });
    const { result } = renderHook(() => useCreateRateChange(), {
      wrapper: createWrapper(),
    });
    const res = await result.current.mutateAsync({
      userId: "u1",
      new_rate: 18,
      effective_date: "2026-08-16",
      reason: "Annual raise",
    });
    expect(mockedApi.post).toHaveBeenCalledWith(
      "/console/users/u1/rate-changes",
      { new_rate: 18, effective_date: "2026-08-16", reason: "Annual raise" },
    );
    expect(res.recorded).toBe(true);
    expect(res.entry?.new_rate).toBe(18);
  });

  it("returns recorded=false for a no-op (same rate)", async () => {
    const noop: RateChangeResult = { recorded: false, entry: null };
    mockedApi.post.mockResolvedValueOnce({ data: noop });
    const { result } = renderHook(() => useCreateRateChange(), {
      wrapper: createWrapper(),
    });
    const res = await result.current.mutateAsync({ userId: "u1", new_rate: 15 });
    expect(res.recorded).toBe(false);
    expect(res.entry).toBeNull();
  });
});

describe("nextPayPeriodStart", () => {
  it("returns the 16th of this month before the 16th", () => {
    expect(nextPayPeriodStart(new Date(2026, 7, 3))).toBe("2026-08-16");
    expect(nextPayPeriodStart(new Date(2026, 7, 15))).toBe("2026-08-16");
    expect(nextPayPeriodStart(new Date(2026, 7, 1))).toBe("2026-08-16");
  });

  it("returns the 1st of next month from the 16th onward", () => {
    expect(nextPayPeriodStart(new Date(2026, 7, 16))).toBe("2026-09-01");
    expect(nextPayPeriodStart(new Date(2026, 7, 31))).toBe("2026-09-01");
  });

  it("rolls over the year in December", () => {
    expect(nextPayPeriodStart(new Date(2026, 11, 20))).toBe("2027-01-01");
    expect(nextPayPeriodStart(new Date(2026, 11, 10))).toBe("2026-12-16");
  });
});
