"use client";

/**
 * Issue 조회 범위 선택 (확대 전용).
 *
 * 축소 옵션은 제공하지 않는다 — issue report 는 위로 올리는 보고라 은폐 수단이
 * 되면 안 된다. 세 값 모두 '기본 범위 + 추가'다.
 */

import React from "react";

import {
  ISSUE_VISIBILITY_SCOPES,
  ISSUE_VISIBILITY_SCOPE_LABELS,
  type IssueVisibilityScope,
} from "@/types";

/** payload 를 정규화 — visibility_scope 우선, 없으면 legacy share_with_store_all. */
export function readVisibilityScope(payload: {
  visibility_scope?: string | null;
  share_with_store_all?: boolean;
}): IssueVisibilityScope {
  const raw = payload.visibility_scope;
  if (
    raw &&
    (ISSUE_VISIBILITY_SCOPES as readonly string[]).includes(raw)
  ) {
    return raw as IssueVisibilityScope;
  }
  if (payload.share_with_store_all) return "store_all";
  return "default";
}

export function IssueVisibilityScopeField({
  value,
  onChange,
  disabled,
}: {
  value: IssueVisibilityScope;
  onChange: (next: IssueVisibilityScope) => void;
  disabled?: boolean;
}): React.ReactElement {
  return (
    <div className="space-y-2">
      {ISSUE_VISIBILITY_SCOPES.map((scope) => {
        const meta = ISSUE_VISIBILITY_SCOPE_LABELS[scope];
        const selected = value === scope;
        return (
          <label
            key={scope}
            className={`flex items-start gap-2 rounded-md border p-3 cursor-pointer transition-colors ${
              selected
                ? "border-accent bg-accentMuted/40"
                : "border-border bg-surface hover:border-accent/50"
            } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            <input
              type="radio"
              name="issue-visibility-scope"
              value={scope}
              checked={selected}
              disabled={disabled}
              onChange={() => onChange(scope)}
              className="accent-accent mt-0.5"
            />
            <span className="flex-1">
              <span className="block text-sm font-medium text-text">
                {meta.label}
              </span>
              <span className="block text-xs text-textMuted mt-0.5">
                {meta.description}
              </span>
            </span>
          </label>
        );
      })}
    </div>
  );
}
