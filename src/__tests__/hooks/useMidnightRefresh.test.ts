/**
 * useMidnightRefresh — 자정/business-day 경계 자동 재계산 hook 검증.
 *
 * 시간 시뮬레이션:
 *   - vi.useFakeTimers() 로 system clock 고정
 *   - vi.advanceTimersByTime(N) 은 fake clock + timer 둘 다 같이 진행한다
 *     → setInterval 1분 콜백이 발화하면서 system time 도 1분 흐른 상태가 됨
 *   - 별도로 setSystemTime 을 다시 부르면 advance 효과와 충돌하니 한 번만 set 하고
 *     이후로는 advanceTimersByTime 로만 진행한다.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useMidnightRefresh } from "@/hooks/useMidnightRefresh";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

describe("useMidnightRefresh", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("자정 경계가 지나면 today 값이 새 날짜로 갱신된다", () => {
    // 2026-05-13 23:58:00Z 부터 시작.
    vi.setSystemTime(new Date("2026-05-13T23:58:00Z"));
    const { result } = renderHook(() => useMidnightRefresh(today, []));
    expect(result.current).toBe("2026-05-13");

    // +60s → 23:59. 같은 날.
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(result.current).toBe("2026-05-13");

    // +60s → 00:00 (다음 날). 자정 트리거.
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(result.current).toBe("2026-05-14");
  });

  it("동일 분 안에서 polling 이 돌아도 결과값이 안 바뀌면 setState 발생 안 함", () => {
    vi.setSystemTime(new Date("2026-05-13T12:00:00Z"));
    let computeCalls = 0;
    const { result } = renderHook(() =>
      useMidnightRefresh(() => {
        computeCalls++;
        return today();
      }, []),
    );
    const initialRender = result.current;
    const initialCalls = computeCalls;

    // 1분 polling — 같은 날
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(result.current).toBe(initialRender);

    // 또 1분 — 여전히 같은 날
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(result.current).toBe(initialRender);

    // compute 자체는 polling 마다 호출 (변화 비교용), 다만 결과가 같아 setState skip
    expect(computeCalls).toBeGreaterThan(initialCalls);
  });

  it("visibilitychange (탭이 다시 보일 때) 즉시 재계산한다", () => {
    vi.setSystemTime(new Date("2026-05-13T23:59:00Z"));
    const { result } = renderHook(() => useMidnightRefresh(today, []));
    expect(result.current).toBe("2026-05-13");

    // 백그라운드에서 자정 넘어감. polling timer 는 throttle 가정 — 우리는
    // advance 안 하고 system time 만 점프.
    vi.setSystemTime(new Date("2026-05-14T00:01:00Z"));
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible",
    });
    act(() => {
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(result.current).toBe("2026-05-14");
  });

  it("deps 변경 시 즉시 재계산 — timezone 가 다르면 today 다르게 잡힌다", () => {
    // UTC 14:00 → LA(-7) = 07:00 (5/13), Sydney(+10 DST) = 00:00 (5/14)
    vi.setSystemTime(new Date("2026-05-13T14:00:00Z"));

    const computeFor = (zone: string) => () =>
      new Intl.DateTimeFormat("en-CA", {
        timeZone: zone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date());

    const { result, rerender } = renderHook(
      ({ zone }: { zone: string }) =>
        useMidnightRefresh(computeFor(zone), [zone]),
      { initialProps: { zone: "America/Los_Angeles" } },
    );
    expect(result.current).toBe("2026-05-13");

    rerender({ zone: "Australia/Sydney" });
    expect(result.current).toBe("2026-05-14");
  });
});
