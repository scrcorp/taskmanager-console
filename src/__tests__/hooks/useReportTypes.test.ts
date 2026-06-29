/**
 * useReportTypes 훅 테스트 — report types(daily periods) 조회/upsert/materialize 검증.
 *
 * 테스트 범위:
 * - useReportTypes / useEffectiveReportTypes: trailing-slash collection 호출 + effective 플래그
 * - useApplyReportTypeChange: owned→PUT / store 상속→override POST / org 내장→materialize
 * - useAddReportType: org 내장 materialize 후 신규 POST / store 단일 POST
 * - useReorderReportTypes: /reorder POST
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import {
  useReportTypes,
  useEffectiveReportTypes,
  useApplyReportTypeChange,
  useAddReportType,
  useReorderReportTypes,
} from "@/hooks/useReportTypes";
import type { EffectiveReportType } from "@/types";

vi.mock("@/lib/api", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("@/lib/mutationResult", () => ({
  useMutationResult: () => ({ success: vi.fn(), error: vi.fn() }),
}));

function createWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, children);
}

const orgRow: EffectiveReportType = {
  code: "lunch",
  label: "Lunch",
  sort_order: 1,
  is_active: true,
  default_deadline_local_time: null,
  deadline_day_offset: 0,
  scope: "org",
  id: "org-lunch",
  org_type_id: null,
};

const builtinLunch: EffectiveReportType = {
  ...orgRow,
  id: null, // 내장 fallback (DB row 없음)
};
const builtinDinner: EffectiveReportType = {
  code: "dinner",
  label: "Dinner",
  sort_order: 2,
  is_active: true,
  default_deadline_local_time: null,
  deadline_day_offset: 0,
  scope: "org",
  id: null,
  org_type_id: null,
};

describe("useReportTypes queries", () => {
  beforeEach(() => vi.clearAllMocks());

  it("fetches raw rows with trailing slash + effective=false", async () => {
    const { default: api } = await import("@/lib/api");
    vi.mocked(api.get).mockResolvedValueOnce({ data: { items: [] } });

    const { result } = renderHook(() => useReportTypes("store-1"), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(api.get).toHaveBeenCalledWith("/console/report-types/", {
      params: { effective: false, store_id: "store-1" },
    });
  });

  it("fetches effective rows with effective=true (org when no store)", async () => {
    const { default: api } = await import("@/lib/api");
    vi.mocked(api.get).mockResolvedValueOnce({ data: { items: [orgRow] } });

    const { result } = renderHook(() => useEffectiveReportTypes(), {
      wrapper: createWrapper(),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(api.get).toHaveBeenCalledWith("/console/report-types/", {
      params: { effective: true },
    });
    expect(result.current.data).toEqual([orgRow]);
  });
});

describe("useApplyReportTypeChange", () => {
  beforeEach(() => vi.clearAllMocks());

  it("PUTs when the target row is owned at the current scope", async () => {
    const { default: api } = await import("@/lib/api");
    vi.mocked(api.put).mockResolvedValueOnce({ data: {} });

    const { result } = renderHook(() => useApplyReportTypeChange(), {
      wrapper: createWrapper(),
    });
    await result.current.mutateAsync({
      scope: "org",
      storeId: null,
      target: orgRow,
      change: { is_active: false },
      effectiveList: [orgRow],
    });

    expect(api.put).toHaveBeenCalledWith("/console/report-types/org-lunch", {
      is_active: false,
    });
    expect(api.post).not.toHaveBeenCalled();
  });

  it("creates a store override when the row is inherited from org", async () => {
    const { default: api } = await import("@/lib/api");
    vi.mocked(api.post).mockResolvedValueOnce({ data: {} });

    const { result } = renderHook(() => useApplyReportTypeChange(), {
      wrapper: createWrapper(),
    });
    await result.current.mutateAsync({
      scope: "store",
      storeId: "store-1",
      target: orgRow, // scope==="org" but currentScope==="store"
      change: { is_active: false },
      effectiveList: [orgRow],
    });

    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post).toHaveBeenCalledWith(
      "/console/report-types/",
      expect.objectContaining({
        code: "lunch",
        store_id: "store-1",
        is_active: false,
      }),
    );
    expect(api.put).not.toHaveBeenCalled();
  });

  it("materializes all org built-ins, applying the change to the target code", async () => {
    const { default: api } = await import("@/lib/api");
    vi.mocked(api.post).mockResolvedValue({ data: {} });

    const { result } = renderHook(() => useApplyReportTypeChange(), {
      wrapper: createWrapper(),
    });
    await result.current.mutateAsync({
      scope: "org",
      storeId: null,
      target: builtinDinner,
      change: { is_active: false },
      effectiveList: [builtinLunch, builtinDinner],
    });

    // 내장 2종 모두 row 로 생성됨
    expect(api.post).toHaveBeenCalledTimes(2);
    const bodies = vi.mocked(api.post).mock.calls.map((c) => c[1]);
    const lunchBody = bodies.find((b) => (b as { code: string }).code === "lunch");
    const dinnerBody = bodies.find((b) => (b as { code: string }).code === "dinner");
    expect((lunchBody as { is_active: boolean }).is_active).toBe(true); // 변경 없음
    expect((dinnerBody as { is_active: boolean }).is_active).toBe(false); // target 변경 적용
    expect((dinnerBody as { store_id: string | null }).store_id).toBeNull();
  });
});

describe("useAddReportType", () => {
  beforeEach(() => vi.clearAllMocks());

  it("materializes built-ins then creates the new org type", async () => {
    const { default: api } = await import("@/lib/api");
    vi.mocked(api.post).mockResolvedValue({ data: {} });

    const { result } = renderHook(() => useAddReportType(), {
      wrapper: createWrapper(),
    });
    await result.current.mutateAsync({
      scope: "org",
      storeId: null,
      data: { code: "brunch", label: "Brunch", is_active: true },
      effectiveList: [builtinLunch, builtinDinner],
    });

    // 내장 2종 materialize + 신규 1개 = 3 POST
    expect(api.post).toHaveBeenCalledTimes(3);
    const last = vi.mocked(api.post).mock.calls.at(-1)?.[1];
    expect((last as { code: string }).code).toBe("brunch");
    expect((last as { store_id: string | null }).store_id).toBeNull();
  });

  it("creates a single store-scoped type without materializing", async () => {
    const { default: api } = await import("@/lib/api");
    vi.mocked(api.post).mockResolvedValue({ data: {} });

    const { result } = renderHook(() => useAddReportType(), {
      wrapper: createWrapper(),
    });
    await result.current.mutateAsync({
      scope: "store",
      storeId: "store-1",
      data: { code: "brunch", label: "Brunch", is_active: true },
      effectiveList: [builtinLunch],
    });

    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post).toHaveBeenCalledWith(
      "/console/report-types/",
      expect.objectContaining({ code: "brunch", store_id: "store-1" }),
    );
  });
});

describe("useReorderReportTypes", () => {
  beforeEach(() => vi.clearAllMocks());

  it("POSTs sort_order pairs to /reorder", async () => {
    const { default: api } = await import("@/lib/api");
    vi.mocked(api.post).mockResolvedValueOnce({ data: null });

    const { result } = renderHook(() => useReorderReportTypes(), {
      wrapper: createWrapper(),
    });
    const items = [
      { id: "a", sort_order: 2 },
      { id: "b", sort_order: 1 },
    ];
    await result.current.mutateAsync(items);

    expect(api.post).toHaveBeenCalledWith("/console/report-types/reorder", {
      items,
    });
  });
});
