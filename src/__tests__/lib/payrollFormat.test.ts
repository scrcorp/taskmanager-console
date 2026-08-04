/**
 * payrollFormat 테스트 — 날짜/요일 라벨과 근무·휴게 시각 한 줄.
 *
 * 테스트 범위:
 * - payrollDayLabel: "Aug 3 (Mon)" + UTC 파싱으로 하루 밀리지 않는지
 * - workedTimesLine: 서버 pay_stub_pdf.worked_times_line 과 같은 구성
 *   (근무 구간, 미퇴근, 무급 식사 구간, 유급 휴게는 시작만, 기록 없음)
 */

import { describe, it, expect } from "vitest";
import {
  dayAmountLine,
  payrollDayLabel,
  payrollWeekday,
  workedTimesLine,
} from "@/lib/payrollFormat";

describe("payrollDayLabel", () => {
  it("월/일 + 요일을 붙인다", () => {
    // 2026-08-03 은 월요일
    expect(payrollDayLabel("2026-08-03")).toBe("Aug 3 (Mon)");
    // 2026-08-02 는 일요일 (주 시작)
    expect(payrollDayLabel("2026-08-02")).toBe("Aug 2 (Sun)");
  });

  it("UTC 파싱으로 하루 밀리지 않는다 (로컬 파싱)", () => {
    // new Date("2026-01-01") 는 UTC 자정 → 서부에서 12/31 로 보인다
    expect(payrollWeekday("2026-01-01")).toBe("Thu");
    expect(payrollDayLabel("2026-01-01")).toBe("Jan 1 (Thu)");
  });
});

describe("workedTimesLine", () => {
  it("근무 구간만 있으면 Worked 만", () => {
    expect(
      workedTimesLine({ shifts: [{ start: "09:00", end: "15:30" }] }),
    ).toBe("Worked 09:00–15:30");
  });

  it("미퇴근이면 종료 시각 자리를 비운다", () => {
    expect(workedTimesLine({ shifts: [{ start: "09:00" }] })).toBe(
      "Worked 09:00–",
    );
    expect(workedTimesLine({ shifts: [{ start: "09:00", end: null }] })).toBe(
      "Worked 09:00–",
    );
  });

  it("무급 식사는 구간, 유급 휴게는 시작 시각만", () => {
    const line = workedTimesLine({
      shifts: [{ start: "09:00", end: "18:00" }],
      breaks: [
        { start: "12:00", end: "12:30", type: "unpaid_meal" },
        { start: "10:30", end: "10:40", type: "paid_10min" },
      ],
    });
    expect(line).toBe("Worked 09:00–18:00 · Meal 12:00–12:30 · Rest 10:30");
  });

  it("여러 건은 쉼표로 잇는다", () => {
    const line = workedTimesLine({
      shifts: [
        { start: "09:00", end: "12:00" },
        { start: "17:00", end: "21:00" },
      ],
      breaks: [
        { start: "10:15", end: "10:25", type: "paid_10min" },
        { start: "18:30", end: "18:40", type: "paid_10min" },
      ],
    });
    expect(line).toBe("Worked 09:00–12:00, 17:00–21:00 · Rest 10:15, 18:30");
  });

  it("기록이 없으면 빈 문자열 (옛 동결본 → 호출 측이 줄 생략)", () => {
    expect(workedTimesLine({})).toBe("");
    expect(workedTimesLine({ shifts: [], breaks: [] })).toBe("");
    expect(workedTimesLine({ shifts: null, breaks: null })).toBe("");
  });
});

describe("dayAmountLine", () => {
  it("Regular → OT → DT → Premium 순으로 붙인다", () => {
    expect(dayAmountLine({ regular: 104, ot: 13, dt: 26, premium: 36 })).toBe(
      "Regular $104.00 · OT $13.00 · DT $26.00 · Premium $36.00",
    );
  });

  it("0 인 항목은 생략한다", () => {
    expect(dayAmountLine({ regular: 104, ot: 13, dt: 0, premium: 36 })).toBe(
      "Regular $104.00 · OT $13.00 · Premium $36.00",
    );
    expect(dayAmountLine({ regular: 104, ot: 0, dt: 0, premium: 0 })).toBe(
      "Regular $104.00",
    );
  });

  it("premium 만 있어도 표시된다", () => {
    expect(dayAmountLine({ regular: 0, ot: 0, dt: 0, premium: 18 })).toBe(
      "Premium $18.00",
    );
  });

  it("전부 0 이면 빈 문자열 (호출 측이 줄 생략)", () => {
    expect(dayAmountLine({ regular: 0, ot: 0, dt: 0, premium: 0 })).toBe("");
  });
});
