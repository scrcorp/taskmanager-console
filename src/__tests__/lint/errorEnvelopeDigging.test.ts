/**
 * 래칫 — **에러 봉투를 손으로 파헤치는 코드는 늘어날 수 없다.** CI 에서 실패한다.
 *
 * 승인된 입구는 셋뿐이다:
 *   - `parseApiError(err, fallback)`      → 사람이 읽을 문장 (src/lib/apiError.ts)
 *   - `parseApiErrorEnvelope(err)`        → `{ code, message, hint, params, … }` (src/lib/apiError.ts)
 *   - `describeApiError(err, { context })` → 표시 위치까지 정한 결과 (src/lib/errorDisplay.ts)
 *
 * 왜 래칫인가: 문서·규칙·메모리는 읽고 무시할 수 있다. 그래서 **세어두고, 늘면 터지게** 한다.
 * 봉투의 `detail` 은 구버전 서버/구버전 클라 때문에 남겨둔 **읽기 전용 레거시 미러**다.
 * 호출부가 그걸 직접 읽으면 `error.code` 기반 분기가 사라지고 서버 문장에 다시 묶인다.
 *
 * 짝이 되는 검출기: `errorStringMatching.test.ts` (문구 매칭 금지).
 * 문구에 **도달하는 경로**를 막는 게 이 파일, 도달한 뒤 **문구로 분기**하는 걸 막는 게 그쪽이다.
 * 두 개가 한 폴더에 모여 있어야 다음 사람이 찾는다 — 새 에러 관련 lint 도 여기에 둘 것.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { findEnvelopeDigging, type Violation } from "./errorEnvelopeDigging";

const SRC = path.resolve(__dirname, "../..");

/** 검사 제외 디렉터리 — 테스트/목업은 서버 계약 소비자가 아니다(형제 lint 와 동일 정책). */
const SKIP_DIRS = ["__tests__", "mocks"];

/**
 * 파서 **구현체 자신** — 여기서 봉투를 직접 읽는 건 당연하고 유일하게 옳다.
 *
 * 목록을 `lib/` 통째가 아니라 파일 단위로 잡는 이유: `lib/` 아래 새 파일이 생겨
 * 또 다른 파서를 몰래 만드는 것도 이 트랙이 막으려는 일이다. 정말 파서를 하나 더
 * 만들어야 한다면 여기에 **왜 필요한지와 함께** 등재하라.
 */
const PARSER_IMPLEMENTATIONS = new Set([
  "lib/apiError.ts", //     봉투 → ParsedApiError 정본 파서. `error` 우선, `detail` 폴백.
  "lib/errorDisplay.ts", // ParsedApiError → 표시(문구·위치). 봉투를 직접 열지는 않는다.
  "lib/scheduleCodes.ts", // 스케줄 warnings/errors 배열 추출 — 봉투 흡수 이전 계약.
  "lib/api.ts", //          axios 인터셉터. 401/refresh 판정에 원형이 필요하다.
]);

/**
 * 이미 존재하는 우회 — **2026-08-11 측정값. 값은 상한이며 내려가는 방향으로만 갱신한다.**
 *
 * 파일만 등재하면 그 파일이 무한 우회 통로가 되므로 **파일 + 현재 개수**로 잡는다.
 * 같은 파일에서 하나라도 늘면 실패한다.
 *
 * 제품 코드는 이번 작업에서 고치지 않는다(테스트만 추가). 지우려면 서버가 해당 상황에
 * 도메인 코드를 먼저 내려줘야 하는 경우가 대부분이라, 그때까지는 근거와 함께 동결한다.
 *
 * - app/verify-email/page.tsx — **lib 의 `parseApiError` 를 무시하고 같은 이름의 로컬
 *   함수를 따로 만들어 두었다.** 이 병의 표본. lib 것으로 교체하면 0 이 된다.
 * - app/login/page.tsx, app/change-password/page.tsx — 401/문구를 직접 갈라 인라인 표시.
 *   `describeApiError(err, { context: "form" })` 로 대체 가능(서버 코드 확인 후).
 * - components/hiring/ApplicantDetailDrawer.tsx — `detail.code` 로 username_taken /
 *   pin_conflict 분기. 코드 분기 자체는 옳고 **읽는 경로만** 봉투 밖이다 →
 *   `parseApiErrorEnvelope(err).code` 로 옮기면 0.
 * - components/interview/InterviewSchedulePage.tsx, components/signup/* — 공개(비로그인)
 *   화면. `publicApi` 사용이라 인터셉터 경로가 다르고, 서버 쪽 코드 정비가 선행이다.
 * - hooks/useClockinPin.ts — 409 pin_conflict 계약을 3-repo 가 공유한다(계약 변경은 동시 수정).
 * - hooks/usePassword.ts — `fetch` 직접 호출이라 axios 봉투가 아니다. api 클라이언트로
 *   옮기는 게 진짜 해법.
 * - hooks/usePayroll.ts — 구조화 409(close_gates_failed)와 **Blob 응답**(export 실패)
 *   두 경로. Blob 은 axios 가 파싱하지 않아 손으로 JSON.parse 한다.
 */
const BASELINE: Record<string, number> = {
  "app/change-password/page.tsx": 1,
  "app/login/page.tsx": 1,
  "app/verify-email/page.tsx": 1,
  "components/hiring/ApplicantDetailDrawer.tsx": 2,
  "components/interview/InterviewSchedulePage.tsx": 2,
  "components/signup/DirectSignupFlow.tsx": 3,
  "components/signup/FormStepScreen.tsx": 1,
  "components/signup/SignupFlow.tsx": 5,
  "hooks/useClockinPin.ts": 1,
  "hooks/usePassword.ts": 1,
  "hooks/usePayroll.ts": 7,
};

/** 위반 하나를 사람이 바로 고칠 수 있게 적는다 — 파일:행 + 문제 스니펫. */
function describeViolation(v: Violation): string {
  return `${v.file}:${v.line}  ${v.snippet}`;
}

/** 다음 행동을 알려주는 실패 문구. 무엇을 어겼는지 + 대신 무엇을 쓸지 + 예외 등재법. */
const HOW_TO_FIX = [
  "에러 봉투를 손으로 파헤쳤다 (`response.data.detail` / `response.data.error`).",
  "이러면 봉투의 error.code 를 무시하고 서버 문장에 다시 의존하게 되어,",
  "서버 문구가 바뀌는 순간 조용히 오작동한다.",
  "",
  "대신 이걸 써라:",
  "  - 코드로 분기      → parseApiErrorEnvelope(err).code   (@/lib/apiError)",
  "  - 사람이 읽을 문장 → parseApiError(err, fallback)      (@/lib/apiError)",
  "  - 표시 위치까지    → describeApiError(err, { context }) (@/lib/errorDisplay)",
  "",
  "정말 예외라면 (파서를 새로 만들거나 axios 밖 fetch/Blob 경로라면)",
  "src/__tests__/lint/errorEnvelopeDigging.test.ts 의 BASELINE 에",
  "`\"<파일경로>\": <개수>` 를 **왜 필요한지 주석과 함께** 등재하라.",
  "고쳤다면 그 숫자를 내려라 — 이 값은 올릴 수 없다.",
].join("\n");

function walk(dir: string, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.includes(entry.name)) continue;
      walk(path.join(dir, entry.name), acc);
    } else if (/\.tsx?$/.test(entry.name)) {
      acc.push(path.join(dir, entry.name));
    }
  }
  return acc;
}

function scanAll(): Violation[] {
  return walk(SRC)
    .map((abs) => [path.relative(SRC, abs), abs] as const)
    .filter(([rel]) => !PARSER_IMPLEMENTATIONS.has(rel))
    .flatMap(([rel, abs]) => findEnvelopeDigging(rel, fs.readFileSync(abs, "utf8")));
}

describe("검출기 자체가 동작하는가 (규칙이 실제로 위반을 잡는지)", () => {
  const dirty: Array<[string, string]> = [
    ["axios 봉투 파헤치기", `const d = err.response?.data?.detail;`],
    ["옵셔널 없는 접근", `const d = error.response.data.detail;`],
    ["인덱스 접근", `const d = err.response?.data?.["detail"];`],
    ["가드 뒤 접근", `const d = axios.isAxiosError(e) && e.response?.data?.detail;`],
    ["중첩까지 한 번에", `if (err.response?.data?.detail?.code === "pin_conflict") x();`],
    ["fetch 로 받은 body", `const body = await r.json(); return body.detail;`],
    ["JSON.parse 결과", `const parsed = JSON.parse(t); if (parsed.detail) x();`],
    ["새 봉투 error 직접 읽기", `const env = err.response?.data?.error;`],
  ];

  it.each(dirty)("%s 를 잡는다", (_name, src) => {
    expect(findEnvelopeDigging("x.ts", src)).toHaveLength(1);
  });

  const clean: Array<[string, string]> = [
    ["승인된 입구 — 코드", `const { code } = parseApiErrorEnvelope(err);`],
    ["승인된 입구 — 문장", `setError(parseApiError(err, "Couldn't save"));`],
    ["승인된 입구 — 표시", `const d = describeApiError(err, { context: "form" });`],
    // AST 를 쓰는 이유가 아래 넷이다 — 정규식이면 전부 오탐이었다.
    ["타입 주석 안의 detail", `const e = err as { response?: { data?: { detail?: unknown } } };`],
    ["객체 리터럴 키", `return { detail: "hi" };`],
    ["쿼리키 문자열", `const k = ["warning", "detail", id];`],
    ["헬퍼 호출", `qc.invalidateQueries({ queryKey: KEYS.detail(id) });`],
    ["주석 안 예시", `// err.response?.data?.detail 를 직접 읽지 말 것`],
    // 도메인 필드는 건드리지 않는다 (실제 존재하는 뷰모델들).
    ["뷰모델 detail", `<div>{item.detail}</div>`],
    ["복수형 도메인 필드", `void modal.alert({ message: m, details: rows });`],
    ["업로드 행 실패 사유", `if (data.error) modal.alert({ message: data.error });`],
  ];

  it.each(clean)("%s 는 잡지 않는다", (_name, src) => {
    expect(findEnvelopeDigging("x.ts", src)).toEqual([]);
  });

  it("tsx 도 파싱한다 (파싱 실패로 조용히 0건이 되면 래칫이 죽는다)", () => {
    const src = `export const C = () => { try { f(); } catch (err) { return <p>{err.response?.data?.detail}</p>; } };`;
    expect(findEnvelopeDigging("C.tsx", src)).toHaveLength(1);
  });
});

describe("소스 전체 스캔", () => {
  const violations = scanAll();

  it("스캐너가 실제로 소스를 읽고 있다 (경로/제외 규칙이 깨져 0건이 되는 것 방지)", () => {
    // BASELINE 이 통째로 사라지면 "위반 없음"으로 거짓 통과한다. 하한도 함께 건다.
    expect(violations.length).toBeGreaterThan(0);
    expect(new Set(violations.map((v) => v.file))).toEqual(new Set(Object.keys(BASELINE)));
  });

  it("BASELINE 에 없는 파일에서 봉투를 파헤치지 않는다", () => {
    const unexpected = violations.filter((v) => !(v.file in BASELINE));
    expect(unexpected.map(describeViolation), HOW_TO_FIX).toEqual([]);
  });

  it("BASELINE 파일의 우회 개수는 늘지 않는다", () => {
    for (const [file, allowed] of Object.entries(BASELINE)) {
      const hits = violations.filter((v) => v.file === file);
      expect(
        hits.length,
        `${file} 의 봉투 파헤치기가 ${allowed} → ${hits.length} 로 늘었다.\n` +
          `${hits.map(describeViolation).join("\n")}\n\n${HOW_TO_FIX}`,
      ).toBeLessThanOrEqual(allowed);
    }
  });

  it("BASELINE 에 죽은 항목이 없다 (고쳤으면 숫자를 내려라)", () => {
    // 실제보다 큰 숫자를 남겨두면 그만큼이 다시 우회 여유분이 된다 — 래칫이 헐거워진다.
    const stale = Object.entries(BASELINE)
      .map(([file, allowed]) => [file, allowed, violations.filter((v) => v.file === file).length])
      .filter(([, allowed, actual]) => allowed !== actual);
    expect(
      stale.map(([f, a, n]) => `${f}: BASELINE ${a} → 실제 ${n} 로 내릴 것`),
      "위반이 줄었다. BASELINE 을 실제값으로 낮춰 래칫을 조여라.",
    ).toEqual([]);
  });
});
