"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboard,
  Store,
  Users,
  CalendarClock,
  CalendarRange,
  ClipboardList,
  Clock,
  CheckSquare,
  Zap,
  Megaphone,
  Bell,
  LogOut,
  Building2,
  Star,
  ChevronDown,
  ChevronRight,
  Settings,
  FileSearch,
  FileText,
  X,
} from "lucide-react";
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useAuthStore } from "@/stores/authStore";
import { useSidebarStore } from "@/stores/sidebarStore";
import { useUnreadCount } from "@/hooks";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "./ThemeToggle";

interface NavChild {
  href: string;
  label: string;
  icon?: React.ComponentType<{ size?: number }>;
  indent?: boolean;
}

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number }>;
  children?: NavChild[];
}

const navItems: NavItem[] = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/stores", label: "Stores", icon: Store },
  { href: "/users", label: "Staff", icon: Users },
  {
    href: "/schedules",
    label: "Schedules",
    icon: CalendarClock,
    children: [
      { href: "/schedules", label: "Overview", icon: CalendarRange },
      { href: "/schedules/manage", label: "Manage", icon: ClipboardList },
      { href: "/schedules/log", label: "Log", icon: FileSearch },
      { href: "/attendances", label: "Attendance", icon: Clock },
    ],
  },
  { href: "/checklists", label: "Checklists", icon: CheckSquare },
  { href: "/tasks", label: "Tasks", icon: Zap },
  { href: "/announcements", label: "Notices", icon: Megaphone },
  { href: "/evaluations", label: "Evaluations", icon: Star },
  {
    href: "/daily-reports",
    label: "Daily Reports",
    icon: FileText,
    children: [
      { href: "/daily-reports/templates", label: "Templates", icon: Settings },
    ],
  },
  { href: "/notifications", label: "Alerts", icon: Bell },
  { href: "/settings", label: "Settings", icon: Settings },
];

/** 사이드바 레이아웃 컴포넌트 — 내비게이션 + 사용자 프로필 + 로그아웃.
 *
 * Sidebar layout component — navigation links, user profile, and logout.
 * Displays dynamic unread notification count badge from server.
 */
export function Sidebar({ onNavClick }: { onNavClick?: () => void }) {
  const pathname: string = usePathname();
  const { user, logout } = useAuthStore();
  const { data: unreadRaw } = useUnreadCount();
  const badgeCount: number = unreadRaw ?? 0;

  const isGroupActive = (item: NavItem): boolean =>
    pathname.startsWith(item.href) ||
    (item.children?.some((c) => pathname.startsWith(c.href)) ?? false);

  // 부모 메뉴가 활성 경로면 초기에 펼침
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    for (const item of navItems) {
      if (item.children?.length && isGroupActive(item)) {
        initial.add(item.href);
      }
    }
    return initial;
  });

  const isActive = (href: string): boolean => {
    if (href === "/") return pathname === "/";
    if (!pathname.startsWith(href)) return false;
    const moreSpecific = navItems.some(
      (other) => other.href !== href && other.href.startsWith(href) && pathname.startsWith(other.href),
    );
    return !moreSpecific;
  };

  // pathname 변경 시 부모 활성이면 펼침, 비활성이면 닫음
  useEffect(() => {
    setExpanded((prev) => {
      const next = new Set(prev);
      let changed = false;
      for (const item of navItems) {
        if (!item.children?.length) continue;
        const active = isGroupActive(item);
        if (active && !next.has(item.href)) { next.add(item.href); changed = true; }
        if (!active && next.has(item.href)) { next.delete(item.href); changed = true; }
      }
      return changed ? next : prev;
    });
  }, [pathname]);

  // 이번 주 월~일 날짜 계산
  const currentWeek = useMemo(() => {
    const today = new Date();
    const day = today.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    const monday = new Date(today);
    monday.setDate(today.getDate() + diff);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    return { from: fmt(monday), to: fmt(sunday) };
  }, []);

  const getChildHref = (href: string): string => {
    if (href === "/schedules/log") return `/schedules/log?from=${currentWeek.from}&to=${currentWeek.to}`;
    if (href === "/attendances") return `/attendances?from=${currentWeek.from}&to=${currentWeek.to}`;
    return href;
  };

  const toggleExpand = (href: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(href) ? next.delete(href) : next.add(href);
      return next;
    });
  };

  return (
    <aside className="w-60 h-screen bg-surface border-r border-border flex flex-col shrink-0">
      {/* 로고 (Logo) */}
      <div className="px-6 pt-6 pb-2">
        <div className="text-xl font-extrabold text-text">
          <img src="/taskmanager_icon.png" alt="TaskManager" className="inline-block w-8 h-8 mr-2 align-middle" /> TaskManager
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
          const hasChildren = !!item.children?.length;
          const isExpanded = expanded.has(item.href);

          return (
            <div key={item.href}>
              <div
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                  active
                    ? "bg-accent-muted text-accent"
                    : "text-text-secondary hover:text-accent"
                )}
              >
                <Link
                  href={item.href}
                  onClick={onNavClick}
                  className="flex items-center gap-3 flex-1 min-w-0"
                >
                  <Icon size={18} />
                  <span>{item.label}</span>
                </Link>
                {item.href === "/notifications" && badgeCount > 0 && (
                  <span className="ml-auto bg-danger text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
                    {badgeCount > 99 ? "99+" : badgeCount}
                  </span>
                )}
                {hasChildren && (
                  <button
                    type="button"
                    onClick={() => toggleExpand(item.href)}
                    className="ml-auto p-0.5 rounded text-current opacity-60 hover:opacity-100 transition-opacity"
                  >
                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </button>
                )}
              </div>

              {/* 서브메뉴 */}
              {hasChildren && isExpanded && (
                <div className="mt-0.5 ml-6 space-y-0.5">
                  {item.children!.map((child) => {
                    // 정확 매치: /schedules → /schedules만, /schedules/manage → /schedules/manage만
                    const childActive = child.href === item.href
                      ? pathname === child.href
                      : pathname.startsWith(child.href);
                    const ChildIcon = child.icon;
                    return (
                      <Link
                        key={child.href}
                        href={getChildHref(child.href)}
                        onClick={onNavClick}
                        className={cn(
                          "flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors",
                          child.indent && "ml-3",
                          childActive
                            ? "text-accent font-medium"
                            : "text-text-secondary hover:text-accent"
                        )}
                      >
                        {ChildIcon && <ChildIcon size={14} />}
                        {child.label}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
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

/** 모바일 사이드바 오버레이 — md 이하에서만 표시 */
export function MobileSidebar() {
  const { isOpen, close } = useSidebarStore();

  const handleEsc = useCallback(
    (e: KeyboardEvent) => { if (e.key === "Escape") close(); },
    [close],
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener("keydown", handleEsc);
      return () => document.removeEventListener("keydown", handleEsc);
    }
  }, [isOpen, handleEsc]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-40 md:hidden">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={close} />
      {/* Sidebar panel */}
      <div className="relative w-60">
        <Sidebar onNavClick={close} />
        <button
          type="button"
          onClick={close}
          className="absolute top-4 right-[-44px] p-2 rounded-full bg-surface/80 text-text-secondary hover:text-text transition-colors"
          aria-label="Close menu"
        >
          <X size={20} />
        </button>
      </div>
    </div>
  );
}
