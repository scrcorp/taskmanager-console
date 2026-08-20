/**
 * StaffPicker 테스트 — 스케줄 등록/수정 모달의 Staff 검색 필드.
 *
 * 테스트 범위:
 * - 이 매장 소속 직원은 검색해서 선택할 수 있다 (onChange 로 id 전달)
 * - 검색은 이름뿐 아니라 사번으로도 걸린다 (사용자가 아는 식별자가 둘 중 하나)
 * - 후보는 **이 매장에 배정된 사람**뿐이다 (2026-08-19 D2) — 조직 전체를 보여주고
 *   선택만 막던 동작은 제거됐다. 서버도 매장 밖 배정을 거절한다(USER_NOT_IN_STORE).
 * - 퇴사자는 **퇴사일 이후 날짜**에서만 후보에서 빠진다 (퇴사일 당일까지는 배정 가능)
 * - 아무것도 안 맞으면 조용히 비우지 않고 명시적으로 알린다
 */

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { User } from "@/types";
import { StaffPicker } from "@/components/schedules/redesign/StaffPicker";

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
    assignable: true,
    assignable_until: null,
    created_at: "2026-01-01T00:00:00Z",
    ...over,
  } as User;
}

const IN_STORE = [
  makeUser({ id: "u-in-1", full_name: "Alice Kim", employee_no: "E101" }),
  makeUser({ id: "u-in-2", full_name: "Bob Lee", employee_no: "E102" }),
];
/** 8/10 이 마지막 근무일인 퇴사자 — 그 날까지는 후보, 다음날부터는 아니다. */
const LEAVER = makeUser({
  id: "u-left-1",
  full_name: "Carol Park",
  employee_no: "E900",
  is_active: false,
  assignable: true,
  assignable_until: "2026-08-10",
});
/** 퇴사일 없이 비활성 — 어떤 날짜로도 배정 불가. */
const DEACTIVATED = makeUser({
  id: "u-off-1",
  full_name: "Dan Cho",
  employee_no: "E901",
  is_active: false,
  assignable: false,
});

function renderPicker(
  opts: { eligible?: User[]; date?: string; onChange?: (userId: string) => void } = {},
) {
  const onChange = opts.onChange ?? vi.fn<(userId: string) => void>();
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const utils = render(
    <QueryClientProvider client={qc}>
      <StaffPicker
        value=""
        onChange={onChange}
        eligible={opts.eligible ?? IN_STORE}
        storeName="Main Store"
        date={opts.date}
      />
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

  it("keeps a leaver as a candidate up to and including their last working day", async () => {
    const user = userEvent.setup();
    renderPicker({ eligible: [...IN_STORE, LEAVER], date: "2026-08-10" });

    await user.click(screen.getByRole("button", { name: /select staff/i }));
    await user.type(screen.getByPlaceholderText(/search by name or id/i), "carol");

    expect(screen.getByRole("button", { name: /Carol Park/ })).toBeTruthy();
  });

  it("drops a leaver from candidates the day after their last working day", async () => {
    const user = userEvent.setup();
    renderPicker({ eligible: [...IN_STORE, LEAVER], date: "2026-08-11" });

    await user.click(screen.getByRole("button", { name: /select staff/i }));
    await user.type(screen.getByPlaceholderText(/search by name or id/i), "carol");

    expect(screen.queryByText("Carol Park")).toBeNull();
  });

  it("drops a deactivated staff even when no date is given", async () => {
    const user = userEvent.setup();
    renderPicker({ eligible: [...IN_STORE, DEACTIVATED] });

    await user.click(screen.getByRole("button", { name: /select staff/i }));
    await user.type(screen.getByPlaceholderText(/search by name or id/i), "dan");

    expect(screen.queryByText("Dan Cho")).toBeNull();
  });

  it("says so explicitly when nothing matches", async () => {
    const user = userEvent.setup();
    renderPicker();

    await user.click(screen.getByRole("button", { name: /select staff/i }));
    await user.type(screen.getByPlaceholderText(/search by name or id/i), "zzzz");

    expect(screen.getByText(/no staff match/i)).toBeTruthy();
  });
});
