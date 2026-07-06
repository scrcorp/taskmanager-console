"use client";

import React from "react";
import { formatWatermarkTime } from "@/lib/utils";

interface TimeWatermarkProps {
  /** 표시할 시각 ISO 문자열 — 찍힌 시점(capture_time) 우선, 폴백 수신시각.
   *  결정은 photoWatermarkTime() 에서. null/없으면 시각 대신 "No time" 을 표시(UI는 항상 렌더). */
  time: string | null | undefined;
  /** store/org 타임존 — 없으면 브라우저 로컬. */
  timezone?: string;
  /** 표시 형태:
   *  - "overlay"(기본): 썸네일 위 우하단 고정 pill (부모 `relative` 필요)
   *  - "caption": 부모가 배치하는 인라인 바 (Lightbox 가 이미지 하단에 도킹) */
  variant?: "overlay" | "caption";
  /** overlay 글자 크기 — 그리드 썸네일(xs)과 큰 썸네일(sm) 구분용. */
  size?: "xs" | "sm";
  /** capture_time 출처("live"|"gallery"|"unknown"). "live" 외(갤러리/미상)면 시각 신뢰도가
   *  낮으므로 caption 에서 출처 힌트를 함께 표시한다. overlay 에선 공간상 생략. */
  captureSource?: string | null;
}

function ClockIcon({ className }: { className: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

/** 사진이 찍힌 시각을 표시하는 표시 전용 워터마크(픽셀에 굽지 않음).
 *  반투명 다크 배경 + 시계 아이콘 + 타임존 라벨(PDT/KST 등) 포함 시각.
 *  time 이 없어도(레거시·EXIF없음) UI 자체는 그리고, 시각 대신 "No time" 을 흐리게 표시한다
 *  (무음 실패 금지 — 워터마크가 사라지지 않게).
 */
export function TimeWatermark({
  time,
  timezone,
  variant = "overlay",
  size = "xs",
  captureSource,
}: TimeWatermarkProps) {
  // 시각 정보 부재 시에도 pill 은 그리되, 시각 대신 "No time" 을 흐린 톤으로.
  const label = time ? formatWatermarkTime(time, timezone) : "No time";
  const hasTime = !!time;
  const fromGallery = hasTime && !!captureSource && captureSource !== "live";
  const toneCls = hasTime ? "text-white" : "text-white/55";

  if (variant === "caption") {
    // 매니저가 시각을 검수하는 큰 화면용 — 읽기 쉬운 크기 + 출처 힌트.
    return (
      <div
        className={`pointer-events-none inline-flex items-center gap-1.5 rounded-md bg-black/70 px-3 py-1.5 text-base font-medium backdrop-blur-sm ${toneCls}`}
      >
        <ClockIcon className="h-4 w-4 shrink-0" />
        <span>{label}</span>
        {fromGallery && (
          <span className="ml-0.5 text-sm font-normal text-amber-300/90">
            · from gallery
          </span>
        )}
      </div>
    );
  }

  // overlay: 썸네일 위 우상단 고정 pill.
  const textCls = size === "sm" ? "text-sm" : "text-xs";
  const iconCls = size === "sm" ? "h-4 w-4" : "h-3.5 w-3.5";

  return (
    <div
      className={`pointer-events-none absolute top-1 right-1 flex items-center gap-1 rounded bg-black/70 px-1.5 py-0.5 font-medium backdrop-blur-sm ${textCls} ${toneCls}`}
    >
      <ClockIcon className={`${iconCls} shrink-0`} />
      <span>{label}</span>
    </div>
  );
}
