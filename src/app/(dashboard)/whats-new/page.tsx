"use client";

import React from "react";
import { ChangelogListClient } from "@/components/changelog/ChangelogListClient";

/**
 * 대시보드 "What's New" 뷰 — console 카테고리 변경 이력 (읽기 전용).
 *
 * 작성/관리는 별도 백오피스에서 처리하므로 여기서는 생성/수정/삭제를 노출하지 않는다.
 * 인증된 모든 콘솔 사용자가 접근 가능 (별도 permission 게이트 없음 — 공개 정보).
 */
export default function DashboardWhatsNewPage(): React.ReactElement {
  return (
    <div>
      <h1 className="mb-1 text-2xl font-extrabold text-text">What&apos;s New</h1>
      <p className="mb-6 text-sm text-text-secondary">
        Latest console updates.
      </p>
      <ChangelogListClient basePath="/whats-new" fixedCategory="console" />
    </div>
  );
}
