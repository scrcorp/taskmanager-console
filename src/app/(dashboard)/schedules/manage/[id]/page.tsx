"use client";

/**
 * 스케줄 상세 페이지 -- 스케줄 정보와 상태 변경 버튼을 표시합니다.
 *
 * Schedule detail page — displays schedule information with
 * status transition action buttons (Submit, Approve, Cancel)
 * and a substitute worker modal (GM+ only).
 */

import React, { useCallback, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  ArrowLeft,
  Calendar,
  Clock,
  User,
  MapPin,
  Send,
  CheckCircle2,
  XCircle,
  ExternalLink,
  FileText,
  UserRoundPlus,
} from "lucide-react";
import {
  useSchedule,
  useSubmitSchedule,
  useApproveSchedule,
  useCancelSchedule,
  useSubstituteSchedule,
} from "@/hooks/useSchedules";
import { useUsers } from "@/hooks/useUsers";
import { usePermissions } from "@/hooks/usePermissions";
import { PERMISSIONS } from "@/lib/permissions";
import { Button, Card, Badge, Modal, Select } from "@/components/ui";
import { ConfirmDialog } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { formatFixedDate, formatDateTime, parseApiError } from "@/lib/utils";
import { useTimezone } from "@/hooks/useTimezone";

/** 상태별 배지 색상 매핑 — Status badge variant mapping */
const statusBadge: Record<
  string,
  { label: string; variant: "default" | "warning" | "success" | "danger" }
> = {
  draft: { label: "Draft", variant: "default" },
  pending: { label: "Pending Approval", variant: "warning" },
  approved: { label: "Approved", variant: "success" },
  cancelled: { label: "Cancelled", variant: "danger" },
};

export default function ScheduleDetailPage(): React.ReactElement {
  const router = useRouter();
  const params = useParams();
  const id: string = params.id as string;
  const { toast } = useToast();
  const { hasPermission } = usePermissions();
  const tz = useTimezone();

  const { data: schedule, isLoading } = useSchedule(id);
  const submitSchedule = useSubmitSchedule();
  const approveSchedule = useApproveSchedule();
  const cancelSchedule = useCancelSchedule();
  const substituteSchedule = useSubstituteSchedule();

  // 사용자 목록 (대리 근무자 선택용) — Users list for substitute selection
  const { data: users } = useUsers({ is_active: true });

  // 취소 확인 대화상자 상태 — Cancel confirmation dialog state
  const [showCancelConfirm, setShowCancelConfirm] = React.useState(false);

  // 대리 근무 모달 상태 — Substitute modal state
  const [showSubstituteModal, setShowSubstituteModal] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string>("");

  // GM 이상 여부 — Whether user can update schedules (approve/substitute)
  const isGmPlus: boolean = hasPermission(PERMISSIONS.SCHEDULES_UPDATE);

  const handleSubmit = useCallback(async (): Promise<void> => {
    try {
      await submitSchedule.mutateAsync(id);
      toast({ type: "success", message: "Schedule submitted for approval!" });
    } catch (err) {
      toast({ type: "error", message: parseApiError(err, "Failed to submit schedule.") });
    }
  }, [id, submitSchedule, toast]);

  const handleApprove = useCallback(async (): Promise<void> => {
    try {
      await approveSchedule.mutateAsync(id);
      toast({
        type: "success",
        message: "Schedule approved! Work assignment created.",
      });
    } catch (err) {
      toast({ type: "error", message: parseApiError(err, "Failed to approve schedule.") });
    }
  }, [id, approveSchedule, toast]);

  const handleCancel = useCallback(async (): Promise<void> => {
    try {
      await cancelSchedule.mutateAsync(id);
      toast({ type: "success", message: "Schedule cancelled." });
      setShowCancelConfirm(false);
    } catch (err) {
      toast({ type: "error", message: parseApiError(err, "Failed to cancel schedule.") });
    }
  }, [id, cancelSchedule, toast]);

  const handleSubstitute = useCallback(async (): Promise<void> => {
    if (!selectedUserId) return;
    try {
      await substituteSchedule.mutateAsync({
        id,
        new_user_id: selectedUserId,
      });
      toast({ type: "success", message: "Substitute assigned successfully!" });
      setShowSubstituteModal(false);
      setSelectedUserId("");
    } catch (err) {
      toast({ type: "error", message: parseApiError(err, "Failed to assign substitute.") });
    }
  }, [id, selectedUserId, substituteSchedule, toast]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full border-accent border-t-transparent h-8 w-8 border-2" />
      </div>
    );
  }

  if (!schedule) {
    return (
      <Card padding="p-16">
        <p className="text-center text-sm text-text-muted">
          Schedule not found.
        </p>
      </Card>
    );
  }

  const badge = statusBadge[schedule.status] ?? statusBadge.draft;

  return (
    <div>
      {/* 헤더 (Header) */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push("/schedules/manage")}
            className="p-2 rounded-lg text-text-muted hover:text-text hover:bg-surface-hover transition-colors shrink-0"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-xl md:text-2xl font-extrabold text-text">
              Schedule Detail
            </h1>
            <p className="text-sm text-text-muted mt-0.5">
              {schedule.user_name} - {schedule.store_name}
            </p>
          </div>
        </div>

        {/* 상태 배지 + 대리 근무 버튼 (Status badge + Substitute button) */}
        <div className="flex items-center gap-3 shrink-0">
          {isGmPlus && schedule.status !== "cancelled" && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setShowSubstituteModal(true)}
            >
              <UserRoundPlus size={16} />
              Substitute
            </Button>
          )}
          <Badge variant={badge.variant}>{badge.label}</Badge>
        </div>
      </div>

      {/* 스케줄 정보 카드 (Schedule info card) */}
      <Card padding="p-6" className="max-w-2xl mb-4">
        <div className="space-y-4">
          {/* 직원 (Employee) */}
          <div className="flex items-start gap-3">
            <User size={16} className="text-text-muted mt-0.5 shrink-0" />
            <div>
              <p className="text-xs text-text-muted">Employee</p>
              <p className="text-sm font-semibold text-text">
                {schedule.user_name}
              </p>
            </div>
          </div>

          {/* 매장 (Store) */}
          <div className="flex items-start gap-3">
            <MapPin size={16} className="text-text-muted mt-0.5 shrink-0" />
            <div>
              <p className="text-xs text-text-muted">Store</p>
              <p className="text-sm font-semibold text-text">
                {schedule.store_name}
              </p>
            </div>
          </div>

          {/* 날짜 (Date) */}
          <div className="flex items-start gap-3">
            <Calendar size={16} className="text-text-muted mt-0.5 shrink-0" />
            <div>
              <p className="text-xs text-text-muted">Work Date</p>
              <p className="text-sm font-semibold text-text">
                {formatFixedDate(schedule.work_date)}
              </p>
            </div>
          </div>

          {/* 시간 (Time) */}
          {(schedule.start_time || schedule.end_time) && (
            <div className="flex items-start gap-3">
              <Clock size={16} className="text-text-muted mt-0.5 shrink-0" />
              <div>
                <p className="text-xs text-text-muted">Time</p>
                <p className="text-sm font-semibold text-text">
                  {schedule.start_time ?? "Not set"} -{" "}
                  {schedule.end_time ?? "Not set"}
                </p>
              </div>
            </div>
          )}

          {/* 시프트/포지션 (Shift/Position) */}
          {(schedule.shift_name || schedule.position_name) && (
            <div className="flex items-start gap-3">
              <FileText
                size={16}
                className="text-text-muted mt-0.5 shrink-0"
              />
              <div>
                <p className="text-xs text-text-muted">Shift / Position</p>
                <p className="text-sm font-semibold text-text">
                  {[schedule.shift_name, schedule.position_name]
                    .filter(Boolean)
                    .join(" / ") || "Not set"}
                </p>
              </div>
            </div>
          )}

          {/* 메모 (Note) */}
          {schedule.note && (
            <div className="pt-2 border-t border-border">
              <p className="text-xs text-text-muted mb-1">Note</p>
              <p className="text-sm text-text whitespace-pre-wrap">
                {schedule.note}
              </p>
            </div>
          )}

          {/* 생성자/승인자 정보 (Creator/Approver info) */}
          <div className="pt-2 border-t border-border grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-text-muted">Created by</p>
              <p className="text-sm text-text">
                {schedule.created_by_name ?? "System"}
              </p>
            </div>
            {schedule.approved_by_name && (
              <div>
                <p className="text-xs text-text-muted">Approved by</p>
                <p className="text-sm text-text">
                  {schedule.approved_by_name}
                </p>
                {schedule.approved_at && (
                  <p className="text-xs text-text-muted mt-0.5">
                    {formatDateTime(schedule.approved_at, tz)}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* 연결된 배정 (Linked assignment) */}
          {schedule.work_assignment_id && (
            <div className="pt-2 border-t border-border">
              <p className="text-xs text-text-muted mb-1">
                Work Assignment
              </p>
              <button
                type="button"
                onClick={() =>
                  router.push(
                    `/schedules/${schedule.work_assignment_id}`,
                  )
                }
                className="flex items-center gap-1.5 text-sm text-accent hover:underline"
              >
                <ExternalLink size={12} />
                View Assignment
              </button>
            </div>
          )}
        </div>
      </Card>

      {/* 액션 버튼 (Action buttons) */}
      <Card padding="p-4" className="max-w-2xl">
        <div className="flex items-center justify-end gap-2 flex-wrap">
          {/* Draft 상태: Submit 버튼 — Draft: show Submit button */}
          {schedule.status === "draft" && (
            <>
              <Button
                variant="secondary"
                onClick={() => setShowCancelConfirm(true)}
                disabled={cancelSchedule.isPending}
              >
                <XCircle size={16} />
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={handleSubmit}
                isLoading={submitSchedule.isPending}
              >
                <Send size={16} />
                Submit for Approval
              </Button>
            </>
          )}

          {/* Pending 상태: Approve/Cancel 버튼 (GM+ only) — Pending: show Approve/Cancel */}
          {schedule.status === "pending" && (
            <>
              <Button
                variant="secondary"
                onClick={() => setShowCancelConfirm(true)}
                disabled={cancelSchedule.isPending}
              >
                <XCircle size={16} />
                Cancel
              </Button>
              {isGmPlus && (
                <Button
                  variant="primary"
                  onClick={handleApprove}
                  isLoading={approveSchedule.isPending}
                >
                  <CheckCircle2 size={16} />
                  Approve
                </Button>
              )}
            </>
          )}
        </div>
      </Card>

      {/* 취소 확인 대화상자 (Cancel confirmation dialog) */}
      <ConfirmDialog
        isOpen={showCancelConfirm}
        onClose={() => setShowCancelConfirm(false)}
        onConfirm={handleCancel}
        title="Cancel Schedule"
        message="Are you sure you want to cancel this schedule? This action cannot be undone."
        confirmLabel="Cancel Schedule"
        isLoading={cancelSchedule.isPending}
      />

      {/* 대리 근무자 지정 모달 (Substitute worker modal) */}
      <Modal
        isOpen={showSubstituteModal}
        onClose={() => {
          setShowSubstituteModal(false);
          setSelectedUserId("");
        }}
        title="Assign Substitute"
      >
        <div className="space-y-4">
          <p className="text-sm text-text-secondary">
            Select a new employee to replace{" "}
            <span className="font-semibold text-text">
              {schedule.user_name}
            </span>{" "}
            for this schedule.
          </p>
          <Select
            label="New Employee"
            placeholder="Select an employee"
            value={selectedUserId}
            onChange={(e) => setSelectedUserId(e.target.value)}
            options={
              users
                ?.filter((u) => u.id !== schedule.user_id)
                .map((u) => ({
                  value: u.id,
                  label: `${u.full_name} (${u.role_name})`,
                })) ?? []
            }
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="ghost"
              onClick={() => {
                setShowSubstituteModal(false);
                setSelectedUserId("");
              }}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleSubstitute}
              isLoading={substituteSchedule.isPending}
              disabled={!selectedUserId}
            >
              Assign Substitute
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
