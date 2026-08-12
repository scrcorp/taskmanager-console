/**
 * G5 — 에러 문구 문자열 매칭 금지. **CI 에서 실패한다.**
 *
 * 기존 위반은 BASELINE 에 개수로 박아 두고, 그 수는 **줄어들 수만 있다.**
 * (지우려면 서버에 도메인 코드가 먼저 있어야 한다 — §5 4단계. 그때까지는 동결.)
 *
 * 새 위반이 생기면 파일이 BASELINE 에 없으므로 즉시 실패한다.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { findErrorStringMatching, type Violation } from "./errorStringMatching";

const SRC = path.resolve(__dirname, "../..");

/**
 * 이미 존재하는 위반 — **늘리지 말 것.** 값은 허용 개수의 상한이다.
 *
 * - BulkScheduleView: 서버가 보낸 겹침 문구를 `startsWith` 로 걸러 클라 클러스터와 중복
 *   표시를 막는다. 서버가 이 항목에 코드를 붙이면(예: `OVERLAPPING_SCHEDULE`) 삭제 가능.
 * - ChangePasswordModal: 비밀번호 오입력을 문구로 판정해 인라인 힌트를 띄운다.
 *   서버에 `current_password_incorrect` 같은 코드가 생기면 삭제 가능.
 */
const BASELINE: Record<string, number> = {
  "components/schedules/redesign/BulkScheduleView.tsx": 2,
  "components/auth/ChangePasswordModal.tsx": 2,
};

/** 검사 제외 — 테스트/목업은 서버 계약 소비자가 아니다. */
const SKIP_DIRS = ["__tests__", "mocks"];

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
  return walk(SRC).flatMap((abs) =>
    findErrorStringMatching(path.relative(SRC, abs), fs.readFileSync(abs, "utf8")),
  );
}

describe("검출기 자체가 동작하는가 (규칙이 실제로 위반을 잡는지)", () => {
  const cases: Array<[string, string]> = [
    ["includes", `if (msg.includes("session")) logout();`],
    ["toLowerCase 체인", `if (msg.toLowerCase().includes("incorrect")) hint();`],
    ["startsWith on .message", `if (c.message.startsWith("Overlaps with")) skip();`],
    ["optional chaining", `if (err?.message?.includes("expired")) logout();`],
    ["정규식 match", `if (detail.match(/reset_checklist/)) reset();`],
    ["=== 리터럴 비교", `if (message === "Not found") show();`],
    ["endsWith", `if (errorText.endsWith("."))  trim();`],
  ];

  it.each(cases)("%s 를 잡는다", (_name, src) => {
    expect(findErrorStringMatching("x.ts", src)).toHaveLength(1);
  });

  const clean: Array<[string, string]> = [
    ["코드로 분기 — 정답", `if (getErrorCode(err) === "pin_conflict") show();`],
    ["에러와 무관한 배열", `if (anomalies.includes("auto_clocked_out")) mark();`],
    ["문구가 아닌 필드", `if (user.name.includes("a")) x();`],
    ["주석 안 예시", `// detail.includes("overlap") 같은 매칭을 하지 않는다`],
    ["코드 필드 비교", `if (parsed.code === "INTERNAL_ERROR") banner();`],
  ];

  it.each(clean)("%s 는 잡지 않는다", (_name, src) => {
    expect(findErrorStringMatching("x.ts", src)).toEqual([]);
  });
});

describe("소스 전체 스캔", () => {
  const violations = scanAll();

  it("BASELINE 에 없는 파일에는 위반이 없다", () => {
    const unexpected = violations.filter((v) => !(v.file in BASELINE));
    expect(
      unexpected.map((v) => `${v.file}:${v.line}  ${v.snippet}`),
      "에러 문구를 문자열로 매칭했다. 서버 code 로 분기하라 (getErrorCode / describeApiError).",
    ).toEqual([]);
  });

  it("BASELINE 파일의 위반 개수는 늘지 않는다", () => {
    for (const [file, allowed] of Object.entries(BASELINE)) {
      const n = violations.filter((v) => v.file === file).length;
      expect(n, `${file} 의 문자열 매칭이 ${allowed} → ${n} 로 늘었다`).toBeLessThanOrEqual(allowed);
    }
  });
});
