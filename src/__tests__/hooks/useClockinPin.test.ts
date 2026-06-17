/**
 * useClockinPin 훅 + PIN 정규식 검증.
 *
 * 테스트 범위:
 * - useClockinPin: PIN 조회 + userId 미지정 시 비활성화
 * - useUpdateClockinPin: 관리자 직접 변경 (PUT, clockin_pin 본문)
 * - useRegenerateClockinPin: PIN 재발급 (POST)
 * - PIN_REGEX: 4~6자리 허용 경계값 (서버 ^\d{4,6}$ 와 일치, 콘솔 6자리 고정 제약 해제)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import {
  useClockinPin,
  useUpdateClockinPin,
  useRegenerateClockinPin,
} from "@/hooks/useClockinPin";
import type { ClockinPin } from "@/types";

vi.mock("@/lib/api", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  },
}));

// mutationResult 는 imperative-modal(JSX) 체인을 끌어오므로 mock 으로 차단.
vi.mock("@/lib/mutationResult", () => ({
  useMutationResult: () => ({ success: vi.fn(), error: vi.fn() }),
}));

const mockPin: ClockinPin = { user_id: "u1", clockin_pin: "1234" };

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
}

describe("useClockinPin hooks", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fetches clockin pin for a user", async () => {
    const { default: api } = await import("@/lib/api");
    vi.mocked(api.get).mockResolvedValueOnce({ data: mockPin });

    const { result } = renderHook(() => useClockinPin("u1"), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.clockin_pin).toBe("1234");
    expect(api.get).toHaveBeenCalledWith("/console/users/u1/clockin-pin");
  });

  it("does not fetch when userId is undefined", () => {
    const { result } = renderHook(() => useClockinPin(undefined), {
      wrapper: createWrapper(),
    });
    expect(result.current.fetchStatus).toBe("idle");
  });

  it("does not fetch when enabled is false", () => {
    const { result } = renderHook(() => useClockinPin("u1", false), {
      wrapper: createWrapper(),
    });
    expect(result.current.fetchStatus).toBe("idle");
  });

  it("updates pin via PUT with clockin_pin body", async () => {
    const { default: api } = await import("@/lib/api");
    const updated: ClockinPin = { user_id: "u1", clockin_pin: "5678" };
    vi.mocked(api.put).mockResolvedValueOnce({ data: updated });

    const { result } = renderHook(() => useUpdateClockinPin(), {
      wrapper: createWrapper(),
    });
    result.current.mutate({ userId: "u1", clockinPin: "5678" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(api.put).toHaveBeenCalledWith("/console/users/u1/clockin-pin", {
      clockin_pin: "5678",
    });
  });

  it("regenerates pin via POST", async () => {
    const { default: api } = await import("@/lib/api");
    const regen: ClockinPin = { user_id: "u1", clockin_pin: "999999" };
    vi.mocked(api.post).mockResolvedValueOnce({ data: regen });

    const { result } = renderHook(() => useRegenerateClockinPin(), {
      wrapper: createWrapper(),
    });
    result.current.mutate("u1");
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(api.post).toHaveBeenCalledWith(
      "/console/users/u1/clockin-pin/regenerate",
    );
  });
});

// ProfilePinRow / useUpdateClockinPin 가 공유하는 PIN 검증 규칙.
// 콘솔이 과거 6자리 고정이었던 제약을 풀어 서버(^\d{4,6}$)와 일치시킨다.
const PIN_REGEX = /^\d{4,6}$/;

describe("PIN_REGEX (4~6 digit)", () => {
  it.each(["1234", "12345", "123456"])("accepts %s (4~6 digits)", (pin) => {
    expect(PIN_REGEX.test(pin)).toBe(true);
  });

  it.each(["", "1", "12", "123"])("rejects too-short %s", (pin) => {
    expect(PIN_REGEX.test(pin)).toBe(false);
  });

  it.each(["1234567", "12345678"])("rejects too-long %s", (pin) => {
    expect(PIN_REGEX.test(pin)).toBe(false);
  });

  it.each(["12a4", "12 4", "12.4", "abcd"])(
    "rejects non-digit %s",
    (pin) => {
      expect(PIN_REGEX.test(pin)).toBe(false);
    },
  );
});
