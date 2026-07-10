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
import { addDay, dawnStartOffset, dayDiff, rollEndDate, shiftIsoFields, startOffsetDaysOf } from "@/lib/scheduleTime";
import { useRouter } from "next/navigation";
import { usePersistedFilters } from "@/hooks/usePersistedFilters";
import { useSchedules, useScheduleRoster, useConfirmSchedule, useRejectSchedule, useDeleteScheduleFlow, useSubmitSchedule, useRevertSchedule, useCancelSchedule, useCreateSchedule, useUpdateSchedule, useSwitchSchedule, type RosterColumnData } from "@/hooks/useSchedules";
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
import { absShiftHours, hourOccupancy, slotOverlap } from "./scheduleStats";
import { ContextMenu } from "./ContextMenu";
import { HistoryPanel } from "./HistoryPanel";
import { SwapModal } from "./SwapModal";
import { ChangeStaffModal } from "./ChangeStaffModal";
import { ScheduleEditModal, type ScheduleEditPayload } from "./ScheduleEditModal";
import { useModal } from "@/components/ui/imperative-modal";
import { FilterBar, type FilterState, type EmptyStaffSort } from "./FilterBar";
import { LegendModal } from "./LegendModal";
import { MonthlyGrid } from "./MonthlyGrid";
import { useShifts } from "@/hooks/useShifts";
import { useMidnightRefresh } from "@/hooks/useMidnightRefresh";
import { useWorkRoles } from "@/hooks/useWorkRoles";
import { useBulkCreateSchedules, useBulkUpdateSchedules, useBulkDeleteSchedules } from "@/hooks/useSchedules";
import BulkScheduleView, { type SavePayload } from "./BulkScheduleView";

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
  const dayOff = Math.floor(h / 24); // overnight hours (24, 25, ...) → +1, (48, ...) → +2
  const hNorm = h % 24;
  const base =
    hNorm === 0 ? "0A" :
    hNorm < 12 ? `${hNorm}A` :
    hNorm === 12 ? "12P" :
    `${hNorm - 12}P`;
  return dayOff > 0 ? `${base}+${dayOff}` : base;
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
  // 'edit' (스케줄 deeplink) 만 추가로 읽는다 — 그 외 모든 페이지 state 는 usePersistedFilters 가 관리.
  // legacy 'store' (단수) deeplink 는 제거됨 — cross-page leak 원인이라 무시. `?stores=` 만 사용.
  const rawSearchParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
  const urlEditParam = rawSearchParams.get("edit") ?? "";

  // URL + localStorage + 서버 영속 — 1계정 1데이터 (다른 디바이스에서도 동일).
  // transient: week/day/my 는 매 세션 이번주/오늘이 자연스러우니 영속 X (URL sync 만).
  const [params, setParams] = usePersistedFilters(
    "schedules.calendar",
    {
      view: "weekly",
      week: "",
      day: "",
      my: "",
      stores: "",
      staff: "",
      roles: "",
      statuses: "",
      positions: "",
      shifts: "",
      departments: "",
      wsc: "-1",
      wss: "none",
      dsc: "-1",
      dss: "none",
      dsh: "",
      esort: "bottom",
      ehide: "",
    },
    { transient: ["week", "day", "my"] },
  );

  const view = (params.view === "daily" || params.view === "monthly" ? params.view : "weekly") as ViewMode;
  const weekStart: Date = useMemo(() => {
    if (params.week) {
      const d = new Date(params.week + "T00:00:00");
      if (!Number.isNaN(d.getTime())) return getWeekStart(d);
    }
    return getWeekStart(new Date());
  }, [params.week]);
  const weekDates = useMemo(() => buildWeekDates(weekStart), [weekStart]);
  // day 는 transient 라 페이지 재방문 시 비는데, daily 뷰일 땐 weekDates[0] (일요일) 대신
  // 오늘로 fallback (사용자가 daily 토글 처음 누를 때와 동일한 의도).
  const selectedDay = params.day || (view === "daily" ? todayInTimezone() : (weekDates[0]?.date ?? ""));
  const monthYear = useMemo(() => {
    if (params.my) {
      const [y, m] = params.my.split("-").map(Number);
      if (y && m !== undefined && !Number.isNaN(y) && !Number.isNaN(m)) {
        return { year: y, month: m };
      }
    }
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  }, [params.my]);

  // setters (rerendering via setParams + memoized derived state above)
  const setView = useCallback((v: ViewMode) => setParams({ view: v === "weekly" ? null : v }), [setParams]);
  const setWeekStart = useCallback((d: Date) => setParams({ week: fmtLocalDate(d) }), [setParams]);
  const setSelectedDay = useCallback((s: string) => setParams({ day: s || null }), [setParams]);
  const setMonthYear = useCallback(
    (next: { year: number; month: number } | ((p: { year: number; month: number }) => { year: number; month: number })) => {
      const resolved = typeof next === "function" ? (next as (p: { year: number; month: number }) => { year: number; month: number })(monthYear) : next;
      setParams({ my: `${resolved.year}-${resolved.month}` });
    },
    [setParams, monthYear],
  );

  // 현재 로그인 사용자의 role 기반으로 cost/actions 표시 여부 결정
  // Owner(10) / GM(20) 만 cost 정보 표시, SV(30) / Staff(40) 는 숨김
  const currentUser = useAuthStore((s) => s.user);
  const isGMView = (currentUser?.role_priority ?? 99) <= ROLE_PRIORITY.GM;

  const weeklySortCol = Number(params.wsc);
  const weeklySortState = params.wss as SortState;
  const dailySortCol = Number(params.dsc);
  const dailySortState = params.dss as SortState;
  // daily 30분 정렬 슬롯. "" → null (시간 전체, 구버전 호환). "0"/"1" → 첫/둘째 30분.
  const dailySortHalf: 0 | 1 | null = params.dsh === "0" ? 0 : params.dsh === "1" ? 1 : null;
  const setWeeklySortCol = useCallback((c: number) => setParams({ wsc: c === -1 ? null : String(c) }), [setParams]);
  const setWeeklySortState = useCallback((s: SortState) => setParams({ wss: s === "none" ? null : s }), [setParams]);
  const setDailySortCol = useCallback((c: number) => setParams({ dsc: c === -1 ? null : String(c) }), [setParams]);
  const setDailySortState = useCallback((s: SortState) => setParams({ dss: s === "none" ? null : s }), [setParams]);
  const setDailySortHalf = useCallback((h: 0 | 1 | null) => setParams({ dsh: h === null ? null : String(h) }), [setParams]);

  // 멀티 스토어 선택: 빈 배열 = All (전체)
  const selectedStores = useMemo(
    () => (params.stores ? params.stores.split(",").filter(Boolean) : []),
    [params.stores],
  );
  const setSelectedStores = useCallback(
    (next: string[]) => setParams({ stores: next.length === 0 ? null : next.join(",") }),
    [setParams],
  );
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
  const emptyStaffSort = ((): EmptyStaffSort => {
    const v = params.esort;
    if (v === "bottom" || v === "top" || v === "in-order") return v;
    return "bottom";
  })();
  const emptyStaffHide = params.ehide === "1";
  const setEmptyStaffSort = useCallback(
    (v: EmptyStaffSort) => setParams({ esort: v === "bottom" ? null : v }),
    [setParams],
  );
  const setEmptyStaffHide = useCallback(
    (v: boolean) => setParams({ ehide: v ? "1" : null }),
    [setParams],
  );
  const [changeStaffOpen, setChangeStaffOpen] = useState(false);
  const [changeStaffSourceId, setChangeStaffSourceId] = useState<string | null>(null);
  const [editModal, setEditModal] = useState<{ open: boolean; mode: "add" | "edit"; blockId?: string; staffId?: string; date?: string; startTime?: string; startOffsetDays?: number }>({ open: false, mode: "add" });
  const [editModalError, setEditModalError] = useState<string | null>(null);
  const modal = useModal();
  const filters: FilterState = useMemo(
    () => ({
      staffIds: params.staff ? params.staff.split(",").filter(Boolean) : [],
      roles: params.roles ? params.roles.split(",").filter(Boolean) : [],
      statuses: params.statuses ? params.statuses.split(",").filter(Boolean) : [],
      positions: params.positions ? params.positions.split(",").filter(Boolean) : [],
      shifts: params.shifts ? params.shifts.split(",").filter(Boolean) : [],
      departments: params.departments ? params.departments.split(",").filter(Boolean) : [],
    }),
    [params.staff, params.roles, params.statuses, params.positions, params.shifts, params.departments],
  );
  const setFilters = useCallback(
    (next: FilterState) => setParams({
      staff: next.staffIds.length === 0 ? null : next.staffIds.join(","),
      roles: next.roles.length === 0 ? null : next.roles.join(","),
      statuses: next.statuses.length === 0 ? null : next.statuses.join(","),
      positions: next.positions.length === 0 ? null : next.positions.join(","),
      shifts: next.shifts.length === 0 ? null : next.shifts.join(","),
      departments: next.departments.length === 0 ? null : next.departments.join(","),
    }),
    [setParams],
  );
  const [legendOpen, setLegendOpen] = useState(false);

  // ─── Bulk mode ─────────────────────────────────────
  const [bulkMode, setBulkMode] = useState(false);
  // create/update/delete 가 chain 될 수 있어 각자 모달 띄우면 최대 3번 — silent 로 묶고 호출 측에서 통합 결과 1번 발사
  const bulkCreateMutation = useBulkCreateSchedules({ silent: true });
  const bulkUpdateMutation = useBulkUpdateSchedules({ silent: true });
  const bulkDeleteMutation = useBulkDeleteSchedules({ silent: true });
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
        const creates = payload.creates.map((e) => {
          // 벌크 그리드: 영업일=work_date. 복사된 새벽근무(+1d)의 시작 오프셋 보존,
          // end는 end≤start면 익일 자동.
          // 복사 엔트리는 원본 오프셋, 신규 입력은 경계 규칙으로 추론(벌크는 날짜 UI 없음)
          const startDate = addDay(e.workDate, e.startOffsetDays ?? dawnStartOffset(e.startTime));
          const endDate = rollEndDate(startDate, e.startTime, e.endTime);
          const iso = shiftIsoFields(
            e.workDate, startDate, e.startTime, endDate, e.endTime,
            e.breakStartTime ?? null, e.breakEndTime ?? null,
          );
          return {
            user_id: e.userId,
            store_id: e.storeId,
            work_role_id: e.workRoleId,
            work_date: e.workDate,
            start_time: e.startTime,
            end_time: e.endTime,
            break_start_time: e.breakStartTime,
            break_end_time: e.breakEndTime,
            operating_day: iso.operating_day,
            start_at: iso.start_at,
            end_at: iso.end_at,
            break_start_at: iso.break_start_at,
            break_end_at: iso.break_end_at,
            status: e.status,
          };
        });
        await bulkCreateMutation.mutateAsync({ entries: creates, skip_on_conflict: true });
        created = payload.creates.length;
      }
      // 2. Updates — also forwards status if the modification carries one.
      phase = "updates";
      if (payload.updates.length > 0) {
        const updates = payload.updates.map((u) => {
          // 시간 수정 시 신 인코딩 동봉 — 주간↔새벽 전환이 표현되도록(경계 규칙).
          // HH:MM만 보내면 서버가 기존 오프셋을 보존해 전환이 불가능했다.
          let iso: Partial<Record<"operating_day" | "start_at" | "end_at" | "break_start_at" | "break_end_at", string | null>> = {};
          if (u.operatingDay && u.data.startTime && u.data.endTime) {
            const off = dawnStartOffset(u.data.startTime);
            const sd = addDay(u.operatingDay, off);
            const ed = rollEndDate(sd, u.data.startTime, u.data.endTime);
            iso = shiftIsoFields(
              u.operatingDay, sd, u.data.startTime, ed, u.data.endTime,
              u.data.breakStartTime ?? null, u.data.breakEndTime ?? null,
            );
          }
          return {
            id: u.id,
            work_role_id: u.data.workRoleId,
            start_time: u.data.startTime,
            end_time: u.data.endTime,
            break_start_time: u.data.breakStartTime,
            break_end_time: u.data.breakEndTime,
            ...iso,
            reset_checklist: u.data.resetChecklist,
            status: u.data.status,
          };
        });
        await bulkUpdateMutation.mutateAsync({ updates });
        updated = payload.updates.length;
      }
      // 3. Deletes
      phase = "deletes";
      if (payload.deletes.length > 0) {
        await bulkDeleteMutation.mutateAsync({ ids: payload.deletes });
        deleted = payload.deletes.length;
      }
      setBulkMode(false);
      const parts: string[] = [];
      if (created > 0) parts.push(`${created} created`);
      if (updated > 0) parts.push(`${updated} updated`);
      if (deleted > 0) parts.push(`${deleted} deleted`);
      void modal.alert({
        type: "success",
        title: "Schedules saved",
        message: parts.length > 0 ? parts.join(", ") + "." : "No changes.",
      });
    } catch (err) {
      // 부분 실패 가능 — 어디서 멈췄는지 + 에러 메시지를 모달로 명확히 표시
      void modal.alert({
        type: "error",
        title: "Bulk Save Partially Failed",
        message: `Failed during "${phase}" phase. Completed so far — created: ${created}, updated: ${updated}, deleted: ${deleted}. Error: ${parseApiError(err, "Unknown error")}`,
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
  // Windowed roster (Phase 2): 서버가 정렬·필터·집계 소유. roster 가 있으면 헤더/컬럼/행순서/totals 의 source of truth,
  // 없으면(로딩/실패) 기존 클라 계산을 fallback 으로 사용.
  const rosterGranularity = view === "monthly" ? "month" : view === "daily" ? "day" : "week";
  // daily 는 선택한 하루만 집계해야 함 (dateFrom/dateTo 는 주 전체라 그대로 쓰면 한 주치가 시간 슬롯에 합산됨).
  const rosterDateFrom = view === "daily" ? selectedDay : dateFrom;
  const rosterDateTo = view === "daily" ? selectedDay : dateTo;
  const rosterQ = useScheduleRoster({
    date_from: rosterDateFrom,
    date_to: rosterDateTo,
    granularity: rosterGranularity,
    store_ids: isAllStores ? undefined : selectedStores,
    staff_ids: filters.staffIds.length ? filters.staffIds : undefined,
    roles: filters.roles.length ? filters.roles : undefined,
    departments: filters.departments.length ? filters.departments : undefined,
    statuses: filters.statuses.length ? filters.statuses : undefined,
    positions: filters.positions.length ? filters.positions : undefined,
    shifts: filters.shifts.length ? filters.shifts : undefined,
  });
  const roster = rosterQ.data;

  const users = usersQ.data ?? [];
  const stores = storesQ.data ?? [];
  const schedules: Schedule[] = schedulesQ.data?.items ?? [];
  const attendances = attendancesQ.data?.items ?? [];

  // Monthly용 shifts + workRoles (단일 store 선택 시)
  const isSingleStore = selectedStores.length === 1;
  const shiftsQ = useShifts(isSingleStore ? selectedStores[0] : undefined);
  const monthlyWorkRolesQ = useWorkRoles(isSingleStore ? selectedStores[0] : undefined);

  // legacy `?store=` (단수) deeplink 는 deprecated.
  // 이전에는 URL ?store= 를 받아 영속 stores (복수) 를 덮어썼는데, 다른 페이지
  // (attendance 등) 에서 URL query 가 carry over 되면 사용자의 multi-select 영속이
  // 단일 매장으로 덮어쓰여지는 cross-page leak 문제가 있었다.
  // 이제는 ?store= 를 무시 — 사용자의 영속 stores 그대로 유지. (외부 deeplink 필요하면
  // `?stores=<id>` (복수) 사용.)

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

  // ?edit=<id> 쿼리 → edit modal 열기 (detail page에서 진입 시). 1회만 실행.
  const editDeeplinkConsumedRef = useRef(false);
  useEffect(() => {
    if (editDeeplinkConsumedRef.current) return;
    if (urlEditParam && !editModal.open) {
      editDeeplinkConsumedRef.current = true;
      setEditModal({ open: true, mode: "edit", blockId: urlEditParam });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlEditParam]);

  // ─── Mutations ────────────────────────────────────────

  const submitMutation = useSubmitSchedule();
  const confirmMutation = useConfirmSchedule();
  const rejectMutation = useRejectSchedule();
  const revertMutation = useRevertSchedule();
  const cancelMutation = useCancelSchedule();
  const deleteFlow = useDeleteScheduleFlow();
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

  const filteredUsers = useMemo(() => {
    let result = users;
    // 스토어 필터링은 useUsers(store_id)에서 서버사이드로 처리됨
    if (filters.staffIds.length > 0) {
      result = result.filter((u) => filters.staffIds.includes(u.id));
    }
    if (filters.roles.length > 0) {
      result = result.filter((u) => filters.roles.includes(rolePriorityToBadge(u.role_priority).toLowerCase()));
    }
    if (filters.departments.length > 0) {
      // department 는 user 속성 — 미지정(null)은 "unassigned" 로 매칭
      result = result.filter((u) => filters.departments.includes(u.department ?? "unassigned"));
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

    // A-7: Daily view는 실제 스케줄 범위로 동적 확장 (클리핑 방지).
    // 물리 위치는 영업일 축 기준 — +1d 새벽 근무(start_at 날짜=영업일+1)는 당일 아침이
    // 아니라 25시(1A+1) 쪽에 위치하므로 startOffsetDaysOf 로 보정해서 판정한다.
    // (보정 없으면 range 4A–2A+1 "안"에 있는 새벽조가 hour 1로 오판돼 축이 0A로 확장되던 버그)
    // 모집단 = 렌더러와 동일: "보이는 행(filteredUsers)의 해당일 전 스케줄" (매장 무관 —
    // 렌더러는 다른 매장 블록도 dim 으로 그리므로 축에서 빼면 블록이 그리드 밖으로 사라진다).
    let effectiveOh = configuredOh;
    let effectiveCh = configuredCh;
    if (view === "daily" && selectedDay) {
      const visibleIds = new Set(filteredUsers.map((u) => u.id));
      const dayScheds = schedules.filter((s) => s.work_date === selectedDay && visibleIds.has(s.user_id));
      for (const s of dayScheds) {
        const { startH, endH } = absShiftHours(s.start_time, s.end_time, startOffsetDaysOf(s));
        effectiveOh = Math.min(effectiveOh, Math.floor(startH));
        effectiveCh = Math.max(effectiveCh, Math.ceil(endH));
      }
    }

    return {
      openHour: effectiveOh,
      closeHour: effectiveCh,
      configuredOpenHour: configuredOh,
      configuredCloseHour: configuredCh,
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rangeQueries, orgRangeQ.data, view, selectedDay, extractRange, schedules, filteredUsers]);

  // axis가 configured range 밖으로 확장됐는지 여부 (Daily view에서 경고 표시용)
  const axisExpandedOutsideRange = view === "daily" && (openHour < configuredOpenHour || closeHour > configuredCloseHour);

  // Daily view 현재 시간 indicator 위치 (% in 0..100). selectedDay가 오늘이 아니면 null.
  // openHour..closeHour 범위 밖이면 null (영업시간 밖이라 표시 안 함).
  const nowPct: number | null = useMemo(() => {
    if (view !== "daily" || !selectedDay) return null;
    const openMin = openHour * 60;
    const closeMin = closeHour * 60;
    if (closeMin <= openMin) return null;
    // '지금'을 영업일 축 절대분으로 환산 — 오늘 그리드는 offset 0, 어제 영업일 그리드의
    // 새벽(+1) 구간을 보고 있으면 +24h. 축 범위 밖이면 자동 null.
    // (이전 +24h 휴리스틱은 매장시간 새벽에 24시간-미래 위치로 오표시하던 결함)
    const n = dayDiff(selectedDay, todayStr) * 24 * 60 + nowMin;
    if (n < openMin || n >= closeMin) return null;
    return ((n - openMin) / (closeMin - openMin)) * 100;
  }, [view, selectedDay, todayStr, openHour, closeHour, nowMin]);

  function getSchedulesForCell(userId: string, date: string): Schedule[] {
    // 선택 외 store도 같은 셀에 표시 — ScheduleBlock의 isOtherStore dim으로 구분.
    // All Stores는 전부 "선택됨"으로 취급 (dim 없음).
    // active 칩 필터(status/position/shift)는 블록 단위로도 적용 — 비매칭 블록 숨김.
    return schedules.filter((s) => {
      if (s.user_id !== userId || s.work_date !== date) return false;
      if (filters.statuses.length > 0 && !filters.statuses.includes(s.status)) return false;
      if (filters.positions.length > 0 && !(s.position_snapshot && filters.positions.includes(s.position_snapshot))) return false;
      if (filters.shifts.length > 0) {
        const name = s.work_role_name_snapshot || s.work_role_name;
        if (!name || !filters.shifts.includes(name)) return false;
      }
      return true;
    });
  }

  function getAttendanceFor(scheduleId: string) {
    return attendances.find((a) => a.schedule_id === scheduleId);
  }

  // ─── Filter + sort ────────────────────────────────────

  const sortCol = view === "weekly" ? weeklySortCol : dailySortCol;
  const sortState = view === "weekly" ? weeklySortState : dailySortState;
  // weekly 에는 half 개념 없음. daily 에서만 30분 슬롯 정렬.
  const sortHalf = view === "weekly" ? null : dailySortHalf;

  // 컬럼 클릭 정렬 비교자 — 클라 행(sortedUsers)·roster 행(rosterDisplayUsers) 양쪽 재사용.
  // sortCol/sortState 기준으로 schedules 에서 해당 칸 상태(confirmed>requested>draft>none)를 보고 정렬.
  const applyColumnSort = (arr: User[]): User[] => {
    if (sortCol < 0 || sortState === "none") return arr;
    const statusFor = (uid: string): string => {
      let blocks: Schedule[];
      if (view === "weekly") {
        const date = weekDates[sortCol]?.date;
        blocks = date ? schedules.filter((s) => s.user_id === uid && s.work_date === date && matchesStoreFilter(s.store_id)) : [];
      } else {
        // 30분 슬롯 정렬: sortHalf 가 0/1 이면 그 30분 [slotStart, slotStart+0.5) 와 겹치는 블록만,
        // null 이면 시간 전체 [hour, hour+1) (구버전 dsh 없는 영속값 호환).
        const slotStart = openHour + sortCol + (sortHalf === 1 ? 0.5 : 0);
        const slotLen = sortHalf === null ? 1 : 0.5;
        const matchSlot = (s: Schedule) => slotOverlap(s.start_time, s.end_time, slotStart, slotLen, startOffsetDaysOf(s)) > 0;
        blocks = schedules.filter((s) => s.user_id === uid && s.work_date === selectedDay && matchesStoreFilter(s.store_id) && matchSlot(s));
      }
      return blocks.find((s) => s.status === "confirmed") ? "confirmed" : blocks.find((s) => s.status === "requested") ? "requested" : blocks.length > 0 ? "draft" : "none";
    };
    const order = sortState === "confirmed"
      ? { confirmed: 0, requested: 1, draft: 2, none: 3 }
      : { requested: 0, confirmed: 1, draft: 2, none: 3 };
    return [...arr].sort((a, b) => {
      const as = statusFor(a.id);
      const bs = statusFor(b.id);
      const hasA = as !== "none" ? 0 : 1;
      const hasB = bs !== "none" ? 0 : 1;
      if (hasA !== hasB) return hasA - hasB;
      return (order[as as keyof typeof order] ?? 3) - (order[bs as keyof typeof order] ?? 3);
    });
  };

  const sortedUsers = useMemo(() => applyColumnSort([...filteredUsers]),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [sortCol, sortState, sortHalf, view, selectedStores, isAllStores, selectedDay, filteredUsers, schedules, weekDates, openHour]);

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
      // TEAM = 스케줄 수 (고유 인원 아님). 한 사람이 2개 등록하면 2.
      teamConfirmed: confirmed.length,
      teamPending: pending.length,
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
    // 이 1시간 슬롯 [h, h+1) 안에서 스케줄이 차지하는 비율(0~1). 30분 grid라 0/0.5/1 로 떨어짐.
    // 30분만 걸친 사람은 0.5인으로 계산 (한 시간 전부 일하면 1인).
    const occupancy = (s: Schedule): number => hourOccupancy(s.start_time, s.end_time, h, startOffsetDaysOf(s));
    const daySchedules = schedules.filter(
      (s) => s.work_date === selectedDay && matchesStoreFilter(s.store_id) && occupancy(s) > 0,
    );
    const confirmed = daySchedules.filter((s) => s.status === "confirmed");
    const pending = daySchedules.filter((s) => s.status === "requested");
    // 점유 비율 가중 합 — 30분 점유 = 0.5. cost 도 점유분만큼만 잡음.
    const sumOcc = (arr: Schedule[]) => arr.reduce((sum, s) => sum + occupancy(s), 0);
    const sumCost = (arr: Schedule[]) => arr.reduce((sum, s) => sum + occupancy(s) * (s.hourly_rate ?? 0), 0);
    // 30분 슬롯 인원 — [첫30분(h..h+0.5), 둘째30분(h+0.5..h+1)]. overlap>0 카운트 (서버 _occupies_slot 미러).
    const halfCount = (arr: Schedule[], slotStart: number) =>
      arr.filter((s) => slotOverlap(s.start_time, s.end_time, slotStart, 0.5, startOffsetDaysOf(s)) > 0).length;
    return {
      key: `h${h}`,
      hour: h,
      label: formatHourLabel(h),
      teamConfirmed: sumOcc(confirmed),
      teamPending: sumOcc(pending),
      hoursConfirmed: sumOcc(confirmed),
      hoursPending: sumOcc(pending),
      costConfirmed: sumCost(confirmed),
      costPending: sumCost(pending),
      slotsConfirmed: [halfCount(confirmed, h), halfCount(confirmed, h + 0.5)],
      slotsPending: [halfCount(pending, h), halfCount(pending, h + 0.5)],
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
      tc: conf.length,
      tp: pend.length,
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
      // 일간 TOTAL TEAM = 그 날 스케줄 수 (시간대별은 0.5 환산이지만 합계 컬럼은 스케줄 수).
      tc: conf.length,
      tp: pend.length,
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
      tc: conf.length,
      tp: pend.length,
    };
  }, [schedules, monthDateFrom, monthDateTo, selectedStores, isAllStores]);

  const totals = view === "monthly" ? monthlyTotals : view === "weekly" ? weeklyTotals : dailyTotals;

  // 활성 필터 합계: FilterBar로 좁혀진 staff/status/position/shift만 합산.
  const totalActiveFilters = filters.staffIds.length + filters.roles.length + filters.statuses.length + filters.positions.length + filters.shifts.length + filters.departments.length;
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
      tc: conf.length,
      tp: pend.length,
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalActiveFilters, filteredUsers, filters, schedules, view, monthDateFrom, monthDateTo, selectedDay, weekDates, selectedStores, isAllStores]);

  const columns = view === "weekly" ? weeklyColumns : dailyColumns;

  // ─── Roster override (Phase 2) — roster 있으면 서버 집계/정렬/필터를 source of truth 로 ───
  const rosterColByKey = useMemo(() => {
    const m: Record<string, RosterColumnData> = {};
    if (roster) for (const c of roster.columns) m[c.key] = c;
    return m;
  }, [roster]);

  const effectiveColumns = useMemo(() => {
    if (!roster) return columns;
    return columns.map((c) => {
      // [전환기] +1d 새벽 물리배치로 daily 키가 h1→h25 등으로 이동. 구 서버(offset 미반영)와의
      // 배포 스큐 창에서 헤더가 0으로 비지 않도록 h{n-24} 별칭 폴백. 서버 배포 완료 후 자연 소멸.
      const cHour = (c as { hour?: number }).hour;
      const rc = rosterColByKey[c.key]
        ?? (typeof cHour === "number" && cHour >= 24 ? rosterColByKey[`h${cHour - 24}`] : undefined);
      return {
        ...c,
        teamConfirmed: rc?.team_confirmed ?? 0,
        teamPending: rc?.team_pending ?? 0,
        hoursConfirmed: rc?.hours_confirmed ?? 0,
        hoursPending: rc?.hours_pending ?? 0,
        costConfirmed: rc?.cost_confirmed ?? 0,
        costPending: rc?.cost_pending ?? 0,
        // day 30분 슬롯 — roster 가 권위 source. roster 가 이 시간 컬럼을 안 주면(필터로 매칭 0)
        // team 과 동일하게 빈배열(0)로. 클라(필터 미반영) 값으로 폴백 금지 — 필터된 헤더에 미필터 숫자 누출 버그.
        slotsConfirmed: rc?.slots_confirmed ?? [],
        slotsPending: rc?.slots_pending ?? [],
      };
    });
  }, [roster, columns, rosterColByKey]);

  const effectiveTotals = roster
    ? {
        tc: roster.totals.team_confirmed, tp: roster.totals.team_pending,
        hc: roster.totals.hours_confirmed, hp: roster.totals.hours_pending,
        lc: roster.totals.cost_confirmed ?? 0, lp: roster.totals.cost_pending ?? 0,
      }
    : totals;

  // roster 가 이미 필터 반영본이므로 별도 Filtered 배너는 roster 없을 때(fallback)만.
  const headerStaffCount = roster ? roster.totals.staff_count : users.length;
  const isFiltered = totalActiveFilters > 0;

  // 행 순서/표시 — roster 가 기본 정렬·필터 소유. 컬럼 클릭 정렬 + empty-staff 토글은 클라 유지.
  const rosterDisplayUsers = useMemo(() => {
    if (!roster) return null;
    const byId = new Map(users.map((u) => [u.id, u]));
    const base = roster.roster
      .map((r) => byId.get(r.user_id))
      .filter((u): u is User => Boolean(u));
    // 칸 헤더 클릭 정렬 활성 시 roster 기본순서 위에 컬럼 정렬을 덮어씀 (회귀 수정).
    const ordered = applyColumnSort(base);
    const hasSched = new Set(
      roster.roster.filter((r) => r.has_schedule_in_period).map((r) => r.user_id),
    );
    if (emptyStaffHide) return ordered.filter((u) => hasSched.has(u.id));
    if (emptyStaffSort === "in-order") return ordered;
    const withS: User[] = [];
    const without: User[] = [];
    for (const u of ordered) (hasSched.has(u.id) ? withS : without).push(u);
    return emptyStaffSort === "top" ? [...without, ...withS] : [...withS, ...without];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roster, users, emptyStaffHide, emptyStaffSort, sortCol, sortState, sortHalf, view, schedules, weekDates, openHour, selectedDay]);
  const effectiveDisplayUsers = rosterDisplayUsers ?? displayUsers;

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

  // daily 30분 슬롯 클릭 정렬. weekly 에서는 호출되지 않음(onSortHalf 미전달).
  function handleSortHalf(colIndex: number, half: 0 | 1, state: SortState) {
    setDailySortCol(state === "none" ? -1 : colIndex);
    setDailySortHalf(state === "none" ? null : half);
    setDailySortState(state);
  }

  function handleDayClick(dateKey: string) {
    setParams({ day: dateKey || null, view: "daily" });
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

  async function handleContextAction(action: string): Promise<void> {
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
    if (action === "revert") {
      const target = schedules.find((s) => s.id === blockId);
      const cfg = target?.status === "cancelled"
        ? { title: "Restore Schedule?", message: "This cancelled schedule will be restored to requested status and will need to be re-confirmed.", confirmLabel: "Restore" }
        : { title: "Revert to Requested?", message: "This confirmed schedule will be reverted to requested status and will need to be re-confirmed.", confirmLabel: "Revert" };
      const ok = await modal.confirm(cfg);
      if (!ok) return;
      revertMutation.mutate(blockId);
    }
    if (action === "delete") void deleteFlow(blockId);
    if (action === "reject") {
      const reason = await modal.confirm({
        title: "Reject Schedule",
        message: "This will mark the schedule as rejected. You can optionally provide a reason.",
        confirmLabel: "Reject",
        variant: "danger",
        requiresReason: true,
        reasonLabel: "Rejection reason (optional)",
      });
      if (reason === undefined) return;
      rejectMutation.mutate({ id: blockId, rejection_reason: reason || undefined });
    }
    if (action === "cancel") {
      const reason = await modal.confirm({
        title: "Cancel Confirmed Schedule",
        message: "This will cancel the confirmed schedule. You can optionally provide a reason.",
        confirmLabel: "Cancel Schedule",
        variant: "danger",
        requiresReason: true,
        reasonLabel: "Cancellation reason (optional)",
      });
      if (reason === undefined) return;
      cancelMutation.mutate({ id: blockId, cancellation_reason: reason || undefined });
    }
    if (action === "confirm") {
      const ok = await modal.confirm({
        title: "Confirm Schedule?",
        message: "This will mark the schedule as confirmed and notify the staff member.",
        confirmLabel: "Confirm",
      });
      if (!ok) return;
      confirmMutation.mutate(blockId);
    }
    if (action === "sync-rate") {
      const block = schedules.find((s) => s.id === blockId);
      if (!block) return;
      const blockUser = users.find((u) => u.id === block.user_id);
      const target = effectiveRate(blockUser, currentStore, orgDefaultRate);
      if (target == null) return;
      updateMutation.mutate({ id: blockId, data: { hourly_rate: target } });
    }
  }

  function openAddModal(staffId?: string, date?: string, startTime?: string, startOffsetDays?: number) {
    setEditModal({ open: true, mode: "add", staffId, date, startTime, startOffsetDays });
  }

  function closeEditModal() {
    setEditModal({ open: false, mode: "add" });
    setEditModalError(null);
    // ?edit= 쿼리만 제거, 다른 필터 (view, stores, filters 등) 는 보존.
    if (typeof window !== "undefined") {
      const sp = new URLSearchParams(window.location.search);
      if (sp.has("edit")) {
        sp.delete("edit");
        const qs = sp.toString();
        router.replace(qs ? `/schedules?${qs}` : "/schedules", { scroll: false });
      }
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
        // 전환기: 신 datetime 인코딩 동시 전송(서버가 우선 사용)
        operating_day: payload.operatingDay,
        start_at: payload.startAt,
        end_at: payload.endAt,
        break_start_at: payload.breakStartAt,
        break_end_at: payload.breakEndAt,
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
        operating_day: payload.operatingDay,
        start_at: payload.startAt,
        end_at: payload.endAt,
        break_start_at: payload.breakStartAt,
        break_end_at: payload.breakEndAt,
        note: payload.notes || null,
        hourly_rate: (userChanged && rateUntouched) ? null : payload.hourlyRate,
        force: payload.force,
        ...(resetChecklist !== undefined ? { reset_checklist: resetChecklist } : {}),
      },
    }, {
      onSuccess: closeEditModal,
      onError: async (err) => {
        const msg = parseApiError(err, "Failed to update schedule");
        // 서버가 "Checklist is in_progress/completed..." 400으로 거절 → 확인 후 재전송
        if (/reset_checklist=true/.test(msg)) {
          const ok = await modal.confirm({
            title: "Checklist in progress",
            message: msg + "\n\nReset the checklist with the new setup? Existing progress will be lost.",
            confirmLabel: "Reset & save",
            variant: "danger",
          });
          if (ok) submitEditMutation(blockId, payload, true);
          return;
        }
        setEditModalError(msg);
      },
    });
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
            prefilledStartOffsetDays={editModal.startOffsetDays}
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
            onDeleted={editModal.mode === "edit" ? () => { /* hook 이 cache invalidate → grid 자동 refetch */ } : undefined}
          />
        );
      })()}

      {/* 모든 confirm 흐름이 useModal imperative API 로 이관됨 — handleContextAction / submitEditMutation 안 inline */}

      {/* Legend Modal */}
      <LegendModal open={legendOpen} onClose={() => setLegendOpen(false)} />



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
            {roster && isFiltered && (
              <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-accent)] shrink-0" title="Stats reflect the active filters">Filtered</span>
            )}
            <span title={roster && isFiltered ? "Staff matching active filters" : "Total staff in selected store(s)"}>Staff: <strong className="text-[14px] text-[var(--color-text)]">{headerStaffCount}</strong></span>
            <span className="w-px h-4 bg-[var(--color-border)]" />
            <span title="Confirmed / approved schedules">Scheduled: <strong className="text-[14px] text-[var(--color-text)]">{effectiveTotals.tc}</strong></span>
            <span className="w-px h-4 bg-[var(--color-border)]" />
            <span title="Requested schedules awaiting approval">Pending: <strong className="text-[14px] text-[var(--color-warning)]">{effectiveTotals.tp}</strong></span>
            {isGMView && <>
              <span className="w-px h-4 bg-[var(--color-border)]" />
              <span title="Confirmed cost (approved) + pending cost (awaiting approval)">Cost: <strong className="text-[14px] text-[var(--color-success)]">${effectiveTotals.lc.toFixed(2)}</strong>{effectiveTotals.lp > 0 && <strong className="text-[14px] text-[var(--color-warning)]" title="Additional pending cost if approved"> +${effectiveTotals.lp.toFixed(2)}</strong>}</span>
              {effectiveTotals.hc > 0 && (
                <span className="text-[var(--color-text-muted)]" title="Average hourly rate = total cost / total hours across all confirmed schedules">
                  (avg ${(effectiveTotals.lc / effectiveTotals.hc).toFixed(2)}/h)
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
                <button key={v} type="button" onClick={() => {
                  if (v === "daily") setParams({ view: "daily", day: todayStr });
                  else setParams({ view: v === "weekly" ? null : v });
                }}
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
          showDepartment
          emptyStaffSort={emptyStaffSort}
          onEmptyStaffSortChange={setEmptyStaffSort}
          emptyStaffHide={emptyStaffHide}
          onEmptyStaffHideChange={setEmptyStaffHide}
        />

        {/* (filtered totals 배너 제거 — 헤더가 필터 반영본으로 표시) */}

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
            onDayClick={(date) => setParams({ day: date || null, view: "daily" })}
            onWeekClick={(date) => setParams({ week: fmtLocalDate(getWeekStart(new Date(date + "T00:00:00"))), view: null })}
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
          <div style={{ minWidth: 220 + columns.length * (view === "weekly" ? 120 : 96) + 90 }}>
            <table className="w-full border-collapse" style={{ tableLayout: "fixed" }}>
              <colgroup>
                <col className="w-[180px] xl:w-[220px]" />
                {columns.map((c) => <col key={c.key} style={view === "daily" ? { width: 96 } : undefined} />)}
                <col className="w-[80px] xl:w-[90px]" />
              </colgroup>

              <StatsHeader
                columns={effectiveColumns}
                showCost={isGMView}
                sortCol={sortCol}
                sortState={sortState}
                onSort={handleSort}
                daily30={view === "daily"}
                sortHalf={sortHalf}
                onSortHalf={handleSortHalf}
                onColumnClick={view === "weekly" ? handleDayClick : undefined}
                firstColLabel={view === "weekly" ? "Day" : "Time"}
                totalHoursConfirmed={effectiveTotals.hc}
                totalHoursPending={effectiveTotals.hp}
                totalCostConfirmed={effectiveTotals.lc}
                totalCostPending={effectiveTotals.lp}
                totalTeamConfirmed={effectiveTotals.tc}
                totalTeamPending={effectiveTotals.tp}
              />

              <tbody>
                {effectiveDisplayUsers.map((u: User) => {
                  // 신규 스케줄 생성 시 default로 박힐 rate (user → store → org cascade).
                  // 기존 스케줄의 stored rate와는 무관 — 표시 라벨에만 사용.
                  const userEffective = effectiveRate(u, currentStore, orgDefaultRate);
                  const isUserCustom = u.hourly_rate != null;
                return (
                  <tr key={u.id} className="border-b border-[var(--color-border)] last:border-b-0 hover:bg-[var(--color-surface-hover)] transition-[background-color] duration-100">
                    <td className="px-4 py-3 border-r-2 border-[var(--color-border)] sticky left-0 z-[25] bg-[var(--color-surface)]">
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
                        {/* Border grid overlay (시간 구분선) + 익일(h>=24) 컬럼 옅은 배경 + 자정 경계 굵은 divider
                            + 칸 가운데 30분 분할선(faint) — 헤더 TIME 칸 분할선과 정렬 */}
                        <div className="absolute inset-0 grid pointer-events-none" style={{ gridTemplateColumns: `repeat(${closeHour - openHour}, 1fr)` }}>
                          {dailyHourRange.map((hr) => {
                            const isNextDay = hr >= 24;
                            const isMidnightBoundary = hr === 24;
                            return (
                              <div
                                key={hr}
                                className={`relative ${isMidnightBoundary ? "border-l-2 border-l-[var(--color-accent)] " : ""}border-r border-[var(--color-border)] ${isNextDay ? "bg-[var(--color-bg)]" : ""}`}
                              >
                                <span className="absolute left-1/2 inset-y-0 w-px -translate-x-1/2 bg-[var(--color-border)]/40" aria-hidden="true" />
                              </div>
                            );
                          })}
                        </div>
                        {/* 정렬 밴드 — 클릭한 30분 슬롯을 세로 밴드로 하이라이트 (스케줄 블록 뒤). */}
                        {sortCol >= 0 && sortHalf != null && (closeHour - openHour) > 0 && (() => {
                          const totalH = closeHour - openHour;
                          const bandLeft = ((sortCol + (sortHalf === 1 ? 0.5 : 0)) / totalH) * 100;
                          const bandWidth = (0.5 / totalH) * 100;
                          return (
                            <div
                              className="absolute inset-y-0 z-0 pointer-events-none bg-[rgba(108,92,231,0.10)] border-x border-[rgba(108,92,231,0.5)]"
                              style={{ left: `${bandLeft}%`, width: `${bandWidth}%` }}
                              aria-hidden="true"
                            />
                          );
                        })()}
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
                            .sort((a, b) =>
                              absShiftHours(a.start_time, a.end_time, startOffsetDaysOf(a)).startH -
                              absShiftHours(b.start_time, b.end_time, startOffsetDaysOf(b)).startH);
                          // 구간 분할: gap → sched → gap → sched → gap
                          type Seg = { type: "gap"; startMin: number; endMin: number } | { type: "sched"; sched: Schedule; startMin: number; endMin: number };
                          const segments: Seg[] = [];
                          let cursor = 0;
                          const seen = new Set<string>();
                          for (const s of userScheds) {
                            if (seen.has(s.id)) continue;
                            seen.add(s.id);
                            // 영업일 축 절대시각 — +1d 새벽 근무는 25시(1A+1)부터 (당일 아침 아님).
                            // overnight(end<=start) 은 absShiftHours 가 end+24 처리.
                            const { startH, endH: endAbsH } = absShiftHours(s.start_time, s.end_time, startOffsetDaysOf(s));
                            const sStart = Math.max(0, startH * 60 - openHour * 60);
                            const sEnd = Math.min(totalMin, endAbsH * 60 - openHour * 60);
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
                                            onClick={() => openAddModal(u.id, selectedDay, `${String(clickH % 24).padStart(2, "0")}:00`, Math.floor(clickH / 24))}
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

                    <td className="px-2 py-3 text-center border-l-2 border-[var(--color-border)] sticky right-0 z-[24] bg-[var(--color-surface)]">
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
                          const conf = blocks.filter((b) => b.status === "confirmed");
                          const pend = blocks.filter((b) => b.status === "requested");
                          const h = conf.reduce((sum, b) => sum + getNetWorkHours(b), 0);
                          const ph = pend.reduce((sum, b) => sum + getNetWorkHours(b), 0);
                          const lc = conf.reduce((sum, b) => sum + getNetWorkHours(b) * (b.hourly_rate ?? 0), 0);
                          const lp = pend.reduce((sum, b) => sum + getNetWorkHours(b) * (b.hourly_rate ?? 0), 0);
                          return <div className="flex flex-col items-center">
                            {h > 0 && <span className="text-[13px] font-bold text-[var(--color-success)]">{fmtH(h)} h</span>}
                            {ph > 0 && <span className="text-[10px] font-semibold text-[var(--color-warning)]">+{fmtH(ph)} h</span>}
                            {isGMView && (h > 0 || ph > 0) && <span className="text-[10px] text-[var(--color-success)]">${lc.toFixed(2)}</span>}
                            {isGMView && lp > 0 && <span className="text-[10px] text-[var(--color-warning)]">+${lp.toFixed(2)}</span>}
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
