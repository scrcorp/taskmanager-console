"use client";

/**
 * ScheduleEditModal — server types 직접 사용. mockup type 의존 없음.
 */

import { useState, useEffect, useRef, useMemo } from "react";
import { useWorkRoles } from "@/hooks/useWorkRoles";
import { ConfirmDialog } from "./ConfirmDialog";
import { useUserStores } from "@/hooks/useUsers";
import { useResolveSetting } from "@/hooks/useSettings";
import { useValidateSchedule } from "@/hooks/useSchedules";
import { useAuthStore } from "@/stores/authStore";
import { todayInTimezone } from "@/lib/utils";
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
  onDelete?: () => void;
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
function timeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function minutesToTime(mins: number): string {
  const h = Math.floor(((mins % 1440) + 1440) % 1440 / 60);
  const m = ((mins % 60) + 60) % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** start→end 사이 분수 (overnight: end < start일 때 +24h 자동 처리). */
function durationMinutes(startHHMM: string, endHHMM: string): number {
  const s = timeToMinutes(startHHMM);
  const e = timeToMinutes(endHHMM);
  return e > s ? e - s : 1440 - s + e; // overnight wrap
}

/** end < start 인 overnight 여부 */
function isOvernight(startHHMM: string, endHHMM: string): boolean {
  return timeToMinutes(endHHMM) <= timeToMinutes(startHHMM);
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

export function ScheduleEditModal({ open, mode, schedule, prefilledUserId, prefilledDate, prefilledStartTime, users, storeId, stores, selectedStoreIds, inheritedRate, inheritedRateSource, showCost = true, errorMessage, onDismissError, onClose, onSave, onDelete, isSaving }: Props) {
  // 매장 또는 조직 timezone 기준으로 "오늘" 계산 — DB가 UTC라 toISOString()을 쓰면 미국 저녁이 다음날로 잡힘.
  const orgTimezone = useAuthStore((s) => s.user?.organization_timezone) ?? undefined;
  const initialStore = stores?.find((s) => s.id === storeId);
  const initialTz = initialStore?.timezone ?? orgTimezone;
  const [userId, setUserId] = useState(prefilledUserId || users[0]?.id || "");
  const [date, setDate] = useState(prefilledDate || todayInTimezone(initialTz));
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [splitEnabled, setSplitEnabled] = useState(false);
  const [breakStart, setBreakStart] = useState("");
  const [breakEnd, setBreakEnd] = useState("");
  const [workRoleId, setWorkRoleId] = useState<string>("");
  const [notes, setNotes] = useState("");
  // hourly rate input as string ("" = clear/null)
  const [hourlyRateInput, setHourlyRateInput] = useState<string>("");
  // Discard confirmation (dirty & 닫기 시도 시)
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  // Edit 모드 원본 값 스냅샷 — 변경 여부 비교용
  const originalRef = useRef<{
    userId: string; storeId: string; date: string;
    startTime: string; endTime: string;
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

  // dirty flags: 사용자가 직접 편집했는지. true면 work role 변경시 auto-prefill 안 함.
  const timeDirtyRef = useRef(false);
  const endTimeDirtyRef = useRef(false); // end만 별도로 편집했는지
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
    endTimeDirtyRef.current = false;
    breakDirtyRef.current = false;
    if (mode === "edit" && schedule) {
      // edit 모드: shift의 store/work_role을 정확히 반영 (그리드 필터값 무시)
      const initStore = schedule.store_id;
      const initUser = schedule.user_id;
      const initDate = schedule.work_date;
      const initStart = schedule.start_time?.slice(0, 5) ?? "09:00";
      const initEnd = schedule.end_time?.slice(0, 5) ?? "17:00";
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
      setEndTime(initEnd);
      setSplitEnabled(hasBreak);
      setBreakStart(initBreakStart);
      setBreakEnd(initBreakEnd);
      setWorkRoleId(initRole);
      setNotes(initNotes);
      setHourlyRateInput(initRate);
      // 변경 감지용 스냅샷
      originalRef.current = {
        userId: initUser, storeId: initStore, date: initDate,
        startTime: initStart, endTime: initEnd,
        breakStart: initBreakStart, breakEnd: initBreakEnd, splitEnabled: hasBreak,
        workRoleId: initRole, notes: initNotes, hourlyRate: initRate,
      };
    } else if (mode === "add") {
      setModalStoreId(storeId || availableStores[0]?.id || stores?.[0]?.id || "");
      setUserId(prefilledUserId || users[0]?.id || "");
      setDate(prefilledDate || todayInTimezone(stores?.find((s) => s.id === (modalStoreId || storeId))?.timezone ?? orgTimezone));
      const initStart = prefilledStartTime || "09:00";
      setStartTime(initStart);
      setEndTime(minutesToTime(timeToMinutes(initStart) + defaultShiftMin));
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
    // time: 사용자가 수정 안 했을 때만
    if (!timeDirtyRef.current && wr.default_start_time && wr.default_end_time) {
      setStartTime(wr.default_start_time.slice(0, 5));
      setEndTime(wr.default_end_time.slice(0, 5));
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
      orig.startTime !== startTime ||
      orig.endTime !== endTime ||
      orig.breakStart !== breakStart ||
      orig.breakEnd !== breakEnd ||
      orig.splitEnabled !== splitEnabled ||
      orig.workRoleId !== workRoleId ||
      orig.notes !== notes ||
      orig.hourlyRate !== hourlyRateInput
    );

  // Cancel/ESC/backdrop 공통 close 경로 — dirty면 확인 먼저
  function tryClose() {
    if (isDirty) setConfirmDiscard(true);
    else onClose();
  }

  // ESC key handling
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !confirmDiscard) {
        e.preventDefault();
        tryClose();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isDirty, confirmDiscard]);

  const validateSchedule = useValidateSchedule();
  const [warningPrompt, setWarningPrompt] = useState<{ warnings: string[]; payload: ScheduleEditPayload } | null>(null);

  if (!open) return null;

  const selectedUser = users.find((u) => u.id === userId);
  // 변경된 필드에 accent border + 살짝 배경 — add 모드엔 영향 없음
  const changedCls = "border-[var(--color-accent)] bg-[var(--color-accent-muted)]";

  // 핸들러들 — 사용자 편집 시 dirty flag 세팅
  function onChangeStart(v: string) {
    timeDirtyRef.current = true;
    setStartTime(v);
    // end를 아직 직접 편집 안 했으면 start + defaultShiftMin로 자동 이동
    if (!endTimeDirtyRef.current) {
      setEndTime(minutesToTime(timeToMinutes(v) + defaultShiftMin));
    }
  }
  function onChangeEnd(v: string) {
    timeDirtyRef.current = true;
    endTimeDirtyRef.current = true;
    setEndTime(v);
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
          setBreakStart(auto.start);
          setBreakEnd(auto.end);
          breakDirtyRef.current = false; // 자동 계산은 dirty 아님
        }
      }
    }
  }

  // 파생 값: 구간 계산 (overnight 대응)
  const shiftTotalMin = durationMinutes(startTime, endTime);
  const overnightShift = isOvernight(startTime, endTime);
  const breakMinutes = splitEnabled && breakStart && breakEnd
    ? durationMinutes(breakStart, breakEnd)
    : 0;
  const totalWorkMinutes = Math.max(0, shiftTotalMin - breakMinutes);

  // Validation
  const validationError: string | null = (() => {
    if (startTime === endTime) return "Start and end time cannot be the same.";
    if (shiftTotalMin > 1440 - 1) return "Shift cannot exceed 24 hours."; // safety
    if (splitEnabled) {
      if (!breakStart || !breakEnd) return "Break times required when split is enabled.";
      if (breakStart === breakEnd) return "Break start and end cannot be the same.";
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
    return {
      userId,
      storeId: effectiveStoreId,
      date,
      startTime,
      endTime,
      breakStartTime: splitEnabled && breakStart ? breakStart : null,
      breakEndTime: splitEnabled && breakEnd ? breakEnd : null,
      workRoleId: workRoleId || null,
      notes,
      hourlyRate,
      force,
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
        work_role_id: payload.workRoleId,
        hourly_rate: payload.hourlyRate,
        note: payload.notes || null,
      });
      if (res.warnings.length > 0) {
        setWarningPrompt({ warnings: res.warnings, payload });
        return;
      }
    } catch {
      // validate 엔드포인트 자체가 실패하면 경고 없이 진행 (서버가 실제 저장 시점에 errors 반환)
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
          {/* Date */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-1.5">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
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
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-1.5">Start</label>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => onChangeStart(e.target.value)}
                  className={`w-full px-3 py-2 border rounded-lg text-[13px] bg-[var(--color-surface)] ${changed("startTime", startTime) ? changedCls : "border-[var(--color-border)]"}`}
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-1.5">
                  End {overnightShift && <span className="text-[var(--color-warning)] normal-case font-bold">+1d</span>}
                </label>
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => onChangeEnd(e.target.value)}
                  className={`w-full px-3 py-2 border rounded-lg text-[13px] bg-[var(--color-surface)] ${changed("endTime", endTime) ? changedCls : "border-[var(--color-border)]"}`}
                />
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-1.5">Segment 1 Start</label>
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => onChangeStart(e.target.value)}
                    className="w-full px-3 py-2 border border-[var(--color-border)] rounded-lg text-[13px] bg-[var(--color-surface)]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-1.5">Segment 1 End</label>
                  <input
                    type="time"
                    value={breakStart}
                    onChange={(e) => onChangeBreakStart(e.target.value)}
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
                  <input
                    type="time"
                    value={breakEnd}
                    onChange={(e) => onChangeBreakEnd(e.target.value)}
                    className={`w-full px-3 py-2 border rounded-lg text-[13px] bg-[var(--color-surface)] ${changed("breakEnd", breakEnd) ? changedCls : "border-[var(--color-border)]"}`}
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-1.5">
                    Segment 2 End {overnightShift && <span className="text-[var(--color-warning)] normal-case font-bold">+1d</span>}
                  </label>
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => onChangeEnd(e.target.value)}
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
          {mode === "edit" && onDelete && (
            <button
              type="button"
              onClick={onDelete}
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

      {/* Discard confirmation — dirty 상태에서 backdrop/ESC/Cancel 시도 시 */}
      <ConfirmDialog
        open={confirmDiscard}
        title="Discard changes?"
        message="You have unsaved changes in this schedule. Close without saving?"
        confirmLabel="Discard"
        confirmVariant="danger"
        onConfirm={() => {
          setConfirmDiscard(false);
          onClose();
        }}
        onCancel={() => setConfirmDiscard(false)}
      />

      {/* Overtime / max-shift-hours 경고 — 저장 전 최종 확인 */}
      <ConfirmDialog
        open={warningPrompt !== null}
        title="Confirm schedule"
        message={warningPrompt ? warningPrompt.warnings.join("\n") : ""}
        confirmLabel="Save anyway"
        confirmVariant="danger"
        onConfirm={() => {
          if (warningPrompt) {
            const forced: ScheduleEditPayload = { ...warningPrompt.payload, force: true };
            onSave(forced);
          }
          setWarningPrompt(null);
        }}
        onCancel={() => setWarningPrompt(null)}
      />
    </div>
  );
}
