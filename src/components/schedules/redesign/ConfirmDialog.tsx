import { useState, useEffect } from 'react'

interface Props {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  confirmVariant?: 'danger' | 'primary'
  requiresReason?: boolean
  /** reason 입력 자체를 강제 (빈 값 시 버튼 비활성) */
  reasonMandatory?: boolean
  reasonLabel?: string
  onConfirm: (reason?: string) => void
  onCancel: () => void
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  confirmVariant = 'primary',
  requiresReason = false,
  reasonMandatory = false,
  reasonLabel = 'Reason',
  onConfirm,
  onCancel,
}: Props) {
  const [reason, setReason] = useState('')

  useEffect(() => {
    if (open) setReason('')
  }, [open])

  if (!open) return null

  const isDanger = confirmVariant === 'danger'
  // reason 입력 칸이 보여도 mandatory 가 아니면 빈 값으로 진행 가능 (label 의 OPTIONAL 과 일치)
  const reasonValid = !requiresReason || !reasonMandatory || reason.trim().length > 0

  return (
    <div className="fixed inset-0 z-[400] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onCancel} />
      <div className="relative bg-[var(--color-surface)] rounded-2xl shadow-[0_16px_48px_rgba(0,0,0,0.2)] w-full max-w-sm">
        <div className="px-5 pt-5 pb-3 flex items-start gap-3">
          <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${isDanger ? 'bg-[var(--color-danger-muted)]' : 'bg-[var(--color-info-muted)]'}`}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke={isDanger ? 'var(--color-danger)' : 'var(--color-info)'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 6v4M10 14h.01M10 2.5l8.5 14.5h-17z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0 pt-0.5">
            <div className="text-[14px] font-bold text-[var(--color-text)]">{title}</div>
            <div className="text-[12px] text-[var(--color-text-secondary)] mt-1 leading-relaxed">{message}</div>
          </div>
        </div>
        {requiresReason && (
          <div className="px-5 pb-3">
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-1.5">
              {reasonLabel}
              {reasonMandatory && <span className="text-[var(--color-danger)]"> *</span>}
            </label>
            <textarea
              value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="Provide a reason..."
              className="w-full min-h-[70px] px-3 py-2 text-[12px] border border-[var(--color-border)] rounded-lg resize-none focus:outline-none focus:border-[var(--color-accent)]"
              autoFocus
            />
          </div>
        )}
        <div className="px-5 py-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-lg text-[13px] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(requiresReason ? reason.trim() : undefined)}
            disabled={!reasonValid}
            className={`px-4 py-2 rounded-lg text-[13px] font-semibold text-white transition-colors ${isDanger ? 'bg-[var(--color-danger)] hover:opacity-90' : 'bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)]'} disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
