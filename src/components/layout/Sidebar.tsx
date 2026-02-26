"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboard,
  Store,
  Users,
  CalendarClock,
  Clock,
  CheckSquare,
  Zap,
  Megaphone,
  Bell,
  LogOut,
  Building2,
  Star,
} from "lucide-react";
import React from "react";
import { useAuthStore } from "@/stores/authStore";
import { useUnreadCount } from "@/hooks";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "./ThemeToggle";

/** 사이드바 내비게이션 항목 타입.
 *  Sidebar navigation item type. */
interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number }>;
}

/** 사이드바 내비게이션 항목 목록.
 *  Sidebar navigation items list. */
const navItems: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/stores", label: "Stores", icon: Store },
  { href: "/users", label: "Staff", icon: Users },
  { href: "/schedules", label: "Schedules", icon: CalendarClock },
  { href: "/attendances", label: "Attendance", icon: Clock },
  { href: "/checklists", label: "Checklists", icon: CheckSquare },
  { href: "/tasks", label: "Tasks", icon: Zap },
  { href: "/announcements", label: "Notices", icon: Megaphone },
  { href: "/evaluations", label: "Evaluations", icon: Star },
  { href: "/notifications", label: "Alerts", icon: Bell },
];

/** 사이드바 레이아웃 컴포넌트 — 내비게이션 + 사용자 프로필 + 로그아웃.
 *
 * Sidebar layout component — navigation links, user profile, and logout.
 * Displays dynamic unread notification count badge from server.
 */
export function Sidebar() {
  const pathname: string = usePathname();
  const { user, logout } = useAuthStore();
  const { data: unreadRaw } = useUnreadCount();
  const badgeCount: number = unreadRaw ?? 0;

  /** 현재 경로가 활성 상태인지 판별합니다.
   *  Determine if the given href matches the current path.
   *  Longer paths take priority to avoid parent items matching child routes. */
  const isActive = (href: string): boolean => {
    if (href === "/") return pathname === "/";
    if (!pathname.startsWith(href)) return false;
    // Check if a more specific nav item matches
    const moreSpecific = navItems.some(
      (other) => other.href !== href && other.href.startsWith(href) && pathname.startsWith(other.href),
    );
    return !moreSpecific;
  };

  return (
    <aside className="w-60 h-screen bg-surface border-r border-border flex flex-col shrink-0">
      {/* 로고 (Logo) */}
      <div className="px-6 pt-6 pb-2">
        <div className="text-xl font-extrabold text-text">
          <span className="text-accent">●</span> TaskManager
        </div>
        {user?.organization_name && (
          <div className="text-text-muted text-xs mt-1 flex items-center gap-1 truncate">
            <Building2 size={12} className="shrink-0" />
            <span className="truncate">{user.organization_name}</span>
          </div>
        )}
      </div>

      {/* 구분선 (Separator) */}
      <div className="mx-5 my-3 h-px bg-border" />

      {/* 내비게이션 (Navigation) */}
      <nav className="flex-1 px-3 space-y-1 overflow-auto">
        {navItems.map((item: NavItem) => {
          const active: boolean = isActive(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                active
                  ? "bg-accent-muted text-accent"
                  : "text-text-secondary hover:bg-surface-hover hover:text-text"
              )}
            >
              <Icon size={18} />
              <span>{item.label}</span>
              {/* 읽지 않은 알림 배지 (Unread notification badge) */}
              {item.href === "/notifications" && badgeCount > 0 && (
                <span className="ml-auto bg-danger text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
                  {badgeCount > 99 ? "99+" : badgeCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* 회사 코드 (Company Code) */}
      {user?.company_code && (
        <div className="mx-4 mb-2 px-3 py-2 rounded-lg bg-accent/5 border border-accent/10">
          <div className="text-[10px] text-text-muted font-medium uppercase tracking-wider">Company Code</div>
          <div className="text-sm font-bold text-accent tracking-widest mt-0.5">{user.company_code}</div>
        </div>
      )}

      {/* 구분선 (Separator) */}
      <div className="mx-5 my-2 h-px bg-border" />

      {/* 사용자 정보 (User profile) */}
      <div className="px-4 pb-5 flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-accent-muted flex items-center justify-center text-accent text-xs font-bold shrink-0">
          {user?.full_name?.charAt(0) || "A"}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-text truncate">
            {user?.full_name || "Admin"}
          </div>
          <div className="text-xs text-text-muted truncate">
            {user?.email || "admin@taskmanager.app"}
          </div>
        </div>
        <ThemeToggle />
        <button
          onClick={logout}
          className="p-1.5 text-text-muted hover:text-danger transition-colors"
          title="Logout"
        >
          <LogOut size={16} />
        </button>
      </div>
    </aside>
  );
}
