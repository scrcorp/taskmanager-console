"use client";

/**
 * URL search params 기반 상태 관리 훅.
 * 뒤로가기 시 이전 필터/페이지 상태를 자동 복원합니다.
 *
 * URL search params based state management hook.
 * Automatically restores previous filter/page state on browser back navigation.
 */

import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useCallback, useRef } from "react";

/**
 * URL search params를 상태로 사용하는 훅.
 * 기본값과 같은 값은 URL에서 생략하여 깔끔하게 유지합니다.
 *
 * @param defaults - 각 파라미터의 기본값 (URL에 없을 때 사용)
 * @returns [params, setParams] - 현재 값과 업데이트 함수
 *
 * @example
 * const [params, setParams] = useUrlParams({ store: "", status: "", page: "1" });
 * // Read: params.store, params.page
 * // Update (batch): setParams({ store: "abc", page: null })
 * // null or "" or default → removes from URL
 */
export function useUrlParams<K extends string>(
  defaults: Record<K, string>,
): [Record<K, string>, (updates: Partial<Record<K, string | null>>) => void] {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const defaultsRef = useRef(defaults);

  // Read current values from URL, falling back to defaults
  const params = {} as Record<K, string>;
  for (const key in defaultsRef.current) {
    params[key] = searchParams.get(key) ?? defaultsRef.current[key];
  }

  // Batch update URL params
  const setParams = useCallback(
    (updates: Partial<Record<K, string | null>>) => {
      const newParams = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (
          value === null ||
          value === undefined ||
          value === "" ||
          value === defaultsRef.current[key as K]
        ) {
          newParams.delete(key);
        } else {
          newParams.set(key, value as string);
        }
      }
      const qs = newParams.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [searchParams, router, pathname],
  );

  return [params, setParams];
}
