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
  title: `${envPrefix}HTM Admin`,
  description: "Employee Management Admin Console",
  // 홈화면 추가용 — scope/start_url 이 /c 라 설치하면 간소화 콘솔이 뜬다 (서비스워커 없음)
  manifest: "/manifest.json",
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
      <head>
        {/*
          설치 자동 배너 차단.

          Chrome 계열은 manifest 조건이 충족되면 beforeinstallprompt 를 발화하고
          기본 UI(안드로이드 미니 인포바 등)로 "설치할까요?" 를 먼저 묻는다.
          /c 를 그냥 열어보려던 사람에게까지 뜨므로 preventDefault 로 막는다.

          설치 자체를 막는 게 아니다 — 주소창 설치 아이콘이나 브라우저 메뉴의
          "앱 설치" 로는 그대로 설치된다. 브라우저가 먼저 묻지 않을 뿐이다.
          (그 아이콘/메뉴는 사이트에서 숨길 수 있는 API 가 없다.)

          하이드레이션 전에 붙어야 이벤트를 놓치지 않으므로 head 인라인이다.
        */}
        <script
          dangerouslySetInnerHTML={{
            __html:
              "window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();});",
          }}
        />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
