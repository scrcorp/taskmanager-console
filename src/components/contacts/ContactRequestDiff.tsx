"use client";

/**
 * 신청 내용 ↔ 현재 값 비교표.
 *
 * 승인자가 "무엇이 바뀌는지"를 눈으로 보고 판단할 수 있어야 한다. 바뀌는 줄만 강조하고
 * 그대로인 줄은 흐리게 둔다.
 *
 * 수정 신청 payload 는 **전체 치환**이라, payload 에 없는 값은 "비움"이 된다(계약).
 * 그래서 비교표도 "생략 = 변화 없음"이 아니라 "생략 = 빈 값"으로 읽는다.
 */

import React from "react";

import { useStores } from "@/hooks/useStores";
import type { Contact, ContactChangeRequest, ContactRequestPayload } from "@/types";

const EMPTY = "—";

function formatPhones(
  phones: { label?: string | null; number: string; is_primary?: boolean }[] | undefined,
): string {
  if (!phones || phones.length === 0) return EMPTY;
  return phones
    .map((p) => {
      const label = p.label ? `${p.label}: ` : "";
      const star = p.is_primary ? " (primary)" : "";
      return `${label}${p.number}${star}`;
    })
    .join("\n");
}

function formatTags(tags: string[] | undefined): string {
  return tags && tags.length > 0 ? tags.join(", ") : EMPTY;
}

interface DiffRow {
  field: string;
  current: string;
  proposed: string;
}

export function ContactRequestDiff({
  request,
}: {
  request: ContactChangeRequest;
}): React.ReactElement {
  const { data: stores } = useStores();

  function storeLabel(storeId: string | null | undefined): string {
    if (!storeId) return "Shared with the whole organization";
    return (stores ?? []).find((s) => s.id === storeId)?.name ?? "A store you cannot access";
  }

  const current: Contact | null = request.current_contact;
  const payload: ContactRequestPayload | null = request.payload;

  if (request.request_type === "delete") {
    return (
      <div className="space-y-3">
        <p className="rounded-lg border border-danger/40 bg-danger/5 px-3 py-2 text-xs text-text-secondary">
          Approving removes this contact from the directory. It is a soft delete — the change
          history keeps a record.
        </p>
        {current ? (
          <dl className="space-y-2 rounded-lg border border-border bg-surface/50 p-3 text-sm">
            <Row label="Name" value={current.name} />
            <Row label="Company" value={current.company || EMPTY} />
            <Row label="Phone numbers" value={formatPhones(current.phones)} />
            <Row label="Email" value={current.email || EMPTY} />
            <Row label="Tags" value={formatTags(current.tags.map((t) => t.name))} />
            <Row label="Memo" value={current.memo || EMPTY} />
            <Row label="Visible to" value={storeLabel(current.store_id)} />
          </dl>
        ) : (
          <p className="text-xs text-text-muted">
            The target contact is no longer available, so its current values cannot be shown.
          </p>
        )}
      </div>
    );
  }

  if (!payload) {
    return (
      <p className="text-xs text-text-muted">This request carries no content to review.</p>
    );
  }

  const rows: DiffRow[] = [
    { field: "Name", current: current?.name ?? EMPTY, proposed: payload.name || EMPTY },
    {
      field: "Company",
      current: current?.company || EMPTY,
      proposed: payload.company || EMPTY,
    },
    {
      field: "Phone numbers",
      current: current ? formatPhones(current.phones) : EMPTY,
      proposed: formatPhones(payload.phones),
    },
    { field: "Email", current: current?.email || EMPTY, proposed: payload.email || EMPTY },
    {
      field: "Tags",
      current: current ? formatTags(current.tags.map((t) => t.name)) : EMPTY,
      proposed: formatTags(payload.tags),
    },
    { field: "Memo", current: current?.memo || EMPTY, proposed: payload.memo || EMPTY },
    {
      field: "Visible to",
      current: current ? storeLabel(current.store_id) : EMPTY,
      proposed: storeLabel(payload.store_id),
    },
  ];

  // 비교 대상이 없으면(신규 등록 신청, 또는 현재 값이 실리지 않는 "내 신청" 목록)
  // 한 열로 신청 내용만 보여준다.
  if (request.request_type === "create" || !current) {
    return (
      <div>
        {!current && request.request_type === "update" && (
          <p className="mb-2 text-xs text-text-muted">
            This is what you submitted. The contact&apos;s current values are not shown here.
          </p>
        )}
        <dl className="space-y-2 rounded-lg border border-border bg-surface/50 p-3 text-sm">
          {rows.map((r) => (
            <Row key={r.field} label={r.field} value={r.proposed} />
          ))}
        </dl>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full min-w-[420px] text-sm">
        <thead>
          <tr className="border-b border-border bg-surface/50 text-left text-xs uppercase tracking-wide text-text-muted">
            <th className="px-3 py-2 font-medium">Field</th>
            <th className="px-3 py-2 font-medium">Current</th>
            <th className="px-3 py-2 font-medium">Proposed</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const changed = r.current !== r.proposed;
            return (
              <tr key={r.field} className="border-b border-border last:border-b-0">
                <td className="px-3 py-2 align-top text-xs font-medium text-text-secondary">
                  {r.field}
                </td>
                <td
                  className={
                    changed
                      ? "whitespace-pre-wrap px-3 py-2 align-top text-text-muted line-through decoration-text-muted/60"
                      : "whitespace-pre-wrap px-3 py-2 align-top text-text-muted"
                  }
                >
                  {r.current}
                </td>
                <td
                  className={
                    changed
                      ? "whitespace-pre-wrap px-3 py-2 align-top font-medium text-accent"
                      : "whitespace-pre-wrap px-3 py-2 align-top text-text-muted"
                  }
                >
                  {r.proposed}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <div className="flex gap-3">
      <dt className="w-28 shrink-0 text-xs font-medium uppercase tracking-wide text-text-muted">
        {label}
      </dt>
      <dd className="min-w-0 flex-1 whitespace-pre-wrap text-text">{value}</dd>
    </div>
  );
}
