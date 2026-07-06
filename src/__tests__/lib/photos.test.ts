/**
 * photos 유틸리티 테스트 — ChecklistItemFile → ReviewPhoto 정규화 + 워터마크 시각 선택.
 *
 * 테스트 범위:
 * - thumb_url 이 있으면 thumbUrl 로 사용, null 이면 file_url 폴백
 * - capture_time / received_at 패스스루, 없으면 null
 * - photoWatermarkTime: capture_time 우선, 없으면 received_at 폴백, 둘 다 없으면 null
 */

import { describe, it, expect } from "vitest";
import { toReviewPhotos, photoWatermarkTime } from "@/lib/photos";
import type { ChecklistItemFile } from "@/types";

function makeFile(overrides: Partial<ChecklistItemFile> = {}): ChecklistItemFile {
  return {
    id: "f1",
    context: "submission",
    context_id: "s1",
    file_url: "completions/2026/06/22/a.webp",
    thumb_url: "completions/2026/06/22/a.thumb.webp",
    file_type: "image/webp",
    sort_order: 0,
    capture_time: "2026-06-22T09:00:00Z",
    capture_source: "live",
    received_at: "2026-06-22T09:30:00Z",
    ...overrides,
  };
}

describe("toReviewPhotos", () => {
  it("maps file_url/thumb_url/capture_time/capture_source/received_at onto ReviewPhoto", () => {
    const [p] = toReviewPhotos([makeFile()]);
    expect(p.url).toBe("completions/2026/06/22/a.webp");
    expect(p.thumbUrl).toBe("completions/2026/06/22/a.thumb.webp");
    expect(p.captureTime).toBe("2026-06-22T09:00:00Z");
    expect(p.captureSource).toBe("live");
    expect(p.receivedAt).toBe("2026-06-22T09:30:00Z");
  });

  it("passes the gallery provenance through (drives the 'from gallery' hint)", () => {
    const [p] = toReviewPhotos([makeFile({ capture_source: "gallery" })]);
    expect(p.captureSource).toBe("gallery");
  });

  it("yields null capture_source for legacy rows", () => {
    const [p] = toReviewPhotos([makeFile({ capture_source: null })]);
    expect(p.captureSource).toBeNull();
  });

  it("falls back to file_url when thumb_url is null", () => {
    const [p] = toReviewPhotos([makeFile({ thumb_url: null })]);
    expect(p.thumbUrl).toBe(p.url);
    expect(p.thumbUrl).toBe("completions/2026/06/22/a.webp");
  });

  it("yields null capture/received for legacy rows", () => {
    const [p] = toReviewPhotos([makeFile({ capture_time: null, received_at: null })]);
    expect(p.captureTime).toBeNull();
    expect(p.receivedAt).toBeNull();
  });

  it("preserves order of the input array", () => {
    const photos = toReviewPhotos([
      makeFile({ id: "a", file_url: "a.webp" }),
      makeFile({ id: "b", file_url: "b.webp" }),
    ]);
    expect(photos.map((p) => p.url)).toEqual(["a.webp", "b.webp"]);
  });
});

describe("photoWatermarkTime", () => {
  it("prefers capture_time (찍힌 시점) over received_at", () => {
    const [p] = toReviewPhotos([makeFile()]);
    expect(photoWatermarkTime(p)).toBe("2026-06-22T09:00:00Z");
  });

  it("falls back to received_at when capture_time is null (레거시·EXIF없음)", () => {
    const [p] = toReviewPhotos([makeFile({ capture_time: null })]);
    expect(photoWatermarkTime(p)).toBe("2026-06-22T09:30:00Z");
  });

  it("yields null when neither capture_time nor received_at exists", () => {
    const [p] = toReviewPhotos([makeFile({ capture_time: null, received_at: null })]);
    expect(photoWatermarkTime(p)).toBeNull();
  });
});
