/**
 * 리포트 가시성 403(`REPORT_NOT_VISIBLE`) 이 화면에 "없음" 으로 뭉개지지 않는지.
 *
 * 상세 페이지는 데이터가 없으면 무조건 "not found" 를 띄우고 있었다. 직급 가시성이
 * 들어오면서 **못 여는 이유의 대부분이 403** 이 되므로, 그대로 두면 사용자는 사라진
 * 리포트를 찾아 헤맨다(발생 에러 ≠ 표시 에러).
 *
 * 페이지는 `describeApiError` 로 문구를 만든다 — 여기서 그 계약을 고정한다.
 */
import { describe, it, expect } from "vitest";
import { describeApiError } from "@/lib/errorDisplay";

/** 서버가 실제로 내려주는 봉투 (server/app/core/error_codes/reports.py) */
function forbiddenError(): unknown {
  return {
    response: {
      status: 403,
      data: {
        detail: {
          code: "REPORT_NOT_VISIBLE",
          message: "You do not have access to this report.",
          hint: "Only the author and higher-ranked managers can open it.",
        },
        error: {
          code: "REPORT_NOT_VISIBLE",
          code_source: "domain",
          message: "You do not have access to this report.",
          hint: "Only the author and higher-ranked managers can open it.",
          params: {},
          trace_id: "T0TEST0001",
        },
      },
      headers: {},
    },
  };
}

describe("REPORT_NOT_VISIBLE 화면 문구", () => {
  it("서버의 원인 문장과 다음 행동을 그대로 쓴다 (fallback 으로 대체하지 않는다)", () => {
    const d = describeApiError(forbiddenError(), {
      context: "load",
      fallback: "Daily report not found.",
    });
    expect(d.code).toBe("REPORT_NOT_VISIBLE");
    expect(d.message).toBe("You do not have access to this report.");
    expect(d.hint).toBe("Only the author and higher-ranked managers can open it.");
    // 상세 페이지가 만드는 최종 한 줄
    expect([d.message, d.hint].filter(Boolean).join(" ")).not.toContain("not found");
  });

  it("에러가 없을 때(진짜 없는 id)는 fallback 문구가 남는다", () => {
    const d = describeApiError(undefined, {
      context: "load",
      fallback: "Daily report not found.",
    });
    expect(d.message).toBe("Daily report not found.");
  });
});
