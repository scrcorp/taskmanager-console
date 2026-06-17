import { describe, it, expect } from "vitest";
import { hourOccupancy, slotOverlap, fmtTeam, isOn30Grid } from "@/components/schedules/redesign/scheduleStats";

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

describe("slotOverlap — 30분 슬롯 겹침 (daily 30분 정렬/카운트)", () => {
  // half=0 → slotStart=h, half=1 → slotStart=h+0.5. slotLen=0.5(30분) 또는 1(시간 전체).
  it("첫 30분만 근무 → 첫 슬롯만 overlap>0", () => {
    expect(slotOverlap("09:00", "09:30", 9, 0.5)).toBeGreaterThan(0);    // 첫 30분
    expect(slotOverlap("09:00", "09:30", 9.5, 0.5)).toBe(0);             // 둘째 30분 (없음)
  });

  it("둘째 30분만 근무 → 둘째 슬롯만 overlap>0", () => {
    expect(slotOverlap("09:30", "10:00", 9, 0.5)).toBe(0);              // 첫 30분 (없음)
    expect(slotOverlap("09:30", "10:00", 9.5, 0.5)).toBeGreaterThan(0); // 둘째 30분
  });

  it("한 시간 전부 근무 → 두 30분 슬롯 모두 overlap>0", () => {
    expect(slotOverlap("09:00", "10:00", 9, 0.5)).toBe(0.5);
    expect(slotOverlap("09:00", "10:00", 9.5, 0.5)).toBe(0.5);
  });

  it("슬롯 밖이면 0", () => {
    expect(slotOverlap("10:00", "12:00", 9, 0.5)).toBe(0);
    expect(slotOverlap("10:00", "12:00", 9.5, 0.5)).toBe(0);
  });

  it("overnight: 22:30~01:30 은 자정 넘는 30분 슬롯과 겹침", () => {
    expect(slotOverlap("22:30", "01:30", 22.5, 0.5)).toBe(0.5);  // 22:30 첫 슬롯
    expect(slotOverlap("22:30", "01:30", 24, 0.5)).toBe(0.5);    // 00:00 next day
    expect(slotOverlap("22:30", "01:30", 25, 0.5)).toBe(0.5);    // 01:00 next day
    expect(slotOverlap("22:30", "01:30", 25.5, 0.5)).toBe(0);    // 01:30 — 끝
  });

  it("slotLen=1 (sortHalf===null 시간 전체) → 구버전 풀시간 동작과 일치", () => {
    // 시간 전체 정렬 호환: [hour, hour+1) 와 겹치면 매치.
    expect(slotOverlap("09:30", "10:00", 9, 1)).toBeGreaterThan(0);  // 시간 안 어디든 걸치면 매치
    expect(slotOverlap("09:00", "09:30", 9, 1)).toBeGreaterThan(0);
    expect(slotOverlap("11:00", "12:00", 9, 1)).toBe(0);            // 밖이면 0
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
