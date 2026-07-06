/**
 * TimeWatermark 컴포넌트 테스트 — 찍힌 시각 표시 전용 워터마크.
 *
 * 테스트 범위:
 * - time 이 있으면 store-tz 로 변환한 시각 + 타임존 라벨을 렌더
 * - time 이 null/undefined 면 시각 대신 "No time" 을 흐리게 표시 (UI는 항상 렌더, 무음실패 금지)
 * - caption variant: 매니저 검수용 — 갤러리 출처면 "from gallery" 힌트 표시, live 면 생략
 * - overlay variant(기본): 썸네일용, 출처 힌트 없음
 */

import "@testing-library/jest-dom/vitest";
import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TimeWatermark } from "@/components/ui/TimeWatermark";

describe("TimeWatermark", () => {
  it("renders the given time, in the given timezone, with a tz label", () => {
    const { container } = render(
      <TimeWatermark time="2026-06-22T18:30:00Z" timezone="UTC" />,
    );
    // UTC: 18:30 그대로, 타임존 라벨 'UTC' 가 함께 표시되어야 매니저가 어느 지역 시각인지 안다.
    expect(screen.getByText(/Jun 22/)).toBeInTheDocument();
    expect(screen.getByText(/UTC/)).toBeInTheDocument();
    expect(container.querySelector("svg")).toBeInTheDocument(); // 시계 아이콘
  });

  it("shifts the rendered day to the store timezone", () => {
    // 2026-06-22T18:30Z → Asia/Seoul(UTC+9) 는 다음날 Jun 23.
    render(<TimeWatermark time="2026-06-22T18:30:00Z" timezone="Asia/Seoul" />);
    expect(screen.getByText(/Jun 23/)).toBeInTheDocument();
  });

  it("still renders (as 'No time') when time is null", () => {
    const { container } = render(<TimeWatermark time={null} />);
    // 무음 실패 금지 — 시각이 없어도 워터마크 UI 는 뜨고, 시각 대신 "No time".
    expect(container.firstChild).not.toBeNull();
    expect(screen.getByText(/No time/i)).toBeInTheDocument();
  });

  it("still renders (as 'No time') when time is undefined", () => {
    const { container } = render(<TimeWatermark time={undefined} />);
    expect(container.firstChild).not.toBeNull();
    expect(screen.getByText(/No time/i)).toBeInTheDocument();
  });

  describe("caption variant (manager review)", () => {
    it("shows a 'from gallery' hint when capture source is not live", () => {
      render(
        <TimeWatermark
          time="2026-06-22T18:30:00Z"
          timezone="UTC"
          variant="caption"
          captureSource="gallery"
        />,
      );
      expect(screen.getByText(/from gallery/i)).toBeInTheDocument();
    });

    it("shows the hint for unknown provenance too (low trust)", () => {
      render(
        <TimeWatermark
          time="2026-06-22T18:30:00Z"
          timezone="UTC"
          variant="caption"
          captureSource="unknown"
        />,
      );
      expect(screen.getByText(/from gallery/i)).toBeInTheDocument();
    });

    it("omits the hint when capture source is live (trusted shutter time)", () => {
      render(
        <TimeWatermark
          time="2026-06-22T18:30:00Z"
          timezone="UTC"
          variant="caption"
          captureSource="live"
        />,
      );
      expect(screen.queryByText(/from gallery/i)).not.toBeInTheDocument();
    });

    it("omits the hint when capture source is null (legacy rows)", () => {
      render(
        <TimeWatermark
          time="2026-06-22T18:30:00Z"
          timezone="UTC"
          variant="caption"
          captureSource={null}
        />,
      );
      expect(screen.queryByText(/from gallery/i)).not.toBeInTheDocument();
    });
  });

  describe("overlay variant (thumbnail)", () => {
    it("never shows the provenance hint (no space on thumbnails)", () => {
      render(
        <TimeWatermark
          time="2026-06-22T18:30:00Z"
          timezone="UTC"
          variant="overlay"
          captureSource="gallery"
        />,
      );
      expect(screen.queryByText(/from gallery/i)).not.toBeInTheDocument();
    });
  });
});
