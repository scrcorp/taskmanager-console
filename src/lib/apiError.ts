/**
 * API 에러 **파서** — 콘솔의 단일 진입점.
 *
 * 서버 봉투 계약(2026-08-11 "에러 처리 일원화 - 봉투 계약안", 후보 B)
 * ------------------------------------------------------------------
 *     {
 *       "detail": <원형 그대로 — 문자열이면 문자열, dict 였으면 그 dict 원형>,
 *       "error": {                       ← **정본(canonical)**
 *         "code": "UPPER_SNAKE",
 *         "code_source": "domain" | "status",
 *         "message": "사용자에게 보여줄 원인 한 문장",
 *         "hint": "다음 행동" | null,
 *         "params": { ... },
 *         "trace_id": "01J9F3K2QW"
 *       }
 *     }
 *
 * **`error` 가 정본이고 `detail` 은 읽기 전용 레거시 미러다.** 서버는 항상 `error` 를 먼저
 * 만들고 `detail` 을 그로부터 파생시킨다. 따라서 파서도 `error` 를 먼저 보고, 없을 때만
 * (= 구버전 서버) `detail` 경로로 폴백한다. 반대 방향으로 읽으면 나중에 `detail` 이
 * 사라질 때(계약 5단계) 조용히 정보가 줄어든다.
 *
 * 왜 `detail` 을 아직 지우지 않는가 — 구버전 HTMA(사이드로드 APK)가 `detail` 이 String 일
 * 때만 사유를 읽고, `detail.code` 로 분기하는 배포된 계약이 26개 있다. 서버가 `detail` 을
 * 건드리는 순간 조기 clock-in 과 스케줄 겹침 확인이 **기능 정지**한다. 콘솔 입장에서도
 * `detail` 은 여전히 유일한 정보원인 서버(미배포 환경)가 있으므로 폴백을 지우면 안 된다.
 *
 * 네트워크/타임아웃/CORS 실패도 **여기서 코드화**한다. 예전에는 화면마다 axios `code`
 * 문자열을 각자 추측했다(`ERR_NETWORK` 를 무조건 "오프라인"으로 단정하는 등).
 *
 * ⚠️ `trace_id` 이지 `request_id` 가 아니다 — 서버에 `schedules.request_id`(스케줄 변경요청 FK)가
 * 이미 있어 같은 응답 안에서 의미가 충돌한다. HTTP 헤더 이름만 관례대로 `X-Request-Id`.
 */

// ── 코드 상수 ───────────────────────────────────────────────

/**
 * 코드의 출처.
 *
 * - `domain` — 서버가 의미를 붙인 도메인 코드. **표시기가 코드로 문구를 구성해도 된다.**
 * - `status` — 도메인 코드가 아직 없어서 HTTP status/예외 클래스로 만든 일반 코드.
 *   **표시기는 코드→문구 매핑을 시도하면 안 되고 `message` 를 그대로 띄운다.**
 *   (`BAD_REQUEST` 666종에 "Bad request." 하나를 매핑하면 지금보다 정보가 줄어든다.)
 * - `client` — 서버 응답이 아예 없는 경우(네트워크/타임아웃/취소). 콘솔이 만든 코드.
 *   서버 계약에는 없는 값이며 서버는 절대 이 값을 보내지 않는다.
 */
export type ErrorCodeSource = "domain" | "status" | "client";

/** 응답 자체가 없을 때 콘솔이 붙이는 코드 (`code_source: "client"`). */
export const CLIENT_ERROR_CODES = {
  /** 기기가 오프라인 (navigator.onLine === false 로 확인됨). */
  NETWORK_OFFLINE: "NETWORK_OFFLINE",
  /** 서버에 닿지 못함 — CORS/DNS/SSL/서버다운 구분 불가. 오프라인이라 단정하지 않는다. */
  NETWORK_UNREACHABLE: "NETWORK_UNREACHABLE",
  /** 연결 자체가 거부됨. */
  CONNECTION_REFUSED: "CONNECTION_REFUSED",
  /** 클라이언트 타임아웃 (axios ECONNABORTED). */
  REQUEST_TIMEOUT: "REQUEST_TIMEOUT",
  /** 요청이 취소됨 (화면 이탈 등). 사용자에게 보여줄 실패가 아니다. */
  REQUEST_CANCELED: "REQUEST_CANCELED",
  /** 그 외 — axios 에러도 아니고 응답도 없는 무언가. */
  CLIENT_ERROR: "CLIENT_ERROR",
} as const;

/**
 * status → 일반 코드. 서버 봉투 계약의 고정표(11종)와 **같은 이름을 쓴다.**
 * 구버전 서버(봉투 없음) 응답에도 콘솔이 같은 코드를 붙일 수 있어야, 표시기가
 * 서버 배포 여부와 무관하게 한 가지 분기만 갖는다.
 */
const STATUS_CODES: Record<number, string> = {
  400: "BAD_REQUEST",
  401: "UNAUTHORIZED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  408: "REQUEST_TIMEOUT",
  409: "CONFLICT",
  410: "GONE",
  413: "PAYLOAD_TOO_LARGE",
  422: "VALIDATION_ERROR",
  429: "TOO_MANY_REQUESTS",
  500: "INTERNAL_ERROR",
  503: "SERVICE_UNAVAILABLE",
};

/** status 기반 일반 코드 (표에 없으면 5xx/4xx 로 뭉갠다). */
export function statusCode(status: number): string {
  const known = STATUS_CODES[status];
  if (known) return known;
  if (status >= 500) return "INTERNAL_ERROR";
  return "HTTP_ERROR";
}

/**
 * status → 기존 콘솔 문구. **`parseApiError` 의 반환값을 바이트 단위로 보존하기 위한 표**이므로
 * 문구를 임의로 손보지 말 것 (48개 호출처가 이 문장을 그대로 화면에 띄운다).
 */
const STATUS_MESSAGES: Record<number, string> = {
  401: "Your session has expired. Please log in again.",
  403: "You don't have permission for this action.",
  404: "The requested item was not found. It may have been deleted.",
  408: "Request timed out. Please try again.",
  409: "Conflict — this action couldn't be applied to the current state.",
  413: "Upload is too large. Please reduce the file size and retry.",
  422: "Some fields are invalid. Please review your input.",
  429: "Too many requests. Please wait a moment and try again.",
};

// ── 결과 타입 ───────────────────────────────────────────────

/** 검증 항목 하나 — 서버 `ScheduleIssue` 와 동일 형태(봉투에서도 최상위 유지). */
export interface ApiIssue {
  code: string;
  params: Record<string, unknown>;
}

export interface ParsedApiError {
  /** 항상 존재한다. 어떤 실패든 코드가 붙는 것이 봉투 계약의 핵심 가치다. */
  code: string;
  codeSource: ErrorCodeSource;
  /** 사용자에게 보여줄 원인 한 문장. 서버가 아무것도 안 줬으면 빈 문자열. */
  message: string;
  /** 다음 행동. 없으면 null. */
  hint: string | null;
  /**
   * 문구 조립용 파라미터.
   *
   * 화이트리스트 정규화 — `errors`/`warnings`/`retry`/`hint` 는 최상위로 올리고
   * 그 밖의 미지 키만 여기로 내린다. 구버전 서버의 평탄 dict(`minutes_early` 등)도
   * 여기로 모이므로 화면 코드는 서버 버전을 신경 쓰지 않아도 된다.
   */
  params: Record<string, unknown>;
  /** 사용자가 신고할 때 옮겨 적는 값. 봉투가 없으면 응답 헤더 `X-Request-Id`, 그것도 없으면 null. */
  traceId: string | null;
  /** HTTP status. 응답이 없었으면 null. */
  status: number | null;
  /** 차단 항목 (스케줄 D9 계약 등). 없으면 빈 배열. */
  errors: ApiIssue[];
  /** 확인 후 진행 가능한 항목. 없으면 빈 배열. */
  warnings: ApiIssue[];
  /** 재시도 방법 (예: `{force: true}`). 없으면 null. */
  retry: Record<string, unknown> | null;
  /** 어디서 읽었는가 — 진단·테스트용. 서버 봉투 배포 진척을 콘솔에서도 확인할 수 있다. */
  origin: "envelope" | "legacy" | "client";
  /**
   * 레거시 호환 전용 — `message` 뒤에 호출 측 fallback 을 이어 붙여야 하는가.
   * 예전 `parseApiError` 가 미지 status 에 대해 `Request failed (HTTP 418). <fallback>` 을
   * 돌려주고 있었기 때문에 그 한 가지 경우만 살린다. 새 코드에서는 쓰지 말 것.
   */
  appendFallback: boolean;
}

// ── 내부 유틸 ───────────────────────────────────────────────

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}

function issueList(raw: unknown): ApiIssue[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(isRecord)
    .filter((i) => typeof i.code === "string")
    .map((i) => ({ code: i.code as string, params: isRecord(i.params) ? i.params : {} }));
}

/** 봉투 `error` 안에서 최상위로 유지되는 키 — 나머지는 전부 `params` 로 내려간다. */
const ENVELOPE_RESERVED = new Set([
  "code",
  "code_source",
  "message",
  "hint",
  "params",
  "trace_id",
  "errors",
  "warnings",
  "retry",
]);

/** 구버전 dict `detail` 에서 `params` 로 내리지 않는 키. */
const LEGACY_RESERVED = new Set(["code", "message", "hint", "errors", "warnings", "retry"]);

function restParams(obj: Record<string, unknown>, reserved: Set<string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (!reserved.has(k)) out[k] = v;
  }
  return out;
}

/** FastAPI 422 원형 배열 → "field > sub: message" 조인. 기존 문구를 그대로 보존한다. */
function joinValidationDetail(detail: unknown[]): string {
  return detail
    .map((d) => {
      const rec = isRecord(d) ? d : {};
      const loc = Array.isArray(rec.loc) ? rec.loc.filter((l) => l !== "body").join(" > ") : "";
      const msg = typeof rec.msg === "string" ? rec.msg : "";
      return loc ? `${loc}: ${msg}` : msg;
    })
    .join(", ");
}

/** 422 원형 배열 → `params.fields` 정규화 (서버 봉투와 같은 모양). */
function validationFields(detail: unknown[]): Array<{ field: string; reason: string }> {
  return detail.filter(isRecord).map((d) => ({
    field: Array.isArray(d.loc) ? d.loc.filter((l) => l !== "body").join(".") : "",
    reason: typeof d.type === "string" ? d.type : "",
  }));
}

function empty(): ParsedApiError {
  return {
    code: CLIENT_ERROR_CODES.CLIENT_ERROR,
    codeSource: "client",
    message: "",
    hint: null,
    params: {},
    traceId: null,
    status: null,
    errors: [],
    warnings: [],
    retry: null,
    origin: "client",
    appendFallback: false,
  };
}

// ── 파서 본체 ───────────────────────────────────────────────

interface AxiosLike {
  response?: { data?: unknown; status?: number; headers?: unknown };
  code?: string;
}

/**
 * 무엇이 던져졌든 하나의 형태로 만든다.
 *
 * 순서가 중요하다 — **응답 본문을 네트워크 코드보다 먼저 본다.** CORS 헤더가 빠진 5xx 응답은
 * 서버가 분명히 답했는데도 axios 에러에 `ERR_NETWORK` 가 같이 붙는 경우가 있어서,
 * 순서를 뒤집으면 진짜 서버 사유가 "인터넷 확인하세요"로 덮인다.
 */
export function parseApiErrorEnvelope(error: unknown): ParsedApiError {
  if (!error || typeof error !== "object") return empty();

  const err = error as AxiosLike;
  const resp = "response" in err ? err.response : undefined;
  const data = resp?.data;
  const status = typeof resp?.status === "number" ? resp.status : null;

  // 헤더의 X-Request-Id — 봉투 이전 서버에서도 추적 단서가 될 수 있다.
  // (서버 CORS `expose_headers` 에 등록돼 있어야 브라우저 JS 가 읽을 수 있다.)
  const headers = isRecord(resp?.headers) ? resp.headers : undefined;
  const headerTrace = headers ? str(headers["x-request-id"]) ?? str(headers["X-Request-Id"]) : null;

  if (isRecord(data)) {
    // ── (1) 봉투 (정본) ────────────────────────────────────
    const env = data.error;
    if (isRecord(env) && typeof env.code === "string") {
      const rawSource = env.code_source;
      const codeSource: ErrorCodeSource =
        rawSource === "domain" || rawSource === "status" ? rawSource : "status";
      return {
        code: env.code,
        codeSource,
        message: str(env.message) ?? "",
        hint: str(env.hint),
        // 서버가 `params` 를 주더라도, 계약 밖 최상위 키가 섞여 오면 같이 흡수한다(방어적).
        params: { ...(isRecord(env.params) ? env.params : {}), ...restParams(env, ENVELOPE_RESERVED) },
        traceId: str(env.trace_id) ?? headerTrace,
        status,
        errors: issueList(env.errors),
        warnings: issueList(env.warnings),
        retry: isRecord(env.retry) ? env.retry : null,
        origin: "envelope",
        appendFallback: false,
      };
    }

    // ── (2) 구버전 서버 — `detail` 폴백 ────────────────────
    if ("detail" in data) {
      const detail = data.detail;

      // 2-a. 문자열 detail (666곳). "Internal Server Error" 는 정보가 0이라 status 경로로 넘긴다.
      const asString = str(detail);
      if (asString && asString !== "Internal Server Error") {
        return {
          ...empty(),
          code: status !== null ? statusCode(status) : "HTTP_ERROR",
          codeSource: "status",
          message: asString,
          traceId: headerTrace,
          status,
          origin: "legacy",
        };
      }

      // 2-b. 422 원형 배열
      if (Array.isArray(detail) && detail.length > 0) {
        return {
          ...empty(),
          code: "VALIDATION_ERROR",
          codeSource: "status",
          message: joinValidationDetail(detail),
          params: { fields: validationFields(detail) },
          traceId: headerTrace,
          status,
          origin: "legacy",
        };
      }

      // 2-c. dict detail (132곳 · 16가지 모양) — 배포된 코드 계약 26개가 여기 있다.
      if (isRecord(detail)) {
        const code = str(detail.code);
        return {
          code: code ?? (status !== null ? statusCode(status) : "HTTP_ERROR"),
          // 코드가 있으면 도메인 코드다. 서버가 문자열→코드 추론을 하지 않듯 콘솔도 하지 않는다.
          codeSource: code ? "domain" : "status",
          // code 만 있고 message 가 없는 59곳 — 코드 원문을 노출한다(참조 구현 `_FALLBACK` 규칙).
          // 일반 문구("Bad request.")를 끼워 넣으면 아무도 그 59곳을 고치지 않는다.
          message: str(detail.message) ?? (code ?? ""),
          hint: str(detail.hint),
          params: restParams(detail, LEGACY_RESERVED),
          traceId: headerTrace,
          status,
          errors: issueList(detail.errors),
          warnings: issueList(detail.warnings),
          retry: isRecord(detail.retry) ? detail.retry : null,
          origin: "legacy",
          appendFallback: false,
        };
      }
    }

    // ── (3) 봉투 밖 커스텀 모양 ────────────────────────────
    // 일부 엔드포인트(재고 import 등)가 `{error: "문장", validation_errors: [...]}` 를 쓴다.
    // 봉투의 `error`(object)와 키 이름이 겹치므로 **문자열일 때만** 이 경로다.
    if (typeof data.error === "string") {
      const ve = data.validation_errors;
      let message = data.error;
      if (Array.isArray(ve) && ve.length > 0) {
        const head = ve.slice(0, 3).map(String).join("; ");
        const more = ve.length > 3 ? ` (+${ve.length - 3} more)` : "";
        message = `${message} — ${head}${more}`;
      }
      return {
        ...empty(),
        code: status !== null ? statusCode(status) : "HTTP_ERROR",
        codeSource: "status",
        message,
        params: Array.isArray(ve) ? { validation_errors: ve } : {},
        traceId: headerTrace,
        status,
        origin: "legacy",
      };
    }

    if (typeof data.message === "string") {
      return {
        ...empty(),
        code: status !== null ? statusCode(status) : "HTTP_ERROR",
        codeSource: "status",
        message: data.message,
        traceId: headerTrace,
        status,
        origin: "legacy",
      };
    }
  }

  // ── (4) 쓸 만한 본문이 없다 — status 만으로 ──────────────
  if (status !== null) {
    const known = STATUS_MESSAGES[status];
    if (known) {
      return {
        ...empty(),
        code: statusCode(status),
        codeSource: "status",
        message: known,
        traceId: headerTrace,
        status,
        origin: "legacy",
      };
    }
    if (status >= 500) {
      return {
        ...empty(),
        code: statusCode(status),
        codeSource: "status",
        message: "Server error. Please try again in a moment.",
        traceId: headerTrace,
        status,
        origin: "legacy",
      };
    }
    return {
      ...empty(),
      code: statusCode(status),
      codeSource: "status",
      message: `Request failed (HTTP ${status}).`,
      traceId: headerTrace,
      status,
      origin: "legacy",
      appendFallback: true,
    };
  }

  // ── (5) 응답 자체가 없다 — 네트워크/타임아웃/취소 ────────
  const axiosCode = typeof err.code === "string" ? err.code : null;
  if (axiosCode === "ECONNABORTED") {
    return {
      ...empty(),
      code: CLIENT_ERROR_CODES.REQUEST_TIMEOUT,
      message: "Server not responding. Please try again.",
    };
  }
  if (axiosCode === "ERR_NETWORK") {
    // ERR_NETWORK 는 offline / CORS / DNS / SSL / 서버다운에서 모두 난다.
    // navigator.onLine 이 false 일 때만 오프라인이라 말한다 — 아니면 사용자를 오해시킨다.
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      return {
        ...empty(),
        code: CLIENT_ERROR_CODES.NETWORK_OFFLINE,
        message: "Your device appears to be offline. Reconnect and try again.",
      };
    }
    return {
      ...empty(),
      code: CLIENT_ERROR_CODES.NETWORK_UNREACHABLE,
      message:
        "Cannot reach the server. The service may be temporarily unavailable — please try again shortly.",
    };
  }
  if (axiosCode === "ECONNREFUSED") {
    return {
      ...empty(),
      code: CLIENT_ERROR_CODES.CONNECTION_REFUSED,
      message: "The server refused the connection. The service may be down — please try again shortly.",
    };
  }
  if (axiosCode === "ERR_CANCELED") {
    // 취소는 실패가 아니다. 코드만 붙이고 문구는 비운다 — 호출 측 fallback 이 그대로 쓰인다
    // (기존 동작 보존).
    return { ...empty(), code: CLIENT_ERROR_CODES.REQUEST_CANCELED };
  }

  return empty();
}

/**
 * 도메인 코드만 반환한다 (`code_source === "domain"`).
 *
 * status 기반 일반 코드(`BAD_REQUEST` 등)를 같이 흘리면, `getErrorCode(err) === "pin_conflict"`
 * 류의 기존 분기 옆에서 "코드가 있다 = 도메인 계약이다"라는 전제가 깨진다.
 */
export function domainCode(error: unknown): string | undefined {
  const parsed = parseApiErrorEnvelope(error);
  return parsed.codeSource === "domain" ? parsed.code : undefined;
}
