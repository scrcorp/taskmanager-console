import { describe, it, expect } from "vitest";

// middleware.ts의 helper 로직을 직접 import 하기 어려워, 같은 규칙을 여기에 복제해서 검증.
const ADMIN_HOST_PREFIX = "console.";
const isAdminHost = (host: string) =>
  host.startsWith("localhost") ||
  host.startsWith("127.") ||
  host.endsWith(".vercel.app") ||
  host.includes(ADMIN_HOST_PREFIX);

const publicHostFromAdminHost = (h: string): string | null => {
  if (h.startsWith("console.")) return h.slice("console.".length);
  const m = h.match(/^([^.]+)-console\.(.+)$/);
  return m ? `${m[1]}.${m[2]}` : null;
};

describe("isAdminHost", () => {
  it("treats local + preview + console hosts as admin", () => {
    for (const h of [
      "localhost:53101",
      "127.0.0.1:3000",
      "admin-pr-12.vercel.app",
      "console.hermesops.site",
      "stg-console.hermesops.site",
    ]) expect(isAdminHost(h)).toBe(true);
  });
  it("rejects bare branded hosts", () => {
    for (const h of ["hermesops.site", "stg.hermesops.site"])
      expect(isAdminHost(h)).toBe(false);
  });
});

describe("publicHostFromAdminHost", () => {
  it("strips console. and *-console.", () => {
    expect(publicHostFromAdminHost("console.hermesops.site")).toBe("hermesops.site");
    expect(publicHostFromAdminHost("stg-console.hermesops.site")).toBe("stg.hermesops.site");
    expect(publicHostFromAdminHost("hermesops.site")).toBe(null);
  });
});
