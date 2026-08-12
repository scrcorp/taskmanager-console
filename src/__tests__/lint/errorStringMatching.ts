/**
 * G5 강제장치 — **에러 문구를 문자열로 매칭하는 코드**를 찾아내는 검출기.
 *
 * 왜 필요한가: 서버 문장이 바뀌면 조용히 오분류된다. 실제로 HTMA 가
 * `_error.contains('session')` 로 세션 만료를 판정하다가, 문구에 'session' 이 없는
 * 케이스에서 매니저가 manage 모드에 갇히는 버그가 현재진행형으로 있다.
 * 분기는 **code** 로 해야 한다 (`getErrorCode` / `describeApiError`).
 *
 * **지금 넣는 이유는 대상이 3곳뿐이기 때문이다.** 30곳이 된 뒤 넣는 lint 는 다른 작업이다.
 *
 * 이 파일은 테스트 전용이다 — eslint 설정 파일이 이 저장소에 없어서(next lint 만 있음)
 * "CI 에서 실패하는 형태"를 vitest 로 구현했다. eslint 규칙이 도입되면 같은 판정을
 * 옮기면 된다.
 */

/** 문자열 변환 메서드 — 수신자 이름을 판정할 때 건너뛴다 (`msg.toLowerCase().includes(...)`). */
const TRANSFORMS = new Set(["toLowerCase", "toUpperCase", "trim", "toString", "normalize"]);

/**
 * 이 이름으로 끝나는 값에 대한 문자열 매칭은 "에러 문구 매칭"으로 본다.
 *
 * `reason` 은 일부러 뺐다 — 이 저장소에서 reason 은 근태 변경 사유 같은 **도메인 값**이라
 * (`group.reason === "(no reason)"`) 오탐만 만든다. 에러 사유는 `message`/`detail` 로 온다.
 */
const ERROR_LIKE = /^(msg|message|messages|detail|details|err|error|errorMessage|errorText)$/i;

/** 매칭 메서드. `=== "리터럴"` 비교도 같은 죄질이라 함께 잡는다. */
const MATCH_CALL =
  /([A-Za-z_$][\w$]*(?:\s*\??\.\s*[A-Za-z_$][\w$]*(?:\s*\([^()]*\))?)*)\s*\??\.\s*(includes|startsWith|endsWith|match|search)\s*\(\s*(["'`/])/g;

/**
 * `msg === "서버 문장"` 도 같은 죄질이다. 다만 `typeof detail === "string"` 이나
 * `reason === "manual_edit"` 같은 enum 비교까지 잡으면 오탐이 압도적이라
 * **리터럴이 문장처럼 생겼을 때만**(공백을 포함하거나 문장부호로 끝날 때) 위반으로 본다.
 * 서버 문구를 통째로 비교하는 것이 잡으려는 대상이므로 이 좁힘으로 충분하다.
 */
const MATCH_EQ =
  /([A-Za-z_$][\w$]*(?:\s*\??\.\s*[A-Za-z_$][\w$]*(?:\s*\([^()]*\))?)*)\s*[=!]==\s*(["'])([^"'`]*)\2/g;

function looksLikeSentence(literal: string): boolean {
  return /\s/.test(literal) || /[.!?]$/.test(literal);
}

export interface Violation {
  file: string;
  line: number;
  /** 위반 구문 — 사람이 바로 찾을 수 있게. */
  snippet: string;
}

/** 수신자 표현식에서 변환 호출을 걷어내고 마지막 이름을 얻는다. */
function receiverName(expr: string): string {
  const segments = expr
    .split(".")
    .map((s) => s.trim().replace(/\s*\([^()]*\)\s*$/, "").replace(/\?$/, ""))
    .filter((s) => s.length > 0 && !TRANSFORMS.has(s));
  return segments[segments.length - 1] ?? "";
}

/** 한 줄이 주석인가 — 주석 안 예시까지 잡으면 문서를 못 쓴다. */
function isComment(line: string): boolean {
  const t = line.trim();
  return t.startsWith("//") || t.startsWith("*") || t.startsWith("/*");
}

/**
 * 소스 한 벌에서 위반을 찾는다.
 *
 * 의도적으로 AST 를 쓰지 않는다 — 대상이 3곳이고, 정규식으로도 "새로 생기면 잡힌다"는
 * 목적은 달성된다. 오탐이 생기면 수신자 이름 규칙(`ERROR_LIKE`)을 좁히면 된다.
 */
export function findErrorStringMatching(file: string, source: string): Violation[] {
  const out: Violation[] = [];
  source.split("\n").forEach((line, i) => {
    if (isComment(line)) return;
    for (const re of [MATCH_CALL, MATCH_EQ]) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(line)) !== null) {
        // `typeof detail === "string"` 은 타입 가드지 문구 매칭이 아니다.
        if (/\btypeof\s*$/.test(line.slice(0, m.index))) continue;
        if (!ERROR_LIKE.test(receiverName(m[1]))) continue;
        if (re === MATCH_EQ && !looksLikeSentence(m[3] ?? "")) continue;
        out.push({ file, line: i + 1, snippet: m[0].trim() });
      }
    }
  });
  return out;
}
