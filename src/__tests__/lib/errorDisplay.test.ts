/**
 * 표시기 테스트 — "문구를 지어내지 않는다" 와 "trace_id 는 반드시 보인다" 를 고정한다.
 */
import { describe, it, expect } from "vitest";
import { describeApiError, formatErrorText } from "@/lib/errorDisplay";

function httpError(status: number, data?: unknown) {
  return { isAxiosError: true, response: { status, data } };
}

describe("배치(placement)", () => {
  it("맥락이 기본을 정한다 — 폼=inline / 액션=toast / 로드=banner", () => {
    const e = httpError(400, { detail: "Bad." });
    expect(describeApiError(e, { context: "form" }).placement).toBe("inline");
    expect(describeApiError(e, { context: "action" }).placement).toBe("toast");
    expect(describeApiError(e, { context: "load" }).placement).toBe("banner");
  });

  it("500 은 맥락과 무관하게 banner — 폼 옆 빨간 글씨로는 서버 장애를 못 알린다", () => {
    const e = httpError(500, {
      error: { code: "INTERNAL_ERROR", code_source: "status", message: "Oops.", trace_id: "T1" },
    });
    expect(describeApiError(e, { context: "form" }).placement).toBe("banner");
  });

  it("네트워크 실패도 banner", () => {
    expect(
      describeApiError({ isAxiosError: true, code: "ECONNABORTED" }, { context: "form" }).placement,
    ).toBe("banner");
  });

  it("placement 를 명시하면 그것이 이긴다", () => {
    expect(
      describeApiError(httpError(500, {}), { context: "form", placement: "inline" }).placement,
    ).toBe("inline");
  });
});

describe("문구 규칙", () => {
  it("code_source=status 면 코드→문구 매핑을 하지 않고 message 를 그대로 쓴다", () => {
    const d = describeApiError(
      httpError(400, {
        error: {
          code: "BAD_REQUEST",
          code_source: "status",
          message: "Break end must be after break start.",
        },
      }),
      { context: "form" },
    );
    expect(d.message).toBe("Break end must be after break start.");
    // status 코드는 "안다"로 취급 — 코드가 아니라 message 가 정보를 나른다.
    expect(d.known).toBe(true);
  });

  it("콘솔이 아는 도메인 코드는 콘솔 문구 + hint 를 쓴다", () => {
    const d = describeApiError(
      httpError(409, { detail: { code: "pin_conflict", message: "server wording" } }),
      { context: "form" },
    );
    expect(d.message).toBe("This PIN is already in use by another employee.");
    expect(d.hint).toBe("Try a different number.");
    expect(d.known).toBe(true);
  });

  it("모르는 도메인 코드 — 문구를 지어내지 않고 서버 message 를 쓰며 reference 를 노출", () => {
    const d = describeApiError(
      httpError(409, {
        error: {
          code: "SOME_NEW_CODE",
          code_source: "domain",
          message: "Server says this.",
          trace_id: "01J9F3K2QW",
        },
      }),
      { context: "action" },
    );
    expect(d.known).toBe(false);
    expect(d.message).toBe("Server says this.");
    expect(d.reference).toBe("SOME_NEW_CODE · 01J9F3K2QW");
  });

  it("모르는 코드에 message 도 없으면 코드 자체가 문구가 된다 (빈 화면 방지)", () => {
    const d = describeApiError(httpError(400, { detail: { code: "brand_new_code" } }), {
      context: "action",
    });
    expect(d.message).toBe("brand_new_code");
    expect(d.reference).toBe("brand_new_code");
  });

  it("서버 hint 가 콘솔 hint 보다 우선한다", () => {
    const d = describeApiError(
      httpError(409, {
        error: {
          code: "pin_conflict",
          code_source: "domain",
          message: "m",
          hint: "Server hint.",
        },
      }),
      { context: "form" },
    );
    expect(d.hint).toBe("Server hint.");
  });

  it("아무 정보도 없으면 fallback", () => {
    const d = describeApiError(new Error("x"), { context: "action", fallback: "Couldn't save." });
    expect(d.message).toBe("Couldn't save.");
  });
});

describe("trace_id 노출 — 사용자가 신고에 옮겨 적을 수 있어야 한다", () => {
  it("500 은 코드 · trace id 를 항상 보여준다", () => {
    const d = describeApiError(
      httpError(500, {
        error: {
          code: "INTERNAL_ERROR",
          code_source: "status",
          message: "Something went wrong on our side.",
          trace_id: "01J9F3K2QW",
        },
      }),
      { context: "load" },
    );
    expect(d.reference).toBe("INTERNAL_ERROR · 01J9F3K2QW");
    expect(d.traceId).toBe("01J9F3K2QW");
  });

  it("trace_id 가 없어도 코드는 보여준다 (구버전 서버)", () => {
    const d = describeApiError(httpError(500, { detail: "boom" }), { context: "load" });
    expect(d.reference).toBe("INTERNAL_ERROR");
  });

  it("아는 4xx 는 reference 를 붙이지 않는다 — 500 단서가 묻히지 않도록", () => {
    const d = describeApiError(httpError(404, { detail: "Not found." }), { context: "load" });
    expect(d.reference).toBeNull();
  });

  it("formatErrorText 는 문구/힌트/참조를 개행으로 잇는다", () => {
    const d = describeApiError(
      httpError(500, {
        error: {
          code: "INTERNAL_ERROR",
          code_source: "status",
          message: "Oops.",
          hint: "Try again.",
          trace_id: "T1",
        },
      }),
      { context: "action" },
    );
    expect(formatErrorText(d)).toBe("Oops.\nTry again.\nINTERNAL_ERROR · T1");
  });
});

describe("parsed 노출", () => {
  it("params/warnings 를 화면이 직접 쓸 수 있다", () => {
    const d = describeApiError(
      httpError(409, {
        error: {
          code: "SCHEDULE_WARNINGS_UNCONFIRMED",
          code_source: "domain",
          message: "m",
          warnings: [{ code: "OVERLAPPING_SCHEDULE", params: {} }],
          retry: { force: true },
        },
      }),
      { context: "form" },
    );
    expect(d.parsed.warnings).toHaveLength(1);
    expect(d.parsed.retry).toEqual({ force: true });
  });
});
