import { useState, useMemo } from 'react'
import type { Staff, ScheduleBlock } from './types'

interface Props {
  open: boolean
  onClose: () => void
  /** Source schedule + assigned staff (the one initiating the swap) */
  fromBlock?: ScheduleBlock | null
  fromStaff?: Staff | null
  /** All confirmed schedules in current view that could be swap targets */
  candidateBlocks?: ScheduleBlock[]
  /** Staff list for resolving names of candidate blocks */
  staffList?: Staff[]
  onSwap?: (otherScheduleId: string, reason?: string) => void
  isSubmitting?: boolean
}

export function SwapModal({ open, onClose, fromBlock, fromStaff, candidateBlocks = [], staffList = [], onSwap, isSubmitting }: Props) {
  const [otherId, setOtherId] = useState('')
  const [reason, setReason] = useState('')

  const candidates = useMemo(() => {
    if (!fromBlock) return candidateBlocks
    return candidateBlocks.filter((b) =>
      b.id !== fromBlock.id &&
      b.status === 'confirmed' &&
      b.staffId !== fromBlock.staffId  // 같은 staff 제외 (swap 의미 없음)
    )
  }, [candidateBlocks, fromBlock])

  if (!open) return null

  const fromStaffName = fromStaff?.name ?? '—'
  const fromDate = fromBlock?.date ?? '—'
  const fromTime = fromBlock ? `${formatHour(fromBlock.startHour)}-${formatHour(fromBlock.endHour)}` : '—'

  const handleConfirm = () => {
    if (!otherId || !onSwap) return
    onSwap(otherId, reason.trim() || undefined)
  }

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-[var(--color-border)]">
          <h2 className="text-[16px] font-bold text-[var(--color-text)]">Swap Schedule</h2>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="bg-[var(--color-bg)] rounded-lg p-4">
            <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-text-muted)] mb-1">From</div>
            <div className="text-[14px] font-semibold text-[var(--color-text)]">{fromStaffName}</div>
            <div className="text-[12px] text-[var(--color-text-secondary)] mt-0.5">{fromDate} · {fromTime}</div>
          </div>
          <div>
            <label className="block text-[13px] font-medium text-[var(--color-text)] mb-1.5">Swap with (other confirmed schedule)</label>
            <select
              value={otherId}
              onChange={(e) => setOtherId(e.target.value)}
              className="w-full px-3 py-2.5 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg text-[13px]"
            >
              <option value="">Select schedule...</option>
              {candidates.map((b) => {
                const st = staffList.find((s) => s.id === b.staffId)
                return (
                  <option key={b.id} value={b.id}>
                    {st?.name ?? b.staffId} — {b.date} {formatHour(b.startHour)}-{formatHour(b.endHour)}
                  </option>
                )
              })}
            </select>
          </div>
          <div>
            <label className="block text-[13px] font-medium text-[var(--color-text)] mb-1.5">Reason (optional)</label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why is this swap happening?"
              className="w-full px-3 py-2.5 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg text-[13px]"
            />
          </div>
          <div className="flex items-center gap-2 px-3 py-2.5 bg-[var(--color-info-muted)] rounded-lg text-[var(--color-info)] text-[12px]">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="8" cy="8" r="6"/><line x1="8" y1="6" x2="8" y2="8"/><line x1="8" y1="10" x2="8" y2="10"/></svg>
            Both employees will be notified of the swap.
          </div>
        </div>
        <div className="px-6 py-4 border-t border-[var(--color-border)] flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-lg text-[13px] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]">Cancel</button>
          <button
            type="button"
            disabled={!otherId || isSubmitting}
            onClick={handleConfirm}
            className="px-4 py-2 rounded-lg text-[13px] font-semibold bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? 'Swapping…' : 'Confirm Swap'}
          </button>
        </div>
      </div>
    </div>
  )
}

function formatHour(h: number): string {
  const hh = Math.floor(h)
  const mm = Math.round((h - hh) * 60)
  const suf = hh >= 12 ? 'PM' : 'AM'
  const hr = hh === 0 ? 12 : hh > 12 ? hh - 12 : hh
  return `${hr}:${String(mm).padStart(2, '0')} ${suf}`
}
