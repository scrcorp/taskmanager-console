/**
 * useNotices 훅 테스트 — 공지사항 CRUD 검증.
 *
 * 테스트 범위:
 * - useNotices: 페이지네이션 공지 목록 조회
 * - useNotice: 단건 공지 상세 조회
 * - useCreateNotice: 공지 생성 (POST)
 * - useUpdateNotice: 공지 수정 (PUT)
 * - useDeleteNotice: 공지 삭제 (DELETE)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import {
  useNotices,
  useNotice,
  useCreateNotice,
  useUpdateNotice,
  useDeleteNotice,
} from "@/hooks/useNotices";
import type { Notice, PaginatedResponse } from "@/types";

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

const mockAnn: Notice = {
  id: "ann1", title: "Notice", content: "Test content",
  store_id: null, store_name: null, created_by_name: "Admin",
  created_at: "2026-02-01T00:00:00Z",
};

describe("useNotices hooks", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fetches paginated notices", async () => {
    const { default: api } = await import("@/lib/api");
    const paginated: PaginatedResponse<Notice> = {
      items: [mockAnn], total: 1, page: 1, per_page: 20,
    };
    vi.mocked(api.get).mockResolvedValueOnce({ data: paginated });

    const { result } = renderHook(() => useNotices(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.items).toHaveLength(1);
    expect(api.get).toHaveBeenCalledWith("/console/notices", {
      params: { page: 1, per_page: 20 },
    });
  });

  it("fetches single notice", async () => {
    const { default: api } = await import("@/lib/api");
    vi.mocked(api.get).mockResolvedValueOnce({ data: mockAnn });

    const { result } = renderHook(() => useNotice("ann1"), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.title).toBe("Notice");
    expect(api.get).toHaveBeenCalledWith("/console/notices/ann1");
  });

  it("creates an notice", async () => {
    const { default: api } = await import("@/lib/api");
    vi.mocked(api.post).mockResolvedValueOnce({ data: mockAnn });

    const { result } = renderHook(() => useCreateNotice(), { wrapper: createWrapper() });
    result.current.mutate({ title: "Notice", content: "Test content" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(api.post).toHaveBeenCalledWith("/console/notices", {
      title: "Notice", content: "Test content",
    });
  });

  it("updates an notice", async () => {
    const { default: api } = await import("@/lib/api");
    const updated = { ...mockAnn, title: "Updated Notice" };
    vi.mocked(api.put).mockResolvedValueOnce({ data: updated });

    const { result } = renderHook(() => useUpdateNotice(), { wrapper: createWrapper() });
    result.current.mutate({ id: "ann1", title: "Updated Notice" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(api.put).toHaveBeenCalledWith("/console/notices/ann1", { title: "Updated Notice" });
  });

  it("deletes an notice", async () => {
    const { default: api } = await import("@/lib/api");
    vi.mocked(api.delete).mockResolvedValueOnce({});

    const { result } = renderHook(() => useDeleteNotice(), { wrapper: createWrapper() });
    result.current.mutate("ann1");
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(api.delete).toHaveBeenCalledWith("/console/notices/ann1");
  });
});
