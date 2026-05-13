/**
 * useMidnightRefresh — 자정/business-day 경계가 넘어가면 자동으로 재계산되는 hook.
 *
 * 페이지를 24시간 이상 켜두면 `new Date()` 로 한 번 계산한 "오늘" 값이 그대로 굳어
 * stale 데이터를 보여주는 버그가 console 전반에 있어서 그걸 막는 공통 도구.
 *
 * 사용 예:
 *   const today = useMidnightRefresh((tz) => todayInTimezone(tz), [tz]);
 *   // tz 가 바뀌거나 분이 바뀔 때마다 자동 재계산 → today 값 변할 때만 리렌더
 *
 * 구현 노트:
 *   - 1분 단위로 polling (자정 정확히 깔끔하게 잡으려고 setTimeout 으로 다음 분까지
 *     기다리는 식보다 단순/안전). 분 단위 latency 는 일반 dashboard UX 에서 무해.
 *   - 결과값이 실제로 바뀌었을 때만 setState → 불필요한 리렌더 회피.
 *   - tab visibility 가 hidden 이면 timer 가 throttle 되어 정확도가 떨어지므로
 *     visibilitychange 시 한 번 즉시 재계산.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export function useMidnightRefresh<T>(
  compute: () => T,
  deps: ReadonlyArray<unknown>,
): T {
  // ESLint exhaustive-deps 회피용 — compute 함수를 deps 로 받은 값에 맞춰 안정화.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const memoCompute = useCallback(compute, deps);
  const [value, setValue] = useState<T>(() => memoCompute());
  const valueRef = useRef<T>(value);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  useEffect(() => {
    // deps 가 바뀐 즉시 동기 계산.
    setValue((prev) => {
      const next = memoCompute();
      return Object.is(prev, next) ? prev : next;
    });

    const tick = () => {
      const next = memoCompute();
      if (!Object.is(valueRef.current, next)) {
        setValue(next);
      }
    };

    const id = window.setInterval(tick, 60_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [memoCompute]);

  return value;
}
