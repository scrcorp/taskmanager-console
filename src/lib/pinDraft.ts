/**
 * PIN 입력값 판정 — "이 번호로 바꿔도 되는가".
 *
 * PIN finder 의 인라인 편집이 저장 전에 쓰는 순수 로직. 서버 lookup 결과를
 * 편집 중인 본인 기준으로 해석한다. 저장 자체는 서버가 다시 막지만(409),
 * 누르기 전에 알려주는 편이 낫다.
 */

import type { ClockinPinLookup } from "@/types";

/** PIN 형식 — 서버 검증과 동일 (^\d{4,6}$). */
export const PIN_PATTERN = /^\d{4,6}$/;

export type PinDraftVerdict =
  /** 4~6자리 숫자가 아님 */
  | { state: "invalid" }
  /** 서버 판정을 기다리는 중 */
  | { state: "checking" }
  /** 아무도 안 쓰는 번호 — 저장 가능 */
  | { state: "free" }
  /** 지금 이 사람이 이미 쓰는 번호 — 바뀌는 게 없지만 저장은 무해 */
  | { state: "self" }
  /** 다른 사람이 쓰는 번호 — 저장 거부 */
  | { state: "taken"; holderName: string | null };

interface EvaluateArgs {
  draft: string;
  /** 편집 대상 직원 — 본인 번호를 "충돌" 로 오판하지 않기 위해 필요. */
  selfUserId: string;
  /** useClockinPinLookup 결과 (draft 가 유효할 때만 채워진다). */
  lookup: ClockinPinLookup | undefined;
  /** lookup 이 아직 도는 중인지. */
  isChecking: boolean;
}

/**
 * 입력값 한 개에 대한 판정.
 *
 * 서버 lookup 은 "누가 쓰는가" 만 알려주고 본인 제외를 모른다 —
 * holders 가 편집 대상 본인뿐이면 충돌이 아니라 "지금 그 번호" 다.
 */
export function evaluatePinDraft({
  draft,
  selfUserId,
  lookup,
  isChecking,
}: EvaluateArgs): PinDraftVerdict {
  if (!PIN_PATTERN.test(draft)) return { state: "invalid" };
  if (isChecking || !lookup || lookup.pin !== draft) return { state: "checking" };
  if (lookup.available) return { state: "free" };

  const others = lookup.holders.filter((h) => h.user_id !== selfUserId);
  if (others.length === 0) return { state: "self" };
  return { state: "taken", holderName: others[0].full_name ?? null };
}

/** 저장 버튼을 눌러도 되는가 — 사용 중이면 거부. */
export function canSavePinDraft(verdict: PinDraftVerdict): boolean {
  return verdict.state === "free" || verdict.state === "self";
}
