import { useEffect, useRef, useState, useLayoutEffect, useCallback } from 'react'

interface Props {
  anchorEl: HTMLElement
  status: string
  userRole?: 'owner' | 'gm' | 'sv' | 'staff'
  isPast?: boolean
  canSyncRate?: boolean
  syncRateLabel?: string
  onClose: () => void
  onAction: (action: string) => void
}

type Tone = 'danger' | 'warning'
type Item = { id: string; label: string; tone?: Tone }
type Group = { key: string; label?: string; items: Item[] }

const ARROW_SIZE = 6
const GAP = 4
const PAD = 8
const ARROW_OFFSET_TOP = 16 // 기본 화살표 위치 (메뉴 상단에서)

export function ContextMenu({ anchorEl, status, userRole = 'gm', isPast = false, canSyncRate = false, syncRateLabel, onClose, onAction }: Props) {
  const menuRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: 0, top: 0, side: 'right' as 'right' | 'left', arrowTop: ARROW_OFFSET_TOP })

  // 외부 클릭 닫기 — anchorEl(현재 카드) 내부 클릭은 무시해서 카드의 toggle 로직이 동작하도록.
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      if (menuRef.current && menuRef.current.contains(target)) return
      if (anchorEl && anchorEl.contains(target)) return
      onClose()
    }
    const id = window.setTimeout(() => document.addEventListener('mousedown', handler), 0)
    return () => { window.clearTimeout(id); document.removeEventListener('mousedown', handler) }
  }, [onClose, anchorEl])

  // 위치 계산
  const reposition = useCallback(() => {
    const menu = menuRef.current
    if (!menu) return
    const ar = anchorEl.getBoundingClientRect()
    const mr = menu.getBoundingClientRect()
    const vw = window.innerWidth
    const vh = window.innerHeight

    // 좌우: 카드 오른쪽 우선, 공간 부족 시 왼쪽
    let side: 'right' | 'left' = 'right'
    let left = ar.right + GAP + ARROW_SIZE
    if (left + mr.width > vw - PAD) {
      side = 'left'
      left = ar.left - mr.width - GAP - ARROW_SIZE
      if (left < PAD) left = PAD
    }

    // 상하: 카드 상단 기준으로 메뉴 상단 정렬 (화살표가 위쪽에)
    // 화살표가 카드 세로 중앙을 가리킴
    const anchorMidY = ar.top + ar.height / 2
    let top = anchorMidY - ARROW_OFFSET_TOP
    let arrowTop = ARROW_OFFSET_TOP

    // 메뉴가 화면 아래로 넘치면 위로 올림
    if (top + mr.height > vh - PAD) {
      top = vh - mr.height - PAD
      arrowTop = anchorMidY - top
    }
    // 메뉴가 화면 위로 넘치면 내림
    if (top < PAD) {
      top = PAD
      arrowTop = anchorMidY - top
    }
    // 화살표 범위 제한
    arrowTop = Math.max(10, Math.min(arrowTop, mr.height - 10))

    setPos({ left, top, side, arrowTop })
  }, [anchorEl])

  useLayoutEffect(() => { reposition() }, [reposition])

  // 스크롤 시 카드 따라다니기
  useEffect(() => {
    const handler = () => reposition()
    const parents: Element[] = []
    let el: Element | null = anchorEl
    while (el) {
      if (el.scrollHeight > el.clientHeight || el.scrollWidth > el.clientWidth) {
        parents.push(el)
        el.addEventListener('scroll', handler, { passive: true })
      }
      el = el.parentElement
    }
    window.addEventListener('scroll', handler, { passive: true })
    window.addEventListener('resize', handler, { passive: true })
    return () => {
      parents.forEach(p => p.removeEventListener('scroll', handler))
      window.removeEventListener('scroll', handler)
      window.removeEventListener('resize', handler)
    }
  }, [anchorEl, reposition])

  // ─── 메뉴 항목을 4개 그룹으로 구성: View / Modify / State / Remove ───
  const isGmPlus = userRole === 'gm' || userRole === 'owner'
  const isEditable = status !== 'rejected' && status !== 'cancelled'
  const isConfirmed = status === 'confirmed'
  const isRequested = status === 'requested'
  const isDraft = status === 'draft'
  const isCancelled = status === 'cancelled'

  const viewItems: Item[] = [
    { id: 'details', label: 'View Details' },
    { id: 'history', label: 'View History' },
  ]

  const modifyItems: Item[] = []
  if (isEditable && (isDraft || isRequested || (isConfirmed && isGmPlus))) {
    modifyItems.push({ id: 'edit', label: 'Edit Schedule' })
  }
  modifyItems.push({ id: 'add', label: 'Add Schedule' })
  if (isConfirmed && isGmPlus) {
    modifyItems.push({ id: 'change-staff', label: 'Change Staff' })
    if (!isPast) modifyItems.push({ id: 'switch', label: 'Switch Schedule' })
  }

  const stateItems: Item[] = []
  if (isRequested) stateItems.push({ id: 'confirm', label: 'Confirm' })
  if (isRequested) stateItems.push({ id: 'reject', label: 'Reject...', tone: 'warning' })
  if (isConfirmed && isGmPlus) stateItems.push({ id: 'revert', label: 'Revert to Requested' })
  if (isCancelled && isGmPlus) stateItems.push({ id: 'revert', label: 'Restore Schedule' })
  if (canSyncRate) {
    stateItems.push({
      id: 'sync-rate',
      label: syncRateLabel ? `Apply rate (${syncRateLabel})` : 'Apply current rate',
    })
  }

  const removeItems: Item[] = []
  if (isConfirmed && isGmPlus) removeItems.push({ id: 'cancel', label: 'Cancel...', tone: 'warning' })
  const canDelete = isDraft || isRequested || (isConfirmed && isGmPlus)
  if (canDelete) removeItems.push({ id: 'delete', label: 'Delete', tone: 'danger' })

  const groups: Group[] = [
    { key: 'view', items: viewItems },
    { key: 'modify', items: modifyItems },
    { key: 'state', items: stateItems },
    { key: 'remove', items: removeItems },
  ].filter((g) => g.items.length > 0)

  const isLeft = pos.side === 'left'

  return (
    <div
      ref={menuRef}
      className="fixed z-[210] animate-[fadeIn_80ms_ease-out]"
      style={{ left: pos.left, top: pos.top }}
    >
      {/* 화살표 — 메뉴 배경과 동일하게 이음새 없이 */}
      <div
        className="absolute w-3 h-3 bg-[var(--color-surface)] rotate-45 z-[1]"
        style={{
          top: pos.arrowTop - 6,
          ...(isLeft
            ? { right: -5, boxShadow: '1px -1px 0 0 var(--color-border)' }
            : { left: -5, boxShadow: '-1px 1px 0 0 var(--color-border)' }),
        }}
      />

      {/* 메뉴 본체 — 4 group: View / Modify / State / Remove */}
      <div className="relative z-[2] bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl shadow-[0_8px_24px_rgba(0,0,0,0.15)] py-1.5 min-w-[180px] max-h-[calc(100vh-16px)] overflow-y-auto">
        {groups.map((group, gi) => (
          <div key={group.key}>
            {gi > 0 && <div className="h-px bg-[var(--color-border)] my-1 mx-2" />}
            {group.items.map((item) => (
              <button
                key={item.id}
                onClick={() => { onAction(item.id); onClose() }}
                className={`w-full flex items-center px-3.5 py-2 text-[13px] font-medium transition-colors text-left ${
                  item.tone === 'danger'
                    ? 'text-[var(--color-danger)] hover:bg-[var(--color-danger-muted)]'
                    : item.tone === 'warning'
                    ? 'text-[var(--color-warning)] hover:bg-[var(--color-warning-muted)]'
                    : 'text-[var(--color-text)] hover:bg-[var(--color-surface-hover)]'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
