"use client";

/**
 * 커밋 요약 — 예외 제외 건수 + 커밋 후 커서 (계약 §3-4 응답의 exception_count /
 * cursor_after). "2 exceptions excluded → next EMPID 1501" 형태로 보여준다.
 *
 * 값은 전부 서버가 준 것이다. 콘솔은 다음 번호를 계산하지 않는다(INV-8).
 *
 * Post-commit summary: how many numbers were kept out of the sequence, and
 * where the cursor stands now for each affected scope.
 */

import React from "react";

export function EmpidCommitSummary({
  exceptionCount,
  cursorAfter,
  scopeName,
}: {
  /** 이번 커밋에서 예외로 기록된 건수 (Numbers recorded as exceptions) */
  exceptionCount?: number | null;
  /** 스코프 id → 커밋 후 커서 (Scope id → cursor after the commit) */
  cursorAfter?: Record<string, number> | null;
  /** 스코프 id 를 사람이 읽는 이름으로 (Resolve a scope id to a display name) */
  scopeName?: (id: string) => string | undefined;
}): React.ReactElement | null {
  const cursors = Object.entries(cursorAfter ?? {});
  if ((exceptionCount ?? 0) === 0 && cursors.length === 0) return null;
  const excluded =
    (exceptionCount ?? 0) > 0
      ? `${exceptionCount} exception${exceptionCount === 1 ? "" : "s"} excluded`
      : null;
  return (
    <div className="rounded-lg bg-surface-hover p-3">
      <p className="text-xs font-semibold text-text-secondary mb-1">Numbering</p>
      {cursors.length === 0 ? (
        <p className="text-xs text-text">
          {excluded} — the next EMPID is unchanged.
        </p>
      ) : (
        <ul className="text-xs text-text space-y-0.5">
          {cursors.map(([id, next]) => {
            const name = scopeName?.(id);
            return (
              <li key={id}>
                {excluded ? `${excluded} → ` : ""}
                next EMPID {next}
                {name ? ` (${name})` : ""}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
