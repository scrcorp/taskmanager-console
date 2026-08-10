import { describe, it, expect } from "vitest";
import { historyStamp, historyValue } from "@/lib/compactHistory";

const LA = "America/Los_Angeles";

describe("historyValue", () => {
  it("moves a UTC instant into the store timezone before cutting HH:MM", () => {
    // 실제로 났던 오류: 매장 20:50 에 찍은 clock-in 이 03:50 으로 보였다 (UTC 를 그대로 잘라서).
    expect(historyValue("2026-08-10T03:50:00Z", LA)).toBe("20:50");
  });

  it("handles a numeric offset the same way", () => {
    expect(historyValue("2026-08-10T03:50:00+00:00", LA)).toBe("20:50");
  });

  it("leaves an offset-less wall clock alone — it is already store time", () => {
    expect(historyValue("2026-08-09T21:00", LA)).toBe("21:00");
    expect(historyValue("2026-08-09T21:00:00", LA)).toBe("21:00");
  });

  it("turns the server sentinels into words", () => {
    expect(historyValue("(none)", LA)).toBe("—");
    expect(historyValue("(cleared)", LA)).toBe("—");
    expect(historyValue("(set)", LA)).toBe("Set");
    expect(historyValue(null, LA)).toBe("—");
  });

  it("passes non-datetime codes through untouched", () => {
    expect(historyValue("clocked_out", LA)).toBe("clocked_out");
  });
});

describe("historyStamp", () => {
  it("reads the record time in the store timezone, not the browser one", () => {
    expect(historyStamp("2026-08-10T03:53:00Z", LA)).toBe("Aug 9, 8:53 PM");
  });

  it("returns the raw string when it cannot be parsed", () => {
    expect(historyStamp("not-a-date", LA)).toBe("not-a-date");
  });
});
