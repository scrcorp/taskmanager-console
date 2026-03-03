"use client";

import React, { useEffect, useCallback } from "react";
import { X } from "lucide-react";

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
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    }
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [isOpen, handleKeyDown]);

  if (!isOpen) return null;

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
      onClick={handleBackdropClick}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-4 p-2 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
        aria-label="Close lightbox"
      >
        <X className="h-6 w-6" />
      </button>
      {isVideo(src) ? (
        <video
          src={src}
          controls
          autoPlay
          className="max-w-[90vw] max-h-[85vh] rounded-lg"
        />
      ) : (
        <img
          src={src}
          alt={alt ?? ""}
          className="max-w-[90vw] max-h-[85vh] object-contain rounded-lg"
        />
      )}
    </div>
  );
}
