"use client";

import { useState, useMemo } from 'react'
import { useAttendances } from '@/hooks/useAttendances'
import { useStores } from '@/hooks/useStores'

type AttendanceState = "not_yet" | "working" | "on_break" | "late" | "clocked_out" | "no_show"

const ROLE_DEFAULT_COLOR = "bg-[var(--color-success-muted)] text-[var(--color-success)]"

const stateMeta: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  not_yet: { label: 'Scheduled', bg: 'bg-[var(--color-bg)]', text: 'text-[var(--color-text-muted)]', dot: 'bg-[var(--color-text-muted)]' },
  working: { label: 'Working', bg: 'bg-[var(--color-success-muted)]', text: 'text-[var(--color-success)]', dot: 'bg-[var(--color-success)] animate-pulse' },
  on_break: { label: 'On break', bg: 'bg-[var(--color-warning-muted)]', text: 'text-[var(--color-warning)]', dot: 'bg-[var(--color-warning)]' },
  late: { label: 'Late', bg: 'bg-[var(--color-danger-muted)]', text: 'text-[var(--color-danger)]', dot: 'bg-[var(--color-danger)]' },
  clocked_out: { label: 'Done', bg: 'bg-[var(--color-info-muted,#E0F2FE)]', text: 'text-[var(--color-info)]', dot: 'bg-[var(--color-info)]' },
  no_show: { label: 'No show', bg: 'bg-[var(--color-danger-muted)]', text: 'text-[var(--color-danger)]', dot: 'bg-[var(--color-danger)]' },
}

const tabs: { key: AttendanceState | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'working', label: 'Clocked In' },
  { key: 'on_break', label: 'On Break' },
  { key: 'late', label: 'Late' },
  { key: 'no_show', label: 'No Show' },
  { key: 'clocked_out', label: 'Done' },
]

function formatHHmm(iso?: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
}

function formatHours(min?: number | null): string {
  if (min === null || min === undefined || min === 0) return '—'
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${h}h ${String(m).padStart(2, '0')}m`
}

export function AttendancePage() {
  const today = new Date().toISOString().slice(0, 10)
  const [selectedStore, setSelectedStore] = useState<string>('')
  const [tab, setTab] = useState<AttendanceState | 'all'>('all')
  const [date, setDate] = useState(today)

  const storesQ = useStores()
  const stores = storesQ.data ?? []

  // 첫 store 자동 선택
  if (selectedStore === '' && stores.length > 0) {
    setSelectedStore(stores[0]!.id)
  }

  const attendancesQ = useAttendances({
    store_id: selectedStore || undefined,
    work_date: date,
    per_page: 200,
  })
  const records = attendancesQ.data?.items ?? []

  const filtered = useMemo(() => {
    if (tab === 'all') return records
    return records.filter((r) => r.status === tab)
  }, [records, tab])

  const stats = useMemo(() => ({
    scheduled: records.length,
    working: records.filter((r) => r.status === 'working').length,
    onBreak: records.filter((r) => r.status === 'on_break').length,
    late: records.filter((r) => r.status === 'late').length,
    noShow: records.filter((r) => r.status === 'no_show').length,
  }), [records])

  function shiftDate(days: number) {
    const d = new Date(date)
    d.setDate(d.getDate() + days)
    setDate(d.toISOString().slice(0, 10))
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 pt-4 pb-1">
        <select
          value={selectedStore}
          onChange={e => setSelectedStore(e.target.value)}
          className="px-3 py-1.5 bg-white border-2 border-[var(--color-accent)] rounded-lg text-[13px] font-semibold text-[var(--color-accent)] cursor-pointer"
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
          <button type="button" onClick={() => shiftDate(-1)} className="w-8 h-8 rounded-lg border border-[var(--color-border)] bg-white flex items-center justify-center text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]" aria-label="Previous day">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="9 11 5 7 9 3"/></svg>
          </button>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="px-2 py-1 border border-[var(--color-border)] rounded-lg text-[13px] font-semibold text-[var(--color-text)] min-w-[140px] text-center"
          />
          <button type="button" onClick={() => shiftDate(1)} className="w-8 h-8 rounded-lg border border-[var(--color-border)] bg-white flex items-center justify-center text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]" aria-label="Next day">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="5 3 9 7 5 11"/></svg>
          </button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-4">
        <StatCard label="Scheduled" value={stats.scheduled} color="text-[var(--color-text)]" />
        <StatCard label="Clocked In" value={stats.working} color="text-[var(--color-success)]" />
        <StatCard label="Late" value={stats.late} color="text-[var(--color-danger)]" />
        <StatCard label="On Break" value={stats.onBreak} color="text-[var(--color-warning)]" />
        <StatCard label="No Show" value={stats.noShow} color="text-[var(--color-danger)]" />
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-3 overflow-x-auto">
        {tabs.map(t => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold whitespace-nowrap transition-colors ${
              tab === t.key
                ? 'bg-[var(--color-accent)] text-white'
                : 'bg-white border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white border border-[var(--color-border)] rounded-xl overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
              <th className="text-left px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">Employee</th>
              <th className="text-left px-3 py-2.5 text-[11px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">Clock In</th>
              <th className="text-left px-3 py-2.5 text-[11px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">Clock Out</th>
              <th className="text-left px-3 py-2.5 text-[11px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">Hours</th>
              <th className="text-left px-3 py-2.5 text-[11px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">Status</th>
              <th className="text-left px-3 py-2.5 text-[11px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">Anomalies</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && !attendancesQ.isLoading && (
              <tr>
                <td colSpan={6} className="text-center py-12 text-[12px] text-[var(--color-text-muted)] italic">No records match this filter</td>
              </tr>
            )}
            {filtered.map((att) => {
              const meta = stateMeta[att.status] ?? stateMeta.not_yet
              const anomalies = att.anomalies ?? []
              const initials = (att.user_name || '??').split(/\s+/).slice(0, 2).map((s: string) => s[0] ?? '').join('').toUpperCase() || '??'
              return (
                <tr key={att.id} className="border-b border-[var(--color-border)] last:border-b-0 hover:bg-[var(--color-surface-hover)] transition-colors">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${ROLE_DEFAULT_COLOR}`}>{initials}</div>
                      <div className="min-w-0">
                        <div className="text-[13px] font-semibold text-[var(--color-text)] truncate">{att.user_name ?? '—'}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-[12px] tabular-nums text-[var(--color-text)]">{formatHHmm(att.clock_in)}</td>
                  <td className="px-3 py-3 text-[12px] tabular-nums text-[var(--color-text)]">{formatHHmm(att.clock_out)}</td>
                  <td className="px-3 py-3 text-[12px] tabular-nums font-semibold text-[var(--color-text)]">{formatHours(att.net_work_minutes ?? att.total_work_minutes)}</td>
                  <td className="px-3 py-3">
                    <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[11px] font-semibold ${meta.bg} ${meta.text}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${meta.dot}`} />
                      {meta.label}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex flex-wrap gap-1">
                      {anomalies.length === 0 && <span className="text-[11px] text-[var(--color-text-muted)]">—</span>}
                      {anomalies.map((a: string) => (
                        <span key={a} className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[var(--color-danger-muted)] text-[var(--color-danger)]">
                          {a.replace('_', ' ')}
                        </span>
                      ))}
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
    <div className="bg-white border border-[var(--color-border)] rounded-xl px-4 py-3">
      <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">{label}</div>
      <div className={`text-[24px] font-bold mt-1 tabular-nums ${color}`}>{value}</div>
    </div>
  )
}
