"use client";

import { useTheme } from "next-themes";
import { Sun, Moon, Monitor } from "lucide-react";
import { useEffect, useState } from "react";

const modes = ["system", "light", "dark"] as const;

const icons: Record<string, React.ComponentType<{ size?: number }>> = {
  system: Monitor,
  light: Sun,
  dark: Moon,
};

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) return <div className="w-8 h-8" />;

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
