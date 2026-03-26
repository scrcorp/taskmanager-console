"use client";

/**
 * 사진 그리드 컴포넌트 -- 1장은 전체, 2-3장은 행, 4장 이상은 그리드(+N 오버레이).
 *
 * Displays multiple photos: 1=single, 2-3=row, 4+=grid with "+N more" overlay.
 * Clicking any photo opens Lightbox gallery with left/right navigation.
 */

import React, { useState } from "react";
import { cn } from "@/lib/utils";
import { Lightbox } from "@/components/ui";

interface PhotoGridProps {
  urls: string[];
  maxVisible?: number;
  className?: string;
}

export function PhotoGrid({ urls, maxVisible = 4, className }: PhotoGridProps): React.ReactElement | null {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  if (urls.length === 0) return null;

  const visible = urls.slice(0, maxVisible);
  const overflow = urls.length - maxVisible;

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
        {visible.map((url, i) => {
          const isLast = i === visible.length - 1 && overflow > 0;
          return (
            <div
              key={url}
              className={cn(
                "relative overflow-hidden rounded",
                visible.length === 1 ? "aspect-video" : "aspect-square",
              )}
            >
              <img
                src={url}
                alt={`Photo ${i + 1}`}
                className={imgClass}
                onClick={() => setLightboxIndex(i)}
              />
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
          urls={urls}
          initialIndex={lightboxIndex}
        />
      )}
    </>
  );
}
