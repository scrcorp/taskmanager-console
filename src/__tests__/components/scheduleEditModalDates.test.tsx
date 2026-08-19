/**
 * ScheduleEditModal — 시작/종료 **달력일** 상태 전이.
 *
 * 고정하는 것 (2026-08 오염의 정확한 재현 시나리오):
 *   경계 11:00 매장의 09:00 시작 근무는 달력상 영업일+1일에 있다. 여기서 **시각만**
 *   17:00 으로 바꾸면 시작 날짜는 영업일 당일로 되돌아와야 한다. 예전 모달은 모달을 열 때
 *   기존 오프셋을 명시 override 로 박아 넣어서, 17:00 근무가 하루 뒤에 저장됐고
 *   근태가 1439분 조기출근으로 오탐했다.
 *
 * 2026-08-19 결정 이후: **자동값이 아닌 시작 달력일은 고를 수 없다.** 자동과 다른 날짜는
 * 예외 없이 영업일 구간 밖이라 서버가 400 START_DATE_MISMATCH 로 막는다 —
 * 고를 수 있게 두면 "고를 수는 있는데 저장하면 거부" 가 된다. 후보는 지우지 않고
 * 비활성 + 이유로 남긴다.
 */

import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import userEvent from "@testing-library/user-event";
import type { Schedule, Store, User } from "@/types";

const validateMutate = vi.fn(async () => ({ valid: true, warnings: [], errors: [] }));

vi.mock("@/hooks/useWorkRoles", () => ({
  useWorkRoles: () => ({ data: [], isLoading: false }),
}));
vi.mock("@/hooks/useUsers", () => ({
  useUsers: () => ({ data: [], isLoading: false }),
  useUserStores: () => ({ data: [] }),
}));
vi.mock("@/hooks/useSettings", () => ({
  useResolveSetting: () => ({ data: undefined }),
}));
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

/** 경계 11:00 매장 — 09:00 시작이 달력상 +1일이 되는 설정. */
const STORE = {
  id: "st-1",
  name: "Main",
  day_start_time: { all: "11:00" },
  timezone: "America/New_York",
} as unknown as Store;

const USER = { id: "u-1", full_name: "Alice Kim", role_priority: 40 } as unknown as User;

/** 영업일 8/20, 시작 8/21 09:00 (경계 이전이라 +1일), 종료 8/21 14:30. */
const SCHEDULE = {
  id: "sc-1",
  user_id: "u-1",
  store_id: "st-1",
  work_role_id: null,
  work_date: "2026-08-20",
  operating_day: "2026-08-20",
  start_at: "2026-08-21T09:00",
  end_at: "2026-08-21T14:30",
  start_time: "09:00",
  end_time: "14:30",
  break_start_time: null,
  break_end_time: null,
  hourly_rate: 0,
  status: "confirmed",
  note: null,
} as unknown as Schedule;

function renderModal(onSave: (p: unknown) => void) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
    <ScheduleEditModal
      open
      mode="edit"
      schedule={SCHEDULE}
      users={[USER]}
      storeId="st-1"
      stores={[STORE]}
      onClose={vi.fn()}
      onSave={onSave as never}
    />
    </QueryClientProvider>,
  );
}

/** 시작 행의 날짜 후보 버튼 — 종료 행에도 같은 날짜가 후보로 뜨므로 DOM 순서 첫 번째(=Start)를 쓴다. */
function startDateCandidate(label: RegExp): HTMLElement {
  return screen.getAllByRole("button", { name: label })[0]!;
}

/** TimeSelect(시/분/AM·PM) 로 시각을 바꾼다. */
async function setStartTime(user: ReturnType<typeof userEvent.setup>, hour: string, period: "AM" | "PM") {
  const hours = screen.getAllByLabelText("Hour");
  const periods = screen.getAllByLabelText("AM/PM");
  await user.selectOptions(hours[0]!, hour);
  await user.selectOptions(periods[0]!, period);
}

beforeEach(() => {
  validateMutate.mockClear();
});

describe("ScheduleEditModal — 시작 달력일", () => {
  it("저장된 +1일 근무를 열면 그 날짜가 그대로 보인다", () => {
    renderModal(vi.fn());
    expect(screen.getByText(/Saves as/)).toHaveTextContent("Aug 21, 9:00 AM");
    expect(screen.getByText(/Saves as/)).toHaveTextContent("Aug 21, 2:30 PM");
  });

  it("**시각을 바꾸면 날짜가 자동 판정으로 되돌아온다** (오염 재현 시나리오)", async () => {
    const user = userEvent.setup();
    renderModal(vi.fn());
    await setStartTime(user, "5", "PM"); // 09:00 → 17:00
    // 17:00 은 경계(11:00) 이후 → 시작 날짜는 영업일 당일(8/20)이어야 한다.
    expect(screen.getByText(/Saves as/)).toHaveTextContent("Aug 20, 5:00 PM");
  });

  it("반대 방향도 따라온다 — 17:00 → 09:00 이면 다시 +1일", async () => {
    const user = userEvent.setup();
    renderModal(vi.fn());
    await setStartTime(user, "5", "PM");
    await setStartTime(user, "9", "AM");
    expect(screen.getByText(/Saves as/)).toHaveTextContent("Aug 21, 9:00 AM");
  });

  it("자동값대로 저장하면 date_override 는 서지 않는다", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    renderModal(onSave);
    await setStartTime(user, "5", "PM");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledTimes(1);
    const payload = onSave.mock.calls[0]![0] as { startAt: string; dateOverride: boolean };
    expect(payload.startAt).toBe("2026-08-20T17:00");
    expect(payload.dateOverride).toBe(false);
  });

  it("자동이 아닌 후보는 비활성이고, 눌러도 선택이 바뀌지 않는다", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    renderModal(onSave);
    await setStartTime(user, "5", "PM"); // 자동 = 8/20 (경계 11:00 이후)
    const blocked = startDateCandidate(/Fri Aug 21/);
    expect(blocked).toBeDisabled();
    await user.click(blocked);
    // 클릭해도 시작 날짜는 자동값 그대로다.
    expect(screen.getByText(/Saves as/)).toHaveTextContent("Aug 20, 5:00 PM");
    await user.click(screen.getByRole("button", { name: "Save" }));
    const payload = onSave.mock.calls[0]![0] as { startAt: string; dateOverride: boolean };
    expect(payload.startAt).toBe("2026-08-20T17:00");
    expect(payload.dateOverride).toBe(false);
  });

  it("비활성 이유가 경계·결과·해법(영업일 변경)을 모두 말한다", async () => {
    const user = userEvent.setup();
    renderModal(vi.fn());
    await setStartTime(user, "5", "PM");
    const reason = screen.getByTestId("start-date-locked-reason").textContent ?? "";
    expect(reason).toContain("5:00 PM");            // ① 시각
    expect(reason).toContain("11:00 AM");           // ① 경계
    expect(reason).toContain("could not clock in"); // ② 고르면 생기는 일
    expect(reason).toContain("Operating day");      // ③ 바꿔야 할 것
    expect(reason).toContain("Aug 21");             // ③ 제안 영업일
  });

  it("반대 방향(경계 이전 시각)에서는 영업일 당일 후보가 잠긴다", () => {
    renderModal(vi.fn());
    // 09:00 은 경계(11:00) 이전 → 자동 = 8/21. 8/20 후보가 잠긴다.
    expect(startDateCandidate(/Thu Aug 20/)).toBeDisabled();
    expect(startDateCandidate(/Fri Aug 21/)).not.toBeDisabled();
    expect(screen.getByTestId("start-date-locked-reason").textContent ?? "").toContain("before");
  });
});
