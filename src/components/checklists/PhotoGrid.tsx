"use client";

/**
 * 사진 그리드 컴포넌트 -- 1장은 전체, 2-3장은 행, 4장 이상은 그리드(+N 오버레이).
 *
 * Displays multiple photos: 1=single, 2-3=row, 4+=grid with "+N more" overlay.
 * Clicking any photo opens Lightbox gallery with left/right navigation.
 *
 * 그리드는 썸네일(thumbUrl)을 로드하고 Lightbox 는 원본(url)을 띄운다.
 * 각 사진에는 찍힌 시각 워터마크(TimeWatermark)를 겹쳐 표시한다.
 */

import React, { useState } from "react";
import { cn } from "@/lib/utils";
import { Lightbox, TimeWatermark } from "@/components/ui";
import { photoWatermarkTime, type ReviewPhoto } from "@/lib/photos";

interface PhotoGridProps {
  photos: ReviewPhoto[];
  /** store/org 타임존 — 워터마크 시각 변환용. */
  timezone?: string;
  maxVisible?: number;
  className?: string;
}

export function PhotoGrid({ photos, timezone, maxVisible = 4, className }: PhotoGridProps): React.ReactElement | null {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  if (photos.length === 0) return null;

  const visible = photos.slice(0, maxVisible);
  const overflow = photos.length - maxVisible;

  const imgClass = "w-full h-full object-cover rounded cursor-pointer hover:opacity-80 transition-opacity";

  const colMap: Record<number, string> = { 1: "grid-cols-1", 2: "grid-cols-2", 3: "grid-cols-3" };
  let gridClass = "";
  if (visible.length === 1) {
    gridClass = "grid grid-cols-1";
  } else if (visible.length <= 3) {
    gridClass = `grid ${colMap[visible.length] ?? "grid-cols-2"}`;
  } else {
    gridClass = "grid grid-cols-2";
  }

  return (
    <>
      <div className={cn(gridClass, "gap-1", className)}>
        {visible.map((photo, i) => {
          const isLast = i === visible.length - 1 && overflow > 0;
          return (
            <div
              key={photo.url}
              className={cn(
                "relative overflow-hidden rounded",
                visible.length === 1 ? "aspect-video" : "aspect-square",
              )}
            >
              <img
                src={photo.thumbUrl}
                alt={`Photo ${i + 1}`}
                className={imgClass}
                onClick={() => setLightboxIndex(i)}
              />
              {/* +N 오버레이가 있는 마지막 칸은 시각이 가려지므로 워터마크 생략 */}
              {!isLast && <TimeWatermark time={photoWatermarkTime(photo)} timezone={timezone} />}
              {isLast && overflow > 0 && (
                <button
                  type="button"
                  onClick={() => setLightboxIndex(i)}
                  className="absolute inset-0 flex items-center justify-center bg-black/50 rounded text-white text-sm font-bold"
                >
                  +{overflow + 1}
                </button>
              )}
            </div>
          );
        })}
      </div>

      {lightboxIndex !== null && (
        <Lightbox
          isOpen
          onClose={() => setLightboxIndex(null)}
          urls={photos.map((p) => p.url)}
          captureTimes={photos.map((p) => photoWatermarkTime(p))}
          captureSources={photos.map((p) => p.captureSource)}
          timezone={timezone}
          initialIndex={lightboxIndex}
        />
      )}
    </>
  );
}
