"use client";

/**
 * SchedulesCalendarView — server types 직접 사용. mockup adapter 폐지.
 *
 * 데이터: useSchedules / useUsers / useStores 를 직접 사용.
 * 모든 schedule 처리는 server `Schedule` 형태(start_time/end_time string, user_id/store_id)로.
 */

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useQueries } from "@tanstack/react-query";
import api from "@/lib/api";
import { parseApiError, todayInTimezone } from "@/lib/utils";
import { useRouter, useSearchParams } from "next/navigation";
import { useSchedules, useConfirmSchedule, useRejectSchedule, useDeleteSchedule, useSubmitSchedule, useRevertSchedule, useCancelSchedule, useCreateSchedule, useUpdateSchedule, useSwitchSchedule } from "@/hooks/useSchedules";
import { useUsers } from "@/hooks/useUsers";
import { ROLE_PRIORITY } from "@/lib/permissions";
import { useStores } from "@/hooks/useStores";
import { useOrganization } from "@/hooks/useOrganization";
import { useAttendances } from "@/hooks/useAttendances";
import { useResolveSetting } from "@/hooks/useSettings";
import { useAuthStore } from "@/stores/authStore";
import type { Schedule, Store, User } from "@/types";
import { ScheduleBlock } from "./ScheduleBlock";
import { StatsHeader } from "./StatsHeader";
import { ContextMenu } from "./ContextMenu";
import { HistoryPanel } from "./HistoryPanel";
import { SwapModal } from "./SwapModal";
import { ChangeStaffModal } from "./ChangeStaffModal";
import { ScheduleEditModal, type ScheduleEditPayload } from "./ScheduleEditModal";
import { ConfirmDialog } from "./ConfirmDialog";
import { FilterBar, type FilterState, type EmptyStaffSort } from "./FilterBar";
import { LegendModal } from "./LegendModal";
import { MonthlyGrid } from "./MonthlyGrid";
import { useShifts } from "@/hooks/useShifts";
import { useWorkRoles } from "@/hooks/useWorkRoles";
import { useBulkCreateSchedules, useBulkUpdateSchedules, useBulkDeleteSchedules } from "@/hooks/useSchedules";
import BulkScheduleView, { type SavePayload } from "./BulkScheduleView";
import { useResultModal } from "@/components/ui/ResultModal";

type ViewMode = "weekly" | "daily" | "monthly";
type SortState = "none" | "confirmed" | "requested";

// ─── Date utilities ──────────────────────────────────────

function getWeekStart(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  r.setDate(r.getDate() - r.getDay());
  return r;
}

/** Date → "YYYY-MM-DD" using LOCAL timezone (toISOString은 UTC라 KST에서 하루 어긋남) */
function fmtLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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

/** 실제 근무시간 (break 제외). cost 계산에 사용. overnight 처리 포함. */
function getNetWorkHours(s: Schedule): number {
  const startH = parseTimeToHours(s.start_time);
  const endH = parseTimeToHours(s.end_time);
  const gross = endH > startH ? endH - startH : (24 - startH + endH);
  if (s.break_start_time && s.break_end_time) {
    const breakHrs = Math.max(0, parseTimeToHours(s.break_end_time) - parseTimeToHours(s.break_start_time));
    return Math.max(0, gross - breakHrs);
  }
  return gross;
}

/** hours 소수점 최대 2자리 반올림. 정수면 정수 표시. */
function fmtH(h: number): string {
  const r = Math.round(h * 100) / 100;
  return r % 1 === 0 ? String(r) : r.toFixed(r * 10 % 1 === 0 ? 1 : 2);
}

function formatHourLabel(h: number): string {
  const hNorm = h % 24; // overnight hours (24, 25, ...) → (0, 1, ...)
  const isNextDay = h >= 24;
  const base =
    hNorm === 0 ? "0A" :
    hNorm < 12 ? `${hNorm}A` :
    hNorm === 12 ? "12P" :
    `${hNorm - 12}P`;
  return isNextDay ? `${base}+1` : base;
}

function rolePriorityToBadge(p: number): string {
  if (p <= ROLE_PRIORITY.OWNER) return "Owner";
  if (p <= ROLE_PRIORITY.GM) return "GM";
  if (p <= ROLE_PRIORITY.SV) return "SV";
  return "Staff";
}

function rolePriorityToColor(p: number): string {
  if (p <= ROLE_PRIORITY.OWNER) return "bg-[var(--color-accent-muted)] text-[var(--color-accent)]";
  if (p <= ROLE_PRIORITY.GM) return "bg-[var(--color-accent-muted)] text-[var(--color-accent)]";
  if (p <= ROLE_PRIORITY.SV) return "bg-[var(--color-warning-muted)] text-[var(--color-warning)]";
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

// ─── Store Multi-Select ─────────────────────────────────

function StoreMultiSelect({ stores, selectedStores, onChange }: {
  stores: Store[];
  selectedStores: string[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const isAll = selectedStores.length === 0;

  // 외부 클릭 시 닫기
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  function toggleStore(id: string) {
    if (selectedStores.includes(id)) {
      const next = selectedStores.filter((s) => s !== id);
      onChange(next); // 빈 배열이면 All
    } else {
      onChange([...selectedStores, id]);
    }
  }

  function selectAll() {
    onChange([]);
  }

  const label = isAll
    ? "All Stores"
    : selectedStores.length === 1
      ? (stores.find((s) => s.id === selectedStores[0])?.name ?? "Store")
      : `${selectedStores.length} Stores`;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="px-3 py-1.5 bg-[var(--color-surface)] border-2 border-[var(--color-accent)] rounded-lg text-[13px] font-semibold text-[var(--color-accent)] cursor-pointer max-w-[200px] truncate flex items-center gap-1.5"
      >
        <span className="truncate">{label}</span>
        <svg width="10" height="6" viewBox="0 0 10 6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`}>
          <polyline points="1 1 5 5 9 1" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg shadow-lg min-w-[200px] max-h-[300px] overflow-y-auto py-1">
          {/* All option */}
          <button
            type="button"
            onClick={selectAll}
            className={`w-full px-3 py-2 text-left text-[12px] font-semibold flex items-center gap-2 hover:bg-[var(--color-surface-hover)] transition-colors ${isAll ? "text-[var(--color-accent)]" : "text-[var(--color-text-secondary)]"}`}
          >
            <span className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${isAll ? "bg-[var(--color-accent)] border-[var(--color-accent)]" : "border-[var(--color-border)]"}`}>
              {isAll && <svg width="10" height="8" viewBox="0 0 10 8" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 4 7 9 1" /></svg>}
            </span>
            All Stores
          </button>

          <div className="border-t border-[var(--color-border)] my-1" />

          {/* Store options */}
          {stores.map((s) => {
            const checked = !isAll && selectedStores.includes(s.id);
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => toggleStore(s.id)}
                className={`w-full px-3 py-2 text-left text-[12px] flex items-center gap-2 hover:bg-[var(--color-surface-hover)] transition-colors ${checked ? "text-[var(--color-text)] font-semibold" : "text-[var(--color-text-secondary)]"}`}
              >
                <span className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${checked ? "bg-[var(--color-accent)] border-[var(--color-accent)]" : "border-[var(--color-border)]"}`}>
                  {checked && <svg width="10" height="8" viewBox="0 0 10 8" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 4 7 9 1" /></svg>}
                </span>
                <span className="truncate">{s.name}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Component ──────────────────────────────────────────

export default function SchedulesCalendarView() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // URL 기반 state 초기화 — back nav 시 자동 복원
  // ?view=weekly|daily&week=YYYY-MM-DD&day=YYYY-MM-DD&store=<id>
  const initViewParam = searchParams.get("view");
  const initView: ViewMode = initViewParam === "daily" ? "daily" : initViewParam === "monthly" ? "monthly" : "weekly";
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
  // Monthly
  const [monthYear, setMonthYear] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  // 현재 로그인 사용자의 role 기반으로 cost/actions 표시 여부 결정
  // Owner(10) / GM(20) 만 cost 정보 표시, SV(30) / Staff(40) 는 숨김
  const currentUser = useAuthStore((s) => s.user);
  const isGMView = (currentUser?.role_priority ?? 99) <= ROLE_PRIORITY.GM;
  const [weeklySortCol, setWeeklySortCol] = useState(-1);
  const [weeklySortState, setWeeklySortState] = useState<SortState>("none");
  const [dailySortCol, setDailySortCol] = useState(-1);
  const [dailySortState, setDailySortState] = useState<SortState>("none");
  // 멀티 스토어 선택: 빈 배열 = All (전체)
  const [selectedStores, setSelectedStores] = useState<string[]>([]);
  const isAllStores = selectedStores.length === 0;
  const selectedStoreSet = useMemo(() => new Set(selectedStores), [selectedStores]);
  const primaryStoreId = selectedStores[0] ?? "";
  // 스케줄 필터 헬퍼: All이면 모든 store 통과, 아니면 선택된 store만
  const matchesStoreFilter = (storeId: string) => isAllStores || selectedStoreSet.has(storeId);
  // backward compat alias
  const selectedStore = primaryStoreId;
  const [contextMenu, setContextMenu] = useState<{ anchorEl: HTMLElement; blockId: string; status: string } | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyScheduleId, setHistoryScheduleId] = useState<string | undefined>(undefined);
  const [switchOpen, setSwitchOpen] = useState(false);
  const [switchSourceId, setSwitchSourceId] = useState<string | null>(null);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const [emptyStaffSort, setEmptyStaffSort] = useState<EmptyStaffSort>(() => {
    if (typeof window === "undefined") return "bottom";
    const v = localStorage.getItem("schedule.emptyStaffSort");
    if (v === "bottom" || v === "top" || v === "in-order") return v;
    // legacy 마이그레이션 (구버전 emptyStaffMode 키)
    const legacy = localStorage.getItem("schedule.emptyStaffMode");
    if (legacy === "show") return "in-order";
    if (legacy === "down") return "bottom";
    return "bottom";
  });
  const [emptyStaffHide, setEmptyStaffHide] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    const v = localStorage.getItem("schedule.emptyStaffHide");
    if (v === "1") return true;
    if (v === "0") return false;
    // legacy 마이그레이션
    return localStorage.getItem("schedule.emptyStaffMode") === "hide";
  });
  useEffect(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem("schedule.emptyStaffSort", emptyStaffSort);
      localStorage.setItem("schedule.emptyStaffHide", emptyStaffHide ? "1" : "0");
    }
  }, [emptyStaffSort, emptyStaffHide]);
  const [changeStaffOpen, setChangeStaffOpen] = useState(false);
  const [changeStaffSourceId, setChangeStaffSourceId] = useState<string | null>(null);
  const [editModal, setEditModal] = useState<{ open: boolean; mode: "add" | "edit"; blockId?: string; staffId?: string; date?: string; startTime?: string }>({ open: false, mode: "add" });
  const [editModalError, setEditModalError] = useState<string | null>(null);
  const [bulkSaveError, setBulkSaveError] = useState<{ phase: string; details: string; partial: { created: number; updated: number; deleted: number } } | null>(null);
  /** 체크리스트 conflict 확인 (reset_checklist 플래그 동의 유도) */
  const [clResetPrompt, setClResetPrompt] = useState<{ payload: ScheduleEditPayload; blockId: string; message: string } | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{ open: boolean; type: "delete" | "revert" | "reject" | "cancel" | "confirm"; blockId?: string }>({ open: false, type: "delete" });
  const [filters, setFilters] = useState<FilterState>({ staffIds: [], roles: [], statuses: [], positions: [], shifts: [] });
  const [legendOpen, setLegendOpen] = useState(false);

  // ─── Bulk mode ─────────────────────────────────────
  const [bulkMode, setBulkMode] = useState(false);
  const { showSuccess } = useResultModal();
  const bulkCreateMutation = useBulkCreateSchedules();
  const bulkUpdateMutation = useBulkUpdateSchedules();
  const bulkDeleteMutation = useBulkDeleteSchedules();
  const bulkSaving = bulkCreateMutation.isPending || bulkUpdateMutation.isPending || bulkDeleteMutation.isPending;

  async function handleBulkSave(payload: SavePayload) {
    let created = 0;
    let updated = 0;
    let deleted = 0;
    let phase = "creates";
    try {
      // 1. Creates — per-entry status (user picks in Apply/Review modal).
      //    Non-GM+ requests for "confirmed" will be downgraded server-side per Decision #10.
      if (payload.creates.length > 0) {
        const creates = payload.creates.map((e) => ({
          user_id: e.userId,
          store_id: e.storeId,
          work_role_id: e.workRoleId,
          work_date: e.workDate,
          start_time: e.startTime,
          end_time: e.endTime,
          break_start_time: e.breakStartTime,
          break_end_time: e.breakEndTime,
          status: e.status,
        }));
        await bulkCreateMutation.mutateAsync({ entries: creates, skip_on_conflict: true });
        created = payload.creates.length;
      }
      // 2. Updates — also forwards status if the modification carries one.
      phase = "updates";
      if (payload.updates.length > 0) {
        const updates = payload.updates.map((u) => ({
          id: u.id,
          work_role_id: u.data.workRoleId,
          start_time: u.data.startTime,
          end_time: u.data.endTime,
          break_start_time: u.data.breakStartTime,
          break_end_time: u.data.breakEndTime,
          reset_checklist: u.data.resetChecklist,
          status: u.data.status,
        }));
        await bulkUpdateMutation.mutateAsync({ updates });
        updated = payload.updates.length;
      }
      // 3. Deletes
      phase = "deletes";
      if (payload.deletes.length > 0) {
        await bulkDeleteMutation.mutateAsync({ ids: payload.deletes });
        deleted = payload.deletes.length;
      }
      showSuccess(`Saved: ${created} created, ${updated} updated, ${deleted} deleted`);
      setBulkMode(false);
    } catch (err) {
      // 부분 실패 가능 — 어디서 멈췄는지 + 에러 메시지를 모달로 명확히 표시
      setBulkSaveError({
        phase,
        details: parseApiError(err, "Unknown error"),
        partial: { created, updated, deleted },
      });
    }
  }

  // ─── Data fetching ────────────────────────────────────
  const monthDateFrom = useMemo(() => fmtLocalDate(new Date(monthYear.year, monthYear.month, 1)), [monthYear]);
  const monthDateTo = useMemo(() => fmtLocalDate(new Date(monthYear.year, monthYear.month + 1, 0)), [monthYear]);
  const dateFrom = view === "monthly" ? monthDateFrom : weekDates[0]?.date;
  const dateTo = view === "monthly" ? monthDateTo : weekDates[6]?.date;
  // 스토어 선택 시 해당 스토어에 배정된(user_stores) 직원만 서버에서 필터링
  const userFilters = useMemo(
    () => (!isAllStores && selectedStores.length > 0 ? { store_ids: selectedStores } : undefined),
    [isAllStores, selectedStores],
  );
  const usersQ = useUsers(userFilters);
  const storesQ = useStores();
  const orgQ = useOrganization();
  const orgDefaultRate = orgQ.data?.default_hourly_rate ?? null;
  // 다른 매장 스케줄도 보이기 위해 store_id 필터 대신 user_ids로 fetch.
  // 현재 보이는 user들의 모든 매장 스케줄을 가져온 뒤, ScheduleBlock의 isOtherStore 분기로 dimmed 표시.
  const allUserIds = useMemo(() => (usersQ.data ?? []).map((u) => u.id), [usersQ.data]);
  const schedulesQ = useSchedules({
    user_ids: allUserIds,
    date_from: dateFrom,
    date_to: dateTo,
    per_page: view === "monthly" ? 2000 : 500,
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

  // Monthly용 shifts + workRoles (단일 store 선택 시)
  const isSingleStore = selectedStores.length === 1;
  const shiftsQ = useShifts(isSingleStore ? selectedStores[0] : undefined);
  const monthlyWorkRolesQ = useWorkRoles(isSingleStore ? selectedStores[0] : undefined);

  // URL store 파라미터 ↔ selectedStores 동기화.
  // stores 로드 후 + searchParams 변경 시에도 재반영. "all"이면 빈 배열 유지.
  const urlStoreKey = searchParams.get("store") ?? "";
  useEffect(() => {
    if (stores.length === 0) return;
    if (urlStoreKey === "all" || urlStoreKey === "") {
      if (selectedStores.length > 0) setSelectedStores([]);
      return;
    }
    const ids = urlStoreKey.split(",").filter((id) => stores.some((s) => s.id === id));
    if (ids.length === 0) return;
    // 이미 같으면 no-op (무한 재동기화 방지)
    const same = ids.length === selectedStores.length && ids.every((id) => selectedStores.includes(id));
    if (!same) setSelectedStores(ids);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stores, urlStoreKey]);

  // view / weekStart / selectedDay / selectedStore 변경 시 URL sync.
  // window.history.replaceState 직접 사용 — router.replace는 Next.js navigation을
  // 트리거하면서 페이지 state를 흔들 수 있음 (특히 우리 effect가 URL을 다시 읽지 않더라도
  // searchParams의 새 reference로 다른 effect들이 재실행되면서 race가 생길 수 있음).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    params.set("view", view);
    if (view === "monthly") {
      params.set("month", `${monthYear.year}-${String(monthYear.month + 1).padStart(2, "0")}`);
      params.delete("week");
      params.delete("day");
    } else if (view === "weekly") {
      params.set("week", weekDates[0]?.date ?? "");
      params.delete("day");
      params.delete("month");
    } else {
      params.set("day", selectedDay);
      params.delete("week");
      params.delete("month");
    }
    params.set("store", isAllStores ? "all" : selectedStores.join(","));
    const next = `${window.location.pathname}?${params.toString()}`;
    if (next !== window.location.pathname + window.location.search) {
      window.history.replaceState(null, "", next);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, weekStart, selectedDay, selectedStores, isAllStores, monthYear]);

  // selectedDay가 현재 weekDates 밖으로 나가면 weekStart 자동 동기화
  useEffect(() => {
    if (!selectedDay) return;
    const inWeek = weekDates.some((d) => d.date === selectedDay);
    if (!inWeek) {
      const d = new Date(selectedDay + "T00:00:00");
      setWeekStart(getWeekStart(d));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDay]);

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
  const switchMutation = useSwitchSchedule();

  // ─── Derived helpers ──────────────────────────────────

  const currentStore = stores.find((s) => s.id === primaryStoreId) ?? stores[0];

  // 스케줄 그리드가 나타내는 "벽시계 시간"의 기준 타임존.
  // 표시 전용 — schedule.start_time 은 이미 store-local wall-clock string.
  // All / multi-select 모드면 뷰에 포함된 store 들의 tz 집합을 구해 동일하면 그 값,
  // 섞였으면 "Multiple" 로 표시.
  const browserTimezone = typeof Intl !== "undefined"
    ? Intl.DateTimeFormat().resolvedOptions().timeZone
    : undefined;
  const tzAbbrev = (tz: string | undefined | null): string => {
    if (!tz) return "";
    try {
      const dtf = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "short" });
      const part = dtf.formatToParts(new Date()).find((p) => p.type === "timeZoneName");
      return part?.value ?? "";
    } catch { return ""; }
  };
  // 현재 뷰에 포함된 store 들의 고유 tz 집합 (All Stores = 전체, 아니면 선택된 것).
  const viewStoresForTz = isAllStores ? stores : stores.filter((s) => selectedStoreSet.has(s.id));
  const tzSet = new Set(
    viewStoresForTz
      .map((s) => s.timezone ?? currentUser?.organization_timezone ?? "")
      .filter(Boolean),
  );
  const isMultipleTz = tzSet.size > 1;
  const singleViewTz: string | undefined = tzSet.size === 1 ? [...tzSet][0] : undefined;
  const storeTimezone = singleViewTz ?? currentUser?.organization_timezone ?? undefined;
  const tzMismatch = !isMultipleTz && !!storeTimezone && !!browserTimezone && storeTimezone !== browserTimezone;
  const storeTzAbbrev = tzAbbrev(storeTimezone);
  const browserTzAbbrev = tzAbbrev(browserTimezone);
  // tooltip 용 — multi tz 상황에서 어떤 store 가 어떤 tz 인지 보여줌
  const multiTzTooltip = isMultipleTz
    ? viewStoresForTz
        .map((s) => `${s.name}: ${tzAbbrev(s.timezone) || s.timezone || "—"}`)
        .join(" · ")
    : "";

  // 매장 timezone 기준 "지금 시각" — 1분마다 갱신.
  // Daily view 의 현재 시간 indicator, "오늘" 판정, ContextMenu 의 isPast 판정에 사용.
  const computeNowMin = useCallback((): number => {
    const now = new Date();
    if (!storeTimezone) return now.getHours() * 60 + now.getMinutes();
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: storeTimezone, hour: "2-digit", minute: "2-digit", hour12: false,
    }).format(now);
    const [hh, mm] = parts.split(":").map(Number);
    return (hh ?? 0) * 60 + (mm ?? 0);
  }, [storeTimezone]);
  const [nowMin, setNowMin] = useState<number>(() => computeNowMin());
  useEffect(() => {
    setNowMin(computeNowMin());
    const id = setInterval(() => setNowMin(computeNowMin()), 30 * 1000);
    return () => clearInterval(id);
  }, [computeNowMin]);
  // 매장 timezone 기준 오늘 (YYYY-MM-DD). nowMin 갱신 시 자정 경계도 자동 반영.
  const todayStr = useMemo(
    () => todayInTimezone(storeTimezone),
    // nowMin 을 deps 에 포함시켜 자정 경계에서 자동 재계산되도록.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [storeTimezone, nowMin],
  );
  const nowLabel = useMemo(() => {
    const h = Math.floor(nowMin / 60) % 24;
    const m = nowMin % 60;
    const h12 = ((h + 11) % 12) + 1;
    return `${h12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
  }, [nowMin]);

  // schedule.range → 선택된 모든 store의 설정을 resolve해서 min start / max end
  const resolveStoreIds = useMemo(
    () => isAllStores ? stores.map((s) => s.id) : selectedStores,
    [isAllStores, stores, selectedStores],
  );
  // 각 store별 schedule.range를 병렬 resolve
  const rangeQueries = useQueries({
    queries: resolveStoreIds.map((storeId) => ({
      queryKey: ["settings", "resolve", "schedule.range", { store_id: storeId }],
      queryFn: async () => {
        const res = await api.get("/console/settings/resolve", { params: { key: "schedule.range", store_id: storeId } });
        return res.data as { key: string; value: unknown; source: string };
      },
      staleTime: 5 * 60 * 1000,
    })),
  });
  // org 기본값 (store 없거나 아직 로딩 중일 때 fallback)
  const orgRangeQ = useResolveSetting("schedule.range");

  /** raw schedule.range 값에서 특정 요일(또는 전체)의 start/end 추출 */
  const extractRange = useCallback((raw: unknown, dayKey?: string): { start: number; end: number } | null => {
    if (!raw || typeof raw !== "object") return null;
    const d = raw as Record<string, unknown>;
    const mode = d.mode as string | undefined;
    const allEntry = d.all as { start: string; end: string } | undefined;
    const perDay = d.per_day as Record<string, { start: string; end: string }> | undefined;

    if (mode === "per_day" && perDay) {
      if (dayKey && perDay[dayKey]) {
        return { start: parseTimeToHours(perDay[dayKey].start), end: parseTimeToHours(perDay[dayKey].end) };
      }
      const entries = Object.values(perDay).filter((v): v is { start: string; end: string } => typeof v === "object" && "start" in v);
      if (entries.length > 0) {
        return { start: Math.min(...entries.map((e) => parseTimeToHours(e.start))), end: Math.max(...entries.map((e) => parseTimeToHours(e.end))) };
      }
    }
    if (allEntry && typeof allEntry === "object" && "start" in allEntry) {
      return { start: parseTimeToHours(allEntry.start), end: parseTimeToHours(allEntry.end) };
    }
    // 레거시 포맷
    if (dayKey && dayKey in d) {
      const entry = d[dayKey] as { start: string; end: string };
      if (entry && "start" in entry) return { start: parseTimeToHours(entry.start), end: parseTimeToHours(entry.end) };
    }
    if ("all" in d && d.all && typeof d.all === "object" && "start" in (d.all as Record<string, unknown>)) {
      const a = d.all as { start: string; end: string };
      return { start: parseTimeToHours(a.start), end: parseTimeToHours(a.end) };
    }
    return null;
  }, []);

  const { openHour, closeHour, configuredOpenHour, configuredCloseHour } = useMemo(() => {
    const DEFAULT_OH = 6;
    const DEFAULT_CH = 23;
    const DAY_KEYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
    const dayKey = view === "daily" ? DAY_KEYS[new Date(selectedDay + "T00:00:00").getDay()] : undefined;

    let globalOh = Infinity;
    let globalCh = -Infinity;
    let found = false;

    for (const q of rangeQueries) {
      const r = extractRange(q.data?.value, dayKey);
      if (r) { globalOh = Math.min(globalOh, r.start); globalCh = Math.max(globalCh, r.end); found = true; }
    }

    // store별 결과 없으면 org 기본값 fallback
    if (!found) {
      const orgR = extractRange(orgRangeQ.data?.value, dayKey);
      if (orgR) { globalOh = orgR.start; globalCh = orgR.end; found = true; }
    }

    const configuredOh = found ? Math.floor(globalOh) : DEFAULT_OH;
    const configuredCh = found ? Math.ceil(globalCh) : DEFAULT_CH;

    // A-7: Daily view는 실제 스케줄 범위로 동적 확장 (클리핑 방지)
    let effectiveOh = configuredOh;
    let effectiveCh = configuredCh;
    if (view === "daily" && selectedDay) {
      const dayScheds = schedules.filter((s) => s.work_date === selectedDay && matchesStoreFilter(s.store_id));
      for (const s of dayScheds) {
        const sH = Math.floor(parseTimeToHours(s.start_time));
        const eH = Math.ceil(parseTimeToHours(s.end_time));
        // overnight: end <= start → effective end = end + 24
        const eff = eH <= sH ? eH + 24 : eH;
        effectiveOh = Math.min(effectiveOh, sH);
        effectiveCh = Math.max(effectiveCh, eff);
      }
    }

    return {
      openHour: effectiveOh,
      closeHour: effectiveCh,
      configuredOpenHour: configuredOh,
      configuredCloseHour: configuredCh,
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeQueries, orgRangeQ.data, view, selectedDay, extractRange, schedules, selectedStores, isAllStores]);

  // axis가 configured range 밖으로 확장됐는지 여부 (Daily view에서 경고 표시용)
  const axisExpandedOutsideRange = view === "daily" && (openHour < configuredOpenHour || closeHour > configuredCloseHour);

  // Daily view 현재 시간 indicator 위치 (% in 0..100). selectedDay가 오늘이 아니면 null.
  // openHour..closeHour 범위 밖이면 null (영업시간 밖이라 표시 안 함).
  const nowPct: number | null = useMemo(() => {
    if (view !== "daily" || selectedDay !== todayStr) return null;
    const openMin = openHour * 60;
    const closeMin = closeHour * 60;
    if (closeMin <= openMin) return null;
    // overnight (closeHour > 24): nowMin이 openMin보다 작은데 closeHour가 24를 넘으면
    // 다음날 새벽으로 간주해 +24h 보정. 그래도 자정 넘으면 todayStr이 다음날로 바뀌어
    // selectedDay !== todayStr 이 되므로 indicator 자동 제거됨.
    let n = nowMin;
    if (n < openMin && closeMin > 24 * 60) n += 24 * 60;
    if (n < openMin || n >= closeMin) return null;
    return ((n - openMin) / (closeMin - openMin)) * 100;
  }, [view, selectedDay, todayStr, openHour, closeHour, nowMin]);

  function getSchedulesForCell(userId: string, date: string): Schedule[] {
    // 선택 외 store도 같은 셀에 표시 — ScheduleBlock의 isOtherStore dim으로 구분.
    // All Stores는 전부 "선택됨"으로 취급 (dim 없음).
    return schedules.filter((s) => s.user_id === userId && s.work_date === date);
  }

  function getAttendanceFor(scheduleId: string) {
    return attendances.find((a) => a.schedule_id === scheduleId);
  }

  // ─── Filter + sort ────────────────────────────────────

  const filteredUsers = useMemo(() => {
    let result = users;
    // 스토어 필터링은 useUsers(store_id)에서 서버사이드로 처리됨
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
          const aBlocks = schedules.filter((s) => s.user_id === a.id && s.work_date === date && matchesStoreFilter(s.store_id));
          const bBlocks = schedules.filter((s) => s.user_id === b.id && s.work_date === date && matchesStoreFilter(s.store_id));
          aStatus = aBlocks.find((s) => s.status === "confirmed") ? "confirmed" : aBlocks.find((s) => s.status === "requested") ? "requested" : aBlocks.length > 0 ? "draft" : "none";
          bStatus = bBlocks.find((s) => s.status === "confirmed") ? "confirmed" : bBlocks.find((s) => s.status === "requested") ? "requested" : bBlocks.length > 0 ? "draft" : "none";
        }
      } else {
        const hour = openHour + sortCol;
        const matchHour = (s: Schedule) => {
          const sH = Math.floor(parseTimeToHours(s.start_time));
          const eH = Math.ceil(parseTimeToHours(s.end_time));
          const effectiveEnd = eH <= sH ? eH + 24 : eH;
          return sH <= hour && effectiveEnd > hour;
        };
        const aBlocks = schedules.filter((s) => s.user_id === a.id && s.work_date === selectedDay && matchesStoreFilter(s.store_id) && matchHour(s));
        const bBlocks = schedules.filter((s) => s.user_id === b.id && s.work_date === selectedDay && matchesStoreFilter(s.store_id) && matchHour(s));
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortCol, sortState, view, selectedStores, isAllStores, selectedDay, filteredUsers, schedules, weekDates, openHour]);

  const userHasScheduleInView = useMemo(() => {
    let from: string;
    let to: string;
    if (view === "monthly") { from = monthDateFrom; to = monthDateTo; }
    else if (view === "daily") { from = selectedDay; to = selectedDay; }
    else { from = weekDates[0]?.date ?? ""; to = weekDates[6]?.date ?? ""; }
    const set = new Set<string>();
    if (!from || !to) return set;
    for (const s of schedules) {
      if (!matchesStoreFilter(s.store_id)) continue;
      if (s.work_date >= from && s.work_date <= to) set.add(s.user_id);
    }
    return set;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedules, view, monthDateFrom, monthDateTo, selectedDay, weekDates, selectedStores, isAllStores]);

  const displayUsers = useMemo(() => {
    if (emptyStaffHide) {
      return sortedUsers.filter((u) => userHasScheduleInView.has(u.id));
    }
    if (emptyStaffSort === "in-order") return sortedUsers;
    const withSched: User[] = [];
    const without: User[] = [];
    for (const u of sortedUsers) {
      if (userHasScheduleInView.has(u.id)) withSched.push(u);
      else without.push(u);
    }
    return emptyStaffSort === "top" ? [...without, ...withSched] : [...withSched, ...without];
  }, [sortedUsers, emptyStaffSort, emptyStaffHide, userHasScheduleInView]);

  // ─── Columns + totals ─────────────────────────────────

  const weeklyColumns = useMemo(() => weekDates.map((day) => {
    const daySchedules = schedules.filter((s) => s.work_date === day.date && matchesStoreFilter(s.store_id));
    const confirmed = daySchedules.filter((s) => s.status === "confirmed");
    const pending = daySchedules.filter((s) => s.status === "requested");
    const sumHours = (arr: Schedule[]) => arr.reduce((sum, s) => sum + getNetWorkHours(s), 0);
    // stored rate만 합산. NULL은 0으로 (No cost로 표시되는 schedule들은 합계에서 빠짐).
    const sumCost = (arr: Schedule[]) => arr.reduce((sum, s) => sum + getNetWorkHours(s) * (s.hourly_rate ?? 0), 0);
    return {
      key: day.date,
      label: day.dayName,
      sublabel: day.dayNum,
      isSunday: day.isSunday,
      isSaturday: day.isWeekend && !day.isSunday,
      isNow: day.date === todayStr,
      teamConfirmed: new Set(confirmed.map((s) => s.user_id)).size,
      teamPending: new Set(pending.map((s) => s.user_id)).size,
      hoursConfirmed: sumHours(confirmed),
      hoursPending: sumHours(pending),
      costConfirmed: sumCost(confirmed),
      costPending: sumCost(pending),
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [weekDates, schedules, selectedStores, isAllStores, users, todayStr]);

  const dailyHourRange = useMemo(() => {
    const out: number[] = [];
    // overnight: closeHour <= openHour → closeHour + 24 (e.g., 6AM–2AM = 6..26)
    const effectiveClose = closeHour <= openHour ? closeHour + 24 : closeHour;
    for (let h = openHour; h < effectiveClose; h++) out.push(h);
    return out;
  }, [openHour, closeHour]);

  const dailyColumns = useMemo(() => dailyHourRange.map((h) => {
    const daySchedules = schedules.filter((s) => {
      if (s.work_date !== selectedDay || !matchesStoreFilter(s.store_id)) return false;
      const sH = Math.floor(parseTimeToHours(s.start_time));
      const eH = Math.ceil(parseTimeToHours(s.end_time));
      // overnight: end <= start → treat end as end + 24
      const effectiveEnd = eH <= sH ? eH + 24 : eH;
      return sH <= h && effectiveEnd > h;
    });
    const confirmed = daySchedules.filter((s) => s.status === "confirmed");
    const pending = daySchedules.filter((s) => s.status === "requested");
    // 시간당 1시간 컬럼 — stored only
    const sumCost = (arr: Schedule[]) => arr.reduce((sum, s) => sum + (s.hourly_rate ?? 0), 0);
    return {
      key: `h${h}`,
      hour: h,
      label: formatHourLabel(h),
      teamConfirmed: confirmed.length,
      teamPending: pending.length,
      hoursConfirmed: confirmed.length,
      hoursPending: pending.length,
      costConfirmed: sumCost(confirmed),
      costPending: sumCost(pending),
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [dailyHourRange, schedules, selectedStores, isAllStores, selectedDay, users]);

  const weeklyTotals = useMemo(() => {
    const conf = schedules.filter((s) => weekDates.some((d) => d.date === s.work_date) && matchesStoreFilter(s.store_id) && s.status === "confirmed");
    const pend = schedules.filter((s) => weekDates.some((d) => d.date === s.work_date) && matchesStoreFilter(s.store_id) && s.status === "requested");
    return {
      hc: weeklyColumns.reduce((a, c) => a + c.hoursConfirmed, 0),
      hp: weeklyColumns.reduce((a, c) => a + c.hoursPending, 0),
      lc: weeklyColumns.reduce((a, c) => a + c.costConfirmed, 0),
      lp: weeklyColumns.reduce((a, c) => a + c.costPending, 0),
      tc: new Set(conf.map((s) => s.user_id)).size,
      tp: new Set(pend.map((s) => s.user_id)).size,
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weeklyColumns, schedules, weekDates, selectedStores, isAllStores]);

  const dailyTotals = useMemo(() => {
    const dayBlocks = schedules.filter((s) => s.work_date === selectedDay && matchesStoreFilter(s.store_id));
    const conf = dayBlocks.filter((s) => s.status === "confirmed");
    const pend = dayBlocks.filter((s) => s.status === "requested");
    const sumHours = (arr: Schedule[]) => arr.reduce((s, b) => s + getNetWorkHours(b), 0);
    const sumCost = (arr: Schedule[]) => arr.reduce((s, b) => s + getNetWorkHours(b) * (b.hourly_rate ?? 0), 0);
    return {
      hc: sumHours(conf),
      hp: sumHours(pend),
      lc: sumCost(conf),
      lp: sumCost(pend),
      tc: new Set(conf.map((s) => s.user_id)).size,
      tp: new Set(pend.map((s) => s.user_id)).size,
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [schedules, selectedDay, selectedStores, isAllStores, users]);

  const monthlyTotals = useMemo(() => {
    const filtered = schedules.filter((s) => s.work_date >= monthDateFrom && s.work_date <= monthDateTo && matchesStoreFilter(s.store_id));
    const conf = filtered.filter((s) => s.status === "confirmed");
    const pend = filtered.filter((s) => s.status === "requested");
    const sumHours = (arr: Schedule[]) => arr.reduce((sum, s) => sum + getNetWorkHours(s), 0);
    const sumCost = (arr: Schedule[]) => arr.reduce((sum, s) => sum + getNetWorkHours(s) * (s.hourly_rate ?? 0), 0);
    return {
      hc: sumHours(conf), hp: sumHours(pend),
      lc: sumCost(conf), lp: sumCost(pend),
      tc: new Set(conf.map((s) => s.user_id)).size,
      tp: new Set(pend.map((s) => s.user_id)).size,
    };
  }, [schedules, monthDateFrom, monthDateTo, selectedStores, isAllStores]);

  const totals = view === "monthly" ? monthlyTotals : view === "weekly" ? weeklyTotals : dailyTotals;

  // 활성 필터 합계: FilterBar로 좁혀진 staff/status/position/shift만 합산.
  const totalActiveFilters = filters.staffIds.length + filters.roles.length + filters.statuses.length + filters.positions.length + filters.shifts.length;
  const filteredTotals = useMemo(() => {
    if (totalActiveFilters === 0) return null;
    const userIdSet = new Set(filteredUsers.map((u) => u.id));
    let from: string;
    let to: string;
    if (view === "monthly") { from = monthDateFrom; to = monthDateTo; }
    else if (view === "daily") { from = selectedDay; to = selectedDay; }
    else { from = weekDates[0]?.date ?? ""; to = weekDates[6]?.date ?? ""; }
    const filtered = schedules.filter((s) => {
      if (!matchesStoreFilter(s.store_id)) return false;
      if (s.work_date < from || s.work_date > to) return false;
      if (!userIdSet.has(s.user_id)) return false;
      if (filters.statuses.length > 0 && !filters.statuses.includes(s.status)) return false;
      if (filters.positions.length > 0 && !(s.position_snapshot && filters.positions.includes(s.position_snapshot))) return false;
      if (filters.shifts.length > 0) {
        const name = s.work_role_name_snapshot || s.work_role_name;
        if (!name || !filters.shifts.includes(name)) return false;
      }
      return true;
    });
    const conf = filtered.filter((s) => s.status === "confirmed");
    const pend = filtered.filter((s) => s.status === "requested");
    const sumHours = (arr: Schedule[]) => arr.reduce((sum, s) => sum + getNetWorkHours(s), 0);
    const sumCost = (arr: Schedule[]) => arr.reduce((sum, s) => sum + getNetWorkHours(s) * (s.hourly_rate ?? 0), 0);
    return {
      staff: filteredUsers.length,
      hc: sumHours(conf), hp: sumHours(pend),
      lc: sumCost(conf), lp: sumCost(pend),
      tc: new Set(conf.map((s) => s.user_id)).size,
      tp: new Set(pend.map((s) => s.user_id)).size,
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalActiveFilters, filteredUsers, filters, schedules, view, monthDateFrom, monthDateTo, selectedDay, weekDates, selectedStores, isAllStores]);

  const columns = view === "weekly" ? weeklyColumns : dailyColumns;
  // selectedDay 직접 파싱 — weekDates lookup은 selectedDay가 weekDates 밖이면 undefined가 됨
  const selectedDayLabel = (() => {
    if (!selectedDay) return "";
    const d = new Date(selectedDay + "T00:00:00");
    return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  })();

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
    // 같은 카드를 다시 클릭하면 메뉴 닫기 (토글)
    if (contextMenu && contextMenu.blockId === sched.id) {
      setContextMenu(null);
      return;
    }
    setContextMenu({ anchorEl: e.currentTarget as HTMLElement, blockId: sched.id, status: sched.status });
  }

  function handleContextAction(action: string) {
    if (!contextMenu) return;
    const blockId = contextMenu.blockId;
    if (action === "history") {
      setHistoryScheduleId(blockId);
      setHistoryOpen(true);
    }
    if (action === "switch") {
      setSwitchSourceId(blockId);
      setSwitchOpen(true);
    }
    if (action === "change-staff") {
      setChangeStaffSourceId(blockId);
      setChangeStaffOpen(true);
    }
    if (action === "details") router.push(`/schedules/${blockId}`);
    if (action === "edit") setEditModal({ open: true, mode: "edit", blockId });
    if (action === "add") {
      // 해당 스케줄의 직원과 날짜로 새 스케줄 추가 모달 열기
      const block = schedules.find((s) => s.id === blockId);
      if (block) setEditModal({ open: true, mode: "add", staffId: block.user_id, date: block.work_date });
    }
    if (action === "revert") setConfirmDialog({ open: true, type: "revert", blockId });
    if (action === "delete") setConfirmDialog({ open: true, type: "delete", blockId });
    if (action === "reject") setConfirmDialog({ open: true, type: "reject", blockId });
    if (action === "cancel") setConfirmDialog({ open: true, type: "cancel", blockId });
    if (action === "confirm") setConfirmDialog({ open: true, type: "confirm", blockId });
    if (action === "sync-rate") {
      const block = schedules.find((s) => s.id === blockId);
      if (!block) return;
      const blockUser = users.find((u) => u.id === block.user_id);
      const target = effectiveRate(blockUser, currentStore, orgDefaultRate);
      if (target == null) return;
      updateMutation.mutate({ id: blockId, data: { hourly_rate: target } });
    }
  }

  function openAddModal(staffId?: string, date?: string, startTime?: string) {
    setEditModal({ open: true, mode: "add", staffId, date, startTime });
  }

  function closeEditModal() {
    setEditModal({ open: false, mode: "add" });
    setEditModalError(null);
    // 쿼리 정리
    if (searchParams.get("edit")) {
      router.replace("/schedules", { scroll: false });
    }
  }

  function handleScheduleEditSave(payload: ScheduleEditPayload) {
    setEditModalError(null);
    if (editModal.mode === "add") {
      createMutation.mutate({
        user_id: payload.userId,
        store_id: payload.storeId,
        work_role_id: payload.workRoleId,
        work_date: payload.date,
        start_time: payload.startTime,
        end_time: payload.endTime,
        break_start_time: payload.breakStartTime,
        break_end_time: payload.breakEndTime,
        // GM+: 바로 confirmed, SV: requested
        status: isGMView ? "confirmed" : "requested",
        note: payload.notes || null,
        hourly_rate: payload.hourlyRate,
        force: payload.force,
      }, {
        onSuccess: closeEditModal,
        onError: (err) => setEditModalError(parseApiError(err, "Failed to create schedule")),
      });
    } else if (editModal.mode === "edit" && editModal.blockId) {
      submitEditMutation(editModal.blockId, payload, undefined);
    }
  }

  function submitEditMutation(blockId: string, payload: ScheduleEditPayload, resetChecklist: boolean | undefined) {
    const orig = schedules.find((s) => s.id === blockId);
    const userChanged = orig && payload.userId !== orig.user_id;
    const rateUntouched = orig && payload.hourlyRate === orig.hourly_rate;
    updateMutation.mutate({
      id: blockId,
      data: {
        user_id: payload.userId,
        work_role_id: payload.workRoleId,
        work_date: payload.date,
        start_time: payload.startTime,
        end_time: payload.endTime,
        break_start_time: payload.breakStartTime,
        break_end_time: payload.breakEndTime,
        note: payload.notes || null,
        hourly_rate: (userChanged && rateUntouched) ? null : payload.hourlyRate,
        force: payload.force,
        ...(resetChecklist !== undefined ? { reset_checklist: resetChecklist } : {}),
      },
    }, {
      onSuccess: closeEditModal,
      onError: (err) => {
        const msg = parseApiError(err, "Failed to update schedule");
        // 서버가 "Checklist is in_progress/completed..." 400으로 거절 → 확인 후 재전송
        if (/reset_checklist=true/.test(msg)) {
          setClResetPrompt({ payload, blockId, message: msg });
          return;
        }
        setEditModalError(msg);
      },
    });
  }

  // ─── Daily view helper ────────────────────────────────

  function getDailyScheduleAtHour(userId: string, hour: number): Schedule | undefined {
    // 같은 시간대 겹치면 현재 매장 우선, 그 다음 다른 매장 (dimmed로 표시).
    // floor(start) <= hour: 12:30 시작도 12시 칸에서 매칭
    // Overnight(end<=start): work_date 기준 시작일 셀만 표시 → [floor(start), 24) 범위
    const matches = schedules.filter((s) => {
      if (s.user_id !== userId || s.work_date !== selectedDay) return false;
      const startH = parseTimeToHours(s.start_time);
      const endH = parseTimeToHours(s.end_time);
      const floorStart = Math.floor(startH);
      if (endH > startH) {
        return floorStart <= hour && Math.ceil(endH) > hour;
      }
      // overnight: 시작 시간 이후 ~ 자정 전까지만 현재 날짜 타임라인에 표시
      return floorStart <= hour;
    });
    return matches.find((s) => matchesStoreFilter(s.store_id)) ?? matches[0];
  }

  // ─── Stats helpers per user ───────────────────────────

  function getUserConfirmedHours(userId: string, date: string): number {
    return schedules
      .filter((s) => s.user_id === userId && s.work_date === date && matchesStoreFilter(s.store_id) && s.status === "confirmed")
      .reduce((sum, s) => sum + getNetWorkHours(s), 0);
  }

  function getUserPendingHours(userId: string, date: string): number {
    return schedules
      .filter((s) => s.user_id === userId && s.work_date === date && matchesStoreFilter(s.store_id) && s.status === "requested")
      .reduce((sum, s) => sum + getNetWorkHours(s), 0);
  }

  // stored rate만 사용 — NULL은 No cost로 계산에서 빠짐
  function getUserConfirmedCost(userId: string, date: string): number {
    return schedules
      .filter((s) => s.user_id === userId && s.work_date === date && matchesStoreFilter(s.store_id) && s.status === "confirmed")
      .reduce((sum, s) => sum + getNetWorkHours(s) * (s.hourly_rate ?? 0), 0);
  }
  function getUserPendingCost(userId: string, date: string): number {
    return schedules
      .filter((s) => s.user_id === userId && s.work_date === date && matchesStoreFilter(s.store_id) && s.status === "requested")
      .reduce((sum, s) => sum + getNetWorkHours(s) * (s.hourly_rate ?? 0), 0);
  }
  // user의 해당 주/일 스케줄 중 stored rate가 NULL인 게 있는지 — sync 필요 표시용
  function userHasNoCost(userId: string, dates: string[]): boolean {
    return schedules.some(
      (s) =>
        s.user_id === userId &&
        matchesStoreFilter(s.store_id) &&
        dates.includes(s.work_date) &&
        (s.status === "confirmed" || s.status === "requested") &&
        (s.hourly_rate == null || s.hourly_rate === 0),
    );
  }

  // ─── Render ───────────────────────────────────────────

  // Bulk mode → 전용 컴포넌트로 전체 교체
  if (bulkMode) {
    return (
      <BulkScheduleView
        initialStoreId={primaryStoreId || stores[0]?.id || ""}
        initialWeekStart={weekStart}
        isGMView={isGMView}
        isSaving={bulkSaving}
        onSave={handleBulkSave}
        onExit={() => setBulkMode(false)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg)] -m-4 md:-m-8">
      {/* Context Menu */}
      {contextMenu && (() => {
        const block = schedules.find((s) => s.id === contextMenu.blockId);
        const blockUser = block ? users.find((u) => u.id === block.user_id) : undefined;
        const blockEffective = effectiveRate(blockUser, currentStore, orgDefaultRate);
        const stored = block?.hourly_rate ?? 0;
        // Sync 메뉴 노출 조건: GM 권한 + cascade rate 존재 + stored와 다름
        const canSync = isGMView && blockEffective != null && stored !== blockEffective;
        const blockIsPast = !!block && block.work_date < todayStr;
        return (
          <ContextMenu
            anchorEl={contextMenu.anchorEl}
            status={contextMenu.status}
            userRole={isGMView ? "gm" : "sv"}
            isPast={blockIsPast}
            canSyncRate={canSync}
            syncRateLabel={canSync ? `$${blockEffective}/hr` : undefined}
            onClose={() => setContextMenu(null)}
            onAction={handleContextAction}
          />
        );
      })()}

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

      {/* Switch Schedule Modal */}
      {(() => {
        const fromSchedule = switchSourceId ? schedules.find((s) => s.id === switchSourceId) : null;
        const fromUser = fromSchedule ? users.find((u) => u.id === fromSchedule.user_id) : null;
        // 현재 선택된 매장들의 스케줄만 후보로 제공
        const storeFiltered = schedules.filter((s) => matchesStoreFilter(s.store_id));
        return (
          <SwapModal
            open={switchOpen}
            onClose={() => { setSwitchOpen(false); setSwitchSourceId(null); setSwitchError(null); }}
            fromSchedule={fromSchedule ?? null}
            fromUser={fromUser ?? null}
            candidateSchedules={storeFiltered}
            users={users}
            isSubmitting={switchMutation.isPending}
            errorMessage={switchError}
            onClearError={() => setSwitchError(null)}
            onSwap={(otherId, reason) => {
              if (!switchSourceId) return;
              setSwitchError(null);
              switchMutation.mutate({ id: switchSourceId, other_schedule_id: otherId, reason }, {
                onSuccess: () => { setSwitchOpen(false); setSwitchSourceId(null); setSwitchError(null); },
                onError: (err) => { setSwitchError(parseApiError(err, "Switch failed")); },
              });
            }}
          />
        );
      })()}

      {/* Switch Staff Modal */}
      {(() => {
        const srcSchedule = changeStaffSourceId ? schedules.find((s) => s.id === changeStaffSourceId) : null;
        const srcUser = srcSchedule ? users.find((u) => u.id === srcSchedule.user_id) ?? null : null;
        return (
          <ChangeStaffModal
            open={changeStaffOpen}
            onClose={() => { setChangeStaffOpen(false); setChangeStaffSourceId(null); }}
            schedule={srcSchedule ?? null}
            currentUser={srcUser}
            users={users}
            isSubmitting={updateMutation.isPending}
            onChange={(newUserId) => {
              if (!changeStaffSourceId) return;
              updateMutation.mutate({ id: changeStaffSourceId, data: { user_id: newUserId } }, {
                onSuccess: () => { setChangeStaffOpen(false); setChangeStaffSourceId(null); },
              });
            }}
          />
        );
      })()}

      {/* Schedule Edit Modal */}
      {(() => {
        const editSchedule = editModal.blockId ? schedules.find((s) => s.id === editModal.blockId) : null;
        const targetUserId = editSchedule?.user_id ?? editModal.staffId;
        const targetUser = targetUserId ? users.find((u) => u.id === targetUserId) : undefined;
        const editInheritedRate = effectiveRate(targetUser, currentStore, orgDefaultRate);
        return (
          <ScheduleEditModal
            open={editModal.open}
            mode={editModal.mode}
            schedule={editSchedule}
            prefilledUserId={editModal.staffId}
            prefilledDate={editModal.date}
            prefilledStartTime={editModal.startTime}
            users={users}
            storeId={selectedStore}
            stores={stores}
            selectedStoreIds={selectedStores}
            inheritedRate={editInheritedRate}
            showCost={isGMView}
            errorMessage={editModalError}
            onDismissError={() => setEditModalError(null)}
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
        // revert 는 confirmed/cancelled 양쪽 모두에서 호출됨 → 현재 schedule status 로 문구 선택
        const targetBlock = confirmDialog.blockId
          ? schedules.find((s) => s.id === confirmDialog.blockId)
          : undefined;
        const revertingCancelled = t === "revert" && targetBlock?.status === "cancelled";
        const revertCfg = revertingCancelled
          ? { title: "Restore Schedule?", message: "This cancelled schedule will be restored to requested status and will need to be re-confirmed.", label: "Restore" }
          : { title: "Revert to Requested?", message: "This confirmed schedule will be reverted to requested status and will need to be re-confirmed.", label: "Revert" };
        const cfg: Record<typeof t, { title: string; message: string; label: string; variant: "danger" | "primary"; reason: boolean; reasonLabel?: string }> = {
          delete:  { title: "Delete Schedule?", message: "This schedule will be permanently deleted. This action cannot be undone.", label: "Delete", variant: "danger", reason: false },
          revert:  { ...revertCfg, variant: "primary", reason: false },
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

      {/* 체크리스트 진행 중 → reset 동의 확인 */}
      <ConfirmDialog
        open={clResetPrompt !== null}
        title="Checklist in progress"
        message={
          (clResetPrompt?.message ?? "") +
          "\n\nReset the checklist with the new setup? Existing progress will be lost."
        }
        confirmLabel="Reset & save"
        confirmVariant="danger"
        onConfirm={() => {
          if (clResetPrompt) submitEditMutation(clResetPrompt.blockId, clResetPrompt.payload, true);
          setClResetPrompt(null);
        }}
        onCancel={() => setClResetPrompt(null)}
      />

      {/* Bulk Save 부분 실패 모달 */}
      <ConfirmDialog
        open={bulkSaveError !== null}
        title="Bulk Save Partially Failed"
        message={
          bulkSaveError
            ? `Failed during "${bulkSaveError.phase}" phase. ` +
              `Completed so far — created: ${bulkSaveError.partial.created}, updated: ${bulkSaveError.partial.updated}, deleted: ${bulkSaveError.partial.deleted}. ` +
              `Error: ${bulkSaveError.details}`
            : ""
        }
        confirmLabel="Close"
        confirmVariant="danger"
        onConfirm={() => setBulkSaveError(null)}
        onCancel={() => setBulkSaveError(null)}
      />


      <div className="px-3 sm:px-4 lg:px-6 pb-4">
        {/* Row 1: Title + Stats */}
        <div className="flex items-center gap-3 md:gap-5 pt-4 pb-1 min-h-[40px]">
          <h1 className="text-[22px] font-semibold text-[var(--color-text)] shrink-0">Schedules</h1>
          {isMultipleTz ? (
            <span
              className="text-[11px] font-medium px-2 py-0.5 rounded-md shrink-0 bg-[var(--color-warning-muted)] text-[var(--color-warning)]"
              title={`Each card's time is shown in its own store timezone. ${multiTzTooltip}`}
            >
              Multiple timezones
            </span>
          ) : storeTimezone && (
            <span
              className={`text-[11px] font-medium px-2 py-0.5 rounded-md shrink-0 ${
                tzMismatch
                  ? "bg-[var(--color-warning-muted)] text-[var(--color-warning)]"
                  : "bg-[var(--color-surface-hover)] text-[var(--color-text-muted)]"
              }`}
              title={
                tzMismatch
                  ? `Schedule times shown in ${storeTimezone} (${storeTzAbbrev}). Your browser is in ${browserTimezone} (${browserTzAbbrev}).`
                  : `All times in ${storeTimezone}`
              }
            >
              {storeTzAbbrev || storeTimezone}
              {tzMismatch && browserTzAbbrev ? ` · viewing from ${browserTzAbbrev}` : ""}
            </span>
          )}
          {schedulesQ.isLoading && <span className="text-[11px] text-[var(--color-text-muted)]">Loading…</span>}
          <div className="hidden md:flex items-center gap-3 text-[13px] text-[var(--color-text-secondary)]">
            <span title="Total staff in selected store(s) — does not change with filters">Staff: <strong className="text-[14px] text-[var(--color-text)]">{users.length}</strong></span>
            <span className="w-px h-4 bg-[var(--color-border)]" />
            <span title="Confirmed / approved schedules">Scheduled: <strong className="text-[14px] text-[var(--color-text)]">{totals.tc}</strong></span>
            <span className="w-px h-4 bg-[var(--color-border)]" />
            <span title="Requested schedules awaiting approval">Pending: <strong className="text-[14px] text-[var(--color-warning)]">{totals.tp}</strong></span>
            {isGMView && <>
              <span className="w-px h-4 bg-[var(--color-border)]" />
              <span title="Confirmed cost (approved) + pending cost (awaiting approval)">Cost: <strong className="text-[14px] text-[var(--color-success)]">${totals.lc.toFixed(2)}</strong>{totals.lp > 0 && <strong className="text-[14px] text-[var(--color-warning)]" title="Additional pending cost if approved"> +${totals.lp.toFixed(2)}</strong>}</span>
              {totals.hc > 0 && (
                <span className="text-[var(--color-text-muted)]" title="Average hourly rate = total cost / total hours across all confirmed schedules">
                  (avg ${(totals.lc / totals.hc).toFixed(2)}/h)
                </span>
              )}
            </>}
          </div>
        </div>

        {/* Row 2: Store(left) | View+Nav+Buttons(right) */}
        <div className="flex items-center justify-between py-2 gap-2 flex-wrap min-h-[48px]">
          {/* Left: Store multi-select */}
          <div className="flex items-center gap-2 shrink-0">
            <StoreMultiSelect
              stores={stores}
              selectedStores={selectedStores}
              onChange={setSelectedStores}
            />
            {!isAllStores && selectedStores.length > 0 && (
              <span className="text-[12px] text-[var(--color-text-secondary)] hidden sm:inline truncate max-w-[300px]">
                {selectedStores.map((id) => stores.find((s) => s.id === id)?.name).filter(Boolean).join(", ")}
              </span>
            )}
          </div>
          {/* Right: View toggle + Nav + Buttons */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* View toggle */}
            <div className="flex bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-0.5 shrink-0">
              {(["monthly", "weekly", "daily"] as const).map((v) => (
                <button key={v} type="button" onClick={() => { setView(v); if (v === "daily") setSelectedDay(todayStr); }}
                  className={`px-2.5 sm:px-3.5 py-1.5 rounded-md text-[12px] sm:text-[13px] font-semibold transition-all ${view === v ? "bg-[var(--color-accent)] text-white" : "text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"}`}>
                  {v === "monthly" ? "Monthly" : v === "weekly" ? "Weekly" : "Daily"}
                </button>
              ))}
            </div>
            {/* Nav */}
            <div className="flex items-center gap-1 sm:gap-2 shrink-0">
              <button
                type="button"
                onClick={() => {
                  if (view === "monthly") {
                    setMonthYear((p) => {
                      const d = new Date(p.year, p.month - 1, 1);
                      return { year: d.getFullYear(), month: d.getMonth() };
                    });
                  } else if (view === "weekly") {
                    const next = new Date(weekStart); next.setDate(next.getDate() - 7); setWeekStart(next);
                  } else {
                    const d = new Date(selectedDay + "T00:00:00"); d.setDate(d.getDate() - 1);
                    setSelectedDay(fmtLocalDate(d));
                  }
                }}
                className="w-8 h-8 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] flex items-center justify-center text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]"
                aria-label="Previous period"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="9 11 5 7 9 3" /></svg>
              </button>
              <span className="text-[12px] sm:text-[13px] font-semibold text-[var(--color-text)] min-w-[100px] sm:min-w-[200px] text-center tabular-nums">
                {view === "monthly"
                  ? `${new Date(monthYear.year, monthYear.month).toLocaleDateString("en-US", { month: "long" }).toUpperCase()} ${monthYear.year}`
                  : view === "weekly"
                  ? (() => {
                      const d0 = weekDates[0]?.date ? new Date(weekDates[0].date + "T00:00:00") : null;
                      const d6 = weekDates[6]?.date ? new Date(weekDates[6].date + "T00:00:00") : null;
                      if (!d0 || !d6) return "";
                      const nextJan1 = new Date(d0.getFullYear() + 1, 0, 1);
                      const yr = (d0 <= nextJan1 && nextJan1 <= d6) ? d0.getFullYear() + 1 : d0.getFullYear();
                      const jan1 = new Date(yr, 0, 1);
                      const w1Sun = new Date(jan1); w1Sun.setDate(w1Sun.getDate() - w1Sun.getDay());
                      const wk = Math.round((d0.getTime() - w1Sun.getTime()) / (7 * 86400000)) + 1;
                      const m0 = d0.toLocaleDateString("en-US", { month: "short" }).toUpperCase();
                      const m6 = d6.toLocaleDateString("en-US", { month: "short" }).toUpperCase();
                      const crossYear = d0.getFullYear() !== d6.getFullYear();
                      return `[W${wk}${crossYear ? ` '${String(yr).slice(2)}` : ""}] ${m0} ${d0.getDate()} – ${m6} ${d6.getDate()}`;
                    })()
                  : selectedDayLabel}
              </span>
              <button
                type="button"
                onClick={() => {
                  if (view === "monthly") {
                    setMonthYear((p) => {
                      const d = new Date(p.year, p.month + 1, 1);
                      return { year: d.getFullYear(), month: d.getMonth() };
                    });
                  } else if (view === "weekly") {
                    const next = new Date(weekStart); next.setDate(next.getDate() + 7); setWeekStart(next);
                  } else {
                    const d = new Date(selectedDay + "T00:00:00"); d.setDate(d.getDate() + 1);
                    setSelectedDay(fmtLocalDate(d));
                  }
                }}
                className="w-8 h-8 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] flex items-center justify-center text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]"
                aria-label="Next period"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="5 3 9 7 5 11" /></svg>
              </button>
            </div>
            {/* Actions */}
            {!bulkMode && (
              <button type="button" onClick={() => openAddModal()} className="bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)] text-white px-3 sm:px-4 py-2 rounded-lg text-[12px] sm:text-[13px] font-semibold flex items-center gap-1.5 transition-colors shrink-0 whitespace-nowrap">
                <span className="hidden sm:inline">+</span> Add
                <span className="hidden md:inline"> Schedule</span>
              </button>
            )}
            {/* Bulk mode — available from any view, auto-switches to weekly */}
            <button
              type="button"
              onClick={() => { setView("weekly"); setBulkMode(true); }}
              className="px-3 sm:px-4 py-2 rounded-lg text-[12px] sm:text-[13px] font-semibold transition-colors shrink-0 whitespace-nowrap border bg-[var(--color-surface)] border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"
            >
              Bulk
            </button>
            <button
              type="button"
              onClick={() => setLegendOpen(true)}
              className="w-8 h-8 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] flex items-center justify-center text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] shrink-0"
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
          emptyStaffSort={emptyStaffSort}
          onEmptyStaffSortChange={setEmptyStaffSort}
          emptyStaffHide={emptyStaffHide}
          onEmptyStaffHideChange={setEmptyStaffHide}
        />

        {/* Filtered totals — 활성 필터 적용된 합계만 표시 */}
        {filteredTotals && (
          <div className="-mt-3 mb-4 px-4 py-2 bg-[var(--color-accent-muted)] border border-[var(--color-accent)]/30 rounded-xl flex items-center gap-3 text-[13px] text-[var(--color-text-secondary)] flex-wrap">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-accent)] shrink-0">Filtered</span>
            <span title="Staff matching active filters">Staff: <strong className="text-[14px] text-[var(--color-text)]">{filteredTotals.staff}</strong></span>
            <span className="w-px h-4 bg-[var(--color-border)]" />
            <span title="Confirmed schedules within filtered set">Scheduled: <strong className="text-[14px] text-[var(--color-text)]">{filteredTotals.tc}</strong></span>
            <span className="w-px h-4 bg-[var(--color-border)]" />
            <span title="Pending schedules within filtered set">Pending: <strong className="text-[14px] text-[var(--color-warning)]">{filteredTotals.tp}</strong></span>
            <span className="w-px h-4 bg-[var(--color-border)]" />
            <span title="Confirmed hours within filtered set">Hours: <strong className="text-[14px] text-[var(--color-success)]">{(Math.round(filteredTotals.hc * 100) / 100)} h</strong>{filteredTotals.hp > 0 && <strong className="text-[14px] text-[var(--color-warning)]" title="Additional pending hours if approved"> +{(Math.round(filteredTotals.hp * 100) / 100)} h</strong>}</span>
            {isGMView && (
              <>
                <span className="w-px h-4 bg-[var(--color-border)]" />
                <span title="Confirmed cost within filtered set">Cost: <strong className="text-[14px] text-[var(--color-success)]">${filteredTotals.lc.toFixed(2)}</strong>{filteredTotals.lp > 0 && <strong className="text-[14px] text-[var(--color-warning)]" title="Additional pending cost if approved"> +${filteredTotals.lp.toFixed(2)}</strong>}</span>
              </>
            )}
          </div>
        )}

        {/* Monthly Grid */}
        {view === "monthly" && (
          <MonthlyGrid
            year={monthYear.year}
            month={monthYear.month}
            schedules={schedules.filter((s) => matchesStoreFilter(s.store_id))}
            shifts={shiftsQ.data ?? []}
            workRoles={monthlyWorkRolesQ.data ?? []}
            isSingleStore={isSingleStore}
            showCost={isGMView}
            todayStr={todayStr}
            onDayClick={(date) => { setSelectedDay(date); setView("daily"); }}
            onWeekClick={(date) => { setWeekStart(getWeekStart(new Date(date + "T00:00:00"))); setView("weekly"); }}
          />
        )}

        {/* A-7: Daily axis expanded outside configured range — 경고 배너 */}
        {axisExpandedOutsideRange && (
          <div className="bg-[var(--color-warning-muted)] border border-[var(--color-warning)]/40 rounded-lg px-3 py-2 flex items-center gap-2 text-[12px] text-[var(--color-warning)]">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            <span>
              Some schedules fall outside configured store hours ({formatHourLabel(configuredOpenHour)}–{formatHourLabel(configuredCloseHour)}). Showing expanded {formatHourLabel(openHour)}–{formatHourLabel(closeHour)} to fit all shifts.
            </span>
          </div>
        )}

        {/* Table Grid (Weekly / Daily) */}
        {view !== "monthly" && <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl overflow-auto flex-1" style={{ maxHeight: "calc(100vh - 220px)" }}>
          <div style={{ minWidth: 220 + columns.length * (view === "weekly" ? 120 : 52) + 90 }}>
            <table className="w-full border-collapse" style={{ tableLayout: "fixed" }}>
              <colgroup>
                <col className="w-[180px] xl:w-[220px]" />
                {columns.map((c) => <col key={c.key} />)}
                <col className="w-[80px] xl:w-[90px]" />
              </colgroup>

              <StatsHeader
                columns={columns}
                showCost={isGMView}
                sortCol={sortCol}
                sortState={sortState}
                onSort={handleSort}
                onColumnClick={view === "weekly" ? handleDayClick : undefined}
                firstColLabel={view === "weekly" ? "Day" : "Time"}
                totalHoursConfirmed={totals.hc}
                totalHoursPending={totals.hp}
                totalCostConfirmed={totals.lc}
                totalCostPending={totals.lp}
                totalTeamConfirmed={totals.tc}
                totalTeamPending={totals.tp}
              />

              <tbody>
                {displayUsers.map((u: User) => {
                  // 신규 스케줄 생성 시 default로 박힐 rate (user → store → org cascade).
                  // 기존 스케줄의 stored rate와는 무관 — 표시 라벨에만 사용.
                  const userEffective = effectiveRate(u, currentStore, orgDefaultRate);
                  const isUserCustom = u.hourly_rate != null;
                return (
                  <tr key={u.id} className="border-b border-[var(--color-border)] last:border-b-0 hover:bg-[var(--color-surface-hover)] transition-[background-color] duration-100 relative z-[1]">
                    <td className="px-4 py-3 border-r-2 border-[var(--color-border)] sticky left-0 z-[5] bg-[var(--color-surface)]">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${rolePriorityToColor(u.role_priority)}`}>{getInitials(u.full_name)}</div>
                        <div className="min-w-0">
                          <div className="text-[13px] font-semibold text-[var(--color-text)] truncate">{u.full_name || u.username}</div>
                          <div className="text-[10px] text-[var(--color-text-muted)]">
                            <span className={u.role_priority <= ROLE_PRIORITY.GM ? "text-[var(--color-accent)] font-semibold" : u.role_priority <= ROLE_PRIORITY.SV ? "text-[var(--color-warning)] font-semibold" : "font-semibold"}>{rolePriorityToBadge(u.role_priority)}</span>
                            {isGMView && userEffective != null ? <span title="Default rate for new schedules"> · ${userEffective}/hr{isUserCustom ? "" : " (inherited)"}</span> : null}
                            {isGMView && userEffective == null && <span className="text-[var(--color-danger)]"> · No default rate</span>}
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
                                      showCost={isGMView}
                                      attendance={getAttendanceFor(s.id)}
                                      currentStoreId={isAllStores || selectedStores.length > 1 ? "__all__" : primaryStoreId}
                                      isOtherStore={!isAllStores && selectedStores.length > 1 && !selectedStoreSet.has(s.store_id)}
                                      isActive={contextMenu?.blockId === s.id}
                                      storeTimezone={stores.find((st) => st.id === s.store_id)?.timezone ?? currentUser?.organization_timezone}
                                      onClick={(e) => handleBlockClick(e, s)}
                                    />
                                  ))}
                                  <button
                                    type="button"
                                    onClick={() => openAddModal(u.id, day.date)}
                                    className="w-full py-0.5 rounded border border-dashed border-[var(--color-border)] text-[var(--color-text-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] transition-colors text-[12px] opacity-0 hover:opacity-100 focus:opacity-100"
                                    title="Add another schedule"
                                  >
                                    +
                                  </button>
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
                      <td colSpan={closeHour - openHour} className="p-0 relative">
                        {/* Border grid overlay (시간 구분선) + 익일(h>=24) 컬럼 옅은 배경 + 자정 경계 굵은 divider */}
                        <div className="absolute inset-0 grid pointer-events-none" style={{ gridTemplateColumns: `repeat(${closeHour - openHour}, 1fr)` }}>
                          {dailyHourRange.map((hr) => {
                            const isNextDay = hr >= 24;
                            const isMidnightBoundary = hr === 24;
                            return (
                              <div
                                key={hr}
                                className={`${isMidnightBoundary ? "border-l-2 border-l-[var(--color-accent)] " : ""}border-r border-[var(--color-border)] ${isNextDay ? "bg-[var(--color-bg)]" : ""}`}
                              />
                            );
                          })}
                        </div>
                        {/* 현재 시간 indicator — 오늘 + 영업시간 내 + daily view 일 때만 표시.
                            라벨은 hover (선 근처) 시에만 노출. 시간은 뻔히 아는 정보라 평소엔 선만. */}
                        {nowPct != null && (
                          <div className="absolute inset-y-0 z-30 group/now" style={{ left: `${nowPct}%`, width: "8px", marginLeft: "-4px" }}>
                            <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 border-l-2 border-dashed border-[var(--color-danger)] pointer-events-none" />
                            <span className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-full px-1.5 py-0.5 mt-[-2px] rounded-sm bg-[var(--color-danger)] text-white text-[10px] font-semibold whitespace-nowrap shadow-sm opacity-0 group-hover/now:opacity-100 transition-opacity pointer-events-none">
                              Now {nowLabel}
                            </span>
                          </div>
                        )}
                        {/* Content: flex segments (normal flow → 높이 자동 확장) */}
                        {(() => {
                          const totalMin = (closeHour - openHour) * 60;
                          const userScheds = schedules
                            .filter((s) => s.user_id === u.id && s.work_date === selectedDay)
                            .sort((a, b) => parseTimeToHours(a.start_time) - parseTimeToHours(b.start_time));
                          // 구간 분할: gap → sched → gap → sched → gap
                          type Seg = { type: "gap"; startMin: number; endMin: number } | { type: "sched"; sched: Schedule; startMin: number; endMin: number };
                          const segments: Seg[] = [];
                          let cursor = 0;
                          const seen = new Set<string>();
                          for (const s of userScheds) {
                            if (seen.has(s.id)) continue;
                            seen.add(s.id);
                            const startH = parseTimeToHours(s.start_time);
                            const endH = parseTimeToHours(s.end_time);
                            const sStart = Math.max(0, startH * 60 - openHour * 60);
                            // Overnight(end<=start): 시작일 셀에서는 [start → close)까지만 표시
                            const rawEndMin = endH > startH ? endH * 60 - openHour * 60 : totalMin;
                            const sEnd = Math.min(totalMin, rawEndMin);
                            if (sEnd <= sStart) continue;
                            if (sStart > cursor) segments.push({ type: "gap", startMin: cursor, endMin: sStart });
                            segments.push({ type: "sched", sched: s, startMin: sStart, endMin: sEnd });
                            cursor = sEnd;
                          }
                          if (cursor < totalMin) segments.push({ type: "gap", startMin: cursor, endMin: totalMin });

                          return (
                            <div className="relative flex items-stretch min-h-[56px]">
                              {segments.map((seg, i) => {
                                const pct = ((seg.endMin - seg.startMin) / totalMin) * 100;
                                if (seg.type === "gap") {
                                  // gap 영역 내 시간별 click targets
                                  const gapStartHr = Math.floor(seg.startMin / 60) + openHour;
                                  const gapEndHr = Math.ceil(seg.endMin / 60) + openHour;
                                  return (
                                    <div key={`g${i}`} className="flex" style={{ width: `${pct}%` }}>
                                      {Array.from({ length: Math.max(1, gapEndHr - gapStartHr) }, (_, gi) => {
                                        const clickH = gapStartHr + gi;
                                        return (
                                          <div
                                            key={clickH}
                                            className="group/cell flex-1 cursor-pointer hover:bg-[var(--color-surface-hover)] relative"
                                            onClick={() => openAddModal(u.id, selectedDay, `${String(clickH).padStart(2, "0")}:00`)}
                                            role="button"
                                          >
                                            <span className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/cell:opacity-100 transition-opacity text-[var(--color-accent)]">
                                              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="8" y1="3" x2="8" y2="13" /><line x1="3" y1="8" x2="13" y2="8" /></svg>
                                            </span>
                                          </div>
                                        );
                                      })}
                                    </div>
                                  );
                                }
                                return (
                                  <div key={seg.sched.id} className="bg-[var(--color-bg)] z-10" style={{ width: `${pct}%` }}>
                                    <ScheduleBlock
                                      schedule={seg.sched}
                                      showCost={isGMView}
                                      attendance={getAttendanceFor(seg.sched.id)}
                                      currentStoreId={isAllStores || selectedStores.length > 1 ? "__all__" : primaryStoreId}
                                      isOtherStore={!isAllStores && selectedStores.length > 1 && !selectedStoreSet.has(seg.sched.store_id)}
                                      isActive={contextMenu?.blockId === seg.sched.id}
                                      storeTimezone={stores.find((st) => st.id === seg.sched.store_id)?.timezone ?? currentUser?.organization_timezone}
                                      onClick={(e) => handleBlockClick(e, seg.sched)}
                                    />
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })()}
                      </td>
                    )}

                    <td className="px-2 py-3 text-center border-l border-[var(--color-border)]">
                      {view === "weekly" ? (
                        (() => {
                          const ch = weekDates.reduce((sum, d) => sum + getUserConfirmedHours(u.id, d.date), 0);
                          const ph = weekDates.reduce((sum, d) => sum + getUserPendingHours(u.id, d.date), 0);
                          const lc = weekDates.reduce((sum, d) => sum + getUserConfirmedCost(u.id, d.date), 0);
                          const lp = weekDates.reduce((sum, d) => sum + getUserPendingCost(u.id, d.date), 0);
                          const hasMissing = isGMView && userHasNoCost(u.id, weekDates.map((d) => d.date));
                          return <div className="flex flex-col items-center">
                            <span className="text-[13px] font-bold text-[var(--color-success)]">{fmtH(ch)} h</span>
                            {ph > 0 && <span className="text-[10px] font-semibold text-[var(--color-warning)]">+{fmtH(ph)} h</span>}
                            {isGMView && lc > 0 && <span className="text-[10px] text-[var(--color-success)]">${lc.toFixed(2)}</span>}
                            {isGMView && lp > 0 && <span className="text-[10px] text-[var(--color-warning)]">+${lp.toFixed(2)}</span>}
                            {hasMissing && <span className="text-[10px] text-[var(--color-danger)]" title="Some schedules have no stored rate and no inherited rate available">No cost</span>}
                          </div>;
                        })()
                      ) : (
                        (() => {
                          const blocks = schedules.filter((b) => b.work_date === selectedDay && b.user_id === u.id && matchesStoreFilter(b.store_id));
                          const h = blocks.filter((b) => b.status === "confirmed").reduce((sum, b) => sum + getNetWorkHours(b), 0);
                          const ph = blocks.filter((b) => b.status === "requested").reduce((sum, b) => sum + getNetWorkHours(b), 0);
                          return <div className="flex flex-col items-center">
                            {h > 0 && <span className="text-[13px] font-bold text-[var(--color-success)]">{fmtH(h)} h</span>}
                            {ph > 0 && <span className="text-[10px] font-semibold text-[var(--color-warning)]">+{fmtH(ph)} h</span>}
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
        </div>}
      </div>
    </div>
  );
}
