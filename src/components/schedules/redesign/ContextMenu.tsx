import { useEffect, useRef } from 'react'

type Role = 'owner' | 'gm' | 'sv' | 'staff'

interface Props {
  x: number
  y: number
  status: string
  userRole?: Role
  onClose: () => void
  onAction: (action: string) => void
}

export function ContextMenu({ x, y, status, userRole = 'gm', onClose, onAction }: Props) {
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    // Delay one tick so the opening click doesn't immediately close it
    const id = window.setTimeout(() => {
      document.addEventListener('mousedown', handler)
    }, 0)
    return () => {
      window.clearTimeout(id)
      document.removeEventListener('mousedown', handler)
    }
  }, [onClose])

  const isGmPlus = userRole === 'gm' || userRole === 'owner'
  type Item = { id: string; label: string; icon: string; danger?: boolean }

  let items: Item[] = []
  if (status === 'draft') {
    items = [
      { id: 'details', label: 'View Details', icon: 'i' },
      { id: 'edit', label: 'Edit Schedule', icon: 'e' },
      { id: 'divider', label: '', icon: '' },
      { id: 'delete', label: 'Delete', icon: 'x', danger: true },
    ]
  } else if (status === 'requested') {
    items = [
      { id: 'details', label: 'View Details', icon: 'i' },
      { id: 'edit', label: 'Edit Schedule', icon: 'e' },
      { id: 'confirm', label: 'Confirm', icon: 'c' },
      { id: 'reject', label: 'Reject...', icon: 'r', danger: true },
      { id: 'history', label: 'View History', icon: 'h' },
      { id: 'divider', label: '', icon: '' },
      { id: 'delete', label: 'Delete', icon: 'x', danger: true },
    ]
  } else if (status === 'confirmed') {
    items = [
      { id: 'details', label: 'View Details', icon: 'i' },
      { id: 'edit', label: 'Edit Schedule', icon: 'e' },
      { id: 'revert', label: 'Revert to Requested', icon: 'r' },
      { id: 'swap', label: 'Swap with...', icon: 's' },
      ...(isGmPlus ? [{ id: 'cancel', label: 'Cancel...', icon: 'c', danger: true } as Item] : []),
      { id: 'history', label: 'View History', icon: 'h' },
      ...(isGmPlus ? [
        { id: 'divider', label: '', icon: '' } as Item,
        { id: 'delete', label: 'Delete', icon: 'x', danger: true } as Item,
      ] : []),
    ]
  } else if (status === 'rejected' || status === 'cancelled') {
    items = [
      { id: 'details', label: 'View Details', icon: 'i' },
      { id: 'history', label: 'View History', icon: 'h' },
    ]
  } else {
    items = [
      { id: 'details', label: 'View Details', icon: 'i' },
      { id: 'edit', label: 'Edit Schedule', icon: 'e' },
      { id: 'divider', label: '', icon: '' },
      { id: 'delete', label: 'Delete', icon: 'x', danger: true },
    ]
  }

  return (
    <div
      ref={menuRef}
      className="fixed z-[210] bg-white border border-[var(--color-border)] rounded-xl shadow-[0_8px_24px_rgba(0,0,0,0.12)] py-1.5 min-w-[200px] animate-[fadeIn_100ms_ease-out]"
      style={{ left: Math.min(x, window.innerWidth - 220), top: Math.min(y, window.innerHeight - 280) }}
    >
      {items.map((item, i) =>
        item.id === 'divider' ? (
          <div key={i} className="h-px bg-[var(--color-border)] my-1.5 mx-2" />
        ) : (
          <button
            key={item.id}
            onClick={() => { onAction(item.id); onClose() }}
            className={`w-full flex items-center gap-2.5 px-3.5 py-2 text-[13px] font-medium transition-colors text-left ${
              'danger' in item && item.danger
                ? 'text-[var(--color-danger)] hover:bg-[var(--color-danger-muted)]'
                : 'text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]'
            }`}
          >
            <span className="w-5 text-center text-[11px] uppercase font-bold text-[var(--color-text-muted)]">{item.icon}</span>
            {item.label}
          </button>
        )
      )}
    </div>
  )
}
