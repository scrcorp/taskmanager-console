"use client";

/**
 * 간소화 콘솔(compact) 셸 — 상단 헤더 + 하단 탭바.
 *
 * 데스크탑 (dashboard) 레이아웃과 인증/권한 가드는 동일하게 건다.
 * 다른 점은 배치뿐 — 사이드바 대신 하단 탭바, 매장 선택기는 헤더.
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
import { cn } from "@/lib/utils";
import { CompactStoreSelector } from "@/components/compact/CompactStoreSelector";
import { COMPACT_TABS } from "@/components/compact/tabs";

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

  // 권한 체크 — `/c` prefix 를 떼고 데스크탑과 같은 PAGE_PERMISSIONS 로 매칭
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

  const visibleTabs = COMPACT_TABS.filter((tab) => {
    const required = resolvePagePermission(toDesktopPath(tab.href));
    return !required || hasPermission(required);
  });

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

      <main className="flex-1 overflow-auto overscroll-contain">
        <Suspense>{forbidden ? <ForbiddenScreen /> : children}</Suspense>
      </main>

      <nav className="flex shrink-0 border-t border-border bg-surface">
        {visibleTabs.map((tab) => {
          const active = pathname.startsWith(tab.href);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-1 py-2 text-[11px] font-medium transition-colors",
                // pb-safe: iOS 홈 인디케이터 영역만큼 아래 여백 확보
                "pb-[max(0.5rem,env(safe-area-inset-bottom))]",
                active ? "text-accent" : "text-text-secondary",
              )}
              aria-current={active ? "page" : undefined}
            >
              <Icon size={20} />
              <span>{tab.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
