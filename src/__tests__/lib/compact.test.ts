import { describe, it, expect } from "vitest";
import { COMPACT_BASE_PATH, toCompactPath, toDesktopPath } from "@/lib/compact";
import { resolvePagePermission, PERMISSIONS } from "@/lib/permissions";

describe("toDesktopPath", () => {
  it("strips the compact prefix", () => {
    expect(toDesktopPath("/c/schedules")).toBe("/schedules");
    expect(toDesktopPath("/c/attendances")).toBe("/attendances");
  });

  it("maps the compact root to the schedules page", () => {
    // `/c` 는 스케줄+근태 통합 화면이다. 권한 게이트는 본체인 스케줄 기준으로 건다 —
    // 대시보드(`/`)로 매핑하면 게이트가 사라져 아무나 들어온다.
    expect(toDesktopPath(COMPACT_BASE_PATH)).toBe("/schedules");
  });

  it("gates the compact root behind schedules:read", () => {
    expect(resolvePagePermission(toDesktopPath(COMPACT_BASE_PATH))).toBe(
      PERMISSIONS.SCHEDULES_READ,
    );
  });

  it("leaves non-compact paths untouched", () => {
    expect(toDesktopPath("/schedules")).toBe("/schedules");
  });

  it("does not strip a prefix that merely starts with the same letters", () => {
    expect(toDesktopPath("/checklists")).toBe("/checklists");
  });
});

describe("toCompactPath", () => {
  it("round-trips with toDesktopPath for real pages", () => {
    for (const path of ["/schedules", "/attendances"]) {
      expect(toDesktopPath(toCompactPath(path))).toBe(path);
    }
  });

  it("does not round-trip the root — `/c` is the schedules screen, not the dashboard", () => {
    expect(toCompactPath("/")).toBe(COMPACT_BASE_PATH);
    expect(toDesktopPath(COMPACT_BASE_PATH)).toBe("/schedules");
  });
});

describe("resolvePagePermission via compact paths", () => {
  it("resolves the same permission as the desktop path", () => {
    expect(resolvePagePermission(toDesktopPath("/c/schedules"))).toBe(PERMISSIONS.SCHEDULES_READ);
  });

  it("prefers the longest match", () => {
    expect(resolvePagePermission(toDesktopPath("/c/schedules/settings"))).toBe(
      PERMISSIONS.SCHEDULE_SETTINGS_MANAGE,
    );
  });

  it("returns undefined for paths with no permission gate (auth only)", () => {
    expect(resolvePagePermission(toDesktopPath("/c/attendances"))).toBeUndefined();
  });
});
