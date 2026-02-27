"use client";

/**
 * 배정 상세 페이지 -- 읽기 전용으로 배정 정보와 체크리스트 스냅샷을 표시합니다.
 *
 * Assignment detail page showing read-only assignment info, progress, and checklist snapshot.
 */

import React, { useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft, Check, X, Clock, Trash2, ExternalLink } from "lucide-react";
import { useAssignment, useDeleteAssignment } from "@/hooks/useAssignments";
import { Button, Card, Badge, LoadingSpinner, EmptyState, ConfirmDialog } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { formatFixedDate, parseApiError } from "@/lib/utils";
import { cn } from "@/lib/utils";
import type { AssignmentDetail, ChecklistSnapshotItem } from "@/types";

/** 배정 상태에 따른 뱃지 변형 매핑 (Status to badge variant mapping) */
const statusBadgeVariant: Record<string, "default" | "warning" | "success"> = {
  assigned: "default",
  in_progress: "warning",
  completed: "success",
};

/** 배정 상태 라벨 매핑 (Status label mapping) */
const statusLabel: Record<string, string> = {
  assigned: "Assigned",
  in_progress: "In Progress",
  completed: "Completed",
};

/** 체크리스트 완료 시각 포맷 (Format checklist completion datetime) */
function formatCompletedAt(completedAt: string, completedTz: string | null): string {
  const d = new Date(completedAt);
  if (isNaN(d.getTime())) return completedTz ? `${completedAt} ${completedTz}` : completedAt;
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const mi = String(d.getMinutes()).padStart(2, "0");
  const dateTime = `${mm}/${dd} ${hh}:${mi}`;
  return completedTz ? `${dateTime} ${completedTz}` : dateTime;
}

/** 검증 타입 뱃지 변형 매핑 (Verification type badge variant mapping) */
const verificationBadgeVariant: Record<string, "default" | "accent" | "warning"> = {
  none: "default",
  photo: "accent",
  text: "warning",
};

export default function AssignmentDetailPage(): React.ReactElement {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();

  const assignmentId: string = params.id as string;
  const { data: assignment, isLoading } = useAssignment(assignmentId);
  const deleteAssignment = useDeleteAssignment();

  const [isDeleteOpen, setIsDeleteOpen] = useState<boolean>(false);

  const handleDelete: () => void = useCallback((): void => {
    deleteAssignment.mutate(assignmentId, {
      onSuccess: (): void => {
        toast({ type: "success", message: "Assignment deleted successfully." });
        router.push("/schedules");
      },
      onError: (err): void => {
        toast({ type: "error", message: parseApiError(err, "Failed to delete assignment.") });
      },
    });
  }, [assignmentId, deleteAssignment, toast, router]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!assignment) {
    return (
      <div>
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ChevronLeft size={16} />
          Back to Schedules
        </Button>
        <EmptyState message="Assignment not found." />
      </div>
    );
  }

  const percentage: number =
    assignment.total_items > 0
      ? Math.round((assignment.completed_items / assignment.total_items) * 100)
      : 0;

  const checklist: ChecklistSnapshotItem[] = assignment.checklist_snapshot ?? [];

  return (
    <div>
      {/* Back button */}
      <Button
        variant="ghost"
        size="sm"
        className="mb-4"
        onClick={() => router.back()}
      >
        <ChevronLeft size={16} />
        Back to Schedules
      </Button>

      {/* Summary Card */}
      <Card className="mb-6">
        <div className="flex items-start justify-between mb-4">
          <h1 className="text-xl font-bold text-text">Assignment Detail</h1>
          <Button variant="danger" size="sm" onClick={() => setIsDeleteOpen(true)}>
            <Trash2 size={14} />
            Delete
          </Button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-xs text-text-muted mb-1">Worker</p>
            <p className="text-sm font-medium text-text">{assignment.user_name}</p>
          </div>
          <div>
            <p className="text-xs text-text-muted mb-1">Store</p>
            <p className="text-sm font-medium text-text">{assignment.store_name}</p>
          </div>
          <div>
            <p className="text-xs text-text-muted mb-1">Shift</p>
            <p className="text-sm font-medium text-text">{assignment.shift_name}</p>
          </div>
          <div>
            <p className="text-xs text-text-muted mb-1">Position</p>
            <p className="text-sm font-medium text-text">{assignment.position_name}</p>
          </div>
          <div>
            <p className="text-xs text-text-muted mb-1">Date</p>
            <p className="text-sm font-medium text-text">{formatFixedDate(assignment.work_date)}</p>
          </div>
          <div>
            <p className="text-xs text-text-muted mb-1">Status</p>
            <Badge variant={statusBadgeVariant[assignment.status] ?? "default"}>
              {statusLabel[assignment.status] ?? assignment.status}
            </Badge>
          </div>
          <div className="col-span-2">
            <p className="text-xs text-text-muted mb-1">Progress</p>
            <div className="flex items-center gap-3">
              <div className="flex-1 h-2 bg-surface rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent rounded-full transition-all"
                  style={{ width: `${percentage}%` }}
                />
              </div>
              <span className="text-sm font-medium text-text">
                {assignment.completed_items}/{assignment.total_items} ({percentage}%)
              </span>
            </div>
          </div>
        </div>
      </Card>

      {/* Checklist Snapshot */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-text">Checklist</h2>
          {assignment.checklist_instance_id && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                router.push(
                  `/checklists/instances/${assignment.checklist_instance_id}`,
                )
              }
            >
              <ExternalLink size={14} />
              View Full Checklist
            </Button>
          )}
        </div>
        {checklist.length === 0 ? (
          <EmptyState message="No checklist data available." />
        ) : (
          <div className="space-y-3">
            {checklist.map((item: ChecklistSnapshotItem, index: number) => (
              <div
                key={index}
                className={cn(
                  "flex items-start gap-3 p-3 rounded-lg border border-border",
                  item.is_completed ? "bg-success-muted/30" : "bg-surface",
                )}
              >
                {/* Completion icon */}
                <div
                  className={cn(
                    "mt-0.5 flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center",
                    item.is_completed
                      ? "bg-success text-white"
                      : "bg-surface-hover text-text-muted",
                  )}
                >
                  {item.is_completed ? (
                    <Check size={12} />
                  ) : (
                    <X size={12} />
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-text">
                      {item.title}
                    </span>
                    <Badge variant={verificationBadgeVariant[item.verification_type] ?? "default"}>
                      {item.verification_type}
                    </Badge>
                    {/* Review badge */}
                    {item.review && (
                      <Badge
                        variant={
                          item.review.result === "pass"
                            ? "success"
                            : item.review.result === "fail"
                              ? "danger"
                              : "warning"
                        }
                      >
                        {item.review.result === "pass"
                          ? "O"
                          : item.review.result === "fail"
                            ? "X"
                            : "△"}
                      </Badge>
                    )}
                  </div>
                  {item.description && (
                    <p className="text-xs text-text-secondary mt-1">{item.description}</p>
                  )}
                  {/* Review details */}
                  {item.review && (
                    <div className="mt-1 text-xs text-text-muted">
                      {item.review.comment && (
                        <p className="text-text-secondary">{item.review.comment}</p>
                      )}
                      <span>Reviewed by {item.review.reviewer_name ?? "Unknown"}</span>
                    </div>
                  )}
                </div>

                {/* Right-side meta (completion time) */}
                {item.completed_at && (
                  <div className="flex items-center gap-1 shrink-0 text-xs text-text-muted">
                    <Clock size={12} />
                    <span>{formatCompletedAt(item.completed_at, item.completed_tz)}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Delete Confirm Dialog */}
      <ConfirmDialog
        isOpen={isDeleteOpen}
        onClose={() => setIsDeleteOpen(false)}
        onConfirm={handleDelete}
        title="Delete Assignment"
        message="Are you sure you want to delete this assignment? This action cannot be undone."
        confirmLabel="Delete"
        isLoading={deleteAssignment.isPending}
      />
    </div>
  );
}
