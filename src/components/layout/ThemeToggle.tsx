"use client";

/**
 * 테마 토글 버튼 컴포넌트.
 *
 * light ↔ dark 토글. 시스템 모드는 사용하지 않는다 (기본값: light).
 */

import { useTheme } from "next-themes";
import { Sun, Moon } from "lucide-react";
import { useEffect, useState } from "react";

/** 테마 토글 버튼 — 클릭 시 light ↔ dark */
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // SSR 하이드레이션 불일치 방지 — 클라이언트 마운트 후 렌더링
  useEffect(() => setMounted(true), []);

  if (!mounted) return <div className="w-8 h-8" />; // placeholder로 레이아웃 시프트 방지

  const isDark = resolvedTheme === "dark";
  const Icon = isDark ? Moon : Sun;

  return (
    <button
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className="p-1.5 text-text-muted hover:text-text transition-colors"
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      <Icon size={16} />
    </button>
  );
}
