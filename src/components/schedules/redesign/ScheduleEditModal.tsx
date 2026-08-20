"use client";

/**
 * ScheduleEditModal — server types 직접 사용. mockup type 의존 없음.
 */

import { useState, useEffect, useRef, useMemo } from "react";
import { useWorkRoles } from "@/hooks/useWorkRoles";
import { useUserStores } from "@/hooks/useUsers";
import { useResolveSetting } from "@/hooks/useSettings";
import { useValidateSchedule, useDeleteScheduleFlow } from "@/hooks/useSchedules";
import { useModal, useModalDepth } from "@/components/ui/imperative-modal";
import { StaffPicker } from "./StaffPicker";
import { useAuthStore } from "@/stores/authStore";
import { todayInTimezone } from "@/lib/utils";
import {
  addDay, dayDiff, shiftIsoFields, timeToMin,
  SCHEDULE_STEP_MINUTES, isOnScheduleGrid, snapToStep, wrapMinutes,
  withStart, withEnd, withDuration, endOf,
  dayBoundaryFor, storeStartOffset, autoEndOffset, durationForEndOffset, minToTime,
  START_OUTSIDE_WINDOW_TEXT,
} from "@/lib/scheduleTime";
import {
  describeScheduleIssue, describeScheduleIssues, SHIFT_SPAN_TOO_LONG,
} from "@/lib/scheduleCodes";
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
  /**
   * 시작 달력일을 **사람이 후보에서 직접 골라 자동값과 달라졌다**는 표시.
   * 이게 빠지면 서버가 START_DATE_MISMATCH(400)로 거부한다 — 옛 오프셋이 실려 오는
   * 클라 버그와 사람의 의도적 선택을 서버가 구분할 방법이 이 플래그뿐이다.
   */
  dateOverride: boolean;
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

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** "YYYY-MM-DD" → "Thu Aug 20" (날짜 후보 칩). 로컬 tz 파싱 없이 UTC 순수 날짜 산술. */
function fmtChipDate(d: string): string {
  const [y, m, dd] = d.split("-").map(Number);
  const w = WEEKDAYS[new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, dd ?? 1)).getUTCDay()];
  return `${w} ${MONTHS[(m ?? 1) - 1]} ${dd}`;
}
/** "HH:MM" → "5:00 PM" (12시간제 표기 — 시각 컨트롤과 같은 문법). */
function fmtClock12(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const hh = (h ?? 0) % 12 === 0 ? 12 : (h ?? 0) % 12;
  return `${hh}:${String(m ?? 0).padStart(2, "0")} ${(h ?? 0) < 12 ? "AM" : "PM"}`;
}
/** 저장 문장용 "Aug 20, 5:00 PM". */
function fmtStamp(date: string, time: string): string {
  return `${fmtFeedbackDate(date)}, ${fmtClock12(time)}`;
}

interface DateOption {
  date: string;
  /** 왜 이 날짜인지 — 후보 자리에서 바로 읽히게 (선택 전에 결과를 안다). */
  why: string;
  /** 자동 판정 결과인가 (AUTO 배지) */
  auto: boolean;
  selected: boolean;
  /** 고를 수 없는 후보. 지우지 않고 이유와 함께 흐리게 남긴다. */
  disabled?: boolean;
  /** 왜 고를 수 없는지 — 칩의 짧은 `why` 와 달리 전체 문장(툴팁/보조 문구). */
  disabledReason?: string;
  /** 사람이 자동값과 다른 쪽을 고른 상태 — 앰버로 표시 */
  amber?: boolean;
}

/**
 * 날짜 = **항상 펼쳐진 2-후보 세그먼트** (승인 화면 D-final-console).
 * 자유 캘린더는 없다 — 시작은 `영업일 / 영업일+1`, 종료는 `시작일 / 시작일+1` 뿐이다.
 */
/** 근무 길이 입력 — 시/분 두 칸, **숫자만**. 표기는 고정폭(`7h 00m`).
 *
 * 값을 조용히 고치지 않는다:
 *   - 24h 초과라도 잘라내지 않는다. 저장 단계에서 `SHIFT_SPAN_TOO_LONG` 로 막고 색으로 알린다
 *     (조용히 24h 로 바꾸면 입력한 값과 저장될 값이 달라진다).
 *   - 5분 배수가 아니어도 반올림하지 않는다. 마찬가지로 저장 단계에서 거절한다.
 * 편집 중에는 부모 상태를 덮어쓰지 않는다 — "7" 을 지우고 "12" 를 치는 동안 값이 튀지 않게.
 */
function DurationInput({ minutes, onChange, over }: {
  minutes: number;
  onChange: (mins: number) => void;
  over: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [h, setH] = useState("");
  const [m, setM] = useState("");

  const shownH = editing ? h : String(Math.floor(minutes / 60));
  const shownM = editing ? m : String(minutes % 60).padStart(2, "0");

  function begin() {
    if (editing) return;
    setH(String(Math.floor(minutes / 60)));
    setM(String(minutes % 60).padStart(2, "0"));
    setEditing(true);
  }
  function commit(nextH: string, nextM: string) {
    setEditing(false);
    const total = Number(nextH || 0) * 60 + Number(nextM || 0);
    if (total !== minutes) onChange(total);
  }
  const digits = (v: string) => v.replace(/[^0-9]/g, "").slice(0, 2);
  const box = `w-[2.1em] bg-transparent text-center tabular-nums font-bold text-[14px] focus:outline-none ${
    over ? "text-[var(--color-warning)]" : "text-[var(--color-text)]"
  }`;

  return (
    <span
      className={`inline-flex items-baseline gap-0.5 rounded-md border px-2 py-0.5 bg-[var(--color-surface)] ${
        over ? "border-[var(--color-warning)]" : "border-[var(--color-border)]"
      }`}
    >
      <input
        value={shownH}
        onFocus={begin}
        onChange={(e) => { begin(); setH(digits(e.target.value)); }}
        onBlur={(e) => commit(digits(e.target.value), m)}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        inputMode="numeric"
        maxLength={2}
        aria-label="Length hours"
        className={box}
      />
      <span className="text-[10px] text-[var(--color-text-muted)]">h</span>
      <input
        value={shownM}
        onFocus={begin}
        onChange={(e) => { begin(); setM(digits(e.target.value)); }}
        onBlur={(e) => commit(h, digits(e.target.value))}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        inputMode="numeric"
        maxLength={2}
        aria-label="Length minutes"
        className={box}
      />
      <span className="text-[10px] text-[var(--color-text-muted)]">m</span>
    </span>
  );
}

function DateSegment({ options, onPick, disabled }: {
  options: [DateOption, DateOption];
  onPick: (index: 0 | 1) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-1 p-[3px] rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)]">
      {options.map((o, i) => (
        <button
          key={o.date}
          type="button"
          disabled={disabled || o.disabled}
          onClick={() => onPick(i as 0 | 1)}
          title={o.disabled ? (o.disabledReason ?? o.why) : undefined}
          className={`min-w-0 rounded-md px-1.5 py-1 text-left border transition-colors ${
            o.selected
              ? o.amber
                ? "border-[var(--color-warning)] bg-[var(--color-warning-muted)]"
                : "border-[var(--color-accent)] bg-[var(--color-surface)]"
              : "border-transparent hover:bg-[var(--color-surface-hover)]"
          } ${o.disabled ? "opacity-45 cursor-not-allowed" : ""}`}
        >
          <span className={`block text-[13px] font-bold tabular-nums leading-tight truncate ${
            o.selected ? "text-[var(--color-text)]" : "text-[var(--color-text-secondary)]"
          }`}>
            {fmtChipDate(o.date)}
            {o.auto && (
              <span className="ml-1 align-[1px] px-1 rounded-full border border-[var(--color-success)] text-[8px] font-extrabold tracking-wide text-[var(--color-success)]">
                AUTO
              </span>
            )}
          </span>
          <span className={`block text-[9.5px] leading-tight ${
            o.selected
              ? o.amber ? "text-[var(--color-warning)] font-semibold" : "text-[var(--color-accent)] font-semibold"
              : "text-[var(--color-text-muted)]"
          }`}>
            {o.why}
          </span>
        </button>
      ))}
    </div>
  );
}

/** 고를 값이 아니라 파생값인 날짜(휴게) — 같은 자리·같은 크기로 읽기 전용 표시. */
function ReadonlyDateCell({ date, why }: { date: string; why: string }) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-[7px]">
      <span className="block text-[13px] font-bold tabular-nums leading-tight text-[var(--color-text-secondary)] truncate">{fmtChipDate(date)}</span>
      <span className="block text-[9.5px] leading-tight text-[var(--color-text-muted)]">{why}</span>
    </div>
  );
}

/** 끝점 한 줄 = [ DATE ][ TIME ]. 날짜가 왼쪽 첫 칸이고 폭이 더 넓다(배치 계약). */
function EndpointRow({ caption, hint, tone, date, time }: {
  caption: string;
  hint?: string;
  tone?: "shifted" | "flagged";
  date: React.ReactNode;
  time: React.ReactNode;
}) {
  return (
    <div className={`rounded-lg border px-2.5 py-2 bg-[var(--color-surface)] ${
      tone === "flagged"
        ? "border-[var(--color-warning)]"
        : tone === "shifted"
          ? "border-[var(--color-accent)]"
          : "border-[var(--color-border)]"
    }`}>
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-[10px] font-bold uppercase tracking-[0.11em] text-[var(--color-text-muted)]">{caption}</span>
        {hint && <span className="ml-auto text-[10px] text-[var(--color-text-muted)] truncate">{hint}</span>}
      </div>
      <div className="grid grid-cols-[minmax(0,1.35fr)_minmax(0,0.65fr)] gap-2 items-start">
        <div className="min-w-0">
          <span className="block text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--color-text-muted)] mb-1">Date</span>
          {date}
        </div>
        <div className="min-w-0">
          <span className="block text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--color-text-muted)] mb-1">Time</span>
          {time}
        </div>
      </div>
    </div>
  );
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
   * 시작 달력일 선택 — `null` = 자동 판정, `0|1` = **사용자가 후보를 직접 누른** 값.
   *
   * 예전엔 모달을 열 때 저장된 오프셋을 그대로 override 로 박아 넣었다. 그러면 시각만
   * 09:00 → 17:00 으로 바꿔도 새벽조의 +1일이 그대로 남아 하루 뒤 날짜로 저장됐다 —
   * 2026-08 오염 24건의 생성 경로가 정확히 이것이다. 이제 **시각이 바뀌면 자동으로
   * 되돌아가고**, 사람이 후보를 누른 경우에만 값이 선다.
   */
  const [startDateOverride, setStartDateOverride] = useState<0 | 1 | null>(null);
  const [splitEnabled, setSplitEnabled] = useState(false);
  const [breakStart, setBreakStart] = useState("");
  const [breakEnd, setBreakEnd] = useState("");
  const [workRoleId, setWorkRoleId] = useState<string>("");
  const [notes, setNotes] = useState("");
  // hourly rate input as string ("" = clear/null)
  const [hourlyRateInput, setHourlyRateInput] = useState<string>("");
  const modal = useModal();
  const dialogDepth = useModalDepth();
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
      // 저장된 시작 달력일이 **자동 판정과 다를 때만** 명시 선택으로 되살린다.
      // 같으면 null(자동) — 그래야 시각을 고치는 순간 날짜가 규칙대로 따라온다.
      const initDayCfg = stores?.find((s2) => s2.id === initStore)?.day_start_time ?? null;
      const initAutoOffset = storeStartOffset(initStart, initDayCfg, initDate);
      setStartDateOverride(initStartOffset === initAutoOffset ? null : (initStartOffset === 1 ? 1 : 0));
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
      setStartDateOverride(prefilledStartOffsetDays === 1 ? 1 : null);
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
  const dayStartCfg = selectedStore?.day_start_time ?? null;
  /** 이 영업일의 창을 가르는 경계 — 영업일+1일의 값(서버와 같은 기준). */
  const dayBoundary = dayBoundaryFor(date, dayStartCfg);
  /** 자동 판정 — 경계 이전 시각이면 달력상 영업일 +1일 (서버 판정과 같은 규칙). */
  const autoStartOffset: 0 | 1 = storeStartOffset(startTime, dayStartCfg, date);
  const startOffsetDays: 0 | 1 = startDateOverride ?? autoStartOffset;
  const startDate = addDay(date, startOffsetDays);
  const derivedEnd = endOf({ startMin: timeToMinutes(startTime), durationMin });
  const endTime = derivedEnd.time;
  const endOffsetDays = derivedEnd.offsetDays;
  const endDate = addDay(startDate, endOffsetDays);
  /** 자동과 다른 시작 달력일을 사람이 골랐는가 → 저장 시 date_override:true */
  const startDateOverridden = startOffsetDays !== autoStartOffset;
  /** 자동과 다른 종료 달력일인가 (길이가 ±24h 튄 상태) */
  const endDateOverridden = endOffsetDays !== autoEndOffset(startTime, endTime);

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
  // 위에 confirm/alert 가 떠 있으면(dialogDepth > 0) 그쪽이 ESC 의 주인이다.
  // 여기서도 먹으면 "확인창 닫힘 + 새 확인창 push" 가 같이 일어나 영원히 안 닫힌다.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        if (dialogDepth > 0) return;
        e.preventDefault();
        void tryClose();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isDirty, dialogDepth]);

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
    // **시각이 바뀌면 날짜는 자동 판정으로 돌아간다.** 사람이 고른 값은 그 시각에 대한
    // 판단이었으므로 다른 시각에까지 눌러앉으면 안 된다(2026-08 오염의 원인).
    setStartDateOverride(null);
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
    // 상한을 1440 으로 잘라내지 않는다 — 24h 초과는 저장 차단으로 알려야지,
    // 조용히 24h 로 바꿔놓으면 사용자가 넣은 값과 저장될 값이 달라진다.
    applyShift(withDuration(shiftFields, Math.max(0, mins)));
  }
  /**
   * 시작 달력일 후보 선택.
   *
   * **자동값이 아닌 후보는 고를 수 없다** (2026-08-19 결정). 자동값과 다른 시작 달력일은
   * 예외 없이 자기 영업일 구간 밖이라 서버가 400 START_DATE_MISMATCH 로 막는다 —
   * 여기서 고를 수 있게 두면 "고를 수는 있는데 저장하면 거부" 가 된다.
   * 후보 버튼 자체가 disabled 지만, 키보드/프로그램 경로에서도 상태가 움직이지 않게 여기서도 막는다.
   *
   * NOTE: 이 가드와 아래 `startDateOverride` 상태는 **이벤트 특수근무 트랙에서 다시 열 자리**다
   * (영업일 밖 근무를 1급 개념으로 표현하게 되면 그때 통로를 되살린다). 그래서 지우지 않는다.
   */
  function pickStartDate(offset: 0 | 1) {
    if (offset !== autoStartOffset) return;
    setStartDateOverride(null);
  }
  /**
   * 종료 달력일 후보 선택 = **길이를 ±24h 옮기는 조작**.
   * 종료 달력일은 별도 상태가 아니라 길이가 표현한다(scheduleTime 주석 참조).
   */
  function pickEndDate(offset: 0 | 1) {
    const next = durationForEndOffset(startTime, endTime, offset);
    timeDirtyRef.current = true;
    setDurationMin(next);
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
  const breakMinutes = splitEnabled && breakStart && breakEnd
    ? durationMinutes(breakStart, breakEnd)
    : 0;
  const totalWorkMinutes = Math.max(0, shiftTotalMin - breakMinutes);

  // ─── 날짜 후보 (승인 화면의 2-후보 세그먼트) ─────────────
  // 시작 후보는 영업일/영업일+1, 종료 후보는 시작일/시작일+1 — 그 둘뿐이다.
  // 종료 후보에는 **그 선택의 결과 길이**를 미리 적는다: ±24h 점프가 누른 뒤가 아니라
  // 누르기 전에 보여야 한다.
  // 시작 후보 중 **자동값이 아닌 쪽은 고를 수 없다** (2026-08-19). 자동과 다른 시작 달력일은
  // 예외 없이 영업일 구간 `[day_start(D), day_start(D+1))` 밖이라 서버가 400 으로 막는다.
  // 그래도 지우지 않고 남긴다 — 두 날짜가 다 보여야 왜 그 날짜인지 이해된다(END 후보의 `over 24h` 와 같은 방식).
  const autoStartDate = addDay(date, autoStartOffset);
  const blockedStartOffset: 0 | 1 = autoStartOffset === 0 ? 1 : 0;
  const blockedStartDate = addDay(date, blockedStartOffset);
  /** 그 달력일에 정말 일하려면 바꿔야 할 값 = 영업일 (서버 `suggested_operating_day` 와 같은 식). */
  const suggestedOperatingDay = addDay(blockedStartDate, -autoStartOffset);
  /** 왜 못 고르는지 — ① 경계와 시각의 관계 ② 고르면 생기는 일 ③ 그럼 뭘 바꿔야 하는지. */
  const blockedStartReason =
    `${fmtClock12(startTime)} is ${autoStartOffset === 1 ? "before" : "at or after"} this store's business day start ` +
    `(${fmtClock12(dayBoundary)}), so this shift starts on ${fmtChipDate(autoStartDate)}. ` +
    `Dating it ${fmtChipDate(blockedStartDate)} would put the start in a different business day, ` +
    `and staff could not clock in for it. ` +
    `To run this shift on ${fmtChipDate(blockedStartDate)}, change the Operating day to ${fmtFeedbackDate(suggestedOperatingDay)}.`;

  const startDateOptions: [DateOption, DateOption] = [0, 1].map((k) => ({
    date: addDay(date, k),
    why: k === autoStartOffset
      ? (k === 0 ? "Operating day" : "+1 day · before day start")
      : "Different business day · not allowed",
    auto: k === autoStartOffset,
    selected: k === startOffsetDays,
    amber: k === startOffsetDays && startDateOverridden,
    disabled: k !== autoStartOffset,
    disabledReason: blockedStartReason,
  })) as [DateOption, DateOption];

  const autoEnd = autoEndOffset(startTime, endTime);
  const endDateOptions: [DateOption, DateOption] = [0, 1].map((k) => {
    const len = durationForEndOffset(startTime, endTime, k as 0 | 1);
    const why =
      len <= 0
        ? "Would end before the start · invalid"
        : len > 1440
          ? `${k === 1 ? "+1 day · " : ""}${fmtDuration(len)} · over 24h`
          : k === 0
            ? `Same day as start · ${fmtDuration(len)}`
            : `+1 day · ${fmtDuration(len)}`;
    return {
      date: addDay(startDate, k),
      why,
      auto: k === autoEnd,
      selected: k === endOffsetDays,
      amber: k === endOffsetDays && endDateOverridden,
      disabled: len <= 0 || len > 1440,
    };
  }) as [DateOption, DateOption];

  /** 자동 종료일이었을 때와의 길이 차이 — 날짜 하나 바꿨을 뿐인데 24h 튄 걸 같은 줄에서 보여준다. */
  const lengthDelta = shiftTotalMin - durationForEndOffset(startTime, endTime, autoEnd);

  /** 휴게 끝점의 달력일 — `shiftIsoFields` 의 앵커 규칙과 같은 식이어야 표시와 저장이 일치한다. */
  function breakDateOf(t: string): string {
    if (!t) return startDate;
    return timeToMinutes(t) < timeToMinutes(startTime) ? addDay(startDate, 1) : startDate;
  }

  // Validation — 서버 검증(D9)의 앞단 미러. 문구는 서버 코드와 같은 뜻으로 유지한다.
  const gridText = `${SCHEDULE_STEP_MINUTES}-minute increments`;
  const validationError: string | null = (() => {
    if (shiftTotalMin === 0) return "The shift is 0 minutes long. Set a duration or an end time.";
    if (shiftTotalMin > 1440) {
      // 24h 초과는 "긴 근무"가 아니라 **날짜 조립이 틀렸다**는 신호다 (서버 SHIFT_SPAN_TOO_LONG).
      // 문구는 코드 단일 출처(lib/scheduleCodes)에서 만든다 — 서버/콘솔이 같은 문장을 쓴다.
      return describeScheduleIssue({
        code: SHIFT_SPAN_TOO_LONG,
        params: {
          span_minutes: shiftTotalMin,
          start_at: `${startDate} ${startTime}`,
          end_at: `${endDate} ${endTime}`,
        },
      });
    }
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
      // 서버는 이제 `date_override`/`force` 로도 시작 달력일 불일치를 넘겨주지 않는다(400 START_DATE_MISMATCH).
      // 화면에서 자동값 아닌 후보를 고를 수 없으므로 이 값은 자연히 false 다. 보내도 무해해서 남긴다 —
      // **이벤트 특수근무 트랙에서 통로를 다시 열 자리**.
      dateOverride: startDateOverridden,
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
        // 프리플라이트도 저장과 같은 의사표시를 실어야 한다 — 안 그러면 화면에는
        // START_DATE_MISMATCH 가 뜨는데 실제 저장은 통과하는 식으로 두 판정이 갈린다.
        date_override: payload.dateOverride,
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
      <div className="relative bg-[var(--color-surface)] rounded-2xl shadow-[0_16px_48px_rgba(0,0,0,0.2)] w-full max-w-lg max-h-[90vh] flex flex-col">
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
          {/* Operating day — 이 근무가 집계되는 영업일. 달력일(Start/End)과 다를 수 있고,
              그 차이를 만드는 경계 시각을 같은 줄에 붙여 눈으로 대조하게 한다. */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-1.5">
              Operating day <span className="normal-case tracking-normal font-normal">· the business day this shift counts on</span>
            </label>
            <div className="flex items-center gap-2 flex-wrap">
              <div className={`flex items-center rounded-lg border overflow-hidden bg-[var(--color-surface)] ${changed("date", date) ? changedCls : "border-[var(--color-border)]"}`}>
                <button
                  type="button"
                  onClick={() => onChangeOperatingDay(addDay(date, -1))}
                  className="px-2.5 py-2 text-[12px] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)]"
                  aria-label="Previous operating day"
                >
                  ◀
                </button>
                <input
                  type="date"
                  value={date}
                  onChange={(e) => e.target.value && onChangeOperatingDay(e.target.value)}
                  className="px-2 py-2 text-[13px] tabular-nums font-semibold bg-transparent outline-none"
                  aria-label="Operating day"
                />
                <button
                  type="button"
                  onClick={() => onChangeOperatingDay(addDay(date, 1))}
                  className="px-2.5 py-2 text-[12px] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)]"
                  aria-label="Next operating day"
                >
                  ▶
                </button>
              </div>
              <span className="text-[11px] text-[var(--color-text-muted)] whitespace-nowrap">
                Day starts <strong className="text-[var(--color-text-secondary)] tabular-nums">{fmtClock12(dayBoundary)}</strong>
              </span>
            </div>
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
              <div className="flex-1">
                <StaffPicker
                  value={userId}
                  onChange={(id) => { setUserId(id); }}
                  eligible={users}
                  changed={changed("userId", userId)}
                  /* 영업일 기준으로 후보를 좁힌다 — 퇴사일 이후엔 그 사람이 후보가 아니다. */
                  date={date}
                  /*
                    eligible(users) 는 캘린더에서 선택된 store 범위로 걸러진 목록이다.
                    store 를 정확히 1개 보고 있을 때만 매장 이름을 붙인다 —
                    All/다중 선택 상태에서 특정 매장 이름을 쓰면 사실과 다른 라벨이 된다.
                  */
                  storeName={
                    selectedStoreIds?.length === 1
                      ? stores?.find((s) => s.id === selectedStoreIds[0])?.name
                      : undefined
                  }
                />
              </div>
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

          {/* ── Shift: 끝점 한 줄 = [ DATE ][ TIME ], Length 는 두 행 아래 (승인 화면 D-final-console) ──
              날짜는 읽기 전용 텍스트가 아니라 **항상 펼쳐진 2-후보 선택 구간**이다.
              접어두는 정보는 없다 — 영업일·경계·두 날짜·두 시각·길이가 한 화면에 있다. */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-1.5">Shift</label>
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] p-1 space-y-1">

              <EndpointRow
                caption={splitEnabled ? "Start (segment 1)" : "Start"}
                hint={autoStartOffset === 1 ? `before ${fmtClock12(dayBoundary)} → next calendar day` : undefined}
                tone={startDateOverridden ? "flagged" : startOffsetDays === 1 ? "shifted" : undefined}
                date={
                  <DateSegment
                    options={startDateOptions}
                    onPick={pickStartDate}
                  />
                }
                time={
                  <TimeSelect
                    value={startTime}
                    onChange={onChangeStart}
                    className={`w-full px-2 py-2 border rounded-lg text-[13px] bg-[var(--color-surface)] ${changed("startTime", startTime) ? changedCls : "border-[var(--color-border)]"}`}
                  />
                }
              />

              {/* 휴게가 켜지면 같은 [Date | Time] 행 문법을 그대로 반복한다 — 새 레이아웃을 만들지 않는다.
                  휴게 날짜는 고를 값이 아니라 근무 구간에서 파생되므로 읽기 전용으로 같은 자리에 둔다. */}
              {splitEnabled && (
                <>
                  <EndpointRow
                    caption="Break start"
                    date={<ReadonlyDateCell date={breakDateOf(breakStart)} why="Derived from the shift" />}
                    time={
                      <TimeSelect
                        value={breakStart}
                        onChange={onChangeBreakStart}
                        className={`w-full px-2 py-2 border rounded-lg text-[13px] bg-[var(--color-surface)] ${changed("breakStart", breakStart) ? changedCls : "border-[var(--color-border)]"}`}
                      />
                    }
                  />
                  <EndpointRow
                    caption="Break end"
                    hint={breakMinutes > 0 ? `${fmtDuration(breakMinutes)} break` : undefined}
                    date={<ReadonlyDateCell date={breakDateOf(breakEnd)} why="Derived from the shift" />}
                    time={
                      <TimeSelect
                        value={breakEnd}
                        onChange={onChangeBreakEnd}
                        className={`w-full px-2 py-2 border rounded-lg text-[13px] bg-[var(--color-surface)] ${changed("breakEnd", breakEnd) ? changedCls : "border-[var(--color-border)]"}`}
                      />
                    }
                  />
                </>
              )}

              <EndpointRow
                caption={splitEnabled ? "End (segment 2)" : "End"}
                hint={
                  endDateOverridden
                    ? "changed by you"
                    : endOffsetDays === 1
                      ? "past midnight → next calendar day"
                      : undefined
                }
                tone={endDateOverridden ? "flagged" : endOffsetDays === 1 ? "shifted" : undefined}
                date={<DateSegment options={endDateOptions} onPick={pickEndDate} />}
                time={
                  <TimeSelect
                    value={endTime}
                    onChange={onChangeEnd}
                    className="w-full px-2 py-2 border border-[var(--color-border)] rounded-lg text-[13px] bg-[var(--color-surface)]"
                  />
                }
              />

              {/* Length — 두 행 **아래** 한 줄. Start/End 사이에는 아무것도 두지 않는다.
                  값은 고정폭(`7h 00m`)이고 시/분을 직접 입력할 수 있다. 스테퍼는 5·15·60 세 단계다:
                  5=미세, 15=통상, 60=도약. 10 은 5 두 번과 겹쳐 뺐다(버튼이 양쪽에 붙어 폭이 비싸다). */}
              <div className="flex items-center gap-2 flex-wrap px-2.5 py-2 border-t border-dashed border-[var(--color-border)]">
                <span className="text-[10px] font-bold uppercase tracking-[0.11em] text-[var(--color-text-muted)]">Length</span>

                <span className="inline-flex rounded-md border border-[var(--color-border)] overflow-hidden bg-[var(--color-surface)]">
                  {[60, 15, 5].map((n) => (
                    <button
                      key={`minus-${n}`}
                      type="button"
                      onClick={() => onChangeDuration(durationMin - n)}
                      className="px-1.5 py-0.5 text-[11px] tabular-nums text-[var(--color-text-secondary)] border-r border-[var(--color-border)] hover:bg-[var(--color-surface-hover)]"
                      aria-label={`Shorten by ${n} minutes`}
                    >
                      −{n}
                    </button>
                  ))}
                </span>

                <DurationInput
                  minutes={shiftTotalMin}
                  onChange={onChangeDuration}
                  over={shiftTotalMin > 1440}
                />

                <span className="inline-flex rounded-md border border-[var(--color-border)] overflow-hidden bg-[var(--color-surface)]">
                  {[5, 15, 60].map((n) => (
                    <button
                      key={`plus-${n}`}
                      type="button"
                      onClick={() => onChangeDuration(durationMin + n)}
                      className="px-1.5 py-0.5 text-[11px] tabular-nums text-[var(--color-text-secondary)] border-l border-[var(--color-border)] first:border-l-0 hover:bg-[var(--color-surface-hover)]"
                      aria-label={`Extend by ${n} minutes`}
                    >
                      +{n}
                    </button>
                  ))}
                </span>

                {lengthDelta !== 0 && (
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold tabular-nums border border-[var(--color-warning)] bg-[var(--color-warning-muted)] text-[var(--color-warning)]">
                    {lengthDelta > 0 ? "+" : "−"}{fmtDuration(Math.abs(lengthDelta))}
                  </span>
                )}
                <span className="ml-auto text-[10px] text-[var(--color-text-muted)]">{SCHEDULE_STEP_MINUTES}-min steps · max 24h</span>
              </div>
            </div>

            {/* 저장 문장 — 화면 값과 저장 값이 어긋날 자리를 없앤다(실제 start_at/end_at 을 읽어준다). */}
            <div className="mt-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 py-2 text-[12px] text-[var(--color-text-secondary)]">
              Saves as <strong className="text-[var(--color-text)]">{fmtStamp(startDate, startTime)}</strong> →{" "}
              <strong className="text-[var(--color-text)]">{fmtStamp(endDate, endTime)}</strong>. Counts on operating day {fmtFeedbackDate(date)}.
            </div>

            {/* 자동값과 다른 시작 달력일 — 이제 화면에서 고를 수 없으므로 여기 오지 않는다.
                기존 데이터(경계 설정을 나중에 바꾼 행 등)로 열렸을 때를 위한 안전망이자
                이벤트 특수근무 트랙에서 통로를 되살릴 때 다시 쓸 자리다. */}
            {startDateOverridden ? (
              <div className="mt-1.5 rounded-lg border border-[var(--color-danger)] bg-[var(--color-danger-muted)] px-2.5 py-2 text-[11px] text-[var(--color-danger)] flex items-start gap-2">
                <span className="flex-1">
                  {START_OUTSIDE_WINDOW_TEXT} {blockedStartReason}
                </span>
                <button
                  type="button"
                  onClick={() => setStartDateOverride(null)}
                  className="shrink-0 font-bold underline underline-offset-2"
                >
                  Back to {fmtChipDate(addDay(date, autoStartOffset))}
                </button>
              </div>
            ) : startOffsetDays === 1 ? (
              <div className="mt-1.5 text-[11px] text-[var(--color-text-muted)]">
                {fmtClock12(startTime)} is before the {fmtClock12(dayBoundary)} day start, so this shift runs on{" "}
                <strong className="text-[var(--color-text-secondary)]">{fmtChipDate(startDate)}</strong> and still counts on operating day {fmtFeedbackDate(date)}.
              </div>
            ) : null}

            {/* 다른 후보가 왜 잠겼는지 — 흐린 후보만 보여주면 "왜"를 알 수 없다. */}
            <div
              data-testid="start-date-locked-reason"
              className="mt-1.5 text-[11px] text-[var(--color-text-muted)]"
            >
              <strong className="text-[var(--color-text-secondary)]">{fmtChipDate(blockedStartDate)}</strong>{" "}
              is not selectable. {blockedStartReason}
            </div>
          </div>

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
