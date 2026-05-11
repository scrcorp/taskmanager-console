/**
 * useChecklists 훅 테스트 — 체크리스트 템플릿 + 항목 CRUD 검증.
 *
 * 테스트 범위:
 * - useChecklistTemplates: 매장별 템플릿 목록 조회 (교대 필터 포함)
 * - useChecklistTemplate: 단건 템플릿 상세 조회
 * - useCreateChecklistTemplate/useUpdateChecklistTemplate/useDeleteChecklistTemplate: 템플릿 CRUD
 * - useChecklistItems: 템플릿별 항목 목록 조회
 * - useCreateChecklistItem/useUpdateChecklistItem/useDeleteChecklistItem: 항목 CRUD
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import {
  useChecklistTemplates,
  useChecklistTemplate,
  useCreateChecklistTemplate,
  useUpdateChecklistTemplate,
  useDeleteChecklistTemplate,
  useChecklistItems,
  useCreateChecklistItem,
  useUpdateChecklistItem,
  useDeleteChecklistItem,
} from "@/hooks/useChecklists";
import type { ChecklistTemplate, ChecklistItem } from "@/types";

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

const mockTemplate: ChecklistTemplate = {
  id: "ct1", store_id: "b1", shift_id: "s1", position_id: "p1",
  shift_name: "Morning", position_name: "Grill",
  title: "Opening Checklist", item_count: 3,
};

const mockItem: ChecklistItem = {
  id: "ci1", title: "Clean tables", description: null,
  verification_type: "none", recurrence_type: "daily", recurrence_days: null,
  sort_order: 1,
};

describe("useChecklistTemplates hooks", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fetches templates for a store", async () => {
    const { default: api } = await import("@/lib/api");
    vi.mocked(api.get).mockResolvedValueOnce({ data: [mockTemplate] });

    const { result } = renderHook(() => useChecklistTemplates("b1"), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toHaveLength(1);
    expect(api.get).toHaveBeenCalledWith("/console/stores/b1/checklist-templates", { params: {} });
  });

  it("fetches templates with filters", async () => {
    const { default: api } = await import("@/lib/api");
    vi.mocked(api.get).mockResolvedValueOnce({ data: [mockTemplate] });

    const { result } = renderHook(
      () => useChecklistTemplates("b1", { shift_id: "s1" }),
      { wrapper: createWrapper() },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(api.get).toHaveBeenCalledWith("/console/stores/b1/checklist-templates", {
      params: { shift_id: "s1" },
    });
  });

  it("fetches single template detail", async () => {
    const { default: api } = await import("@/lib/api");
    vi.mocked(api.get).mockResolvedValueOnce({ data: mockTemplate });

    const { result } = renderHook(() => useChecklistTemplate("ct1"), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.title).toBe("Opening Checklist");
    expect(api.get).toHaveBeenCalledWith("/console/checklist-templates/ct1");
  });

  it("creates a template", async () => {
    const { default: api } = await import("@/lib/api");
    vi.mocked(api.post).mockResolvedValueOnce({ data: mockTemplate });

    const { result } = renderHook(() => useCreateChecklistTemplate(), { wrapper: createWrapper() });
    result.current.mutate({ storeId: "b1", shift_id: "s1", position_id: "p1", title: "Opening Checklist" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(api.post).toHaveBeenCalledWith("/console/stores/b1/checklist-templates", {
      shift_id: "s1", position_id: "p1", title: "Opening Checklist",
    });
  });

  it("updates a template", async () => {
    const { default: api } = await import("@/lib/api");
    const updated = { ...mockTemplate, title: "Updated Checklist" };
    vi.mocked(api.put).mockResolvedValueOnce({ data: updated });

    const { result } = renderHook(() => useUpdateChecklistTemplate(), { wrapper: createWrapper() });
    result.current.mutate({ id: "ct1", title: "Updated Checklist" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(api.put).toHaveBeenCalledWith("/console/checklist-templates/ct1", { title: "Updated Checklist" });
  });

  it("deletes a template", async () => {
    const { default: api } = await import("@/lib/api");
    vi.mocked(api.delete).mockResolvedValueOnce({});

    const { result } = renderHook(() => useDeleteChecklistTemplate(), { wrapper: createWrapper() });
    result.current.mutate("ct1");
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(api.delete).toHaveBeenCalledWith("/console/checklist-templates/ct1");
  });
});

describe("useChecklistItems hooks", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fetches items for a template", async () => {
    const { default: api } = await import("@/lib/api");
    vi.mocked(api.get).mockResolvedValueOnce({ data: [mockItem] });

    const { result } = renderHook(() => useChecklistItems("ct1"), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toHaveLength(1);
    expect(api.get).toHaveBeenCalledWith("/console/checklist-templates/ct1/items");
  });

  it("creates a checklist item", async () => {
    const { default: api } = await import("@/lib/api");
    vi.mocked(api.post).mockResolvedValueOnce({ data: mockItem });

    const { result } = renderHook(() => useCreateChecklistItem(), { wrapper: createWrapper() });
    result.current.mutate({ templateId: "ct1", title: "Clean tables" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(api.post).toHaveBeenCalledWith("/console/checklist-templates/ct1/items", { title: "Clean tables" });
  });

  it("updates a checklist item", async () => {
    const { default: api } = await import("@/lib/api");
    const updated = { ...mockItem, title: "Wipe tables" };
    vi.mocked(api.put).mockResolvedValueOnce({ data: updated });

    const { result } = renderHook(() => useUpdateChecklistItem(), { wrapper: createWrapper() });
    result.current.mutate({ id: "ci1", templateId: "ct1", title: "Wipe tables" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(api.put).toHaveBeenCalledWith("/console/checklist-template-items/ci1", { title: "Wipe tables" });
  });

  it("deletes a checklist item", async () => {
    const { default: api } = await import("@/lib/api");
    vi.mocked(api.delete).mockResolvedValueOnce({});

    const { result } = renderHook(() => useDeleteChecklistItem(), { wrapper: createWrapper() });
    result.current.mutate({ id: "ci1", templateId: "ct1" });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(api.delete).toHaveBeenCalledWith("/console/checklist-template-items/ci1");
  });
});
