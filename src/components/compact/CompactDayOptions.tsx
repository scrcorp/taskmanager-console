"use client";

/**
 * 정렬 + 필터 시트.
 *
 * 초안 상태를 시트 안에서만 들고 있다가 Apply 로 한 번에 넘긴다 — 고를 때마다 뒤 목록이
 * 재정렬되면 폰에서 방금 뭘 골랐는지 놓친다.
 */

import { useState } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { EMPTY_DAY_FILTERS, type DayFilters, type DaySort } from "@/lib/compactDay";

const SORTS: { value: DaySort; label: string; hint?: string }[] = [
  { value: "default", label: "Working first", hint: "Now → needs attention → upcoming → done" },
  { value: "time", label: "By start time" },
  { value: "name", label: "By name" },
];

function Row({
  label,
  hint,
  selected,
  round,
  onClick,
}: {
  label: string;
  hint?: string;
  selected: boolean;
  round?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 border-b border-border py-3 text-left last:border-b-0"
    >
      <span
        className={cn(
          "flex h-5 w-5 shrink-0 items-center justify-center border-2",
          round ? "rounded-full" : "rounded",
          selected ? "border-accent bg-accent text-white" : "border-border-strong",
        )}
      >
        {selected && !round && <Check size={12} />}
        {selected && round && <span className="h-2 w-2 rounded-full bg-white" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm text-text">{label}</span>
        {hint && <span className="block text-[11px] text-text-muted">{hint}</span>}
      </span>
    </button>
  );
}

export function CompactDayOptions({
  sort,
  filters,
  roles,
  onDone,
}: {
  sort: DaySort;
  filters: DayFilters;
  roles: string[];
  onDone: (result: { sort: DaySort; filters: DayFilters } | undefined) => void;
}) {
  const [draftSort, setDraftSort] = useState<DaySort>(sort);
  const [draft, setDraft] = useState<DayFilters>(filters);

  const toggleRole = (role: string) =>
    setDraft((d) => ({
      ...d,
      roles: d.roles.includes(role) ? d.roles.filter((r) => r !== role) : [...d.roles, role],
    }));

  return (
    <div className="px-1 pb-1">
      <div className="pb-1 pt-1 text-[11px] font-extrabold uppercase tracking-wide text-text-muted">
        Sort
      </div>
      {SORTS.map((s) => (
        <Row
          key={s.value}
          round
          label={s.label}
          hint={s.hint}
          selected={draftSort === s.value}
          onClick={() => setDraftSort(s.value)}
        />
      ))}

      <div className="pb-1 pt-4 text-[11px] font-extrabold uppercase tracking-wide text-text-muted">
        Show
      </div>
      <Row
        label="Only records that need attention"
        selected={draft.issuesOnly}
        onClick={() => setDraft((d) => ({ ...d, issuesOnly: !d.issuesOnly }))}
      />
      <Row
        label="Include cancelled"
        hint="Leftover records from shifts that were cancelled or deleted"
        selected={draft.showCancelled}
        onClick={() => setDraft((d) => ({ ...d, showCancelled: !d.showCancelled }))}
      />

      {roles.length > 0 && (
        <>
          <div className="pb-1 pt-4 text-[11px] font-extrabold uppercase tracking-wide text-text-muted">
            Role
          </div>
          {roles.map((role) => (
            <Row
              key={role}
              label={role}
              selected={draft.roles.includes(role)}
              onClick={() => toggleRole(role)}
            />
          ))}
        </>
      )}

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={() => {
            setDraftSort("default");
            setDraft(EMPTY_DAY_FILTERS);
          }}
          className="h-12 flex-[0.6] rounded-lg border border-border text-sm font-bold text-text-secondary"
        >
          Reset
        </button>
        <button
          type="button"
          onClick={() => onDone({ sort: draftSort, filters: draft })}
          className="h-12 flex-[1.4] rounded-lg bg-accent text-sm font-bold text-white active:bg-accent-light"
        >
          Apply
        </button>
      </div>
    </div>
  );
}
