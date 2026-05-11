/**
 * useShifts + usePositions 훅 테스트 — 교대/직책 CRUD 검증.
 *
 * 테스트 범위:
 * - useShifts: 매장별 교대 목록 조회 + storeId 미지정 시 비활성화
 * - useCreateShift/useUpdateShift/useDeleteShift: 교대 생성/수정/삭제
 * - usePositions: 매장별 직책 목록 조회
 * - useCreatePosition/useUpdatePosition/useDeletePosition: 직책 생성/수정/삭제
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { useShifts, useCreateShift, useUpdateShift, useDeleteShift } from "@/hooks/useShifts";
import { usePositions, useCreatePosition, useUpdatePosition, useDeletePosition } from "@/hooks/usePositions";
import type { Shift, Position } from "@/types";

vi.mock("@/lib/api", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
}

describe("useShifts hooks", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fetches shifts for a store", async () => {
    const { default: api } = await import("@/lib/api");
    const shifts: Shift[] = [
      { id: "s1", store_id: "b1", name: "Morning", sort_order: 1 },
    ];
    vi.mocked(api.get).mockResolvedValueOnce({ data: shifts });

    const { result } = renderHook(() => useShifts("b1"), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toHaveLength(1);
    expect(api.get).toHaveBeenCalledWith("/console/stores/b1/shifts");
  });

  it("does not fetch shifts when storeId is undefined", () => {
    const { result } = renderHook(() => useShifts(undefined), { wrapper: createWrapper() });
    expect(result.current.fetchStatus).toBe("idle");
  });

  it("creates a shift", async () => {
    const { default: api } = await import("@/lib/api");
    const newShift: Shift = { id: "s2", store_id: "b1", name: "Evening", sort_order: 2 };
    vi.mocked(api.post).mockResolvedValueOnce({ data: newShift });

    const { result } = renderHook(() => useCreateShift(), { wrapper: createWrapper() });
    result.current.mutate({ storeId: "b1", name: "Evening", sort_order: 2 });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(api.post).toHaveBeenCalledWith("/console/stores/b1/shifts", { name: "Evening", sort_order: 2 });
  });

  it("updates a shift", async () => {
    const { default: api } = await import("@/lib/api");
    const updated: Shift = { id: "s1", store_id: "b1", name: "Morning Updated", sort_order: 1 };
    vi.mocked(api.put).mockResolvedValueOnce({ data: updated });

    const { result } = renderHook(() => useUpdateShift(), { wrapper: createWrapper() });
    result.current.mutate({ storeId: "b1", id: "s1", name: "Morning Updated" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(api.put).toHaveBeenCalledWith("/console/stores/b1/shifts/s1", { name: "Morning Updated" });
  });

  it("deletes a shift", async () => {
    const { default: api } = await import("@/lib/api");
    vi.mocked(api.delete).mockResolvedValueOnce({});

    const { result } = renderHook(() => useDeleteShift(), { wrapper: createWrapper() });
    result.current.mutate({ storeId: "b1", id: "s1" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(api.delete).toHaveBeenCalledWith("/console/stores/b1/shifts/s1");
  });
});

describe("usePositions hooks", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fetches positions for a store", async () => {
    const { default: api } = await import("@/lib/api");
    const positions: Position[] = [
      { id: "p1", store_id: "b1", name: "Cashier", sort_order: 1 },
    ];
    vi.mocked(api.get).mockResolvedValueOnce({ data: positions });

    const { result } = renderHook(() => usePositions("b1"), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toHaveLength(1);
    expect(api.get).toHaveBeenCalledWith("/console/stores/b1/positions");
  });

  it("creates a position", async () => {
    const { default: api } = await import("@/lib/api");
    const pos: Position = { id: "p2", store_id: "b1", name: "Server", sort_order: 2 };
    vi.mocked(api.post).mockResolvedValueOnce({ data: pos });

    const { result } = renderHook(() => useCreatePosition(), { wrapper: createWrapper() });
    result.current.mutate({ storeId: "b1", name: "Server" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(api.post).toHaveBeenCalledWith("/console/stores/b1/positions", { name: "Server" });
  });

  it("updates a position", async () => {
    const { default: api } = await import("@/lib/api");
    const updated: Position = { id: "p1", store_id: "b1", name: "Head Cashier", sort_order: 1 };
    vi.mocked(api.put).mockResolvedValueOnce({ data: updated });

    const { result } = renderHook(() => useUpdatePosition(), { wrapper: createWrapper() });
    result.current.mutate({ storeId: "b1", id: "p1", name: "Head Cashier" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(api.put).toHaveBeenCalledWith("/console/stores/b1/positions/p1", { name: "Head Cashier" });
  });

  it("deletes a position", async () => {
    const { default: api } = await import("@/lib/api");
    vi.mocked(api.delete).mockResolvedValueOnce({});

    const { result } = renderHook(() => useDeletePosition(), { wrapper: createWrapper() });
    result.current.mutate({ storeId: "b1", id: "p1" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(api.delete).toHaveBeenCalledWith("/console/stores/b1/positions/p1");
  });
});
