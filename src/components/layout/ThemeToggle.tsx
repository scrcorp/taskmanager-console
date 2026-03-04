"use client";

/**
 * 테마 토글 버튼 컴포넌트.
 *
 * system → light → dark 순서로 테마를 순환합니다.
 * next-themes의 useTheme 훅을 사용하여 테마를 관리합니다.
 * SSR 하이드레이션 불일치 방지를 위해 mounted 후에만 렌더링합니다.
 */

import { useTheme } from "next-themes";
import { Sun, Moon, Monitor } from "lucide-react";
import { useEffect, useState } from "react";

/** 테마 순환 순서 */
const modes = ["system", "light", "dark"] as const;

/** 테마별 아이콘 매핑 */
const icons: Record<string, React.ComponentType<{ size?: number }>> = {
  system: Monitor,
  light: Sun,
  dark: Moon,
};

/** 테마 토글 버튼 — 클릭 시 system → light → dark 순환 */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // SSR 하이드레이션 불일치 방지 — 클라이언트 마운트 후 렌더링
  useEffect(() => setMounted(true), []);

  if (!mounted) return <div className="w-8 h-8" />; // placeholder로 레이아웃 시프트 방지

  const cycle = () => {
    const idx = modes.indexOf(theme as (typeof modes)[number]);
    setTheme(modes[(idx + 1) % modes.length]);
  };

  const Icon = icons[theme ?? "system"] ?? Monitor;

  return (
    <button
      onClick={cycle}
      className="p-1.5 text-text-muted hover:text-text transition-colors"
      title={`Theme: ${theme}`}
    >
      <Icon size={16} />
    </button>
  );
}
