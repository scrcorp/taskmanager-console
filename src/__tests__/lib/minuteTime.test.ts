/** 분 단위 절삭 규칙(R1/R2) 테스트.
 *
 * 표시는 HH:MM (초 버림) 이므로, 분 지표도 "각 시각을 분으로 절삭한 뒤 차이" 여야
 * 화면 시각끼리의 뺄셈과 일치한다. 차이를 내림/반올림하면 어긋난다.
 */
import { describe, expect, it } from "vitest";

import { floorToMinute, minutesBetween } from "@/lib/utils";

const t = (h: number, m: number, s = 0, ms = 0): number =>
  Date.UTC(2026, 7, 8, h, m, s, ms);

describe("floorToMinute", () => {
  it("drops seconds and milliseconds", () => {
    expect(floorToMinute(t(18, 1, 59, 999))).toBe(t(18, 1));
  });

  it("keeps an exact minute", () => {
    expect(floorToMinute(t(18, 1))).toBe(t(18, 1));
  });
});

describe("minutesBetween", () => {
  it("truncates first, then subtracts", () => {
    // 실제 30분 30초. 화면엔 22:26 – 22:57 로 보이므로 31 이어야 한다.
    expect(minutesBetween(t(22, 26, 50), t(22, 57, 20))).toBe(31);
  });

  it("does not round up the late minutes", () => {
    // 이전 구현은 Math.round 로 32 를 냈다 (표시는 18:01 인데).
    expect(minutesBetween(t(17, 30), t(18, 1, 40))).toBe(31);
  });

  it("returns 0 within the same minute", () => {
    expect(minutesBetween(t(18, 1, 5), t(18, 1, 55))).toBe(0);
  });

  it("matches the clock-out total (no live/confirmed jump)", () => {
    expect(minutesBetween(t(18, 1, 40), t(23, 4, 10))).toBe(303);
  });

  it("returns negative when end precedes start", () => {
    expect(minutesBetween(t(18, 0), t(17, 30))).toBe(-30);
  });

  it("returns null for non-finite input", () => {
    expect(minutesBetween(NaN, t(18, 0))).toBeNull();
    expect(minutesBetween(t(18, 0), NaN)).toBeNull();
  });
});
