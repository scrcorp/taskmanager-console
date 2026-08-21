/**
 * IME 조합 판정 — 한글 입력 중 Enter 가 "제출"로 새지 않게 막는 가드.
 *
 * 회귀 대상(2026-08-15 실측): 연락처 태그칸에 `이런수가` 를 치고 Enter 를 누르면
 * `이런`, `런`, `수가`, `가` 4개가 들어갔다. 조합 중 keydown 을 제출로 받아 앞부분을
 * 넣고 입력칸을 비우는데, IME 가 조합을 확정하며 남은 글자를 다시 써넣기 때문이다.
 */

import { describe, it, expect } from "vitest";

import { isImeComposing } from "@/lib/ime";

/** React KeyboardEvent 중 판정에 쓰이는 부분만 흉내낸다. */
function evt(over: { isComposing?: boolean; keyCode?: number } = {}) {
  return {
    nativeEvent: { isComposing: over.isComposing ?? false } as KeyboardEvent,
    keyCode: over.keyCode ?? 13,
  };
}

describe("isImeComposing", () => {
  it("조합이 아니면 false — 평소 Enter 는 그대로 동작해야 한다", () => {
    expect(isImeComposing(evt())).toBe(false);
  });

  it("nativeEvent.isComposing 이 true 면 true", () => {
    expect(isImeComposing(evt({ isComposing: true }))).toBe(true);
  });

  it("keyCode 229 면 true — isComposing 을 안 채우는 구현 대비", () => {
    expect(isImeComposing(evt({ keyCode: 229 }))).toBe(true);
  });

  it("두 신호가 같이 와도 true", () => {
    expect(isImeComposing(evt({ isComposing: true, keyCode: 229 }))).toBe(true);
  });

  it("nativeEvent 가 없어도 터지지 않는다", () => {
    // 합성 이벤트를 직접 만들어 넘기는 테스트 코드가 있을 수 있다.
    const bare = { nativeEvent: undefined as unknown as KeyboardEvent, keyCode: 13 };
    expect(isImeComposing(bare)).toBe(false);
  });
});
