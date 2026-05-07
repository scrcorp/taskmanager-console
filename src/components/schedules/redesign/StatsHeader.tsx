import { useState } from 'react'

type SortState = 'none' | 'confirmed' | 'requested'

export interface StatsColumn {
  key: string
  label: string
  sublabel?: string
  isSunday?: boolean
  isSaturday?: boolean
  isNow?: boolean
  teamConfirmed: number
  teamPending: number
  hoursConfirmed: number
  hoursPending: number
  costConfirmed: number
  costPending: number
}

interface Props {
  columns: StatsColumn[]
  totalLabel?: string
  totalHoursConfirmed?: number
  totalHoursPending?: number
  totalCostConfirmed?: number
  totalCostPending?: number
  totalTeamConfirmed?: number
  totalTeamPending?: number
  showCost: boolean
  sortCol: number
  sortState: SortState
  onSort: (colIndex: number, state: SortState) => void
  onColumnClick?: (colKey: string) => void
  firstColLabel?: string
}

export function StatsHeader({
  columns,
  totalLabel = 'TOTAL',
  totalHoursConfirmed = 0,
  totalHoursPending = 0,
  totalCostConfirmed = 0,
  totalCostPending = 0,
  totalTeamConfirmed = 0,
  totalTeamPending = 0,
  showCost,
  sortCol,
  sortState,
  onSort,
  onColumnClick,
  firstColLabel = 'Day',
}: Props) {
  const [hoverCol, setHoverCol] = useState(-1)
  const [expanded, setExpanded] = useState(false)

  // Pending row 숨김: 어느 컬럼에도 pending이 없고 total pending도 0이면 표시하지 않음.
  const hasAnyTeamPending = totalTeamPending > 0 || columns.some((c) => c.teamPending > 0)
  const hasAnyHoursPending = totalHoursPending > 0 || columns.some((c) => c.hoursPending > 0)
  const hasAnyCostPending = totalCostPending > 0 || columns.some((c) => c.costPending > 0)

  function handleSort(colIndex: number) {
    let nextState: SortState
    if (sortCol === colIndex) {
      nextState = sortState === 'none' ? 'confirmed' : sortState === 'confirmed' ? 'requested' : 'none'
    } else {
      nextState = 'confirmed'
    }
    onSort(colIndex, nextState)
  }

  function handleSortKeyDown(e: React.KeyboardEvent, colIndex: number) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      handleSort(colIndex)
    }
  }

  function colBg(i: number) {
    return sortCol === i
      ? 'bg-[rgba(108,92,231,0.08)]'
      : ''
  }

  return (
    <thead className="sticky top-0 z-20">
      {/* Row 1: Day/Time headers */}
      <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg)]">
        <th className="px-3 py-2.5 border-r-2 border-[var(--color-border)] text-center sticky left-0 z-[22] bg-[var(--color-bg)]">
          <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">{firstColLabel}</span>
        </th>
        {columns.map((col, i) => (
          <th
            key={col.key}
            onClick={() => onColumnClick?.(col.key)}
            className={`px-1 py-2 text-center border-r border-[var(--color-border)] font-normal ${onColumnClick ? 'cursor-pointer hover:bg-[var(--color-surface-hover)]' : ''} ${colBg(i)} ${col.isSunday ? 'text-[var(--color-danger)]' : col.isSaturday ? 'text-[var(--color-accent)]' : ''} ${col.isNow ? 'bg-[var(--color-accent-muted)]' : ''}`}
          >
            <div className={`text-[13px] font-bold leading-tight ${col.isNow ? 'text-[var(--color-accent)]' : ''}`}>{col.label}</div>
            {col.sublabel && <div className={`text-[11px] mt-0.5 font-normal ${col.isNow ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-secondary)]'}`}>{col.sublabel}</div>}
          </th>
        ))}
        <th className="px-2 py-2.5 text-center border-l border-[var(--color-border)]">
          <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">{totalLabel}</span>
        </th>
      </tr>

      {/* Row 2: Confirmed counts with sort */}
      <tr className="border-b border-[var(--color-border)]/30 bg-[var(--color-surface)]">
        <td className="border-r-2 border-[var(--color-border)] text-center sticky left-0 z-[22] bg-[var(--color-surface)]" rowSpan={hasAnyTeamPending ? 2 : 1}>
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-text-muted)] hover:text-[var(--color-accent)] transition-colors flex items-center gap-1 mx-auto"
            title={expanded ? 'Collapse details' : 'Expand Hours & Cost'}
          >
            <svg
              width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
              className={`transition-transform ${expanded ? 'rotate-90' : ''}`}
            >
              <polyline points="3 2 7 5 3 8"/>
            </svg>
            Team
          </button>
        </td>
        {columns.map((col, i) => (
          <td
            key={`tc${col.key}`}
            className={`py-1 border-r border-[var(--color-border)] border-b border-[var(--color-border)]/30 cursor-pointer text-center ${colBg(i)}`}
            onClick={() => handleSort(i)}
            onKeyDown={(e) => handleSortKeyDown(e, i)}
            onMouseEnter={() => setHoverCol(i)}
            onMouseLeave={() => setHoverCol(-1)}
            tabIndex={0}
            role="button"
            aria-label={`Sort by ${columns[i]?.label || ''} confirmed`}
          >
            <span className="inline-flex items-center justify-center gap-1">
              <span className="inline-flex items-center justify-center min-w-[20px] px-1 py-0.5 rounded text-[10px] font-bold bg-[var(--color-success-muted)] text-[var(--color-success)]">
                {col.teamConfirmed}
              </span>
              <svg width="8" height="5" viewBox="0 0 8 5"
                className={`transition-opacity shrink-0 ${sortCol === i && sortState === 'confirmed' ? 'opacity-100' : hoverCol === i || sortCol === i ? 'opacity-40' : 'opacity-0'}`}>
                <path d="M1 4l3-3 3 3" stroke={sortCol === i && sortState === 'confirmed' ? '#00B894' : '#C0C4CC'} strokeWidth="1.5" fill="none" strokeLinecap="round"/>
              </svg>
            </span>
          </td>
        ))}
        <td className="py-1 border-b border-[var(--color-border)]/30 border-l border-[var(--color-border)] text-center">
          <span className="inline-flex items-center justify-center min-w-[20px] px-1 py-0.5 rounded text-[10px] font-bold bg-[var(--color-success-muted)] text-[var(--color-success)]">
            {totalTeamConfirmed}
          </span>
        </td>
      </tr>

      {/* Row 3: Pending counts with sort — hidden when no pending anywhere */}
      {hasAnyTeamPending && (
      <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
        {/* rowSpan cell from above covers this row's first column */}
        {columns.map((col, i) => (
          <td
            key={`tp${col.key}`}
            className={`py-1 border-r border-[var(--color-border)] cursor-pointer text-center ${colBg(i)}`}
            onClick={() => handleSort(i)}
            onKeyDown={(e) => handleSortKeyDown(e, i)}
            onMouseEnter={() => setHoverCol(i)}
            onMouseLeave={() => setHoverCol(-1)}
            tabIndex={0}
            role="button"
            aria-label={`Sort by ${columns[i]?.label || ''} pending`}
          >
            <span className="inline-flex items-center justify-center gap-1">
              <span className={`inline-flex items-center justify-center min-w-[20px] px-1 py-0.5 rounded text-[10px] font-bold ${col.teamPending > 0 ? 'bg-[var(--color-warning-muted)] text-[var(--color-warning)]' : 'text-[var(--color-text-muted)] opacity-25'}`}>
                {col.teamPending}
              </span>
              <svg width="8" height="5" viewBox="0 0 8 5"
                className={`transition-opacity shrink-0 ${sortCol === i && sortState === 'requested' ? 'opacity-100' : hoverCol === i || sortCol === i ? 'opacity-40' : 'opacity-0'}`}>
                <path d="M1 1l3 3 3-3" stroke={sortCol === i && sortState === 'requested' ? '#F0A500' : '#C0C4CC'} strokeWidth="1.5" fill="none" strokeLinecap="round"/>
              </svg>
            </span>
          </td>
        ))}
        <td className="py-1 border-l border-[var(--color-border)] text-center">
          <span className={`inline-flex items-center justify-center min-w-[20px] px-1 py-0.5 rounded text-[10px] font-bold ${totalTeamPending > 0 ? 'bg-[var(--color-warning-muted)] text-[var(--color-warning)]' : 'text-[var(--color-text-muted)] opacity-25'}`}>
            {totalTeamPending}
          </span>
        </td>
      </tr>
      )}

      {/* Expandable: Hours */}
      {expanded && (
        <>
          <tr className="border-b border-[var(--color-border)]/30 bg-[var(--color-surface)]">
            <td className="border-r-2 border-[var(--color-border)] text-center sticky left-0 z-[22] bg-[var(--color-surface)]" rowSpan={hasAnyHoursPending ? 2 : 1}>
              <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">Hours</span>
            </td>
            {columns.map((col, i) => (
              <td key={`hc${col.key}`} className={`text-center py-1 border-r border-[var(--color-border)] border-b border-[var(--color-border)]/30 text-[10px] font-semibold text-[var(--color-success)] ${colBg(i)}`}>
                {Math.round(col.hoursConfirmed * 100) / 100} h
              </td>
            ))}
            <td className="text-center py-1 text-[10px] font-bold text-[var(--color-success)] border-b border-[var(--color-border)]/30 border-l border-[var(--color-border)]">{Math.round(totalHoursConfirmed * 100) / 100} h</td>
          </tr>
          {hasAnyHoursPending && (
          <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
            {columns.map((col, i) => (
              <td key={`hp${col.key}`} className={`text-center py-1 border-r border-[var(--color-border)] text-[10px] font-semibold ${col.hoursPending > 0 ? 'text-[var(--color-warning)]' : 'text-[var(--color-text-muted)] opacity-25'} ${colBg(i)}`}>
                {Math.round(col.hoursPending * 100) / 100} h
              </td>
            ))}
            <td className={`text-center py-1 text-[10px] font-bold border-l border-[var(--color-border)] ${totalHoursPending > 0 ? 'text-[var(--color-warning)]' : 'text-[var(--color-text-muted)] opacity-25'}`}>{Math.round(totalHoursPending * 100) / 100} h</td>
          </tr>
          )}

          {/* Cost (GM only) */}
          {showCost && (
            <>
              <tr className="border-b border-[var(--color-border)]/30 bg-[var(--color-surface)]">
                <td className="border-r-2 border-[var(--color-border)] text-center sticky left-0 z-[22] bg-[var(--color-surface)]" rowSpan={hasAnyCostPending ? 2 : 1}>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">Cost</span>
                </td>
                {columns.map((col, i) => (
                  <td key={`lc${col.key}`} className={`text-center py-1 border-r border-[var(--color-border)] border-b border-[var(--color-border)]/30 text-[10px] font-semibold text-[var(--color-success)] ${colBg(i)}`}>
                    ${col.costConfirmed.toFixed(2)}
                  </td>
                ))}
                <td className="text-center py-1 text-[10px] font-bold text-[var(--color-success)] border-b border-[var(--color-border)]/30 border-l border-[var(--color-border)]">${totalCostConfirmed.toFixed(2)}</td>
              </tr>
              {hasAnyCostPending && (
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
                {columns.map((col, i) => (
                  <td key={`lp${col.key}`} className={`text-center py-1 border-r border-[var(--color-border)] text-[10px] font-semibold ${col.costPending > 0 ? 'text-[var(--color-warning)]' : 'text-[var(--color-text-muted)] opacity-25'} ${colBg(i)}`}>
                    ${col.costPending.toFixed(2)}
                  </td>
                ))}
                <td className={`text-center py-1 text-[10px] font-bold border-l border-[var(--color-border)] ${totalCostPending > 0 ? 'text-[var(--color-warning)]' : 'text-[var(--color-text-muted)] opacity-25'}`}>${totalCostPending.toFixed(2)}</td>
              </tr>
              )}
            </>
          )}
        </>
      )}
    </thead>
  )
}
