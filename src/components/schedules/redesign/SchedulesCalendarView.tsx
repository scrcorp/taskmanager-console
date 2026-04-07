"use client";

/**
 * SchedulesCalendarView — 목업 App.tsx의 calendar 본문을 Next.js 페이지용으로 이관.
 *
 * 변경점:
 * - mockup의 Sidebar 제거 (admin/(dashboard)/layout.tsx가 자체 사이드바 제공)
 * - mockup의 page state 제거 (Next.js routes로 분리됨: /schedules, /schedules/[id], /schedules/settings)
 * - detail page 진입은 useRouter로 navigation
 * - mockData 그대로 사용 (Task 8d에서 React Query로 교체 예정)
 */

import { useState, useMemo, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { StatsHeader } from './StatsHeader'
import { ScheduleBlock } from './ScheduleBlock'
import { ContextMenu } from './ContextMenu'
import { HistoryPanel } from './HistoryPanel'
import { SwapModal } from './SwapModal'
import { ScheduleEditModal } from './ScheduleEditModal'
import { ConfirmDialog } from './ConfirmDialog'
import { FilterBar, type FilterState } from './FilterBar'
import { LegendModal } from './LegendModal'
import { roleColors, roleLabels, getAttendance } from './mockData'
import { useCalendarData } from './useCalendarData'
import {
  useConfirmSchedule, useRejectSchedule, useDeleteSchedule,
  useSubmitSchedule, useRevertSchedule, useCancelSchedule,
  useCreateSchedule, useUpdateSchedule, useSwapSchedule,
} from '@/hooks/useSchedules'
import type { ScheduleEditPayload } from './ScheduleEditModal'
import type { ViewMode, SortState, ScheduleBlock as ScheduleBlockType } from './types'

// 주 시작일(일요일) 계산
function getWeekStart(d: Date): Date {
  const r = new Date(d)
  r.setHours(0, 0, 0, 0)
  r.setDate(r.getDate() - r.getDay())
  return r
}

function buildWeekDates(weekStart: Date): Array<{ date: string; dayName: string; dayNum: string; isWeekend: boolean; isSunday: boolean }> {
  const out: Array<{ date: string; dayName: string; dayNum: string; isWeekend: boolean; isSunday: boolean }> = []
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + i)
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    out.push({
      date: `${yyyy}-${mm}-${dd}`,
      dayName: dayNames[i]!,
      dayNum: String(d.getDate()),
      isWeekend: i === 0 || i === 6,
      isSunday: i === 0,
    })
  }
  return out
}

export default function SchedulesCalendarView() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [view, setView] = useState<ViewMode>('weekly')
  const [weekStart, setWeekStart] = useState<Date>(() => getWeekStart(new Date()))
  const weekDates = useMemo(() => buildWeekDates(weekStart), [weekStart])
  const [selectedDay, setSelectedDay] = useState(weekDates[0]?.date ?? '')
  const [viewAsGM, setViewAsGM] = useState(true)
  const [weeklySortCol, setWeeklySortCol] = useState(-1)
  const [weeklySortState, setWeeklySortState] = useState<SortState>('none')
  const [dailySortCol, setDailySortCol] = useState(-1)
  const [dailySortState, setDailySortState] = useState<SortState>('none')
  const [selectedStore, setSelectedStore] = useState('')
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; blockId: string; status: string } | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyScheduleId, setHistoryScheduleId] = useState<string | undefined>(undefined)
  const [swapOpen, setSwapOpen] = useState(false)
  const [editModal, setEditModal] = useState<{ open: boolean; mode: 'add' | 'edit'; blockId?: string; staffId?: string; date?: string }>({ open: false, mode: 'add' })
  const [confirmDialog, setConfirmDialog] = useState<{ open: boolean; type: 'delete' | 'revert' | 'reject' | 'cancel' | 'confirm'; blockId?: string }>({ open: false, type: 'delete' })
  const [filters, setFilters] = useState<FilterState>({ staffIds: [], roles: [], statuses: [], positions: [], shifts: [] })
  const [legendOpen, setLegendOpen] = useState(false)

  // ─── Server data via React Query (with mockup-shape adapter) ────
  const dateFrom = weekDates[0]?.date
  const dateTo = weekDates[weekDates.length - 1]?.date
  const { staff, stores, schedules, isLoading } = useCalendarData({
    selectedStoreId: selectedStore,
    dateFrom,
    dateTo,
  })

  // 첫 store 자동 선택
  if (selectedStore === '' && stores.length > 0) {
    setSelectedStore(stores[0]!.id)
  }

  // ?edit=<id> 쿼리 파라미터 → edit 모달 열기 (detail page 등에서 진입 가능)
  useEffect(() => {
    const editId = searchParams.get('edit')
    if (editId) {
      setEditModal({ open: true, mode: 'edit', blockId: editId })
      // URL 정리 (모달이 닫혀도 매번 다시 열리지 않도록)
      router.replace('/schedules', { scroll: false })
    }
  }, [searchParams, router])

  // ─── Mutations ──────────────────────────────────────────────────
  const submitMutation = useSubmitSchedule()
  const confirmMutation = useConfirmSchedule()
  const rejectMutation = useRejectSchedule()
  const revertMutation = useRevertSchedule()
  const cancelMutation = useCancelSchedule()
  const deleteMutation = useDeleteSchedule()
  const createMutation = useCreateSchedule()
  const updateMutation = useUpdateSchedule()
  const swapMutation = useSwapSchedule()
  const [swapSourceId, setSwapSourceId] = useState<string | null>(null)

  function handleScheduleEditSave(payload: ScheduleEditPayload) {
    if (editModal.mode === 'add') {
      createMutation.mutate({
        user_id: payload.staffId,
        store_id: selectedStore,
        work_role_id: payload.workRoleId,
        work_date: payload.date,
        start_time: payload.startTime,
        end_time: payload.endTime,
        status: payload.status,
        note: payload.notes || null,
      }, {
        onSuccess: () => setEditModal({ open: false, mode: 'add' }),
      })
    } else if (editModal.mode === 'edit' && editModal.blockId) {
      updateMutation.mutate({
        id: editModal.blockId,
        data: {
          user_id: payload.staffId,
          work_role_id: payload.workRoleId,
          work_date: payload.date,
          start_time: payload.startTime,
          end_time: payload.endTime,
          note: payload.notes || null,
        },
      }, {
        onSuccess: () => setEditModal({ open: false, mode: 'add' }),
      })
    }
  }

  const currentStore = stores.find(s => s.id === selectedStore) ?? { id: '', name: '...', openHour: 9, closeHour: 22 }

  function getBlocks(staffId: string, date: string): ScheduleBlockType[] {
    return schedules.filter(s => s.staffId === staffId && s.date === date && (s.storeId === selectedStore || s.isOtherStore))
  }

  function getConfirmedHours(staffId: string, date: string): number {
    return schedules
      .filter(s => s.staffId === staffId && s.date === date && s.storeId === selectedStore && s.status === 'confirmed')
      .reduce((sum, s) => sum + (s.endHour - s.startHour), 0)
  }

  function getPendingHours(staffId: string, date: string): number {
    return schedules
      .filter(s => s.staffId === staffId && s.date === date && s.storeId === selectedStore && s.status === 'requested')
      .reduce((sum, s) => sum + (s.endHour - s.startHour), 0)
  }

  const weeklyColumns = useMemo(() => weekDates.map(day => {
    const daySchedules = schedules.filter(s => s.date === day.date && s.storeId === selectedStore)
    const confirmed = daySchedules.filter(s => s.status === 'confirmed')
    const pending = daySchedules.filter(s => s.status === 'requested')
    return {
      key: day.date,
      label: day.dayName,
      sublabel: day.dayNum,
      isSunday: day.isSunday,
      isSaturday: day.isWeekend && !day.isSunday,
      teamConfirmed: new Set(confirmed.map(s => s.staffId)).size,
      teamPending: new Set(pending.map(s => s.staffId)).size,
      hoursConfirmed: confirmed.reduce((s, b) => s + (b.endHour - b.startHour), 0),
      hoursPending: pending.reduce((s, b) => s + (b.endHour - b.startHour), 0),
      laborConfirmed: confirmed.reduce((s, b) => {
        const st = staff.find(x => x.id === b.staffId)
        return s + (st?.hourlyRate || 0) * (b.endHour - b.startHour)
      }, 0),
      laborPending: pending.reduce((s, b) => {
        const st = staff.find(x => x.id === b.staffId)
        return s + (st?.hourlyRate || 0) * (b.endHour - b.startHour)
      }, 0),
    }
  }), [selectedStore])

  const dailyHourRange = useMemo(() => {
    const hours: number[] = []
    for (let h = currentStore.openHour; h < currentStore.closeHour; h++) {
      hours.push(h)
    }
    return hours
  }, [currentStore])

  const dailyColumns = useMemo(() => {
    return dailyHourRange.map(h => {
      const daySchedules = schedules.filter(s => s.date === selectedDay && s.storeId === selectedStore && s.startHour <= h && s.endHour > h)
      const confirmed = daySchedules.filter(s => s.status === 'confirmed')
      const pending = daySchedules.filter(s => s.status === 'requested')
      return {
        key: `h${h}`,
        hour: h,
        label: h === 0 ? '12A' : h < 12 ? `${h}A` : h === 12 ? '12P' : `${h - 12}P`,
        teamConfirmed: confirmed.length,
        teamPending: pending.length,
        hoursConfirmed: confirmed.length,
        hoursPending: pending.length,
        laborConfirmed: confirmed.reduce((s, b) => s + (staff.find(x => x.id === b.staffId)?.hourlyRate || 0), 0),
        laborPending: pending.reduce((s, b) => s + (staff.find(x => x.id === b.staffId)?.hourlyRate || 0), 0),
      }
    })
  }, [selectedDay, selectedStore, dailyHourRange])

  const sortCol = view === 'weekly' ? weeklySortCol : dailySortCol
  const sortState = view === 'weekly' ? weeklySortState : dailySortState

  const filteredStaff = useMemo(() => {
    let result = staff
    if (filters.staffIds.length > 0) {
      result = result.filter(s => filters.staffIds.includes(s.id))
    }
    if (filters.roles.length > 0) {
      result = result.filter(s => filters.roles.includes(s.role))
    }
    if (filters.positions.length > 0) {
      result = result.filter(s => filters.positions.includes(s.position))
    }
    if (filters.statuses.length > 0 || filters.shifts.length > 0) {
      result = result.filter(s => {
        const staffSchedules = schedules.filter(sch => sch.staffId === s.id && sch.storeId === selectedStore)
        if (staffSchedules.length === 0) return false
        return staffSchedules.some(sch =>
          (filters.statuses.length === 0 || filters.statuses.includes(sch.status)) &&
          (filters.shifts.length === 0 || filters.shifts.includes(sch.shift))
        )
      })
    }
    return result
  }, [filters, selectedStore])

  const staffWithScheduleStatus = useMemo(() => {
    return staff.map(s => {
      const hasSchedule = view === 'weekly'
        ? weekDates.some(d => schedules.some(sch => sch.staffId === s.id && sch.date === d.date && sch.storeId === selectedStore))
        : schedules.some(sch => sch.staffId === s.id && sch.date === selectedDay && sch.storeId === selectedStore)
      return { ...s, hasSchedule }
    })
  }, [view, selectedDay, selectedStore])

  const sortedStaff = useMemo(() => {
    const arr = [...filteredStaff]
    if (sortCol < 0 || sortState === 'none') return arr

    return arr.sort((a, b) => {
      let aStatus = 'none'
      let bStatus = 'none'

      if (view === 'weekly') {
        const date = weekDates[sortCol]?.date
        if (date) {
          const aBlocks = schedules.filter(s => s.staffId === a.id && s.date === date && s.storeId === selectedStore)
          const bBlocks = schedules.filter(s => s.staffId === b.id && s.date === date && s.storeId === selectedStore)
          aStatus = aBlocks.find(s => s.status === 'confirmed') ? 'confirmed' : aBlocks.find(s => s.status === 'requested') ? 'requested' : aBlocks.length > 0 ? 'draft' : 'none'
          bStatus = bBlocks.find(s => s.status === 'confirmed') ? 'confirmed' : bBlocks.find(s => s.status === 'requested') ? 'requested' : bBlocks.length > 0 ? 'draft' : 'none'
        }
      } else {
        const hour = currentStore.openHour + sortCol
        const aBlocks = schedules.filter(s => s.staffId === a.id && s.date === selectedDay && s.storeId === selectedStore && s.startHour <= hour && s.endHour > hour)
        const bBlocks = schedules.filter(s => s.staffId === b.id && s.date === selectedDay && s.storeId === selectedStore && s.startHour <= hour && s.endHour > hour)
        aStatus = aBlocks.find(s => s.status === 'confirmed') ? 'confirmed' : aBlocks.find(s => s.status === 'requested') ? 'requested' : aBlocks.length > 0 ? 'draft' : 'none'
        bStatus = bBlocks.find(s => s.status === 'confirmed') ? 'confirmed' : bBlocks.find(s => s.status === 'requested') ? 'requested' : bBlocks.length > 0 ? 'draft' : 'none'
      }

      const hasA = aStatus !== 'none' ? 0 : 1
      const hasB = bStatus !== 'none' ? 0 : 1
      if (hasA !== hasB) return hasA - hasB

      const order = sortState === 'confirmed'
        ? { confirmed: 0, requested: 1, draft: 2, none: 3 }
        : { requested: 0, confirmed: 1, draft: 2, none: 3 }
      return (order[aStatus as keyof typeof order] ?? 3) - (order[bStatus as keyof typeof order] ?? 3)
    })
  }, [sortCol, sortState, view, selectedStore, selectedDay, filteredStaff, currentStore])

  function handleSort(colIndex: number, state: SortState) {
    if (view === 'weekly') {
      setWeeklySortCol(state === 'none' ? -1 : colIndex)
      setWeeklySortState(state)
    } else {
      setDailySortCol(state === 'none' ? -1 : colIndex)
      setDailySortState(state)
    }
  }

  function handleDayClick(dateKey: string) {
    setSelectedDay(dateKey)
    setView('daily')
  }

  const selectedDayInfo = weekDates.find(d => d.date === selectedDay)

  const weeklyTotals = useMemo(() => {
    const weekBlocks = schedules.filter(s => weekDates.some(d => d.date === s.date) && s.storeId === selectedStore && !s.isOtherStore)
    const conf = weekBlocks.filter(s => s.status === 'confirmed')
    const pend = weekBlocks.filter(s => s.status === 'requested')
    return {
      hc: weeklyColumns.reduce((a, c) => a + c.hoursConfirmed, 0),
      hp: weeklyColumns.reduce((a, c) => a + c.hoursPending, 0),
      lc: weeklyColumns.reduce((a, c) => a + c.laborConfirmed, 0),
      lp: weeklyColumns.reduce((a, c) => a + c.laborPending, 0),
      tc: new Set(conf.map(s => s.staffId)).size,
      tp: new Set(pend.map(s => s.staffId)).size,
    }
  }, [weeklyColumns, selectedStore])

  const dailyTotals = useMemo(() => {
    const dayBlocks = schedules.filter(s => s.date === selectedDay && s.storeId === selectedStore && !s.isOtherStore)
    const conf = dayBlocks.filter(s => s.status === 'confirmed')
    const pend = dayBlocks.filter(s => s.status === 'requested')
    return {
      hc: conf.reduce((sum, b) => sum + (b.endHour - b.startHour), 0),
      hp: pend.reduce((sum, b) => sum + (b.endHour - b.startHour), 0),
      lc: conf.reduce((sum, b) => sum + (staff.find(x => x.id === b.staffId)?.hourlyRate || 0) * (b.endHour - b.startHour), 0),
      lp: pend.reduce((sum, b) => sum + (staff.find(x => x.id === b.staffId)?.hourlyRate || 0) * (b.endHour - b.startHour), 0),
      tc: new Set(conf.map(s => s.staffId)).size,
      tp: new Set(pend.map(s => s.staffId)).size,
    }
  }, [selectedDay, selectedStore])

  const totals = view === 'weekly' ? weeklyTotals : dailyTotals

  function handleClick(e: React.MouseEvent, blockId: string, status: string) {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, blockId, status })
  }

  function handleContextAction(action: string) {
    if (!contextMenu) return
    const blockId = contextMenu.blockId
    if (action === 'history') {
      setHistoryScheduleId(blockId)
      setHistoryOpen(true)
    }
    if (action === 'swap') {
      setSwapSourceId(blockId)
      setSwapOpen(true)
    }
    if (action === 'details') router.push(`/schedules/${blockId}`)
    if (action === 'edit') setEditModal({ open: true, mode: 'edit', blockId })
    if (action === 'revert') setConfirmDialog({ open: true, type: 'revert', blockId })
    if (action === 'delete') setConfirmDialog({ open: true, type: 'delete', blockId })
    if (action === 'reject') setConfirmDialog({ open: true, type: 'reject', blockId })
    if (action === 'cancel') setConfirmDialog({ open: true, type: 'cancel', blockId })
    if (action === 'confirm') setConfirmDialog({ open: true, type: 'confirm', blockId })
  }

  function openAddModal(staffId?: string, date?: string) {
    setEditModal({ open: true, mode: 'add', staffId, date })
  }

  const storeHoursLabel = `${currentStore.openHour > 12 ? `${currentStore.openHour - 12}PM` : `${currentStore.openHour}AM`} - ${currentStore.closeHour > 12 ? `${currentStore.closeHour - 12}PM` : `${currentStore.closeHour}AM`}`

  function getDailyBlock(staffId: string, hour: number): ScheduleBlockType | undefined {
    return schedules.find(s =>
      s.staffId === staffId &&
      s.date === selectedDay &&
      (s.storeId === selectedStore || s.isOtherStore) &&
      s.startHour <= hour &&
      s.endHour > hour
    )
  }

  const columns = view === 'weekly' ? weeklyColumns : dailyColumns

  return (
    <div className="min-h-screen bg-[var(--color-bg)]">
      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x} y={contextMenu.y}
          status={contextMenu.status}
          userRole={viewAsGM ? 'gm' : 'sv'}
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
          const sb = historyScheduleId ? schedules.find(s => s.id === historyScheduleId) : null
          const st = sb ? staff.find(x => x.id === sb.staffId) : null
          return st?.name
        })()}
        date={(() => {
          const sb = historyScheduleId ? schedules.find(s => s.id === historyScheduleId) : null
          if (!sb) return ''
          const d = new Date(sb.date + 'T00:00:00')
          return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
        })()}
      />

      {/* Swap Modal */}
      {(() => {
        const fromBlock = swapSourceId ? schedules.find(s => s.id === swapSourceId) : null
        const fromStaff = fromBlock ? staff.find(s => s.id === fromBlock.staffId) : null
        return (
          <SwapModal
            open={swapOpen}
            onClose={() => { setSwapOpen(false); setSwapSourceId(null) }}
            fromBlock={fromBlock}
            fromStaff={fromStaff}
            candidateBlocks={schedules}
            staffList={staff}
            isSubmitting={swapMutation.isPending}
            onSwap={(otherId, reason) => {
              if (!swapSourceId) return
              swapMutation.mutate({ id: swapSourceId, other_schedule_id: otherId, reason }, {
                onSuccess: () => { setSwapOpen(false); setSwapSourceId(null) },
              })
            }}
          />
        )
      })()}

      {/* Schedule Edit Modal */}
      {(() => {
        const editBlock = editModal.blockId ? schedules.find(s => s.id === editModal.blockId) : null
        return (
          <ScheduleEditModal
            open={editModal.open}
            mode={editModal.mode}
            block={editBlock}
            prefilledStaffId={editModal.staffId}
            prefilledDate={editModal.date}
            staffList={staff}
            storeId={selectedStore}
            onClose={() => setEditModal({ open: false, mode: 'add' })}
            onSave={handleScheduleEditSave}
            isSaving={createMutation.isPending || updateMutation.isPending}
            onDelete={editModal.mode === 'edit' && editModal.blockId
              ? () => {
                  setEditModal({ open: false, mode: 'add' })
                  setConfirmDialog({ open: true, type: 'delete', blockId: editModal.blockId })
                }
              : undefined}
          />
        )
      })()}

      {/* Confirm Dialog */}
      {(() => {
        const t = confirmDialog.type
        const cfg: Record<typeof t, { title: string; message: string; label: string; variant: 'danger' | 'primary'; reason: boolean; reasonLabel?: string }> = {
          delete:  { title: 'Delete Schedule?', message: 'This schedule will be permanently deleted. This action cannot be undone.', label: 'Delete', variant: 'danger', reason: false },
          revert:  { title: 'Revert to Requested?', message: 'This confirmed schedule will be reverted to requested status and will need to be re-confirmed.', label: 'Revert', variant: 'primary', reason: false },
          reject:  { title: 'Reject Schedule', message: 'This will mark the schedule as rejected. Please provide a reason for the requester.', label: 'Reject', variant: 'danger', reason: true, reasonLabel: 'Rejection reason' },
          cancel:  { title: 'Cancel Confirmed Schedule', message: 'This will cancel the confirmed schedule. Please provide a reason for the audit log.', label: 'Cancel Schedule', variant: 'danger', reason: true, reasonLabel: 'Cancellation reason' },
          confirm: { title: 'Confirm Schedule?', message: 'This will mark the schedule as confirmed and notify the staff member.', label: 'Confirm', variant: 'primary', reason: false },
        }
        const c = cfg[t]
        const close = () => setConfirmDialog({ open: false, type: 'delete' })
        const handleConfirmAction = (reason?: string) => {
          const id = confirmDialog.blockId
          if (!id) { close(); return }
          if (t === 'delete') deleteMutation.mutate(id)
          else if (t === 'revert') revertMutation.mutate(id)
          else if (t === 'confirm') confirmMutation.mutate(id)
          else if (t === 'reject') rejectMutation.mutate({ id, rejection_reason: reason })
          else if (t === 'cancel') cancelMutation.mutate({ id, cancellation_reason: reason })
          close()
        }
        return (
          <ConfirmDialog
            open={confirmDialog.open}
            title={c.title}
            message={c.message}
            confirmLabel={c.label}
            confirmVariant={c.variant}
            requiresReason={c.reason}
            reasonLabel={c.reasonLabel}
            onConfirm={handleConfirmAction}
            onCancel={close}
          />
        )
      })()}

      {/* Legend Modal */}
      <LegendModal open={legendOpen} onClose={() => setLegendOpen(false)} />

      <div className="px-4 sm:px-6 xl:px-8 pb-8">
        {/* Row 1: Store selector + GM toggle */}
        <div className="flex items-center gap-3 pt-4 pb-1">
          <select
            value={selectedStore}
            onChange={e => setSelectedStore(e.target.value)}
            className="px-3 py-1.5 bg-white border-2 border-[var(--color-accent)] rounded-lg text-[13px] font-semibold text-[var(--color-accent)] cursor-pointer"
          >
            {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <span className="text-[12px] text-[var(--color-text-muted)]">{storeHoursLabel}</span>
          <button
            onClick={() => setViewAsGM(!viewAsGM)}
            className="ml-auto px-2.5 py-1 rounded bg-[var(--color-surface-hover)] text-[12px] text-[var(--color-text-secondary)] hover:bg-[var(--color-border)] transition-colors"
          >
            Viewing as: <strong>{viewAsGM ? 'GM' : 'SV'}</strong>
          </button>
        </div>

        {/* Row 2: Title + summary numbers + controls */}
        <div className="flex items-center justify-between py-2 gap-3 flex-wrap">
          <div className="flex items-center gap-3 md:gap-5 flex-wrap">
            <h1 className="text-[22px] font-semibold text-[var(--color-text)]">Schedules</h1>
            <div className="hidden md:flex items-center gap-3 text-[13px] text-[var(--color-text-secondary)]">
              <span>Staff: <strong className="text-[14px] text-[var(--color-text)]">{filteredStaff.length}</strong></span>
              <span className="w-px h-4 bg-[var(--color-border)]"/>
              <span>Scheduled: <strong className="text-[14px] text-[var(--color-text)]">{totals.tc}</strong></span>
              <span className="w-px h-4 bg-[var(--color-border)]"/>
              <span>Pending: <strong className="text-[14px] text-[var(--color-warning)]">{totals.tp}</strong></span>
              {viewAsGM && <>
                <span className="w-px h-4 bg-[var(--color-border)]"/>
                <span>Labor: <strong className="text-[14px] text-[var(--color-success)]">${totals.lc}</strong>{totals.lp > 0 && <strong className="text-[14px] text-[var(--color-warning)]"> +${totals.lp}</strong>}</span>
              </>}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-0.5">
              {(['weekly', 'daily'] as const).map(v => (
                <button key={v} onClick={() => setView(v)}
                  className={`px-3.5 py-1.5 rounded-md text-[13px] font-semibold transition-all ${view === v ? 'bg-[var(--color-accent)] text-white' : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text)]'}`}>
                  {v === 'weekly' ? 'Weekly' : 'Daily'}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (view === 'weekly') {
                    const next = new Date(weekStart); next.setDate(next.getDate() - 7); setWeekStart(next)
                  } else {
                    const d = new Date(selectedDay + 'T00:00:00'); d.setDate(d.getDate() - 1)
                    setSelectedDay(d.toISOString().slice(0, 10))
                  }
                }}
                className="w-8 h-8 rounded-lg border border-[var(--color-border)] bg-white flex items-center justify-center text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]"
                aria-label="Previous period"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="9 11 5 7 9 3"/></svg>
              </button>
              <span className="text-[13px] font-semibold text-[var(--color-text)] min-w-[140px] text-center">
                {view === 'weekly'
                  ? `${weekDates[0]?.dayName} ${weekDates[0]?.dayNum} – ${weekDates[6]?.dayName} ${weekDates[6]?.dayNum}`
                  : `${selectedDayInfo?.dayName} ${selectedDayInfo?.dayNum}`}
              </span>
              <button
                type="button"
                onClick={() => {
                  if (view === 'weekly') {
                    const next = new Date(weekStart); next.setDate(next.getDate() + 7); setWeekStart(next)
                  } else {
                    const d = new Date(selectedDay + 'T00:00:00'); d.setDate(d.getDate() + 1)
                    setSelectedDay(d.toISOString().slice(0, 10))
                  }
                }}
                className="w-8 h-8 rounded-lg border border-[var(--color-border)] bg-white flex items-center justify-center text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]"
                aria-label="Next period"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="5 3 9 7 5 11"/></svg>
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
                <circle cx="7" cy="7" r="5.5"/>
                <path d="M5.5 5.5a1.5 1.5 0 113 0c0 1-1.5 1-1.5 2"/>
                <circle cx="7" cy="9.5" r="0.5" fill="currentColor"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Row 3: Filters */}
        <FilterBar
          filters={filters}
          onChange={setFilters}
          staffWithSchedule={staffWithScheduleStatus.map(s => ({ id: s.id, hasSchedule: s.hasSchedule }))}
        />

        {/* Table Grid */}
        <div className="bg-white border border-[var(--color-border)] rounded-xl overflow-x-auto">
         <div style={{ minWidth: view === 'weekly' ? 900 : 1100 }}>
          <table className="w-full border-collapse" style={{ tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: 180 }} />
              {columns.map(c => <col key={c.key} />)}
              <col style={{ width: 90 }} />
            </colgroup>

            <StatsHeader
              columns={columns}
              showLabor={viewAsGM}
              sortCol={sortCol}
              sortState={sortState}
              onSort={handleSort}
              onColumnClick={view === 'weekly' ? handleDayClick : undefined}
              firstColLabel={view === 'weekly' ? 'Day' : 'Time'}
              totalHoursConfirmed={totals.hc}
              totalHoursPending={totals.hp}
              totalLaborConfirmed={totals.lc}
              totalLaborPending={totals.lp}
              totalTeamConfirmed={totals.tc}
              totalTeamPending={totals.tp}
            />

            <tbody>
              {sortedStaff.map(s => (
                <tr key={s.id} className="border-b border-[var(--color-border)] last:border-b-0 hover:bg-[var(--color-surface-hover)] transition-[background-color] duration-100">
                  <td className="px-4 py-3 border-r-2 border-[var(--color-border)]">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${roleColors[s.role]}`}>{s.initials}</div>
                      <div className="min-w-0">
                        <div className="text-[13px] font-semibold text-[var(--color-text)] truncate">{s.name}</div>
                        <div className="text-[10px] text-[var(--color-text-muted)]">
                          <span className={s.role === 'gm' ? 'text-[var(--color-accent)] font-semibold' : s.role === 'sv' ? 'text-[var(--color-warning)] font-semibold' : 'font-semibold'}>{roleLabels[s.role]}</span>
                          {viewAsGM && s.hourlyRate && ` · $${s.hourlyRate}/hr`}
                          {viewAsGM && !s.hourlyRate && <span className="text-[var(--color-danger)]"> · No rate</span>}
                        </div>
                      </div>
                    </div>
                  </td>

                  {view === 'weekly' ? (
                    <>
                      {weekDates.map((day, i) => {
                        const blocks = getBlocks(s.id, day.date)
                        return (
                          <td key={day.date} className={`px-1.5 py-2 border-r border-[var(--color-border)] ${sortCol === i ? 'bg-[var(--color-accent)]/[0.04]' : ''}`}>
                            {blocks.length > 0 ? (
                              <div className="flex flex-col gap-1">
                                {blocks.map(b => <ScheduleBlock key={b.id} block={b} staff={s} showCost={viewAsGM} attendance={getAttendance(b.id)} onClick={(e) => handleClick(e, b.id, b.status)} />)}
                              </div>
                            ) : (
                              <div
                                className="h-full min-h-[44px] flex items-center justify-center opacity-0 hover:opacity-40 transition-opacity cursor-pointer"
                                role="button"
                                onClick={() => openAddModal(s.id, day.date)}
                                title={!s.hourlyRate ? 'Warning: this user has no hourly rate set' : undefined}
                              >
                                {!s.hourlyRate ? (
                                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                                    <path d="M7 4v3m0 2.5h.01M2.5 11.5h9a1 1 0 00.87-1.5L8.37 3a1 1 0 00-1.74 0L2.63 10a1 1 0 00.87 1.5z" stroke="var(--color-warning)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
                                  </svg>
                                ) : (
                                  <span className="text-[var(--color-text-muted)] text-[16px]">+</span>
                                )}
                              </div>
                            )}
                          </td>
                        )
                      })}
                    </>
                  ) : (
                    <>
                      {(() => {
                        const cells: React.ReactNode[] = []
                        let h = currentStore.openHour
                        while (h < currentStore.closeHour) {
                          const block = getDailyBlock(s.id, h)
                          const colIndex = h - currentStore.openHour
                          if (block && block.startHour === h) {
                            const span = Math.min(block.endHour, currentStore.closeHour) - h
                            cells.push(
                              <td key={`h${h}`} colSpan={span} className={`p-1 border-r border-[var(--color-border)]/20 align-middle ${sortCol === colIndex ? 'bg-[var(--color-accent)]/[0.04]' : ''}`}>
                                <ScheduleBlock
                                  block={block}
                                  staff={s}
                                  showCost={viewAsGM}
                                  attendance={getAttendance(block.id)}
                                  onClick={(e) => handleClick(e, block.id, block.status)}
                                />
                              </td>
                            )
                            h = block.endHour
                          } else if (block) {
                            h++
                          } else {
                            cells.push(
                              <td
                                key={`h${h}`}
                                className={`h-[56px] border-r border-[var(--color-border)]/20 cursor-pointer hover:bg-[var(--color-surface-hover)] ${sortCol === colIndex ? 'bg-[var(--color-accent)]/[0.04]' : ''}`}
                                onClick={() => openAddModal(s.id, selectedDay)}
                                role="button"
                              />
                            )
                            h++
                          }
                        }
                        return cells
                      })()}
                    </>
                  )}

                  <td className="px-2 py-3 text-center border-l border-[var(--color-border)]">
                    {view === 'weekly' ? (
                      (() => {
                        const ch = weekDates.reduce((sum, d) => sum + getConfirmedHours(s.id, d.date), 0)
                        const ph = weekDates.reduce((sum, d) => sum + getPendingHours(s.id, d.date), 0)
                        return <div className="flex flex-col items-center">
                          <span className="text-[13px] font-bold text-[var(--color-success)]">{ch}h</span>
                          {ph > 0 && <span className="text-[10px] font-semibold text-[var(--color-warning)]">+{ph}h</span>}
                          {viewAsGM && s.hourlyRate && <span className="text-[10px] text-[var(--color-success)]">${ch * s.hourlyRate}</span>}
                          {viewAsGM && s.hourlyRate && ph > 0 && <span className="text-[10px] text-[var(--color-warning)]">+${ph * s.hourlyRate}</span>}
                          {viewAsGM && !s.hourlyRate && <span className="text-[10px] text-[var(--color-danger)]">N/A</span>}
                        </div>
                      })()
                    ) : (
                      (() => {
                        const blocks = schedules.filter(b => b.date === selectedDay && b.staffId === s.id && !b.isOtherStore && b.storeId === selectedStore)
                        const h = blocks.filter(b => b.status === 'confirmed').reduce((sum, b) => sum + (b.endHour - b.startHour), 0)
                        const ph = blocks.filter(b => b.status === 'requested').reduce((sum, b) => sum + (b.endHour - b.startHour), 0)
                        return <div className="flex flex-col items-center">
                          {h > 0 && <span className="text-[13px] font-bold text-[var(--color-success)]">{h}h</span>}
                          {ph > 0 && <span className="text-[10px] font-semibold text-[var(--color-warning)]">+{ph}h</span>}
                          {h === 0 && ph === 0 && <span className="text-[11px] text-[var(--color-text-muted)]">--</span>}
                        </div>
                      })()
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
         </div>
        </div>
      </div>
    </div>
  )
}
