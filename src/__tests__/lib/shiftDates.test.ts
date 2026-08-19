/**
 * 시프트 달력일 판정 — **콘솔 단일 출처(`lib/scheduleTime`) 회귀 고정**.
 *
 * 규칙 (server `schedule_service._validate_entry` 와 같은 식):
 *     so = 시작 시각 <  day_start(operating_day + 1) ? 1 : 0   → 시작 날짜 = operating_day + so
 *     eo = 종료 시각 <= 시작 시각                     ? 1 : 0   → 종료 날짜 = 시작 날짜 + eo
 *
 * 2026-08 오염의 재현 시나리오를 그대로 고정한다: 경계 11:00 매장에서 09:00(+1일) 근무의
 * **시각만** 17:00 으로 바꾸면 시작 날짜는 당일로 되돌아와야 한다. 옛 오프셋이 남으면
 * 17:00 시프트가 하루 뒤에 저장되고, 근태가 1439분 조기출근으로 오탐한다.
 */

import { describe, it, expect } from "vitest";
import {
  storeStartOffset,
  dayBoundaryFor,
  autoEndOffset,
  durationForEndOffset,
  addDay,
} from "@/lib/scheduleTime";

const OD = "2026-08-20"; // 목요일 (다음날 = 금요일)
const BOUNDARY_11 = { all: "11:00" };

describe("시작 날짜 (so)", () => {
  it("경계 이전 시작은 영업일+1일, 이후는 당일", () => {
    expect(storeStartOffset("09:00", BOUNDARY_11, OD)).toBe(1);
    expect(storeStartOffset("17:00", BOUNDARY_11, OD)).toBe(0);
  });

  it("경계와 같은 시각은 당일이다 (경계는 창의 시작, 미만일 때만 +1)", () => {
    expect(storeStartOffset("11:00", BOUNDARY_11, OD)).toBe(0);
    expect(storeStartOffset("10:55", BOUNDARY_11, OD)).toBe(1);
  });

  it("경계는 영업일+1일의 요일 값을 쓴다", () => {
    expect(dayBoundaryFor(OD, { thu: "11:00", fri: "05:00", all: "09:00" })).toBe("05:00");
    // 그래서 목요일 영업일의 06:00 시작은 금요일 경계(05:00) 이후 → 당일이다.
    expect(storeStartOffset("06:00", { thu: "11:00", fri: "05:00", all: "09:00" }, OD)).toBe(0);
  });

  it("설정이 없으면 서버 기본(06:00)과 같은 판정", () => {
    expect(storeStartOffset("05:00", null, OD)).toBe(1);
    expect(storeStartOffset("06:00", null, OD)).toBe(0);
  });
});

describe("종료 날짜 (eo) 와 후보별 길이", () => {
  it("종료가 시작 이하이면 다음 달력일", () => {
    expect(autoEndOffset("17:00", "23:00")).toBe(0);
    expect(autoEndOffset("17:00", "01:30")).toBe(1);
    expect(autoEndOffset("17:00", "17:00")).toBe(1); // 딱 24h
  });

  it("후보를 고르면 길이가 ±24h 움직인다", () => {
    // 17:00 → 23:00: 같은 날 6h, 다음날이면 30h(24h 초과 → 저장 차단)
    expect(durationForEndOffset("17:00", "23:00", 0)).toBe(360);
    expect(durationForEndOffset("17:00", "23:00", 1)).toBe(360 + 1440);
    // 17:00 → 01:30: 다음날 8h30m, 같은 날이면 음수(종료가 시작보다 이름 → 불가)
    expect(durationForEndOffset("17:00", "01:30", 1)).toBe(510);
    expect(durationForEndOffset("17:00", "01:30", 0)).toBe(510 - 1440);
  });

  it("시작 날짜가 밀린 새벽 근무의 종료 날짜는 시작 날짜 기준이다", () => {
    const startDate = addDay(OD, storeStartOffset("09:00", BOUNDARY_11, OD)); // 08-21
    expect(startDate).toBe("2026-08-21");
    expect(addDay(startDate, autoEndOffset("09:00", "14:30"))).toBe("2026-08-21");
    expect(addDay(startDate, autoEndOffset("22:00", "02:00"))).toBe("2026-08-22");
  });
});
