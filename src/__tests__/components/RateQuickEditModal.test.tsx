/**
 * RateQuickEditModal 테스트 — payroll 인라인 시급 등록/수정 (Payroll rate inline).
 *
 * 테스트 범위:
 * - effective date 기본값 = 기간 시작일, 메모 기본 reason("Set from payroll")
 * - 시급 미입력/0 이하 → Save 비활성
 * - 저장 성공 → POST payload(new_rate/effective_date/reason) + onClose 호출
 * - 메모 입력 시 그 값이 reason 으로 전송
 */

import "@testing-library/jest-dom/vitest";
import React, { type ReactNode } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import api from "@/lib/api";
import { RateQuickEditModal } from "@/components/payroll/RateQuickEditModal";

vi.mock("@/lib/api", () => ({
  default: { get: vi.fn(), post: vi.fn() },
}));

// mutationResult 는 imperative-modal(JSX) 체인을 끌어오므로 mock 으로 차단.
vi.mock("@/lib/mutationResult", () => ({
  useMutationResult: () => ({ success: vi.fn(), error: () => vi.fn() }),
}));

const mockedApi = vi.mocked(api, true);

function renderModal(onClose = vi.fn()) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
  render(
    <RateQuickEditModal
      isOpen
      onClose={onClose}
      userId="u1"
      name="Test Staff"
      currentRateLabel={null}
      periodStart="2026-07-01"
    />,
    { wrapper },
  );
  return { onClose };
}

describe("RateQuickEditModal", () => {
  beforeEach(() => vi.clearAllMocks());

  it("disables Save until a positive rate is entered", () => {
    renderModal();
    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText("e.g. 17.50"), {
      target: { value: "0" },
    });
    expect(save).toBeDisabled();
    expect(
      screen.getByText("Enter an amount greater than 0."),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("e.g. 17.50"), {
      target: { value: "17.5" },
    });
    expect(save).toBeEnabled();
  });

  it("posts rate change with period-start default and default memo", async () => {
    mockedApi.post.mockResolvedValueOnce({
      data: { recorded: true, entry: null },
    });
    const { onClose } = renderModal();

    fireEvent.change(screen.getByPlaceholderText("e.g. 17.50"), {
      target: { value: "17.5" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(mockedApi.post).toHaveBeenCalledWith(
        "/console/users/u1/rate-changes",
        {
          new_rate: 17.5,
          effective_date: "2026-07-01",
          reason: "Set from payroll",
        },
      ),
    );
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("sends the typed memo as reason", async () => {
    mockedApi.post.mockResolvedValueOnce({
      data: { recorded: true, entry: null },
    });
    renderModal();

    fireEvent.change(screen.getByPlaceholderText("e.g. 17.50"), {
      target: { value: "18" },
    });
    fireEvent.change(
      screen.getByPlaceholderText("Reason for this change (shown in exports)"),
      { target: { value: "Missed raise from July" } },
    );
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(mockedApi.post).toHaveBeenCalledWith(
        "/console/users/u1/rate-changes",
        {
          new_rate: 18,
          effective_date: "2026-07-01",
          reason: "Missed raise from July",
        },
      ),
    );
  });

  it("keeps the modal open when the request fails", async () => {
    mockedApi.post.mockRejectedValueOnce(new Error("403"));
    const { onClose } = renderModal();

    fireEvent.change(screen.getByPlaceholderText("e.g. 17.50"), {
      target: { value: "18" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(mockedApi.post).toHaveBeenCalled());
    expect(onClose).not.toHaveBeenCalled();
  });
});
