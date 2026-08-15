"use client";

/**
 * StaffPicker — 스케줄 등록/수정 모달의 Staff 선택 필드.
 *
 * 왜 native select 를 대체하나:
 *   직원이 200명을 넘으면 select 스크롤로는 못 찾는다. 이름을 아는 상태에서
 *   바로 좁히는 게 유일하게 실용적인 방법이라 검색형으로 간다.
 *
 * 두 종류의 직원을 한 목록에서 보여준다:
 *   - 이 매장 소속 (eligible)      → 선택 가능
 *   - 조직에는 있지만 이 매장 아님 → 선택 불가 + "왜 안 되는지" 와 다음 행동(매장에 추가)을 같이 제공
 *
 * 후자를 아예 숨기지 않는 이유: 이름을 아는 사람이 목록에 없으면 사용자는 "시스템에 없나?"
 * 로 오해한다. 보이되 막고, 해결 경로(스태프 상세 새 탭)를 주는 편이 실수를 줄인다.
 *
 * 매장 추가 후에는 새 탭에서 돌아오는 순간 users 쿼리를 무효화해서 자동으로 선택 가능해진다
 * (창 포커스 복귀 = 사용자가 뭔가 하고 왔다는 신호).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useUsers } from "@/hooks/useUsers";
import type { User } from "@/types";

interface Props {
  /** 선택된 user id */
  value: string;
  onChange: (userId: string) => void;
  /** 이 매장에 배정된 직원 — 선택 가능한 후보 */
  eligible: User[];
  /** 변경 하이라이트 (수정 모달에서 원본과 달라졌을 때) */
  changed?: boolean;
  /** 매장 이름 — "not in <store>" 문구용 */
  storeName?: string;
}

function getInitials(name: string | null | undefined): string {
  if (!name) return "??";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "??";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return ((parts[0]![0] ?? "") + (parts[parts.length - 1]![0] ?? "")).toUpperCase();
}

function displayName(u: User): string {
  return u.full_name || u.username;
}

/** 검색 대상: 이름 / username / 사번 — 사용자가 아는 식별자는 이 셋 중 하나다. */
function matches(u: User, q: string): boolean {
  if (!q) return true;
  const hay = `${u.full_name ?? ""} ${u.username ?? ""} ${u.employee_no ?? ""}`.toLowerCase();
  return hay.includes(q);
}

export function StaffPicker({ value, onChange, eligible, changed, storeName }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const queryClient = useQueryClient();

  // 조직 전체 직원 — 이 매장 밖 인원을 "있지만 배정 안 됨" 으로 보여주기 위해서만 쓴다.
  // 유령(미가입) 계정도 스케줄 대상이라 포함.
  const allUsersQ = useUsers({ include_provisional: true });

  const eligibleIds = useMemo(() => new Set(eligible.map((u) => u.id)), [eligible]);

  const q = query.trim().toLowerCase();

  const inStore = useMemo(
    () => eligible.filter((u) => matches(u, q)).sort((a, b) => displayName(a).localeCompare(displayName(b))),
    [eligible, q],
  );

  const outOfStore = useMemo(() => {
    const all = allUsersQ.data ?? [];
    return all
      .filter((u) => !eligibleIds.has(u.id) && matches(u, q))
      .sort((a, b) => displayName(a).localeCompare(displayName(b)));
  }, [allUsersQ.data, eligibleIds, q]);

  const selected = useMemo(
    () => eligible.find((u) => u.id === value) ?? (allUsersQ.data ?? []).find((u) => u.id === value),
    [eligible, allUsersQ.data, value],
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

  // 새 탭에서 매장 배정하고 돌아온 경우 — 목록을 다시 읽어 disable 을 자동으로 푼다.
  useEffect(() => {
    if (!open) return;
    function onFocus() {
      void queryClient.invalidateQueries({ queryKey: ["users"] });
    }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [open, queryClient]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
    else setQuery("");
  }, [open]);

  const notInStoreLabel = storeName ? `Not in ${storeName}` : "Not in this store";

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
              value={query}
              onChange={(e) => setQuery(e.target.value)}
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

            {outOfStore.length > 0 && (
              <>
                <div className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                  {notInStoreLabel}
                </div>
                {outOfStore.map((u) => (
                  <div key={u.id} className="w-full flex items-center gap-2 px-3 py-2 opacity-60">
                    <span className="w-7 h-7 rounded-full bg-[var(--color-bg)] text-[var(--color-text-muted)] flex items-center justify-center text-[10px] font-bold shrink-0">
                      {getInitials(u.full_name)}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-[13px] text-[var(--color-text-secondary)] truncate">{displayName(u)}</span>
                      {/* 동명이인이 있을 수 있어 role·사번을 같이 보여준다 — 이름만으론 구분이 안 된다. */}
                      <span className="block text-[11px] text-[var(--color-text-muted)] truncate">
                        {u.role_name}
                        {u.employee_no ? ` · ${u.employee_no}` : ""} · {notInStoreLabel}
                      </span>
                    </span>
                    {/*
                      새 탭으로 여는 이유: 이 모달은 입력 중인 폼이다. 같은 탭에서 이동하면
                      작성 중이던 스케줄이 날아간다.
                    */}
                    <a
                      href={`/users/${u.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 text-[11px] font-semibold text-[var(--color-accent)] hover:underline whitespace-nowrap"
                    >
                      Add to store ↗
                    </a>
                  </div>
                ))}
              </>
            )}

            {inStore.length === 0 && outOfStore.length === 0 && (
              <div className="px-3 py-6 text-center text-[12px] text-[var(--color-text-muted)]">
                {allUsersQ.isLoading ? "Loading staff…" : "No staff match this search."}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
