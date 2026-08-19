/**
 * G3 — **3-repo 코드 목록 일치**. 세 저장소가 같은 코드 집합을 들고 있는지 CI 에서 검증한다.
 *
 * 왜 필요한가: 코드 계약은 세 저장소에 흩어진 문자열이라 한쪽만 고쳐도 컴파일은 통과한다.
 * 서버가 새 코드를 배포했는데 콘솔이 모르면 사용자는 "원인 미상" 모달을 본다. 반대로
 * 콘솔이 지운 코드를 서버가 계속 보내면 조용히 코드 원문이 화면에 뜬다.
 *
 * 세 저장소가 한 워크스페이스에 없으면(단독 체크아웃/CI 잡) 이 테스트는 **건너뛴다.**
 * 조용히 통과시키지 않도록 건너뛴 이유를 로그로 남긴다.
 * 다만 **저장소를 찾았는데 기대한 파일이 없으면 skip 이 아니라 실패**다 —
 * "CI 가 3-repo 일치를 강제한다"는 주장이 조용한 skip 으로 거짓이 되면 안 된다.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * 형제 저장소 루트를 찾는다.
 *
 * 워크트리 레이아웃: `<루트>/{server,console,app}/.claude/worktrees/<이름>`.
 * **현재 실행 위치가 워크트리면 형제 저장소도 같은 이름의 워크트리를 먼저 본다** —
 * 같은 트랙의 짝이기 때문이다. 메인 체크아웃만 보면 서버 워크트리에서 코드 목록을
 * 어긋나게 바꿔도 이 테스트가 통과해버려, 머지된 다음에야 불일치가 드러난다(실측 확인됨).
 * app 저장소의 dart 테스트(`error_code_registry_test.dart`)가 쓰는 방식과 같다.
 */
function resolveRepo(repo: "server" | "app"): string | null {
  const cwd = process.cwd();
  // 경로 어딘가에 `.claude/worktrees/<이름>` 이 있으면 그 이름이 현재 트랙이다.
  const worktreeName = /[/\\]\.claude[/\\]worktrees[/\\]([^/\\]+)/.exec(cwd)?.[1] ?? null;

  let dir = cwd;
  for (let i = 0; i < 10; i++) {
    const base = path.join(dir, repo);
    if (fs.existsSync(base)) {
      if (worktreeName) {
        const sibling = path.join(base, ".claude", "worktrees", worktreeName);
        if (fs.existsSync(sibling)) return sibling;
      }
      return base;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/** 따옴표 안의 UPPER_SNAKE 리터럴을 전부 뽑는다 — 세 언어에 같은 규칙이 통한다. */
function extractCodes(source: string): Set<string> {
  const out = new Set<string>();
  const re = /["']([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) out.add(m[1]);
  return out;
}

/** 저장소를 찾았는데 파일이 없으면 실패시킨다(조용한 skip 금지). */
function readRepoFile(repoRoot: string, rel: string): string {
  const full = path.join(repoRoot, rel);
  if (!fs.existsSync(full)) {
    throw new Error(
      `[G3] 저장소는 찾았는데 대조 대상 파일이 없다: ${full}\n` +
        `경로가 바뀌었으면 이 테스트를 함께 고쳐라. 없는 채로 두면 대조가 영원히 안 돈다.`,
    );
  }
  return fs.readFileSync(full, "utf8");
}

const CONSOLE_FILE = path.resolve(__dirname, "../../lib/scheduleCodes.ts");
const serverRoot = resolveRepo("server");
const appRoot = resolveRepo("app");

describe("스케줄 코드 3-repo 일치", () => {
  const consoleCodes = extractCodes(fs.readFileSync(CONSOLE_FILE, "utf8"));

  // 20 = 최상위 2 + 에러/경고 18. 2026-08-19 에 START_AFTER_DAY_BOUNDARY /
  // START_BEFORE_DAY_BOUNDARY 가 삭제되면서 22 → 20 이 됐다(구간 밖 시작은 이제 경고가 아니라 차단).
  it("콘솔이 20개 코드를 들고 있다 (참조 구현 규모 고정)", () => {
    expect(consoleCodes.size).toBe(20);
  });

  it.skipIf(serverRoot === null)("server 와 일치", () => {
    const server = extractCodes(readRepoFile(serverRoot!, "app/core/schedule_codes.py"));
    expect([...consoleCodes].sort()).toEqual([...server].sort());
  });

  it.skipIf(appRoot === null)("attendance 앱과 일치", () => {
    const dart = extractCodes(
      readRepoFile(appRoot!, "apps/attendance/lib/utils/schedule_codes.dart"),
    );
    expect([...consoleCodes].sort()).toEqual([...dart].sort());
  });

  it("워크스페이스를 못 찾으면 이유를 남긴다", () => {
    if (serverRoot === null || appRoot === null) {
      console.warn(
        "[G3] server/app 저장소를 찾지 못해 3-repo 대조를 건너뛰었다. " +
          "단독 체크아웃이면 정상이지만, 워크스페이스에서 이 경고가 보이면 경로가 틀린 것이다.",
      );
    }
    expect(true).toBe(true);
  });
});

describe("전역 에러 코드 레지스트리 대조", () => {
  /**
   * 서버가 실제로 덤프하는 경로. `python -m app.core.error_codes.audit --export` 산출물이다.
   * (이전 후보 경로 `app/core/error_codes.json` 은 존재한 적이 없어 대조가 항상 skip 됐다.)
   */
  const DUMP_PATH = "app/core/error_codes/registry.generated.json";

  interface Dump {
    version?: number;
    domains?: Record<string, string[]>;
    codes?: Array<{ code: string; domain?: string }>;
  }

  /** 서버 저장소를 못 찾으면(단독 체크아웃) skip, 찾았으면 덤프가 **반드시** 있어야 한다. */
  it.skipIf(serverRoot === null)("서버 덤프가 존재하고 형식이 계약대로다", () => {
    const dump = JSON.parse(readRepoFile(serverRoot!, DUMP_PATH)) as Dump;
    expect(Array.isArray(dump.codes), `${DUMP_PATH} 의 codes 가 배열이 아니다`).toBe(true);
    expect(typeof dump.domains, `${DUMP_PATH} 의 domains 가 객체가 아니다`).toBe("object");
  });

  it.skipIf(serverRoot === null)("덤프의 schedule 도메인이 콘솔 목록과 같다", () => {
    // 덤프를 실제 대조에 쓴다 — 형식만 확인하고 끝내면 레지스트리가 어긋나도 초록불이다.
    const dump = JSON.parse(readRepoFile(serverRoot!, DUMP_PATH)) as Dump;
    const scheduleCodes = dump.domains?.schedule ?? [];
    const consoleCodes = extractCodes(fs.readFileSync(CONSOLE_FILE, "utf8"));
    expect([...scheduleCodes].sort()).toEqual([...consoleCodes].sort());
  });
});
