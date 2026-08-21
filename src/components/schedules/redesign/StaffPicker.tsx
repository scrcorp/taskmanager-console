"use client";

/**
 * StaffPicker — 스케줄 등록/수정 모달의 Staff 선택 필드.
 *
 * 왜 native select 를 대체하나:
 *   직원이 200명을 넘으면 select 스크롤로는 못 찾는다. 이름을 아는 상태에서
 *   바로 좁히는 게 유일하게 실용적인 방법이라 검색형으로 간다.
 *
 * 후보는 **이 매장에 배정된 사람**뿐이다 (2026-08-19, D2). 예전엔 조직 전체를 함께
 * 보여주고 선택만 막았는데, 배정되지 않은 사람은 애초에 고를 일이 없어 목록만 길어졌다.
 *
 * 배정 가능 범위(퇴사일)도 여기서 반영한다 — `date` 가 주어지면 그 날짜에 꽂을 수 없는
 * 사람은 후보에서 빠진다. 판정은 서버가 내려준 값(`assignability`)만 쓴다.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import type { User } from "@/types";
import { canAssignOn, isNeverAssignable } from "@/lib/assignability";
import { displayName } from "@/lib/staffLabel";
import { useSearchState } from "@/hooks/useSearchState";

interface Props {
  /** 선택된 user id */
  value: string;
  onChange: (userId: string) => void;
  /** 이 매장에 배정된 직원 — 선택 가능한 후보 */
  eligible: User[];
  /** 변경 하이라이트 (수정 모달에서 원본과 달라졌을 때) */
  changed?: boolean;
  /** 매장 이름 — 빈 목록 안내 문구용 */
  storeName?: string;
  /** 대상 영업일 "YYYY-MM-DD" — 퇴사일 이후인 사람을 후보에서 뺀다 */
  date?: string;
}

function getInitials(name: string | null | undefined): string {
  if (!name) return "??";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "??";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return ((parts[0]![0] ?? "") + (parts[parts.length - 1]![0] ?? "")).toUpperCase();
}


/** 검색 대상: 이름 / username / 사번 — 사용자가 아는 식별자는 이 셋 중 하나다. */
function matches(u: User, q: string): boolean {
  if (!q) return true;
  const hay = `${u.full_name ?? ""} ${u.username ?? ""} ${u.employee_no ?? ""}`.toLowerCase();
  return hay.includes(q);
}

export function StaffPicker({ value, onChange, eligible, changed, storeName, date }: Props) {
  const [open, setOpen] = useState(false);
  // 검색 동작은 useSearchState 로 통일 (draft/committed 분리·IME 보정).
  const search = useSearchState({ delay: 0 });
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const q = search.committed.toLowerCase();

  const inStore = useMemo(
    () => eligible
      // 퇴사·비활성으로 이 날짜에 꽂을 수 없는 사람은 후보가 아니다.
      // (날짜를 모르면 "아예 배정 불가" 인 사람만 제외 — 서버 검증이 최종 방어선)
      .filter((u) => (date ? canAssignOn(u, date) : !isNeverAssignable(u)))
      .filter((u) => matches(u, q))
      .sort((a, b) => displayName(a).localeCompare(displayName(b))),
    [eligible, q, date],
  );

  const selected = useMemo(
    () => eligible.find((u) => u.id === value),
    [eligible, value],
  );

  // 바깥 클릭으로 닫기
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // ESC 는 "드롭다운만" 닫는다. capture 단계에서 잡고 전파를 끊어야
  // 모달의 document ESC 핸들러가 같이 발화해서 모달까지 닫히는 걸 막는다.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
      }
    }
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
    else search.clear();
    // search.clear 는 안정 콜백 — open 변화에만 반응한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`w-full flex items-center gap-2 px-3 py-2 border rounded-lg text-[13px] bg-[var(--color-surface)] text-left ${
          changed ? "border-[var(--color-accent)] bg-[var(--color-accent-muted)]" : "border-[var(--color-border)]"
        }`}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="flex-1 truncate text-[var(--color-text)]">
          {selected ? displayName(selected) : <span className="text-[var(--color-text-muted)]">Select staff</span>}
        </span>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8"
          className="shrink-0 text-[var(--color-text-muted)]">
          <polyline points="3 5 6 8 9 5" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 z-10 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl shadow-[0_8px_24px_rgba(0,0,0,0.15)] overflow-hidden">
          <div className="p-2 border-b border-[var(--color-border)]">
            <input
              ref={inputRef}
              value={search.value}
              {...search.imeProps}
              onChange={search.onChange}
              placeholder="Search by name or ID"
              className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] text-[13px] focus:outline-none focus:border-[var(--color-accent)]"
            />
          </div>

          <div className="max-h-[260px] overflow-y-auto overscroll-contain py-1">
            {inStore.map((u) => (
              <button
                key={u.id}
                type="button"
                onClick={() => { onChange(u.id); setOpen(false); }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-[var(--color-surface-hover)] ${
                  u.id === value ? "bg-[var(--color-accent-muted)]" : ""
                }`}
              >
                <span className="w-7 h-7 rounded-full bg-[var(--color-bg)] text-[var(--color-text-secondary)] flex items-center justify-center text-[10px] font-bold shrink-0">
                  {getInitials(u.full_name)}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[13px] text-[var(--color-text)] truncate">{displayName(u)}</span>
                  <span className="block text-[11px] text-[var(--color-text-muted)] truncate">
                    {u.role_name}
                    {u.employee_no ? ` · ${u.employee_no}` : ""}
                  </span>
                </span>
              </button>
            ))}

            {inStore.length === 0 && (
              <div className="px-3 py-6 text-center text-[12px] text-[var(--color-text-muted)]">
                {search.committed
                  ? "No staff match this search."
                  : `No staff assigned to ${storeName ?? "this store"} can be scheduled on this date.`}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
