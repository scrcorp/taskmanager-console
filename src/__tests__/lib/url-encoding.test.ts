import { describe, expect, it } from "vitest";
import { decodeUuid, encodeUuid } from "@/lib/url-encoding";

/**
 * 서버(`server/app/core/url_encoding.py`)와 cross-check용 reference 값.
 * 변경 시 양쪽 일치 여부 다시 확인.
 */
const SERVER_REFERENCE: ReadonlyArray<readonly [string, string]> = [
  ["0e8400e2-29b1-41d4-a716-446655440000", "DoQA4imxQdSnFkRmVUQAAA"],
  ["00000000-0000-0000-0000-000000000000", "AAAAAAAAAAAAAAAAAAAAAA"],
  ["ffffffff-ffff-ffff-ffff-ffffffffffff", "_____________________w"],
  ["1b2c3d4e-5f6a-7b8c-9d0e-112233445566", "Gyw9Tl9qe4ydDhEiM0RVZg"],
];

function randomUuid(): string {
  // crypto.randomUUID가 환경 따라 없을 수 있어 fallback
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  // RFC 4122 v4 비트 세팅
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

describe("encodeUuid", () => {
  it("produces 22 chars without padding", () => {
    const encoded = encodeUuid("0e8400e2-29b1-41d4-a716-446655440000");
    expect(encoded).toHaveLength(22);
    expect(encoded).not.toContain("=");
  });

  it("uses URL-safe alphabet only (A-Z a-z 0-9 - _)", () => {
    for (let i = 0; i < 50; i++) {
      const encoded = encodeUuid(randomUuid());
      expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });

  it("rejects invalid UUID strings", () => {
    expect(() => encodeUuid("not-a-uuid")).toThrow(/invalid UUID/);
    expect(() => encodeUuid("")).toThrow(/invalid UUID/);
    expect(() => encodeUuid("0e8400e2-29b1-41d4-a716-44665544000")).toThrow(
      /invalid UUID/,
    );
  });

  it("matches server reference values exactly", () => {
    for (const [uuid, expected] of SERVER_REFERENCE) {
      expect(encodeUuid(uuid)).toBe(expected);
    }
  });
});

describe("decodeUuid", () => {
  it("decodes server reference values back to UUID", () => {
    for (const [uuid, encoded] of SERVER_REFERENCE) {
      expect(decodeUuid(encoded)).toBe(uuid);
    }
  });

  it("accepts encoded with or without padding", () => {
    const uuid = "1b2c3d4e-5f6a-7b8c-9d0e-112233445566";
    const encoded = encodeUuid(uuid);
    expect(decodeUuid(encoded)).toBe(uuid);
    expect(decodeUuid(encoded + "==")).toBe(uuid);
  });

  it("roundtrips 100 random UUIDs", () => {
    for (let i = 0; i < 100; i++) {
      const original = randomUuid();
      expect(decodeUuid(encodeUuid(original))).toBe(original);
    }
  });

  it("rejects empty string", () => {
    expect(() => decodeUuid("")).toThrow(/non-empty/);
  });

  it("rejects payload that doesn't decode to 16 bytes", () => {
    expect(() => decodeUuid("AAAAAAAAAAA")).toThrow(/16 bytes/); // 8 bytes
    expect(() => decodeUuid("A".repeat(32))).toThrow(/16 bytes/); // 24 bytes
  });
});
