import { describe, it, expect } from "vitest";
import {
  SCHEDULE_STEP_MINUTES, isOnScheduleGrid, snapToStep, stepTimeOptions,
  wrapMinutes, minToTime, formatWallClock,
  withStart, withEnd, withDuration, endOf,
  dayStartFor, dawnStartOffset,
} from "@/lib/scheduleTime";

describe("입력 단위 (D6-1)", () => {
  it("5분 하나다 — 30분 잔존이 있으면 여기서 깨진다", () => {
    expect(SCHEDULE_STEP_MINUTES).toBe(5);
  });
  it.each(["00:00", "09:05", "23:55", "12:30"])("on-grid %s 통과", (t) => {
    expect(isOnScheduleGrid(t)).toBe(true);
  });
  it.each(["09:07", "09:01", "00:43"])("off-grid %s 거부", (t) => {
    expect(isOnScheduleGrid(t)).toBe(false);
  });
  it("null/빈값은 통과 (미입력은 여기서 판정하지 않음)", () => {
    expect(isOnScheduleGrid(null)).toBe(true);
    expect(isOnScheduleGrid("")).toBe(true);
  });
  it("자동 계산 값만 스냅한다", () => {
    expect(snapToStep("09:07")).toBe("09:05");
    expect(snapToStep("09:08")).toBe("09:10");
  });
  it("옵션 목록은 5분 간격 하루치", () => {
    const opts = stepTimeOptions();
    expect(opts.length).toBe(288);
    expect(opts[1]).toBe("00:05");
    expect(opts.at(-1)).toBe("23:55");
  });
});

describe("자정 넘김 표기 (D5-1 / D2-8)", () => {
  it("24 이상은 감아서 벽시계로만 만든다 — 26:00 같은 표기를 만들지 않는다", () => {
    expect(minToTime(1560)).toBe("02:00");
    expect(wrapMinutes(-60)).toBe(1380);
  });
  it("오프셋은 +N 마커로 붙는다", () => {
    expect(formatWallClock("02:00", 1)).toBe("02:00 +1");
    expect(formatWallClock("17:00", 0)).toBe("17:00");
  });
});

describe("시작 / 종료 / 길이 3필드 갱신 규칙 (D5-2)", () => {
  const base = { startMin: 11 * 60, durationMin: 330 }; // 11:00 + 5h30m → 16:30

  it("시작을 바꾸면 길이 유지, 종료가 따라 움직인다", () => {
    const next = withStart(base, 13 * 60);
    expect(next).toEqual({ startMin: 13 * 60, durationMin: 330 });
    expect(endOf(next)).toEqual({ time: "18:30", offsetDays: 0 });
  });

  it("종료를 바꾸면 시작은 그대로, 길이가 재계산된다", () => {
    const next = withEnd(base, 18 * 60);
    expect(next.startMin).toBe(base.startMin); // 시작은 절대 안 움직인다
    expect(next.durationMin).toBe(7 * 60);
  });

  it("길이를 바꾸면 시작은 그대로, 종료가 따라 움직인다", () => {
    const next = withDuration(base, 480);
    expect(next.startMin).toBe(base.startMin);
    expect(endOf(next)).toEqual({ time: "19:00", offsetDays: 0 });
  });

  it("종료가 시작보다 이르면 다음날로 본다 (+1)", () => {
    const next = withEnd({ startMin: 22 * 60, durationMin: 60 }, 2 * 60);
    expect(next.durationMin).toBe(4 * 60);
    expect(endOf(next)).toEqual({ time: "02:00", offsetDays: 1 });
  });

  it("종료 = 시작이면 0분 — 임의로 24h 로 만들지 않는다 (저장 시 ZERO_DURATION 이 잡는다)", () => {
    expect(withEnd(base, base.startMin).durationMin).toBe(0);
  });

  it("자정을 넘긴 시작 이동도 시작만 바뀐다 (+1d 새벽조 시작만 수정)", () => {
    const dawn = { startMin: 1 * 60, durationMin: 8 * 60 }; // 01:00 ~ 09:00
    const next = withStart(dawn, 0 * 60 + 30);
    expect(next).toEqual({ startMin: 30, durationMin: 8 * 60 });
    expect(endOf(next)).toEqual({ time: "08:30", offsetDays: 0 });
  });
});

describe("영업일 경계 / 소속 자동 판정 (D3-3)", () => {
  it("요일별 값이 있으면 그 요일 값, 없으면 all, 둘 다 없으면 기본 06:00", () => {
    // 2026-08-10 은 월요일
    expect(dayStartFor({ mon: "05:00", all: "07:00" }, "2026-08-10")).toBe("05:00");
    expect(dayStartFor({ all: "07:00" }, "2026-08-10")).toBe("07:00");
    expect(dayStartFor(null, "2026-08-10")).toBe("06:00");
  });
  it("경계 이전 새벽 시각은 달력상 +1일", () => {
    expect(dawnStartOffset("02:00", "06:00")).toBe(1);
    expect(dawnStartOffset("06:00", "06:00")).toBe(0);
    expect(dawnStartOffset("18:00", "06:00")).toBe(0);
  });
});
