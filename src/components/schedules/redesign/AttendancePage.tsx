"use client";

import { useState, useMemo, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAttendances } from '@/hooks/useAttendances'
import { useStores } from '@/hooks/useStores'
import { useAuthStore } from '@/stores/authStore'
import { todayInTimezone } from '@/lib/utils'
import { useMidnightRefresh } from '@/hooks/useMidnightRefresh'
import type { AttendanceBreakItem } from '@/types'

type AttendanceState = "upcoming" | "soon" | "working" | "on_break" | "late" | "clocked_out" | "no_show" | "cancelled"
type FilterKey = AttendanceState | 'all'

// "all" 은 집합에서 "0개 선택" 을 의미 (= 모두 표시). 체크 가능한 필터 키만 여기에.
type CheckableFilterKey = Exclude<FilterKey, 'all'>

const VALID_FILTER_KEYS: FilterKey[] = ['all', 'upcoming', 'soon', 'working', 'on_break', 'late', 'no_show', 'clocked_out', 'cancelled']

/** YYYY-MM-DD 형식인지 간이 검증. 잘못된 값이면 null 반환. */
function sanitizeDateParam(raw: string | null): string | null {
  if (!raw) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null
  const d = new Date(raw + 'T00:00:00')
  if (Number.isNaN(d.getTime())) return null
  return raw
}

function sanitizeFilterParam(raw: string | null): FilterKey | null {
  if (!raw) return null
  return (VALID_FILTER_KEYS as string[]).includes(raw) ? (raw as FilterKey) : null
}

// URL 의 comma-separated filter 값을 파싱해 유효한 키 집합 반환.
// 비어있거나 'all' 포함 시 빈 Set (= 모두 표시).
function parseFilterSet(raw: string | null): Set<CheckableFilterKey> {
  if (!raw) return new Set()
  const parts = raw.split(',').map((s) => s.trim()).filter(Boolean)
  const valid = parts.filter(
    (p): p is CheckableFilterKey =>
      p !== 'all' && (VALID_FILTER_KEYS as string[]).includes(p),
  )
  return new Set(valid)
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

const tabs: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'working', label: 'Clocked In' },
  { key: 'on_break', label: 'On Break' },
  { key: 'late', label: 'Late' },
  { key: 'no_show', label: 'No Show' },
  { key: 'clocked_out', label: 'Done' },
]

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
  const searchParams = useSearchParams()
  // 매장/조직 timezone 기준 오늘 + 자정 자동 갱신.
  const orgTimezone = useAuthStore((s) => s.user?.organization_timezone) ?? undefined
  const today = useMidnightRefresh(
    () => todayInTimezone(orgTimezone),
    [orgTimezone],
  )

  // URL 초기값 ?date=YYYY-MM-DD&store=<id>&filter=<key>
  // 잘못된 값은 무시하고 기본값 사용.
  const initDate = sanitizeDateParam(searchParams.get('date'))
  const initFilter = parseFilterSet(searchParams.get('filter'))
  const initStore = searchParams.get('store') ?? ''

  const [selectedStore, setSelectedStore] = useState<string>(initStore)
  // 필터 다중 선택 — 비어있으면 All (모두 표시).
  const [filters, setFilters] = useState<Set<CheckableFilterKey>>(initFilter)
  const [date, setDate] = useState(initDate ?? todayInTimezone(orgTimezone))

  // 사용자가 명시적으로 다른 날짜를 고르지 않은 동안 (URL date 없고 picker 도 today
  // 그대로) 자정이 지나가면 date state 도 새 today 로 따라가도록 sync.
  // 사용자가 직접 다른 날짜를 골랐다면 그대로 둔다.
  useEffect(() => {
    if (!searchParams.get('date') && date !== today) {
      // date 가 어제 today 그대로 굳어있었던 경우만 동기화
      setDate(today)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [today])

  const storesQ = useStores()
  const stores = storesQ.data ?? []
  const selectedStoreTz = stores.find((s) => s.id === selectedStore)?.timezone ?? orgTimezone

  // URL에 ?date 가 없었으면 store timezone 확정 후 today 재정렬 (조직 tz와 매장 tz가 다른 경우).
  useEffect(() => {
    if (initDate) return
    setDate(todayInTimezone(selectedStoreTz))
    // 매장 timezone 확정 시 1회만 보정.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStoreTz])

  // 첫 store 자동 선택 — URL에 값이 있고 유효하면 유지, 아니면 첫 store
  useEffect(() => {
    if (selectedStore) {
      // URL에서 받은 id가 실제 존재하지 않으면 fallback
      if (stores.length > 0 && !stores.some((s) => s.id === selectedStore)) {
        setSelectedStore(stores[0]!.id)
      }
      return
    }
    if (stores.length > 0) {
      setSelectedStore(stores[0]!.id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stores])

  // state 변경 시 URL sync — history.replaceState 직접 사용 (nav race 방지)
  useEffect(() => {
    if (typeof window === 'undefined') return
    const params = new URLSearchParams(window.location.search)
    params.set('date', date)
    if (selectedStore) params.set('store', selectedStore)
    else params.delete('store')
    if (filters.size === 0) params.delete('filter')
    else params.set('filter', Array.from(filters).join(','))
    const next = `${window.location.pathname}?${params.toString()}`
    if (next !== window.location.pathname + window.location.search) {
      window.history.replaceState(null, '', next)
    }
  }, [date, selectedStore, filters])

  const attendancesQ = useAttendances({
    store_id: selectedStore || undefined,
    work_date: date,
    per_page: 200,
  })
  const records = attendancesQ.data?.items ?? []

  // 진행 중 break 경과시간 및 live work 계산용 — 30s 간격 tick
  const [nowMs, setNowMs] = useState<number>(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 30_000)
    return () => clearInterval(id)
  }, [])

  // late 판정: status === 'late' OR anomalies 에 'late' 포함
  const isLateRow = (r: typeof records[number]): boolean =>
    r.status === 'late' || (r.anomalies?.includes('late') ?? false)

  const filtered = useMemo(() => {
    if (filters.size === 0) return records
    return records.filter((r) => {
      // 'late' 는 anomaly 기반, 나머지는 status 기반
      if (filters.has('late') && isLateRow(r)) return true
      if (filters.has(r.status as CheckableFilterKey)) return true
      return false
    })
  }, [records, filters])

  function toggleFilter(key: CheckableFilterKey) {
    setFilters((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function clearFilters() {
    setFilters(new Set())
  }

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
          value={selectedStore}
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
          {attendancesQ.isLoading && <span className="text-[11px] text-[var(--color-text-muted)]">Loading…</span>}
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => shiftDate(-1)} className="w-8 h-8 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] flex items-center justify-center text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]" aria-label="Previous day">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="9 11 5 7 9 3"/></svg>
          </button>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="px-2 py-1 border border-[var(--color-border)] rounded-lg text-[13px] font-semibold text-[var(--color-text)] min-w-[140px] text-center"
          />
          <button type="button" onClick={() => shiftDate(1)} className="w-8 h-8 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] flex items-center justify-center text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]" aria-label="Next day">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="5 3 9 7 5 11"/></svg>
          </button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
        <StatCard label="Upcoming" value={stats.upcoming} color="text-[var(--color-text)]" />
        <StatCard label="Clocked In" value={stats.working} color="text-[var(--color-success)]" />
        <StatCard label="Late" value={stats.late} color="text-[var(--color-danger)]" />
        <StatCard label="On Break" value={stats.onBreak} color="text-[var(--color-warning)]" />
        <StatCard label="No Show" value={stats.noShow} color="text-[var(--color-danger)]" />
      </div>

      {/* Filter chips — 다중 선택 */}
      <div className="flex items-center gap-1 mb-3 overflow-x-auto">
        {tabs.map((t) => {
          // "All" 칩은 아무것도 선택 안 된 상태를 표시. 클릭 시 전체 선택 해제.
          if (t.key === 'all') {
            const active = filters.size === 0
            return (
              <button
                key={t.key}
                type="button"
                onClick={clearFilters}
                className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold whitespace-nowrap transition-colors ${
                  active
                    ? 'bg-[var(--color-accent)] text-white'
                    : 'bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]'
                }`}
              >
                {t.label}
              </button>
            )
          }
          const key = t.key as CheckableFilterKey
          const active = filters.has(key)
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => toggleFilter(key)}
              aria-pressed={active}
              className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold whitespace-nowrap transition-colors ${
                active
                  ? 'bg-[var(--color-accent)] text-white'
                  : 'bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]'
              }`}
            >
              {t.label}
            </button>
          )
        })}
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
