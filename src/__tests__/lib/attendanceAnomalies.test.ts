/**
 * anomaly 코드 → 라벨 (겹침 clock-in 노출, D15).
 *
 * 이 매핑이 틀리면 두 가지가 조용히 깨진다:
 *  (1) 서버가 새 라벨을 붙였는데 화면에서 사라진다 — 매니저는 문제가 없다고 읽는다
 *  (2) 코드가 raw 로 새어 나간다 (`overlapping clock in`)
 * 그래서 "모르는 코드도 반드시 무언가로 나온다" 를 못박는다.
 */

import { describe, it, expect } from "vitest";
import {
  ATTENDANCE_ANOMALY,
  OVERLAP_EXPLANATION,
  OVERLAP_FIX_STEPS,
  OVERLAP_TITLE,
  anomalyLabel,
  formatAnomalyList,
  hasOverlappingClockIn,
} from "@/lib/attendanceAnomalies";

describe("anomalyLabel", () => {
  it("알려진 코드는 사람이 읽는 라벨로", () => {
    expect(anomalyLabel(ATTENDANCE_ANOMALY.OVERLAPPING_CLOCK_IN)).toBe(
      "Overlapping shift",
    );
    expect(anomalyLabel(ATTENDANCE_ANOMALY.EARLY_CLOCK_IN_OVERRIDE)).toBe(
      "Early clock-in",
    );
    expect(anomalyLabel(ATTENDANCE_ANOMALY.AUTO_CLOCKED_OUT)).toBe(
      "Auto clock-out",
    );
    expect(anomalyLabel(ATTENDANCE_ANOMALY.LATE)).toBe("Late");
  });

  it("모르는 코드도 사라지지 않는다 — 언더바만 푼다", () => {
    expect(anomalyLabel("some_future_label")).toBe("some future label");
  });

  it("언더바가 여러 개여도 전부 푼다 (부분 치환 버그 방지)", () => {
    expect(anomalyLabel("a_b_c")).toBe("a b c");
  });
});

describe("formatAnomalyList — Activity History 의 anomalies 행", () => {
  it("서버가 이어 붙인 코드 목록을 라벨 목록으로", () => {
    expect(formatAnomalyList("late, overlapping_clock_in")).toBe(
      "Late, Overlapping shift",
    );
  });

  it("코드 하나만 있어도 라벨이 된다", () => {
    expect(formatAnomalyList("no_break")).toBe("No break");
  });

  it("공백 편차를 흡수한다 (서버 join 형식이 바뀌어도 raw 코드가 안 샌다)", () => {
    expect(formatAnomalyList("late,overtime")).toBe("Late, Overtime");
    expect(formatAnomalyList(" late ,  overtime ")).toBe("Late, Overtime");
  });

  it("모르는 코드가 섞여도 아는 것만 라벨로 바꾸고 나머지는 남긴다", () => {
    expect(formatAnomalyList("late, brand_new_thing")).toBe(
      "Late, brand new thing",
    );
  });
});

describe("hasOverlappingClockIn", () => {
  it("겹침 라벨이 있으면 true", () => {
    expect(hasOverlappingClockIn(["overlapping_clock_in"])).toBe(true);
    expect(hasOverlappingClockIn(["late", "overlapping_clock_in"])).toBe(true);
  });

  it("없으면 false — null/undefined/빈 배열 포함", () => {
    expect(hasOverlappingClockIn(["late"])).toBe(false);
    expect(hasOverlappingClockIn([])).toBe(false);
    expect(hasOverlappingClockIn(null)).toBe(false);
    expect(hasOverlappingClockIn(undefined)).toBe(false);
  });

  it("이름이 비슷한 스케줄 겹침 코드와 혼동하지 않는다", () => {
    expect(hasOverlappingClockIn(["OVERLAPPING_SCHEDULE"])).toBe(false);
  });
});

describe("겹침 안내 문구", () => {
  it("제목·설명·정리 단계가 비어 있지 않다 (배너가 빈 상자로 뜨는 것 방지)", () => {
    expect(OVERLAP_TITLE.length).toBeGreaterThan(0);
    expect(OVERLAP_EXPLANATION.length).toBeGreaterThan(0);
    expect(OVERLAP_FIX_STEPS.length).toBeGreaterThan(0);
  });

  it("UI 문구는 영어다 (한글은 주석에만)", () => {
    const all = [OVERLAP_TITLE, OVERLAP_EXPLANATION, ...OVERLAP_FIX_STEPS].join(
      " ",
    );
    expect(/[가-힣]/.test(all)).toBe(false);
  });
});
