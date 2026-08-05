/**
 * sumPayrollRows 테스트 — 기간 합계 집계 (KPI 요약 + 테이블 footer 공용).
 *
 * 테스트 범위:
 * - 분 합산 + total_minutes 파생
 * - Decimal 문자열 금액 합산 (penalty/tips/gross)
 * - employees = 행 수
 * - 빈 목록 / 파싱 불가 금액(NaN 오염 방지) / 음수 카드팁
 */

import { describe, it, expect } from "vitest";
import {
  dayAmountParts,
  penaltyTotalsByDate,
  sumDayAmounts,
  sumPayrollRows,
  type PayrollSummableRow,
} from "@/lib/payrollTotals";

function row(over: Partial<PayrollSummableRow> = {}): PayrollSummableRow {
  return {
    regular_minutes: 0,
    ot_minutes: 0,
    dt_minutes: 0,
    penalty_pay: "0",
    card_tips: "0",
    gross_pay: "0",
    ...over,
  };
}

describe("sumPayrollRows", () => {
  it("분과 금액을 모두 더하고 인원수를 센다", () => {
    const totals = sumPayrollRows([
      row({
        regular_minutes: 480,
        ot_minutes: 60,
        dt_minutes: 30,
        penalty_pay: "16.50",
        card_tips: "40.25",
        gross_pay: "220.75",
      }),
      row({
        regular_minutes: 240,
        ot_minutes: 15,
        penalty_pay: "0",
        card_tips: "10.00",
        gross_pay: "95.50",
      }),
    ]);

    expect(totals.regular_minutes).toBe(720);
    expect(totals.ot_minutes).toBe(75);
    expect(totals.dt_minutes).toBe(30);
    expect(totals.total_minutes).toBe(825);
    expect(totals.penalty_pay).toBeCloseTo(16.5, 2);
    expect(totals.card_tips).toBeCloseTo(50.25, 2);
    expect(totals.gross_pay).toBeCloseTo(316.25, 2);
    expect(totals.employees).toBe(2);
  });

  it("빈 목록은 전부 0", () => {
    const totals = sumPayrollRows([]);
    expect(totals).toEqual({
      regular_minutes: 0,
      ot_minutes: 0,
      dt_minutes: 0,
      total_minutes: 0,
      penalty_pay: 0,
      card_tips: 0,
      gross_pay: 0,
      employees: 0,
    });
  });

  it("파싱 불가 금액은 0 으로 취급해 합계를 NaN 으로 오염시키지 않는다", () => {
    const totals = sumPayrollRows([
      row({ gross_pay: "not-a-number", card_tips: "12.00" }),
      row({ gross_pay: "8.00" }),
    ]);
    expect(totals.gross_pay).toBeCloseTo(8, 2);
    expect(totals.card_tips).toBeCloseTo(12, 2);
  });

  it("음수 카드팁(정산 차감)도 그대로 반영한다", () => {
    const totals = sumPayrollRows([
      row({ card_tips: "30.00" }),
      row({ card_tips: "-5.00" }),
    ]);
    expect(totals.card_tips).toBeCloseTo(25, 2);
  });
});

/* -------------------------------------------------------------------------- */
/*  일별 금액 (Day total = 근무 금액 + premium)                               */
/* -------------------------------------------------------------------------- */

function dayRow(over: {
  work_date: string;
  regular_minutes?: number;
  ot_minutes?: number;
  dt_minutes?: number;
  regular_amount?: string | null;
  ot_amount?: string | null;
  dt_amount?: string | null;
  total_amount?: string | null;
}) {
  return {
    regular_minutes: 0,
    ot_minutes: 0,
    dt_minutes: 0,
    ...over,
  };
}

describe("penaltyTotalsByDate", () => {
  it("같은 날 여러 건은 더한다", () => {
    const byDate = penaltyTotalsByDate([
      { work_date: "2026-08-03", amount: "18.00" },
      { work_date: "2026-08-03", amount: "18.00" },
      { work_date: "2026-08-05", amount: "16.50" },
    ]);
    expect(byDate.get("2026-08-03")).toBeCloseTo(36, 2);
    expect(byDate.get("2026-08-05")).toBeCloseTo(16.5, 2);
    expect(byDate.has("2026-08-04")).toBe(false);
  });

  it("빈 목록은 빈 맵", () => {
    expect(penaltyTotalsByDate([]).size).toBe(0);
  });
});

describe("dayAmountParts", () => {
  it("항목별 금액 + premium 을 합쳐 Day total 을 만든다", () => {
    const parts = dayAmountParts(
      dayRow({
        work_date: "2026-08-03",
        regular_amount: "104.00",
        ot_amount: "13.00",
        dt_amount: "0",
        total_amount: "117.00",
      }),
      36,
    );
    expect(parts.regular).toBeCloseTo(104, 2);
    expect(parts.ot).toBeCloseTo(13, 2);
    expect(parts.dt).toBe(0);
    expect(parts.premium).toBeCloseTo(36, 2);
    expect(parts.total).toBeCloseTo(153, 2);
  });

  it("premium 이 없으면 근무 금액이 곧 Day total", () => {
    const parts = dayAmountParts(
      dayRow({
        work_date: "2026-08-04",
        regular_amount: "104.00",
        total_amount: "104.00",
      }),
      0,
    );
    expect(parts.total).toBeCloseTo(104, 2);
  });

  it("일별 금액이 없는 옛 동결본은 premium 이 있어도 total 이 null", () => {
    const parts = dayAmountParts(dayRow({ work_date: "2026-08-05" }), 16.5);
    expect(parts.total).toBeNull();
    expect(parts.premium).toBeCloseTo(16.5, 2);
  });
});

describe("sumDayAmounts", () => {
  const days = [
    dayRow({
      work_date: "2026-08-03",
      regular_minutes: 480,
      ot_minutes: 60,
      total_amount: "117.00",
    }),
    dayRow({
      work_date: "2026-08-04",
      regular_minutes: 300,
      total_amount: "65.00",
    }),
  ];

  it("시간 합 + premium 포함 Day total 합", () => {
    const totals = sumDayAmounts(days, [
      { work_date: "2026-08-03", amount: "18.00" },
    ]);
    expect(totals.regular_minutes).toBe(780);
    expect(totals.ot_minutes).toBe(60);
    expect(totals.dt_minutes).toBe(0);
    expect(totals.premium).toBeCloseTo(18, 2);
    expect(totals.total).toBeCloseTo(200, 2); // 117 + 65 + 18
  });

  it("일별 표에 없는 날짜의 premium 도 기간 합계에는 들어간다", () => {
    const totals = sumDayAmounts(days, [
      { work_date: "2026-08-09", amount: "20.00" },
    ]);
    expect(totals.premium).toBeCloseTo(20, 2);
    expect(totals.total).toBeCloseTo(202, 2);
  });

  it("금액을 가진 날이 하나도 없으면 total 은 null (옛 동결본)", () => {
    const totals = sumDayAmounts(
      [
        dayRow({ work_date: "2026-08-03", regular_minutes: 480 }),
        dayRow({ work_date: "2026-08-04", regular_minutes: 300 }),
      ],
      [{ work_date: "2026-08-03", amount: "18.00" }],
    );
    expect(totals.regular_minutes).toBe(780);
    expect(totals.premium).toBeCloseTo(18, 2);
    expect(totals.total).toBeNull();
  });
});
