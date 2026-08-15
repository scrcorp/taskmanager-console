/**
 * Activity History 항목/값 포맷 — 특히 스케줄 변경 재판정이 남기는 `anomalies` 행.
 *
 * 서버는 표시 문자열을 안 내려준다. 여기 매핑이 없으면 카드에 raw 코드가
 * 그대로 찍힌다 (`anomalies` / `early_clock_in_override, late`). 콘솔에서만
 * 티가 나므로 리뷰에서 잘 안 잡힌다 — 테스트로 못박는다.
 */

import { describe, it, expect } from "vitest";
import {
  FIELD_ANOMALIES,
  fieldLabel,
  formatFieldValue,
  formatValue,
} from "@/lib/attendanceHistoryFormat";

describe("fieldLabel", () => {
  it("재판정이 남기는 anomalies 행에 이름이 있다", () => {
    // 없으면 UI 에 raw `anomalies` 가 뜬다 (계약 §6 console 필수 대응).
    expect(fieldLabel(FIELD_ANOMALIES)).toBe("Labels");
  });

  it("기존 항목 이름은 그대로 유지된다", () => {
    expect(fieldLabel("status")).toBe("Status");
    expect(fieldLabel("clock_in")).toBe("Clock-in");
    expect(fieldLabel("break_start_at")).toBe("Break start");
  });

  it("모르는 항목은 raw 로 떨어지되 사라지지는 않는다", () => {
    expect(fieldLabel("brand_new_field")).toBe("brand_new_field");
  });
});

describe("formatFieldValue — anomalies 행", () => {
  it("코드 목록을 라벨 목록으로 바꾼다", () => {
    expect(
      formatFieldValue(FIELD_ANOMALIES, "early_clock_in_override, late"),
    ).toBe("Early clock-in, Late");
    expect(formatFieldValue(FIELD_ANOMALIES, "overlapping_clock_in")).toBe(
      "Overlapping shift",
    );
  });

  it("라벨이 하나도 없던 상태는 'None' — 'Not set' 이 아니다", () => {
    // 라벨은 설정하는 값이 아니라 붙는 것이라 없음의 표현이 다르다.
    expect(formatFieldValue(FIELD_ANOMALIES, "(none)")).toBe("None");
    expect(formatFieldValue(FIELD_ANOMALIES, null)).toBe("None");
    expect(formatFieldValue(FIELD_ANOMALIES, "")).toBe("None");
  });

  it("다른 항목은 기존 포맷 그대로 지나간다 (회귀 방지)", () => {
    expect(formatFieldValue("status", "no_show")).toBe("No show");
    expect(formatFieldValue("status", "(none)")).toBe("Not set");
    expect(formatFieldValue("break_type", "paid_10min")).toBe("Paid 10min");
  });
});

describe("formatValue — 기존 규약 유지", () => {
  it("빈 값/센티널은 Not set", () => {
    expect(formatValue(null)).toBe("Not set");
    expect(formatValue("(none)")).toBe("Not set");
    expect(formatValue("(cleared)")).toBe("Not set");
  });

  it("상태 코드는 라벨로", () => {
    expect(formatValue("clocked_out")).toBe("Clocked out");
    expect(formatValue("on_break")).toBe("On break");
  });

  it("ISO 시각은 시각 표기로 (tz 고정으로 재현 가능하게)", () => {
    expect(formatValue("2026-08-13T16:00:00Z", "UTC")).toBe("Aug 13, 4:00 PM");
  });
});
