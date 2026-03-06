"use client";

/**
 * 배정 상세 페이지 -- 배정 정보와 체크리스트 상세 (리뷰 모드 포함)를 표시합니다.
 *
 * Assignment detail page showing assignment info and checklist detail
 * with review mode support.
 */

import React, { useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft, Trash2 } from "lucide-react";
import { useAssignment, useDeleteAssignment } from "@/hooks/useAssignments";
import { useChecklistInstance } from "@/hooks/useChecklistInstances";
import { Button, Card, Badge, LoadingSpinner, EmptyState, ConfirmDialog } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { formatFixedDate, parseApiError } from "@/lib/utils";
import { ChecklistInstanceDetail } from "@/components/checklists/ChecklistInstanceDetail";
import { useTimezone } from "@/hooks/useTimezone";

const statusBadgeVariant: Record<string, "default" | "warning" | "success"> = {
  assigned: "default",
  in_progress: "warning",
  completed: "success",
};
const statusLabel: Record<string, string> = {
  assigned: "Assigned",
  in_progress: "In Progress",
  completed: "Completed",
};

export default function AssignmentDetailPage(): React.ReactElement {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const tz = useTimezone();

  const assignmentId: string = params.id as string;
  const { data: assignment, isLoading } = useAssignment(assignmentId);
  const deleteAssignment = useDeleteAssignment();

  const instanceId: string | undefined = assignment?.checklist_instance_id ?? undefined;
  const { data: instance } = useChecklistInstance(instanceId);

  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

  const handleDelete = useCallback(() => {
    deleteAssignment.mutate(assignmentId, {
      onSuccess: () => {
        toast({ type: "success", message: "Assignment deleted successfully." });
        router.push("/schedules");
      },
      onError: (err) => {
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

  const percentage =
    assignment.total_items > 0
      ? Math.round((assignment.completed_items / assignment.total_items) * 100)
      : 0;

  return (
    <div>
      <Button variant="ghost" size="sm" className="mb-4" onClick={() => router.back()}>
        <ChevronLeft size={16} />
        Back to Schedules
      </Button>

      {/* Assignment Summary */}
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

      {/* Checklist with review mode */}
      {instance && <ChecklistInstanceDetail instance={instance} timezone={tz} />}

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
