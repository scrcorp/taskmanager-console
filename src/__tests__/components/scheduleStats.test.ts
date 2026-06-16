import { describe, it, expect } from "vitest";
import { hourOccupancy, fmtTeam, isOn30Grid } from "@/components/schedules/redesign/scheduleStats";

describe("hourOccupancy — 일간 0.5인 환산", () => {
  it("한 시간 전부 일하면 1.0", () => {
    expect(hourOccupancy("10:00", "12:00", 10)).toBe(1);
    expect(hourOccupancy("10:00", "12:00", 11)).toBe(1);
  });

  it("30분만 걸치면 0.5 (시작이 :30)", () => {
    expect(hourOccupancy("09:30", "12:00", 9)).toBe(0.5);
  });

  it("30분만 걸치면 0.5 (종료가 :30)", () => {
    expect(hourOccupancy("10:00", "12:30", 12)).toBe(0.5);
  });

  it("슬롯 밖이면 0", () => {
    expect(hourOccupancy("10:00", "12:00", 9)).toBe(0);
    expect(hourOccupancy("10:00", "12:00", 12)).toBe(0);
  });

  it("overnight: 22:00~02:00 은 자정 넘는 시간 슬롯(24,25)을 채움", () => {
    expect(hourOccupancy("22:00", "02:00", 22)).toBe(1);
    expect(hourOccupancy("22:00", "02:00", 24)).toBe(1); // 0:00 next day
    expect(hourOccupancy("22:00", "02:00", 25)).toBe(1); // 1:00 next day
    expect(hourOccupancy("22:00", "02:00", 26)).toBe(0); // 2:00 — 끝
  });
});

describe("fmtTeam — TEAM 표시", () => {
  it("정수는 정수로", () => {
    expect(fmtTeam(0)).toBe("0");
    expect(fmtTeam(3)).toBe("3");
  });
  it("반은 x.5", () => {
    expect(fmtTeam(0.5)).toBe("0.5");
    expect(fmtTeam(2.5)).toBe("2.5");
  });
  it("off-grid 소수는 가까운 0.5로 스냅", () => {
    expect(fmtTeam(0.33)).toBe("0.5");
    expect(fmtTeam(1.2)).toBe("1");
  });
});

describe("isOn30Grid — 30분 검증", () => {
  it.each(["00:00", "09:30", "23:30", "12:00"])("on-grid %s 통과", (t) => {
    expect(isOn30Grid(t)).toBe(true);
  });
  it.each(["09:17", "09:15", "09:01", "00:45"])("off-grid %s 거부", (t) => {
    expect(isOn30Grid(t)).toBe(false);
  });
  it("null/빈값 통과", () => {
    expect(isOn30Grid(null)).toBe(true);
    expect(isOn30Grid("")).toBe(true);
  });
});
