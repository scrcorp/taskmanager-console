"use client";

/**
 * 간소화 콘솔(compact) 셸 — 상단 헤더 하나뿐.
 *
 * 초기판엔 하단 탭바(Schedules / Attendance)가 있었는데, 탭을 옮길 때마다 URL 에서
 * store/date 가 빠져 선택이 풀렸고 계획·실제를 맞춰보려면 화면을 오가야 했다.
 * 화면을 하나로 합치면서 탭바를 없앴다 — 선택기가 하나뿐이라 풀릴 자리가 없다.
 *
 * 데스크탑 (dashboard) 레이아웃과 인증/권한 가드는 동일하게 건다. 다른 점은 배치뿐.
 */

import { Suspense, useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { Monitor, ShieldOff } from "lucide-react";
import { useAuthStore } from "@/stores/authStore";
import { isAuthenticated } from "@/lib/auth";
import { usePermissions } from "@/hooks/usePermissions";
import { resolvePagePermission } from "@/lib/permissions";
import { toDesktopPath } from "@/lib/compact";
import { CompactStoreSelector } from "@/components/compact/CompactStoreSelector";

function ForbiddenScreen(): React.ReactElement {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-danger-muted">
        <ShieldOff className="h-7 w-7 text-danger" aria-hidden="true" />
      </div>
      <h1 className="text-lg font-bold text-text">Access denied</h1>
      <p className="max-w-xs text-sm text-text-secondary">
        You don&apos;t have permission to view this page. Contact your administrator if you think
        this is a mistake.
      </p>
    </div>
  );
}

export default function CompactLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, fetchMe } = useAuthStore();
  const { hasPermission } = usePermissions();
  const [forbidden, setForbidden] = useState(false);

  // 인증 체크 — (dashboard) 레이아웃과 동일한 가드
  useEffect(() => {
    if (!isAuthenticated()) {
      const currentPath = window.location.pathname + window.location.search;
      router.push(`/login?returnUrl=${encodeURIComponent(currentPath)}`);
      return;
    }
    if (!user) fetchMe();
  }, []);

  useEffect(() => {
    if (!user) return;
    if (!user.email_verified) router.replace("/verify-email");
    else if (user.must_change_password) router.replace("/change-password");
    else if (user.current_org_accessible === false) router.replace("/license-inactive");
  }, [user]);

  // 권한 체크 — `/c` prefix 를 떼고 데스크탑과 같은 PAGE_PERMISSIONS 로 매칭.
  // 통합 화면은 스케줄이 본체이므로 `/c` → `/schedules` 로 본다.
  useEffect(() => {
    if (!user) {
      setForbidden(false);
      return;
    }
    const required = resolvePagePermission(toDesktopPath(pathname));
    setForbidden(!!required && !hasPermission(required));
  }, [user, pathname]);

  if (
    !user ||
    !user.email_verified ||
    user.must_change_password ||
    user.current_org_accessible === false
  ) {
    return (
      <div className="flex h-viewport items-center justify-center bg-bg">
        <div className="h-8 w-8 animate-spin rounded-full border-3 border-accent border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="flex h-viewport flex-col overflow-hidden bg-bg">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border bg-surface px-3">
        <Suspense fallback={<div className="h-9 flex-1" />}>
          <CompactStoreSelector />
        </Suspense>
        <Link
          href="/"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-text-secondary transition-colors hover:bg-surface-hover hover:text-text"
          aria-label="Switch to desktop version"
          title="Desktop version"
        >
          <Monitor size={20} />
        </Link>
      </header>

      <main className="flex-1 overflow-hidden">
        <Suspense>{forbidden ? <ForbiddenScreen /> : children}</Suspense>
      </main>
    </div>
  );
}
