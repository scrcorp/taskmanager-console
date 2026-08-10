"use client";

/**
 * 정렬 + 필터를 한 줄 칩으로 — 누르면 바로 적용된다.
 *
 * 처음엔 시트(Sort & filter)로 뺐는데, 폰에서 목록을 훑다가 "지금 확인 필요한 것만" 을
 * 보려면 시트 열기 → 고르기 → Apply → 닫히기까지 네 동작이 필요했다. 매장에서 한 손으로
 * 쓰는 화면에서 그 왕복이 제일 느린 부분이었다. 칩은 한 번 누르면 끝난다.
 *
 * 가로 스크롤 한 줄에 다 넣되, 정렬은 항상 먼저 보이는 자리에 둔다 (제일 자주 바꾼다).
 */

import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { EMPTY_DAY_FILTERS, type DayFilters, type DaySort } from "@/lib/compactDay";

const SORTS: { value: DaySort; label: string }[] = [
  { value: "default", label: "Now first" },
  { value: "time", label: "Time" },
  { value: "name", label: "Name" },
];

function Chip({
  active,
  onClick,
  children,
  tone = "accent",
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  tone?: "accent" | "danger";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex h-8 shrink-0 items-center gap-1 whitespace-nowrap rounded-full border px-3 text-xs font-bold transition-colors",
        active
          ? tone === "danger"
            ? "border-danger bg-danger-muted text-danger"
            : "border-accent bg-accent-muted text-accent"
          : "border-border bg-bg text-text-secondary",
      )}
    >
      {children}
    </button>
  );
}

export function CompactDayFilterBar({
  sort,
  filters,
  roles,
  attentionCount,
  onSort,
  onFilters,
}: {
  sort: DaySort;
  filters: DayFilters;
  roles: string[];
  /** 이 날짜의 확인 필요 건수 — 0 이면 칩을 띄우지 않는다 (누를 이유가 없다). */
  attentionCount: number;
  onSort: (sort: DaySort) => void;
  onFilters: (filters: DayFilters) => void;
}) {
  const toggleRole = (role: string) =>
    onFilters({
      ...filters,
      roles: filters.roles.includes(role)
        ? filters.roles.filter((r) => r !== role)
        : [...filters.roles, role],
    });

  const dirty =
    sort !== "default"
    || filters.issuesOnly
    || filters.showCancelled
    || filters.roles.length > 0;

  return (
    <div className="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {/* 정렬 — 세그먼트 하나로 묶어 필터 칩과 구분한다 */}
      <div className="flex h-8 shrink-0 items-center rounded-full border border-border bg-bg p-0.5">
        {SORTS.map((s) => (
          <button
            key={s.value}
            type="button"
            onClick={() => onSort(s.value)}
            aria-pressed={sort === s.value}
            className={cn(
              "h-7 whitespace-nowrap rounded-full px-2.5 text-xs font-bold transition-colors",
              sort === s.value ? "bg-accent text-white" : "text-text-secondary",
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      <span className="my-1.5 w-px shrink-0 bg-border" aria-hidden="true" />

      {/* 되돌리기는 맨 앞에 둔다 — 뒤에 두면 칩이 늘어난 만큼 가로 스크롤 밖으로 밀려서
          정작 필터를 켠 사람이 끄는 법을 못 찾는다 */}
      {dirty && (
        <button
          type="button"
          onClick={() => {
            onSort("default");
            onFilters(EMPTY_DAY_FILTERS);
          }}
          className="h-8 shrink-0 whitespace-nowrap rounded-full border border-dashed border-border px-3 text-xs font-bold text-text-secondary"
        >
          Clear
        </button>
      )}

      {attentionCount > 0 && (
        <Chip
          tone="danger"
          active={filters.issuesOnly}
          onClick={() => onFilters({ ...filters, issuesOnly: !filters.issuesOnly })}
        >
          <AlertTriangle size={12} />
          Attention {attentionCount}
        </Chip>
      )}

      {roles.map((role) => (
        <Chip key={role} active={filters.roles.includes(role)} onClick={() => toggleRole(role)}>
          {role}
        </Chip>
      ))}

      <Chip
        active={filters.showCancelled}
        onClick={() => onFilters({ ...filters, showCancelled: !filters.showCancelled })}
      >
        Cancelled
      </Chip>
    </div>
  );
}
