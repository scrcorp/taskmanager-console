"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * useState 와 동일한 API 지만 값을 sessionStorage 에 자동 저장.
 * - 새로고침 / 뒤로가기 / 같은 탭 내 페이지 이동에서는 값 유지
 * - 새 탭 / 다른 브라우저에서는 독립 (URL 변경 X 라 history 에 영향 없음)
 *
 * key 는 전역 충돌 방지를 위해 prefix 로 모듈 영역 명시 권장 ("hiring:tab" 등).
 */
export function useSessionState<T>(
  key: string,
  initialValue: T,
): [T, (next: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(initialValue);

  // 첫 마운트에 sessionStorage 에서 복원
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.sessionStorage.getItem(key);
      if (raw !== null) {
        setValue(JSON.parse(raw) as T);
      }
    } catch {
      // 파싱 실패 시 무시 (initial 유지)
    }
    // key 만 dep — initialValue 가 바뀌어도 한 번 복원이면 충분
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const set = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const computed =
          typeof next === "function"
            ? (next as (p: T) => T)(prev)
            : next;
        try {
          if (typeof window !== "undefined") {
            window.sessionStorage.setItem(key, JSON.stringify(computed));
          }
        } catch {
          // 저장 실패 (quota 등) 는 silently 무시
        }
        return computed;
      });
    },
    [key],
  );

  return [value, set];
}
