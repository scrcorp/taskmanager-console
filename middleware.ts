import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * 한 Vercel 프로젝트가 두 종류의 도메인을 서빙한다:
 *
 *   console  : console.hermesops.site / stg-console.hermesops.site (+ vercel.app preview)
 *   public   : hermesops.site / stg.hermesops.site
 *
 * - console host: 모든 경로 통과. 인증은 클라이언트(localStorage) 에서 처리.
 * - public host: /join/* 만 노출. 그 외 모든 path 는 /coming-soon 으로 rewrite.
 *
 * NOTE: 이전에는 cookie 기반 token 체크로 /login 리다이렉트를 시도했으나,
 * 토큰은 localStorage 에만 저장되므로 미들웨어에서 읽을 수 없어 dead code 였다.
 * /login → / 리다이렉트는 클라이언트 측 useAuthStore 에서 처리한다.
 */

const CONSOLE_HOST_PREFIX = "console.";

/** middleware를 거치지 않거나 그냥 통과시켜야 하는 path. */
const ALWAYS_ALLOWED_PREFIXES = ["/_next", "/api", "/favicon", "/icon", "/apple-icon"];

/** public host 에서만 허용되는 path. */
const PUBLIC_ALLOWED_PREFIXES = ["/join", "/coming-soon"];

function isConsoleHost(host: string): boolean {
  if (host.startsWith("localhost") || host.startsWith("127.")) return true;
  if (host.endsWith(".vercel.app")) return true;
  return host.includes(CONSOLE_HOST_PREFIX);
}

function pathMatches(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function middleware(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  const { pathname } = request.nextUrl;

  if (pathMatches(pathname, ALWAYS_ALLOWED_PREFIXES)) {
    return NextResponse.next();
  }

  if (isConsoleHost(host)) {
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
