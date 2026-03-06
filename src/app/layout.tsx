/**
 * 루트 레이아웃 — Next.js App Router 최상위 레이아웃.
 *
 * HTML 구조를 정의하고 Providers(React Query, Theme 등)로 앱을 감쌉니다.
 * suppressHydrationWarning: next-themes SSR 하이드레이션 경고 방지.
 */

import type { Metadata } from "next";
import { Providers } from "./providers";
import "./globals.css";

/** 환경별 브라우저 탭 prefix — production: 없음, staging: [STG], 기본: [DEV] */
const env = process.env.NEXT_PUBLIC_APP_ENV;
const envPrefix = env === 'production' ? ''
  : env === 'staging' ? '[STG] '
  : '[DEV] ';

/** SEO 메타데이터 — 브라우저 탭 제목 + 파비콘 설정 */
export const metadata: Metadata = {
  title: `${envPrefix}TaskManager Admin`,
  description: "Employee Management Admin Console",
  icons: {
    icon: "/favicon.ico",
    apple: "/apple-icon.png",
  },
};

/** 루트 레이아웃 — html/body 태그 + Providers 래핑 */
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
