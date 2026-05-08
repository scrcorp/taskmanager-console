"use client";

/**
 * 대시보드 레이아웃 — 인증된 사용자 전용 레이아웃.
 *
 * 구조:
 * - 데스크탑: 왼쪽 고정 사이드바(240px) + 오른쪽 메인 콘텐츠
 * - 모바일: 상단 바(햄버거 메뉴) + 오버레이 사이드바
 *
 * 인증 체크: 토큰 없으면 /login으로 리다이렉트.
 * 사용자 정보 없으면 fetchMe()로 자동 조회.
 */

import { Suspense, useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Menu, ShieldOff } from "lucide-react";
import { useAuthStore } from "@/stores/authStore";
import { useSidebarStore } from "@/stores/sidebarStore";
import { isAuthenticated } from "@/lib/auth";
import { Sidebar, MobileSidebar } from "@/components/layout/Sidebar";
import { PAGE_PERMISSIONS, ROLE_PRIORITY } from "@/lib/permissions";

function ForbiddenScreen(): React.ReactElement {
  const router = useRouter();
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 px-4 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-danger-muted">
        <ShieldOff className="h-8 w-8 text-danger" aria-hidden="true" />
      </div>
      <h1 className="text-2xl font-bold text-text">Access denied</h1>
      <p className="max-w-md text-text-secondary">
        You don't have permission to view this page. Contact your administrator if you think this is a mistake.
      </p>
      <button
        type="button"
        onClick={() => router.push("/")}
        className="mt-2 rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-accent-light"
      >
        Go to Dashboard
      </button>
    </div>
  );
}

/** 대시보드 레이아웃 — 사이드바 + 메인 콘텐츠 영역 */
export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, fetchMe } = useAuthStore();
  const toggle = useSidebarStore((s) => s.toggle);
  const [forbidden, setForbidden] = useState(false);

  // 인증 체크 — 토큰 없으면 로그인으로 (returnUrl 포함), 사용자 정보 없으면 조회
  useEffect(() => {
    if (!isAuthenticated()) {
      const currentPath = window.location.pathname + window.location.search;
      const returnUrl = currentPath !== "/" ? `?returnUrl=${encodeURIComponent(currentPath)}` : "";
      router.push(`/login${returnUrl}`);
      return;
    }
    if (!user) fetchMe();
  }, []);

  // 이메일 미인증 → 인증 페이지로 리다이렉트
  useEffect(() => {
    if (user && !user.email_verified) {
      router.push("/verify-email");
    }
  }, [user]);

  // Permission 기반 페이지 접근 제어 (Owner는 전체 bypass).
  // 권한 없으면 redirect 대신 ForbiddenScreen으로 main 영역 swap (URL 유지).
  useEffect(() => {
    if (!user) {
      setForbidden(false);
      return;
    }
    if ((user.role_priority ?? 99) <= ROLE_PRIORITY.OWNER) {
      setForbidden(false);
      return;
    }
    const userPerms = new Set(user.permissions ?? []);
    // pathname과 매칭되는 가장 긴 경로 찾기 (e.g. /schedules/settings > /schedules)
    const matchedPaths = Object.keys(PAGE_PERMISSIONS)
      .filter((p) => pathname === p || pathname.startsWith(p + "/"))
      .sort((a, b) => b.length - a.length);
    const requiredPerm = matchedPaths.length > 0 ? PAGE_PERMISSIONS[matchedPaths[0]] : undefined;
    setForbidden(!!requiredPerm && !userPerms.has(requiredPerm));
  }, [user, pathname]);

  // user 로드 전 또는 이메일 미인증 → 로딩 화면 (대시보드 깜빡임 방지)
  if (!user || !user.email_verified) {
    return (
      <div className="flex h-screen items-center justify-center bg-bg">
        <div className="animate-spin w-8 h-8 border-3 border-accent border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Desktop sidebar */}
      <div className="hidden md:flex">
        <Sidebar />
      </div>

      {/* Mobile sidebar overlay */}
      <MobileSidebar />

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile top bar */}
        <div className="md:hidden flex items-center gap-3 px-4 h-14 border-b border-border bg-surface shrink-0">
          <button
            type="button"
            onClick={toggle}
            className="p-1.5 rounded-lg text-text-secondary hover:text-text hover:bg-surface-hover transition-colors"
            aria-label="Open menu"
          >
            <Menu size={22} />
          </button>
          <div className="text-lg font-extrabold text-text">
            <img src="/taskmanager_icon.png" alt="" className="inline-block w-6 h-6 mr-1.5 align-middle" />
            HTM
          </div>
        </div>

        <main className="flex-1 overflow-auto p-4 md:p-8">
          <Suspense>{forbidden ? <ForbiddenScreen /> : children}</Suspense>
        </main>
      </div>
    </div>
  );
}
