import { describe, it, expect } from "vitest";
import {
  parseScheduleFailure, isScheduleWarningConflict, describeScheduleIssue, describeScheduleIssues,
  SCHEDULE_INVALID, SCHEDULE_WARNINGS_UNCONFIRMED,
  OVERLAPPING_SCHEDULE, TIME_NOT_ON_GRID, PAY_PERIOD_LOCKED,
} from "@/lib/scheduleCodes";

/** axios 에러 흉내 — FastAPI 는 HTTPException(detail=dict) 을 {detail:{...}} 로 감싼다. */
function axiosErr(status: number, detail: unknown) {
  return { response: { status, data: { detail } } };
}

describe("409 식별 — 최상위 code 로만 (D9 / N2)", () => {
  it("SCHEDULE_WARNINGS_UNCONFIRMED 는 확인 흐름으로 분기한다", () => {
    const err = axiosErr(409, {
      code: SCHEDULE_WARNINGS_UNCONFIRMED,
      message: "This employee already has an overlapping schedule.",
      warnings: [{ code: OVERLAPPING_SCHEDULE, params: { user_id: "u1" } }],
      retry: { force: true },
    });
    const f = parseScheduleFailure(err);
    expect(f.kind).toBe("warnings_unconfirmed");
    expect(f.warnings).toHaveLength(1);
    expect(isScheduleWarningConflict(err)).toBe(true);
  });

  it("급여 잠금 409 에는 'Save anyway' 가 뜨면 안 된다 — 같은 409 지만 code 가 다르다", () => {
    const err = axiosErr(409, { code: "pay_period_locked", message: "This pay period is locked." });
    expect(parseScheduleFailure(err).kind).toBe("other");
    expect(isScheduleWarningConflict(err)).toBe(false);
  });

  it("store_closed / pin_conflict 같은 기존 409 도 계약 밖", () => {
    expect(isScheduleWarningConflict(axiosErr(409, { code: "store_closed" }))).toBe(false);
    expect(isScheduleWarningConflict(axiosErr(409, { code: "pin_conflict" }))).toBe(false);
  });

  it("문자열 detail(구형 응답)은 계약 밖으로 떨어진다", () => {
    expect(parseScheduleFailure(axiosErr(409, "Schedule overlaps")).kind).toBe("other");
  });

  it("400 SCHEDULE_INVALID 는 errors 로 분류되고 force 로 넘길 수 없다", () => {
    const f = parseScheduleFailure(axiosErr(400, {
      code: SCHEDULE_INVALID,
      message: "…",
      errors: [{ code: TIME_NOT_ON_GRID, params: { field: "start_at", value: "09:07", step_minutes: 5 } }],
      warnings: [],
    }));
    expect(f.kind).toBe("invalid");
    expect(f.errors[0]!.code).toBe(TIME_NOT_ON_GRID);
  });

  it("네트워크 에러 등 응답 없는 실패는 other", () => {
    expect(parseScheduleFailure(new Error("Network Error")).kind).toBe("other");
    expect(parseScheduleFailure(undefined).kind).toBe("other");
  });
});

describe("문구 구성 — code + params (문자열 매칭 금지)", () => {
  it("params 를 문구에 녹인다", () => {
    expect(describeScheduleIssue({ code: TIME_NOT_ON_GRID, params: { field: "start_at", value: "09:07", step_minutes: 5 } }))
      .toContain("5-minute increments");
    expect(describeScheduleIssue({ code: PAY_PERIOD_LOCKED, params: { work_date: "2026-08-01", direction: "out_of" } }))
      .toContain("2026-08-01");
  });

  it("모르는 코드도 빈 문자열을 내지 않는다 (서버가 새 코드를 먼저 배포해도 안전)", () => {
    expect(describeScheduleIssue({ code: "BRAND_NEW_CODE" })).toBe("BRAND_NEW_CODE");
  });

  it("여러 항목은 줄바꿈 목록", () => {
    const text = describeScheduleIssues([{ code: OVERLAPPING_SCHEDULE }, { code: "X" }]);
    expect(text.split("\n")).toHaveLength(2);
  });
});
