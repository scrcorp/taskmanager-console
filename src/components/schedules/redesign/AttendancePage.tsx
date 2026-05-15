"use client";

import { useState, useMemo, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAttendances } from '@/hooks/useAttendances'
import { useStores } from '@/hooks/useStores'
import { useUsers } from '@/hooks/useUsers'
import { useAuthStore } from '@/stores/authStore'
import { usePersistedFilters } from '@/hooks/usePersistedFilters'
import { todayInTimezone } from '@/lib/utils'
import { useMidnightRefresh } from '@/hooks/useMidnightRefresh'
import type { AttendanceBreakItem } from '@/types'
import { AttendanceWeeklyView } from './AttendanceWeeklyView'
import { WeekPickerCalendar, DatePickerCalendar, getWeekStart } from './WeekPickerCalendar'
import {
  AttendanceFilterBar,
  EMPTY_ATTENDANCE_FILTERS,
  matchesStatusFilter,
  rolePriorityToBadgeId,
  type AttendanceUiFilters,
  type AttendanceStatusKey,
} from './AttendanceFilterBar'

type ViewMode = 'daily' | 'weekly'

/** YYYY-MM-DD → Date (local midnight). */
function ymdToDate(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1)
}

/** Date → YYYY-MM-DD (local). */
function dateToYmd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** "MON, MAY 13, 2026" 형식 — Daily trigger button 라벨. */
function formatDayLabel(ymd: string): string {
  const d = ymdToDate(ymd)
  const wd = d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()
  const mo = d.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()
  return `${wd}, ${mo} ${d.getDate()}, ${d.getFullYear()}`
}

/** "[W20] MAY 10 – MAY 16" 형식. schedules/overview 와 동일 패턴. */
function formatWeekLabel(weekStartYmd: string): string {
  const d0 = ymdToDate(weekStartYmd)
  const d6 = new Date(d0)
  d6.setDate(d6.getDate() + 6)
  const nextJan1 = new Date(d0.getFullYear() + 1, 0, 1)
  const yr = d0 <= nextJan1 && nextJan1 <= d6 ? d0.getFullYear() + 1 : d0.getFullYear()
  const jan1 = new Date(yr, 0, 1)
  const w1Sun = new Date(jan1)
  w1Sun.setDate(w1Sun.getDate() - w1Sun.getDay())
  const wk = Math.round((d0.getTime() - w1Sun.getTime()) / (7 * 86400000)) + 1
  const m0 = d0.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()
  const m6 = d6.toLocaleDateString('en-US', { month: 'short' }).toUpperCase()
  const crossYear = d0.getFullYear() !== d6.getFullYear()
  return `[W${wk}${crossYear ? ` '${String(yr).slice(2)}` : ''}] ${m0} ${d0.getDate()} – ${m6} ${d6.getDate()}`
}

/** YYYY-MM-DD 형식인지 간이 검증. 잘못된 값이면 null 반환. */
function sanitizeDateParam(raw: string | null): string | null {
  if (!raw) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null
  const d = new Date(raw + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return null
  return raw
}

const VALID_STATUS_KEYS: AttendanceStatusKey[] = ['upcoming', 'working', 'on_break', 'late', 'no_show', 'clocked_out']

function parseCsv(raw: string): string[] {
  return raw ? raw.split(',').map((s) => s.trim()).filter(Boolean) : []
}
function parseStatuses(raw: string): AttendanceStatusKey[] {
  return parseCsv(raw).filter((p): p is AttendanceStatusKey =>
    (VALID_STATUS_KEYS as string[]).includes(p),
  )
}

const ROLE_DEFAULT_COLOR = "bg-[var(--color-success-muted)] text-[var(--color-success)]"

const stateMeta: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  upcoming: { label: 'Upcoming', bg: 'bg-[var(--color-bg)]', text: 'text-[var(--color-text-muted)]', dot: 'bg-[var(--color-text-muted)]' },
  soon: { label: 'Soon', bg: 'bg-[var(--color-warning-muted)]', text: 'text-[var(--color-warning)]', dot: 'bg-[var(--color-warning)]' },
  working: { label: 'Working', bg: 'bg-[var(--color-success-muted)]', text: 'text-[var(--color-success)]', dot: 'bg-[var(--color-success)] animate-pulse' },
  on_break: { label: 'On break', bg: 'bg-[var(--color-warning-muted)]', text: 'text-[var(--color-warning)]', dot: 'bg-[var(--color-warning)]' },
  late: { label: 'Late', bg: 'bg-[var(--color-danger-muted)]', text: 'text-[var(--color-danger)]', dot: 'bg-[var(--color-danger)]' },
  clocked_out: { label: 'Done', bg: 'bg-[var(--color-info-muted,#E0F2FE)]', text: 'text-[var(--color-info)]', dot: 'bg-[var(--color-info)]' },
  no_show: { label: 'No show', bg: 'bg-[var(--color-danger-muted)]', text: 'text-[var(--color-danger)]', dot: 'bg-[var(--color-danger)]' },
  cancelled: { label: 'Cancelled', bg: 'bg-[var(--color-text-muted)]/10', text: 'text-[var(--color-text-muted)]', dot: 'bg-[var(--color-text-muted)]' },
}

/** 24h HH:MM formatter (null → null). */
function formatHHmm24(iso?: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${hh}:${mm}`
}

function formatHours(min?: number | null): string {
  if (min === null || min === undefined || min === 0) return '—'
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${h}h ${String(m).padStart(2, '0')}m`
}

/** Work 컬럼용 2-line 포맷 — net (total). 값 없으면 '—'. */
function WorkCell({ netMin, totalMin }: { netMin: number | null; totalMin: number | null }) {
  if (netMin === null && totalMin === null) return <span>—</span>
  if (netMin === null) {
    // net 없음 — total 만 있으면 total 한 줄로
    if (totalMin === null || totalMin === 0) return <span>—</span>
    return <span className="font-semibold text-[var(--color-text)]">{formatHours(totalMin)}</span>
  }
  const netStr = formatHours(netMin)
  const showTotal = totalMin !== null && totalMin !== netMin
  return (
    <div className="flex flex-col leading-tight">
      <span className="font-semibold text-[var(--color-text)]">{netStr}</span>
      {showTotal && (
        <span className="text-[11px] text-[var(--color-text-muted)]">({formatHours(totalMin)})</span>
      )}
    </div>
  )
}

/** 진행 중 attendance 의 실시간 work minutes 계산.
 *  반환: { netMin, totalMin } — 둘 다 null 이면 표시 대상 아님 (아직 clock in 전).
 *  로직:
 *    elapsed_total = now - clock_in
 *    completed_unpaid = Σ (unpaid_meal/unpaid_long AND ended_at) duration
 *    completed_paid   = Σ (paid_10min/paid_short AND ended_at) duration
 *    completed_paid_overage = max(0, completed_paid - 10 * paid_sessions)
 *    open break 추가 차감:
 *      - unpaid_meal/unpaid_long: 전체 elapsed 차감
 *      - paid_10min/paid_short : max(0, elapsed - 10) 차감
 *    total = elapsed_total
 *    net   = max(0, total - completed_unpaid - completed_paid_overage - open_deduct)
 *
 *  레거시 paid_short/unpaid_long 도 dual-read 인식 (NEED_MONITORING.md).
 */
const PAID_BREAK_VALUES = new Set(['paid_10min', 'paid_short'])
const UNPAID_BREAK_VALUES = new Set(['unpaid_meal', 'unpaid_long'])
function computeLiveWorkMinutes(
  clockInIso: string | null,
  breaks: AttendanceBreakItem[],
  nowMs: number,
): { netMin: number; totalMin: number } | null {
  if (!clockInIso) return null
  const clockInMs = new Date(clockInIso).getTime()
  if (!Number.isFinite(clockInMs)) return null
  const elapsedTotal = Math.max(0, Math.round((nowMs - clockInMs) / 60000))

  let completedUnpaid = 0
  let completedPaid = 0
  let paidSessions = 0
  let openBreak: AttendanceBreakItem | null = null
  for (const b of breaks) {
    if (b.ended_at === null) {
      // 첫 open break 만 사용 — 동시 진행 가정 없음
      if (!openBreak) openBreak = b
      continue
    }
    const dur = b.duration_minutes ?? 0
    if (UNPAID_BREAK_VALUES.has(b.break_type)) {
      completedUnpaid += dur
    } else if (PAID_BREAK_VALUES.has(b.break_type)) {
      completedPaid += dur
      paidSessions += 1
    }
  }
  const completedPaidOverage = Math.max(0, completedPaid - 10 * paidSessions)

  let openDeduct = 0
  if (openBreak) {
    const startMs = new Date(openBreak.started_at).getTime()
    if (Number.isFinite(startMs)) {
      const openElapsed = Math.max(0, Math.round((nowMs - startMs) / 60000))
      if (UNPAID_BREAK_VALUES.has(openBreak.break_type)) {
        openDeduct = openElapsed
      } else if (PAID_BREAK_VALUES.has(openBreak.break_type)) {
        openDeduct = Math.max(0, openElapsed - 10)
      }
    }
  }

  const totalMin = elapsedTotal
  const netMin = Math.max(0, totalMin - completedUnpaid - completedPaidOverage - openDeduct)
  return { netMin, totalMin }
}

/** 실제시각(스케줄시각) 형식 렌더링.
 *  - actual 있고 sched 있으면: "HH:MM (HH:MM)"
 *  - actual 있고 sched 없으면: "HH:MM"
 *  - actual 없고 sched 있으면: "— (HH:MM)" — 스케줄만 muted 색으로
 *  - 둘 다 없으면: "—"
 *
 *  Display 우선순위: 서버 pre-format (*_display, store tz 기준) → fallback 로 ISO 파싱.
 *  서버 값은 KST/PDT 등 매장 tz 에 맞게 포매팅되어 있음.
 */
function ClockCell({
  actualIso,
  scheduledIso,
  actualDisplay,
  scheduledDisplay,
}: {
  actualIso?: string | null
  scheduledIso?: string | null
  actualDisplay?: string | null
  scheduledDisplay?: string | null
}) {
  const actual = actualDisplay ?? formatHHmm24(actualIso)
  const sched = scheduledDisplay ?? formatHHmm24(scheduledIso)
  if (!actual && !sched) return <span>—</span>
  if (actual && sched) {
    return (
      <span className="text-[var(--color-text)]">
        {actual}{' '}
        <span className="text-[var(--color-text-muted)]">({sched})</span>
      </span>
    )
  }
  if (actual) return <span className="text-[var(--color-text)]">{actual}</span>
  // actual 없음 + sched 있음
  return (
    <span className="text-[var(--color-text-muted)]">
      — <span>({sched})</span>
    </span>
  )
}

/** break 세션 리스트를 한 컬럼에 세로로 나열.
 *  - 종료된 break: "HH:MM – HH:MM (Nm)"
 *  - 진행 중 break (ended_at null): "HH:MM – --:-- (Nm)" where N = now - started_at
 */
function BreakCell({ items, tone, nowMs }: { items: AttendanceBreakItem[]; tone: 'paid' | 'unpaid'; nowMs: number }) {
  if (!items.length) return <span className="text-[var(--color-text-muted)]">—</span>
  const color = tone === 'paid' ? 'text-[var(--color-success)]' : 'text-[var(--color-warning)]'
  return (
    <div className={`flex flex-col gap-0.5 ${color}`}>
      {items.map((b) => {
        // 서버 pre-format (store tz 기준) 우선, 없으면 ISO 파싱 (브라우저 로컬 tz) fallback.
        const start = b.started_at_display ?? formatHHmm24(b.started_at) ?? '--:--'
        const endIso = b.ended_at
        if (endIso) {
          const end = b.ended_at_display ?? formatHHmm24(endIso) ?? '--:--'
          const mins = b.duration_minutes ?? 0
          return (
            <span key={b.id} className="tabular-nums text-[12px]">
              {start} – {end} <span className="text-[var(--color-text-muted)]">({mins}m)</span>
            </span>
          )
        }
        // 진행 중 — started_at 부터 now 까지 분 (경과 분 계산은 UTC ISO 로만 가능)
        const startMs = new Date(b.started_at).getTime()
        const elapsed = Number.isFinite(startMs) ? Math.max(0, Math.round((nowMs - startMs) / 60000)) : 0
        return (
          <span key={b.id} className="tabular-nums text-[12px]">
            {start} – --:-- <span className="text-[var(--color-text-muted)]">({elapsed}m)</span>
          </span>
        )
      })}
    </div>
  )
}

/** late anomaly 분 계산 — clock_in - scheduled_start (반올림, 최소 1분). */
function computeLateMinutes(clockInIso?: string | null, scheduledIso?: string | null): number | null {
  if (!clockInIso || !scheduledIso) return null
  const a = new Date(clockInIso).getTime()
  const s = new Date(scheduledIso).getTime()
  if (!Number.isFinite(a) || !Number.isFinite(s)) return null
  const diff = Math.round((a - s) / 60000)
  return diff > 0 ? diff : null
}

export function AttendancePage() {
  const router = useRouter()
  // 매장/조직 timezone 기준 오늘 + 자정 자동 갱신.
  const orgTimezone = useAuthStore((s) => s.user?.organization_timezone) ?? undefined
  const today = useMidnightRefresh(
    () => todayInTimezone(orgTimezone),
    [orgTimezone],
  )

  // URL + localStorage 영속 필터.
  // date 는 transient — 매 세션 새 today 가 기본이라 localStorage 저장 안 함.
  const [params, setParams] = usePersistedFilters(
    'attendances',
    { date: '', store: '', view: '', staff: '', roles: '', statuses: '', edited: '' },
    { transient: ['date'] },
  )
  const rawDate = sanitizeDateParam(params.date || null)
  const selectedStore = params.store
  // URL/저장 값이 비어있으면 today 사용. 사용자가 직접 고른 값이 있으면 그대로.
  const date = rawDate ?? todayInTimezone(orgTimezone)
  const view: ViewMode = params.view === 'weekly' ? 'weekly' : 'daily'

  const filters: AttendanceUiFilters = useMemo(() => ({
    staffIds: parseCsv(params.staff),
    roles: parseCsv(params.roles),
    statuses: parseStatuses(params.statuses),
    editedOnly: params.edited === '1',
  }), [params.staff, params.roles, params.statuses, params.edited])

  const setSelectedStore = useCallback(
    (v: string) => setParams({ store: v || null }),
    [setParams],
  )
  const setDate = useCallback(
    (v: string) => setParams({ date: v || null }),
    [setParams],
  )
  const setView = useCallback(
    (v: ViewMode) => setParams({ view: v === 'weekly' ? 'weekly' : null }),
    [setParams],
  )
  const setFilters = useCallback(
    (next: AttendanceUiFilters) => {
      setParams({
        staff: next.staffIds.length ? next.staffIds.join(',') : null,
        roles: next.roles.length ? next.roles.join(',') : null,
        statuses: next.statuses.length ? next.statuses.join(',') : null,
        edited: next.editedOnly ? '1' : null,
      })
    },
    [setParams],
  )

  // 자정 자동 갱신 — 사용자가 명시적으로 date 안 골랐을 때만 today 따라감.
  // rawDate === null 이면 derived `date` 가 자동 today 되므로 별도 sync 불필요.

  const storesQ = useStores()
  const stores = storesQ.data ?? []

  // 첫 store 자동 선택은 setParams 로 강제하지 않는다.
  // 이유: usePersistedFilters 의 hydration (localStorage → URL) 보다 먼저 발동하면 사용자의 마지막
  //       선택을 stores[0] 으로 덮어쓰는 race 가 생긴다. schedules/redesign 패턴처럼 derived
  //       (URL/저장값이 있고 유효하면 그것, 아니면 stores[0]) 로만 fallback 한다.
  //       사용자가 select 를 바꾸는 시점에야 URL 에 store= 가 들어가서 자연스레 영속화된다.
  const effectiveStore = useMemo(() => {
    if (selectedStore && stores.some((s) => s.id === selectedStore)) return selectedStore
    return stores[0]?.id ?? ''
  }, [selectedStore, stores])

  const attendancesQ = useAttendances({
    store_id: effectiveStore || undefined,
    work_date: date,
    per_page: 200,
  })
  const records = attendancesQ.data?.items ?? []

  // FilterBar 의 Staff 옵션 + Role 매칭 source. Weekly view 의 직원 행 source 와 동일.
  const usersQ = useUsers(effectiveStore ? { store_id: effectiveStore, is_active: true } : undefined)
  const storeUsers = usersQ.data ?? []
  const userIdToRoleBadge = useMemo(() => {
    const m = new Map<string, string>()
    for (const u of storeUsers) m.set(u.id, rolePriorityToBadgeId(u.role_priority))
    return m
  }, [storeUsers])

  // Date picker popup 열림 여부 — Daily/Weekly 공통 (한 번에 하나만 열림).
  const [datePickerOpen, setDatePickerOpen] = useState(false)

  // 진행 중 break 경과시간 및 live work 계산용 — 30s 간격 tick
  const [nowMs, setNowMs] = useState<number>(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])

  // late 판정: status === 'late' OR anomalies 에 'late' 포함
  const isLateRow = (r: typeof records[number]): boolean =>
    r.status === 'late' || (r.anomalies?.includes('late') ?? false)

  /** AttendancePage 의 Daily 본문에서 쓰는 filtered list. Weekly 는 자체 필터링.
   *  4개 필터 (Staff/Role/Status/Edited) 를 모두 AND 로 적용. */
  const filtered = useMemo(() => {
    return records.filter((r) => {
      if (filters.staffIds.length > 0 && !filters.staffIds.includes(r.user_id)) return false
      if (filters.roles.length > 0) {
        const badge = userIdToRoleBadge.get(r.user_id)
        if (!badge || !filters.roles.includes(badge)) return false
      }
      if (!matchesStatusFilter(r.status, r.anomalies, filters.statuses)) return false
      if (filters.editedOnly && (r.correction_count ?? 0) === 0) return false
      return true
    })
  }, [records, filters, userIdToRoleBadge])

  // Stat cards 는 필터 무관 전체 records 기반.
  const stats = useMemo(() => ({
    upcoming: records.filter((r) => r.status === 'upcoming' || r.status === 'soon').length,
    working: records.filter((r) => r.status === 'working').length,
    onBreak: records.filter((r) => r.status === 'on_break').length,
    late: records.filter(isLateRow).length,
    noShow: records.filter((r) => r.status === 'no_show').length,
  }), [records])

  function shiftDate(days: number) {
    // date 는 "YYYY-MM-DD" 캘린더 날짜 — timezone-safe 하게 +days 처리.
    // new Date(date)는 UTC midnight 으로 파싱돼 toISOString().slice(0,10) 으로 되돌리면 음수 tz 에서 어긋남.
    const [y, m, d] = date.split('-').map(Number)
    const local = new Date(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + days)
    const ny = local.getFullYear()
    const nm = String(local.getMonth() + 1).padStart(2, '0')
    const nd = String(local.getDate()).padStart(2, '0')
    setDate(`${ny}-${nm}-${nd}`)
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 pt-4 pb-1">
        <select
          value={effectiveStore}
          onChange={e => setSelectedStore(e.target.value)}
          className="px-3 py-1.5 bg-[var(--color-surface)] border-2 border-[var(--color-accent)] rounded-lg text-[13px] font-semibold text-[var(--color-accent)] cursor-pointer"
        >
          {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <span className="text-[12px] text-[var(--color-text-muted)]">Live attendance tracking</span>
      </div>

      <div className="flex items-center justify-between py-2 gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <h1 className="text-[22px] font-semibold text-[var(--color-text)]">Attendance</h1>
          {attendancesQ.isLoading && view === 'daily' && <span className="text-[11px] text-[var(--color-text-muted)]">Loading…</span>}
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle — Daily / Weekly */}
          <div className="inline-flex p-0.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
            <button
              type="button"
              onClick={() => setView('daily')}
              aria-pressed={view === 'daily'}
              className={`px-3 py-1 rounded-md text-[12px] font-semibold transition-colors ${
                view === 'daily'
                  ? 'bg-[var(--color-accent)] text-white'
                  : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]'
              }`}
            >
              Daily
            </button>
            <button
              type="button"
              onClick={() => setView('weekly')}
              aria-pressed={view === 'weekly'}
              className={`px-3 py-1 rounded-md text-[12px] font-semibold transition-colors ${
                view === 'weekly'
                  ? 'bg-[var(--color-accent)] text-white'
                  : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]'
              }`}
            >
              Weekly
            </button>
          </div>

          <button
            type="button"
            onClick={() => shiftDate(view === 'weekly' ? -7 : -1)}
            className="w-8 h-8 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] flex items-center justify-center text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]"
            aria-label={view === 'weekly' ? 'Previous week' : 'Previous day'}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="9 11 5 7 9 3"/></svg>
          </button>
          <div className="relative">
            <button
              type="button"
              onClick={() => setDatePickerOpen((p) => !p)}
              className="w-[272px] px-3 py-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-surface-hover)] text-[13px] font-semibold text-[var(--color-text)] text-center tabular-nums"
            >
              {view === 'weekly'
                ? formatWeekLabel(dateToYmd(getWeekStart(ymdToDate(date))))
                : formatDayLabel(date)}
            </button>
            {datePickerOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setDatePickerOpen(false)}
                />
                <div className="absolute top-full right-0 mt-1 z-50">
                  {view === 'weekly' ? (
                    <WeekPickerCalendar
                      selectedWeekStart={getWeekStart(ymdToDate(date))}
                      onSelect={(ws) => {
                        setDate(dateToYmd(ws))
                        setDatePickerOpen(false)
                      }}
                    />
                  ) : (
                    <DatePickerCalendar
                      selectedDate={ymdToDate(date)}
                      onSelect={(d) => {
                        setDate(dateToYmd(d))
                        setDatePickerOpen(false)
                      }}
                    />
                  )}
                </div>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={() => shiftDate(view === 'weekly' ? 7 : 1)}
            className="w-8 h-8 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] flex items-center justify-center text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]"
            aria-label={view === 'weekly' ? 'Next week' : 'Next day'}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="5 3 9 7 5 11"/></svg>
          </button>
        </div>
      </div>

      {/* Filter bar — Daily/Weekly 공통. 4개 필터: Staff/Role/Status/Edited. */}
      <AttendanceFilterBar
        filters={filters}
        onChange={setFilters}
        storeUsers={storeUsers}
      />

      {view === 'weekly' ? (
        <AttendanceWeeklyView
          storeId={effectiveStore}
          weekStart={date}
          filters={filters}
          storeUsers={storeUsers}
        />
      ) : (
        <>
      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
        <StatCard label="Upcoming" value={stats.upcoming} color="text-[var(--color-text)]" />
        <StatCard label="Clocked In" value={stats.working} color="text-[var(--color-success)]" />
        <StatCard label="Late" value={stats.late} color="text-[var(--color-danger)]" />
        <StatCard label="On Break" value={stats.onBreak} color="text-[var(--color-warning)]" />
        <StatCard label="No Show" value={stats.noShow} color="text-[var(--color-danger)]" />
      </div>

      {/* Table */}
      <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
              <th className="text-left px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">Employee</th>
              <th className="text-left px-3 py-2.5 text-[11px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">Clock In</th>
              <th className="text-left px-3 py-2.5 text-[11px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">Clock Out</th>
              <th className="text-left px-3 py-2.5 text-[11px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">Break Paid</th>
              <th className="text-left px-3 py-2.5 text-[11px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">Break Unpaid</th>
              <th className="text-left px-3 py-2.5 text-[11px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">Work</th>
              <th className="text-left px-3 py-2.5 text-[11px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">Status</th>
              <th className="text-left px-3 py-2.5 text-[11px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">Anomalies</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && !attendancesQ.isLoading && (
              <tr>
                <td colSpan={8} className="text-center py-12 text-[12px] text-[var(--color-text-muted)] italic">No records match this filter</td>
              </tr>
            )}
            {filtered.map((att) => {
              const meta = stateMeta[att.status] ?? stateMeta.upcoming
              const anomalies = att.anomalies ?? []
              const initials = (att.user_name || '??').split(/\s+/).slice(0, 2).map((s: string) => s[0] ?? '').join('').toUpperCase() || '??'
              const breaks = att.breaks ?? []
              const paidBreaks = breaks.filter((b) => PAID_BREAK_VALUES.has(b.break_type))
              const unpaidBreaks = breaks.filter((b) => UNPAID_BREAK_VALUES.has(b.break_type))
              const lateMin = computeLateMinutes(att.clock_in, att.scheduled_start)

              // Work 컬럼 — clocked_out 이면 서버 값 사용, 진행 중이면 live 계산.
              const isInProgress =
                !!att.clock_in &&
                (!att.clock_out || att.status === 'working' || att.status === 'late' || att.status === 'on_break')
              let workNet: number | null = null
              let workTotal: number | null = null
              if (att.status === 'clocked_out' || att.clock_out) {
                workNet = att.net_work_minutes
                workTotal = att.total_work_minutes
              } else if (isInProgress) {
                const live = computeLiveWorkMinutes(att.clock_in, breaks, nowMs)
                if (live) {
                  workNet = live.netMin
                  workTotal = live.totalMin
                }
              }
              return (
                <tr
                  key={att.id}
                  onClick={() => router.push(`/attendances/${att.id}?from=${date}`)}
                  className="border-b border-[var(--color-border)] last:border-b-0 hover:bg-[var(--color-surface-hover)] transition-colors cursor-pointer"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${ROLE_DEFAULT_COLOR}`}>{initials}</div>
                      <div className="min-w-0">
                        <div className="text-[13px] font-semibold text-[var(--color-text)] truncate">{att.user_name ?? '—'}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-[12px] tabular-nums">
                    <ClockCell
                      actualIso={att.clock_in}
                      scheduledIso={att.scheduled_start}
                      actualDisplay={att.clock_in_display}
                      scheduledDisplay={att.scheduled_start_display}
                    />
                  </td>
                  <td className="px-3 py-3 text-[12px] tabular-nums">
                    <ClockCell
                      actualIso={att.clock_out}
                      scheduledIso={att.scheduled_end}
                      actualDisplay={att.clock_out_display}
                      scheduledDisplay={att.scheduled_end_display}
                    />
                  </td>
                  <td className="px-3 py-3">
                    <BreakCell items={paidBreaks} tone="paid" nowMs={nowMs} />
                  </td>
                  <td className="px-3 py-3">
                    <BreakCell items={unpaidBreaks} tone="unpaid" nowMs={nowMs} />
                  </td>
                  <td className="px-3 py-3 text-[12px] tabular-nums">
                    <WorkCell netMin={workNet} totalMin={workTotal} />
                  </td>
                  <td className="px-3 py-3">
                    <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] font-semibold ${meta.bg} ${meta.text}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
                      {meta.label}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-1">
                      {anomalies.length === 0 && <span className="text-[11px] text-[var(--color-text-muted)]">—</span>}
                      {anomalies.map((a: string) => {
                        const label = a === 'late' && lateMin !== null
                          ? `late (${lateMin}m)`
                          : a.replace('_', ' ')
                        return (
                          <span key={a} className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[var(--color-danger-muted)] text-[var(--color-danger)]">
                            {label}
                          </span>
                        )
                      })}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
        </>
      )}
    </div>
  )
}

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl px-4 py-3">
      <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">{label}</div>
      <div className={`text-[24px] font-bold mt-1 tabular-nums ${color}`}>{value}</div>
    </div>
  )
}
