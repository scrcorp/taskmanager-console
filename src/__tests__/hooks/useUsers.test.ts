/**
 * useUsers 훅 테스트 — 직원 CRUD + 매장 배정 관리 검증.
 *
 * 테스트 범위:
 * - useUsers: 필터 없이/있는 직원 목록 조회
 * - useUser: 단건 직원 상세 조회 + id 미지정 시 비활성화
 * - useCreateUser/useUpdateUser/useDeleteUser: 직원 CRUD
 * - useToggleUserActive: 직원 활성/비활성 토글 (PATCH)
 * - useUserStores: 직원 소속 매장 조회
 * - useAddUserStore/useRemoveUserStore: 직원 매장 배정/해제
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import {
  useUsers,
  useUser,
  useCreateUser,
  useUpdateUser,
  useToggleUserActive,
  useDeleteUser,
  useUserStores,
  useAddUserStore,
  useRemoveUserStore,
} from "@/hooks/useUsers";
import type { User, Store } from "@/types";

vi.mock("@/lib/api", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

const mockUsers: User[] = [
  {
    id: "u1", username: "admin", full_name: "Admin", email: null,
    phone: null, role_name: "admin", role_priority: 1, is_active: true,
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

describe("useUsers hooks", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fetches users list", async () => {
    const { default: api } = await import("@/lib/api");
    vi.mocked(api.get).mockResolvedValueOnce({ data: mockUsers });

    const { result } = renderHook(() => useUsers(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toHaveLength(1);
    expect(api.get).toHaveBeenCalledWith("/admin/users", { params: {} });
  });

  it("fetches users with filters", async () => {
    const { default: api } = await import("@/lib/api");
    vi.mocked(api.get).mockResolvedValueOnce({ data: mockUsers });

    const { result } = renderHook(
      () => useUsers({ store_id: "b1", is_active: true }),
      { wrapper: createWrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(api.get).toHaveBeenCalledWith("/admin/users", {
      params: { store_id: "b1", is_active: true },
    });
  });

  it("fetches single user when id provided", async () => {
    const { default: api } = await import("@/lib/api");
    vi.mocked(api.get).mockResolvedValueOnce({ data: mockUsers[0] });

    const { result } = renderHook(() => useUser("u1"), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.username).toBe("admin");
    expect(api.get).toHaveBeenCalledWith("/admin/users/u1");
  });

  it("does not fetch user when id is undefined", () => {
    const { result } = renderHook(() => useUser(undefined), { wrapper: createWrapper() });
    expect(result.current.fetchStatus).toBe("idle");
  });

  it("creates a user", async () => {
    const { default: api } = await import("@/lib/api");
    const newUser: User = {
      id: "u2", username: "staff1", full_name: "Staff One", email: null,
      phone: null, role_name: "staff", role_priority: 3, is_active: true,
      created_at: "2026-02-01T00:00:00Z",
    };
    vi.mocked(api.post).mockResolvedValueOnce({ data: newUser });

    const { result } = renderHook(() => useCreateUser(), { wrapper: createWrapper() });
    result.current.mutate({
      username: "staff1", password: "pass", full_name: "Staff One", role_id: "r3",
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.username).toBe("staff1");
    expect(api.post).toHaveBeenCalledWith("/admin/users", {
      username: "staff1", password: "pass", full_name: "Staff One", role_id: "r3",
    });
  });

  it("updates a user", async () => {
    const { default: api } = await import("@/lib/api");
    const updated = { ...mockUsers[0], full_name: "Updated Admin" };
    vi.mocked(api.put).mockResolvedValueOnce({ data: updated });

    const { result } = renderHook(() => useUpdateUser(), { wrapper: createWrapper() });
    result.current.mutate({ id: "u1", full_name: "Updated Admin" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(api.put).toHaveBeenCalledWith("/admin/users/u1", { full_name: "Updated Admin" });
  });

  it("toggles user active status", async () => {
    const { default: api } = await import("@/lib/api");
    vi.mocked(api.patch).mockResolvedValueOnce({});

    const { result } = renderHook(() => useToggleUserActive(), { wrapper: createWrapper() });
    result.current.mutate({ id: "u1", is_active: false });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(api.patch).toHaveBeenCalledWith("/admin/users/u1/active", { is_active: false });
  });

  it("deletes a user", async () => {
    const { default: api } = await import("@/lib/api");
    vi.mocked(api.delete).mockResolvedValueOnce({});

    const { result } = renderHook(() => useDeleteUser(), { wrapper: createWrapper() });
    result.current.mutate("u1");
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(api.delete).toHaveBeenCalledWith("/admin/users/u1");
  });

  it("fetches user stores", async () => {
    const { default: api } = await import("@/lib/api");
    const stores: Store[] = [
      { id: "b1", organization_id: "o1", name: "Store A", address: null, is_active: true, operating_hours: null, day_start_time: null, max_work_hours_weekly: null, timezone: null, created_at: "2026-01-01T00:00:00Z" },
    ];
    vi.mocked(api.get).mockResolvedValueOnce({ data: stores });

    const { result } = renderHook(() => useUserStores("u1"), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toHaveLength(1);
    expect(api.get).toHaveBeenCalledWith("/admin/users/u1/stores");
  });

  it("adds a store to user", async () => {
    const { default: api } = await import("@/lib/api");
    vi.mocked(api.post).mockResolvedValueOnce({});

    const { result } = renderHook(() => useAddUserStore(), { wrapper: createWrapper() });
    result.current.mutate({ userId: "u1", storeId: "b1" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(api.post).toHaveBeenCalledWith("/admin/users/u1/stores/b1");
  });

  it("removes a store from user", async () => {
    const { default: api } = await import("@/lib/api");
    vi.mocked(api.delete).mockResolvedValueOnce({});

    const { result } = renderHook(() => useRemoveUserStore(), { wrapper: createWrapper() });
    result.current.mutate({ userId: "u1", storeId: "b1" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(api.delete).toHaveBeenCalledWith("/admin/users/u1/stores/b1");
  });
});
