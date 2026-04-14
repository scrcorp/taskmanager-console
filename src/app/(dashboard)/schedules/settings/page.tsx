"use client";

/**
 * Schedule Settings 페이지 — GM+ only (SV/Staff은 차단).
 * Work Hour Alerts, Weekly Limits, Approval, Break Rules, Work Roles 등.
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ScheduleSettings } from "@/components/schedules/redesign/ScheduleSettings";
import { useAuthStore } from "@/stores/authStore";
import { ROLE_PRIORITY } from "@/lib/permissions";

export default function ScheduleSettingsPage() {
  const router = useRouter();
  const currentUser = useAuthStore((s) => s.user);
  const isGMPlus = (currentUser?.role_priority ?? 99) <= ROLE_PRIORITY.GM;

  useEffect(() => {
    if (currentUser && !isGMPlus) {
      router.replace("/schedules");
    }
  }, [currentUser, isGMPlus, router]);

  if (!isGMPlus) {
    return (
      <div className="min-h-screen bg-[var(--color-bg)] flex items-center justify-center">
        <div className="text-center">
          <div className="text-[var(--color-danger)] text-[14px] font-semibold mb-2">Access denied</div>
          <div className="text-[12px] text-[var(--color-text-muted)]">Schedule settings is GM+ only.</div>
        </div>
      </div>
    );
  }

  return <ScheduleSettings showCost={true} onBack={() => router.push("/schedules")} />;
}
