"use client";

/**
 * Requests — 쓰기 권한자용 신청 처리 화면 (설계 P2 / N2).
 *
 * 알림은 v1 비범위(N3)라 이 화면이 유일한 확인 경로다. 그래서 기본 필터를 pending 으로
 * 두고, 처리 가능한 것만 보이게 한다(서버도 처리 가능한 종류만 내려준다).
 */

import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

import { Badge, Pagination, Select, Table } from "@/components/ui";
import type { Column } from "@/components/ui/Table";
import { useModal } from "@/components/ui/imperative-modal";
import {
  useApproveContactRequest,
  useContactRequests,
  useRejectContactRequest,
} from "@/hooks/useContacts";
import { usePermissions } from "@/hooks/usePermissions";
import { usePersistedFilters } from "@/hooks/usePersistedFilters";
import { describeApiError } from "@/lib/errorDisplay";
import { PERMISSIONS } from "@/lib/permissions";
import { formatDateTime } from "@/lib/utils";
import type {
  ContactChangeRequest,
  ContactRequestPayload,
  ContactRequestStatus,
  ContactRequestType,
} from "@/types";
import { ContactForm } from "./ContactForm";
import {
  ContactRequestReview,
  REQUEST_STATUS_LABEL,
  REQUEST_TYPE_LABEL,
  requestStatusVariant,
  type ContactRequestAction,
} from "./ContactRequestReview";
import {
  draftFromContact,
  draftFromPayload,
  draftToPayload,
  type ContactDraft,
} from "./contactDraft";

const PER_PAGE = 20;

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "pending", label: "Waiting for review" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "cancelled", label: "Cancelled" },
  { value: "superseded", label: "Closed (contact deleted)" },
  { value: "all", label: "All statuses" },
];

const TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "All kinds" },
  { value: "create", label: "New contact" },
  { value: "update", label: "Change" },
  { value: "delete", label: "Deletion" },
];

function parseStatus(value: string): ContactRequestStatus | "all" {
  const known = STATUS_OPTIONS.some((o) => o.value === value);
  return known ? (value as ContactRequestStatus | "all") : "pending";
}

function parseType(value: string): ContactRequestType | undefined {
  return value === "create" || value === "update" || value === "delete" ? value : undefined;
}

export function ContactRequestsPanel(): React.ReactElement {
  const modal = useModal();
  const { hasPermission } = usePermissions();
  const approveMut = useApproveContactRequest();
  const rejectMut = useRejectContactRequest();

  const [filters, setFilters] = usePersistedFilters("contacts.requests", {
    status: "pending",
    kind: "",
    rpage: "1",
  });
  const page = Number(filters.rpage) || 1;
  const status = parseStatus(filters.status);
  const requestType = parseType(filters.kind);

  const query = useContactRequests({
    status,
    request_type: requestType,
    page,
    per_page: PER_PAGE,
  });

  const items = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  const loadError = query.isError
    ? describeApiError(query.error, {
        context: "load",
        fallback: "Requests couldn't be loaded.",
      })
    : null;

  /** 종류별 쓰기 권한 — 서버와 같은 매핑(계약). */
  function canResolve(type: ContactRequestType): boolean {
    if (type === "create") return hasPermission(PERMISSIONS.CONTACTS_CREATE);
    if (type === "update") return hasPermission(PERMISSIONS.CONTACTS_UPDATE);
    return hasPermission(PERMISSIONS.CONTACTS_DELETE);
  }

  async function approve(
    request: ContactChangeRequest,
    payload?: ContactRequestPayload,
    presetNote?: string,
  ): Promise<void> {
    let note = presetNote;
    if (note === undefined) {
      const answer = await modal.confirm({
        requiresReason: true,
        title: request.request_type === "delete" ? "Approve deletion?" : "Approve this request?",
        message:
          request.request_type === "delete"
            ? `"${request.contact_name ?? "This contact"}" will be removed from the directory as soon as you approve.`
            : "The proposed values are applied immediately and recorded in the change history.",
        confirmLabel: "Approve",
        reasonLabel: "Note for the requester (optional)",
      });
      if (answer === undefined) return;
      note = answer;
    }

    const trimmedNote = note.trim();
    try {
      await approveMut.mutateAsync({
        requestId: request.id,
        data: {
          ...(payload ? { payload } : {}),
          ...(trimmedNote ? { note: trimmedNote } : {}),
        },
      });
    } catch {
      /* mutation hook 이 에러 모달을 띄운다 */
    }
  }

  async function reject(request: ContactChangeRequest): Promise<void> {
    const reason = await modal.confirm({
      requiresReason: true,
      reasonMandatory: true,
      variant: "danger",
      title: "Reject this request?",
      message:
        "Nothing is changed. The requester sees this reason under My requests, so say what they should do differently.",
      confirmLabel: "Reject",
      reasonLabel: "Reason for rejecting",
    });
    if (reason === undefined) return;
    try {
      await rejectMut.mutateAsync({ requestId: request.id, reason });
    } catch {
      /* mutation hook 이 에러 모달을 띄운다 */
    }
  }

  /** 승인 전에 내용을 손보는 경로 — 같은 폼을 재사용한다. */
  async function approveWithEdits(request: ContactChangeRequest): Promise<void> {
    const initial: ContactDraft = request.payload
      ? draftFromPayload(request.payload)
      : request.current_contact
        ? draftFromContact(request.current_contact)
        : draftFromPayload({ name: request.contact_name ?? "" });

    const draft = await modal.open<ContactDraft>(
      ({ close }) => (
        <ContactForm
          initial={initial}
          submitLabel="Approve with these changes"
          reasonRequired={false}
          reasonLabel="Note for the requester (optional)"
          reasonHint="Explain what you changed before applying — the requester sees it."
          contactId={request.contact_id ?? undefined}
          onSubmit={(d) => close(d)}
          onCancel={() => close()}
        />
      ),
      { title: "Edit before approving", size: "lg", closeOnBackdrop: false },
    );
    if (!draft) return;
    await approve(request, draftToPayload(draft), draft.reason);
  }

  async function openReview(request: ContactChangeRequest): Promise<void> {
    const action = await modal.open<ContactRequestAction>(
      ({ close }) => (
        <ContactRequestReview
          request={request}
          canResolve={canResolve(request.request_type)}
          onAction={(a) => close(a)}
          onClose={() => close()}
        />
      ),
      { title: "Review request", size: "lg" },
    );
    if (!action) return;
    if (action.kind === "approve") await approve(request);
    else if (action.kind === "approve-edited") await approveWithEdits(request);
    else await reject(request);
  }

  const columns: Column<ContactChangeRequest>[] = [
    {
      key: "type",
      header: "Kind",
      render: (r) => (
        <div className="flex flex-wrap items-center gap-1">
          <Badge variant="accent">{REQUEST_TYPE_LABEL[r.request_type]}</Badge>
          {r.is_stale && r.status === "pending" && (
            <Badge variant="warning">Contact changed since</Badge>
          )}
        </div>
      ),
    },
    {
      key: "contact",
      header: "Contact",
      className: "max-w-[200px]",
      render: (r) => (
        <span className="block truncate text-sm font-medium text-text">
          {r.contact_name ?? r.payload?.name ?? "—"}
        </span>
      ),
    },
    {
      key: "requested_by",
      header: "Requested by",
      hideOnMobile: true,
      render: (r) => (
        <span className="text-sm text-text-secondary">{r.requested_by_name ?? "—"}</span>
      ),
    },
    {
      key: "requested_at",
      header: "When",
      hideOnMobile: true,
      render: (r) => (
        <span className="whitespace-nowrap text-sm text-text-secondary">
          {formatDateTime(r.requested_at)}
        </span>
      ),
    },
    {
      key: "reason",
      header: "Reason",
      hideOnMobile: true,
      className: "max-w-[260px]",
      render: (r) => (
        <span className="block truncate text-sm text-text-muted">{r.reason || "—"}</span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (r) => (
        <Badge variant={requestStatusVariant(r.status)}>{REQUEST_STATUS_LABEL[r.status]}</Badge>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-52">
          <Select
            options={STATUS_OPTIONS}
            value={status}
            onChange={(e) => setFilters({ status: e.target.value, rpage: "1" })}
            aria-label="Filter requests by status"
          />
        </div>
        <div className="w-40">
          <Select
            options={TYPE_OPTIONS}
            value={filters.kind}
            onChange={(e) => setFilters({ kind: e.target.value || null, rpage: "1" })}
            aria-label="Filter requests by kind"
          />
        </div>
      </div>

      {loadError && (
        <div className="rounded-xl border border-danger/40 bg-danger/5 p-5">
          <p className="flex items-center gap-2 text-sm font-semibold text-danger">
            <AlertTriangle size={15} /> Couldn&apos;t load requests
          </p>
          <p className="mt-1 text-xs text-text-secondary">
            {loadError.message}
            {loadError.hint ? ` ${loadError.hint}` : " Check your connection, then retry."}
          </p>
          {loadError.reference && (
            <p className="mt-1 text-[11px] text-text-muted">{loadError.reference}</p>
          )}
          <button
            type="button"
            onClick={() => void query.refetch()}
            className="mt-3 flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-text transition-colors hover:bg-surface-hover"
          >
            <RefreshCw size={13} /> Retry
          </button>
        </div>
      )}

      {!loadError && (
        <>
          <Table
            columns={columns}
            data={items}
            isLoading={query.isLoading}
            onRowClick={(r) => void openReview(r)}
            emptyMessage={
              status === "pending"
                ? "No requests are waiting for review."
                : "No requests match these filters."
            }
          />
          {!query.isLoading && items.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs text-text-muted">
                {total} request{total === 1 ? "" : "s"}
              </span>
              <Pagination
                page={page}
                totalPages={totalPages}
                onPageChange={(p) => setFilters({ rpage: String(p) })}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
