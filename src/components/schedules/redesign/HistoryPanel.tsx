import { useScheduleAuditLog } from '@/hooks/useSchedules'

type AuditEventType = 'created' | 'requested' | 'modified' | 'confirmed' | 'rejected' | 'cancelled' | 'reverted' | 'swapped' | 'deleted'

interface Props {
  open: boolean
  onClose: () => void
  scheduleId?: string
  staffName?: string
  date?: string
}

const typeColors: Record<AuditEventType, string> = {
  created: 'bg-[var(--color-info)]',
  requested: 'bg-[var(--color-accent)]',
  modified: 'bg-[var(--color-accent)]',
  confirmed: 'bg-[var(--color-success)]',
  rejected: 'bg-[var(--color-danger)]',
  cancelled: 'bg-[var(--color-text-muted)]',
  reverted: 'bg-[var(--color-warning)]',
  swapped: 'bg-[var(--color-info)]',
  deleted: 'bg-[var(--color-danger)]',
}

const typeLabels: Record<AuditEventType, string> = {
  created: 'Created',
  requested: 'Submitted',
  modified: 'Modified',
  confirmed: 'Confirmed',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
  reverted: 'Reverted',
  swapped: 'Swapped',
  deleted: 'Deleted',
}

const roleLabels: Record<string, string> = {
  owner: 'Owner',
  gm: 'GM',
  sv: 'SV',
  staff: 'Staff',
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
}

export function HistoryPanel({ open, onClose, scheduleId, staffName = 'Schedule', date = '' }: Props) {
  const auditQ = useScheduleAuditLog(open ? scheduleId : undefined)
  const events = (auditQ.data ?? []).map((l) => ({
    id: l.id,
    eventType: (l.event_type as AuditEventType),
    actorName: l.actor_name ?? 'Unknown',
    actorRole: l.actor_role ?? 'staff',
    timestamp: l.timestamp,
    description: l.description ?? '',
    reason: l.reason ?? undefined,
  }))

  return (
    <>
      {/* Backdrop overlay */}
      {open && (
        <div className="fixed inset-0 bg-black/30 z-[75] transition-opacity" onClick={onClose} />
      )}
      <div className={`fixed top-11 right-0 bottom-0 w-[380px] bg-[var(--color-surface)] border-l border-[var(--color-border)] shadow-[-4px_0_24px_rgba(0,0,0,0.12)] z-[80] flex flex-col transition-transform duration-200 ${open ? 'translate-x-0' : 'translate-x-full'}`}>
      <div className="px-5 py-4 border-b border-[var(--color-border)] flex items-center justify-between shrink-0">
        <div>
          <h3 className="text-[14px] font-bold text-[var(--color-text)]">Schedule History</h3>
          <p className="text-[12px] text-[var(--color-text-muted)] mt-0.5">{staffName}{date && ` — ${date}`}</p>
        </div>
        <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text)]">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="4" x2="4" y2="12"/><line x1="4" y1="4" x2="12" y2="12"/></svg>
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-5 py-4">
        {auditQ.isLoading ? (
          <div className="text-[12px] text-[var(--color-text-muted)] italic py-4 text-center">Loading…</div>
        ) : events.length === 0 ? (
          <div className="text-[12px] text-[var(--color-text-muted)] italic py-4 text-center">No audit history available</div>
        ) : (
          events.map((entry, i) => (
            <div key={entry.id} className={`relative pl-5 pb-5 ${i < events.length - 1 ? 'border-l-2 border-[var(--color-border)] ml-1' : 'ml-1'}`}>
              <div className={`absolute left-[-5px] top-1 w-[10px] h-[10px] rounded-full ${typeColors[entry.eventType]} border-2 border-[var(--color-surface)]`} />
              <div className="text-[11px] font-semibold text-[var(--color-text-muted)] mb-1">{formatTimestamp(entry.timestamp)}</div>
              <div className="text-[12px] font-semibold text-[var(--color-text)]">
                {typeLabels[entry.eventType]}
                <span className="font-normal text-[var(--color-text-muted)]"> by {entry.actorName} ({roleLabels[entry.actorRole]})</span>
              </div>
              <div className="text-[12px] text-[var(--color-text-secondary)] mt-0.5 leading-relaxed">{entry.description}</div>
              {entry.reason && (
                <div className="mt-1.5 px-2.5 py-1.5 bg-[var(--color-bg)] border-l-2 border-[var(--color-danger)] rounded-r text-[11px] text-[var(--color-text-secondary)]">
                  <span className="font-semibold text-[var(--color-text)]">Reason:</span> {entry.reason}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
    </>
  )
}
