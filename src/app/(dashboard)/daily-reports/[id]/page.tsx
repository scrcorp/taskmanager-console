"use client";

/**
 * 일일 보고서 상세 페이지 — 통합 reports 엔드포인트 기반.
 *
 * 보고서 섹션 + 댓글 + 마감/리뷰/확인(acknowledge) 상태를 표시한다.
 * period/sections 는 report.payload 안에 들어있다.
 */

import React, { useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  ChevronLeft,
  MapPin,
  User,
  Calendar,
  Clock,
  Send,
  Trash2,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import {
  useDailyReport,
  useAddDailyReportComment,
  useDeleteDailyReport,
} from "@/hooks/useDailyReports";
import { useReviewReport } from "@/hooks/useReports";
import { Button, Card, Badge, LoadingSpinner, EmptyState } from "@/components/ui";
import { useModal } from "@/components/ui/imperative-modal";
import { usePermissions } from "@/hooks/usePermissions";
import { PERMISSIONS } from "@/lib/permissions";
import { formatDate, formatFixedDate } from "@/lib/utils";
import { useTimezone } from "@/hooks/useTimezone";
import type {
  DailyReportPayload,
  DailyReportPayloadSection,
  ReportAcknowledgement,
  ReportComment,
} from "@/types";

const statusBadge: Record<
  string,
  { label: string; variant: "success" | "warning" | "accent" | "default" }
> = {
  draft: { label: "Draft", variant: "warning" },
  submitted: { label: "Submitted", variant: "accent" },
  reviewed: { label: "Reviewed", variant: "success" },
};

const periodLabel: Record<string, string> = {
  morning: "Morning",
  lunch: "Lunch",
  dinner: "Dinner",
};

export default function DailyReportDetailPage(): React.ReactElement {
  const params = useParams();
  const router = useRouter();
  const modal = useModal();
  const tz = useTimezone();
  const { hasPermission } = usePermissions();
  const canReview = hasPermission(PERMISSIONS.REPORTS_REVIEW);
  const canDelete = hasPermission(PERMISSIONS.REPORTS_DELETE);

  const reportId: string = params.id as string;
  const { data: report, isLoading } = useDailyReport(reportId);
  const addComment = useAddDailyReportComment();
  const deleteMutation = useDeleteDailyReport();
  const reviewMutation = useReviewReport();

  const [commentText, setCommentText] = useState<string>("");
  const [feedbackText, setFeedbackText] = useState<string>("");

  const handleAddComment = useCallback(async () => {
    if (!commentText.trim()) return;
    try {
      await addComment.mutateAsync({ reportId, content: commentText.trim() });
      setCommentText("");
    } catch {
      // hook 자동 모달
    }
  }, [reportId, commentText, addComment]);

  const handleReview = useCallback(async () => {
    try {
      await reviewMutation.mutateAsync({
        reportId,
        feedback: feedbackText.trim() || undefined,
      });
      setFeedbackText("");
    } catch {
      // hook 자동 모달
    }
  }, [reportId, feedbackText, reviewMutation]);

  const handleDelete = useCallback(async () => {
    const ok = await modal.confirm({
      title: "Delete Report",
      message:
        "Are you sure you want to delete this daily report? This action cannot be undone.",
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;
    try {
      await deleteMutation.mutateAsync(reportId);
      router.push("/daily-reports");
    } catch {
      // hook 자동 모달
    }
  }, [reportId, deleteMutation, modal, router]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!report) {
    return (
      <div>
        <Button variant="ghost" size="sm" onClick={() => router.push("/daily-reports")}>
          <ChevronLeft size={16} />
          Back to Daily Reports
        </Button>
        <EmptyState message="Daily report not found." />
      </div>
    );
  }

  const payload = (report.payload ?? {}) as Partial<DailyReportPayload>;
  const period = payload.period ?? "";
  const sBadge = statusBadge[report.status] ?? statusBadge.draft;
  const sortedSections: DailyReportPayloadSection[] = [
    ...(payload.sections ?? []),
  ].sort((a, b) => a.sort_order - b.sort_order);

  return (
    <div>
      {/* Back button */}
      <Button
        variant="ghost"
        size="sm"
        className="mb-4"
        onClick={() => router.push("/daily-reports")}
      >
        <ChevronLeft size={16} />
        Back to Daily Reports
      </Button>

      {/* Report info */}
      <Card className="mb-4">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-3 mb-4">
          <div className="flex-1 min-w-0">
            <h1 className="text-lg md:text-xl font-bold text-text mb-2">
              Daily Report
            </h1>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1.5">
                <Calendar size={14} className="text-text-muted" />
                <span className="text-sm text-text-secondary">
                  {formatFixedDate(report.report_date ?? "")}
                </span>
              </div>
              <Badge variant="accent">{periodLabel[period] ?? period ?? "—"}</Badge>
              <Badge variant={sBadge.variant}>{sBadge.label}</Badge>
              {report.is_overdue && (
                <Badge variant="danger">
                  <span className="inline-flex items-center gap-1">
                    <AlertCircle size={12} />
                    Overdue
                  </span>
                </Badge>
              )}
              {report.is_late && !report.is_overdue && (
                <Badge variant="warning">Submitted late</Badge>
              )}
            </div>
          </div>
          {canDelete && (
            <Button
              variant="danger"
              size="sm"
              onClick={() => void handleDelete()}
              isLoading={deleteMutation.isPending}
            >
              <Trash2 size={14} className="mr-1" />
              Delete
            </Button>
          )}
        </div>

        <div className="border-t border-border pt-4 space-y-2">
          <div className="flex items-center gap-2">
            <MapPin size={14} className="text-text-muted shrink-0" />
            <span className="text-sm text-text-secondary">
              {report.store_name || "Unknown Store"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <User size={14} className="text-text-muted shrink-0" />
            <span className="text-sm text-text-secondary">
              {report.author_name || "Unknown Author"}
            </span>
          </div>
          {report.deadline_at && (
            <div className="flex items-center gap-2">
              <Clock size={14} className="text-text-muted shrink-0" />
              <span className="text-sm text-text-secondary">
                Deadline: {formatDate(report.deadline_at, tz)}
              </span>
            </div>
          )}
          {report.submitted_at && (
            <div className="flex items-center gap-2">
              <Clock size={14} className="text-text-muted shrink-0" />
              <span className="text-sm text-text-secondary">
                Submitted: {formatDate(report.submitted_at, tz)}
              </span>
            </div>
          )}
          {report.reviewed_at && (
            <div className="flex items-center gap-2">
              <CheckCircle2 size={14} className="text-success shrink-0" />
              <span className="text-sm text-text-secondary">
                Reviewed by {report.reviewed_by_name || "—"} ·{" "}
                {formatDate(report.reviewed_at, tz)}
              </span>
            </div>
          )}
        </div>
      </Card>

      {/* Review action (GM+). submitted → reviewed. */}
      {canReview && report.status === "submitted" && (
        <Card className="mb-4">
          <h2 className="text-base font-semibold text-text mb-2">Review</h2>
          <p className="text-sm text-text-muted mb-3">
            Mark this report as reviewed. Optionally leave feedback for the author.
          </p>
          <textarea
            value={feedbackText}
            onChange={(e) => setFeedbackText(e.target.value)}
            placeholder="Feedback (optional)"
            rows={2}
            className="w-full px-3 py-2 text-sm bg-surface border border-border rounded-lg text-text placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-accent resize-none mb-3"
          />
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={() => void handleReview()}
              isLoading={reviewMutation.isPending}
            >
              <CheckCircle2 size={14} className="mr-1" />
              Mark reviewed
            </Button>
          </div>
        </Card>
      )}

      {/* Sections */}
      {sortedSections.length > 0 ? (
        <div className="space-y-3 mb-4">
          {sortedSections.map((section, idx) => (
            <Card key={section.id ?? section.sort_order ?? idx}>
              <h2 className="text-base font-semibold text-text mb-2">
                {section.title}
              </h2>
              {section.content ? (
                <div>
                  {section.content.split("\n").map((line: string, i: number) => (
                    <p
                      key={i}
                      className="text-sm text-text-secondary leading-relaxed mb-1"
                    >
                      {line}
                    </p>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-text-muted italic">No content</p>
              )}
            </Card>
          ))}
        </div>
      ) : (
        <Card className="mb-4" padding="p-8">
          <p className="text-sm text-text-muted text-center">
            No sections in this report.
          </p>
        </Card>
      )}

      {/* Acknowledgements */}
      {report.acknowledgement_count > 0 && (
        <Card className="mb-4">
          <h2 className="text-base font-semibold text-text mb-3">
            Acknowledged ({report.acknowledgement_count})
          </h2>
          <ul className="flex flex-wrap gap-2">
            {report.acknowledgements.map((ack: ReportAcknowledgement) => (
              <li
                key={ack.user_id}
                className="inline-flex items-center gap-1.5 text-xs bg-success-muted text-success px-2.5 py-1 rounded-full"
                title={formatDate(ack.acknowledged_at, tz)}
              >
                <CheckCircle2 size={12} />
                {ack.user_name || "Unknown"}
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Comments */}
      <Card>
        <h2 className="text-base font-semibold text-text mb-4">
          Comments ({report.comments.length})
        </h2>

        {report.comments.length > 0 ? (
          <ul className="divide-y divide-border mb-4">
            {report.comments.map((comment: ReportComment) => (
              <li key={comment.id} className="py-3">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium text-text">
                    {comment.user_name || "Unknown"}
                  </span>
                  <span className="text-xs text-text-muted">
                    {formatDate(comment.created_at, tz)}
                  </span>
                </div>
                <p className="text-sm text-text-secondary">{comment.content}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-text-muted mb-4">No comments yet.</p>
        )}

        {/* Add comment form */}
        <div className="flex gap-2">
          <textarea
            value={commentText}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
              setCommentText(e.target.value)
            }
            placeholder="Write a comment..."
            rows={2}
            className="flex-1 px-3 py-2 text-sm bg-surface border border-border rounded-lg text-text placeholder-text-muted focus:outline-none focus:ring-1 focus:ring-accent resize-none"
            onKeyDown={(e: React.KeyboardEvent) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                handleAddComment();
              }
            }}
          />
          <Button
            size="sm"
            onClick={handleAddComment}
            disabled={!commentText.trim() || addComment.isPending}
            className="self-end"
          >
            <Send size={14} />
            {addComment.isPending ? "..." : "Send"}
          </Button>
        </div>
      </Card>
    </div>
  );
}
