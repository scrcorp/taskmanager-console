"use client";

/**
 * 스케줄 상세 페이지 — server API fetch + inline ScheduleEditModal.
 * Edit 클릭 시 같은 페이지에서 modal을 띄우므로 overview로 튕기지 않음.
 */

import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ScheduleDetailPage } from "@/components/schedules/redesign/ScheduleDetailPage";
import { ScheduleEditModal, type ScheduleEditPayload } from "@/components/schedules/redesign/ScheduleEditModal";
import { ConfirmDialog } from "@/components/schedules/redesign/ConfirmDialog";
import {
  useSchedule, useDeleteSchedule, useRevertSchedule, useCancelSchedule, useConfirmSchedule,
  useScheduleAuditLog, useSchedules, useUpdateSchedule, useDeleteScheduleHistoryEntry,
} from "@/hooks/useSchedules";
import { PERMISSIONS, ROLE_PRIORITY } from "@/lib/permissions";
import { usePermissions } from "@/hooks/usePermissions";
import { useUser, useUsers } from "@/hooks/useUsers";
import { useStore, useStores } from "@/hooks/useStores";
import { useOrganization } from "@/hooks/useOrganization";
import { useAttendances } from "@/hooks/useAttendances";
import { useAuthStore } from "@/stores/authStore";

export default function SchedulesDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;

  // 로그인 사용자 role 기반 cost / action 권한
  const currentUser = useAuthStore((s) => s.user);
  const userPriority = currentUser?.role_priority ?? 99;
  const showCost = userPriority <= ROLE_PRIORITY.GM;
  const isGMPlus = userPriority <= ROLE_PRIORITY.GM;
  const isOwner = userPriority <= ROLE_PRIORITY.OWNER;
  const { hasPermission } = usePermissions();
  const canSwitchSchedule = hasPermission(PERMISSIONS.SCHEDULES_UPDATE);

  const scheduleQ = useSchedule(id);
  const userQ = useUser(scheduleQ.data?.user_id);
  const storeQ = useStore(scheduleQ.data?.store_id);
  const storesQ = useStores();
  const orgQ = useOrganization();
  const auditLogQ = useScheduleAuditLog(id);
  const usersQ = useUsers();
  const attendancesQ = useAttendances({
    user_id: scheduleQ.data?.user_id,
    work_date: scheduleQ.data?.work_date,
  });

  // 같은 user의 같은 주차 스케줄 (related)
  const weekRange = useMemo(() => {
    if (!scheduleQ.data) return null;
    const d = new Date(scheduleQ.data.work_date + "T00:00:00");
    const sunday = new Date(d);
    sunday.setDate(sunday.getDate() - sunday.getDay());
    const saturday = new Date(sunday);
    saturday.setDate(saturday.getDate() + 6);
    return {
      from: sunday.toISOString().slice(0, 10),
      to: saturday.toISOString().slice(0, 10),
    };
  }, [scheduleQ.data]);

  const relatedQ = useSchedules({
    user_id: scheduleQ.data?.user_id,
    date_from: weekRange?.from,
    date_to: weekRange?.to,
    per_page: 50,
  });

  const deleteMutation = useDeleteSchedule();
  const revertMutation = useRevertSchedule();
  const cancelMutation = useCancelSchedule();
  const confirmMutation = useConfirmSchedule();
  const updateMutation = useUpdateSchedule();
  const deleteHistoryMutation = useDeleteScheduleHistoryEntry();

  const [editOpen, setEditOpen] = useState(false);
  const [confirmAction, setConfirmAction] = useState<null | "delete" | "cancel" | "revert">(null);
  const [pendingHistoryDeleteId, setPendingHistoryDeleteId] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);

  if (scheduleQ.isLoading || userQ.isLoading) {
    return <div className="py-8 text-center text-[var(--color-text-muted)]">Loading…</div>;
  }
  if (scheduleQ.error) {
    return <div className="py-8 text-center text-[var(--color-danger)]">{scheduleQ.error.message}</div>;
  }
  if (!scheduleQ.data || !userQ.data) {
    return <div className="py-8 text-center text-[var(--color-text-muted)]">Schedule not found</div>;
  }

  const schedule = scheduleQ.data;
  const user = userQ.data;
  const attendance = attendancesQ.data?.items.find((a) => a.schedule_id === schedule.id) ?? null;
  const auditEvents = auditLogQ.data ?? [];
  const relatedSchedules = (relatedQ.data?.items ?? []).filter((s) => s.id !== schedule.id);

  const handleDelete = () => setConfirmAction("delete");
  const handleCancelConfirmed = () => setConfirmAction("cancel");
  const handleRevert = () => setConfirmAction("revert");
  const handleConfirmAction = () => {
    confirmMutation.mutate(id, { onSuccess: () => scheduleQ.refetch() });
  };

  // Effective rate cascade: user → store → org
  const orgDefaultRate = orgQ.data?.default_hourly_rate ?? null;
  const currentEffectiveRate: number | null = (() => {
    if (user.hourly_rate != null) return user.hourly_rate;
    if (storeQ.data?.default_hourly_rate != null) return storeQ.data.default_hourly_rate;
    if (orgDefaultRate != null) return orgDefaultRate;
    return null;
  })();

  // Sync stored rate → current effective (GM+ only)
  const canSyncRate = showCost && currentEffectiveRate != null && (currentUser?.role_priority ?? 99) <= ROLE_PRIORITY.GM;
  const handleSyncRate = canSyncRate
    ? () => {
        if (currentEffectiveRate == null) return;
        updateMutation.mutate(
          { id, data: { hourly_rate: currentEffectiveRate } },
          { onSuccess: () => scheduleQ.refetch() },
        );
      }
    : undefined;

  const handleEditSave = (payload: ScheduleEditPayload) => {
    setEditError(null);
    updateMutation.mutate(
      {
        id,
        data: {
          user_id: payload.userId,
          work_role_id: payload.workRoleId,
          work_date: payload.date,
          start_time: payload.startTime,
          end_time: payload.endTime,
          break_start_time: payload.breakStartTime,
          break_end_time: payload.breakEndTime,
          note: payload.notes || null,
          hourly_rate: payload.hourlyRate,
        },
      },
      {
        onSuccess: () => {
          setEditOpen(false);
          setEditError(null);
          scheduleQ.refetch();
        },
        onError: (err) => {
          const msg = err instanceof Error ? err.message : String(err);
          setEditError(msg);
        },
      },
    );
  };

  return (
    <>
      <ScheduleDetailPage
        schedule={schedule}
        user={user}
        attendance={attendance}
        auditEvents={auditEvents}
        relatedSchedules={relatedSchedules}
        users={usersQ.data ?? []}
        showCost={showCost}
        currentEffectiveRate={currentEffectiveRate}
        onSyncRate={handleSyncRate}
        isSyncingRate={updateMutation.isPending}
        onBack={() => router.back()}
        // Edit: confirmed면 GM+ only (서버 정책), draft/requested는 SV 이상 모두 가능
        onEdit={schedule.status === "confirmed" ? (isGMPlus ? () => setEditOpen(true) : undefined) : () => setEditOpen(true)}
        // Swap: requires schedules:update (SV+ by default)
        onSwitch={canSwitchSchedule && schedule.status === "confirmed" ? () => router.push(`/schedules?switch=${id}`) : undefined}
        // Confirm: requested 상태에서만 (SV 가능)
        onConfirm={schedule.status === "requested" ? handleConfirmAction : undefined}
        // Revert: GM+ only, confirmed → requested
        onRevert={isGMPlus && schedule.status === "confirmed" ? handleRevert : undefined}
        // Delete: confirmed cancel은 GM+, draft/requested delete는 SV 이상
        onDelete={
          schedule.status === "confirmed"
            ? (isGMPlus ? handleCancelConfirmed : undefined)
            : handleDelete
        }
        onDeleteHistoryEntry={isOwner ? (logId) => setPendingHistoryDeleteId(logId) : undefined}
      />

      <ScheduleEditModal
        open={editOpen}
        mode="edit"
        schedule={schedule}
        users={usersQ.data ?? []}
        storeId={schedule.store_id}
        stores={storesQ.data ?? []}
        inheritedRate={currentEffectiveRate}
        showCost={showCost}
        errorMessage={editError}
        onDismissError={() => setEditError(null)}
        onClose={() => { setEditOpen(false); setEditError(null); }}
        onSave={handleEditSave}
        isSaving={updateMutation.isPending}
        onDelete={() => {
          setEditOpen(false);
          handleDelete();
        }}
      />

      <ConfirmDialog
        open={confirmAction === "delete"}
        title="Delete Schedule"
        message="This will permanently remove the schedule record. Use this only for incorrectly created entries."
        confirmLabel="Delete"
        confirmVariant="danger"
        onConfirm={() => {
          setConfirmAction(null);
          deleteMutation.mutate(id, { onSuccess: () => router.push("/schedules") });
        }}
        onCancel={() => setConfirmAction(null)}
      />

      <ConfirmDialog
        open={confirmAction === "cancel"}
        title="Cancel Confirmed Schedule"
        message="This will mark the schedule as cancelled (record kept). You can optionally provide a reason."
        confirmLabel="Cancel Schedule"
        confirmVariant="danger"
        requiresReason
        reasonLabel="Cancellation reason (optional)"
        onConfirm={(reason) => {
          setConfirmAction(null);
          cancelMutation.mutate(
            { id, cancellation_reason: reason || undefined },
            { onSuccess: () => scheduleQ.refetch() },
          );
        }}
        onCancel={() => setConfirmAction(null)}
      />

      <ConfirmDialog
        open={confirmAction === "revert"}
        title="Revert to Requested"
        message="The schedule will be moved back to the approval queue."
        confirmLabel="Revert"
        onConfirm={() => {
          setConfirmAction(null);
          revertMutation.mutate(id, { onSuccess: () => scheduleQ.refetch() });
        }}
        onCancel={() => setConfirmAction(null)}
      />

      <ConfirmDialog
        open={pendingHistoryDeleteId !== null}
        title="Delete History Entry"
        message="This will permanently remove the audit log entry. This action cannot be undone."
        confirmLabel="Delete"
        confirmVariant="danger"
        onConfirm={() => {
          if (pendingHistoryDeleteId) {
            deleteHistoryMutation.mutate(pendingHistoryDeleteId, {
              onSuccess: () => auditLogQ.refetch(),
            });
          }
          setPendingHistoryDeleteId(null);
        }}
        onCancel={() => setPendingHistoryDeleteId(null)}
      />
    </>
  );
}
