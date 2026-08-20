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
 * blob 응답을 그대로 다운로드 — 파일명은 서버가 붙인 Content-Disposition 을 따른다.
 *
 * 파일명의 단일 출처는 서버다. "어느 매장 / 어느 기간 / 언제 받은 것" 은 서버만
 * 알고, 클라이언트가 자기 나름대로 지으면 같은 export 인데 화면마다 이름이 갈린다.
 * fallback 은 헤더가 없는 옛 엔드포인트용 최후 수단.
 */
export function downloadFromResponse(
  response: { data: unknown; headers?: unknown },
  fallbackFilename: string,
  mimeType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
): void {
  const headers = (response.headers ?? {}) as Record<string, unknown>;
  const dispo = headers["content-disposition"];
  triggerBlobDownload(
    new Blob([response.data as BlobPart], { type: mimeType }),
    filenameFromDisposition(typeof dispo === "string" ? dispo : undefined, fallbackFilename),
  );
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

// ─── 클라이언트가 직접 만드는 파일(CSV 등)의 이름 ──────────────────────────
// 서버 규칙(server/app/utils/download.py: export_filename)과 같은 모양이어야
// 한 폴더에 섞였을 때 눈으로 정렬된다. 규칙을 바꾸면 양쪽 다 바꿀 것.

/** 파일명 조각 정규화 — 불가 문자만 '_', 공백 제거, 유니코드는 보존. */
function safeFilenamePart(name: string): string {
  const cleaned = name
    // eslint-disable-next-line no-control-regex
    .replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, "_")
    .replace(/\s+/g, "")
    .replace(/_{2,}/g, "_")
    .replace(/^[._-]+|[._-]+$/g, "");
  return cleaned || "download";
}

/** `2026-08-01`+`2026-08-15` → `20260801-0815` (해가 다르면 뒤도 연도까지). */
function dateRangeTag(startDate: string, endDate: string): string {
  const [sy, sm, sd] = startDate.split("-");
  const [ey, em, ed] = endDate.split("-");
  const head = `${sy}${sm}${sd}`;
  return sy === ey ? `${head}-${em}${ed}` : `${head}-${ey}${em}${ed}`;
}

/** 다운로드 시각 → `20260820-1352Z` (UTC — 받는 사람 시계와 달라도 오해 없게). */
function downloadStamp(now: Date = new Date()): string {
  const p = (n: number): string => String(n).padStart(2, "0");
  return (
    `${now.getUTCFullYear()}${p(now.getUTCMonth() + 1)}${p(now.getUTCDate())}` +
    `-${p(now.getUTCHours())}${p(now.getUTCMinutes())}Z`
  );
}

export interface ExportFilenameParts {
  /** `Attendance`, `Staff` 처럼 무엇인지 (파일명 맨 앞). */
  kind: string;
  /** 매장명 등 범위. 없으면 생략. */
  scope?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  extra?: (string | null | undefined)[];
  ext?: string;
}

/** `{Kind}[_{스코프}][_{범위}][_{extra}]_{받은시각}.{ext}` */
export function buildExportFilename({
  kind,
  scope,
  startDate,
  endDate,
  extra = [],
  ext = "csv",
}: ExportFilenameParts): string {
  const parts = [safeFilenamePart(kind)];
  if (scope) parts.push(safeFilenamePart(scope));
  if (startDate && endDate) parts.push(dateRangeTag(startDate, endDate));
  for (const x of extra) if (x) parts.push(safeFilenamePart(x));
  parts.push(downloadStamp());
  return `${parts.join("_")}.${ext}`;
}
