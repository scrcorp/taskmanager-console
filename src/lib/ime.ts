/**
 * IME(한글·일본어·중국어) 조합 상태 판정.
 *
 * 왜 필요한가 — 한글을 치는 도중의 Enter 는 **"조합 확정"이지 "제출"이 아니다.**
 * 그런데 브라우저는 조합 중에도 `keydown` 을 흘리기 때문에, 확인 없이 제출로 받으면
 * 마지막 음절이 두 번 들어간다:
 *
 *   1. 조합 중 Enter → 핸들러가 `이런` 을 제출하고 입력칸을 비운다
 *   2. 곧이어 IME 가 조합을 확정하며 남은 `런` 을 **비워진 칸에 다시 써넣는다**
 *   3. 사용자가 Enter 를 또 누르면 `런` 이 두 번째 항목으로 들어간다
 *
 * 실측(2026-08-15, 연락처 태그 입력): `이런수가` → `이런`, `런`, `수가`, `가` 4개.
 *
 * 가드를 붙이면 첫 Enter 는 조합만 확정하고 글자가 입력칸에 남으며, 사용자가 Enter 를
 * 한 번 더 눌러 제출한다 — IME 를 쓰는 입력의 표준 동작이다.
 *
 * **어디에 붙이나**: 입력된 **텍스트를 소비하고 입력칸을 비우는** 핸들러 (칩 추가, 항목 추가,
 * 메시지 전송, 인라인 이름 저장). `role="button"` 요소를 Enter/Space 로 누르는 접근성
 * 핸들러에는 붙이지 않는다 — 텍스트 입력이 없어 조합 자체가 성립하지 않으므로 잡음만 는다.
 */

import type React from "react";

/** IME 가 아직 조합 중인 keydown 인가. 조합 중이면 제출/추가 동작을 하면 안 된다. */
export function isImeComposing(
  e: Pick<React.KeyboardEvent, "nativeEvent" | "keyCode">,
): boolean {
  // 표준 신호. Chrome/Firefox/Safari 최신 버전이 채운다.
  const native = e.nativeEvent as KeyboardEvent | undefined;
  if (native?.isComposing) return true;
  // isComposing 을 안 채우는 구현을 위한 보조 신호 — IME 처리 중 keydown 의 관례적 코드.
  return e.keyCode === 229;
}
