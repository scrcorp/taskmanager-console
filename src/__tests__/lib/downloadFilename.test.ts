/**
 * lib/download — Content-Disposition 파일명 추출 + 클라이언트 생성 파일명.
 *
 * 파일명이 늘 같으면 받는 사람은 어떤 조건으로 뽑은 파일인지 알 수 없다.
 * 규칙은 서버(server/app/utils/download.py)와 같은 모양이어야 하므로 여기서
 * 형태를 고정한다 — 바꾸려면 서버 쪽 테스트도 같이 바뀌어야 한다.
 */

import { describe, it, expect, vi, afterEach } from "vitest";

import { buildExportFilename, filenameFromDisposition } from "@/lib/download";

describe("filenameFromDisposition", () => {
  it("filename* (UTF-8) 를 우선 쓰고 퍼센트 인코딩을 푼다", () => {
    const header =
      "attachment; filename=\"Staff_20260820-1352Z.xlsx\"; " +
      "filename*=UTF-8''Staff_%EA%B0%95%EB%82%A8_20260820-1352Z.xlsx";
    expect(filenameFromDisposition(header, "fallback.xlsx")).toBe(
      "Staff_강남_20260820-1352Z.xlsx",
    );
  });

  it("filename* 가 없으면 ASCII filename 을 쓴다", () => {
    expect(
      filenameFromDisposition('attachment; filename="Dashboard_20260820-1352Z.xlsx"', "f.xlsx"),
    ).toBe("Dashboard_20260820-1352Z.xlsx");
  });

  it("헤더가 없으면 fallback", () => {
    expect(filenameFromDisposition(undefined, "fallback.xlsx")).toBe("fallback.xlsx");
  });
});

describe("buildExportFilename", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function freezeClock(): void {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-20T13:52:30Z"));
  }

  it("{Kind}_{스코프}_{범위}_{받은시각} 순서", () => {
    freezeClock();
    expect(
      buildExportFilename({
        kind: "AttendanceSummary",
        scope: "Downtown",
        startDate: "2026-08-01",
        endDate: "2026-08-15",
      }),
    ).toBe("AttendanceSummary_Downtown_20260801-0815_20260820-1352Z.csv");
  });

  it("해가 다르면 끝 날짜도 연도까지", () => {
    freezeClock();
    expect(
      buildExportFilename({ kind: "X", startDate: "2025-12-30", endDate: "2026-01-02" }),
    ).toBe("X_20251230-20260102_20260820-1352Z.csv");
  });

  it("한글 매장명은 보존하고 공백만 제거", () => {
    freezeClock();
    expect(buildExportFilename({ kind: "X", scope: "서울 2호점" })).toBe(
      "X_서울2호점_20260820-1352Z.csv",
    );
  });

  it("스코프/범위가 없어도 받은시각은 붙는다", () => {
    freezeClock();
    expect(buildExportFilename({ kind: "X", ext: "xlsx" })).toBe(
      "X_20260820-1352Z.xlsx",
    );
  });

  it("파일명에 못 쓰는 문자는 '_' 로 접는다", () => {
    freezeClock();
    expect(buildExportFilename({ kind: "X", scope: "A/B:C" })).toBe(
      "X_A_B_C_20260820-1352Z.csv",
    );
  });
});
