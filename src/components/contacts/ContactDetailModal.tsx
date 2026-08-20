"use client";

/**
 * 연락처 상세 — 모달 본문.
 *
 * 상세에서만 `pending_request_count` 가 채워진다(계약). 신청이 걸려 있으면 여기서 알린다.
 * 편집/삭제는 여기서 직접 실행하지 않고 액션만 돌려준다 — 폼/확인 모달을 상세 위에
 * 겹쳐 쌓지 않기 위해서다.
 */

import React from "react";
import { AlertTriangle, Pencil, Plus, RefreshCw, Star, Trash2 } from "lucide-react";

import { Badge, Button, LoadingSpinner } from "@/components/ui";
import { useContact } from "@/hooks/useContacts";
import { describeApiError } from "@/lib/errorDisplay";
import { formatDateTime } from "@/lib/utils";
import type { Contact } from "@/types";
import { visibilitySentence } from "./visibilityLabel";
import { CopyLine, LinkLine, SectionHead } from "./contactFieldUI";

export type ContactDetailAction =
  | { kind: "edit" | "delete"; contact: Contact }
  /** 태그를 눌러 **그 글자를 검색창에 넣는다** (확장 U3). 태그 필터가 아니라 통합 검색이다. */
  | { kind: "searchTag"; tagName: string };

interface ContactDetailModalProps {
  contactId: string;
  /** 목록에서 이미 받아둔 값 — 상세 로딩 동안 빈 화면 대신 이걸 먼저 보여준다. */
  fallback?: Contact;
  canUpdate: boolean;
  canDelete: boolean;
  onAction: (action: ContactDetailAction) => void;
  /** 별 토글 — 상세를 닫지 않고 그 자리에서 켜고 끈다. */
  onToggleFavorite: (contact: Contact) => void;
  onClose: () => void;
}

export function ContactDetailModal({
  contactId,
  fallback,
  canUpdate,
  canDelete,
  onAction,
  onToggleFavorite,
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
  const emails = [...contact.emails].sort(
    (a, b) => Number(b.is_primary) - Number(a.is_primary) || a.sort_order - b.sort_order,
  );
  const links = [...contact.links].sort((a, b) => a.sort_order - b.sort_order);

  /** 아직 안 채운 항목 — 없는 값을 "—" 로 늘어놓는 대신, 채우러 가는 길만 남긴다. */
  const missing: string[] = [];
  if (!contact.company) missing.push("Company");
  if (!contact.summary) missing.push("Summary");
  if (phones.length === 0) missing.push("Phone");
  if (emails.length === 0) missing.push("Email");
  if (links.length === 0) missing.push("Link");
  if (contact.tags.length === 0) missing.push("Tags");
  if (!contact.notes) missing.push("Notes");

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={() => onToggleFavorite(contact)}
          aria-pressed={contact.is_favorite}
          title={contact.is_favorite ? "Remove from favorites" : "Add to favorites"}
          className={`mt-0.5 rounded-lg p-1 transition-colors ${
            contact.is_favorite
              ? "text-warning hover:bg-warning-muted"
              : "text-text-muted hover:bg-warning-muted hover:text-warning"
          }`}
        >
          <Star size={18} fill={contact.is_favorite ? "currentColor" : "none"} />
        </button>
        <div className="min-w-0">
          <h3 className="text-lg font-semibold text-text">{contact.name}</h3>
          {contact.company && (
            <p className="text-sm text-text-secondary">{contact.company}</p>
          )}
          <p className="text-xs text-text-muted">{visibilitySentence(contact)}</p>
        </div>
      </div>

      {contact.pending_request_count > 0 && (
        <div className="rounded-lg border border-warning/40 bg-warning-muted px-3 py-2 text-xs text-text-secondary">
          {contact.pending_request_count} change request
          {contact.pending_request_count === 1 ? "" : "s"} for this contact
          {contact.pending_request_count === 1 ? " is" : " are"} waiting for review.
        </div>
      )}

      {/* 값이 있는 것만 보여준다 — 빈 칸을 "—" 로 채우면 읽을 게 없는 자리를 계속 훑게 된다 */}
      {contact.summary && (
        <section>
          <SectionHead label="Summary" />
          <CopyLine value={contact.summary} muted />
        </section>
      )}

      {phones.length > 0 && (
        <section>
          <SectionHead channel="phone" count={phones.length} />
          {phones.map((p) => (
            <CopyLine key={p.id} value={p.number} label={p.label} />
          ))}
        </section>
      )}

      {emails.length > 0 && (
        <section>
          <SectionHead channel="email" count={emails.length} />
          {emails.map((e) => (
            <CopyLine key={e.id} value={e.address} label={e.label} />
          ))}
        </section>
      )}

      {links.length > 0 && (
        <section>
          <SectionHead channel="link" count={links.length} />
          {links.map((l) => (
            <LinkLine key={l.id} url={l.url} label={l.label} />
          ))}
        </section>
      )}

      {contact.tags.length > 0 && (
        <section>
          <SectionHead label="Tags" />
          <div className="flex flex-wrap gap-1">
            {contact.tags.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => onAction({ kind: "searchTag", tagName: t.name })}
                title={`Search for ${t.name}`}
                className="rounded-full transition-opacity hover:opacity-80 focus:outline-none focus:ring-2 focus:ring-accent/50"
              >
                <Badge variant="accent">{t.name}</Badge>
              </button>
            ))}
          </div>
        </section>
      )}

      {contact.notes && (
        <section>
          <SectionHead label="Notes" />
          <p className="whitespace-pre-wrap text-sm text-text-secondary">{contact.notes}</p>
        </section>
      )}

      {missing.length > 0 && canUpdate && (
        <section className="border-t border-border pt-3">
          <SectionHead label="Not saved yet" />
          <div className="flex flex-wrap gap-1.5">
            {missing.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => onAction({ kind: "edit", contact })}
                className="inline-flex items-center gap-1 rounded-full border border-dashed border-border bg-surface px-3 py-1 text-xs font-medium text-text-secondary transition-colors hover:border-accent hover:bg-accent-muted hover:text-accent"
              >
                <Plus size={12} /> {m}
              </button>
            ))}
          </div>
        </section>
      )}

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
