/**
 * StaffPicker 테스트 — 스케줄 등록/수정 모달의 Staff 검색 필드.
 *
 * 테스트 범위:
 * - 이 매장 소속 직원은 검색해서 선택할 수 있다 (onChange 로 id 전달)
 * - 검색은 이름뿐 아니라 사번으로도 걸린다 (사용자가 아는 식별자가 둘 중 하나)
 * - 조직에 있지만 이 매장 소속이 아닌 직원은 목록에 보이되 선택 불가 +
 *   스태프 상세로 가는 "Add to store" 링크를 새 탭으로 준다
 *   (숨기면 "시스템에 없는 사람" 으로 오해하고, 같은 탭으로 보내면 작성 중이던 폼이 날아간다)
 * - 아무것도 안 맞으면 조용히 비우지 않고 명시적으로 알린다
 */

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { User } from "@/types";

function makeUser(over: Partial<User> & { id: string; full_name: string }): User {
  return {
    username: over.full_name.toLowerCase().replace(/\s/g, ""),
    email: null,
    email_verified: false,
    phone: null,
    role_name: "Staff",
    role_priority: 40,
    hourly_rate: null,
    is_active: true,
    created_at: "2026-01-01T00:00:00Z",
    ...over,
  } as User;
}

const IN_STORE = [
  makeUser({ id: "u-in-1", full_name: "Alice Kim", employee_no: "E101" }),
  makeUser({ id: "u-in-2", full_name: "Bob Lee", employee_no: "E102" }),
];
const OUT_OF_STORE = makeUser({ id: "u-out-1", full_name: "Carol Park", employee_no: "E900" });

// 조직 전체 목록 — 매장 밖 인원을 "있지만 배정 안 됨" 으로 보여주는 출처.
vi.mock("@/hooks/useUsers", () => ({
  useUsers: () => ({ data: [...IN_STORE, OUT_OF_STORE], isLoading: false }),
}));

// mock 이 위 상수를 참조하므로 import 는 mock 선언 뒤에 온다 (vitest 가 hoist 함).
import { StaffPicker } from "@/components/schedules/redesign/StaffPicker";

function renderPicker(onChange = vi.fn()) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const utils = render(
    <QueryClientProvider client={qc}>
      <StaffPicker value="" onChange={onChange} eligible={IN_STORE} storeName="Main Store" />
    </QueryClientProvider>,
  );
  return { ...utils, onChange };
}

describe("StaffPicker", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lets you search an in-store staff by name and select them", async () => {
    const user = userEvent.setup();
    const { onChange } = renderPicker();

    await user.click(screen.getByRole("button", { name: /select staff/i }));
    await user.type(screen.getByPlaceholderText(/search by name or id/i), "alice");

    // 검색에 안 걸린 동료는 목록에서 빠진다.
    expect(screen.queryByText("Bob Lee")).toBeNull();

    await user.click(screen.getByRole("button", { name: /Alice Kim/ }));
    expect(onChange).toHaveBeenCalledWith("u-in-1");
  });

  it("also matches on employee number", async () => {
    const user = userEvent.setup();
    renderPicker();

    await user.click(screen.getByRole("button", { name: /select staff/i }));
    await user.type(screen.getByPlaceholderText(/search by name or id/i), "E102");

    expect(screen.getByText("Bob Lee")).toBeTruthy();
    expect(screen.queryByText("Alice Kim")).toBeNull();
  });

  it("shows org staff who are not in this store as unselectable, with a new-tab link to add them", async () => {
    const user = userEvent.setup();
    const { onChange } = renderPicker();

    await user.click(screen.getByRole("button", { name: /select staff/i }));
    await user.type(screen.getByPlaceholderText(/search by name or id/i), "carol");

    // 보이긴 한다 — 숨기면 "그런 사람 없음" 으로 오해한다.
    expect(screen.getByText("Carol Park")).toBeTruthy();
    // 하지만 고를 수는 없다: 클릭 가능한 선택 버튼으로 렌더되지 않는다.
    expect(screen.queryByRole("button", { name: /Carol Park/ })).toBeNull();
    expect(screen.getAllByText(/Not in Main Store/).length).toBeGreaterThan(0);

    // 대신 해결 경로를 준다 — 스태프 상세, 새 탭.
    const link = screen.getByRole("link", { name: /add to store/i });
    expect(link.getAttribute("href")).toBe("/users/u-out-1");
    expect(link.getAttribute("target")).toBe("_blank");

    expect(onChange).not.toHaveBeenCalled();
  });

  it("says so explicitly when nothing matches", async () => {
    const user = userEvent.setup();
    renderPicker();

    await user.click(screen.getByRole("button", { name: /select staff/i }));
    await user.type(screen.getByPlaceholderText(/search by name or id/i), "zzzz");

    expect(screen.getByText(/no staff match/i)).toBeTruthy();
  });
});
