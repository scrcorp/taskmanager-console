/**
 * useTasks 훅 테스트 — 추가 업무(additional_tasks) CRUD 검증.
 *
 * 테스트 범위:
 * - useTasks: 필터 없이/있는 목록 조회 (우선순위, 상태 필터)
 * - useTask: 단건 업무 상세 조회
 * - useCreateTask: 업무 생성 (POST)
 * - useUpdateTask: 업무 수정 (PUT)
 * - useDeleteTask: 업무 삭제 (DELETE)
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import {
  useTasks,
  useTask,
  useCreateTask,
  useUpdateTask,
  useDeleteTask,
} from "@/hooks/useTasks";
import type { AdditionalTask, PaginatedResponse } from "@/types";

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

const mockTask: AdditionalTask = {
  id: "t1", title: "Urgent Task", description: "Fix issue",
  store_id: null, store_name: null, priority: "urgent",
  status: "pending", due_date: "2026-02-10",
  created_by_name: "Admin", assignee_names: ["Staff"],
  created_at: "2026-02-01T00:00:00Z",
};

describe("useTasks hooks", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fetches paginated tasks", async () => {
    const { default: api } = await import("@/lib/api");
    const paginated: PaginatedResponse<AdditionalTask> = {
      items: [mockTask], total: 1, page: 1, per_page: 20,
    };
    vi.mocked(api.get).mockResolvedValueOnce({ data: paginated });

    const { result } = renderHook(() => useTasks(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.items).toHaveLength(1);
    expect(api.get).toHaveBeenCalledWith("/console/additional-tasks", { params: {} });
  });

  it("fetches tasks with filters", async () => {
    const { default: api } = await import("@/lib/api");
    const paginated: PaginatedResponse<AdditionalTask> = {
      items: [mockTask], total: 1, page: 1, per_page: 20,
    };
    vi.mocked(api.get).mockResolvedValueOnce({ data: paginated });

    const { result } = renderHook(
      () => useTasks({ priority: "urgent", status: "pending" }),
      { wrapper: createWrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(api.get).toHaveBeenCalledWith("/console/additional-tasks", {
      params: { priority: "urgent", status: "pending" },
    });
  });

  it("fetches single task detail", async () => {
    const { default: api } = await import("@/lib/api");
    vi.mocked(api.get).mockResolvedValueOnce({ data: mockTask });

    const { result } = renderHook(() => useTask("t1"), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.title).toBe("Urgent Task");
    expect(api.get).toHaveBeenCalledWith("/console/additional-tasks/t1");
  });

  it("creates a task", async () => {
    const { default: api } = await import("@/lib/api");
    vi.mocked(api.post).mockResolvedValueOnce({ data: mockTask });

    const { result } = renderHook(() => useCreateTask(), { wrapper: createWrapper() });
    result.current.mutate({ title: "Urgent Task", priority: "urgent" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(api.post).toHaveBeenCalledWith("/console/additional-tasks", {
      title: "Urgent Task", priority: "urgent",
    });
  });

  it("updates a task", async () => {
    const { default: api } = await import("@/lib/api");
    const updated = { ...mockTask, status: "completed" as const };
    vi.mocked(api.put).mockResolvedValueOnce({ data: updated });

    const { result } = renderHook(() => useUpdateTask(), { wrapper: createWrapper() });
    result.current.mutate({ id: "t1", status: "completed" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(api.put).toHaveBeenCalledWith("/console/additional-tasks/t1", { status: "completed" });
  });

  it("deletes a task", async () => {
    const { default: api } = await import("@/lib/api");
    vi.mocked(api.delete).mockResolvedValueOnce({});

    const { result } = renderHook(() => useDeleteTask(), { wrapper: createWrapper() });
    result.current.mutate("t1");
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(api.delete).toHaveBeenCalledWith("/console/additional-tasks/t1");
  });
});
