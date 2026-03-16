"use client";

/**
 * 스케줄 상세 페이지 -- 스케줄 정보와 체크리스트 상세 (리뷰 모드 포함)를 표시합니다.
 *
 * Schedule detail page showing schedule info and checklist detail
 * with review mode support.
 */

import React, { useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft, Trash2, Clock, Calendar, MapPin, User, Briefcase } from "lucide-react";
import { useSchedule, useDeleteSchedule } from "@/hooks/useSchedules";
import { useChecklistInstanceBySchedule } from "@/hooks/useChecklistInstances";
import { Button, Card, Badge, LoadingSpinner, EmptyState, ConfirmDialog } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { formatFixedDate, parseApiError } from "@/lib/utils";
import { ChecklistInstanceDetail } from "@/components/checklists/ChecklistInstanceDetail";
import { useTimezone } from "@/hooks/useTimezone";

const statusBadgeVariant: Record<string, "default" | "success" | "danger"> = {
  confirmed: "success",
  cancelled: "danger",
};
const statusLabel: Record<string, string> = {
  confirmed: "Confirmed",
  cancelled: "Cancelled",
};

export default function ScheduleDetailPage(): React.ReactElement {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const tz = useTimezone();

  const scheduleId: string = params.id as string;
  const { data: schedule, isLoading } = useSchedule(scheduleId);
  const { data: instance, isLoading: isInstanceLoading } = useChecklistInstanceBySchedule(scheduleId);
  const deleteSchedule = useDeleteSchedule();

  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

  const handleDelete = useCallback(() => {
    deleteSchedule.mutate(scheduleId, {
      onSuccess: () => {
        toast({ type: "success", message: "스케줄이 삭제되었습니다." });
        router.push("/schedules");
      },
      onError: (err) => {
        toast({ type: "error", message: parseApiError(err, "스케줄 삭제에 실패했습니다.") });
      },
    });
  }, [scheduleId, deleteSchedule, toast, router]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (!schedule) {
    return (
      <div>
        <Button variant="ghost" size="sm" onClick={() => router.back()}>
          <ChevronLeft size={16} />
          Back to Schedules
        </Button>
        <EmptyState message="Schedule not found." />
      </div>
    );
  }

  const formatTime = (t: string | null) => {
    if (!t) return "-";
    return t.slice(0, 5);
  };

  const timeRange = schedule.start_time || schedule.end_time
    ? `${formatTime(schedule.start_time)} ~ ${formatTime(schedule.end_time)}`
    : "-";

  const breakRange = schedule.break_start_time || schedule.break_end_time
    ? `${formatTime(schedule.break_start_time)} ~ ${formatTime(schedule.break_end_time)}`
    : "-";

  const workHours = schedule.net_work_minutes > 0
    ? `${Math.floor(schedule.net_work_minutes / 60)}h ${schedule.net_work_minutes % 60}m`
    : "-";

  // Checklist progress from instance
  const totalItems = instance?.total_items ?? 0;
  const completedItems = instance?.completed_items ?? 0;
  const percentage = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

  return (
    <div>
      <Button variant="ghost" size="sm" className="mb-4" onClick={() => router.back()}>
        <ChevronLeft size={16} />
        Back to Schedules
      </Button>

      {/* Schedule Summary */}
      <Card className="mb-6">
        <div className="flex items-start justify-between mb-4">
          <h1 className="text-xl font-bold text-text">Schedule Detail</h1>
          <div className="flex items-center gap-2">
            <Badge variant={statusBadgeVariant[schedule.status] ?? "default"}>
              {statusLabel[schedule.status] ?? schedule.status}
            </Badge>
            {schedule.status !== "cancelled" && (
              <Button variant="danger" size="sm" onClick={() => setIsDeleteOpen(true)}>
                <Trash2 size={14} />
                Delete
              </Button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <div className="flex items-start gap-2">
            <User size={14} className="text-text-muted mt-0.5 shrink-0" />
            <div>
              <p className="text-xs text-text-muted mb-1">Worker</p>
              <p className="text-sm font-medium text-text">{schedule.user_name ?? "-"}</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <MapPin size={14} className="text-text-muted mt-0.5 shrink-0" />
            <div>
              <p className="text-xs text-text-muted mb-1">Store</p>
              <p className="text-sm font-medium text-text">{schedule.store_name ?? "-"}</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Briefcase size={14} className="text-text-muted mt-0.5 shrink-0" />
            <div>
              <p className="text-xs text-text-muted mb-1">Work Role</p>
              <p className="text-sm font-medium text-text">{schedule.work_role_name ?? "-"}</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Calendar size={14} className="text-text-muted mt-0.5 shrink-0" />
            <div>
              <p className="text-xs text-text-muted mb-1">Date</p>
              <p className="text-sm font-medium text-text">{formatFixedDate(schedule.work_date)}</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Clock size={14} className="text-text-muted mt-0.5 shrink-0" />
            <div>
              <p className="text-xs text-text-muted mb-1">Work Time</p>
              <p className="text-sm font-medium text-text">{timeRange}</p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Clock size={14} className="text-text-muted mt-0.5 shrink-0" />
            <div>
              <p className="text-xs text-text-muted mb-1">Net Work</p>
              <p className="text-sm font-medium text-text">{workHours}</p>
            </div>
          </div>
        </div>

        {/* Break time & note */}
        {(breakRange !== "-" || schedule.note) && (
          <div className="mt-4 pt-4 border-t border-border grid grid-cols-2 md:grid-cols-3 gap-4">
            {breakRange !== "-" && (
              <div>
                <p className="text-xs text-text-muted mb-1">Break Time</p>
                <p className="text-sm text-text">{breakRange}</p>
              </div>
            )}
            {schedule.note && (
              <div className="col-span-2">
                <p className="text-xs text-text-muted mb-1">Note</p>
                <p className="text-sm text-text">{schedule.note}</p>
              </div>
            )}
          </div>
        )}

        {/* Checklist Progress */}
        {totalItems > 0 && (
          <div className="mt-4 pt-4 border-t border-border">
            <p className="text-xs text-text-muted mb-2">Checklist Progress</p>
            <div className="flex items-center gap-3">
              <div className="flex-1 h-2 bg-surface rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent rounded-full transition-all"
                  style={{ width: `${percentage}%` }}
                />
              </div>
              <span className="text-sm font-medium text-text">
                {completedItems}/{totalItems} ({percentage}%)
              </span>
            </div>
          </div>
        )}
      </Card>

      {/* Checklist with review mode */}
      {instance && <ChecklistInstanceDetail instance={instance} timezone={tz} />}

      {!instance && !isLoading && !isInstanceLoading && (
        <Card>
          <EmptyState message="No checklist assigned to this schedule." />
        </Card>
      )}

      <ConfirmDialog
        isOpen={isDeleteOpen}
        onClose={() => setIsDeleteOpen(false)}
        onConfirm={handleDelete}
        title="Delete Schedule"
        message="Are you sure you want to delete this schedule? This action cannot be undone."
        confirmLabel="Delete"
        isLoading={deleteSchedule.isPending}
      />
    </div>
  );
}
