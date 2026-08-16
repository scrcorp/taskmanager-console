/**
 * 연락처 검색어 강조 — 왜 이 행이 걸렸는지 보이게 하는 순수 로직.
 *
 * 핵심 두 가지:
 *  1) 전화번호는 **서버와 같은 정규화(숫자만)** 기준으로도 매칭돼야 한다.
 *     `213-555` 로 찾았는데 `(213) 555-0142` 가 아무 데도 안 칠해지면
 *     사용자는 검색이 왜 걸렸는지 알 수 없다.
 *  2) 강조는 **판정을 바꾸지 않는다** — 검색은 서버가 하고 여기서는 칠하기만 한다.
 */

import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import React from "react";

import {
  highlight,
  matchedFirst,
  matchesTerm,
} from "@/components/contacts/contactHighlight";

/** 강조된 조각만 뽑는다 (mark 태그 안의 글자). */
function marked(node: React.ReactNode): string[] {
  const { container } = render(<span>{node}</span>);
  return Array.from(container.querySelectorAll("mark")).map((m) => m.textContent ?? "");
}

/** 강조 여부와 무관하게 원문이 그대로 나오는지. */
function plain(node: React.ReactNode): string {
  const { container } = render(<span>{node}</span>);
  return container.textContent ?? "";
}

describe("highlight", () => {
  it("검색어가 없으면 원문을 그대로 둔다", () => {
    expect(marked(highlight("Acme Plumbing", ""))).toEqual([]);
    expect(plain(highlight("Acme Plumbing", ""))).toBe("Acme Plumbing");
  });

  it("대소문자를 무시하고 칠한다", () => {
    expect(marked(highlight("Acme Plumbing", "acme"))).toEqual(["Acme"]);
  });

  it("칠해도 원문 글자는 하나도 잃지 않는다", () => {
    expect(plain(highlight("Acme Plumbing", "plumb"))).toBe("Acme Plumbing");
  });

  it("첫 매칭 한 곳만 칠한다 (긴 메모가 온통 칠해지지 않게)", () => {
    expect(marked(highlight("call, then call again", "call"))).toEqual(["call"]);
  });

  it("전화번호는 숫자만 비교해서 원본 표기 위치로 되돌려 칠한다", () => {
    expect(marked(highlight("(213) 555-0142", "213-555", { phone: true }))).toEqual([
      "213) 555",
    ]);
    expect(plain(highlight("(213) 555-0142", "213-555", { phone: true }))).toBe(
      "(213) 555-0142",
    );
  });

  it("숫자가 2자리 이하면 정규화 매칭을 태우지 않는다", () => {
    // 서버도 3자리 미만은 정규화 매칭에서 뺀다. 여기만 칠하면 기준이 갈린다.
    // 리터럴로는 안 걸리는 검색어라야 정규화 경로만 검증된다 — "21" 은 원본 표기에
    // 그대로 들어 있어서 리터럴 매칭이 먼저 걸린다(그건 정상 동작).
    expect(marked(highlight("(213) 555-0142", "3-5", { phone: true }))).toEqual([]);
  });

  it("리터럴로 걸리면 자릿수와 무관하게 칠한다", () => {
    expect(marked(highlight("(213) 555-0142", "21", { phone: true }))).toEqual(["21"]);
  });

  it("phone 옵션이 없으면 리터럴만 본다", () => {
    expect(marked(highlight("(213) 555-0142", "213-555"))).toEqual([]);
  });

  it("빈 텍스트는 그대로 돌려준다", () => {
    expect(highlight(null, "x")).toBeNull();
  });
});

describe("matchesTerm", () => {
  it("부분일치면 참", () => {
    expect(matchesTerm("Vendor", "end")).toBe(true);
  });
  it("검색어가 비면 거짓", () => {
    expect(matchesTerm("Vendor", "")).toBe(false);
  });
  it("텍스트가 비면 거짓", () => {
    expect(matchesTerm(null, "v")).toBe(false);
  });
});

describe("matchedFirst", () => {
  const tags = [{ name: "food" }, { name: "vendor" }, { name: "urgent" }];

  it("걸린 것을 앞으로 당긴다", () => {
    expect(matchedFirst(tags, "vend", (t) => t.name).map((t) => t.name)).toEqual([
      "vendor",
      "food",
      "urgent",
    ]);
  });

  it("걸린 것끼리·안 걸린 것끼리 원래 순서를 지킨다", () => {
    const many = [{ name: "a1" }, { name: "b" }, { name: "a2" }, { name: "c" }];
    expect(matchedFirst(many, "a", (t) => t.name).map((t) => t.name)).toEqual([
      "a1",
      "a2",
      "b",
      "c",
    ]);
  });

  it("검색어가 없으면 순서를 건드리지 않는다", () => {
    expect(matchedFirst(tags, "", (t) => t.name)).toBe(tags);
  });
});
