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
  Package,
  Tag,
  Warehouse,
  History,
  ClipboardCheck,
  ShieldCheck,
  Tablet,
  UserPlus,
} from "lucide-react";
import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useAuthStore } from "@/stores/authStore";
import { useSidebarStore } from "@/stores/sidebarStore";
import { useUnreadCount } from "@/hooks";
import { cn } from "@/lib/utils";
import { ROLE_PRIORITY, MENU_PERMISSIONS } from "@/lib/permissions";
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
  { href: "/hiring", label: "Hiring", icon: UserPlus },
  {
    href: "/schedules",
    label: "Schedules",
    icon: CalendarClock,
    children: [
      { href: "/schedules", label: "Overview", icon: CalendarRange },
      { href: "/schedules/history", label: "History", icon: History },
      { href: "/schedules/settings", label: "Settings", icon: Settings },
      { href: "/attendances", label: "Attendance", icon: Clock },
    ],
  },
  {
    href: "/checklists/progress",
    label: "Checklists",
    icon: CheckSquare,
    children: [
      { href: "/checklists/progress", label: "Progress & Review", icon: ClipboardCheck },
      { href: "/checklists", label: "Templates", icon: ClipboardList },
      // { href: "/checklists/log", label: "Log", icon: FileSearch }, // TODO: Log 기능 정비 후 재활성화
    ],
  },
  { href: "/tasks", label: "Tasks", icon: Zap },
  { href: "/notices", label: "Notices", icon: Megaphone },
  { href: "/evaluations", label: "Evaluations", icon: Star },
  {
    href: "/daily-reports",
    label: "Daily Reports",
    icon: FileText,
    children: [
      { href: "/daily-reports/templates", label: "Templates", icon: Settings },
    ],
  },
  {
    href: "/inventory",
    label: "Inventory",
    icon: Package,
    children: [
      { href: "/inventory", label: "Products", icon: Package },
      { href: "/inventory/categories", label: "Categories", icon: Tag },
      { href: "/inventory/stores", label: "Store Inventory", icon: Warehouse },
      { href: "/inventory/transactions", label: "Transactions", icon: History },
      { href: "/inventory/audits", label: "Audits", icon: ClipboardCheck },
    ],
  },
  { href: "/alerts", label: "Alerts", icon: Bell },
  {
    href: "/settings",
    label: "Settings",
    icon: Settings,
    children: [
      { href: "/settings", label: "General", icon: Building2 },
      { href: "/settings/roles", label: "Roles & Permissions", icon: ShieldCheck },
      { href: "/settings/attendance-devices", label: "Attendance Devices", icon: Tablet },
    ],
  },
];

/** 사이드바 레이아웃 컴포넌트 — 내비게이션 + 사용자 프로필 + 로그아웃.
 *
 * Sidebar layout component — navigation links, user profile, and logout.
 * Displays dynamic unread alert count badge from server.
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

  // 현재 pathname에서 storeId 추출 (/inventory/stores/{storeId}/...)
  const currentStoreId = useMemo(() => {
    const match = pathname.match(/^\/inventory\/stores\/([^/]+)/);
    return match ? match[1] : null;
  }, [pathname]);

  const resolveChildHref = (href: string): string => {
    if (href === "/checklists/log") return `/checklists/log?from=${currentWeek.from}&to=${currentWeek.to}`;
    if (href === "/attendances") return `/attendances?from=${currentWeek.from}&to=${currentWeek.to}`;
    // Dynamic store-scoped links — substitute storeId if available
    if (href.includes("__storeId__")) {
      if (!currentStoreId) return "/inventory/stores";
      return href.replace("__storeId__", currentStoreId);
    }
    return href;
  };

  const isChildActive = (child: NavChild, parentHref: string): boolean => {
    // Dynamic store-scoped sub-items: active when pathname matches the resolved href
    if (child.href.includes("__storeId__")) {
      if (!currentStoreId) return false;
      const resolved = child.href.replace("__storeId__", currentStoreId);
      return pathname.startsWith(resolved);
    }
    if (child.href === parentHref) return pathname === child.href;
    // Exact match for leaf paths to avoid "/checklists" matching "/checklists/progress"
    const siblings = navItems.find((n) => n.href === parentHref || n.children?.some((c) => c.href === child.href))?.children ?? [];
    const moreSpecificSibling = siblings.some(
      (s) => s.href !== child.href && s.href.startsWith(child.href) && pathname.startsWith(s.href),
    );
    if (moreSpecificSibling) return false;
    return pathname.startsWith(child.href);
  };

  const userPermissions = new Set(user?.permissions ?? []);
  const hasMenuPermission = (href: string): boolean => {
    const required = MENU_PERMISSIONS[href];
    return !required || userPermissions.has(required);
  };

  const shouldShowItem = (item: NavItem): boolean => {
    // children이 있으면, 보이는 child가 하나라도 있어야 부모도 보임
    if (item.children) {
      return item.children.some(shouldShowChild);
    }
    return hasMenuPermission(item.href);
  };

  const shouldShowChild = (child: NavChild): boolean => {
    // Only show Transactions/Audits when on a store inventory page
    if (child.href.includes("__storeId__")) return !!currentStoreId;
    return hasMenuPermission(child.href);
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
          <img src="/taskmanager_icon.png" alt="HTM" className="inline-block w-8 h-8 mr-2 align-middle" /> HTM
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
        {navItems.filter(shouldShowItem).map((item: NavItem) => {
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
                {item.href === "/alerts" && badgeCount > 0 && (
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
                  {item.children!.filter(shouldShowChild).map((child) => {
                    const childActive = isChildActive(child, item.href);
                    const ChildIcon = child.icon;
                    return (
                      <Link
                        key={child.href}
                        href={resolveChildHref(child.href)}
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
            {user?.email || "admin@htm.app"}
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
