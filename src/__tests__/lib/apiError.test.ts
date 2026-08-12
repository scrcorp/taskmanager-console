/**
 * 파서 테스트 — 봉투 계약(후보 B)과 **구버전 서버 폴백**을 둘 다 고정한다.
 *
 * 레거시 문자열 보존 테스트가 많은 이유: `parseApiError` 는 48개 호출처가 화면에 그대로
 * 띄우는 문장을 만든다. 내부를 새 파서로 갈아끼우면서 문장이 바뀌면 조용한 UX 회귀가 된다.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import {
  CLIENT_ERROR_CODES,
  domainCode,
  parseApiErrorEnvelope,
  statusCode,
} from "@/lib/apiError";
import { parseApiError } from "@/lib/utils";

/** axios 에러 흉내 — 응답 있음. */
function httpError(status: number, data?: unknown, headers?: Record<string, string>) {
  return { isAxiosError: true, response: { status, data, headers } };
}

/** axios 에러 흉내 — 응답 없음(네트워크). */
function netError(code: string) {
  return { isAxiosError: true, code };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("parseApiErrorEnvelope — 봉투(정본)", () => {
  it("문자열 detail 이었던 400 — code_source=status, detail 은 그대로", () => {
    const p = parseApiErrorEnvelope(
      httpError(400, {
        detail: "Break end must be after break start.",
        error: {
          code: "BAD_REQUEST",
          code_source: "status",
          message: "Break end must be after break start.",
          hint: null,
          params: {},
          trace_id: "01J9F3K2QW",
        },
      }),
    );
    expect(p.origin).toBe("envelope");
    expect(p.code).toBe("BAD_REQUEST");
    expect(p.codeSource).toBe("status");
    expect(p.message).toBe("Break end must be after break start.");
    expect(p.hint).toBeNull();
    expect(p.traceId).toBe("01J9F3K2QW");
    expect(p.status).toBe(400);
  });

  it("도메인 코드 + params — 부가필드가 params 로 정규화된다", () => {
    const p = parseApiErrorEnvelope(
      httpError(409, {
        detail: {
          code: "early_clock_in_reason_required",
          minutes_early: 23,
          message: "Clocking in early requires a reason.",
        },
        error: {
          code: "early_clock_in_reason_required",
          code_source: "domain",
          message: "Clocking in early requires a reason.",
          params: { minutes_early: 23, schedule_id: "s1" },
          trace_id: "01J9F3K2QW",
        },
      }),
    );
    expect(p.codeSource).toBe("domain");
    expect(p.code).toBe("early_clock_in_reason_required");
    expect(p.params.minutes_early).toBe(23);
    expect(p.params.schedule_id).toBe("s1");
  });

  it("errors/warnings/retry 는 봉투 안에서도 최상위로 읽는다 (화이트리스트)", () => {
    const p = parseApiErrorEnvelope(
      httpError(409, {
        detail: { code: "SCHEDULE_WARNINGS_UNCONFIRMED" },
        error: {
          code: "SCHEDULE_WARNINGS_UNCONFIRMED",
          code_source: "domain",
          message: "This employee already has an overlapping schedule.",
          warnings: [{ code: "OVERLAPPING_SCHEDULE", params: { user_id: "u1" } }],
          retry: { force: true },
          trace_id: "T1",
        },
      }),
    );
    expect(p.warnings).toEqual([{ code: "OVERLAPPING_SCHEDULE", params: { user_id: "u1" } }]);
    expect(p.retry).toEqual({ force: true });
    // 화이트리스트 키는 params 로 내려가지 않는다.
    expect(p.params.warnings).toBeUndefined();
    expect(p.params.retry).toBeUndefined();
  });

  it("계약 밖 최상위 키는 params 로 흡수한다 (방어적)", () => {
    const p = parseApiErrorEnvelope(
      httpError(400, {
        error: { code: "X", code_source: "domain", message: "m", stray_field: 7 },
      }),
    );
    expect(p.params.stray_field).toBe(7);
  });

  it("code_source 가 이상하면 status 로 낮춰 읽는다 — 문구를 지어내지 않기 위해", () => {
    const p = parseApiErrorEnvelope(
      httpError(400, { error: { code: "X", code_source: "weird", message: "m" } }),
    );
    expect(p.codeSource).toBe("status");
  });

  it("500 봉투 — trace_id 가 실린다", () => {
    const p = parseApiErrorEnvelope(
      httpError(500, {
        detail: "Something went wrong on our side.",
        error: {
          code: "INTERNAL_ERROR",
          code_source: "status",
          message: "Something went wrong on our side.",
          hint: "Please try again.",
          trace_id: "01J9F3K2QW",
        },
      }),
    );
    expect(p.code).toBe("INTERNAL_ERROR");
    expect(p.traceId).toBe("01J9F3K2QW");
    expect(p.hint).toBe("Please try again.");
  });

  it("422 봉투 — detail 은 FastAPI 원형 배열, params.fields 가 정규화본", () => {
    const p = parseApiErrorEnvelope(
      httpError(422, {
        detail: [{ type: "int_parsing", loc: ["body", "n"], msg: "bad", input: "x" }],
        error: {
          code: "VALIDATION_ERROR",
          code_source: "status",
          message: "Some fields are invalid. Please review your input.",
          params: { fields: [{ field: "n", reason: "int_parsing" }] },
          trace_id: "T",
        },
      }),
    );
    expect(p.code).toBe("VALIDATION_ERROR");
    expect(p.params.fields).toEqual([{ field: "n", reason: "int_parsing" }]);
  });
});

describe("parseApiErrorEnvelope — 구버전 서버 폴백(detail)", () => {
  it("문자열 detail", () => {
    const p = parseApiErrorEnvelope(httpError(400, { detail: "Nope." }));
    expect(p.origin).toBe("legacy");
    expect(p.message).toBe("Nope.");
    expect(p.code).toBe("BAD_REQUEST");
    expect(p.codeSource).toBe("status");
  });

  it('"Internal Server Error" 문자열은 정보가 0이라 status 경로로 넘긴다', () => {
    const p = parseApiErrorEnvelope(httpError(500, { detail: "Internal Server Error" }));
    expect(p.code).toBe("INTERNAL_ERROR");
    expect(p.message).toBe("Server error. Please try again in a moment.");
  });

  it("dict detail — code 는 도메인, 나머지 평탄 키는 params 로", () => {
    const p = parseApiErrorEnvelope(
      httpError(409, {
        detail: {
          code: "early_clock_in_reason_required",
          minutes_early: 23,
          message: "Clocking in early requires a reason.",
        },
      }),
    );
    expect(p.codeSource).toBe("domain");
    expect(p.params.minutes_early).toBe(23);
    expect(p.message).toBe("Clocking in early requires a reason.");
  });

  it("code 만 있고 message 가 없으면 코드 원문을 노출한다 (E1-d)", () => {
    const p = parseApiErrorEnvelope(httpError(400, { detail: { code: "username_taken" } }));
    expect(p.message).toBe("username_taken");
    expect(p.codeSource).toBe("domain");
  });

  it("422 원형 배열 → 문구 조인 + params.fields", () => {
    const p = parseApiErrorEnvelope(
      httpError(422, {
        detail: [{ type: "int_parsing", loc: ["body", "n"], msg: "bad" }],
      }),
    );
    expect(p.message).toBe("n: bad");
    expect(p.params.fields).toEqual([{ field: "n", reason: "int_parsing" }]);
  });

  it("응답 헤더 X-Request-Id 를 trace_id 로 쓴다 (봉투 이전 서버)", () => {
    const p = parseApiErrorEnvelope(
      httpError(500, { detail: "boom" }, { "x-request-id": "HDR123" }),
    );
    expect(p.traceId).toBe("HDR123");
  });

  it("커스텀 {error: 문자열, validation_errors} 모양은 봉투로 오인하지 않는다", () => {
    const p = parseApiErrorEnvelope(
      httpError(400, { error: "Import failed", validation_errors: ["a", "b", "c", "d"] }),
    );
    expect(p.origin).toBe("legacy");
    expect(p.message).toBe("Import failed — a; b; c (+1 more)");
  });
});

describe("parseApiErrorEnvelope — 응답 없음(네트워크)", () => {
  it("타임아웃", () => {
    const p = parseApiErrorEnvelope(netError("ECONNABORTED"));
    expect(p.code).toBe(CLIENT_ERROR_CODES.REQUEST_TIMEOUT);
    expect(p.codeSource).toBe("client");
  });

  it("ERR_NETWORK — 온라인이면 오프라인이라 단정하지 않는다", () => {
    vi.stubGlobal("navigator", { onLine: true });
    const p = parseApiErrorEnvelope(netError("ERR_NETWORK"));
    expect(p.code).toBe(CLIENT_ERROR_CODES.NETWORK_UNREACHABLE);
  });

  it("ERR_NETWORK — navigator.onLine 이 false 일 때만 오프라인", () => {
    vi.stubGlobal("navigator", { onLine: false });
    const p = parseApiErrorEnvelope(netError("ERR_NETWORK"));
    expect(p.code).toBe(CLIENT_ERROR_CODES.NETWORK_OFFLINE);
  });

  it("연결 거부", () => {
    expect(parseApiErrorEnvelope(netError("ECONNREFUSED")).code).toBe(
      CLIENT_ERROR_CODES.CONNECTION_REFUSED,
    );
  });

  it("취소는 실패가 아니다 — 코드만 붙고 문구는 비운다", () => {
    const p = parseApiErrorEnvelope(netError("ERR_CANCELED"));
    expect(p.code).toBe(CLIENT_ERROR_CODES.REQUEST_CANCELED);
    expect(p.message).toBe("");
  });

  it("axios 도 아닌 무언가", () => {
    expect(parseApiErrorEnvelope(new Error("x")).code).toBe(CLIENT_ERROR_CODES.CLIENT_ERROR);
    expect(parseApiErrorEnvelope(null).code).toBe(CLIENT_ERROR_CODES.CLIENT_ERROR);
    expect(parseApiErrorEnvelope("nope").code).toBe(CLIENT_ERROR_CODES.CLIENT_ERROR);
  });
});

describe("statusCode", () => {
  it("표에 있는 status", () => {
    expect(statusCode(404)).toBe("NOT_FOUND");
    expect(statusCode(422)).toBe("VALIDATION_ERROR");
  });
  it("미지 5xx 는 INTERNAL_ERROR, 그 외는 HTTP_ERROR", () => {
    expect(statusCode(502)).toBe("INTERNAL_ERROR");
    expect(statusCode(418)).toBe("HTTP_ERROR");
  });
});

describe("domainCode — status 일반 코드를 흘리지 않는다", () => {
  it("도메인 코드는 반환", () => {
    expect(domainCode(httpError(409, { detail: { code: "pin_conflict" } }))).toBe("pin_conflict");
  });

  it("봉투의 도메인 코드도 반환", () => {
    expect(
      domainCode(httpError(409, { error: { code: "pin_conflict", code_source: "domain" } })),
    ).toBe("pin_conflict");
  });

  it("status 기반 일반 코드는 undefined — 기존 분기 전제를 지킨다", () => {
    expect(
      domainCode(httpError(400, { error: { code: "BAD_REQUEST", code_source: "status" } })),
    ).toBeUndefined();
    expect(domainCode(httpError(400, { detail: "plain string" }))).toBeUndefined();
    expect(domainCode(netError("ERR_NETWORK"))).toBeUndefined();
  });
});

describe("parseApiError — 레거시 문자열 반환 보존", () => {
  const cases: Array<[string, unknown, string]> = [
    ["문자열 detail", httpError(400, { detail: "Nope." }), "Nope."],
    [
      "배열 detail",
      httpError(422, { detail: [{ loc: ["body", "n"], msg: "bad" }] }),
      "n: bad",
    ],
    ["object detail.message", httpError(400, { detail: { message: "Msg." } }), "Msg."],
    ["최상위 message", httpError(400, { message: "Top." }), "Top."],
    ["401", httpError(401, {}), "Your session has expired. Please log in again."],
    ["403", httpError(403, {}), "You don't have permission for this action."],
    ["404", httpError(404, {}), "The requested item was not found. It may have been deleted."],
    ["408", httpError(408, {}), "Request timed out. Please try again."],
    ["409", httpError(409, {}), "Conflict — this action couldn't be applied to the current state."],
    ["413", httpError(413, {}), "Upload is too large. Please reduce the file size and retry."],
    ["422", httpError(422, {}), "Some fields are invalid. Please review your input."],
    ["429", httpError(429, {}), "Too many requests. Please wait a moment and try again."],
    ["500", httpError(500, {}), "Server error. Please try again in a moment."],
    ["ECONNABORTED", netError("ECONNABORTED"), "Server not responding. Please try again."],
    [
      "ECONNREFUSED",
      netError("ECONNREFUSED"),
      "The server refused the connection. The service may be down — please try again shortly.",
    ],
  ];

  it.each(cases)("%s", (_name, err, expected) => {
    expect(parseApiError(err, "FB")).toBe(expected);
  });

  it("미지 status 는 fallback 을 뒤에 붙인다 (예전 동작)", () => {
    expect(parseApiError(httpError(418, {}), "FB")).toBe("Request failed (HTTP 418). FB");
  });

  it("아무것도 못 읽으면 fallback", () => {
    expect(parseApiError(new Error("x"), "FB")).toBe("FB");
    expect(parseApiError(netError("ERR_CANCELED"), "FB")).toBe("FB");
  });

  it("봉투가 오면 봉투의 message 를 쓴다", () => {
    expect(
      parseApiError(
        httpError(400, {
          detail: "legacy mirror",
          error: { code: "BAD_REQUEST", code_source: "status", message: "canonical" },
        }),
        "FB",
      ),
    ).toBe("canonical");
  });
});
