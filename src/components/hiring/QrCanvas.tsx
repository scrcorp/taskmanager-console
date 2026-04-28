"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import QRCode from "qrcode";

export interface QrCanvasHandle {
  /** 현재 캔버스를 PNG Blob으로 출력. */
  toPngBlob: () => Promise<Blob | null>;
  /** 현재 캔버스를 PNG Data URL로 출력 (인쇄용). */
  toPngDataUrl: () => string | null;
}

interface Props {
  data: string;
  size?: number;
  /** QR 주변 여백 (modules). 인쇄용 큰 사이즈에선 4 이상 권장. */
  margin?: number;
}

/** `qrcode` 라이브러리로 실제 스캔 가능한 QR 코드를 그리는 캔버스. */
export const QrCanvas = forwardRef<QrCanvasHandle, Props>(function QrCanvas(
  { data, size = 220, margin = 2 },
  ref,
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data) return;
    QRCode.toCanvas(canvas, data, {
      width: size,
      margin,
      errorCorrectionLevel: "M",
      color: { dark: "#1A1D27", light: "#FFFFFF" },
    }).catch((err: unknown) => {
      console.error("QR render failed:", err);
    });
  }, [data, size, margin]);

  useImperativeHandle(
    ref,
    () => ({
      toPngBlob: () =>
        new Promise<Blob | null>((resolve) => {
          const canvas = canvasRef.current;
          if (!canvas) {
            resolve(null);
            return;
          }
          canvas.toBlob((blob) => resolve(blob), "image/png");
        }),
      toPngDataUrl: () => canvasRef.current?.toDataURL("image/png") ?? null,
    }),
    [],
  );

  return (
    <canvas
      ref={canvasRef}
      className="rounded-lg bg-white ring-1 ring-[#E2E4EA]"
      style={{ width: size, height: size }}
    />
  );
});
