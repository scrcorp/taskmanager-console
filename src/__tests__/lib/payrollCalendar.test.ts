/**
 * payrollCalendar 테스트 — 일별 상세의 주(일→토) 격자 구성.
 *
 * 테스트 범위:
 * - weekStartOf: 일요일 기준 주 시작 (프로젝트 관례 Sun→Sat)
 * - addDays: 월/연 경계 넘김
 * - buildPayrollWeeks: 요일 슬롯 배치, 주간 합계(컨텍스트 포함), OT/DT 표시,
 *   기간 경계에 걸친 주, 같은 날짜 중복 시 기간 내 우선
 * - range 지정: 기간 전체 주 생성(근무 없는 주 포함), 기간 밖 데이터 주도 유지
 */

import { describe, it, expect } from "vitest";
import {
  addDays,
  buildPayrollWeeks,
  weekStartOf,
} from "@/lib/payrollCalendar";
import type { ContextDay, DayDetail } from "@/types/payroll";

function day(over: Partial<DayDetail> & { work_date: string }): DayDetail {
  return {
    regular_minutes: 0,
    ot_minutes: 0,
    dt_minutes: 0,
    applied_rate: "16.50",
    ...over,
  };
}

function ctx(work_date: string, net_minutes: number): ContextDay {
  return { work_date, net_minutes, paid_in_prior: true };
}

describe("weekStartOf", () => {
  it("주는 일요일에 시작한다", () => {
    // 2026-08-05 는 수요일 → 그 주 일요일은 2026-08-02
    expect(weekStartOf("2026-08-05")).toBe("2026-08-02");
    // 일요일 자신은 그대로
    expect(weekStartOf("2026-08-02")).toBe("2026-08-02");
    // 토요일은 같은 주의 일요일로
    expect(weekStartOf("2026-08-08")).toBe("2026-08-02");
  });
});

describe("addDays", () => {
  it("월/연 경계를 넘긴다", () => {
    expect(addDays("2026-07-31", 1)).toBe("2026-08-01");
    expect(addDays("2026-08-01", -1)).toBe("2026-07-31");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });
});

describe("buildPayrollWeeks", () => {
  it("요일 슬롯에 배치하고 주간 합계를 낸다", () => {
    const weeks = buildPayrollWeeks([
      day({ work_date: "2026-08-03", regular_minutes: 480 }), // Mon
      day({ work_date: "2026-08-05", regular_minutes: 300 }), // Wed
    ]);

    expect(weeks).toHaveLength(1);
    const w = weeks[0];
    expect(w.start).toBe("2026-08-02");
    expect(w.days[0]).toBeNull(); // Sun
    expect(w.days[1]?.date).toBe("2026-08-03"); // Mon
    expect(w.days[3]?.date).toBe("2026-08-05"); // Wed
    expect(w.total_minutes).toBe(780);
    expect(w.hasPremium).toBe(false);
  });

  it("OT/DT 가 있으면 hasPremium", () => {
    const weeks = buildPayrollWeeks([
      day({ work_date: "2026-08-03", regular_minutes: 480, ot_minutes: 60 }),
    ]);
    expect(weeks[0].hasPremium).toBe(true);
  });

  it("직전 기간 컨텍스트를 같은 주에 넣고 합계에 포함한다", () => {
    // 8/1(토)은 직전 기간, 8/2~8/8 이 새 기간 — 같은 주에 함께 놓인다
    const weeks = buildPayrollWeeks(
      [day({ work_date: "2026-08-02", regular_minutes: 480 })],
      [ctx("2026-07-27", 480), ctx("2026-07-31", 480)],
    );

    // 7/27(월)이 속한 주(7/26~)와 8/2(일)이 속한 주(8/2~) 두 개
    expect(weeks.map((w) => w.start)).toEqual(["2026-07-26", "2026-08-02"]);
    const prevWeek = weeks[0];
    expect(prevWeek.total_minutes).toBe(960);
    expect(prevWeek.days[1]?.inPeriod).toBe(false); // Mon 7/27 = 컨텍스트
    expect(prevWeek.days[5]?.inPeriod).toBe(false); // Fri 7/31 = 컨텍스트
    expect(weeks[1].days[0]?.inPeriod).toBe(true);
  });

  it("같은 날짜가 양쪽에 있으면 기간 내 데이터가 이긴다", () => {
    const weeks = buildPayrollWeeks(
      [day({ work_date: "2026-08-03", regular_minutes: 300 })],
      [ctx("2026-08-03", 999)],
    );
    expect(weeks[0].days[1]?.inPeriod).toBe(true);
    expect(weeks[0].total_minutes).toBe(300);
  });

  it("데이터가 없으면 빈 배열 (range 없이)", () => {
    expect(buildPayrollWeeks([], [])).toEqual([]);
  });
});

describe("buildPayrollWeeks — 기간(range) 전체 커버", () => {
  // 2026-08-01(토) ~ 2026-08-15(토) 반월 기간
  const range = { start: "2026-08-01", end: "2026-08-15" };

  it("근무가 없는 주도 포함해 기간이 걸친 모든 주를 만든다", () => {
    // 8/3(월) 하루만 근무 — 원래는 그 주 1개만 나왔다
    const weeks = buildPayrollWeeks(
      [day({ work_date: "2026-08-03", regular_minutes: 480 })],
      [],
      range,
    );

    // 8/1 이 속한 주(7/26~) ~ 8/15 가 속한 주(8/9~) = 3주
    expect(weeks.map((w) => w.start)).toEqual([
      "2026-07-26",
      "2026-08-02",
      "2026-08-09",
    ]);
    // 근무 없는 주는 7칸 전부 null + 합계 0
    expect(weeks[0].days.every((d) => d === null)).toBe(true);
    expect(weeks[0].total_minutes).toBe(0);
    expect(weeks[2].days.every((d) => d === null)).toBe(true);
    // 근무가 있는 주는 그대로
    expect(weeks[1].days[1]?.date).toBe("2026-08-03");
    expect(weeks[1].total_minutes).toBe(480);
  });

  it("기간 밖이라도 데이터가 있는 주는 유지된다 (직전 기간 컨텍스트)", () => {
    const weeks = buildPayrollWeeks(
      [day({ work_date: "2026-08-03", regular_minutes: 480 })],
      [ctx("2026-07-20", 480)], // 기간 시작 전 주(7/19~)
      range,
    );

    expect(weeks.map((w) => w.start)).toEqual([
      "2026-07-19",
      "2026-07-26",
      "2026-08-02",
      "2026-08-09",
    ]);
    expect(weeks[0].days[1]?.inPeriod).toBe(false);
  });

  it("근무가 하나도 없어도 기간 주 격자는 만들어진다", () => {
    const weeks = buildPayrollWeeks([], [], range);
    expect(weeks).toHaveLength(3);
    expect(weeks.every((w) => w.total_minutes === 0)).toBe(true);
  });
});
