/**
 * ScheduleBlock — **에러 스케줄 표시**.
 *
 * 서버 `start_outside_operating_window` 는 "시작이 자기 영업일 구간 밖" 이라는 판정이다.
 * 그런 행은 저장돼 있어도 현장에서 못 쓴다(출근 후보 조회에 안 잡힌다). 화면이 조용히
 * 정상처럼 보여주면 사용자는 왜 직원이 출근을 못 하는지 알 방법이 없다 —
 * 그래서 블록에 위험색 배지 + 이유가 붙어야 한다.
 */

import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Schedule } from "@/types";

import { ScheduleBlock } from "@/components/schedules/redesign/ScheduleBlock";

const BASE = {
  id: "sc-1",
  user_id: "u-1",
  store_id: "st-1",
  store_name: "Main",
  work_date: "2026-08-20",
  operating_day: "2026-08-20",
  start_at: "2026-08-20T09:00",
  end_at: "2026-08-20T14:30",
  start_time: "09:00",
  end_time: "14:30",
  break_start_time: null,
  break_end_time: null,
  work_role_name: "Server",
  work_role_name_snapshot: null,
  position_snapshot: null,
  hourly_rate: 0,
  net_work_minutes: 330,
  status: "confirmed",
  origin: "manual",
} as unknown as Schedule;

function renderBlock(schedule: Schedule) {
  return render(<ScheduleBlock schedule={schedule} showCost={false} currentStoreId="st-1" />);
}

describe("ScheduleBlock — 구간 밖 시작", () => {
  it("정상 블록에는 에러 표시가 없다", () => {
    renderBlock(BASE);
    expect(screen.queryByTestId("schedule-outside-window")).toBeNull();
  });

  it("start_outside_operating_window 면 에러 배지와 이유가 붙는다", () => {
    renderBlock({ ...BASE, start_outside_operating_window: true });
    const chip = screen.getByTestId("schedule-outside-window");
    expect(chip).toBeInTheDocument();
    // 이유는 hover(title)/aria 로 읽힌다 — 배지만 있고 이유가 없으면 고칠 수가 없다.
    expect(chip.getAttribute("title")).toContain("cannot clock in");
    expect(screen.getByText(/staff cannot clock in/i)).toBeInTheDocument();
  });

  it("다른 매장 블록(dim)에서도 에러가 드러난다", () => {
    renderBlock({ ...BASE, start_outside_operating_window: true, store_id: "st-2" } as Schedule);
    expect(screen.getByTestId("schedule-outside-window")).toBeInTheDocument();
  });
});
