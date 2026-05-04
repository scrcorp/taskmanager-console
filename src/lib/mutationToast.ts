/**
 * @deprecated 이름은 "toast"지만 실제로는 ResultModal 을 띄운다 — 사용자 행동 결과 인지를 위해.
 *
 * 새 코드에선 `useMutationResult` (src/lib/mutationResult.ts) 를 직접 사용하세요.
 * 기존 호출처 호환을 위해 alias 유지.
 */

import { useMutationResult } from "@/lib/mutationResult";

export function useMutationToast() {
  const { success, error, rawError } = useMutationResult();
  return {
    success,
    error,
    rawError,
  };
}
