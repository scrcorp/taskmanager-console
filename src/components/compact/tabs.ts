import { CalendarClock, Clock } from "lucide-react";
import { COMPACT_BASE_PATH } from "@/lib/compact";

export interface CompactTab {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number }>;
}

/** 하단 탭바 항목. 순서가 곧 우선순위 — `/c` 진입 시 첫 번째 접근 가능한 탭으로 보낸다. */
export const COMPACT_TABS: CompactTab[] = [
  { href: `${COMPACT_BASE_PATH}/schedules`, label: "Schedules", icon: CalendarClock },
  { href: `${COMPACT_BASE_PATH}/attendances`, label: "Attendance", icon: Clock },
];
