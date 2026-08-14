/**
 * PIN finder 훅 — lookup / directory / suggest / clear.
 *
 * 테스트 범위:
 * - useClockinPinLookup: 4~6자리일 때만 요청, params.pin 전달
 * - useClockinPinDirectory: q 비었을 때 undefined 로 보냄(빈 문자열 필터 방지), include_inactive 전달
 * - useSuggestClockinPin: 자동 실행 금지(버튼 전용), refetch 시 length 전달
 * - useClearClockinPin: DELETE + 캐시 갱신(개인 PIN 캐시 즉시 반영, 목록/가용성 무효화)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import {
  useClearClockinPin,
  useClockinPinDirectory,
  useClockinPinLookup,
  useSuggestClockinPin,
} from "@/hooks/useClockinPin";
import type { ClockinPin, ClockinPinLookup } from "@/types";

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
    delete: vi.fn(),
  },
  getErrorCode: (): string | undefined => undefined,
}));

vi.mock("@/lib/mutationResult", () => ({
  useMutationResult: () => ({
    success: mocks.success,
    error: mocks.error,
    rawError: mocks.rawError,
  }),
}));

let queryClient: QueryClient;

function createWrapper() {
  queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
}

const availableLookup: ClockinPinLookup = {
  pin: "1234",
  available: true,
  reason: null,
  holders: [],
};

describe("useClockinPinLookup", () => {
  beforeEach(() => vi.clearAllMocks());

  it("queries availability for a well-formed PIN", async () => {
    const { default: api } = await import("@/lib/api");
    vi.mocked(api.get).mockResolvedValueOnce({ data: availableLookup });

    const { result } = renderHook(() => useClockinPinLookup("1234"), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(api.get).toHaveBeenCalledWith("/console/users/clockin-pin/lookup", {
      params: { pin: "1234" },
    });
    expect(result.current.data?.available).toBe(true);
  });

  it.each(["", "123", "1234567", "12a4"])(
    "stays idle for malformed input %j",
    (bad) => {
      const { result } = renderHook(() => useClockinPinLookup(bad), {
        wrapper: createWrapper(),
      });
      expect(result.current.fetchStatus).toBe("idle");
    },
  );
});

describe("useClockinPinDirectory", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sends the search term and inactive flag", async () => {
    const { default: api } = await import("@/lib/api");
    vi.mocked(api.get).mockResolvedValueOnce({
      data: { items: [], truncated: false },
    });

    const { result } = renderHook(() => useClockinPinDirectory("kim", true), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(api.get).toHaveBeenCalledWith(
      "/console/users/clockin-pin/directory",
      { params: { q: "kim", include_inactive: true } },
    );
  });

  it("omits q entirely when the search box is empty", async () => {
    const { default: api } = await import("@/lib/api");
    vi.mocked(api.get).mockResolvedValueOnce({
      data: { items: [], truncated: false },
    });

    const { result } = renderHook(() => useClockinPinDirectory(""), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(api.get).toHaveBeenCalledWith(
      "/console/users/clockin-pin/directory",
      { params: { q: undefined, include_inactive: false } },
    );
  });

  it("stays idle while the tool is closed", () => {
    const { result } = renderHook(
      () => useClockinPinDirectory("kim", false, false),
      { wrapper: createWrapper() },
    );
    expect(result.current.fetchStatus).toBe("idle");
  });
});

describe("useSuggestClockinPin", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does not run on mount — it is a button action", async () => {
    const { default: api } = await import("@/lib/api");
    const { result } = renderHook(() => useSuggestClockinPin(4), {
      wrapper: createWrapper(),
    });
    expect(result.current.fetchStatus).toBe("idle");
    expect(api.get).not.toHaveBeenCalled();
  });

  it("requests the chosen length on refetch", async () => {
    const { default: api } = await import("@/lib/api");
    vi.mocked(api.get).mockResolvedValueOnce({
      data: { pin: "4821", length: 4 },
    });

    const { result } = renderHook(() => useSuggestClockinPin(4), {
      wrapper: createWrapper(),
    });
    const refetched = await result.current.refetch();

    expect(api.get).toHaveBeenCalledWith("/console/users/clockin-pin/suggest", {
      params: { length: 4 },
    });
    expect(refetched.data?.pin).toBe("4821");
  });

  it("surfaces a null pin when the space is full", async () => {
    const { default: api } = await import("@/lib/api");
    vi.mocked(api.get).mockResolvedValueOnce({ data: { pin: null, length: 4 } });

    const { result } = renderHook(() => useSuggestClockinPin(4), {
      wrapper: createWrapper(),
    });
    const refetched = await result.current.refetch();

    expect(refetched.data?.pin).toBeNull();
  });
});

describe("useClearClockinPin", () => {
  beforeEach(() => vi.clearAllMocks());

  it("deletes the PIN and writes the cleared value into the personal cache", async () => {
    const { default: api } = await import("@/lib/api");
    const cleared: ClockinPin = { user_id: "u1", clockin_pin: null };
    vi.mocked(api.delete).mockResolvedValueOnce({ data: cleared });

    const { result } = renderHook(() => useClearClockinPin(), {
      wrapper: createWrapper(),
    });
    result.current.mutate("u1");
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(api.delete).toHaveBeenCalledWith("/console/users/u1/clockin-pin");
    expect(queryClient.getQueryData(["clockin-pin", "u1"])).toEqual(cleared);
    expect(mocks.success).toHaveBeenCalledWith("PIN removed.");
  });

  it("invalidates the finder queries so the freed number shows as available", async () => {
    const { default: api } = await import("@/lib/api");
    vi.mocked(api.delete).mockResolvedValueOnce({
      data: { user_id: "u1", clockin_pin: null },
    });

    const wrapper = createWrapper();
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => useClearClockinPin(), { wrapper });
    result.current.mutate("u1");
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    const keys = invalidate.mock.calls.map((c) => c[0]?.queryKey?.[0]);
    expect(keys).toContain("clockin-pin-directory");
    expect(keys).toContain("clockin-pin-lookup");
  });

  it("falls back to the generic error modal on failure", async () => {
    const { default: api } = await import("@/lib/api");
    const err = { response: { status: 403, data: { detail: "Forbidden" } } };
    vi.mocked(api.delete).mockRejectedValueOnce(err);

    const { result } = renderHook(() => useClearClockinPin(), {
      wrapper: createWrapper(),
    });
    result.current.mutate("u1");
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(mocks.error).toHaveBeenCalledWith("Couldn't remove PIN");
    // react-query 가 (error, variables, context) 로 부르므로 첫 인자만 본다.
    expect(mocks.errorHandler.mock.calls[0][0]).toEqual(err);
  });
});
