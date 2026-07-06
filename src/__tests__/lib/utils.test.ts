/**
 * utils 유틸리티 테스트 — 날짜 포맷팅 + 페이지 계산 검증.
 *
 * 테스트 범위:
 * - formatDate: ISO 날짜 문자열 → 로컬 날짜 포맷
 * - formatDateTime: ISO 날짜 문자열 → 로컬 날짜+시간 포맷
 * - getTotalPages: 전체 건수 + 페이지당 건수 → 총 페이지 수 (최소 1)
 */

import { describe, it, expect } from "vitest";
import { formatDate, formatDateTime, getTotalPages, formatWatermarkTime } from "@/lib/utils";

describe("utils", () => {
  describe("formatDate", () => {
    it("formats ISO date string", () => {
      const result = formatDate("2026-01-15T10:30:00Z");
      expect(result).toBeTruthy();
      expect(typeof result).toBe("string");
    });
  });

  describe("formatDateTime", () => {
    it("formats ISO date string with time", () => {
      const result = formatDateTime("2026-01-15T10:30:00Z");
      expect(result).toBeTruthy();
      expect(typeof result).toBe("string");
    });
  });

  describe("getTotalPages", () => {
    it("calculates pages correctly", () => {
      expect(getTotalPages(100, 10)).toBe(10);
      expect(getTotalPages(101, 10)).toBe(11);
      expect(getTotalPages(0, 10)).toBe(1); // Math.max(1, ...) ensures minimum 1
      expect(getTotalPages(5, 10)).toBe(1);
    });
  });

  describe("formatWatermarkTime", () => {
    // 2026-06-22T18:30:00Z = 03:30 다음날(Jun 23) in Asia/Seoul(UTC+9)
    const iso = "2026-06-22T18:30:00Z";

    it("renders date + time in the given timezone (store-tz)", () => {
      // Seoul: UTC+9 → Jun 23, 3:30 AM
      const seoul = formatWatermarkTime(iso, "Asia/Seoul");
      expect(seoul).toContain("Jun 23");
      expect(seoul).toMatch(/3:30/);
    });

    it("shifts the rendered day across timezones for the same instant", () => {
      // New York: UTC-4 (DST) → Jun 22, 2:30 PM
      const ny = formatWatermarkTime(iso, "America/New_York");
      expect(ny).toContain("Jun 22");
      expect(ny).toMatch(/2:30/);
    });

    it("always includes both month/day and time (no same-day collapse)", () => {
      const out = formatWatermarkTime("2026-01-15T10:30:00Z", "UTC");
      expect(out).toContain("Jan 15");
      expect(out).toMatch(/10:30/);
    });

    it("appends the timezone label so the reader knows which zone the time is in", () => {
      // 핵심 요구사항: 워터마크 시각은 어느 타임존인지 라벨이 함께 보여야 한다.
      expect(formatWatermarkTime("2026-01-15T10:30:00Z", "UTC")).toContain("UTC");
      // Seoul 은 ICU 버전에 따라 'GMT+9' 또는 'KST' 로 표기 — 둘 다 허용.
      expect(formatWatermarkTime(iso, "Asia/Seoul")).toMatch(/GMT\+9|KST/);
    });
  });
});
