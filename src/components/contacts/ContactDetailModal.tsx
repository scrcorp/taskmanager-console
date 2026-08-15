"use client";

/**
 * 연락처 상세 — 모달 본문.
 *
 * 상세에서만 `pending_request_count` 가 채워진다(계약). 신청이 걸려 있으면 여기서 알린다.
 * 편집/삭제는 여기서 직접 실행하지 않고 액션만 돌려준다 — 폼/확인 모달을 상세 위에
 * 겹쳐 쌓지 않기 위해서다.
 */

import React from "react";
import { AlertTriangle, Pencil, RefreshCw, Star, Trash2 } from "lucide-react";

import { Badge, Button, LoadingSpinner } from "@/components/ui";
import { useContact } from "@/hooks/useContacts";
import { describeApiError } from "@/lib/errorDisplay";
import { formatDateTime } from "@/lib/utils";
import type { Contact } from "@/types";

export type ContactDetailAction = { kind: "edit" | "delete"; contact: Contact };

interface ContactDetailModalProps {
  contactId: string;
  /** 목록에서 이미 받아둔 값 — 상세 로딩 동안 빈 화면 대신 이걸 먼저 보여준다. */
  fallback?: Contact;
  canUpdate: boolean;
  canDelete: boolean;
  onAction: (action: ContactDetailAction) => void;
  onClose: () => void;
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide text-text-muted">{label}</p>
      <div className="mt-0.5 text-sm text-text">{children}</div>
    </div>
  );
}

export function ContactDetailModal({
  contactId,
  fallback,
  canUpdate,
  canDelete,
  onAction,
  onClose,
}: ContactDetailModalProps): React.ReactElement {
  const query = useContact(contactId);
  const contact = query.data ?? fallback;

  if (!contact) {
    if (query.isError) {
      const err = describeApiError(query.error, {
        context: "load",
        fallback: "This contact couldn't be loaded.",
      });
      return (
        <div className="space-y-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-danger">
            <AlertTriangle size={15} /> Couldn&apos;t load this contact
          </p>
          <p className="text-xs text-text-secondary">
            {err.message}
            {err.hint ? ` ${err.hint}` : " It may have been deleted. Retry, or close and refresh the list."}
          </p>
          {err.reference && <p className="text-[11px] text-text-muted">{err.reference}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
            <Button onClick={() => void query.refetch()}>
              <RefreshCw size={14} /> Retry
            </Button>
          </div>
        </div>
      );
    }
    return (
      <div className="flex justify-center py-10">
        <LoadingSpinner />
      </div>
    );
  }

  const phones = [...contact.phones].sort(
    (a, b) => Number(b.is_primary) - Number(a.is_primary) || a.sort_order - b.sort_order,
  );

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-lg font-semibold text-text">{contact.name}</h3>
        <p className="text-xs text-text-muted">
          {contact.store_name
            ? `Visible to ${contact.store_name} (plus GMs and Owners)`
            : "Shared with the whole organization"}
        </p>
      </div>

      {contact.pending_request_count > 0 && (
        <div className="rounded-lg border border-warning/40 bg-warning-muted px-3 py-2 text-xs text-text-secondary">
          {contact.pending_request_count} change request
          {contact.pending_request_count === 1 ? "" : "s"} for this contact
          {contact.pending_request_count === 1 ? " is" : " are"} waiting for review.
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Company">{contact.company || "—"}</Field>
        <Field label="Email">{contact.email || "—"}</Field>
      </div>

      <Field label="Phone numbers">
        {phones.length === 0 ? (
          "—"
        ) : (
          <ul className="space-y-1">
            {phones.map((p) => (
              <li key={p.id} className="flex items-center gap-2">
                {p.is_primary && <Star size={12} className="text-accent" fill="currentColor" />}
                <span className="font-medium">{p.number}</span>
                {p.label && <span className="text-xs text-text-muted">{p.label}</span>}
              </li>
            ))}
          </ul>
        )}
      </Field>

      <Field label="Tags">
        {contact.tags.length === 0 ? (
          "—"
        ) : (
          <div className="flex flex-wrap gap-1">
            {contact.tags.map((t) => (
              <Badge key={t.id} variant="accent">
                {t.name}
              </Badge>
            ))}
          </div>
        )}
      </Field>

      <Field label="Memo">
        <span className="whitespace-pre-wrap">{contact.memo || "—"}</span>
      </Field>

      <p className="text-xs text-text-muted">
        Added by {contact.created_by_name ?? "unknown"} on {formatDateTime(contact.created_at)}
        {contact.updated_at !== contact.created_at
          ? ` · last updated ${formatDateTime(contact.updated_at)}`
          : ""}
      </p>

      <div className="flex flex-wrap justify-end gap-2 pt-1">
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
        <Button variant="secondary" onClick={() => onAction({ kind: "delete", contact })}>
          <Trash2 size={14} /> {canDelete ? "Delete" : "Request deletion"}
        </Button>
        <Button onClick={() => onAction({ kind: "edit", contact })}>
          <Pencil size={14} /> {canUpdate ? "Edit" : "Request a change"}
        </Button>
      </div>
    </div>
  );
}
