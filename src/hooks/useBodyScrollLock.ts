/**
 * 오버레이(드로어/모달)가 열려 있는 동안 배경 스크롤을 잠그는 훅.
 *
 * 모바일에서 오버레이 안의 스크롤 영역이 끝에 닿으면 스크롤 제스처가 뒤쪽 문서로
 * 체이닝되어(scroll chaining) 배경이 움직이거나 브라우저 툴바가 토글된다.
 * overflow:hidden 으로 문서 스크롤을 막고 overscroll-behavior:none 으로
 * 고무줄(rubber-band)/pull-to-refresh 까지 차단한다.
 *
 * 언마운트 또는 locked=false 로 바뀌면 이전 인라인 스타일을 그대로 복원한다.
 */
import { useEffect } from "react";

export function useBodyScrollLock(locked: boolean): void {
  useEffect(() => {
    if (!locked) return;
    const html = document.documentElement;
    const { body } = document;
    const prev = {
      bodyOverflow: body.style.overflow,
      bodyOverscroll: body.style.overscrollBehavior,
      htmlOverscroll: html.style.overscrollBehavior,
    };
    body.style.overflow = "hidden";
    body.style.overscrollBehavior = "none";
    html.style.overscrollBehavior = "none";
    return () => {
      body.style.overflow = prev.bodyOverflow;
      body.style.overscrollBehavior = prev.bodyOverscroll;
      html.style.overscrollBehavior = prev.htmlOverscroll;
    };
  }, [locked]);
}
