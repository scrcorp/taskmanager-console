"use client";

/**
 * 멀티셀렉트 필터 드롭다운 공통 컴포넌트.
 *
 * 콘솔 곳곳에 인라인으로 박혀있던 multi-select dropdown UI를 통합한 컴포넌트.
 * - trigger 버튼 (label + count badge + chevron)
 * - "All" 옵션 (선택 0개일 때 active, 클릭 시 onClearAll)
 * - 검색창 (searchable=true 일 때)
 * - 체크박스 + label + optional meta (renderOption 또는 meta)
 * - outside-click 자동 닫기
 *
 * Multi-select dropdown filter — used by users page, schedules FilterBar, etc.
 * One component, many variations via props (searchable, renderOption, width).
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Search, ChevronDown, Check, X } from "lucide-react";

export interface MultiSelectOption {
  id: string;
  label: string;
  /** label 우측에 표시되는 보조 노드 (예: 컬러 점, 부역할 텍스트, 뱃지) */
  meta?: ReactNode;
}

interface Props<T extends MultiSelectOption = MultiSelectOption> {
  /** 트리거 버튼에 표시되는 라벨 (예: "Staff", "Role"). */
  label: string;
  /** 선택 가능 옵션 목록. */
  options: T[];
  /** 현재 선택된 id 배열. */
  selected: string[];
  /** 개별 옵션 토글. */
  onToggle: (id: string) => void;
  /** "All" 옵션 클릭 시 호출 — 보통 selected 를 빈 배열로 만든다. */
  onClearAll: () => void;
  /** 검색창 노출 여부 (기본 false). 켜면 query 와 일치하는 옵션만 보임. */
  searchable?: boolean;
  /** 검색 placeholder (기본 "Search..."). searchable=true 일 때만 의미 있음. */
  searchPlaceholder?: string;
  /** 옵션 렌더 커스터마이즈 — 기본 렌더 대신 사용자 정의 행을 쓸 때.
   *  반환값은 체크박스 옆 콘텐츠 영역 전체 (label + meta) 를 대체한다. */
  renderOption?: (option: T, isSelected: boolean) => ReactNode;
  /** 검색 매칭 커스터마이즈 — 기본은 label.toLowerCase().includes(q). */
  filterFn?: (option: T, query: string) => boolean;
  /** 드롭다운 패널 너비 (px). 기본 200. */
  width?: number;
  /** 드롭다운이 열려 있는지 부모가 제어하는 경우 (예: 같은 페이지 내 다른 dropdown 과 상호배타). */
  open?: boolean;
  /** open/close 외부 제어. */
  onOpenChange?: (open: boolean) => void;
  /** 트리거 버튼 className 추가 hook. */
  className?: string;
}

export function MultiSelectFilter<T extends MultiSelectOption = MultiSelectOption>({
  label,
  options,
  selected,
  onToggle,
  onClearAll,
  searchable = false,
  searchPlaceholder = "Search...",
  renderOption,
  filterFn,
  width = 200,
  open: controlledOpen,
  onOpenChange,
  className = "",
}: Props<T>): React.ReactElement {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;

  const setOpen = (next: boolean): void => {
    if (isControlled) {
      onOpenChange?.(next);
    } else {
      setUncontrolledOpen(next);
    }
    if (!next) setQuery("");
  };

  // Outside click + ESC → 닫기
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const count = selected.length;
  const allChecked = count === 0;

  const visibleOptions: T[] = searchable && query.trim()
    ? options.filter((o) => {
        if (filterFn) return filterFn(o, query);
        return o.label.toLowerCase().includes(query.trim().toLowerCase());
      })
    : options;

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold border flex items-center gap-1.5 transition-colors ${
          count > 0
            ? "bg-[var(--color-accent-muted)] text-[var(--color-accent)] border-[var(--color-accent)]/30"
            : "bg-[var(--color-surface)] text-[var(--color-text-secondary)] border-[var(--color-border)] hover:border-[var(--color-text-muted)] hover:text-[var(--color-text)]"
        } ${open ? "ring-2 ring-[var(--color-accent)]/20" : ""}`}
      >
        {label}
        {count > 0 && (
          <span className="bg-[var(--color-accent)] text-white text-[9px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
            {count}
          </span>
        )}
        <ChevronDown size={10} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {/* Dropdown */}
      {open && (
        <div
          style={{ width }}
          className="absolute top-full left-0 mt-1.5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl shadow-[0_8px_24px_rgba(0,0,0,0.12)] z-30 overflow-hidden"
        >
          {/* Search */}
          {searchable && (
            <div className="p-2 border-b border-[var(--color-border)]">
              <div className="flex items-center gap-1.5 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 py-1.5">
                <Search size={14} className="text-[var(--color-text-muted)] shrink-0" />
                <input
                  type="text"
                  autoFocus
                  placeholder={searchPlaceholder}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="bg-transparent outline-none text-[13px] w-full"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => setQuery("")}
                    className="text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                  >
                    <X size={11} />
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="py-1 max-h-[280px] overflow-y-auto">
            {/* "All" — 검색어 없을 때만 표시. 클릭 시 onClearAll. */}
            {!query.trim() && (
              <button
                type="button"
                onClick={onClearAll}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-left transition-colors ${
                  allChecked ? "bg-[var(--color-accent-muted)]" : "hover:bg-[var(--color-surface-hover)]"
                }`}
              >
                <CheckBox checked={allChecked} />
                <span className="flex-1 font-semibold text-[var(--color-text)]">All</span>
              </button>
            )}

            {visibleOptions.length === 0 && (
              <div className="px-4 py-8 text-center">
                <div className="text-[12px] text-[var(--color-text-muted)]">
                  {query ? "No matches" : "No options"}
                </div>
              </div>
            )}

            {visibleOptions.map((opt) => {
              const isSelected = selected.includes(opt.id);
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onToggle(opt.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-left transition-colors ${
                    isSelected ? "bg-[var(--color-accent-muted)]" : "hover:bg-[var(--color-surface-hover)]"
                  }`}
                >
                  <CheckBox checked={isSelected} />
                  {renderOption ? (
                    renderOption(opt, isSelected)
                  ) : (
                    <>
                      <span className="flex-1 font-medium text-[var(--color-text)]">{opt.label}</span>
                      {opt.meta}
                    </>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function CheckBox({ checked }: { checked: boolean }): React.ReactElement {
  return (
    <span
      className={`w-4 h-4 rounded border-[1.5px] flex items-center justify-center shrink-0 transition-colors ${
        checked
          ? "bg-[var(--color-accent)] border-[var(--color-accent)]"
          : "border-[var(--color-border)]"
      }`}
    >
      {checked && <Check size={10} strokeWidth={2.5} className="text-white" />}
    </span>
  );
}
