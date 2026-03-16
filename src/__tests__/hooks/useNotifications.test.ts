/**
 * useNotifications 훅 테스트 — 알림 조회/읽음 처리 검증.
 *
 * 테스트 범위:
 * - useNotifications: 페이지네이션 알림 목록 조회
 * - useUnreadCount: 읽지 않은 알림 수 조회
 * - useMarkRead: 개별 알림 읽음 처리 (PATCH)
 * - useMarkAllRead: 전체 알림 읽음 처리 (PATCH)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import {
  useNotifications,
  useUnreadCount,
  useMarkRead,
  useMarkAllRead,
} from "@/hooks/useNotifications";
import type { Notification, PaginatedResponse } from "@/types";

vi.mock("@/lib/api", () => ({
  default: {
    get: vi.fn(),
    patch: vi.fn(),
  },
}));

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
}

const mockNotif: Notification = {
  id: "n1", type: "schedule", message: "New schedule",
  reference_type: "schedule", reference_id: "a1",
  is_read: false, created_at: "2026-02-01T00:00:00Z",
};

describe("useNotifications hooks", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fetches paginated notifications", async () => {
    const { default: api } = await import("@/lib/api");
    const paginated: PaginatedResponse<Notification> = {
      items: [mockNotif], total: 1, page: 1, per_page: 20,
    };
    vi.mocked(api.get).mockResolvedValueOnce({ data: paginated });

    const { result } = renderHook(() => useNotifications(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.items).toHaveLength(1);
    expect(api.get).toHaveBeenCalledWith("/admin/notifications", {
      params: { page: 1, per_page: 20 },
    });
  });

  it("fetches unread count", async () => {
    const { default: api } = await import("@/lib/api");
    vi.mocked(api.get).mockResolvedValueOnce({ data: { unread_count: 5 } });

    const { result } = renderHook(() => useUnreadCount(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toBe(5);
    expect(api.get).toHaveBeenCalledWith("/admin/notifications/unread-count");
  });

  it("marks a notification as read", async () => {
    const { default: api } = await import("@/lib/api");
    vi.mocked(api.patch).mockResolvedValueOnce({});

    const { result } = renderHook(() => useMarkRead(), { wrapper: createWrapper() });
    result.current.mutate("n1");
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(api.patch).toHaveBeenCalledWith("/admin/notifications/n1/read");
  });

  it("marks all notifications as read", async () => {
    const { default: api } = await import("@/lib/api");
    vi.mocked(api.patch).mockResolvedValueOnce({});

    const { result } = renderHook(() => useMarkAllRead(), { wrapper: createWrapper() });
    result.current.mutate();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(api.patch).toHaveBeenCalledWith("/admin/notifications/read-all");
  });
});
