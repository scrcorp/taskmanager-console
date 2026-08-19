/**
 * ScheduleEditModal — Length 입력.
 *
 * 고정하는 것:
 *   1. 값이 바뀌어도 **표기 폭이 흔들리지 않는다** — 분을 항상 두 자리로 쓴다(`7h 00m`).
 *      예전엔 분이 0이면 `7h`, 아니면 `7h 5m` 이라 글자 수가 달라져 옆의 ± 버튼이 좌우로 밀렸다.
 *   2. 시/분 칸은 **숫자만** 받는다.
 *   3. 입력값을 조용히 고치지 않는다 — 24h 초과도, 5분 배수가 아닌 값도 그대로 두고
 *      저장 단계에서 거절한다(서버 SHIFT_SPAN_TOO_LONG / grid 규칙과 같은 판단).
 */

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import type { Schedule, Store, User } from "@/types";

const validateMutate = vi.fn(async () => ({ valid: true, warnings: [], errors: [] }));

vi.mock("@/hooks/useWorkRoles", () => ({ useWorkRoles: () => ({ data: [], isLoading: false }) }));
vi.mock("@/hooks/useUsers", () => ({
  useUsers: () => ({ data: [], isLoading: false }),
  useUserStores: () => ({ data: [] }),
}));
vi.mock("@/hooks/useSettings", () => ({ useResolveSetting: () => ({ data: undefined }) }));
vi.mock("@/hooks/useSchedules", () => ({
  useValidateSchedule: () => ({ mutateAsync: validateMutate }),
  useDeleteScheduleFlow: () => vi.fn(),
}));
vi.mock("@/components/ui/imperative-modal", () => ({
  useModal: () => ({ confirm: vi.fn(), alert: vi.fn(), open: vi.fn() }),
  useModalDepth: () => 0,
}));
vi.mock("@/stores/authStore", () => ({
  useAuthStore: (sel: (s: unknown) => unknown) =>
    sel({ user: { organization_timezone: "America/New_York" } }),
}));

import { ScheduleEditModal } from "@/components/schedules/redesign/ScheduleEditModal";

const STORE = {
  id: "st-1", name: "Main", day_start_time: { all: "00:00" }, timezone: "America/New_York",
} as unknown as Store;
const USER = { id: "u-1", full_name: "Alice Kim", role_priority: 40 } as unknown as User;

/** 09:00 → 16:00 = 7h 00m. 분이 0이라 예전 표기로는 `7h` 였다. */
const SCHEDULE = {
  id: "sc-1", user_id: "u-1", store_id: "st-1", work_role_id: null,
  work_date: "2026-08-20", operating_day: "2026-08-20",
  start_at: "2026-08-20T09:00", end_at: "2026-08-20T16:00",
  start_time: "09:00", end_time: "16:00",
  break_start_time: null, break_end_time: null,
  hourly_rate: 0, status: "confirmed", note: null,
} as unknown as Schedule;

function renderModal() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ScheduleEditModal
        open mode="edit" schedule={SCHEDULE} users={[USER]}
        storeId="st-1" stores={[STORE]} onClose={vi.fn()} onSave={vi.fn() as never}
      />
    </QueryClientProvider>,
  );
}

const hoursBox = () => screen.getByLabelText("Length hours") as HTMLInputElement;
const minutesBox = () => screen.getByLabelText("Length minutes") as HTMLInputElement;

beforeEach(() => validateMutate.mockClear());

describe("Length 입력", () => {
  it("분은 값과 무관하게 항상 두 자리 — 폭이 흔들리지 않는다", async () => {
    const user = userEvent.setup();
    renderModal();
    expect(hoursBox().value).toBe("7");
    expect(minutesBox().value).toBe("00");   // 예전엔 `7h` 로 분 칸 자체가 없었다

    await user.click(screen.getByLabelText("Extend by 5 minutes"));
    expect(hoursBox().value).toBe("7");
    expect(minutesBox().value).toBe("05");   // "5" 가 아니라 "05"
  });

  it("스테퍼는 5·15·60 세 단계가 양쪽에 있다", () => {
    renderModal();
    for (const n of [5, 15, 60]) {
      expect(screen.getByLabelText(`Extend by ${n} minutes`)).toBeTruthy();
      expect(screen.getByLabelText(`Shorten by ${n} minutes`)).toBeTruthy();
    }
  });

  it("시/분 칸은 숫자만 받는다", async () => {
    const user = userEvent.setup();
    renderModal();
    await user.clear(hoursBox());
    await user.type(hoursBox(), "9a-h");
    expect(hoursBox().value).toBe("9");
  });

  it("직접 입력한 값을 조용히 고치지 않는다 — 24h 초과는 그대로 두고 저장을 막는다", async () => {
    const user = userEvent.setup();
    renderModal();
    await user.clear(hoursBox());
    await user.type(hoursBox(), "26");
    await user.tab();

    expect(hoursBox().value).toBe("26");     // 24h 로 잘라내지 않는다
    expect(screen.getByText(/24 hours/i)).toBeTruthy();
    expect((screen.getByRole("button", { name: /^save$/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("5분 배수가 아니면 반올림하지 않고 거절한다", async () => {
    const user = userEvent.setup();
    renderModal();
    await user.clear(minutesBox());
    await user.type(minutesBox(), "07");
    await user.tab();

    expect(minutesBox().value).toBe("07");   // 05 나 10 으로 바꾸지 않는다
    expect(screen.getByText(/5-minute increments/i)).toBeTruthy();
  });
});
