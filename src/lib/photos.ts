import type { ChecklistItemFile } from "@/types";

/** 콘솔 사진 표시용 정규화 모델.
 *  - thumbUrl: 그리드/썸네일 로딩용 (서버가 파생 부재 시 full 로 폴백해 내려줌)
 *  - url: Lightbox 등 원본 표시용
 *  - captureTime: 사진이 찍힌 시점(라이브=셔터 / 갤러리=EXIF) — 워터마크 1순위 소스
 *  - receivedAt: 서버 수신시각 — captureTime 부재 시(레거시·EXIF없음) 폴백
 *  - captureSource: capture_time 출처("live"|"gallery"|"unknown") — 갤러리 사진은 시각 신뢰도가 낮아 표시 시 구분
 */
export interface ReviewPhoto {
  url: string;
  thumbUrl: string;
  captureTime: string | null;
  receivedAt: string | null;
  captureSource: string | null;
}

/** ChecklistItemFile 배열 → ReviewPhoto 배열.
 *  thumb_url 이 비면 file_url 로 폴백(구버전 응답/파생 부재 호환).
 *  caller 가 미리 context/sort 로 거른 파일을 넘긴다고 가정.
 */
export function toReviewPhotos(files: ChecklistItemFile[]): ReviewPhoto[] {
  return files.map((f) => ({
    url: f.file_url,
    thumbUrl: f.thumb_url ?? f.file_url,
    captureTime: f.capture_time ?? null,
    receivedAt: f.received_at ?? null,
    captureSource: f.capture_source ?? null,
  }));
}

/** 워터마크에 표시할 시각: 찍힌 시점(capture_time) 우선, 없으면 서버 수신시각 폴백. */
export function photoWatermarkTime(photo: ReviewPhoto): string | null {
  return photo.captureTime ?? photo.receivedAt;
}
