"use client";

/**
 * My requests — 내가 낸 신청의 상태를 스스로 확인하는 화면 (설계 N4).
 *
 * 알림이 없으므로(N3) 반려 사유를 볼 수 있는 곳은 여기뿐이다. 그래서 목록에서 상태를
 * 바로 읽히게 하고, 상세에서 반려 사유를 전문 그대로 보여준다.
 */

import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

import { Badge, Button, Pagination, Select, Table } from "@/components/ui";
import type { Column } from "@/components/ui/Table";
import { useModal } from "@/components/ui/imperative-modal";
import { useCancelContactRequest, useMyContactRequests } from "@/hooks/useContacts";
import { usePersistedFilters } from "@/hooks/usePersistedFilters";
import { describeApiError } from "@/lib/errorDisplay";
import { formatDateTime } from "@/lib/utils";
import type { ContactChangeRequest, ContactRequestStatus } from "@/types";
import { ContactRequestDiff } from "./ContactRequestDiff";
import {
  REQUEST_STATUS_LABEL,
  REQUEST_TYPE_LABEL,
  requestStatusVariant,
} from "./ContactRequestReview";

const PER_PAGE = 20;

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "pending", label: "Waiting for review" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "cancelled", label: "Cancelled" },
  { value: "superseded", label: "Closed (contact deleted)" },
];

function parseStatus(value: string): ContactRequestStatus | "all" {
  const known = STATUS_OPTIONS.some((o) => o.value === value);
  return known ? (value as ContactRequestStatus | "all") : "all";
}

/** 내 신청 상세 — 처리 버튼은 없고 "취소"만 있다. */
function MyRequestDetail({
  request,
  onCancelRequest,
  onClose,
}: {
  request: ContactChangeRequest;
  onCancelRequest: () => void;
  onClose: () => void;
}): React.ReactElement {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="accent">{REQUEST_TYPE_LABEL[request.request_type]}</Badge>
        <Badge variant={requestStatusVariant(request.status)}>
          {REQUEST_STATUS_LABEL[request.status]}
        </Badge>
      </div>

      <p className="text-sm text-text-secondary">
        Submitted on {formatDateTime(request.requested_at)}
        {request.contact_name ? ` for "${request.contact_name}"` : ""}.
      </p>

      {request.status === "pending" && (
        <p className="rounded-lg border border-warning/40 bg-warning-muted px-3 py-2 text-xs text-text-secondary">
          Waiting for review. Nothing has changed in the directory yet.
        </p>
      )}

      {request.reason && (
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
            Your reason
          </p>
          <p className="mt-0.5 whitespace-pre-wrap text-sm text-text">{request.reason}</p>
        </div>
      )}

      <ContactRequestDiff request={request} />

      {request.resolution_note && (
        <div
          className={
            request.status === "rejected"
              ? "rounded-lg border border-danger/40 bg-danger/5 px-3 py-2"
              : "rounded-lg border border-border bg-surface/50 px-3 py-2"
          }
        >
          <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
            {request.status === "rejected" ? "Why it was rejected" : "Reviewer note"}
          </p>
          <p className="mt-0.5 whitespace-pre-wrap text-sm text-text">{request.resolution_note}</p>
        </div>
      )}

      {request.resolved_at && (
        <p className="text-xs text-text-muted">
          Handled by {request.resolved_by_name ?? "unknown"} on{" "}
          {formatDateTime(request.resolved_at)}.
        </p>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
        {request.status === "pending" && (
          <Button variant="danger" onClick={onCancelRequest}>
            Cancel request
          </Button>
        )}
      </div>
    </div>
  );
}

export function MyContactRequestsPanel(): React.ReactElement {
  const modal = useModal();
  const cancelMut = useCancelContactRequest();

  const [filters, setFilters] = usePersistedFilters("contacts.myrequests", {
    mystatus: "all",
    mypage: "1",
  });
  const page = Number(filters.mypage) || 1;
  const status = parseStatus(filters.mystatus);

  const query = useMyContactRequests({ status, page, per_page: PER_PAGE });
  const items = query.data?.items ?? [];
  const total = query.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));

  const loadError = query.isError
    ? describeApiError(query.error, {
        context: "load",
        fallback: "Your requests couldn't be loaded.",
      })
    : null;

  async function cancelRequest(request: ContactChangeRequest): Promise<void> {
    const ok = await modal.confirm({
      title: "Cancel this request?",
      message: "It is withdrawn and no longer shown to reviewers. You can submit a new one later.",
      confirmLabel: "Cancel request",
      cancelLabel: "Keep it",
      variant: "danger",
    });
    if (!ok) return;
    try {
      await cancelMut.mutateAsync(request.id);
    } catch {
      /* mutation hook 이 에러 모달을 띄운다 */
    }
  }

  async function openDetail(request: ContactChangeRequest): Promise<void> {
    const wantsCancel = await modal.open<boolean>(
      ({ close }) => (
        <MyRequestDetail
          request={request}
          onCancelRequest={() => close(true)}
          onClose={() => close()}
        />
      ),
      { title: "Your request", size: "lg" },
    );
    if (wantsCancel) await cancelRequest(request);
  }

  const columns: Column<ContactChangeRequest>[] = [
    {
      key: "type",
      header: "Kind",
      render: (r) => <Badge variant="accent">{REQUEST_TYPE_LABEL[r.request_type]}</Badge>,
    },
    {
      key: "contact",
      header: "Contact",
      className: "max-w-[220px]",
      render: (r) => (
        <span className="block truncate text-sm font-medium text-text">
          {r.contact_name ?? r.payload?.name ?? "—"}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (r) => (
        <Badge variant={requestStatusVariant(r.status)}>{REQUEST_STATUS_LABEL[r.status]}</Badge>
      ),
    },
    {
      key: "requested_at",
      header: "Submitted",
      hideOnMobile: true,
      render: (r) => (
        <span className="whitespace-nowrap text-sm text-text-secondary">
          {formatDateTime(r.requested_at)}
        </span>
      ),
    },
    {
      key: "resolution",
      header: "Reviewer note",
      hideOnMobile: true,
      className: "max-w-[280px]",
      render: (r) => (
        <span className="block truncate text-sm text-text-muted">{r.resolution_note || "—"}</span>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="w-52">
        <Select
          options={STATUS_OPTIONS}
          value={status}
          onChange={(e) => setFilters({ mystatus: e.target.value, mypage: "1" })}
          aria-label="Filter my requests by status"
        />
      </div>

      {loadError && (
        <div className="rounded-xl border border-danger/40 bg-danger/5 p-5">
          <p className="flex items-center gap-2 text-sm font-semibold text-danger">
            <AlertTriangle size={15} /> Couldn&apos;t load your requests
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
            onRowClick={(r) => void openDetail(r)}
            emptyMessage="You haven't submitted any contact requests yet."
          />
          {!query.isLoading && items.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs text-text-muted">
                {total} request{total === 1 ? "" : "s"}
              </span>
              <Pagination
                page={page}
                totalPages={totalPages}
                onPageChange={(p) => setFilters({ mypage: String(p) })}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}
