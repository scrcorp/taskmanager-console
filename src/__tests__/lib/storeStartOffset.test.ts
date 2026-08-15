/**
 * storeStartOffset — 날짜 UI 없는 표면(벌크 그리드)의 시작일 오프셋 추론.
 *
 * 회귀 방지 대상 (2026-08-14 현장):
 *   벌크 저장이 `dawnStartOffset(startTime)` 을 boundary 인자 없이 호출해서
 *   상수 06:00 을 기준으로 삼았다. 경계를 04:00 으로 운영하는 매장에서는
 *   04~06시 시작 근무가 전부 "새벽조"로 오판돼 시작일이 다음날로 밀렸고,
 *   서버(실제 경계 기준)가 START_AFTER_DAY_BOUNDARY 경고를 내면서
 *   **단건 모달로는 저장되는 근무가 벌크에서만 실패**했다.
 */

import { describe, it, expect } from "vitest";
import { storeStartOffset, dawnStartOffset } from "@/lib/scheduleTime";

const DAY = "2026-08-14"; // 금요일

describe("storeStartOffset", () => {
  it("경계 04:00 매장: 05:00 시작은 같은 영업일이다 (핵심 회귀)", () => {
    expect(storeStartOffset("05:00", { all: "04:00" }, DAY)).toBe(0);
    // 상수 06:00 을 쓰던 옛 동작이면 1 이 나온다 — 그게 버그였다.
    expect(dawnStartOffset("05:00")).toBe(1);
  });

  it("경계 04:00 매장: 03:00 시작은 다음 달력일(새벽조)이다", () => {
    expect(storeStartOffset("03:00", { all: "04:00" }, DAY)).toBe(1);
  });

  it("경계 06:00 매장은 기존과 동일하게 판정한다", () => {
    expect(storeStartOffset("05:00", { all: "06:00" }, DAY)).toBe(1);
    expect(storeStartOffset("06:00", { all: "06:00" }, DAY)).toBe(0);
  });

  it("경계 00:00 매장: 어떤 시각도 다음날로 밀지 않는다", () => {
    expect(storeStartOffset("00:00", { all: "00:00" }, DAY)).toBe(0);
    expect(storeStartOffset("03:00", { all: "00:00" }, DAY)).toBe(0);
  });

  it("요일별 경계도 그 날짜의 값을 쓴다", () => {
    // 2026-08-14 는 금요일 — fri 값(05:00)이 적용되어야 한다.
    const byDay = { mon: "04:00", fri: "05:00", all: "09:00" };
    expect(storeStartOffset("04:30", byDay, DAY)).toBe(1); // 05:00 미만
    expect(storeStartOffset("05:30", byDay, DAY)).toBe(0);
  });

  it("설정이 없으면 기본 경계로 떨어진다 (서버 기본과 동일해야 함)", () => {
    expect(storeStartOffset("05:00", null, DAY)).toBe(1);
    expect(storeStartOffset("07:00", undefined, DAY)).toBe(0);
  });
});
