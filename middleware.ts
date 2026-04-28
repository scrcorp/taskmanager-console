import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * 한 Vercel 프로젝트가 두 종류의 도메인을 서빙한다:
 *
 *   admin    : console.hermesops.site / stg-console.hermesops.site (+ vercel.app preview)
 *   public   : hermesops.site / stg.hermesops.site
 *
 * - admin host에서는 기존 동작 유지 — 모든 페이지 OK, /login + 토큰 있으면 / 로.
 * - public host에서는 /join/* 만 노출. 그 외 모든 path는 /coming-soon
 *   페이지로 rewrite (URL은 사용자가 친 그대로, 콘텐츠만 준비중).
 */

const ADMIN_HOST_PREFIX = "console.";

/** middleware를 거치지 않거나 그냥 통과시켜야 하는 path. */
const ALWAYS_ALLOWED_PREFIXES = ["/_next", "/api", "/favicon", "/icon", "/apple-icon"];

/** public host 에서만 허용되는 path. */
const PUBLIC_ALLOWED_PREFIXES = ["/join", "/coming-soon"];

function isAdminHost(host: string): boolean {
  if (host.startsWith("localhost") || host.startsWith("127.")) return true;
  if (host.endsWith(".vercel.app")) return true;
  return host.includes(ADMIN_HOST_PREFIX);
}

function pathMatches(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function middleware(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  const { pathname } = request.nextUrl;
  const token = request.cookies.get("taskmanager_access_token")?.value;

  if (pathMatches(pathname, ALWAYS_ALLOWED_PREFIXES)) {
    return NextResponse.next();
  }

  if (isAdminHost(host)) {
    if (pathname === "/login" && token) {
      return NextResponse.redirect(new URL("/", request.url));
    }
    return NextResponse.next();
  }

  // 공개 host (hermesops.site / stg.hermesops.site)
  if (pathMatches(pathname, PUBLIC_ALLOWED_PREFIXES)) {
    return NextResponse.next();
  }

  // /join 외 모든 경로 — URL은 유지하고 /coming-soon 콘텐츠를 보여준다.
  const url = request.nextUrl.clone();
  url.pathname = "/coming-soon";
  return NextResponse.rewrite(url);
}

export const config = {
  matcher: ["/((?!_next|api|favicon.ico|icon|apple-icon|.*\\..*).*)"],
};
