import { describe, it, expect } from "vitest";
import { COMPACT_BASE_PATH, toCompactPath, toDesktopPath } from "@/lib/compact";
import { resolvePagePermission, PERMISSIONS } from "@/lib/permissions";

describe("toDesktopPath", () => {
  it("strips the compact prefix", () => {
    expect(toDesktopPath("/c/schedules")).toBe("/schedules");
    expect(toDesktopPath("/c/attendances")).toBe("/attendances");
  });

  it("maps the compact root to the desktop root", () => {
    expect(toDesktopPath(COMPACT_BASE_PATH)).toBe("/");
  });

  it("leaves non-compact paths untouched", () => {
    expect(toDesktopPath("/schedules")).toBe("/schedules");
  });

  it("does not strip a prefix that merely starts with the same letters", () => {
    expect(toDesktopPath("/checklists")).toBe("/checklists");
  });
});

describe("toCompactPath", () => {
  it("round-trips with toDesktopPath", () => {
    for (const path of ["/schedules", "/attendances", "/"]) {
      expect(toDesktopPath(toCompactPath(path))).toBe(path);
    }
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
