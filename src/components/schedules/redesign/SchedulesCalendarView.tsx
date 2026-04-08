"use client";

/**
 * SchedulesCalendarView — server types 직접 사용. mockup adapter 폐지.
 *
 * 데이터: useSchedules / useUsers / useStores 를 직접 사용.
 * 모든 schedule 처리는 server `Schedule` 형태(start_time/end_time string, user_id/store_id)로.
 */

import { useState, useMemo, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSchedules, useConfirmSchedule, useRejectSchedule, useDeleteSchedule, useSubmitSchedule, useRevertSchedule, useCancelSchedule, useCreateSchedule, useUpdateSchedule, useSwapSchedule } from "@/hooks/useSchedules";
import { useUsers } from "@/hooks/useUsers";
import { useStores } from "@/hooks/useStores";
import { useOrganization } from "@/hooks/useOrganization";
import { useAttendances } from "@/hooks/useAttendances";
import { useAuthStore } from "@/stores/authStore";
import type { Schedule, Store, User } from "@/types";
import { ScheduleBlock } from "./ScheduleBlock";
import { StatsHeader } from "./StatsHeader";
import { ContextMenu } from "./ContextMenu";
import { HistoryPanel } from "./HistoryPanel";
import { SwapModal } from "./SwapModal";
import { ScheduleEditModal, type ScheduleEditPayload } from "./ScheduleEditModal";
import { ConfirmDialog } from "./ConfirmDialog";
import { FilterBar, type FilterState } from "./FilterBar";
import { LegendModal } from "./LegendModal";

type ViewMode = "weekly" | "daily";
type SortState = "none" | "confirmed" | "requested";

// ─── Date utilities ──────────────────────────────────────

function getWeekStart(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  r.setDate(r.getDate() - r.getDay());
  return r;
}

interface WeekDay {
  date: string;       // YYYY-MM-DD
  dayName: string;    // "Sun"
  dayNum: string;     // "5"
  isWeekend: boolean;
  isSunday: boolean;
}

function buildWeekDates(weekStart: Date): WeekDay[] {
  const out: WeekDay[] = [];
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    out.push({
      date: `${yyyy}-${mm}-${dd}`,
      dayName: dayNames[i]!,
      dayNum: String(d.getDate()),
      isWeekend: i === 0 || i === 6,
      isSunday: i === 0,
    });
  }
  return out;
}

function parseTimeToHours(t: string | null): number {
  if (!t) return 0;
  const [hh, mm] = t.split(":");
  return (Number.parseInt(hh ?? "0", 10) || 0) + (Number.parseInt(mm ?? "0", 10) || 0) / 60;
}

function formatHourLabel(h: number): string {
  if (h === 0) return "12A";
  if (h < 12) return `${h}A`;
  if (h === 12) return "12P";
  return `${h - 12}P`;
}

function rolePriorityToBadge(p: number): string {
  if (p <= 10) return "Owner";
  if (p <= 20) return "GM";
  if (p <= 30) return "SV";
  return "Staff";
}

function rolePriorityToColor(p: number): string {
  if (p <= 10) return "bg-[var(--color-accent-muted)] text-[var(--color-accent)]";
  if (p <= 20) return "bg-[var(--color-accent-muted)] text-[var(--color-accent)]";
  if (p <= 30) return "bg-[var(--color-warning-muted)] text-[var(--color-warning)]";
  return "bg-[var(--color-success-muted)] text-[var(--color-success)]";
}

function getInitials(name: string | null | undefined): string {
  if (!name) return "??";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "??";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return ((parts[0]![0] ?? "") + (parts[parts.length - 1]![0] ?? "")).toUpperCase();
}

/**
 * Effective hourly rate cascade: user → store → org
 * 현재 context의 store 기준으로 계산 (staff sidebar에서 현재 선택된 매장).
 */
function effectiveRate(
  user: User | undefined,
  store: Store | undefined,
  orgDefault: number | null | undefined,
): number | null {
  if (user?.hourly_rate != null) return user.hourly_rate;
  if (store?.default_hourly_rate != null) return store.default_hourly_rate;
  if (orgDefault != null) return orgDefault;
  return null;
}

// ─── Component ──────────────────────────────────────────

export default function SchedulesCalendarView() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // URL 기반 state 초기화 — back nav 시 자동 복원
  // ?view=weekly|daily&week=YYYY-MM-DD&day=YYYY-MM-DD&store=<id>
  const initView: ViewMode = searchParams.get("view") === "daily" ? "daily" : "weekly";
  const initWeekStart: Date = (() => {
    const w = searchParams.get("week");
    if (w) {
      const d = new Date(w + "T00:00:00");
      if (!Number.isNaN(d.getTime())) return getWeekStart(d);
    }
    return getWeekStart(new Date());
  })();
  const initSelectedDay: string = searchParams.get("day") ?? buildWeekDates(initWeekStart)[0]?.date ?? "";

  const [view, setView] = useState<ViewMode>(initView);
  const [weekStart, setWeekStart] = useState<Date>(initWeekStart);
  const weekDates = useMemo(() => buildWeekDates(weekStart), [weekStart]);
  const [selectedDay, setSelectedDay] = useState(initSelectedDay);
  // 현재 로그인 사용자의 role 기반으로 cost/actions 표시 여부 결정
  // Owner(10) / GM(20) 만 cost 정보 표시, SV(30) / Staff(40) 는 숨김
  const currentUser = useAuthStore((s) => s.user);
  const isGMView = (currentUser?.role_priority ?? 99) <= 20;
  const [weeklySortCol, setWeeklySortCol] = useState(-1);
  const [weeklySortState, setWeeklySortState] = useState<SortState>("none");
  const [dailySortCol, setDailySortCol] = useState(-1);
  const [dailySortState, setDailySortState] = useState<SortState>("none");
  const [selectedStore, setSelectedStore] = useState("");
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; blockId: string; status: string } | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyScheduleId, setHistoryScheduleId] = useState<string | undefined>(undefined);
  const [swapOpen, setSwapOpen] = useState(false);
  const [swapSourceId, setSwapSourceId] = useState<string | null>(null);
  const [editModal, setEditModal] = useState<{ open: boolean; mode: "add" | "edit"; blockId?: string; staffId?: string; date?: string }>({ open: false, mode: "add" });
  const [confirmDialog, setConfirmDialog] = useState<{ open: boolean; type: "delete" | "revert" | "reject" | "cancel" | "confirm"; blockId?: string }>({ open: false, type: "delete" });
  const [filters, setFilters] = useState<FilterState>({ staffIds: [], roles: [], statuses: [], positions: [], shifts: [] });
  const [legendOpen, setLegendOpen] = useState(false);

  // ─── Data fetching ────────────────────────────────────
  const dateFrom = weekDates[0]?.date;
  const dateTo = weekDates[6]?.date;
  const usersQ = useUsers();
  const storesQ = useStores();
  const orgQ = useOrganization();
  const orgDefaultRate = orgQ.data?.default_hourly_rate ?? null;
  const schedulesQ = useSchedules({
    store_id: selectedStore || undefined,
    date_from: dateFrom,
    date_to: dateTo,
    per_page: 500,
  });
  const attendancesQ = useAttendances({
    store_id: selectedStore || undefined,
    date_from: dateFrom,
    date_to: dateTo,
    per_page: 500,
  });

  const users = usersQ.data ?? [];
  const stores = storesQ.data ?? [];
  const schedules: Schedule[] = schedulesQ.data?.items ?? [];
  const attendances = attendancesQ.data?.items ?? [];

  // 첫 store 자동 선택 (URL store 파라미터가 있으면 우선)
  useEffect(() => {
    if (selectedStore === "" && stores.length > 0) {
      const urlStore = searchParams.get("store");
      const found = urlStore && stores.find((s) => s.id === urlStore);
      setSelectedStore(found ? urlStore! : stores[0]!.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stores]);

  // view / weekStart / selectedDay / selectedStore 변경 시 URL sync (history replace)
  useEffect(() => {
    if (selectedStore === "") return; // 아직 초기화 안 됨
    const params = new URLSearchParams();
    params.set("view", view);
    params.set("week", weekDates[0]?.date ?? "");
    if (view === "daily") params.set("day", selectedDay);
    params.set("store", selectedStore);
    // edit/swap 쿼리는 보존
    const edit = searchParams.get("edit");
    const swap = searchParams.get("swap");
    if (edit) params.set("edit", edit);
    if (swap) params.set("swap", swap);
    const query = params.toString();
    router.replace(`/schedules?${query}`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, weekStart, selectedDay, selectedStore]);

  // ?edit=<id> 쿼리 → edit modal 열기 (detail page에서 진입 시)
  useEffect(() => {
    const editId = searchParams.get("edit");
    if (editId && !editModal.open) {
      setEditModal({ open: true, mode: "edit", blockId: editId });
    }
    // 쿼리는 modal 닫을 때 정리
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // ─── Mutations ────────────────────────────────────────
  const submitMutation = useSubmitSchedule();
  const confirmMutation = useConfirmSchedule();
  const rejectMutation = useRejectSchedule();
  const revertMutation = useRevertSchedule();
  const cancelMutation = useCancelSchedule();
  const deleteMutation = useDeleteSchedule();
  const createMutation = useCreateSchedule();
  const updateMutation = useUpdateSchedule();
  const swapMutation = useSwapSchedule();

  // ─── Derived helpers ──────────────────────────────────

  const currentStore = stores.find((s) => s.id === selectedStore);

  // operating_hours에서 open/close 시각 추출
  const { openHour, closeHour } = useMemo(() => {
    let oh = 9;
    let ch = 22;
    const oh_obj = currentStore?.operating_hours as Record<string, string> | null | undefined;
    if (oh_obj && typeof oh_obj === "object") {
      const openStr = oh_obj.open || oh_obj.start;
      const closeStr = oh_obj.close || oh_obj.end;
      if (openStr) oh = Math.floor(parseTimeToHours(openStr));
      if (closeStr) ch = Math.ceil(parseTimeToHours(closeStr));
    }
    return { openHour: oh, closeHour: ch };
  }, [currentStore]);

  function getSchedulesForCell(userId: string, date: string): Schedule[] {
    return schedules.filter(
      (s) => s.user_id === userId && s.work_date === date && (s.store_id === selectedStore),
    );
  }

  function getAttendanceFor(scheduleId: string) {
    return attendances.find((a) => a.schedule_id === scheduleId);
  }

  // ─── Filter + sort ────────────────────────────────────

  const filteredUsers = useMemo(() => {
    let result = users;
    if (filters.staffIds.length > 0) {
      result = result.filter((u) => filters.staffIds.includes(u.id));
    }
    if (filters.roles.length > 0) {
      result = result.filter((u) => filters.roles.includes(rolePriorityToBadge(u.role_priority).toLowerCase()));
    }
    if (filters.statuses.length > 0) {
      result = result.filter((u) => {
        const userScheds = schedules.filter((s) => s.user_id === u.id);
        return userScheds.some((s) => filters.statuses.includes(s.status));
      });
    }
    return result;
  }, [users, filters, schedules]);

  const sortCol = view === "weekly" ? weeklySortCol : dailySortCol;
  const sortState = view === "weekly" ? weeklySortState : dailySortState;

  const sortedUsers = useMemo(() => {
    const arr = [...filteredUsers];
    if (sortCol < 0 || sortState === "none") return arr;

    return arr.sort((a, b) => {
      let aStatus = "none";
      let bStatus = "none";

      if (view === "weekly") {
        const date = weekDates[sortCol]?.date;
        if (date) {
          const aBlocks = schedules.filter((s) => s.user_id === a.id && s.work_date === date && s.store_id === selectedStore);
          const bBlocks = schedules.filter((s) => s.user_id === b.id && s.work_date === date && s.store_id === selectedStore);
          aStatus = aBlocks.find((s) => s.status === "confirmed") ? "confirmed" : aBlocks.find((s) => s.status === "requested") ? "requested" : aBlocks.length > 0 ? "draft" : "none";
          bStatus = bBlocks.find((s) => s.status === "confirmed") ? "confirmed" : bBlocks.find((s) => s.status === "requested") ? "requested" : bBlocks.length > 0 ? "draft" : "none";
        }
      } else {
        const hour = openHour + sortCol;
        const aBlocks = schedules.filter((s) => s.user_id === a.id && s.work_date === selectedDay && s.store_id === selectedStore && parseTimeToHours(s.start_time) <= hour && parseTimeToHours(s.end_time) > hour);
        const bBlocks = schedules.filter((s) => s.user_id === b.id && s.work_date === selectedDay && s.store_id === selectedStore && parseTimeToHours(s.start_time) <= hour && parseTimeToHours(s.end_time) > hour);
        aStatus = aBlocks.find((s) => s.status === "confirmed") ? "confirmed" : aBlocks.find((s) => s.status === "requested") ? "requested" : aBlocks.length > 0 ? "draft" : "none";
        bStatus = bBlocks.find((s) => s.status === "confirmed") ? "confirmed" : bBlocks.find((s) => s.status === "requested") ? "requested" : bBlocks.length > 0 ? "draft" : "none";
      }

      const hasA = aStatus !== "none" ? 0 : 1;
      const hasB = bStatus !== "none" ? 0 : 1;
      if (hasA !== hasB) return hasA - hasB;

      const order = sortState === "confirmed"
        ? { confirmed: 0, requested: 1, draft: 2, none: 3 }
        : { requested: 0, confirmed: 1, draft: 2, none: 3 };
      return (order[aStatus as keyof typeof order] ?? 3) - (order[bStatus as keyof typeof order] ?? 3);
    });
  }, [sortCol, sortState, view, selectedStore, selectedDay, filteredUsers, schedules, weekDates, openHour]);

  // ─── Columns + totals ─────────────────────────────────

  const weeklyColumns = useMemo(() => weekDates.map((day) => {
    const daySchedules = schedules.filter((s) => s.work_date === day.date && s.store_id === selectedStore);
    const confirmed = daySchedules.filter((s) => s.status === "confirmed");
    const pending = daySchedules.filter((s) => s.status === "requested");
    const sumHours = (arr: Schedule[]) => arr.reduce((sum, s) => sum + Math.max(0, parseTimeToHours(s.end_time) - parseTimeToHours(s.start_time)), 0);
    const sumLabor = (arr: Schedule[]) => arr.reduce((sum, s) => {
      const hrs = Math.max(0, parseTimeToHours(s.end_time) - parseTimeToHours(s.start_time));
      const u = users.find((x) => x.id === s.user_id);
      const rate = s.hourly_rate || effectiveRate(u, currentStore, orgDefaultRate) || 0;
      return sum + hrs * rate;
    }, 0);
    return {
      key: day.date,
      label: day.dayName,
      sublabel: day.dayNum,
      isSunday: day.isSunday,
      isSaturday: day.isWeekend && !day.isSunday,
      teamConfirmed: new Set(confirmed.map((s) => s.user_id)).size,
      teamPending: new Set(pending.map((s) => s.user_id)).size,
      hoursConfirmed: sumHours(confirmed),
      hoursPending: sumHours(pending),
      laborConfirmed: sumLabor(confirmed),
      laborPending: sumLabor(pending),
    };
  }), [weekDates, schedules, selectedStore, users]);

  const dailyHourRange = useMemo(() => {
    const out: number[] = [];
    for (let h = openHour; h < closeHour; h++) out.push(h);
    return out;
  }, [openHour, closeHour]);

  const dailyColumns = useMemo(() => dailyHourRange.map((h) => {
    const daySchedules = schedules.filter((s) => s.work_date === selectedDay && s.store_id === selectedStore && parseTimeToHours(s.start_time) <= h && parseTimeToHours(s.end_time) > h);
    const confirmed = daySchedules.filter((s) => s.status === "confirmed");
    const pending = daySchedules.filter((s) => s.status === "requested");
    const sumLabor = (arr: Schedule[]) => arr.reduce((sum, s) => {
      const u = users.find((x) => x.id === s.user_id);
      return sum + (s.hourly_rate || effectiveRate(u, currentStore, orgDefaultRate) || 0);
    }, 0);
    return {
      key: `h${h}`,
      hour: h,
      label: formatHourLabel(h),
      teamConfirmed: confirmed.length,
      teamPending: pending.length,
      hoursConfirmed: confirmed.length,
      hoursPending: pending.length,
      laborConfirmed: sumLabor(confirmed),
      laborPending: sumLabor(pending),
    };
  }), [dailyHourRange, schedules, selectedStore, selectedDay, users]);

  const weeklyTotals = useMemo(() => {
    const conf = schedules.filter((s) => weekDates.some((d) => d.date === s.work_date) && s.store_id === selectedStore && s.status === "confirmed");
    const pend = schedules.filter((s) => weekDates.some((d) => d.date === s.work_date) && s.store_id === selectedStore && s.status === "requested");
    return {
      hc: weeklyColumns.reduce((a, c) => a + c.hoursConfirmed, 0),
      hp: weeklyColumns.reduce((a, c) => a + c.hoursPending, 0),
      lc: weeklyColumns.reduce((a, c) => a + c.laborConfirmed, 0),
      lp: weeklyColumns.reduce((a, c) => a + c.laborPending, 0),
      tc: new Set(conf.map((s) => s.user_id)).size,
      tp: new Set(pend.map((s) => s.user_id)).size,
    };
  }, [weeklyColumns, schedules, weekDates, selectedStore]);

  const dailyTotals = useMemo(() => {
    const dayBlocks = schedules.filter((s) => s.work_date === selectedDay && s.store_id === selectedStore);
    const conf = dayBlocks.filter((s) => s.status === "confirmed");
    const pend = dayBlocks.filter((s) => s.status === "requested");
    const sumHours = (arr: Schedule[]) => arr.reduce((s, b) => s + Math.max(0, parseTimeToHours(b.end_time) - parseTimeToHours(b.start_time)), 0);
    const sumLabor = (arr: Schedule[]) => arr.reduce((s, b) => {
      const u = users.find((x) => x.id === b.user_id);
      const hrs = Math.max(0, parseTimeToHours(b.end_time) - parseTimeToHours(b.start_time));
      return s + hrs * (b.hourly_rate || effectiveRate(u, currentStore, orgDefaultRate) || 0);
    }, 0);
    return {
      hc: sumHours(conf),
      hp: sumHours(pend),
      lc: sumLabor(conf),
      lp: sumLabor(pend),
      tc: new Set(conf.map((s) => s.user_id)).size,
      tp: new Set(pend.map((s) => s.user_id)).size,
    };
  }, [schedules, selectedDay, selectedStore, users]);

  const totals = view === "weekly" ? weeklyTotals : dailyTotals;
  const columns = view === "weekly" ? weeklyColumns : dailyColumns;
  const selectedDayInfo = weekDates.find((d) => d.date === selectedDay);

  // ─── Handlers ─────────────────────────────────────────

  function handleSort(colIndex: number, state: SortState) {
    if (view === "weekly") {
      setWeeklySortCol(state === "none" ? -1 : colIndex);
      setWeeklySortState(state);
    } else {
      setDailySortCol(state === "none" ? -1 : colIndex);
      setDailySortState(state);
    }
  }

  function handleDayClick(dateKey: string) {
    setSelectedDay(dateKey);
    setView("daily");
  }

  function handleBlockClick(e: React.MouseEvent, sched: Schedule) {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, blockId: sched.id, status: sched.status });
  }

  function handleContextAction(action: string) {
    if (!contextMenu) return;
    const blockId = contextMenu.blockId;
    if (action === "history") {
      setHistoryScheduleId(blockId);
      setHistoryOpen(true);
    }
    if (action === "swap") {
      setSwapSourceId(blockId);
      setSwapOpen(true);
    }
    if (action === "details") router.push(`/schedules/${blockId}`);
    if (action === "edit") setEditModal({ open: true, mode: "edit", blockId });
    if (action === "revert") setConfirmDialog({ open: true, type: "revert", blockId });
    if (action === "delete") setConfirmDialog({ open: true, type: "delete", blockId });
    if (action === "reject") setConfirmDialog({ open: true, type: "reject", blockId });
    if (action === "cancel") setConfirmDialog({ open: true, type: "cancel", blockId });
    if (action === "confirm") setConfirmDialog({ open: true, type: "confirm", blockId });
  }

  function openAddModal(staffId?: string, date?: string) {
    setEditModal({ open: true, mode: "add", staffId, date });
  }

  function closeEditModal() {
    setEditModal({ open: false, mode: "add" });
    // 쿼리 정리
    if (searchParams.get("edit")) {
      router.replace("/schedules", { scroll: false });
    }
  }

  function handleScheduleEditSave(payload: ScheduleEditPayload) {
    if (editModal.mode === "add") {
      createMutation.mutate({
        user_id: payload.userId,
        store_id: selectedStore,
        work_role_id: payload.workRoleId,
        work_date: payload.date,
        start_time: payload.startTime,
        end_time: payload.endTime,
        status: payload.status,
        note: payload.notes || null,
      }, {
        onSuccess: closeEditModal,
      });
    } else if (editModal.mode === "edit" && editModal.blockId) {
      updateMutation.mutate({
        id: editModal.blockId,
        data: {
          user_id: payload.userId,
          work_role_id: payload.workRoleId,
          work_date: payload.date,
          start_time: payload.startTime,
          end_time: payload.endTime,
          note: payload.notes || null,
        },
      }, {
        onSuccess: closeEditModal,
      });
    }
  }

  // ─── Daily view helper ────────────────────────────────

  function getDailyScheduleAtHour(userId: string, hour: number): Schedule | undefined {
    return schedules.find((s) =>
      s.user_id === userId &&
      s.work_date === selectedDay &&
      s.store_id === selectedStore &&
      parseTimeToHours(s.start_time) <= hour &&
      parseTimeToHours(s.end_time) > hour,
    );
  }

  // ─── Stats helpers per user ───────────────────────────

  function getUserConfirmedHours(userId: string, date: string): number {
    return schedules
      .filter((s) => s.user_id === userId && s.work_date === date && s.store_id === selectedStore && s.status === "confirmed")
      .reduce((sum, s) => sum + Math.max(0, parseTimeToHours(s.end_time) - parseTimeToHours(s.start_time)), 0);
  }

  function getUserPendingHours(userId: string, date: string): number {
    return schedules
      .filter((s) => s.user_id === userId && s.work_date === date && s.store_id === selectedStore && s.status === "requested")
      .reduce((sum, s) => sum + Math.max(0, parseTimeToHours(s.end_time) - parseTimeToHours(s.start_time)), 0);
  }

  // ─── Store hours label ────────────────────────────────
  const storeHoursLabel = `${openHour > 12 ? `${openHour - 12}PM` : `${openHour}AM`} - ${closeHour > 12 ? `${closeHour - 12}PM` : `${closeHour}AM`}`;

  // ─── Render ───────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[var(--color-bg)]">
      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x} y={contextMenu.y}
          status={contextMenu.status}
          userRole={isGMView ? "gm" : "sv"}
          onClose={() => setContextMenu(null)}
          onAction={handleContextAction}
        />
      )}

      {/* History Panel */}
      <HistoryPanel
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        scheduleId={historyScheduleId}
        staffName={(() => {
          const s = historyScheduleId ? schedules.find((x) => x.id === historyScheduleId) : null;
          const u = s ? users.find((x) => x.id === s.user_id) : null;
          return u?.full_name ?? undefined;
        })()}
        date={(() => {
          const s = historyScheduleId ? schedules.find((x) => x.id === historyScheduleId) : null;
          if (!s) return "";
          const d = new Date(s.work_date + "T00:00:00");
          return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
        })()}
      />

      {/* Swap Modal */}
      {(() => {
        const fromSchedule = swapSourceId ? schedules.find((s) => s.id === swapSourceId) : null;
        const fromUser = fromSchedule ? users.find((u) => u.id === fromSchedule.user_id) : null;
        return (
          <SwapModal
            open={swapOpen}
            onClose={() => { setSwapOpen(false); setSwapSourceId(null); }}
            fromSchedule={fromSchedule ?? null}
            fromUser={fromUser ?? null}
            candidateSchedules={schedules}
            users={users}
            isSubmitting={swapMutation.isPending}
            onSwap={(otherId, reason) => {
              if (!swapSourceId) return;
              swapMutation.mutate({ id: swapSourceId, other_schedule_id: otherId, reason }, {
                onSuccess: () => { setSwapOpen(false); setSwapSourceId(null); },
              });
            }}
          />
        );
      })()}

      {/* Schedule Edit Modal */}
      {(() => {
        const editSchedule = editModal.blockId ? schedules.find((s) => s.id === editModal.blockId) : null;
        return (
          <ScheduleEditModal
            open={editModal.open}
            mode={editModal.mode}
            schedule={editSchedule}
            prefilledUserId={editModal.staffId}
            prefilledDate={editModal.date}
            users={users}
            storeId={selectedStore}
            onClose={closeEditModal}
            onSave={handleScheduleEditSave}
            isSaving={createMutation.isPending || updateMutation.isPending}
            onDelete={editModal.mode === "edit" && editModal.blockId
              ? () => {
                  const id = editModal.blockId!;
                  closeEditModal();
                  setConfirmDialog({ open: true, type: "delete", blockId: id });
                }
              : undefined}
          />
        );
      })()}

      {/* Confirm Dialog */}
      {(() => {
        const t = confirmDialog.type;
        const cfg: Record<typeof t, { title: string; message: string; label: string; variant: "danger" | "primary"; reason: boolean; reasonLabel?: string }> = {
          delete:  { title: "Delete Schedule?", message: "This schedule will be permanently deleted. This action cannot be undone.", label: "Delete", variant: "danger", reason: false },
          revert:  { title: "Revert to Requested?", message: "This confirmed schedule will be reverted to requested status and will need to be re-confirmed.", label: "Revert", variant: "primary", reason: false },
          reject:  { title: "Reject Schedule", message: "This will mark the schedule as rejected. You can optionally provide a reason.", label: "Reject", variant: "danger", reason: true, reasonLabel: "Rejection reason (optional)" },
          cancel:  { title: "Cancel Confirmed Schedule", message: "This will cancel the confirmed schedule. You can optionally provide a reason.", label: "Cancel Schedule", variant: "danger", reason: true, reasonLabel: "Cancellation reason (optional)" },
          confirm: { title: "Confirm Schedule?", message: "This will mark the schedule as confirmed and notify the staff member.", label: "Confirm", variant: "primary", reason: false },
        };
        const c = cfg[t];
        const close = () => setConfirmDialog({ open: false, type: "delete" });
        const handle = (reason?: string) => {
          const id = confirmDialog.blockId;
          if (!id) { close(); return; }
          if (t === "delete") deleteMutation.mutate(id);
          else if (t === "revert") revertMutation.mutate(id);
          else if (t === "confirm") confirmMutation.mutate(id);
          else if (t === "reject") rejectMutation.mutate({ id, rejection_reason: reason });
          else if (t === "cancel") cancelMutation.mutate({ id, cancellation_reason: reason });
          close();
        };
        return (
          <ConfirmDialog
            open={confirmDialog.open}
            title={c.title}
            message={c.message}
            confirmLabel={c.label}
            confirmVariant={c.variant}
            requiresReason={c.reason}
            reasonLabel={c.reasonLabel}
            onConfirm={handle}
            onCancel={close}
          />
        );
      })()}

      {/* Legend Modal */}
      <LegendModal open={legendOpen} onClose={() => setLegendOpen(false)} />

      <div className="px-4 sm:px-6 xl:px-8 pb-8">
        {/* Row 1: Store selector */}
        <div className="flex items-center gap-3 pt-4 pb-1">
          <select
            value={selectedStore}
            onChange={(e) => setSelectedStore(e.target.value)}
            className="px-3 py-1.5 bg-white border-2 border-[var(--color-accent)] rounded-lg text-[13px] font-semibold text-[var(--color-accent)] cursor-pointer"
          >
            {stores.length === 0 && <option value="">Loading…</option>}
            {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <span className="text-[12px] text-[var(--color-text-muted)]">{storeHoursLabel}</span>
        </div>

        {/* Row 2: Title + summary numbers + controls */}
        <div className="flex items-center justify-between py-2 gap-3 flex-wrap">
          <div className="flex items-center gap-3 md:gap-5 flex-wrap">
            <h1 className="text-[22px] font-semibold text-[var(--color-text)]">Schedules</h1>
            {schedulesQ.isLoading && <span className="text-[11px] text-[var(--color-text-muted)]">Loading…</span>}
            <div className="hidden md:flex items-center gap-3 text-[13px] text-[var(--color-text-secondary)]">
              <span>Staff: <strong className="text-[14px] text-[var(--color-text)]">{filteredUsers.length}</strong></span>
              <span className="w-px h-4 bg-[var(--color-border)]" />
              <span>Scheduled: <strong className="text-[14px] text-[var(--color-text)]">{totals.tc}</strong></span>
              <span className="w-px h-4 bg-[var(--color-border)]" />
              <span>Pending: <strong className="text-[14px] text-[var(--color-warning)]">{totals.tp}</strong></span>
              {isGMView && <>
                <span className="w-px h-4 bg-[var(--color-border)]" />
                <span>Labor: <strong className="text-[14px] text-[var(--color-success)]">${Math.round(totals.lc)}</strong>{totals.lp > 0 && <strong className="text-[14px] text-[var(--color-warning)]"> +${Math.round(totals.lp)}</strong>}</span>
              </>}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-0.5">
              {(["weekly", "daily"] as const).map((v) => (
                <button key={v} type="button" onClick={() => setView(v)}
                  className={`px-3.5 py-1.5 rounded-md text-[13px] font-semibold transition-all ${view === v ? "bg-[var(--color-accent)] text-white" : "text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"}`}>
                  {v === "weekly" ? "Weekly" : "Daily"}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (view === "weekly") {
                    const next = new Date(weekStart); next.setDate(next.getDate() - 7); setWeekStart(next);
                  } else {
                    const d = new Date(selectedDay + "T00:00:00"); d.setDate(d.getDate() - 1);
                    setSelectedDay(d.toISOString().slice(0, 10));
                  }
                }}
                className="w-8 h-8 rounded-lg border border-[var(--color-border)] bg-white flex items-center justify-center text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]"
                aria-label="Previous period"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="9 11 5 7 9 3" /></svg>
              </button>
              <span className="text-[13px] font-semibold text-[var(--color-text)] min-w-[140px] text-center">
                {view === "weekly"
                  ? `${weekDates[0]?.dayName} ${weekDates[0]?.dayNum} – ${weekDates[6]?.dayName} ${weekDates[6]?.dayNum}`
                  : `${selectedDayInfo?.dayName} ${selectedDayInfo?.dayNum}`}
              </span>
              <button
                type="button"
                onClick={() => {
                  if (view === "weekly") {
                    const next = new Date(weekStart); next.setDate(next.getDate() + 7); setWeekStart(next);
                  } else {
                    const d = new Date(selectedDay + "T00:00:00"); d.setDate(d.getDate() + 1);
                    setSelectedDay(d.toISOString().slice(0, 10));
                  }
                }}
                className="w-8 h-8 rounded-lg border border-[var(--color-border)] bg-white flex items-center justify-center text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]"
                aria-label="Next period"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="5 3 9 7 5 11" /></svg>
              </button>
            </div>
            <button type="button" onClick={() => openAddModal()} className="bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-white px-4 py-2 rounded-lg text-[13px] font-semibold flex items-center gap-1.5 transition-colors">
              + Add Schedule
            </button>
            <button
              type="button"
              onClick={() => setLegendOpen(true)}
              className="w-8 h-8 rounded-lg border border-[var(--color-border)] bg-white flex items-center justify-center text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]"
              title="View legend"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <circle cx="7" cy="7" r="5.5" />
                <path d="M5.5 5.5a1.5 1.5 0 113 0c0 1-1.5 1-1.5 2" />
                <circle cx="7" cy="9.5" r="0.5" fill="currentColor" />
              </svg>
            </button>
          </div>
        </div>

        {/* Row 3: Filters */}
        <FilterBar
          filters={filters}
          onChange={setFilters}
          users={users}
          schedules={schedules}
          selectedStoreId={selectedStore}
        />

        {/* Table Grid */}
        <div className="bg-white border border-[var(--color-border)] rounded-xl overflow-x-auto">
          <div style={{ minWidth: view === "weekly" ? 900 : 1100 }}>
            <table className="w-full border-collapse" style={{ tableLayout: "fixed" }}>
              <colgroup>
                <col style={{ width: 180 }} />
                {columns.map((c) => <col key={c.key} />)}
                <col style={{ width: 90 }} />
              </colgroup>

              <StatsHeader
                columns={columns}
                showLabor={isGMView}
                sortCol={sortCol}
                sortState={sortState}
                onSort={handleSort}
                onColumnClick={view === "weekly" ? handleDayClick : undefined}
                firstColLabel={view === "weekly" ? "Day" : "Time"}
                totalHoursConfirmed={totals.hc}
                totalHoursPending={totals.hp}
                totalLaborConfirmed={totals.lc}
                totalLaborPending={totals.lp}
                totalTeamConfirmed={totals.tc}
                totalTeamPending={totals.tp}
              />

              <tbody>
                {sortedUsers.map((u: User) => {
                  // Effective rate cascade: user → current store → org
                  const userEffective = effectiveRate(u, currentStore, orgDefaultRate);
                  const isUserCustom = u.hourly_rate != null;
                return (
                  <tr key={u.id} className="border-b border-[var(--color-border)] last:border-b-0 hover:bg-[var(--color-surface-hover)] transition-[background-color] duration-100">
                    <td className="px-4 py-3 border-r-2 border-[var(--color-border)]">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${rolePriorityToColor(u.role_priority)}`}>{getInitials(u.full_name)}</div>
                        <div className="min-w-0">
                          <div className="text-[13px] font-semibold text-[var(--color-text)] truncate">{u.full_name || u.username}</div>
                          <div className="text-[10px] text-[var(--color-text-muted)]">
                            <span className={u.role_priority <= 20 ? "text-[var(--color-accent)] font-semibold" : u.role_priority <= 30 ? "text-[var(--color-warning)] font-semibold" : "font-semibold"}>{rolePriorityToBadge(u.role_priority)}</span>
                            {isGMView && userEffective != null ? ` · $${userEffective}/hr${isUserCustom ? "" : " (inherited)"}` : null}
                            {isGMView && userEffective == null && <span className="text-[var(--color-danger)]"> · No rate</span>}
                          </div>
                        </div>
                      </div>
                    </td>

                    {view === "weekly" ? (
                      <>
                        {weekDates.map((day, i) => {
                          const cellSchedules = getSchedulesForCell(u.id, day.date);
                          return (
                            <td key={day.date} className={`px-1.5 py-2 border-r border-[var(--color-border)] ${sortCol === i ? "bg-[var(--color-accent)]/[0.04]" : ""}`}>
                              {cellSchedules.length > 0 ? (
                                <div className="flex flex-col gap-1">
                                  {cellSchedules.map((s) => (
                                    <ScheduleBlock
                                      key={s.id}
                                      schedule={s}
                                      user={u}
                                      showCost={isGMView}
                                      attendance={getAttendanceFor(s.id)}
                                      currentStoreId={selectedStore}
                                      onClick={(e) => handleBlockClick(e, s)}
                                    />
                                  ))}
                                </div>
                              ) : (
                                <div
                                  className="h-full min-h-[44px] flex items-center justify-center opacity-0 hover:opacity-40 transition-opacity cursor-pointer"
                                  role="button"
                                  onClick={() => openAddModal(u.id, day.date)}
                                  title={userEffective == null ? "Warning: this user has no hourly rate" : undefined}
                                >
                                  {userEffective == null ? (
                                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                                      <path d="M7 4v3m0 2.5h.01M2.5 11.5h9a1 1 0 00.87-1.5L8.37 3a1 1 0 00-1.74 0L2.63 10a1 1 0 00.87 1.5z" stroke="var(--color-warning)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                  ) : (
                                    <span className="text-[var(--color-text-muted)] text-[16px]">+</span>
                                  )}
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </>
                    ) : (
                      <>
                        {(() => {
                          const cells: React.ReactNode[] = [];
                          let h = openHour;
                          while (h < closeHour) {
                            const sched = getDailyScheduleAtHour(u.id, h);
                            const colIndex = h - openHour;
                            if (sched && Math.floor(parseTimeToHours(sched.start_time)) === h) {
                              const span = Math.min(Math.ceil(parseTimeToHours(sched.end_time)), closeHour) - h;
                              cells.push(
                                <td key={`h${h}`} colSpan={span} className={`p-1 border-r border-[var(--color-border)]/20 align-middle ${sortCol === colIndex ? "bg-[var(--color-accent)]/[0.04]" : ""}`}>
                                  <ScheduleBlock
                                    schedule={sched}
                                    user={u}
                                    showCost={isGMView}
                                    attendance={getAttendanceFor(sched.id)}
                                    currentStoreId={selectedStore}
                                    onClick={(e) => handleBlockClick(e, sched)}
                                  />
                                </td>,
                              );
                              h = Math.ceil(parseTimeToHours(sched.end_time));
                            } else if (sched) {
                              h++;
                            } else {
                              cells.push(
                                <td
                                  key={`h${h}`}
                                  className={`h-[56px] border-r border-[var(--color-border)]/20 cursor-pointer hover:bg-[var(--color-surface-hover)] ${sortCol === colIndex ? "bg-[var(--color-accent)]/[0.04]" : ""}`}
                                  onClick={() => openAddModal(u.id, selectedDay)}
                                  role="button"
                                />,
                              );
                              h++;
                            }
                          }
                          return cells;
                        })()}
                      </>
                    )}

                    <td className="px-2 py-3 text-center border-l border-[var(--color-border)]">
                      {view === "weekly" ? (
                        (() => {
                          const ch = weekDates.reduce((sum, d) => sum + getUserConfirmedHours(u.id, d.date), 0);
                          const ph = weekDates.reduce((sum, d) => sum + getUserPendingHours(u.id, d.date), 0);
                          return <div className="flex flex-col items-center">
                            <span className="text-[13px] font-bold text-[var(--color-success)]">{ch}h</span>
                            {ph > 0 && <span className="text-[10px] font-semibold text-[var(--color-warning)]">+{ph}h</span>}
                            {isGMView && userEffective != null ? <span className="text-[10px] text-[var(--color-success)]">${ch * userEffective}</span> : null}
                            {isGMView && userEffective != null && ph > 0 && <span className="text-[10px] text-[var(--color-warning)]">+${ph * userEffective}</span>}
                            {isGMView && userEffective == null && <span className="text-[10px] text-[var(--color-danger)]">N/A</span>}
                          </div>;
                        })()
                      ) : (
                        (() => {
                          const blocks = schedules.filter((b) => b.work_date === selectedDay && b.user_id === u.id && b.store_id === selectedStore);
                          const h = blocks.filter((b) => b.status === "confirmed").reduce((sum, b) => sum + Math.max(0, parseTimeToHours(b.end_time) - parseTimeToHours(b.start_time)), 0);
                          const ph = blocks.filter((b) => b.status === "requested").reduce((sum, b) => sum + Math.max(0, parseTimeToHours(b.end_time) - parseTimeToHours(b.start_time)), 0);
                          return <div className="flex flex-col items-center">
                            {h > 0 && <span className="text-[13px] font-bold text-[var(--color-success)]">{h}h</span>}
                            {ph > 0 && <span className="text-[10px] font-semibold text-[var(--color-warning)]">+{ph}h</span>}
                            {h === 0 && ph === 0 && <span className="text-[11px] text-[var(--color-text-muted)]">--</span>}
                          </div>;
                        })()
                      )}
                    </td>
                  </tr>
                );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
