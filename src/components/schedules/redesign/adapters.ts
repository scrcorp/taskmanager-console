/**
 * Server ↔ Mockup shape adapters.
 *
 * 목업 컴포넌트들이 사용하는 데이터 형태(staffId/startHour/role 등)와
 * server API가 반환하는 형태(user_id/start_time/role_priority 등) 사이의 변환.
 *
 * 새 세션에서 mockData를 server data로 교체할 때 사용.
 */

import type { Schedule as ServerSchedule, Store as ServerStore, User as ServerUser } from "@/types";
import type {
  Staff as MockStaff,
  ScheduleBlock as MockScheduleBlock,
  Store as MockStore,
  Role as MockRole,
} from "./types";

// ─── Helpers ──────────────────────────────────────────────

function rolePriorityToMockRole(priority: number): MockRole {
  if (priority <= 10) return "owner";
  if (priority <= 20) return "gm";
  if (priority <= 30) return "sv";
  return "staff";
}

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "??";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase();
}

/** "HH:MM" → integer hour (drops minutes). 9:30 → 9, 17:45 → 17 */
function hourFromTimeString(t: string | null): number {
  if (!t) return 0;
  const [hh] = t.split(":");
  return Number.parseInt(hh ?? "0", 10) || 0;
}

/** "HH:MM" → fractional hour (e.g. 9:30 → 9.5). For more accurate display. */
function fractionalHourFromTimeString(t: string | null): number {
  if (!t) return 0;
  const [hh, mm] = t.split(":");
  return (Number.parseInt(hh ?? "0", 10) || 0) + (Number.parseInt(mm ?? "0", 10) || 0) / 60;
}

// ─── User → MockStaff ─────────────────────────────────────

export function adaptUserToStaff(user: ServerUser): MockStaff {
  return {
    id: user.id,
    name: user.full_name || user.username,
    initials: initialsFromName(user.full_name || user.username),
    role: rolePriorityToMockRole(user.role_priority),
    position: "general", // server doesn't expose default position; mockup uses this for filter
    hourlyRate: user.hourly_rate ?? 0,
  };
}

// ─── Schedule → MockScheduleBlock ─────────────────────────

export function adaptScheduleToMockBlock(
  schedule: ServerSchedule,
  selectedStoreId: string,
): MockScheduleBlock {
  const startH = fractionalHourFromTimeString(schedule.start_time);
  const endH = fractionalHourFromTimeString(schedule.end_time);
  const workRoleName = schedule.work_role_name_snapshot ?? schedule.work_role_name ?? "Shift";
  return {
    id: schedule.id,
    staffId: schedule.user_id,
    storeId: schedule.store_id,
    date: schedule.work_date,
    startHour: startH,
    endHour: endH > startH ? endH : startH + 1,
    workRoleId: schedule.work_role_id ?? undefined,
    workRoleNameSnapshot: workRoleName,
    positionSnapshot: schedule.position_snapshot ?? "General",
    hourlyRateSnapshot: schedule.hourly_rate ?? undefined,
    shift: workRoleName,
    status: schedule.status,
    isOtherStore: schedule.store_id !== selectedStoreId,
    createdBy: schedule.created_by ?? undefined,
    rejectedBy: schedule.rejected_by ?? undefined,
    rejectedAt: schedule.rejected_at ?? undefined,
    rejectionReason: schedule.rejection_reason ?? undefined,
    cancelledBy: schedule.cancelled_by ?? undefined,
    cancelledAt: schedule.cancelled_at ?? undefined,
    cancellationReason: schedule.cancellation_reason ?? undefined,
  };
}

// ─── Store → MockStore ────────────────────────────────────

export function adaptStoreToMockStore(store: ServerStore): MockStore {
  // operating_hours에서 open/close hour 추출 시도 (없으면 기본 9-22)
  let openHour = 9;
  let closeHour = 22;
  const oh = store.operating_hours as Record<string, string> | null;
  if (oh && typeof oh === "object") {
    const openStr = oh.open || oh.start;
    const closeStr = oh.close || oh.end;
    if (openStr) openHour = hourFromTimeString(openStr);
    if (closeStr) closeHour = hourFromTimeString(closeStr);
  }
  return {
    id: store.id,
    name: store.name,
    openHour,
    closeHour,
  };
}
