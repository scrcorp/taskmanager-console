/**
 * payrollGateLinks 테스트 — 마감 게이트 → 근태 화면 1회용 딥링크 (Payroll v1).
 *
 * 테스트 범위:
 * - buildAttendanceOneShotLink: 필수 store + 선택 date/staff/unconf, _ext 마커 항상 부착
 * - extractDates: 서버 validation 메시지에서 날짜 추출 (순서 유지, 중복 제거)
 * - stripDates: 날짜 목록을 뗀 사유 문구 (행마다 날짜를 따로 보여주므로)
 */

import { describe, it, expect } from "vitest";
import {
  ONE_SHOT_PARAM,
  buildAttendanceOneShotLink,
  extractDates,
  stripDates,
} from "@/lib/payrollGateLinks";

describe("buildAttendanceOneShotLink", () => {
  it("store 만 있어도 1회용 마커가 붙는다", () => {
    const url = buildAttendanceOneShotLink({ storeId: "store-1" });
    expect(url).toBe(`/attendances?store=store-1&${ONE_SHOT_PARAM}=1`);
  });

  it("날짜/직원/자동퇴근 필터를 모두 붙인다", () => {
    const url = buildAttendanceOneShotLink({
      storeId: "store-1",
      date: "2026-07-18",
      userId: "user-9",
      unconfirmedAutoOnly: true,
    });
    const params = new URLSearchParams(url.split("?")[1]);
    expect(params.get("store")).toBe("store-1");
    expect(params.get("date")).toBe("2026-07-18");
    expect(params.get("staff")).toBe("user-9");
    expect(params.get("unconf")).toBe("1");
    expect(params.get(ONE_SHOT_PARAM)).toBe("1");
  });

  it("빈 값은 파라미터를 만들지 않는다 (근태 기본 필터 유지)", () => {
    const url = buildAttendanceOneShotLink({
      storeId: "store-1",
      date: null,
      userId: null,
      unconfirmedAutoOnly: false,
    });
    const params = new URLSearchParams(url.split("?")[1]);
    expect(params.has("date")).toBe(false);
    expect(params.has("staff")).toBe(false);
    expect(params.has("unconf")).toBe(false);
  });
});

describe("extractDates", () => {
  it("메시지 안의 모든 날짜를 순서대로 뽑는다", () => {
    expect(
      extractDates("Open shift without clock-out on: 2026-07-18, 2026-07-20"),
    ).toEqual(["2026-07-18", "2026-07-20"]);
  });

  it("중복 날짜는 한 번만 반환한다", () => {
    expect(extractDates("a 2026-07-18 b 2026-07-18")).toEqual(["2026-07-18"]);
  });

  it("날짜가 없으면 빈 배열", () => {
    expect(extractDates("Tip period is still draft.")).toEqual([]);
  });
});

describe("stripDates", () => {
  it("뒤에 붙은 날짜 목록과 연결어를 제거한다", () => {
    expect(
      stripDates("Open shift without clock-out on: 2026-07-18, 2026-07-20"),
    ).toBe("Open shift without clock-out");
    expect(
      stripDates("Hourly rate is missing or zero on: 2026-07-18"),
    ).toBe("Hourly rate is missing or zero");
    expect(
      stripDates(
        "Applied hourly rate is below minimum wage ($16.50) on: 2026-07-18",
      ),
    ).toBe("Applied hourly rate is below minimum wage ($16.50)");
  });

  it("날짜가 없는 메시지는 그대로 둔다 (어미 'on' 오탐 없음)", () => {
    expect(stripDates("Auto clock-out has not been confirmed")).toBe(
      "Auto clock-out has not been confirmed",
    );
    expect(stripDates("Needs confirmation")).toBe("Needs confirmation");
  });
});
