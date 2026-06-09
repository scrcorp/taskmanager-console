/**
 * useEvaluations 훅 — API 경로 회귀 테스트.
 *
 * 배경: 평가 list/create 가 trailing slash 없이 (`/console/evaluations`) 호출되면
 * FastAPI 가 307 로 `/console/evaluations/` (게다가 EC2 내부 HTTP) 로 리다이렉트하고,
 * HTTPS 콘솔에서 CORS preflight 된 POST 가 그 리다이렉트를 못 따라가 ERR_NETWORK
 * ("Cannot reach the server") 로 실패한다. 따라서 두 호출은 **반드시 trailing slash**
 * 를 포함해야 한다. 이 테스트가 그 회귀를 막는다.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement, type ReactNode } from "react";
import api from "@/lib/api";
import { useEvaluations, useCreateEvaluation } from "@/hooks/useEvaluations";
import type { EvaluationCreate, EvaluationFilters } from "@/types";

vi.mock("@/lib/api", () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

// mutationResult 는 imperative-modal(JSX) 체인을 끌어오므로 mock 으로 차단.
vi.mock("@/lib/mutationResult", () => ({
  useMutationResult: () => ({ success: vi.fn(), error: vi.fn() }),
}));

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

describe("useEvaluations — API 경로는 trailing slash (prod CORS 리다이렉트 회귀 방지)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("목록 조회 GET 은 /console/evaluations/ (슬래시 포함) 으로 호출한다", async () => {
    vi.mocked(api.get).mockResolvedValueOnce({
      data: { items: [], total: 0, page: 1, per_page: 20 },
    });

    const filters = { page: 1 } as EvaluationFilters;
    renderHook(() => useEvaluations(filters), { wrapper: createWrapper() });

    await waitFor(() => expect(api.get).toHaveBeenCalled());
    expect(api.get).toHaveBeenCalledWith(
      "/console/evaluations/",
      expect.objectContaining({ params: expect.anything() }),
    );
  });

  it("생성 POST 은 /console/evaluations/ (슬래시 포함) 으로 호출한다", async () => {
    vi.mocked(api.post).mockResolvedValueOnce({ data: { id: "e1" } });

    const { result } = renderHook(() => useCreateEvaluation(), {
      wrapper: createWrapper(),
    });

    const payload = {
      evaluatee_id: "u1",
      status: "draft",
      responses: {},
    } as EvaluationCreate;
    result.current.mutate(payload);

    await waitFor(() => expect(api.post).toHaveBeenCalled());
    expect(api.post).toHaveBeenCalledWith("/console/evaluations/", payload);
  });
});
