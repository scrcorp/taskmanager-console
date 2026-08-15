"use client";

/**
 * 신청 검토 모달 본문 — 승인자용.
 *
 * 여기서는 판단만 하고 실행은 호출 측이 한다(승인 메모/반려 사유를 받는 확인 모달이
 * 이 모달 위에 다시 뜨는 걸 피하려고 액션만 돌려준다).
 */

import React from "react";
import { AlertTriangle } from "lucide-react";

import { Badge, Button } from "@/components/ui";
import { formatDateTime } from "@/lib/utils";
import type { ContactChangeRequest } from "@/types";
import { ContactRequestDiff } from "./ContactRequestDiff";

export type ContactRequestAction =
  | { kind: "approve" }
  | { kind: "approve-edited" }
  | { kind: "reject" };

export const REQUEST_TYPE_LABEL: Record<ContactChangeRequest["request_type"], string> = {
  create: "New contact",
  update: "Change",
  delete: "Deletion",
};

export const REQUEST_STATUS_LABEL: Record<ContactChangeRequest["status"], string> = {
  pending: "Waiting for review",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
  superseded: "Closed (contact deleted)",
};

export function requestStatusVariant(
  status: ContactChangeRequest["status"],
): "warning" | "success" | "danger" | "default" {
  if (status === "pending") return "warning";
  if (status === "approved") return "success";
  if (status === "rejected") return "danger";
  return "default";
}

interface ContactRequestReviewProps {
  request: ContactChangeRequest;
  /** 이 종류를 처리할 쓰기 권한이 있는가. 없으면 읽기만. */
  canResolve: boolean;
  onAction: (action: ContactRequestAction) => void;
  onClose: () => void;
}

export function ContactRequestReview({
  request,
  canResolve,
  onAction,
  onClose,
}: ContactRequestReviewProps): React.ReactElement {
  const isPending = request.status === "pending";
  const canEditBeforeApply = request.request_type !== "delete";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="accent">{REQUEST_TYPE_LABEL[request.request_type]}</Badge>
        <Badge variant={requestStatusVariant(request.status)}>
          {REQUEST_STATUS_LABEL[request.status]}
        </Badge>
        {request.is_stale && <Badge variant="warning">Contact changed since</Badge>}
      </div>

      <p className="text-sm text-text">
        <span className="font-semibold">{request.requested_by_name ?? "Someone"}</span> requested
        this on {formatDateTime(request.requested_at)}
        {request.contact_name ? ` for "${request.contact_name}"` : ""}.
      </p>

      {request.reason && (
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-text-muted">Reason</p>
          <p className="mt-0.5 whitespace-pre-wrap text-sm text-text">{request.reason}</p>
        </div>
      )}

      {request.is_stale && (
        <p className="flex items-start gap-1.5 rounded-lg border border-warning/40 bg-warning-muted px-3 py-2 text-xs text-text-secondary">
          <AlertTriangle size={13} className="mt-0.5 shrink-0 text-warning" />
          <span>
            The contact was edited after this request was submitted, so the request may undo
            someone else&apos;s change. Compare the columns below before approving.
          </span>
        </p>
      )}

      <ContactRequestDiff request={request} />

      {request.resolution_note && (
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
            {request.status === "rejected" ? "Rejection reason" : "Note"}
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

      <div className="flex flex-wrap justify-end gap-2 pt-1">
        <Button variant="secondary" onClick={onClose}>
          Close
        </Button>
        {isPending && canResolve && (
          <>
            <Button variant="danger" onClick={() => onAction({ kind: "reject" })}>
              Reject
            </Button>
            {canEditBeforeApply && (
              <Button variant="secondary" onClick={() => onAction({ kind: "approve-edited" })}>
                Edit, then approve
              </Button>
            )}
            <Button onClick={() => onAction({ kind: "approve" })}>Approve</Button>
          </>
        )}
        {isPending && !canResolve && (
          <p className="self-center text-xs text-text-muted">
            You can read this request, but handling it needs the matching edit permission.
          </p>
        )}
      </div>
    </div>
  );
}
