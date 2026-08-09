/**
 * 조기 출근 강행 미확인 판정 — 근태표 칩/배너와 payroll 게이트가 같은 규칙을 쓴다.
 *
 * 이 판정이 틀리면 (1) 확인 버튼이 안 뜨거나 (2) 이미 확인한 건에 계속 뜬다.
 * 매니저 대행 건은 서버가 생성 시점에 확인 처리하므로 여기서 걸리면 안 된다.
 */

import { describe, it, expect } from "vitest";
import { isUnconfirmedEarlyClockIn } from "@/components/schedules/redesign/attendanceConfirm";

describe("isUnconfirmedEarlyClockIn", () => {
  it("override anomaly + 확인 시각 없음 → 미확인", () => {
    expect(isUnconfirmedEarlyClockIn(["early_clock_in_override"], null)).toBe(true);
    expect(isUnconfirmedEarlyClockIn(["early_clock_in_override"], undefined)).toBe(
      true,
    );
  });

  it("확인 시각이 있으면 미확인 아님 (매니저 대행 건 포함)", () => {
    expect(
      isUnconfirmedEarlyClockIn(
        ["early_clock_in_override"],
        "2026-08-09T12:00:00Z",
      ),
    ).toBe(false);
  });

  it("override anomaly 가 없으면 확인 대상 아님", () => {
    expect(isUnconfirmedEarlyClockIn(["late"], null)).toBe(false);
    expect(isUnconfirmedEarlyClockIn([], null)).toBe(false);
    expect(isUnconfirmedEarlyClockIn(null, null)).toBe(false);
    expect(isUnconfirmedEarlyClockIn(undefined, null)).toBe(false);
  });

  it("다른 anomaly 와 섞여 있어도 판정된다", () => {
    expect(
      isUnconfirmedEarlyClockIn(
        ["no_break", "early_clock_in_override", "overtime"],
        null,
      ),
    ).toBe(true);
  });

  it("자동퇴근 미확인과 혼동하지 않는다", () => {
    expect(isUnconfirmedEarlyClockIn(["auto_clocked_out"], null)).toBe(false);
  });
});
