"use client";

/**
 * 일일 보고서 상세 페이지 -- 보고서 섹션 + 댓글을 표시합니다.
 *
 * Daily report detail page showing report sections and comments with add comment form.
 */

import React, { useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft, MapPin, User, Calendar, Clock, Send, Trash2 } from "lucide-react";
import { useDailyReport, useAddDailyReportComment, useDeleteDailyReport } from "@/hooks/useDailyReports";
import { Button, Card, Badge, LoadingSpinner, EmptyState, ConfirmDialog } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { formatDate, formatFixedDate, parseApiError } from "@/lib/utils";
import { useTimezone } from "@/hooks/useTimezone";
import type { DailyReportSection, DailyReportComment } from "@/types";

const statusBadge: Record<string, { label: string; variant: "success" | "warning" | "default" }> = {
  draft: { label: "Draft", variant: "warning" },
  submitted: { label: "Submitted", variant: "success" },
};

const periodLabel: Record<string, string> = {
  lunch: "Lunch",
  dinner: "Dinner",
};

export default function DailyReportDetailPage(): React.ReactElement {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const tz = useTimezone();

  const reportId: string = params.id as string;
  const { data: report, isLoading } = useDailyReport(reportId);
  const addComment = useAddDailyReportComment();
  const deleteMutation = useDeleteDailyReport();

  const [commentText, setCommentText] = useState<string>("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleAddComment = useCallback(async () => {
    if (!commentText.trim()) return;
    try {
      await addComment.mutateAsync({ reportId, content: commentText.trim() });
      toast({ type: "success", message: "Comment added" });
      setCommentText("");
    } catch (err) {
      toast({ type: "error", message: parseApiError(err, "Failed to add comment") });
    }
  }, [reportId, commentText, addComment, toast]);

  const handleDelete = useCallback(async () => {
    try {
      await deleteMutation.mutateAsync(reportId);
      toast({ type: "success", message: "Report deleted" });
      router.push("/daily-reports");
    } catch (err) {
      toast({ type: "error", message: parseApiError(err, "Failed to delete report") });
    }
  }, [reportId, deleteMutation, toast, router]);

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

  const sBadge = statusBadge[report.status] ?? statusBadge.draft;
  const sortedSections: DailyReportSection[] = [...report.sections].sort(
    (a, b) => a.sort_order - b.sort_order,
  );

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
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-1.5">
                <Calendar size={14} className="text-text-muted" />
                <span className="text-sm text-text-secondary">
                  {formatFixedDate(report.report_date)}
                </span>
              </div>
              <Badge variant="accent">
                {periodLabel[report.period] ?? report.period}
              </Badge>
              <Badge variant={sBadge.variant}>{sBadge.label}</Badge>
            </div>
          </div>
          <Button
            variant="danger"
            size="sm"
            onClick={() => setShowDeleteConfirm(true)}
          >
            <Trash2 size={14} className="mr-1" />
            Delete
          </Button>
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
          {report.submitted_at && (
            <div className="flex items-center gap-2">
              <Clock size={14} className="text-text-muted shrink-0" />
              <span className="text-sm text-text-secondary">
                Submitted: {formatDate(report.submitted_at, tz)}
              </span>
            </div>
          )}
        </div>
      </Card>

      {/* Sections */}
      {sortedSections.length > 0 ? (
        <div className="space-y-3 mb-4">
          {sortedSections.map((section: DailyReportSection) => (
            <Card key={section.sort_order}>
              <h2 className="text-base font-semibold text-text mb-2">
                {section.title}
              </h2>
              {section.content ? (
                <div>
                  {section.content.split("\n").map((line: string, i: number) => (
                    <p key={i} className="text-sm text-text-secondary leading-relaxed mb-1">
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
          <p className="text-sm text-text-muted text-center">No sections in this report.</p>
        </Card>
      )}

      {/* Comments */}
      <Card>
        <h2 className="text-base font-semibold text-text mb-4">
          Comments ({report.comments.length})
        </h2>

        {report.comments.length > 0 ? (
          <ul className="divide-y divide-border mb-4">
            {report.comments.map((comment: DailyReportComment) => (
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
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setCommentText(e.target.value)}
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

      {/* Delete confirm */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDelete}
        title="Delete Report"
        message="Are you sure you want to delete this daily report? This action cannot be undone."
        confirmLabel="Delete"
        isLoading={deleteMutation.isPending}
      />
    </div>
  );
}
