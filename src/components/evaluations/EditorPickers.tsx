"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { Modal, Button, Badge } from "@/components/ui";
import { usePositions } from "@/hooks/usePositions";
import { useInfiniteEvaluatableUsers } from "@/hooks/useEvaluations";
import { useDebounce } from "@/hooks/useDebounce";
import { initials } from "./criteria";
import { DateCalendar } from "./DateCalendar";
import { cn } from "@/lib/utils";
import type { EvaluatableUser, Position } from "@/types";

/** A store the selected employee belongs to (drives the picker dropdown). */
type EmployeeStore = EvaluatableUser["stores"][number];

// ── Period presets (relative to a base "today") ──────────────────────────────

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function isoOf(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Smaller of two YYYY-MM-DD strings (lexicographic == chronological here). */
function clampToToday(iso: string, today: string): string {
  return iso > today ? today : iso;
}

/**
 * Returns the three quick-pick period presets relative to `today` (YYYY-MM-DD).
 * Period end can never exceed today, so any preset whose calendar end runs past
 * today is clamped to today.
 */
function periodPresets(today: string): { label: string; start: string; end: string }[] {
  const [y, m, d] = today.split("-").map(Number);
  const base = new Date(y, m - 1, d);

  // Last 2 weeks: [today-13, today]
  const twoWeeksStart = new Date(base);
  twoWeeksStart.setDate(base.getDate() - 13);

  // Last month: full previous calendar month
  const lastMonthStart = new Date(y, m - 2, 1);
  const lastMonthEnd = new Date(y, m - 1, 0);

  // This month: 1st → today (clamped; the calendar month-end may be in the future)
  const thisMonthStart = new Date(y, m - 1, 1);
  const thisMonthEnd = new Date(y, m, 0);

  return [
    { label: "Last 2 weeks", start: isoOf(twoWeeksStart), end: today },
    {
      label: "Last month",
      start: isoOf(lastMonthStart),
      end: clampToToday(isoOf(lastMonthEnd), today),
    },
    {
      label: "This month",
      start: isoOf(thisMonthStart),
      end: clampToToday(isoOf(thisMonthEnd), today),
    },
  ];
}

// ── Single-select chip (matches mockup Chip) ─────────────────────────────────

function Chip({ selected, onClick, children }: { selected?: boolean; onClick?: () => void; children: React.ReactNode }): React.ReactElement {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-lg px-3.5 py-2.5 text-[13.5px] font-semibold border transition-colors duration-150",
        selected
          ? "border-accent bg-accent-muted text-accent"
          : "border-border bg-surface text-text-secondary hover:border-accent hover:text-accent",
      )}
    >
      {children}
    </button>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }): React.ReactElement {
  return <div className="text-sm font-medium text-text-secondary mb-1.5">{children}</div>;
}

// ── Employee picker ──────────────────────────────────────────────────────────

interface EmployeeModalProps {
  current: string | null;
  onClose: () => void;
  onSelect: (user: EvaluatableUser) => void;
}

export function EmployeeModal({ current, onClose, onSelect }: EmployeeModalProps): React.ReactElement {
  const [q, setQ] = useState("");
  const debouncedQ = useDebounce(q.trim(), 300);

  const {
    data,
    isLoading,
    isFetching,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useInfiniteEvaluatableUsers(debouncedQ);

  const list = useMemo<EvaluatableUser[]>(
    () => data?.pages.flatMap((p) => p.items) ?? [],
    [data],
  );

  // Show a subtle "Searching…" hint while a debounced query is in flight (but
  // the first-ever load shows the full "Loading…" placeholder instead).
  const searching = isFetching && !isLoading && !isFetchingNextPage;

  // Infinite scroll — load the next page when the sentinel scrolls into view.
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          void fetchNextPage();
        }
      },
      { rootMargin: "100px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, list.length]);

  return (
    <Modal isOpen onClose={onClose} title="Select employee" size="md" closeOnBackdrop={false}>
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted pointer-events-none" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by name or ID…"
          autoFocus
          className="w-full rounded-lg border border-border bg-surface pl-9 pr-3 py-2 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent"
        />
        {searching && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-text-muted">
            Searching…
          </span>
        )}
      </div>
      <div className="space-y-1.5 max-h-[52vh] overflow-y-auto">
        {isLoading && <div className="text-center text-sm text-text-muted py-8">Loading…</div>}
        {!isLoading &&
          list.map((e) => {
            const sel = e.id === current;
            return (
              <button
                key={e.id}
                type="button"
                onClick={() => {
                  onSelect(e);
                  onClose();
                }}
                className={cn(
                  "flex items-center gap-3 text-left w-full px-3 py-2.5 rounded-lg border transition-colors",
                  sel
                    ? "border-accent bg-accent-muted"
                    : "border-border hover:border-accent hover:bg-surface-hover",
                )}
              >
                <div className="w-9 h-9 rounded-full bg-accent-muted text-accent flex items-center justify-center text-[12px] font-bold shrink-0">
                  {initials(e.full_name)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-semibold text-text truncate">{e.full_name}</div>
                  <div className="text-[12px] text-text-muted truncate">
                    {e.employee_no ? `ID ${e.employee_no} · ` : ""}
                    {e.stores[0]?.name ?? "No store"}
                  </div>
                </div>
                <Badge variant="default">{e.role_name}</Badge>
              </button>
            );
          })}
        {!isLoading && list.length === 0 && (
          <div className="text-center text-sm text-text-muted py-8">
            {debouncedQ ? "No employees found." : "No one you can evaluate yet."}
          </div>
        )}
        {/* Infinite-scroll sentinel + loading-more affordance */}
        {!isLoading && list.length > 0 && (
          <>
            <div ref={sentinelRef} className="h-px" />
            {isFetchingNextPage && (
              <div className="text-center text-[12px] text-text-muted py-2">Loading more…</div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

// ── Store & position picker ──────────────────────────────────────────────────

interface AssignmentModalProps {
  storeId: string | null;
  positionId: string | null;
  /** The stores the selected employee belongs to (the only choices offered). */
  employeeStores: EmployeeStore[];
  onClose: () => void;
  /** position is optional — pass null when the store has no position chosen. */
  onApply: (
    storeId: string,
    storeName: string,
    positionId: string | null,
    positionName: string | null,
  ) => void;
}

export function AssignmentModal({
  storeId,
  positionId,
  employeeStores,
  onClose,
  onApply,
}: AssignmentModalProps): React.ReactElement {
  // [M1] Only the selected employee's stores are selectable.
  const [sid, setSid] = useState<string>(storeId ?? employeeStores[0]?.id ?? "");
  const [pid, setPid] = useState<string | null>(positionId);

  // Default to the employee's primary store once available (if none preselected).
  useEffect(() => {
    if (!sid && employeeStores.length > 0) setSid(employeeStores[0].id);
  }, [sid, employeeStores]);

  const { data: positions } = usePositions(sid || undefined);
  const positionList = positions ?? [];

  const selectedStore = employeeStores.find((s) => s.id === sid);

  function apply(): void {
    // [M3] A store is required; a position is optional.
    if (!sid || !selectedStore) return;
    const pos = pid ? positionList.find((p) => p.id === pid) : null;
    onApply(selectedStore.id, selectedStore.name, pos?.id ?? null, pos?.name ?? null);
    onClose();
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Store & position"
      size="md"
      closeOnBackdrop={false}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!sid} onClick={apply}>Apply</Button>
        </div>
      }
    >
      <FieldLabel>Store</FieldLabel>
      {employeeStores.length === 0 ? (
        <p className="text-sm text-text-muted py-2 mb-2">
          This employee isn&apos;t assigned to any store yet.
        </p>
      ) : (
        <select
          value={sid}
          onChange={(e) => {
            setSid(e.target.value);
            setPid(null);
          }}
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text mb-4 focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent cursor-pointer"
        >
          {employeeStores.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      )}

      <FieldLabel>Position</FieldLabel>
      {positionList.length === 0 ? (
        <p className="text-sm text-text-muted py-2">
          {selectedStore ? `${selectedStore.name} has no positions yet.` : "This store has no positions yet."}
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {/* Position is optional — allow clearing the selection. */}
          <Chip selected={pid == null} onClick={() => setPid(null)}>
            No position
          </Chip>
          {positionList.map((p: Position) => (
            <Chip key={p.id} selected={p.id === pid} onClick={() => setPid(p.id)}>
              {p.name}
            </Chip>
          ))}
        </div>
      )}
    </Modal>
  );
}

// ── Period picker ────────────────────────────────────────────────────────────

interface PeriodModalProps {
  start: string;
  end: string;
  today: string;
  onClose: () => void;
  onApply: (start: string, end: string) => void;
}

export function PeriodModal({ start, end, today, onClose, onApply }: PeriodModalProps): React.ReactElement {
  const [s, setS] = useState(start);
  const [e, setE] = useState(end);
  const presets = useMemo(() => periodPresets(today), [today]);
  // [M5] Period cannot be in the future; start ≤ end.
  const valid = !!(s && e && s <= e && e <= today);

  // Moving the start past the current end drags the end with it (keeps it valid).
  function pickStart(ns: string): void {
    setS(ns);
    if (e && ns > e) setE(ns);
  }

  return (
    <Modal
      isOpen
      onClose={onClose}
      title="Evaluation period"
      size="lg"
      closeOnBackdrop={false}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            disabled={!valid}
            onClick={() => {
              onApply(s, e);
              onClose();
            }}
          >
            Apply
          </Button>
        </div>
      }
    >
      <FieldLabel>Quick pick</FieldLabel>
      <div className="flex flex-wrap gap-2 mb-5">
        {presets.map((p) => (
          <Chip
            key={p.label}
            selected={s === p.start && e === p.end}
            onClick={() => {
              setS(p.start);
              setE(p.end);
            }}
          >
            {p.label}
          </Chip>
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div>
          <FieldLabel>Start date</FieldLabel>
          <DateCalendar value={s} max={today} onChange={pickStart} />
          <div className="mt-2 text-center text-[13px] font-semibold tabular-nums text-text">{s || "—"}</div>
        </div>
        <div>
          <FieldLabel>End date</FieldLabel>
          <DateCalendar value={e} min={s || undefined} max={today} onChange={setE} />
          <div className="mt-2 text-center text-[13px] font-semibold tabular-nums text-text">{e || "—"}</div>
        </div>
      </div>
    </Modal>
  );
}
