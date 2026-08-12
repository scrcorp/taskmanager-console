/**
 * 래칫 검출기 — **에러 봉투를 손으로 파헤치는 코드**를 찾아낸다.
 *
 * 왜 필요한가: 승인된 입구는 `parseApiError` / `describeApiError` /
 * `parseApiErrorEnvelope` 뿐이다(`src/lib/apiError.ts`, `src/lib/errorDisplay.ts`).
 * 그런데 호출부가 `err.response?.data?.detail` 를 직접 읽으면 봉투의 `error.code` 를
 * 통째로 무시하고 **서버 문장에 다시 의존**하게 된다 — 서버 문구가 바뀌는 순간
 * 조용히 오작동한다. 이 트랙이 없애려는 병이 정확히 그것이다.
 * 형제 검출기(`errorStringMatching.ts`)가 "문구 매칭"을 막는다면, 이쪽은
 * **문구에 도달하는 경로 자체**를 막는다. 그래서 같은 폴더에 둔다.
 *
 * ## 왜 정규식이 아니라 AST 인가
 *
 * 이 저장소에는 `detail` 이라는 글자가 정말 많다 — 타입 주석
 * (`{ response?: { data?: { detail?: unknown } } }`), 쿼리키 문자열
 * (`["changelog", "detail", slug]`), 헬퍼 호출(`KEYS.detail(id)`), 그리고 도메인
 * 필드 `details`(복수). 정규식으로 이걸 다 갈라내면 규칙이 규칙대로 안 읽히고,
 * 오탐 한 번이면 다음 사람이 검출기를 통째로 지운다. TS 파서를 쓰면
 * **"값을 읽는 프로퍼티 접근"만** 정확히 고를 수 있다:
 *
 * - 타입 리터럴의 멤버는 `PropertySignature` 라 애초에 후보가 아니다.
 * - 객체 리터럴 키(`{ detail: x }`)도 `PropertyAssignment` 라 후보가 아니다.
 * - 문자열/주석 안의 `detail` 은 토큰이 달라 후보가 아니다.
 * - `KEYS.detail(id)` 는 프로퍼티 접근이지만 **호출식의 callee** 라 제외한다
 *   (봉투를 파헤치는 코드는 `detail` 을 호출하지 않는다).
 */
import ts from "typescript";

/**
 * `detail` 을 읽어도 **봉투가 아닌** 경우를 걸러내기 위한 수신자 화이트리스트.
 *
 * 이 저장소에는 `detail: string` 을 가진 **화면용 뷰모델**이 실제로 있다
 * (`components/compact/CompactMoreActions.tsx` 의 `item.detail`,
 * `components/payroll/GateChecklist.tsx` 의 `it.detail` — 둘 다 로컬에서 만든 목록 항목이다).
 * "이름이 detail 이면 무조건 위반"으로 두면 이 둘이 오탐으로 잡히고,
 * 오탐 한 번이면 다음 사람이 검출기를 지운다. 그래서 **수신자가 HTTP 응답/에러처럼
 * 생겼을 때만** 봉투로 판정한다.
 *
 * 반대로 `err.response?.data?.detail` 처럼 체인에 `response` + `data` 가 함께 있으면
 * 수신자 이름과 무관하게 HTTP 응답이 확실하므로 그 조건만으로 잡는다.
 */
const ERROR_RECEIVER = new Set(["err", "error", "data", "parsed", "body", "payload", "json"]);

export interface Violation {
  file: string;
  line: number;
  /** 위반 구문 — 사람이 파일에서 바로 찾을 수 있게 원문 그대로. */
  snippet: string;
  /** 무엇을 파헤쳤는지 — 실패 메시지에서 처방을 가르기 위한 구분. */
  kind: "detail" | "envelope-error";
}

/** 프로퍼티 접근/인덱스 접근에서 읽히는 이름. 그 외 형태면 undefined. */
function accessedName(node: ts.Node): string | undefined {
  if (ts.isPropertyAccessExpression(node)) return node.name.text;
  if (ts.isElementAccessExpression(node)) {
    const arg = node.argumentExpression;
    if (ts.isStringLiteralLike(arg)) return arg.text;
  }
  return undefined;
}

/** 수신자 체인에 등장하는 이름들 — `err.response?.data` → ["err","response","data"]. */
function chainNames(node: ts.Node): string[] {
  const out: string[] = [];
  let cur: ts.Node = node;
  for (;;) {
    if (ts.isPropertyAccessExpression(cur) || ts.isElementAccessExpression(cur)) {
      const name = accessedName(cur);
      if (name) out.unshift(name);
      cur = cur.expression;
    } else if (ts.isNonNullExpression(cur) || ts.isParenthesizedExpression(cur)) {
      cur = cur.expression;
    } else if (ts.isCallExpression(cur)) {
      cur = cur.expression;
    } else {
      if (ts.isIdentifier(cur)) out.unshift(cur.text);
      return out;
    }
  }
}

/** `KEYS.detail(id)` 처럼 **호출되는** 프로퍼티는 봉투 필드가 아니다. */
function isCallee(node: ts.Node): boolean {
  const parent = node.parent;
  return !!parent && ts.isCallExpression(parent) && parent.expression === node;
}

/**
 * 소스 한 벌에서 위반을 찾는다.
 *
 * 잡는 것 (둘 다 "봉투를 손으로 여는" 행위):
 *  1. `detail` 프로퍼티/인덱스 읽기 — FastAPI 레거시 미러. 여기서 문자열을 꺼내
 *     쓰는 순간 code 기반 분기가 사라진다.
 *  2. `…response…data….error` 읽기 — 새 봉투의 정본. 파서를 우회해 직접 읽으면
 *     `code_source` / status 폴백 / 검증 이슈 정규화를 전부 놓친다.
 *     `data.error` 만으로는 잡지 않는다 — 이 저장소의 일괄 업로드 응답에도
 *     `data.error`(행 단위 실패 사유)가 있어 오탐이 된다. 그래서 체인에
 *     `response` 가 함께 있을 때만 봉투로 본다.
 */
export function findEnvelopeDigging(file: string, source: string): Violation[] {
  const sf = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    /* setParentNodes */ true,
    /\.tsx$/.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const out: Violation[] = [];

  const visit = (node: ts.Node): void => {
    const name = accessedName(node);
    if (name && !isCallee(node)) {
      const chain = chainNames(node);
      // 체인의 마지막 앞 = 수신자 이름. `err.response?.data?.detail` → "data".
      const receiver = chain[chain.length - 2] ?? "";
      const isHttpChain = chain.includes("response") && chain.includes("data");

      let kind: Violation["kind"] | undefined;
      if (name === "detail" && (isHttpChain || ERROR_RECEIVER.has(receiver))) kind = "detail";
      else if (name === "error" && isHttpChain) kind = "envelope-error";

      if (kind) {
        const { line } = sf.getLineAndCharacterOfPosition(node.getStart(sf));
        out.push({
          file,
          line: line + 1,
          snippet: node.getText(sf).replace(/\s+/g, " ").trim(),
          kind,
        });
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sf);
  return out;
}
