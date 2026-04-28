/**
 * UUID ↔ base64url 런타임 인코딩.
 *
 * Public signup link (예: hermesops.site/join/{encoded}) 생성/해석에 사용.
 * DB 변경 없이 런타임에서만 변환 — store.id (UUID, 36자) ↔ encoded (22자).
 *
 * 서버(`server/app/core/url_encoding.py`)와 동일 결과를 보장해야 함.
 *
 * URL-safe alphabet (RFC 4648 §5): A-Z, a-z, 0-9, '-', '_'
 */

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * UUID 문자열 → base64url 인코딩 (22자, padding 제거).
 *
 * @param uuid 표준 UUID 문자열 (8-4-4-4-12 hex with hyphens).
 * @returns base64url 22자 (URL-safe).
 * @throws {Error} UUID 포맷이 아니면.
 */
export function encodeUuid(uuid: string): string {
  if (typeof uuid !== "string" || !UUID_REGEX.test(uuid)) {
    throw new Error(`invalid UUID: ${uuid}`);
  }

  const hex = uuid.replace(/-/g, "");
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }

  // bytes → binary string → btoa → urlsafe + strip padding
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

/**
 * base64url → UUID 문자열 디코딩.
 *
 * @param encoded base64url 인코딩 문자열 (padding 유무 무관).
 * @returns 표준 UUID 문자열 (소문자 hex with hyphens).
 * @throws {Error} 디코딩 실패 / 16바이트가 아닌 경우.
 */
export function decodeUuid(encoded: string): string {
  if (typeof encoded !== "string" || encoded.length === 0) {
    throw new Error("encoded string must be a non-empty string");
  }

  // URL-safe → standard, padding 보정
  const standard = encoded.replace(/-/g, "+").replace(/_/g, "/");
  const pad = "=".repeat((4 - (standard.length % 4)) % 4);

  let bin: string;
  try {
    bin = atob(standard + pad);
  } catch (err) {
    throw new Error(`invalid base64url: ${(err as Error).message}`);
  }

  if (bin.length !== 16) {
    throw new Error(`decoded payload must be 16 bytes, got ${bin.length}`);
  }

  let hex = "";
  for (let i = 0; i < 16; i++) {
    hex += bin.charCodeAt(i).toString(16).padStart(2, "0");
  }
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}
