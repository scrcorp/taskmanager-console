"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Menu } from "lucide-react";
import { useAuthStore } from "@/stores/authStore";
import { useSidebarStore } from "@/stores/sidebarStore";
import { isAuthenticated } from "@/lib/auth";
import { Sidebar, MobileSidebar } from "@/components/layout/Sidebar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const { user, fetchMe } = useAuthStore();
  const toggle = useSidebarStore((s) => s.toggle);

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push("/login");
      return;
    }
    if (!user) fetchMe();
  }, []);

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
            TaskManager
          </div>
        </div>

        <main className="flex-1 overflow-auto p-4 md:p-8">
          <div className="max-w-[1100px]">{children}</div>
        </main>
      </div>
    </div>
  );
}
