"use client";

import React, { useEffect } from "react";

/**
 * "What's New" — 홈페이지 공개 changelog 로 리다이렉트한다.
 *
 * 콘솔은 더 이상 자체 카테고리 뷰를 렌더하지 않고, 제품 전체 업데이트 내역이
 * 모이는 홈페이지 `/changelog` 를 단일 소스로 사용한다.
 *
 * 대상 URL 은 환경별로 결정된다(NEXT_PUBLIC_* 는 빌드 타임 인라인):
 * - `NEXT_PUBLIC_SITE_BASE_URL` 우선 (예: https://hermesops.site)
 * - 없으면 `NEXT_PUBLIC_SIGNUP_BASE_URL` 재사용 (이미 prod/staging 에 설정됨)
 * - 둘 다 없으면(local) 같은 앱의 상대경로 `/changelog` (호스트 무관 동작)
 */
const SITE_BASE: string = (
  process.env.NEXT_PUBLIC_SITE_BASE_URL ||
  process.env.NEXT_PUBLIC_SIGNUP_BASE_URL ||
  ""
).replace(/\/$/, "");

const CHANGELOG_URL: string = SITE_BASE ? `${SITE_BASE}/changelog` : "/changelog";

export default function WhatsNewRedirectPage(): React.ReactElement {
  useEffect(() => {
    window.location.replace(CHANGELOG_URL);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center py-24 text-center text-text-secondary">
      <p className="text-sm">Opening What&apos;s New…</p>
      <a
        href={CHANGELOG_URL}
        className="mt-2 text-sm text-accent hover:underline"
      >
        Click here if you are not redirected
      </a>
    </div>
  );
}
