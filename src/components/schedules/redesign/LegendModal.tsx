interface Props {
  open: boolean
  onClose: () => void
}

export function LegendModal({ open, onClose }: Props) {
  if (!open) return null

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative bg-[var(--color-surface)] rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="sticky top-0 bg-[var(--color-surface)] border-b border-[var(--color-border)] px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-[18px] font-semibold text-[var(--color-text)]">Schedule Legend</h2>
            <p className="text-[12px] text-[var(--color-text-muted)]">Visual reference for colors, status, and indicators</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg border border-[var(--color-border)] flex items-center justify-center text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]"
            aria-label="Close legend"
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M3 3l8 8M11 3l-8 8"/>
            </svg>
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Work Hour Alert Colors */}
          <section>
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-text-muted)] mb-3">Work Hour Alerts</h3>
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <div className="rounded-md border-[1.5px] border-[var(--color-success)] bg-[var(--color-success-muted)] px-2 py-1 w-[110px]">
                  <div className="text-[11px] font-semibold">Day · Server</div>
                  <div className="text-[10px] flex justify-between"><span>8a–1p</span><span className="text-[var(--color-success)] font-bold">5h</span></div>
                </div>
                <div className="text-[12px] text-[var(--color-text-secondary)]"><strong>Normal</strong> — 5.5 hours or less</div>
              </div>
              <div className="flex items-center gap-3">
                <div className="rounded-md border-[1.5px] border-[var(--color-warning)] bg-[var(--color-warning-muted)] px-2 py-1 w-[110px]">
                  <div className="text-[11px] font-semibold">Day · Server</div>
                  <div className="text-[10px] flex justify-between"><span>8a–3p</span><span className="text-[var(--color-warning)] font-bold">7h</span></div>
                </div>
                <div className="text-[12px] text-[var(--color-text-secondary)]"><strong>Caution</strong> — between 5.5 and 7.5 hours</div>
              </div>
              <div className="flex items-center gap-3">
                <div className="rounded-md border-[1.5px] border-[var(--color-danger)] bg-[var(--color-danger-muted)] px-2 py-1 w-[110px]">
                  <div className="text-[11px] font-semibold">Day · Server</div>
                  <div className="text-[10px] flex justify-between"><span>8a–5p</span><span className="text-[var(--color-danger)] font-bold">9h</span></div>
                </div>
                <div className="text-[12px] text-[var(--color-text-secondary)]"><strong>Overtime</strong> — more than 7.5 hours</div>
              </div>
            </div>
          </section>

          {/* Schedule Status */}
          <section>
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-text-muted)] mb-3">Schedule Status</h3>
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <div className="rounded-md border-[1.5px] border-[var(--color-success)] bg-[var(--color-success-muted)] px-2 py-1 w-[110px] flex items-center justify-between">
                  <span className="text-[11px] font-semibold">Confirmed</span>
                  <svg width="11" height="11" viewBox="0 0 12 12" className="text-[var(--color-success)]"><path d="M2.5 6l2.5 2.5 4.5-4.5" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </div>
                <div className="text-[12px] text-[var(--color-text-secondary)]">Solid background + check — confirmed by GM</div>
              </div>
              <div className="flex items-center gap-3">
                <div
                  className="rounded-md border-[1.5px] border-dashed border-[var(--color-warning)] px-2 py-1 w-[110px] flex items-center justify-between"
                  style={{ backgroundImage: 'repeating-linear-gradient(-45deg, rgba(240,165,0,0.06), rgba(240,165,0,0.06) 3px, transparent 3px, transparent 6px)' }}
                >
                  <span className="text-[11px] font-semibold">Requested</span>
                  <svg width="11" height="11" viewBox="0 0 12 12" className="text-[var(--color-warning)]"><circle cx="6" cy="6" r="4.5" stroke="currentColor" strokeWidth="1.5" fill="none"/><path d="M6 3.5v3l1.5 1" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/></svg>
                </div>
                <div className="text-[12px] text-[var(--color-text-secondary)]">Striped + dashed — awaiting GM review</div>
              </div>
              <div className="flex items-center gap-3">
                <div className="rounded-md border-[1.5px] border-dashed border-[var(--color-border)] bg-[var(--color-bg)] opacity-50 px-2 py-1 w-[110px]">
                  <span className="text-[11px] font-semibold">Draft</span>
                </div>
                <div className="text-[12px] text-[var(--color-text-secondary)]">Faint dashed — not yet submitted</div>
              </div>
              <div className="flex items-center gap-3">
                <div className="rounded-md border-[1.5px] border-[var(--color-text-muted)] bg-[var(--color-bg)] opacity-60 px-2 py-1 w-[110px] line-through decoration-[var(--color-danger)] decoration-2">
                  <span className="text-[11px] font-semibold">Rejected</span>
                </div>
                <div className="text-[12px] text-[var(--color-text-secondary)]">Strikethrough + red — GM rejected with reason</div>
              </div>
              <div className="flex items-center gap-3">
                <div className="rounded-md border-[1.5px] border-dashed border-[var(--color-text-muted)] bg-[var(--color-bg)]/60 opacity-50 px-2 py-1 w-[110px]">
                  <span className="text-[11px] font-semibold text-[var(--color-text-muted)]">Cancelled</span>
                </div>
                <div className="text-[12px] text-[var(--color-text-secondary)]">Faint dashed — confirmed schedule cancelled with reason (GM+)</div>
              </div>
              <div className="flex items-center gap-3">
                <div className="rounded-md border-[1.5px] border-dashed border-[var(--color-text-muted)] opacity-40 px-2 py-1 w-[110px]">
                  <span className="text-[11px] font-semibold text-[var(--color-text-muted)]">Other store</span>
                </div>
                <div className="text-[12px] text-[var(--color-text-secondary)]">Dotted + transparent — informational</div>
              </div>
            </div>
          </section>

          {/* Settings Inheritance */}
          <section>
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-text-muted)] mb-3">Settings Inheritance</h3>
            <div className="space-y-2 text-[12px] text-[var(--color-text-secondary)]">
              <div className="flex items-start gap-2">
                <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[var(--color-info-muted)] text-[var(--color-info)] mt-0.5">Inherited</span>
                <span>Setting follows parent (Org → Store → Individual). Toggle off to override.</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[var(--color-bg)] text-[var(--color-text-muted)] mt-0.5">Custom</span>
                <span>Overridden at this level. Only this level (and children that inherit) use it.</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[var(--color-danger-muted)] text-[var(--color-danger)] mt-0.5">Locked by Org</span>
                <span>Org has force-locked this setting. Lower levels cannot override.</span>
              </div>
              <div className="text-[11px] italic mt-2">
                Each setting in the registry declares which levels can override it.
              </div>
            </div>
          </section>

          {/* Attendance Status */}
          <section>
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-text-muted)] mb-3">Attendance Status</h3>
            <div className="text-[11px] text-[var(--color-text-muted)] italic mb-2">
              Attendance states are computed and stored in the database by the system based on clock-in/out events — not derived at read time.
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <LegendRow dot="bg-[var(--color-text-muted)]" text="text-[var(--color-text-muted)]" label="Scheduled" desc="Not yet started" />
              <LegendRow dot="bg-[var(--color-success)] animate-pulse" text="text-[var(--color-success)]" label="Working" desc="Currently clocked in" />
              <LegendRow dot="bg-[var(--color-warning)]" text="text-[var(--color-warning)]" label="On break" desc="Taking a break" />
              <LegendRow dot="bg-[var(--color-danger)]" text="text-[var(--color-danger)]" label="Late" desc="Started after scheduled time" />
              <LegendRow dot="bg-[var(--color-info)]" text="text-[var(--color-info)]" label="Done" desc="Clocked out, completed" />
              <div className="flex items-center gap-2 px-3 py-2 bg-[var(--color-bg)] rounded-lg">
                <svg width="10" height="10" viewBox="0 0 9 9" className="text-[var(--color-danger)] flex-shrink-0">
                  <path d="M2 2l5 5M7 2l-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
                <span className="text-[12px] font-semibold text-[var(--color-danger)]">No show</span>
                <span className="text-[11px] text-[var(--color-text-muted)]">— Did not show up</span>
              </div>
            </div>
          </section>

          {/* Sort & Filter */}
          <section>
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-text-muted)] mb-3">Sort Indicators</h3>
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-1 px-2 py-1 bg-[var(--color-bg)] rounded">
                  <span className="inline-flex items-center justify-center min-w-[20px] px-1 py-0.5 rounded text-[10px] font-bold bg-[var(--color-success-muted)] text-[var(--color-success)]">5</span>
                  <svg width="8" height="5" viewBox="0 0 8 5"><path d="M1 4l3-3 3 3" stroke="#00B894" strokeWidth="1.5" fill="none" strokeLinecap="round"/></svg>
                </span>
                <span className="text-[12px] text-[var(--color-text-secondary)]">Green up arrow — sort by confirmed first</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-1 px-2 py-1 bg-[var(--color-bg)] rounded">
                  <span className="inline-flex items-center justify-center min-w-[20px] px-1 py-0.5 rounded text-[10px] font-bold bg-[var(--color-warning-muted)] text-[var(--color-warning)]">2</span>
                  <svg width="8" height="5" viewBox="0 0 8 5"><path d="M1 1l3 3 3-3" stroke="#F0A500" strokeWidth="1.5" fill="none" strokeLinecap="round"/></svg>
                </span>
                <span className="text-[12px] text-[var(--color-text-secondary)]">Amber down arrow — sort by pending first</span>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}

function LegendRow({ dot, text, label, desc }: { dot: string; text: string; label: string; desc: string }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-[var(--color-bg)] rounded-lg">
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dot}`} />
      <span className={`text-[12px] font-semibold ${text}`}>{label}</span>
      <span className="text-[11px] text-[var(--color-text-muted)] truncate">— {desc}</span>
    </div>
  )
}
