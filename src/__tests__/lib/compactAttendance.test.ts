import { describe, it, expect } from "vitest";
import {
  displayTimes,
  extraAnomalies,
  hasIssue,
  suggestedClockInputs,
} from "@/lib/compactAttendance";
import { NOT_SET } from "@/lib/compactWeek";
import type { Attendance } from "@/types";

function make(overrides: Partial<Attendance>): Attendance {
  return {
    status: "clocked_out",
    anomalies: null,
    ...overrides,
  } as Attendance;
}

/** 테스트용 변환기 — ISO 앞 16자를 datetime-local 입력값으로 본다. */
const toInput = (iso: string | null): string => (iso ? iso.slice(0, 16) : "");

describe("hasIssue", () => {
  it("flags records carrying anomalies", () => {
    expect(hasIssue(make({ anomalies: ["auto_clocked_out"] }))).toBe(true);
  });

  it("flags no_show and late even without anomalies", () => {
    expect(hasIssue(make({ status: "no_show" }))).toBe(true);
    expect(hasIssue(make({ status: "late" }))).toBe(true);
  });

  it("does not flag normal records", () => {
    expect(hasIssue(make({ status: "working" }))).toBe(false);
    expect(hasIssue(make({ status: "clocked_out", anomalies: [] }))).toBe(false);
  });

  it("never flags cancelled records — there is nothing to act on", () => {
    expect(hasIssue(make({ status: "cancelled", anomalies: ["late"] }))).toBe(false);
  });
});

describe("displayTimes — 기록이 없으면 예정 시각으로 대신한다", () => {
  it("prefers actual clock times", () => {
    const t = displayTimes(
      make({
        clock_in_display: "09:03",
        clock_out_display: "17:10",
        scheduled_start_display: "09:00",
        scheduled_end_display: "17:00",
      }),
    );
    expect(t).toMatchObject({
      inText: "09:03",
      outText: "17:10",
      inIsScheduled: false,
      outIsScheduled: false,
    });
  });

  it("falls back to the scheduled time and marks it", () => {
    const t = displayTimes(
      make({ scheduled_start_display: "09:00", scheduled_end_display: "17:00" }),
    );
    expect(t).toMatchObject({
      inText: "09:00",
      outText: "17:00",
      inIsScheduled: true,
      outIsScheduled: true,
    });
  });

  it("mixes actual clock-in with scheduled clock-out (still working)", () => {
    const t = displayTimes(make({ clock_in_display: "09:03", scheduled_end_display: "17:00" }));
    expect(t.inIsScheduled).toBe(false);
    expect(t.outIsScheduled).toBe(true);
  });

  it("shows 'Not set' only when neither actual nor scheduled exists (dev 표기 규약)", () => {
    const t = displayTimes(make({}));
    expect(t.inText).toBe(NOT_SET);
    expect(t.outText).toBe(NOT_SET);
  });
});

describe("suggestedClockInputs — 정정 폼 초기값", () => {
  it("uses actual times when present and marks nothing as prefilled", () => {
    const s = suggestedClockInputs(
      make({
        clock_in: "2026-08-01T09:03:00",
        clock_out: "2026-08-01T17:10:00",
        scheduled_start: "2026-08-01T09:00:00",
        scheduled_end: "2026-08-01T17:00:00",
      }),
      toInput,
    );
    expect(s).toMatchObject({
      clockIn: "2026-08-01T09:03",
      clockOut: "2026-08-01T17:10",
      inPrefilled: false,
      outPrefilled: false,
    });
  });

  it("prefills a no-show from the scheduled shift", () => {
    const s = suggestedClockInputs(
      make({
        status: "no_show",
        scheduled_start: "2026-08-01T09:00:00",
        scheduled_end: "2026-08-01T17:00:00",
      }),
      toInput,
    );
    expect(s).toMatchObject({
      clockIn: "2026-08-01T09:00",
      clockOut: "2026-08-01T17:00",
      inPrefilled: true,
      outPrefilled: true,
    });
  });

  it("never proposes a clock-out for a shift still in progress", () => {
    for (const status of ["working", "on_break", "upcoming", "soon"] as const) {
      const s = suggestedClockInputs(
        make({
          status,
          clock_in: status === "working" ? "2026-08-01T09:00:00" : null,
          scheduled_start: "2026-08-01T09:00:00",
          scheduled_end: "2026-08-01T17:00:00",
        }),
        toInput,
      );
      expect(s.clockOut).toBe("");
      expect(s.outPrefilled).toBe(false);
    }
  });

  it("leaves fields empty when there is no schedule to borrow from", () => {
    const s = suggestedClockInputs(make({ status: "no_show" }), toInput);
    expect(s).toMatchObject({ clockIn: "", clockOut: "", inPrefilled: false, outPrefilled: false });
  });
});

describe("extraAnomalies — 배지와 중복되는 anomaly 제거", () => {
  it("drops the anomaly that merely repeats the status", () => {
    expect(extraAnomalies(make({ status: "no_show", anomalies: ["no_show"] }))).toEqual([]);
  });

  it("keeps anomalies that add information", () => {
    expect(
      extraAnomalies(make({ status: "clocked_out", anomalies: ["auto_clocked_out", "late"] })),
    ).toEqual(["auto_clocked_out", "late"]);
  });

  it("keeps the informative ones while dropping the duplicate", () => {
    expect(extraAnomalies(make({ status: "late", anomalies: ["late", "early_out"] }))).toEqual([
      "early_out",
    ]);
  });

  it("handles a missing anomalies array", () => {
    expect(extraAnomalies(make({ anomalies: null }))).toEqual([]);
  });
});
