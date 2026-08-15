/**
 * 겹침 전용 필터 — Daily / Weekly 가 같은 술어를 쓴다.
 *
 * 두 화면이 각자 판정하면 "Daily 엔 보이는데 Weekly 엔 없다" 가 생기고,
 * 그 상태로 급여를 확정하면 이중 지급이 그대로 나간다.
 */

import { describe, it, expect } from "vitest";
import {
  EMPTY_ATTENDANCE_FILTERS,
  matchesOverlapFilter,
} from "@/components/schedules/redesign/AttendanceFilterBar";

describe("matchesOverlapFilter", () => {
  it("필터가 꺼져 있으면 전부 통과", () => {
    expect(matchesOverlapFilter(null, false)).toBe(true);
    expect(matchesOverlapFilter(["late"], false)).toBe(true);
    expect(matchesOverlapFilter(["overlapping_clock_in"], false)).toBe(true);
  });

  it("필터가 켜지면 겹침 건만 통과", () => {
    expect(matchesOverlapFilter(["overlapping_clock_in"], true)).toBe(true);
    expect(matchesOverlapFilter(["late", "overlapping_clock_in"], true)).toBe(
      true,
    );
    expect(matchesOverlapFilter(["late"], true)).toBe(false);
    expect(matchesOverlapFilter([], true)).toBe(false);
    expect(matchesOverlapFilter(null, true)).toBe(false);
    expect(matchesOverlapFilter(undefined, true)).toBe(false);
  });
});

describe("EMPTY_ATTENDANCE_FILTERS", () => {
  it("겹침 필터는 기본 꺼짐 — 기본 화면이 조용히 좁아지면 안 된다", () => {
    expect(EMPTY_ATTENDANCE_FILTERS.overlappingOnly).toBe(false);
  });
});
