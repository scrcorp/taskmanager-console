"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import { X, ZoomIn, ZoomOut, RotateCcw } from "lucide-react";

interface LightboxProps {
  isOpen: boolean;
  onClose: () => void;
  src: string;
  alt?: string;
}

function isVideo(url: string): boolean {
  return /\.(mp4|mov|webm|avi|mkv)(\?|$)/i.test(url);
}

export function Lightbox({ isOpen, onClose, src, alt }: LightboxProps): React.ReactElement | null {
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragOrigin = useRef({ x: 0, y: 0 });
  const didDrag = useRef(false);
  const mediaRef = useRef<HTMLDivElement>(null);

  const resetView = useCallback(() => {
    setScale(1);
    setTranslate({ x: 0, y: 0 });
  }, []);

  // Reset when closing or src changes
  useEffect(() => {
    if (!isOpen) resetView();
  }, [isOpen, src, resetView]);

  // ESC — capture phase + stopImmediatePropagation so parent Modal doesn't close
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopImmediatePropagation();
        e.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [isOpen, onClose]);

  // Wheel zoom — native listener with { passive: false }
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

  if (!isOpen) return null;

  const isVid = isVideo(src);

  return (
    <div
      className="fixed inset-0 z-[60] flex flex-col bg-black/90"
      onClick={(e) => { if (!didDrag.current && e.target === e.currentTarget) onClose(); }}
    >
      {/* Top bar */}
      <div className="flex items-center justify-end gap-1 px-3 py-2 shrink-0">
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

      {/* Media area */}
      <div
        ref={mediaRef}
        className="flex-1 flex items-center justify-center overflow-hidden p-4 md:p-12"
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
        {isVid ? (
          <video
            src={src}
            controls
            autoPlay
            className="max-w-full max-h-full rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <img
            src={src}
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
      </div>
    </div>
  );
}
