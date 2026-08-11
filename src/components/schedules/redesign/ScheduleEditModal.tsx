"use client";

/**
 * ScheduleEditModal — server types 직접 사용. mockup type 의존 없음.
 */

import { useState, useEffect, useRef, useMemo } from "react";
import { useWorkRoles } from "@/hooks/useWorkRoles";
import { useUserStores } from "@/hooks/useUsers";
import { useResolveSetting } from "@/hooks/useSettings";
import { useValidateSchedule, useDeleteScheduleFlow } from "@/hooks/useSchedules";
import { useModal } from "@/components/ui/imperative-modal";
import { useAuthStore } from "@/stores/authStore";
import { todayInTimezone } from "@/lib/utils";
import {
  addDay, dayDiff, shiftIsoFields, timeToMin,
  SCHEDULE_STEP_MINUTES, isOnScheduleGrid, snapToStep, wrapMinutes,
  withStart, withEnd, withDuration, endOf, formatWallClock,
  dayStartFor, dawnStartOffset, minToTime,
} from "@/lib/scheduleTime";
import { describeScheduleIssues } from "@/lib/scheduleCodes";
import type { Schedule, User, WorkRole, Store } from "@/types";
import { ROLE_PRIORITY } from "@/lib/permissions";

export interface ScheduleEditPayload {
  userId: string;
  storeId: string;
  date: string;
  startTime: string;  // "HH:MM"
  endTime: string;
  /** null = no break. "HH:MM" when split is enabled. */
  breakStartTime: string | null;
  breakEndTime: string | null;
  workRoleId: string | null;
  notes: string;
  /** stored hourly rate. null = clear (자동 cascade로 표시되지 않음 → No cost). */
  hourlyRate: number | null;
  /** 서버 경고(overtime 등)를 사용자가 확인한 경우 true. 서버는 warning 을 무시하고 저장. */
  force?: boolean;
  /** 영업일 라벨(= date). 벽시계 datetime 인코딩. */
  operatingDay: string;
  /** "YYYY-MM-DDTHH:MM" — end는 end≤start면 익일 자동. */
  startAt: string;
  endAt: string;
  breakStartAt: string | null;
  breakEndAt: string | null;
}

// Status 전환은 dedicated actions (submit / confirm / reject / revert / cancel)로만.
// 여기선 편집 불가 — 현재 status는 header에 배지로 read-only 표시.

interface Props {
  open: boolean;
  mode: "add" | "edit";
  schedule?: Schedule | null;
  prefilledUserId?: string;
  prefilledDate?: string;
  /** "HH:MM" — daily view에서 시간 클릭 시 전달. start time 자동 채우기. */
  prefilledStartTime?: string;
  /** Daily 그리드 +1 시간대(1A+1 등) gap 클릭 시 시작 달력일 오프셋 (영업일+N). */
  prefilledStartOffsetDays?: number;
  users: User[];
  storeId: string;
  /** 선택 가능한 store 목록 — store가 2개 이상이면 드롭다운 표시 */
  stores?: Store[];
  /** 현재 캘린더에서 선택된 store ID 목록 (All이면 전체 stores) */
  selectedStoreIds?: string[];
  /** 선택된 user의 cascade rate (user → store → org) — placeholder/Apply 버튼용 */
  inheritedRate?: number | null;
  /** cascade 출처 레이어 — placeholder에 "(from org default)" 등 표시용 */
  inheritedRateSource?: "user" | "store" | "org" | null;
  /** Cost 정보 표시/편집 가능 여부. false면 hourly_rate input 자체 숨김 (SV/Staff). */
  showCost?: boolean;
  /** 서버 검증 실패 메시지 (inline banner). 사용자가 dismiss하거나 재시도 성공하면 사라짐 */
  errorMessage?: string | null;
  /** error banner dismiss (X 버튼) */
  onDismissError?: () => void;
  onClose: () => void;
  onSave: (payload: ScheduleEditPayload) => void;
  /**
   * 삭제 성공 후 부모에게 통지하는 콜백.
   * confirm 모달과 mutation 자체는 이 컴포넌트가 책임 — 부모는 후처리만 (예: 페이지 이동/리스트 refetch).
   * 옵셔널 — 안 넘기면 삭제 버튼 자체가 숨겨짐.
   */
  onDeleted?: (id: string) => void;
  isSaving?: boolean;
}

function workRoleLabel(wr: WorkRole): string {
  if (wr.name) return wr.name;
  return `${wr.shift_name ?? ""} - ${wr.position_name ?? ""}`.trim();
}

function getInitials(name: string | null | undefined): string {
  if (!name) return "??";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "??";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return ((parts[0]![0] ?? "") + (parts[parts.length - 1]![0] ?? "")).toUpperCase();
}

function rolePriorityToColor(p: number): string {
  if (p <= ROLE_PRIORITY.GM) return "bg-[var(--color-accent-muted)] text-[var(--color-accent)]";
  if (p <= ROLE_PRIORITY.SV) return "bg-[var(--color-warning-muted)] text-[var(--color-warning)]";
  return "bg-[var(--color-success-muted)] text-[var(--color-success)]";
}

// ─── time utils ──────────────────────────────────────────
// 시각 산술은 lib/scheduleTime 이 단일 출처 (server SCHEDULE_STEP_MINUTES 와 짝).
const timeToMinutes = timeToMin;
const minutesToTime = minToTime;

/** 5분 단위 분 옵션. 레거시 off-grid 값(예: :07)은 맨 앞에 끼워 보여준다 — 저장 시 검증이 막는다. */
const STEP_MINUTE_OPTIONS = Array.from({ length: 60 / SCHEDULE_STEP_MINUTES }, (_, i) => i * SCHEDULE_STEP_MINUTES);

/**
 * 시/분/AM·PM 를 분리한 시간 선택기. 네이티브 time input 은 브라우저별로 1·15분을 노출하므로
 * 짧은 드롭다운 3개로 입력 단위(5분, D6-1)를 보장한다.
 */
function TimeSelect({ value, onChange, className }: { value: string; onChange: (v: string) => void; className: string }) {
  const total = value ? timeToMinutes(value) : 0;
  const h24 = Math.floor(total / 60);
  const min = total % 60;
  const period: "AM" | "PM" = h24 < 12 ? "AM" : "PM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const minOptions = STEP_MINUTE_OPTIONS.includes(min) ? STEP_MINUTE_OPTIONS : [min, ...STEP_MINUTE_OPTIONS];

  function emit(nh12: number, nmin: number, nperiod: "AM" | "PM") {
    let h = nh12 % 12;            // 12 → 0
    if (nperiod === "PM") h += 12;
    onChange(`${String(h).padStart(2, "0")}:${String(nmin).padStart(2, "0")}`);
  }

  const sel = "bg-transparent focus:outline-none cursor-pointer";
  return (
    <div className={`${className} flex items-center gap-0.5`}>
      <select value={h12} onChange={(e) => emit(Number(e.target.value), min, period)} className={sel} aria-label="Hour">
        {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
          <option key={h} value={h}>{h}</option>
        ))}
      </select>
      <span className="text-[var(--color-text-muted)]">:</span>
      <select value={min} onChange={(e) => emit(h12, Number(e.target.value), period)} className={sel} aria-label="Minute">
        {minOptions.map((m) => (
          <option key={m} value={m}>{String(m).padStart(2, "0")}</option>
        ))}
      </select>
      <select value={period} onChange={(e) => emit(h12, min, e.target.value as "AM" | "PM")} className={`${sel} ml-0.5`} aria-label="AM/PM">
        <option value="AM">AM</option>
        <option value="PM">PM</option>
      </select>
    </div>
  );
}

/** start→end 사이 분수 (자정 넘김은 wrap). 휴게 길이 계산용. */
function durationMinutes(startHHMM: string, endHHMM: string): number {
  return wrapMinutes(timeToMinutes(endHHMM) - timeToMinutes(startHHMM));
}

/** "5h 30m" 표기 (0분은 "0m"). */
function fmtDuration(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "YYYY-MM-DD" → "Jul 9" (라이브 피드백 줄 표기, 로컬 tz 파싱 없이 문자열 성분만) */
function fmtFeedbackDate(d: string): string {
  const [, m, dd] = d.split("-").map(Number);
  return `${MONTHS[(m ?? 1) - 1]} ${dd}`;
}


/**
 * Start/End 사이에서 설정된 break 길이로 break 구간 산출.
 * 중간점에 고정 길이 break 배치. overnight 대응.
 */
function computeAutoBreak(startHHMM: string, endHHMM: string, breakMin: number): { start: string; end: string } | null {
  const total = durationMinutes(startHHMM, endHHMM);
  if (breakMin <= 0 || total <= breakMin + 10) return null;
  const s = timeToMinutes(startHHMM);
  const mid = s + Math.floor((total - breakMin) / 2);
  return { start: minutesToTime(mid), end: minutesToTime(mid + breakMin) };
}

export function ScheduleEditModal({ open, mode, schedule, prefilledUserId, prefilledDate, prefilledStartTime, prefilledStartOffsetDays, users, storeId, stores, selectedStoreIds, inheritedRate, inheritedRateSource, showCost = true, errorMessage, onDismissError, onClose, onSave, onDeleted, isSaving }: Props) {
  // Delete 흐름은 공유 hook 사용 — confirm 메시지/톤/시스템이 Detail/Calendar 어디서 호출되든 동일.
  // hook 이 confirm + mutation 까지 처리하고, 우리는 성공 후 후처리(onClose/onDeleted)만 콜백으로 전달.
  const deleteFlow = useDeleteScheduleFlow();

  const handleDeleteClick = (): void => {
    if (!schedule) return;
    void deleteFlow(schedule.id, () => {
      onClose();
      onDeleted?.(schedule.id);
    });
  };

  // 매장 또는 조직 timezone 기준으로 "오늘" 계산 — DB가 UTC라 toISOString()을 쓰면 미국 저녁이 다음날로 잡힘.
  const orgTimezone = useAuthStore((s) => s.user?.organization_timezone) ?? undefined;
  const initialStore = stores?.find((s) => s.id === storeId);
  const initialTz = initialStore?.timezone ?? orgTimezone;
  const [userId, setUserId] = useState(prefilledUserId || users[0]?.id || "");
  const [date, setDate] = useState(prefilledDate || todayInTimezone(initialTz));  // 영업일(operating_day)
  const [startTime, setStartTime] = useState("09:00");
  // 3필드의 실제 상태는 시작 + 길이뿐. 종료는 항상 파생이다 (D5-2: 종료 = 시작 + 길이).
  const [durationMin, setDurationMin] = useState(480);
  /**
   * 영업일 소속 선택 (D3-3) — null = 자동 판정 사용, 0/1 = 사용자가 뒤집은 값.
   * 자동은 "시작 시각이 매장 영업일 경계 이전이면 달력상 +1일"(dawnStartOffset).
   * 숨은 플래그가 아니라 화면에 그대로 보이는 선택이며, 자동과 다르면 경고를 띄운다.
   */
  const [startOffsetOverride, setStartOffsetOverride] = useState<0 | 1 | null>(null);
  const [splitEnabled, setSplitEnabled] = useState(false);
  const [breakStart, setBreakStart] = useState("");
  const [breakEnd, setBreakEnd] = useState("");
  const [workRoleId, setWorkRoleId] = useState<string>("");
  const [notes, setNotes] = useState("");
  // hourly rate input as string ("" = clear/null)
  const [hourlyRateInput, setHourlyRateInput] = useState<string>("");
  const modal = useModal();
  // Edit 모드 원본 값 스냅샷 — 변경 여부 비교용
  const originalRef = useRef<{
    userId: string; storeId: string; date: string;
    startOffset: number;
    startTime: string; durationMin: number;
    breakStart: string; breakEnd: string; splitEnabled: boolean;
    workRoleId: string; notes: string; hourlyRate: string;
  } | null>(null);

  // 선택된 staff의 소속 매장 조회 (is_work_assignment=true인 것만 스케줄 대상)
  const userStoresQ = useUserStores(userId || undefined);
  const workStoreIds = useMemo(
    () =>
      new Set(
        (userStoresQ.data ?? [])
          .filter((s) => s.is_work_assignment)
          .map((s) => s.id),
      ),
    [userStoresQ.data],
  );

  // Store selector — staff의 Work 체크된 store만 표시. 폴백 금지 (B-3).
  // 예외: Owner는 전 매장 접근권 있으므로 항상 전체 stores 노출.
  // staff 미선택 시에도 전체 표시 (Add 모달에서 staff 선택 전)
  const selectedUserForStoreFilter = useMemo(
    () => users.find((u) => u.id === userId),
    [users, userId],
  );
  const isSelectedOwner =
    (selectedUserForStoreFilter?.role_priority ?? Number.POSITIVE_INFINITY) <= ROLE_PRIORITY.OWNER;
  const [modalStoreId, setModalStoreId] = useState(storeId);
  const availableStores = useMemo(() => {
    if (!stores || stores.length === 0) return [];
    if (!userId || isSelectedOwner) return stores;
    return stores.filter((s) => workStoreIds.has(s.id));
  }, [stores, userId, isSelectedOwner, workStoreIds]);
  const needsStoreSelector = availableStores.length > 0;
  const effectiveStoreId = modalStoreId || availableStores[0]?.id || storeId || "";

  // staff 변경 후 소속 store 로드되면 첫 번째 store 자동 선택
  useEffect(() => {
    if (!modalStoreId && availableStores.length > 0) setModalStoreId(availableStores[0]!.id);
  }, [availableStores, modalStoreId]);

  // work role 자동 prefill 억제용 — 사용자가 이미 시간을 손댔으면 역할 선택이 값을 덮지 않는다.
  // (3필드 갱신 규칙과는 무관하다. 시작/종료/길이 사이의 연동은 플래그 없이 규칙표로만 결정한다.)
  const timeDirtyRef = useRef(false);
  const breakDirtyRef = useRef(false);

  const workRolesQ = useWorkRoles(effectiveStoreId || undefined);
  const workRoles = workRolesQ.data ?? [];

  // 설정된 기본 break/shift 길이 (분).
  const breakDurationQ = useResolveSetting("break.duration_minutes", effectiveStoreId ? { store_id: effectiveStoreId } : undefined);
  const defaultBreakMin = Number(breakDurationQ.data?.value ?? 30);
  const shiftDurationQ = useResolveSetting("work.default_schedule_duration_minutes", effectiveStoreId ? { store_id: effectiveStoreId } : undefined);
  const defaultShiftMin = Number(shiftDurationQ.data?.value ?? 330);

  // 모달 open 전환 시에만 state 리셋.
  // deps 최소화 — users / prefilled* 는 배열/원시값 재생성으로 인한 중복 실행 방지 위해 제외.
  // 대신 open=true로 전환되는 "그 순간"에만 prefilled 값을 읽어 초기화.
  useEffect(() => {
    if (!open) return;
    timeDirtyRef.current = false;
    breakDirtyRef.current = false;
    if (mode === "edit" && schedule) {
      // edit 모드: shift의 store/work_role을 정확히 반영 (그리드 필터값 무시)
      const initStore = schedule.store_id;
      const initUser = schedule.user_id;
      // 영업일 라벨 + 실제 시작/종료 달력일. start_at/end_at 우선, 없으면 work_date 폴백.
      const initDate = schedule.operating_day ?? schedule.work_date;
      const initStartDate = schedule.start_at?.slice(0, 10) ?? schedule.work_date;
      const initStartFromAt = schedule.start_at?.slice(11, 16);
      const initEndFromAt = schedule.end_at?.slice(11, 16);
      const initStart = initStartFromAt ?? schedule.start_time?.slice(0, 5) ?? "09:00";
      const initEnd = initEndFromAt ?? schedule.end_time?.slice(0, 5) ?? "17:00";
      const initEndDate = schedule.end_at?.slice(0, 10)
        ?? addDay(initStartDate, timeToMinutes(initEnd) <= timeToMinutes(initStart) ? 1 : 0);
      // 길이는 저장된 두 datetime 의 차이 그대로 — 여기서 반올림/보정하지 않는다.
      // (비배수 레거시 값도 그대로 보여야 한다: 손대지 않은 필드는 검사 대상이 아니다 — D7)
      const initDuration =
        dayDiff(initStartDate, initEndDate) * 1440 + timeToMinutes(initEnd) - timeToMinutes(initStart);
      const initStartOffset = Math.max(0, Math.min(1, dayDiff(initDate, initStartDate)));
      const hasBreak = !!(schedule.break_start_time && schedule.break_end_time);
      const initBreakStart = schedule.break_start_time?.slice(0, 5) ?? "";
      const initBreakEnd = schedule.break_end_time?.slice(0, 5) ?? "";
      const initRole = schedule.work_role_id ?? "";
      const initNotes = schedule.note ?? "";
      const initRate = schedule.hourly_rate != null && schedule.hourly_rate > 0 ? String(schedule.hourly_rate) : "";
      setModalStoreId(initStore);
      setUserId(initUser);
      setDate(initDate);
      setStartTime(initStart);
      setDurationMin(Math.max(0, initDuration));
      // 저장된 소속을 그대로 존중한다. 자동과 같은 값이어도 명시해 두면 사용자가 시각을 바꿔도
      // 소속이 조용히 뒤집히지 않는다 (기존 스케줄이 말없이 다른 영업일로 옮겨가는 사고 방지).
      setStartOffsetOverride(initStartOffset === 1 ? 1 : 0);
      setSplitEnabled(hasBreak);
      setBreakStart(initBreakStart);
      setBreakEnd(initBreakEnd);
      setWorkRoleId(initRole);
      setNotes(initNotes);
      setHourlyRateInput(initRate);
      // 변경 감지용 스냅샷
      originalRef.current = {
        userId: initUser, storeId: initStore, date: initDate,
        startOffset: initStartOffset,
        startTime: initStart, durationMin: Math.max(0, initDuration),
        breakStart: initBreakStart, breakEnd: initBreakEnd, splitEnabled: hasBreak,
        workRoleId: initRole, notes: initNotes, hourlyRate: initRate,
      };
    } else if (mode === "add") {
      setModalStoreId(storeId || availableStores[0]?.id || stores?.[0]?.id || "");
      setUserId(prefilledUserId || users[0]?.id || "");
      const addDate = prefilledDate || todayInTimezone(stores?.find((s) => s.id === (modalStoreId || storeId))?.timezone ?? orgTimezone);
      setDate(addDate);
      const initStart = prefilledStartTime || "09:00";
      setStartTime(initStart);
      // 기본 길이는 설정값(work.default_schedule_duration_minutes). 5분 배수가 아니면 스냅 —
      // 자동 계산 값이 grid 를 어기고 들어와 저장 시 거절되는 일이 없도록.
      setDurationMin(Math.round(defaultShiftMin / SCHEDULE_STEP_MINUTES) * SCHEDULE_STEP_MINUTES);
      // +1 시간대(1A+1 등) gap 클릭이면 그 칸의 의도(새벽조)를 소속 선택으로 옮긴다.
      setStartOffsetOverride(prefilledStartOffsetDays === 1 ? 1 : null);
      setSplitEnabled(false);
      setBreakStart("");
      setBreakEnd("");
      setWorkRoleId("");
      setNotes("");
      setHourlyRateInput("");
      originalRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, schedule?.id]);

  // Work role 변경 시 auto-apply — onChange 핸들러로 직접 처리 (effect 아님).
  function onChangeWorkRole(newRoleId: string) {
    setWorkRoleId(newRoleId);
    if (!newRoleId) return;
    const wr = workRoles.find((w) => w.id === newRoleId);
    if (!wr) return;
    // time: 사용자가 수정 안 했을 때만. 역할 기본값은 시작+종료 쌍이므로 길이로 환산해 넣는다.
    if (!timeDirtyRef.current && wr.default_start_time && wr.default_end_time) {
      const s = wr.default_start_time.slice(0, 5);
      const e = wr.default_end_time.slice(0, 5);
      setStartTime(s);
      setDurationMin(wrapMinutes(timeToMinutes(e) - timeToMinutes(s)));
    }
    // break: 사용자가 수정 안 했을 때만
    if (!breakDirtyRef.current) {
      if (wr.break_start_time && wr.break_end_time) {
        setBreakStart(wr.break_start_time.slice(0, 5));
        setBreakEnd(wr.break_end_time.slice(0, 5));
        setSplitEnabled(true);
      }
    }
  }

  // ─── 파생 값 ────────────────────────────────────────────
  // 상태는 [영업일, 시작 시각, 길이, 소속 선택] 넷뿐. 나머지는 전부 여기서 계산된다.
  // 종료 시각·종료 달력일을 상태로 들고 있으면 세 값이 서로 어긋난 채 저장되는 경로가 생긴다.
  const selectedStore = stores?.find((s) => s.id === effectiveStoreId);
  const dayBoundary = dayStartFor(selectedStore?.day_start_time ?? null, date);
  /** 자동 판정 — 경계 이전 새벽 시각이면 달력상 영업일 +1일 (서버 판정과 같은 규칙). */
  const autoStartOffset = dawnStartOffset(startTime, dayBoundary);
  const startOffsetDays: number = startOffsetOverride ?? autoStartOffset;
  const startDate = addDay(date, startOffsetDays);
  const derivedEnd = endOf({ startMin: timeToMinutes(startTime), durationMin });
  const endTime = derivedEnd.time;
  const endDate = addDay(startDate, derivedEnd.offsetDays);
  /** 자동과 다른 소속을 골랐는가 (D3-3 — 막지 않고 경고만) */
  const operatingDayOverridden = startOffsetDays !== autoStartOffset;

  // Dirty check (edit 모드) + 필드별 changed 체크
  const orig = originalRef.current;
  function changed<K extends keyof NonNullable<typeof orig>>(key: K, current: NonNullable<typeof orig>[K]): boolean {
    if (mode !== "edit" || !orig) return false;
    return orig[key] !== current;
  }
  const isDirty =
    mode === "edit" && orig !== null && (
      orig.userId !== userId ||
      orig.storeId !== modalStoreId ||
      orig.date !== date ||
      orig.startOffset !== startOffsetDays ||
      orig.startTime !== startTime ||
      orig.durationMin !== durationMin ||
      orig.breakStart !== breakStart ||
      orig.breakEnd !== breakEnd ||
      orig.splitEnabled !== splitEnabled ||
      orig.workRoleId !== workRoleId ||
      orig.notes !== notes ||
      orig.hourlyRate !== hourlyRateInput
    );

  // Cancel/ESC/backdrop 공통 close 경로 — dirty면 확인 먼저
  async function tryClose(): Promise<void> {
    if (!isDirty) { onClose(); return; }
    const ok = await modal.confirm({
      title: "Discard changes?",
      message: "You have unsaved changes in this schedule. Close without saving?",
      confirmLabel: "Discard",
      variant: "danger",
    });
    if (ok) onClose();
  }

  // ESC key handling
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        void tryClose();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isDirty]);

  const validateSchedule = useValidateSchedule();

  if (!open) return null;

  const selectedUser = users.find((u) => u.id === userId);
  // 변경된 필드에 accent border + 살짝 배경 — add 모드엔 영향 없음
  const changedCls = "border-[var(--color-accent)] bg-[var(--color-accent-muted)]";

  // ─── 시작 / 종료 / 길이 (D5-2) ─────────────────────────
  // 규칙표는 lib/scheduleTime 의 withStart/withEnd/withDuration 하나뿐.
  // **시작은 어떤 경우에도 자동으로 움직이지 않는다.**
  const shiftFields = { startMin: timeToMinutes(startTime), durationMin };

  function applyShift(next: { startMin: number; durationMin: number }) {
    timeDirtyRef.current = true;
    setStartTime(minutesToTime(next.startMin));
    setDurationMin(next.durationMin);
  }

  /** 시작 변경 — 길이 유지, 종료가 따라 이동. 휴게도 같은 오프셋으로 동반 이동(B2). */
  function onChangeStart(v: string) {
    const delta = timeToMinutes(v) - shiftFields.startMin;
    applyShift(withStart(shiftFields, timeToMinutes(v)));
    // 손대지도 않은 휴게가 근무창 밖으로 남아 저장이 거부되는 데드락을 막는다.
    // 원치 않으면 휴게를 지우고 다시 넣으면 된다(B4).
    if (splitEnabled && delta !== 0) {
      if (breakStart) setBreakStart(minutesToTime(timeToMinutes(breakStart) + delta));
      if (breakEnd) setBreakEnd(minutesToTime(timeToMinutes(breakEnd) + delta));
    }
  }
  /** 종료 변경 — 시작 유지, 길이 재계산. */
  function onChangeEnd(v: string) {
    applyShift(withEnd(shiftFields, timeToMinutes(v)));
  }
  /** 길이 변경 — 시작 유지, 종료가 따라 이동. */
  function onChangeDuration(mins: number) {
    applyShift(withDuration(shiftFields, Math.max(0, Math.min(1440, mins))));
  }
  // 영업일(Operating day)을 옮기면 시작 달력일도 함께 간다 — 소속 오프셋이 영업일 기준이라
  // 별도 보정이 필요 없다(예전엔 start/end 달력일을 따로 밀어야 했다).
  function onChangeOperatingDay(v: string) {
    setDate(v);
  }
  function onChangeBreakStart(v: string) {
    breakDirtyRef.current = true;
    setBreakStart(v);
  }
  function onChangeBreakEnd(v: string) {
    breakDirtyRef.current = true;
    setBreakEnd(v);
  }

  // Split 토글
  function onToggleSplit(checked: boolean) {
    setSplitEnabled(checked);
    if (checked) {
      // 체크 시: 현재 break가 비어있거나 start/end 범위 밖이면 자동 계산
      const sMin = timeToMinutes(startTime);
      const eMin = timeToMinutes(endTime);
      const hasValidBreak =
        breakStart && breakEnd &&
        timeToMinutes(breakStart) >= sMin &&
        timeToMinutes(breakEnd) <= eMin &&
        timeToMinutes(breakStart) < timeToMinutes(breakEnd);
      if (!hasValidBreak) {
        const auto = computeAutoBreak(startTime, endTime, defaultBreakMin);
        if (auto) {
          // 자동 계산 값만 스냅한다 — 사용자가 직접 넣은 값은 반올림하지 않고 거절(검증에서).
          setBreakStart(snapToStep(auto.start));
          setBreakEnd(snapToStep(auto.end));
          breakDirtyRef.current = false; // 자동 계산은 dirty 아님
        }
      }
    }
  }

  // 파생 값: 길이는 상태 그대로. 종료가 파생이라 "end < start" 라는 상태 자체가 존재하지 않는다.
  const shiftTotalMin = durationMin;
  const overnightShift = derivedEnd.offsetDays > 0;
  const breakMinutes = splitEnabled && breakStart && breakEnd
    ? durationMinutes(breakStart, breakEnd)
    : 0;
  const totalWorkMinutes = Math.max(0, shiftTotalMin - breakMinutes);

  // Validation — 서버 검증(D9)의 앞단 미러. 문구는 서버 코드와 같은 뜻으로 유지한다.
  const gridText = `${SCHEDULE_STEP_MINUTES}-minute increments`;
  const validationError: string | null = (() => {
    if (shiftTotalMin === 0) return "The shift is 0 minutes long. Set a duration or an end time.";
    if (shiftTotalMin > 1440) return "Shift cannot exceed 24 hours."; // safety
    // 입력 단위 강제 — 반올림하지 않고 reject. 키보드로 :07 등 입력 시 차단.
    if (!isOnScheduleGrid(startTime) || !isOnScheduleGrid(endTime) || durationMin % SCHEDULE_STEP_MINUTES !== 0) {
      return `Start, end and duration must be in ${gridText}.`;
    }
    if (splitEnabled) {
      if (!breakStart || !breakEnd) return "Break times required when split is enabled.";
      if (breakStart === breakEnd) return "Break start and end cannot be the same.";
      if (!isOnScheduleGrid(breakStart) || !isOnScheduleGrid(breakEnd)) return `Break times must be in ${gridText}.`;
      if (breakMinutes >= shiftTotalMin) return "Break cannot be longer than shift.";
    }
    return null;
  })();

  function buildPayload(force: boolean): ScheduleEditPayload {
    let hourlyRate: number | null;
    if (!showCost) {
      // SV/Staff: hourly_rate 편집 권한 없음 → 기존 값 유지 (schedule의 stored 그대로)
      hourlyRate = schedule?.hourly_rate ?? null;
    } else {
      const trimmed = hourlyRateInput.trim();
      const parsedRate = trimmed === "" ? null : Number(trimmed);
      hourlyRate = parsedRate != null && Number.isFinite(parsedRate) && parsedRate > 0 ? parsedRate : null;
    }
    // 벽시계 datetime 인코딩 — 명시 start/end 달력일 + 시각 (공용 헬퍼로 조립).
    const bStart = splitEnabled && breakStart ? breakStart : null;
    const bEnd = splitEnabled && breakEnd ? breakEnd : null;
    const iso = shiftIsoFields(date, startDate, startTime, endDate, endTime, bStart, bEnd);
    return {
      userId,
      storeId: effectiveStoreId,
      date,
      startTime,
      endTime,
      breakStartTime: bStart,
      breakEndTime: bEnd,
      workRoleId: workRoleId || null,
      notes,
      hourlyRate,
      force,
      operatingDay: iso.operating_day,
      startAt: iso.start_at,
      endAt: iso.end_at,
      breakStartAt: iso.break_start_at,
      breakEndAt: iso.break_end_at,
    };
  }

  async function handleSave() {
    if (validationError) return;
    const payload = buildPayload(false);
    // Preflight validate — overtime/max_shift_hours 같은 warning 은 저장 전에 사용자 확인.
    try {
      const res = await validateSchedule.mutateAsync({
        user_id: payload.userId,
        store_id: payload.storeId,
        work_date: payload.date,
        start_time: payload.startTime,
        end_time: payload.endTime,
        break_start_time: payload.breakStartTime,
        break_end_time: payload.breakEndTime,
        // 신 인코딩 동시 전송 — 서버 프리플라이트가 실제 instant(새벽근무 +1d) 기준으로
        // 경고(경계 초과 등)/겹침을 계산하도록
        operating_day: payload.operatingDay,
        start_at: payload.startAt,
        end_at: payload.endAt,
        break_start_at: payload.breakStartAt,
        break_end_at: payload.breakEndAt,
        work_role_id: payload.workRoleId,
        hourly_rate: payload.hourlyRate,
        note: payload.notes || null,
      });
      if (res.warnings.length > 0) {
        // 문구는 code + params 로 클라가 구성한다 — 서버 message 를 그대로 붙이거나
        // 문자열을 매칭하지 않는다(D9-4).
        const ok = await modal.confirm({
          title: "Confirm schedule",
          message: describeScheduleIssues(res.warnings),
          confirmLabel: "Save anyway",
          variant: "danger",
        });
        if (ok) onSave({ ...payload, force: true });
        return;
      }
    } catch {
      // 프리뷰는 항상 200 이라 여기 오면 네트워크/권한 문제다. 경고 없이 진행하고
      // 저장 경로의 400/409 가 최종 판정을 한다 (저장 측에 확인 흐름이 따로 있다).
    }
    onSave(payload);
  }

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
      {/* Backdrop: 입력/수정 폼이라 클릭으로 닫히지 않음 (우발적 변경 분실 방지) */}
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative bg-[var(--color-surface)] rounded-2xl shadow-[0_16px_48px_rgba(0,0,0,0.2)] w-full max-w-md max-h-[90vh] flex flex-col">
        {/* Header (sticky) */}
        <div className="shrink-0 px-5 py-4 border-b border-[var(--color-border)] flex items-center justify-between">
          <h2 className="text-[15px] font-bold text-[var(--color-text)]">
            {mode === "add" ? "Add Schedule" : "Edit Schedule"}
          </h2>
          <button
            type="button"
            onClick={tryClose}
            className="w-8 h-8 rounded-lg hover:bg-[var(--color-surface-hover)] flex items-center justify-center text-[var(--color-text-muted)]"
            aria-label="Close"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <line x1="4" y1="4" x2="12" y2="12" /><line x1="12" y1="4" x2="4" y2="12" />
            </svg>
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto">
        {/* Inline error banner (서버 검증 실패) */}
        {errorMessage && (
          <div className="mx-5 mt-4 px-3 py-2.5 rounded-lg border border-[var(--color-danger)] bg-[var(--color-danger-muted)] flex items-start gap-2">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="text-[var(--color-danger)] shrink-0 mt-0.5">
              <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
              <line x1="8" y1="5" x2="8" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <circle cx="8" cy="11.5" r="0.8" fill="currentColor" />
            </svg>
            <div className="flex-1 text-[12px] text-[var(--color-danger)] leading-relaxed">{errorMessage}</div>
            {onDismissError && (
              <button
                type="button"
                onClick={onDismissError}
                className="text-[var(--color-danger)] opacity-60 hover:opacity-100 shrink-0"
                aria-label="Dismiss error"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                  <line x1="4" y1="4" x2="12" y2="12" /><line x1="12" y1="4" x2="4" y2="12" />
                </svg>
              </button>
            )}
          </div>
        )}

        {/* Form */}
        <div className="px-5 py-4 space-y-3.5">
          {/* Operating day (operating_day) — 이 근무가 표시/집계되는 영업일. 실제 시각은 Start/End. */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-1.5">Operating day</label>
            <input
              type="date"
              value={date}
              onChange={(e) => onChangeOperatingDay(e.target.value)}
              className={`w-full px-3 py-2 border rounded-lg text-[13px] bg-[var(--color-surface)] ${changed("date", date) ? changedCls : "border-[var(--color-border)]"}`}
            />
          </div>

          {/* Staff */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-1.5">Staff</label>
            <div className="flex items-center gap-2">
              {selectedUser && (
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${rolePriorityToColor(selectedUser.role_priority)}`}>
                  {getInitials(selectedUser.full_name)}
                </div>
              )}
              <select
                value={userId}
                onChange={(e) => { setUserId(e.target.value); }}
                className={`flex-1 px-3 py-2 border rounded-lg text-[13px] bg-[var(--color-surface)] ${changed("userId", userId) ? changedCls : "border-[var(--color-border)]"}`}
              >
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.full_name || u.username}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Store — staff의 Work 체크된 store만 노출. 0이면 명시적 경고 */}
          {needsStoreSelector ? (
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-1.5">Store</label>
              <select
                value={modalStoreId}
                onChange={(e) => { setModalStoreId(e.target.value); setWorkRoleId(""); }}
                className={`w-full px-3 py-2 border rounded-lg text-[13px] bg-[var(--color-surface)] ${changed("storeId", modalStoreId) ? changedCls : "border-[var(--color-border)]"}`}
              >
                {availableStores.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          ) : userId && stores && stores.length > 0 ? (
            <div className="rounded border border-[var(--color-warning)] bg-[var(--color-warning-muted)] px-3 py-2 text-[12px] text-[var(--color-warning)]">
              No eligible stores for this staff. Enable &ldquo;Work&rdquo; in the staff&apos;s store assignments first.
            </div>
          ) : null}

          {/* Work Role */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-1.5">Work Role</label>
            <select
              value={workRoleId}
              onChange={(e) => onChangeWorkRole(e.target.value)}
              className={`w-full px-3 py-2 border rounded-lg text-[13px] bg-[var(--color-surface)] ${changed("workRoleId", workRoleId) ? changedCls : "border-[var(--color-border)]"}`}
            >
              <option value="">— None (no role) —</option>
              {workRolesQ.isLoading && <option disabled>Loading…</option>}
              {workRoles.map((wr) => (
                <option key={wr.id} value={wr.id}>{workRoleLabel(wr)}</option>
              ))}
            </select>
            {workRoles.length === 0 && !workRolesQ.isLoading && (
              <p className="text-[11px] text-[var(--color-text-muted)] mt-1">
                No work roles defined for this store yet. Add some in Schedule Settings.
              </p>
            )}
          </div>

          {/* Time — single or split (2 segments) */}
          {!splitEnabled ? (
            <div>
              {/* 시작 / 길이 / 종료 3필드 (D5-2). 종료는 파생이지만 직접 입력도 받는다 —
                  입력하면 길이가 재계산될 뿐 시작은 움직이지 않는다. */}
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-1.5">Start</label>
                  <TimeSelect
                    value={startTime}
                    onChange={onChangeStart}
                    className={`w-full px-2 py-2 border rounded-lg text-[13px] bg-[var(--color-surface)] ${changed("startTime", startTime) ? changedCls : "border-[var(--color-border)]"}`}
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-1.5">Length</label>
                  <div className={`flex items-center gap-1 px-2 py-2 border rounded-lg bg-[var(--color-surface)] ${changed("durationMin", durationMin) ? changedCls : "border-[var(--color-border)]"}`}>
                    <input
                      type="number"
                      min={SCHEDULE_STEP_MINUTES}
                      max={1440}
                      step={SCHEDULE_STEP_MINUTES}
                      value={durationMin}
                      onChange={(e) => onChangeDuration(Number(e.target.value))}
                      className="w-full min-w-0 text-[13px] bg-transparent outline-none tabular-nums"
                      aria-label="Shift length in minutes"
                    />
                    <span className="text-[11px] text-[var(--color-text-muted)] shrink-0">min</span>
                  </div>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-1.5">
                    End {overnightShift && <span className="text-[var(--color-warning)] normal-case font-bold" title="Ends the next day">+1</span>}
                  </label>
                  <TimeSelect
                    value={endTime}
                    onChange={onChangeEnd}
                    className="w-full px-2 py-2 border border-[var(--color-border)] rounded-lg text-[13px] bg-[var(--color-surface)]"
                  />
                </div>
              </div>
              {/* 절대날짜 라이브 피드백 (2026-05-29 결정) — 저장될 실제 구간을 즉시 확인.
                  자정 넘김은 `+1` 마커로만 표기한다(26:00 같은 24 초과 표기 금지 — D2-8). */}
              <div className="mt-1.5 text-[12px] text-[var(--color-text-secondary)]">
                → {fmtFeedbackDate(startDate)} {startTime} – {formatWallClock(endTime, derivedEnd.offsetDays)}
                {" "}({fmtDuration(shiftTotalMin)})
              </div>
              {/* 영업일 소속 (D3-3) — 자동 판정이 기본, 필요하면 뒤집는다. */}
              <div className="mt-2 flex items-start gap-2 text-[11px]">
                <div className="flex-1 text-[var(--color-text-muted)]">
                  Starts on <strong className="text-[var(--color-text-secondary)]">{fmtFeedbackDate(startDate)}</strong>
                  {startOffsetDays === 1 ? " (day after the operating day)" : " (the operating day)"}
                  {" · "}day starts at {dayBoundary}
                </div>
                <button
                  type="button"
                  onClick={() => setStartOffsetOverride(startOffsetDays === 1 ? 0 : 1)}
                  className="shrink-0 font-semibold text-[var(--color-accent)] hover:underline"
                >
                  {startOffsetDays === 1 ? "Use operating day" : "Use next day"}
                </button>
              </div>
              {operatingDayOverridden && (
                <div className="mt-1 text-[11px] text-[var(--color-warning)]">
                  This differs from the automatic result ({autoStartOffset === 1 ? "day after the operating day" : "the operating day"}). The server will flag it when saving.
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-1.5">Segment 1 Start</label>
                  <TimeSelect
                    value={startTime}
                    onChange={onChangeStart}
                    className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg text-[13px] bg-[var(--color-surface)]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-1.5">Segment 1 End</label>
                  <TimeSelect
                    value={breakStart}
                    onChange={onChangeBreakStart}
                    className={`w-full px-3 py-2 border rounded-lg text-[13px] bg-[var(--color-surface)] ${changed("breakStart", breakStart) ? changedCls : "border-[var(--color-border)]"}`}
                  />
                </div>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-[var(--color-text-muted)] pl-1">
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <path d="M3 8h10M11 5l3 3-3 3" />
                </svg>
                Break {breakMinutes > 0 ? `· ${breakMinutes}min` : ""}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-1.5">Segment 2 Start</label>
                  <TimeSelect
                    value={breakEnd}
                    onChange={onChangeBreakEnd}
                    className={`w-full px-3 py-2 border rounded-lg text-[13px] bg-[var(--color-surface)] ${changed("breakEnd", breakEnd) ? changedCls : "border-[var(--color-border)]"}`}
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-1.5">
                    Segment 2 End {overnightShift && <span className="text-[var(--color-warning)] normal-case font-bold" title="Ends the next day">+1</span>}
                  </label>
                  <TimeSelect
                    value={endTime}
                    onChange={onChangeEnd}
                    className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg text-[13px] bg-[var(--color-surface)]"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Split toggle + summary */}
          <div className="flex items-center justify-between">
            <label className="inline-flex items-center gap-2 text-[12px] text-[var(--color-text-secondary)] select-none cursor-pointer">
              <input
                type="checkbox"
                checked={splitEnabled}
                onChange={(e) => onToggleSplit(e.target.checked)}
                className="w-3.5 h-3.5 accent-[var(--color-accent)]"
              />
              Split with break
            </label>
            {splitEnabled && totalWorkMinutes > 0 && (
              <span className="text-[11px] text-[var(--color-text-muted)] tabular-nums">
                Work {Math.floor(totalWorkMinutes / 60)}h {totalWorkMinutes % 60}m · Break {breakMinutes}m
              </span>
            )}
          </div>

          {validationError && (
            <div className="text-[11px] text-[var(--color-danger)] bg-[var(--color-danger-muted)] px-2.5 py-1.5 rounded-md">
              {validationError}
            </div>
          )}

          {/* Hourly Rate (override) — GM/Owner only */}
          {showCost && (
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-1.5">
              Hourly Rate <span className="text-[var(--color-text-muted)] normal-case font-normal">(stored on this schedule)</span>
            </label>
            <div className="flex items-center gap-2">
              <div className={`flex items-center flex-1 px-3 py-2 border rounded-lg bg-[var(--color-surface)] focus-within:border-[var(--color-accent)] ${changed("hourlyRate", hourlyRateInput) ? changedCls : "border-[var(--color-border)]"}`}>
                <span className="text-[13px] text-[var(--color-text-muted)] mr-1">$</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={hourlyRateInput}
                  onChange={(e) => setHourlyRateInput(e.target.value)}
                  placeholder={
                    inheritedRate != null
                      ? inheritedRateSource
                        ? `${inheritedRate} (from ${inheritedRateSource})`
                        : `${inheritedRate} (current default)`
                      : "No rate"
                  }
                  className="flex-1 text-[13px] outline-none bg-transparent tabular-nums"
                />
                <span className="text-[11px] text-[var(--color-text-muted)] ml-1">/hr</span>
              </div>
              {inheritedRate != null && (
                <button
                  type="button"
                  onClick={() => setHourlyRateInput(String(inheritedRate))}
                  className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-[var(--color-accent-muted)] text-[var(--color-accent)] hover:bg-[var(--color-accent)] hover:text-white transition-colors whitespace-nowrap"
                  title={inheritedRateSource ? `Sync to ${inheritedRateSource} default` : "Sync to current cascade rate"}
                >
                  Sync ${inheritedRate}
                </button>
              )}
            </div>
            <p className="text-[10px] text-[var(--color-text-muted)] mt-1">
              {inheritedRate != null
                ? inheritedRateSource
                  ? `Leave empty to inherit from ${inheritedRateSource} default ($${inheritedRate}).`
                  : `Leave empty to inherit the current default ($${inheritedRate}).`
                : "No rate configured at any level — cost will be $0 until one is set."}
            </p>
          </div>
          )}

          {/* Status (read-only display) — 전환은 detail의 action 버튼으로 */}
          {mode === "edit" && schedule && (
            <div>
              <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-1.5">Status</label>
              <div className="flex items-center gap-2">
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold ${
                  schedule.status === "confirmed" ? "bg-[var(--color-success-muted)] text-[var(--color-success)]" :
                  schedule.status === "requested" ? "bg-[var(--color-warning-muted)] text-[var(--color-warning)]" :
                  schedule.status === "rejected"  ? "bg-[var(--color-danger-muted)] text-[var(--color-danger)]" :
                  schedule.status === "cancelled" ? "bg-[var(--color-bg)] text-[var(--color-text-muted)]" :
                                                    "bg-[var(--color-bg)] text-[var(--color-text-muted)]"
                }`}>
                  <span className={`w-1.5 h-1.5 rounded-full ${
                    schedule.status === "confirmed" ? "bg-[var(--color-success)]" :
                    schedule.status === "requested" ? "bg-[var(--color-warning)]" :
                    schedule.status === "rejected"  ? "bg-[var(--color-danger)]" :
                                                      "bg-[var(--color-text-muted)]"
                  }`} />
                  {schedule.status}
                </span>
                <span className="text-[10px] text-[var(--color-text-muted)]">
                  Use action buttons to change status
                </span>
              </div>
            </div>
          )}

          {/* Notes */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-1.5">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add any notes about this shift..."
              className={`w-full min-h-[60px] px-3 py-2 text-[12px] border rounded-lg resize-none focus:outline-none focus:border-[var(--color-accent)] ${changed("notes", notes) ? changedCls : "border-[var(--color-border)]"}`}
            />
          </div>
        </div>

        </div>
        {/* Footer (sticky) */}
        <div className="shrink-0 px-5 py-4 border-t border-[var(--color-border)] flex items-center gap-2 bg-[var(--color-surface)]">
          {mode === "edit" && schedule && onDeleted && (
            <button
              type="button"
              onClick={handleDeleteClick}
              className="px-3.5 py-2 rounded-lg text-[12px] font-semibold text-[var(--color-danger)] hover:bg-[var(--color-danger-muted)]"
            >
              Delete
            </button>
          )}
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={tryClose}
              className="px-4 py-2 rounded-lg text-[13px] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving || !!validationError}
              className="px-4 py-2 rounded-lg text-[13px] font-semibold bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>

      {/* Discard / warning confirm 은 useModal imperative API 로 inline 처리됨 */}
    </div>
  );
}
