/**
 * useStores 훅 테스트 — 매장 목록 조회/생성/삭제 검증.
 *
 * 테스트 범위:
 * - useStores: 매장 목록 조회 성공/에러 처리
 * - useCreateStore: 매장 생성 (POST) + 반환 데이터 확인
 * - useDeleteStore: 매장 삭제 (DELETE)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import { useStores, useCreateStore, useDeleteStore } from "@/hooks/useStores";
import type { Store } from "@/types";

// API 모듈 모킹
vi.mock("@/lib/api", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

const mockStores: Store[] = [
  {
    id: "b1",
    organization_id: "org1",
    name: "Test Store",
    address: "123 Test St",
    is_active: true,
    operating_hours: null,
    day_start_time: null,
    max_work_hours_weekly: null,
    created_at: "2026-01-01T00:00:00Z",
  },
  {
    id: "b2",
    organization_id: "org1",
    name: "Second Store",
    address: null,
    is_active: true,
    operating_hours: null,
    day_start_time: null,
    max_work_hours_weekly: null,
    created_at: "2026-01-02T00:00:00Z",
  },
];

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
}

describe("useStores hooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("useStores (list)", () => {
    it("fetches stores successfully", async () => {
      const { default: api } = await import("@/lib/api");
      vi.mocked(api.get).mockResolvedValueOnce({ data: mockStores });

      const { result } = renderHook(() => useStores(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      expect(result.current.data).toHaveLength(2);
      expect(result.current.data![0].name).toBe("Test Store");
      expect(api.get).toHaveBeenCalledWith("/admin/stores");
    });

    it("handles fetch error", async () => {
      const { default: api } = await import("@/lib/api");
      vi.mocked(api.get).mockRejectedValueOnce(new Error("Network error"));

      const { result } = renderHook(() => useStores(), {
        wrapper: createWrapper(),
      });

      await waitFor(() => expect(result.current.isError).toBe(true));
      expect(result.current.error?.message).toBe("Network error");
    });
  });

  describe("useCreateStore", () => {
    it("creates store and returns data", async () => {
      const { default: api } = await import("@/lib/api");
      const newStore: Store = {
        id: "b3",
        organization_id: "org1",
        name: "New Store",
        address: "456 New St",
        is_active: true,
        operating_hours: null,
        max_work_hours_weekly: null,
        created_at: "2026-02-01T00:00:00Z",
      };
      vi.mocked(api.post).mockResolvedValueOnce({ data: newStore });

      const { result } = renderHook(() => useCreateStore(), {
        wrapper: createWrapper(),
      });

      result.current.mutate({ name: "New Store", address: "456 New St" });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(result.current.data?.name).toBe("New Store");
      expect(api.post).toHaveBeenCalledWith("/admin/stores", {
        name: "New Store",
        address: "456 New St",
      });
    });
  });

  describe("useDeleteStore", () => {
    it("deletes store successfully", async () => {
      const { default: api } = await import("@/lib/api");
      vi.mocked(api.delete).mockResolvedValueOnce({});

      const { result } = renderHook(() => useDeleteStore(), {
        wrapper: createWrapper(),
      });

      result.current.mutate("b1");

      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(api.delete).toHaveBeenCalledWith("/admin/stores/b1");
    });
  });
});
