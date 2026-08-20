/**
 * 배정 가능 판정 헬퍼 — 화면이 칸/후보를 잠그는 기준.
 *
 * 규칙 자체는 서버가 소유하고 여기선 서버가 내려준 값만 해석한다.
 * 이 해석이 서버와 갈리면 "눌리는데 저장이 안 되는" 상태가 된다.
 */
import { describe, it, expect } from "vitest";
import {
  canAssignOn,
  isNeverAssignable,
  assignBlockReason,
  formatEmploymentPeriod,
} from "@/lib/assignability";

const ACTIVE = { assignable: true, assignable_until: null };
const LEAVER = { assignable: true, assignable_until: "2026-08-10" };
const OFF = { assignable: false, assignable_until: null };

describe("canAssignOn", () => {
  it("allows an active staff on any date", () => {
    expect(canAssignOn(ACTIVE, "2030-01-01")).toBe(true);
  });

  it("allows a leaver up to and including the last working day", () => {
    expect(canAssignOn(LEAVER, "2026-08-09")).toBe(true);
    expect(canAssignOn(LEAVER, "2026-08-10")).toBe(true);
  });

  it("blocks a leaver from the day after", () => {
    expect(canAssignOn(LEAVER, "2026-08-11")).toBe(false);
  });

  it("blocks a deactivated staff on every date", () => {
    expect(canAssignOn(OFF, "1999-01-01")).toBe(false);
    expect(canAssignOn(OFF, "2030-01-01")).toBe(false);
  });

  it("does not block when the server sent no fields (old cache) — server still validates", () => {
    expect(canAssignOn({}, "2030-01-01")).toBe(true);
  });

  it("blocks an unknown person", () => {
    expect(canAssignOn(undefined, "2030-01-01")).toBe(false);
  });
});

describe("isNeverAssignable", () => {
  it("is true only for assignable=false", () => {
    expect(isNeverAssignable(OFF)).toBe(true);
    expect(isNeverAssignable(LEAVER)).toBe(false);
    expect(isNeverAssignable(ACTIVE)).toBe(false);
  });
});

describe("assignBlockReason", () => {
  it("is null while assignable", () => {
    expect(assignBlockReason(LEAVER, "2026-08-10")).toBeNull();
  });

  it("names the last working day for a leaver", () => {
    expect(assignBlockReason(LEAVER, "2026-08-11")).toContain("2026-08-10");
  });

  it("falls back to a plain reason with no date", () => {
    expect(assignBlockReason(OFF, "2026-08-11")).toBe("No longer active");
  });
});

describe("formatEmploymentPeriod", () => {
  it("shows an open-ended range while employed", () => {
    expect(formatEmploymentPeriod({ employed_from: "2026-03-30" })).toBe("2026.03.30 ~");
  });

  it("shows a closed range once terminated", () => {
    expect(
      formatEmploymentPeriod({ employed_from: "2026-03-30", employed_to: "2026-08-19" }),
    ).toBe("2026.03.30 ~ 2026.08.19");
  });

  it("marks a missing hire date instead of inventing one", () => {
    expect(formatEmploymentPeriod({ employed_to: "2026-08-19" })).toBe("No date ~ 2026.08.19");
  });

  it("still renders a placeholder when nothing is known", () => {
    // 렌더를 생략하면 "이 사람만 왜 기간이 없지?" 로 읽힌다 — 자리는 항상 보여준다.
    expect(formatEmploymentPeriod({})).toBe("No date ~");
    expect(formatEmploymentPeriod(undefined)).toBe("No date ~");
  });
});
