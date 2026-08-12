/**
 * API 에러 **표시기** — 파싱된 봉투를 "무엇을 어디에 띄울지"로 바꾼다.
 *
 * 파서(`apiError.ts`)와 표시기를 나눈 이유: 파서는 3 저장소가 같은 계약을 읽어야 하므로
 * 공유 가능한 순수 로직이고, **문구는 앱마다 다르다**(콘솔은 폼 중심, HTMA 는 키오스크).
 * 계약 결정 E2-b — "파서만 공유, 문구는 앱별".
 *
 * 두 가지 철칙
 * ------------
 * 1. **`code_source === "status"` 이면 코드→문구 매핑을 하지 않는다.** `BAD_REQUEST` 는
 *    서버의 666가지 서로 다른 문장에 붙는 자리표시자라, 여기에 "Bad request." 하나를
 *    매핑하면 지금보다 정보가 줄어든다. 그럴 땐 서버 `message` 를 그대로 띄운다.
 * 2. **모르는 코드는 문구를 지어내지 않는다.** 서버 `message` 를 쓰고, 그것도 없으면
 *    코드 자체를 보여주며 `reference`(코드 · trace id)를 노출해 신고 가능하게 만든다.
 *    (참조 구현 `scheduleCodes.ts` / `schedule_codes.py:_FALLBACK` 과 같은 원칙.)
 */

import { CLIENT_ERROR_CODES, parseApiErrorEnvelope, type ParsedApiError } from "@/lib/apiError";

/** 어디에 띄우는가. */
export type ErrorPlacement =
  /** 폼 필드 옆 — 입력을 고쳐야 하는 실패. */
  | "inline"
  /** 가벼운 알림 — 되돌릴 것 없는 단발 액션 실패. */
  | "toast"
  /** 화면 상단 배너 — 화면 전체가 못 쓰는 상태(로드 실패, 서버 장애, 세션 만료). */
  | "banner";

/** 무슨 상황에서 났는가. 기본 배치를 정한다. */
export type ErrorContext =
  /** 폼 제출 */
  | "form"
  /** 버튼 한 번짜리 액션 */
  | "action"
  /** 데이터 로드 */
  | "load";

const CONTEXT_PLACEMENT: Record<ErrorContext, ErrorPlacement> = {
  form: "inline",
  action: "toast",
  load: "banner",
};

/**
 * 상황과 무관하게 배너로 올려야 하는 코드.
 *
 * 폼 옆 작은 빨간 글씨로 "서버가 죽었다"를 알리면 사용자는 입력을 계속 고치려 든다.
 * 화면 전체가 못 쓰는 상태는 화면 전체 크기로 말해야 한다.
 */
const ALWAYS_BANNER: ReadonlySet<string> = new Set([
  "INTERNAL_ERROR",
  "SERVICE_UNAVAILABLE",
  "UNAUTHORIZED",
  CLIENT_ERROR_CODES.NETWORK_OFFLINE,
  CLIENT_ERROR_CODES.NETWORK_UNREACHABLE,
  CLIENT_ERROR_CODES.CONNECTION_REFUSED,
  CLIENT_ERROR_CODES.REQUEST_TIMEOUT,
]);

/** `reference`(코드·trace id)를 반드시 보여줘야 하는 코드 — 사용자가 신고할 수단이 이것뿐이다. */
const ALWAYS_SHOW_REFERENCE: ReadonlySet<string> = new Set(["INTERNAL_ERROR", "HTTP_ERROR"]);

/**
 * 콘솔이 아는 도메인 코드의 문구.
 *
 * **여기 없는 코드에 문구를 지어내 채우지 말 것.** 서버가 보내는 `message` 가 이미 정본이고,
 * 여기 항목은 "서버 문장보다 콘솔 맥락에 맞는 안내가 따로 있는 경우"만이다.
 * 지금 등재된 두 건은 기존 화면에서 쓰던 문장을 그대로 옮긴 것이다(새로 지은 문구 아님).
 */
export const DOMAIN_COPY: Record<string, { message: string; hint?: string }> = {
  pin_conflict: {
    message: "This PIN is already in use by another employee.",
    hint: "Try a different number.",
  },
  access_code_taken: {
    message: "This code is already used by another organization.",
    hint: "Choose a different code.",
  },
};

export interface ErrorDisplay {
  /** 본문 — 원인 한 문장. */
  message: string;
  /** 다음 행동. 없으면 null. */
  hint: string | null;
  /** `"INTERNAL_ERROR · 01J9F3K2QW"` — 신고용 회색 한 줄. 필요 없으면 null. */
  reference: string | null;
  placement: ErrorPlacement;
  code: string;
  traceId: string | null;
  /** 콘솔이 이 코드의 의미를 아는가. false 면 문구를 지어내지 않았다는 뜻. */
  known: boolean;
  /** 파서 결과 원본 — 화면이 `params`/`warnings` 를 직접 쓸 때. */
  parsed: ParsedApiError;
}

export interface DescribeOptions {
  context: ErrorContext;
  /** 서버도 콘솔도 할 말이 없을 때의 최후 문장. */
  fallback?: string;
  /** 배치를 강제한다 (모달 안 등 컨테이너가 이미 정해진 경우). */
  placement?: ErrorPlacement;
}

const DEFAULT_FALLBACK = "Unexpected error";

/**
 * 에러 → 화면에 띄울 것.
 *
 * `err` 는 axios 에러든 무엇이든 상관없다 — 파싱은 파서가 한다.
 */
export function describeApiError(err: unknown, options: DescribeOptions): ErrorDisplay {
  const parsed = parseApiErrorEnvelope(err);
  const fallback = options.fallback ?? DEFAULT_FALLBACK;

  const copy = parsed.codeSource === "domain" ? DOMAIN_COPY[parsed.code] : undefined;
  const known = parsed.codeSource !== "domain" || copy !== undefined;

  let message = copy?.message ?? parsed.message;
  if (!message) message = fallback;
  else if (parsed.appendFallback) message = `${message} ${fallback}`;

  const hint = parsed.hint ?? copy?.hint ?? null;

  // reference 노출 조건 — 500/알 수 없는 코드. 아는 코드까지 붙이면 화면이 시끄러워지고
  // 정작 중요한 500 의 신고 단서가 묻힌다.
  const needsReference =
    ALWAYS_SHOW_REFERENCE.has(parsed.code) ||
    (parsed.status !== null && parsed.status >= 500) ||
    !known;
  const reference = needsReference
    ? parsed.traceId
      ? `${parsed.code} · ${parsed.traceId}`
      : parsed.code
    : null;

  const placement =
    options.placement ??
    (ALWAYS_BANNER.has(parsed.code) ? "banner" : CONTEXT_PLACEMENT[options.context]);

  return {
    message,
    hint,
    reference,
    placement,
    code: parsed.code,
    traceId: parsed.traceId,
    known,
    parsed,
  };
}

/**
 * 모달/토스트 본문 한 덩어리 — 문구 + 힌트 + 신고용 참조를 개행으로 잇는다.
 *
 * 기존 결과 모달(`useMutationResult`)이 문자열 하나만 받으므로, 그 경로에서 trace_id 를
 * 잃지 않으려면 이 형태가 필요하다. 새 화면은 `ErrorDisplay` 를 직접 렌더하는 편이 낫다.
 */
export function formatErrorText(display: ErrorDisplay): string {
  const parts = [display.message];
  if (display.hint) parts.push(display.hint);
  if (display.reference) parts.push(display.reference);
  return parts.join("\n");
}
