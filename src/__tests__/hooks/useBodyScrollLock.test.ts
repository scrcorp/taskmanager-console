/**
 * useBodyScrollLock 테스트.
 *
 * 테스트 범위:
 * - locked=true: body overflow:hidden + html/body overscroll-behavior:none 적용
 * - locked=false: 아무 스타일도 건드리지 않음
 * - locked true→false: 이전 인라인 스타일 복원
 * - 언마운트: 이전 인라인 스타일 복원
 * - 기존 인라인 스타일이 있던 경우에도 원래 값으로 정확히 복원
 */

import { describe, it, expect, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useBodyScrollLock } from "@/hooks/useBodyScrollLock";

const html = () => document.documentElement;
const body = () => document.body;

beforeEach(() => {
  body().style.overflow = "";
  body().style.overscrollBehavior = "";
  html().style.overscrollBehavior = "";
});

describe("useBodyScrollLock", () => {
  it("locked=true 면 배경 스크롤을 잠근다", () => {
    renderHook(() => useBodyScrollLock(true));

    expect(body().style.overflow).toBe("hidden");
    expect(body().style.overscrollBehavior).toBe("none");
    expect(html().style.overscrollBehavior).toBe("none");
  });

  it("locked=false 면 스타일을 건드리지 않는다", () => {
    renderHook(() => useBodyScrollLock(false));

    expect(body().style.overflow).toBe("");
    expect(body().style.overscrollBehavior).toBe("");
    expect(html().style.overscrollBehavior).toBe("");
  });

  it("locked 가 true→false 로 바뀌면 원복한다", () => {
    const { rerender } = renderHook(({ locked }) => useBodyScrollLock(locked), {
      initialProps: { locked: true },
    });
    expect(body().style.overflow).toBe("hidden");

    rerender({ locked: false });

    expect(body().style.overflow).toBe("");
    expect(body().style.overscrollBehavior).toBe("");
    expect(html().style.overscrollBehavior).toBe("");
  });

  it("언마운트되면 원복한다", () => {
    const { unmount } = renderHook(() => useBodyScrollLock(true));
    expect(body().style.overflow).toBe("hidden");

    unmount();

    expect(body().style.overflow).toBe("");
    expect(body().style.overscrollBehavior).toBe("");
    expect(html().style.overscrollBehavior).toBe("");
  });

  it("기존 인라인 스타일이 있으면 그 값으로 복원한다", () => {
    body().style.overflow = "scroll";
    html().style.overscrollBehavior = "auto";

    const { unmount } = renderHook(() => useBodyScrollLock(true));
    expect(body().style.overflow).toBe("hidden");
    expect(html().style.overscrollBehavior).toBe("none");

    unmount();

    expect(body().style.overflow).toBe("scroll");
    expect(html().style.overscrollBehavior).toBe("auto");
  });
});
