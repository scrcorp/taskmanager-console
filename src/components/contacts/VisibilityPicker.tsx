"use client";

/**
 * 가시성 피커 — 모드 + 3축 대상(매장/직급/개인) + 열람자 미리보기 + 개인 제외.
 *
 * 설계 근거 (docs/99_inbox/2026-08-15-연락처-다축-가시성-설계.md V1~V7):
 *  - 대상은 **OR** 로 합쳐진다 — 고를수록 보는 사람이 늘어난다.
 *  - 그 결과를 **사람 명단으로 풀어 보여주고** 거기서 개인을 뺀다.
 *    "체크를 늘렸는데 보는 사람이 줄어드는" AND 방식은 쓰지 않는다.
 *  - Owner 는 항상 보이고 **뺄 수 없다**. 명단에서 제외 버튼이 아예 없다.
 *  - 대상 0개인 `restricted` 는 저장을 막는다 — 실수가 공개 방향으로 나면 안 된다.
 *
 * `position` 축은 없다: 이 프로젝트에서 position 은 매장별 근무 역할이라
 * "직책이 X인 사람" 집합이 존재하지 않는다.
 */

import { staffStatusOf } from "@/components/ui/StaffStatusBadge";
import React, { useState } from "react";
import { Search, X } from "lucide-react";

import { useRoles } from "@/hooks/useRoles";
import { useStores } from "@/hooks/useStores";
import { useUsers } from "@/hooks/useUsers";
import { useVisibilityPreview } from "@/hooks/useContacts";
import type { ContactTargetInput, ContactTargetType, ContactVisibility } from "@/types";

interface VisibilityPickerProps {
  visibility: ContactVisibility;
  targets: ContactTargetInput[];
  excludedUserIds: string[];
  error?: string;
  onChange: (next: {
    visibility: ContactVisibility;
    targets: ContactTargetInput[];
    excluded_user_ids: string[];
  }) => void;
}

const AXES: { type: ContactTargetType; label: string; hint: string }[] = [
  { type: "store", label: "Stores", hint: "Everyone assigned to the store" },
  { type: "role", label: "Roles", hint: "Everyone with that role — follows promotions" },
  { type: "user", label: "People", hint: "Named individuals" },
];

export function VisibilityPicker({
  visibility,
  targets,
  excludedUserIds,
  error,
  onChange,
}: VisibilityPickerProps): React.ReactElement {
  const [axis, setAxis] = useState<ContactTargetType>("store");
  const [search, setSearch] = useState("");

  const { data: stores } = useStores();
  const { data: roles } = useRoles();
  const { data: users } = useUsers();
  const preview = useVisibilityPreview(visibility, targets, excludedUserIds);

  const has = (type: ContactTargetType, id: string): boolean =>
    targets.some((t) => t.type === type && t.id === id);

  function toggle(type: ContactTargetType, id: string): void {
    const next = has(type, id)
      ? targets.filter((t) => !(t.type === type && t.id === id))
      : [...targets, { type, id }];
    onChange({ visibility, targets: next, excluded_user_ids: excludedUserIds });
  }

  function setMode(next: ContactVisibility): void {
    // 전 조직으로 바꾸면 대상·제외를 비운다 — 서버가 모순 상태를 거부한다.
    if (next === "organization") {
      onChange({ visibility: next, targets: [], excluded_user_ids: [] });
      return;
    }
    onChange({ visibility: next, targets, excluded_user_ids: excludedUserIds });
  }

  function exclude(userId: string): void {
    if (excludedUserIds.includes(userId)) return;
    onChange({
      visibility,
      // 포함으로도 지정돼 있으면 같이 뺀다 — 안 그러면 뺐는데 다시 들어온 것처럼 보인다.
      targets: targets.filter((t) => !(t.type === "user" && t.id === userId)),
      excluded_user_ids: [...excludedUserIds, userId],
    });
  }

  function unexclude(userId: string): void {
    onChange({
      visibility,
      targets,
      excluded_user_ids: excludedUserIds.filter((id) => id !== userId),
    });
  }

  const options: { id: string; name: string }[] =
    axis === "store"
      ? (stores ?? []).map((s) => ({ id: s.id, name: s.name }))
      : axis === "role"
        ? (roles ?? []).map((r) => ({ id: r.id, name: r.name }))
        : (users ?? [])
            /*
              1차 억제 — 퇴사·비활성 직원은 공개 대상 후보에서 뺀다 (2026-08-19).
              **이미 지정된 사람은 남긴다** — 후보에서 사라지면 기존 설정을 볼 수도,
              해제할 수도 없게 된다.
            */
            .filter((u) => u.is_active !== false || has("user", u.id))
            .map((u) => {
              // 옵션이 문자열 목록이라 배지 대신 이름 뒤에 상태를 적는다.
              const status = staffStatusOf(u);
              const base = u.full_name || u.username;
              return { id: u.id, name: status ? `${base} — ${status.label}` : base };
            });

  const filtered = search.trim()
    ? options.filter((o) => o.name.toLowerCase().includes(search.trim().toLowerCase()))
    : options;

  const excludedNames = excludedUserIds.map((id) => ({
    id,
    name:
      (users ?? []).find((u) => u.id === id)?.full_name ||
      (users ?? []).find((u) => u.id === id)?.username ||
      id,
  }));

  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-medium text-text-secondary">Visible to</span>

      <label className="flex cursor-pointer items-start gap-2 rounded px-2 py-1.5 text-sm hover:bg-surfaceHover">
        <input
          type="radio"
          name="contact-visibility"
          className="mt-0.5 accent-accent"
          checked={visibility === "organization"}
          onChange={() => setMode("organization")}
        />
        <span>
          <span className="text-text">Everyone in the organization</span>
          <span className="block text-xs text-text-muted">
            Anyone with contacts access can see it.
          </span>
        </span>
      </label>

      <label className="flex cursor-pointer items-start gap-2 rounded px-2 py-1.5 text-sm hover:bg-surfaceHover">
        <input
          type="radio"
          name="contact-visibility"
          className="mt-0.5 accent-accent"
          checked={visibility === "restricted"}
          onChange={() => setMode("restricted")}
        />
        <span>
          <span className="text-text">Only the people I pick</span>
          <span className="block text-xs text-text-muted">
            Pick stores, roles or people. Owners and you always keep access.
          </span>
        </span>
      </label>

      {visibility === "restricted" && (
        <div className="ml-6 flex flex-col gap-2">
          {/* 축 전환 */}
          <div className="flex gap-1">
            {AXES.map((a) => {
              const count = targets.filter((t) => t.type === a.type).length;
              return (
                <button
                  key={a.type}
                  type="button"
                  onClick={() => {
                    setAxis(a.type);
                    setSearch("");
                  }}
                  title={a.hint}
                  className={
                    axis === a.type
                      ? "rounded-lg border border-accent bg-accent-muted px-2.5 py-1 text-xs font-medium text-accent"
                      : "rounded-lg border border-border px-2.5 py-1 text-xs text-text-secondary transition-colors hover:text-text"
                  }
                >
                  {a.label}
                  {count > 0 && <span className="ml-1 text-[10px]">({count})</span>}
                </button>
              );
            })}
          </div>

          {/* 검색 — 사람이 많으면 목록만으로는 못 찾는다 */}
          <div className="relative">
            <Search
              size={13}
              className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-text-muted"
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${AXES.find((a) => a.type === axis)?.label.toLowerCase()}`}
              aria-label="Search visibility targets"
              className="w-full rounded-lg border border-border bg-surface py-1.5 pl-7 pr-2 text-xs text-text placeholder:text-text-muted focus:border-accent focus:outline-none"
            />
          </div>

          <div className="flex max-h-44 flex-col gap-0.5 overflow-y-auto rounded border border-border p-1.5">
            {filtered.length === 0 ? (
              <p className="px-2 py-1.5 text-xs text-text-muted">Nothing to pick here.</p>
            ) : (
              filtered.map((o) => (
                <label
                  key={o.id}
                  className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-surfaceHover"
                >
                  <input
                    type="checkbox"
                    className="accent-accent"
                    checked={has(axis, o.id)}
                    onChange={() => toggle(axis, o.id)}
                  />
                  <span className="text-text">{o.name}</span>
                </label>
              ))
            )}
          </div>

          {/* 열람자 미리보기 — 대상이 동적이라 "지금 몇 명"을 숫자로 드러낸다 (V5) */}
          <div className="rounded-lg border border-border bg-surface/50 p-2">
            <p className="text-xs font-medium text-text-secondary">
              {preview.isPending
                ? "Working out who can see this…"
                : `${preview.data?.total ?? 0} people can see this right now`}
            </p>
            {(preview.data?.viewers ?? []).length > 0 && (
              <ul className="mt-1.5 flex max-h-32 flex-col gap-0.5 overflow-y-auto">
                {(preview.data?.viewers ?? []).map((v) => (
                  <li
                    key={v.id}
                    className="flex items-center justify-between gap-2 rounded px-1.5 py-1 text-xs"
                  >
                    <span className="min-w-0 truncate text-text">
                      {v.name}
                      <span className="ml-1.5 text-[10px] text-text-muted">{v.reason}</span>
                    </span>
                    {v.can_exclude ? (
                      <button
                        type="button"
                        onClick={() => exclude(v.id)}
                        className="shrink-0 rounded p-0.5 text-text-muted transition-colors hover:text-danger"
                        aria-label={`Remove ${v.name}`}
                        title="Remove this person"
                      >
                        <X size={12} />
                      </button>
                    ) : (
                      // Owner 는 못 뺀다 (V1) — 버튼을 숨기고 이유를 남긴다.
                      <span className="shrink-0 text-[10px] text-text-muted">always</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {excludedNames.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-text-muted">Removed:</span>
              {excludedNames.map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => unexclude(u.id)}
                  title="Put this person back"
                  className="inline-flex items-center gap-1 rounded-full bg-danger-muted px-2 py-0.5 text-xs text-danger transition-opacity hover:opacity-80"
                >
                  {u.name} <X size={10} />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {error && <p className="text-xs text-danger">{error}</p>}
    </div>
  );
}
