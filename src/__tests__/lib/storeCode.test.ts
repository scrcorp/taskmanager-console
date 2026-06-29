/**
 * previewStoreCode 테스트 — 서버 _generate_unique_code 미러링 검증.
 *
 * 테스트 범위:
 * - 기본: 이름 앞 3글자 대문자
 * - 영숫자 정규화 (공백/기호 제거)
 * - 폴백: 영숫자 2글자 미만 → STO
 * - dedup: 충돌 시 2/3/4… 접미사 (폐점 코드는 호출자가 제외)
 * - 빈 입력
 */

import { describe, it, expect } from "vitest";
import { previewStoreCode } from "@/lib/storeCode";

describe("previewStoreCode", () => {
  it("이름 앞 3글자를 대문자로 사용한다", () => {
    expect(previewStoreCode("Seworld", [])).toBe("SEW");
    expect(previewStoreCode("downtown cafe", [])).toBe("DOW");
  });

  it("영숫자가 아닌 문자는 제거하고 앞 3자를 취한다", () => {
    expect(previewStoreCode("A&W Burgers", [])).toBe("AWB");
    expect(previewStoreCode("7-Eleven", [])).toBe("7EL");
  });

  it("영숫자가 2글자 미만이면 STORE로 채워 3자를 만든다 (서버 폴백)", () => {
    expect(previewStoreCode("세종점", [])).toBe("STO"); // 영숫자 0개 → STO
    expect(previewStoreCode("A 매장", [])).toBe("AST"); // "A" + "STORE" → AST
  });

  it("코드 충돌 시 2/3/4 접미사를 붙인다", () => {
    expect(previewStoreCode("Seworld", ["SEW"])).toBe("SEW2");
    expect(previewStoreCode("Seworld", ["SEW", "SEW2"])).toBe("SEW3");
    expect(previewStoreCode("Seworld", ["SEW", "SEW2", "SEW3"])).toBe("SEW4");
  });

  it("기존 코드 비교는 대소문자를 무시한다", () => {
    expect(previewStoreCode("Seworld", ["sew"])).toBe("SEW2");
  });

  it("영숫자가 없거나 비어 있으면 STO 폴백을 반환한다 (호출 측에서 빈 이름 가드)", () => {
    expect(previewStoreCode("", [])).toBe("STO");
    expect(previewStoreCode("   ", [])).toBe("STO");
  });
});
