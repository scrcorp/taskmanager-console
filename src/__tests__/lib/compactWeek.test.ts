import { describe, it, expect } from "vitest";
import {
  dayOfWeek,
  formatWallClock,
  NOT_SET,
  weekDays,
  weekStart,
  WEEKDAY_LABELS,
} from "@/lib/compactWeek";

describe("weekStart / weekDays — 주는 항상 일요일 시작", () => {
  it("returns the same day when it is already Sunday", () => {
    expect(dayOfWeek("2026-08-09")).toBe(0);
    expect(weekStart("2026-08-09")).toBe("2026-08-09");
  });

  it("walks back to Sunday from mid-week", () => {
    expect(weekStart("2026-08-12")).toBe("2026-08-09"); // Wed → Sun
    expect(weekStart("2026-08-15")).toBe("2026-08-09"); // Sat → Sun
  });

  it("produces 7 consecutive days Sun→Sat", () => {
    const days = weekDays("2026-08-12");
    expect(days).toEqual([
      "2026-08-09",
      "2026-08-10",
      "2026-08-11",
      "2026-08-12",
      "2026-08-13",
      "2026-08-14",
      "2026-08-15",
    ]);
    expect(dayOfWeek(days[0])).toBe(0);
    expect(dayOfWeek(days[6])).toBe(6);
    expect(days).toHaveLength(WEEKDAY_LABELS.length);
  });

  it("crosses month and year boundaries", () => {
    expect(weekDays("2026-01-01")[0]).toBe("2025-12-28");
    expect(weekStart("2026-03-01")).toBe("2026-03-01");
  });
});

describe("formatWallClock — 문자열을 그대로 읽어 매장 tz 를 보존", () => {
  it("formats midnight and noon correctly", () => {
    expect(formatWallClock("2026-08-09T00:00")).toBe("12:00 AM");
    expect(formatWallClock("2026-08-09T12:00")).toBe("12:00 PM");
  });

  it("formats morning and evening", () => {
    expect(formatWallClock("2026-08-09T09:05")).toBe("9:05 AM");
    expect(formatWallClock("2026-08-09T17:30")).toBe("5:30 PM");
  });

  it("falls back to 'Not set' for missing or malformed values (dev 표기 규약)", () => {
    expect(NOT_SET).toBe("Not set");
    expect(formatWallClock(null)).toBe(NOT_SET);
    expect(formatWallClock(undefined)).toBe(NOT_SET);
    expect(formatWallClock("2026-08-09")).toBe(NOT_SET);
  });
});
