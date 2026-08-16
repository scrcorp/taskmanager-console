/**
 * 파일 다운로드 공용 유틸 — blob 응답을 받아 브라우저 다운로드로 흘린다.
 *
 * 기존에 usePayroll.ts(module-private) / dashboard page / useChecklists 세 곳에
 * 같은 패턴이 중복돼 있었다. 신규 export(Staff/Attendance)부터 이 유틸을 쓰고,
 * 기존 세 곳은 별도 정리 때 이관한다 (동작 동일 — 여기 모으는 것뿐).
 */

import { parseApiError } from "@/lib/utils";

export function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Content-Disposition 헤더에서 파일명 추출 (RFC 5987 filename* 우선). 실패 시 fallback. */
export function filenameFromDisposition(header: string | undefined, fallback: string): string {
  if (!header) return fallback;
  const star = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (star?.[1]) {
    try {
      return decodeURIComponent(star[1]);
    } catch {
      /* fallthrough */
    }
  }
  const plain = /filename="?([^\";]+)"?/i.exec(header);
  return plain?.[1] ?? fallback;
}

/**
 * blob 응답 에러 → 사용자 메시지.
 * responseType:"blob" 이면 에러 바디도 Blob 이라 JSON 을 직접 읽어야 detail 이 나온다.
 */
export async function blobErrorMessage(err: unknown, fallback: string): Promise<string> {
  const data = (err as { response?: { data?: unknown } })?.response?.data;
  if (data instanceof Blob) {
    try {
      const parsed = JSON.parse(await data.text()) as { detail?: unknown };
      if (typeof parsed.detail === "string" && parsed.detail.trim()) {
        return parsed.detail;
      }
      if (parsed.detail && typeof parsed.detail === "object") {
        const m = (parsed.detail as { message?: unknown }).message;
        if (typeof m === "string" && m.trim()) return m;
      }
    } catch {
      // blob 이 JSON 이 아니면 fallback 경로로
    }
  }
  return parseApiError(err, fallback);
}
