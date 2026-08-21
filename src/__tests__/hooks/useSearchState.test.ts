/**
 * useSearchState — 검색 입력 동작의 계약 테스트.
 *
 * 이 훅이 지키기로 한 것:
 *  1. 입력(draft)은 즉시, 커밋(committed)은 디바운스 후 — 이 분리가 깨지면
 *     글자마다 URL 라우팅이 돌아 목록 페이지가 버벅인다(원래 버그).
 *  2. clear 는 디바운스를 기다리지 않는다 — × 버튼이 먹통처럼 보이면 안 된다.
 *  3. 외부(URL)에서 값이 바뀌면 입력칸도 따라간다 — 뒤로가기·필터 초기화.
 *  4. 조합 중에도 커밋은 계속된다 — 검색은 중간 결과가 보여야 정상이다.
 *     (텍스트를 소비하는 Enter 제출과 반대 판단. lib/ime.ts 주석 참조)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useSearchState } from "@/hooks/useSearchState";

describe("useSearchState", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("입력은 즉시 반영되고 커밋은 디바운스된다", () => {
    const { result } = renderHook(() => useSearchState({ delay: 300 }));

    act(() => result.current.onChange({ target: { value: "hong" } }));
    expect(result.current.value).toBe("hong");
    expect(result.current.committed).toBe("");
    expect(result.current.isPending).toBe(true);

    act(() => void vi.advanceTimersByTime(300));
    expect(result.current.committed).toBe("hong");
    expect(result.current.isPending).toBe(false);
  });

  it("연속 입력은 마지막 값 한 번만 커밋한다", () => {
    const commit = vi.fn();
    const { result, rerender } = renderHook(
      ({ v }) => useSearchState({ param: { value: v, commit }, delay: 300 }),
      { initialProps: { v: "" } },
    );

    act(() => result.current.onChange({ target: { value: "h" } }));
    act(() => void vi.advanceTimersByTime(100));
    act(() => result.current.onChange({ target: { value: "ho" } }));
    act(() => void vi.advanceTimersByTime(100));
    act(() => result.current.onChange({ target: { value: "hong" } }));
    expect(commit).not.toHaveBeenCalled();

    act(() => void vi.advanceTimersByTime(300));
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledWith("hong");
    rerender({ v: "hong" });
  });

  it("clear 는 디바운스를 기다리지 않고 즉시 비운다", () => {
    const { result } = renderHook(() => useSearchState({ delay: 300 }));
    act(() => result.current.onChange({ target: { value: "hong" } }));
    act(() => void vi.advanceTimersByTime(300));
    expect(result.current.committed).toBe("hong");

    act(() => result.current.clear());
    expect(result.current.value).toBe("");
    expect(result.current.committed).toBe("");
  });

  it("외부에서 값이 바뀌면 입력칸이 따라간다 (뒤로가기·필터 초기화)", () => {
    const commit = vi.fn();
    const { result, rerender } = renderHook(
      ({ v }) => useSearchState({ param: { value: v, commit }, delay: 300 }),
      { initialProps: { v: "hong" } },
    );
    expect(result.current.value).toBe("hong");

    rerender({ v: "" }); // "Clear filters" 가 URL 파라미터를 지운 상황
    expect(result.current.value).toBe("");
    expect(result.current.committed).toBe("");
  });

  it("IME 조합 중에도 커밋이 멈추지 않는다", () => {
    const { result } = renderHook(() => useSearchState({ delay: 100 }));

    act(() => result.current.imeProps.onCompositionStart());
    act(() => result.current.onChange({ target: { value: "호" } }));
    act(() => void vi.advanceTimersByTime(100));
    // 조합 중이라고 결과를 멈추면 '홍'을 치고 멈춘 사용자에게 아무것도 안 보인다
    expect(result.current.committed).toBe("호");

    act(() => result.current.imeProps.onCompositionEnd({ currentTarget: { value: "홍" } }));
    act(() => void vi.advanceTimersByTime(100));
    expect(result.current.committed).toBe("홍");
  });

  it("minLength 미만은 빈 문자열로 커밋한다 (서버 검색용)", () => {
    const { result } = renderHook(() => useSearchState({ delay: 100, minLength: 2 }));
    act(() => result.current.onChange({ target: { value: "h" } }));
    act(() => void vi.advanceTimersByTime(100));
    expect(result.current.committed).toBe("");

    act(() => result.current.onChange({ target: { value: "ho" } }));
    act(() => void vi.advanceTimersByTime(100));
    expect(result.current.committed).toBe("ho");
  });
});
