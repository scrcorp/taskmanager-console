"use client";

/**
 * 라이트박스 컴포넌트 — 이미지/동영상 전체화면 뷰어 (갤러리 지원).
 *
 * 기능:
 * - 단일 또는 복수 이미지 뷰어 (좌우 화살표 네비게이션)
 * - 이미지: 확대/축소(휠, 버튼, 더블클릭), 드래그 이동, 초기화
 * - 동영상: 컨트롤 포함 자동 재생
 * - ESC 키로 닫기 (capture phase에서 처리하여 부모 Modal과 충돌 방지)
 * - 좌우 화살표 키로 이미지 전환
 * - 배경 클릭으로 닫기 (드래그 후 클릭 구분)
 */

import React, { useState, useRef, useEffect, useCallback } from "react";
import { X, ZoomIn, ZoomOut, RotateCcw, ChevronLeft, ChevronRight } from "lucide-react";

interface LightboxProps {
  isOpen: boolean;
  onClose: () => void;
  /** Single image (backward compat) */
  src?: string;
  /** Multiple images for gallery mode */
  urls?: string[];
  /** Starting index when urls is provided */
  initialIndex?: number;
  alt?: string;
}

/** URL 확장자로 동영상 여부 판별 */
function isVideo(url: string): boolean {
  return /\.(mp4|mov|webm|avi|mkv)(\?|$)/i.test(url);
}

export function Lightbox({ isOpen, onClose, src, urls, initialIndex = 0, alt }: LightboxProps): React.ReactElement | null {
  const allUrls = urls && urls.length > 0 ? urls : src ? [src] : [];
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragOrigin = useRef({ x: 0, y: 0 });
  const didDrag = useRef(false);
  const mediaRef = useRef<HTMLDivElement>(null);

  const hasMultiple = allUrls.length > 1;
  const currentSrc = allUrls[currentIndex] ?? "";

  const resetView = useCallback(() => {
    setScale(1);
    setTranslate({ x: 0, y: 0 });
  }, []);

  // Reset index when initialIndex changes (new open)
  useEffect(() => {
    if (isOpen) setCurrentIndex(initialIndex);
  }, [isOpen, initialIndex]);

  // Reset zoom on image change or close
  useEffect(() => {
    resetView();
  }, [currentIndex, isOpen, resetView]);

  const goPrev = useCallback(() => {
    if (currentIndex > 0) setCurrentIndex((i) => i - 1);
  }, [currentIndex]);

  const goNext = useCallback(() => {
    if (currentIndex < allUrls.length - 1) setCurrentIndex((i) => i + 1);
  }, [currentIndex, allUrls.length]);

  // ESC + Arrow keys
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopImmediatePropagation();
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowLeft") {
        goPrev();
      } else if (e.key === "ArrowRight") {
        goNext();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [isOpen, onClose, goPrev, goNext]);

  // Wheel zoom
  useEffect(() => {
    if (!isOpen) return;
    const el = mediaRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.2 : 0.2;
      setScale((prev) => {
        const next = Math.round(Math.min(Math.max(prev + delta, 1), 5) * 10) / 10;
        if (next <= 1) setTranslate({ x: 0, y: 0 });
        return next;
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [isOpen]);

  const handleDoubleClick = useCallback(() => {
    if (scale > 1) {
      resetView();
    } else {
      setScale(2);
    }
  }, [scale, resetView]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (scale <= 1) return;
      setIsDragging(true);
      didDrag.current = false;
      dragOrigin.current = { x: e.clientX - translate.x, y: e.clientY - translate.y };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    [scale, translate],
  );

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging) return;
    didDrag.current = true;
    setTranslate({
      x: e.clientX - dragOrigin.current.x,
      y: e.clientY - dragOrigin.current.y,
    });
  }, [isDragging]);

  const handlePointerUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  if (!isOpen || allUrls.length === 0) return null;

  const isVid = isVideo(currentSrc);

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col bg-black/90"
      onClick={(e) => { if (!didDrag.current && e.target === e.currentTarget) onClose(); }}
    >
      {/* Top bar */}
      <div className="flex items-center justify-between px-3 py-2 shrink-0">
        {/* Counter */}
        <span className="text-white/60 text-sm font-mono select-none">
          {hasMultiple ? `${currentIndex + 1} / ${allUrls.length}` : ""}
        </span>

        <div className="flex items-center gap-1">
          {!isVid && (
            <>
              {scale > 1 && (
                <button
                  type="button"
                  onClick={resetView}
                  className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
                  title="Reset"
                >
                  <RotateCcw className="h-5 w-5" />
                </button>
              )}
              <button
                type="button"
                onClick={() => { setScale((p) => Math.max(p - 0.5, 1)); if (scale <= 1.5) setTranslate({ x: 0, y: 0 }); }}
                disabled={scale <= 1}
                className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 disabled:opacity-30 transition-colors"
                title="Zoom out"
              >
                <ZoomOut className="h-5 w-5" />
              </button>
              <span className="text-white/60 text-xs font-mono min-w-[4ch] text-center select-none">
                {Math.round(scale * 100)}%
              </span>
              <button
                type="button"
                onClick={() => setScale((p) => Math.min(p + 0.5, 5))}
                disabled={scale >= 5}
                className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 disabled:opacity-30 transition-colors"
                title="Zoom in"
              >
                <ZoomIn className="h-5 w-5" />
              </button>
            </>
          )}
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="Close"
          >
            <X className="h-6 w-6" />
          </button>
        </div>
      </div>

      {/* Media area */}
      <div
        ref={mediaRef}
        className="flex-1 flex items-center justify-center overflow-hidden p-4 md:p-12 relative"
        onDoubleClick={!isVid ? handleDoubleClick : undefined}
        onPointerDown={!isVid ? handlePointerDown : undefined}
        onPointerMove={!isVid ? handlePointerMove : undefined}
        onPointerUp={!isVid ? handlePointerUp : undefined}
        onClick={(e) => {
          if (didDrag.current) { didDrag.current = false; return; }
          if (e.target === e.currentTarget) onClose();
        }}
        style={{ cursor: isVid ? "default" : isDragging ? "grabbing" : scale > 1 ? "grab" : "zoom-in" }}
      >
        {/* Left arrow */}
        {hasMultiple && currentIndex > 0 && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); goPrev(); }}
            className="absolute left-4 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-black/50 text-white/80 hover:text-white hover:bg-black/70 transition-colors"
            aria-label="Previous"
          >
            <ChevronLeft className="h-6 w-6" />
          </button>
        )}

        {isVid ? (
          <video
            src={currentSrc}
            controls
            autoPlay
            className="max-w-full max-h-full rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <img
            src={currentSrc}
            alt={alt ?? ""}
            draggable={false}
            className="max-w-full max-h-full object-contain rounded-lg select-none"
            style={{
              transform: `scale(${scale}) translate(${translate.x / scale}px, ${translate.y / scale}px)`,
              transition: isDragging ? "none" : "transform 0.15s ease-out",
            }}
            onClick={(e) => e.stopPropagation()}
          />
        )}

        {/* Right arrow */}
        {hasMultiple && currentIndex < allUrls.length - 1 && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); goNext(); }}
            className="absolute right-4 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-black/50 text-white/80 hover:text-white hover:bg-black/70 transition-colors"
            aria-label="Next"
          >
            <ChevronRight className="h-6 w-6" />
          </button>
        )}
      </div>
    </div>
  );
}
