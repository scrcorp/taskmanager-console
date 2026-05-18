"use client";

/**
 * 스케줄 상세 페이지 — server API fetch + inline ScheduleEditModal.
 * Edit 클릭 시 같은 페이지에서 modal을 띄우므로 overview로 튕기지 않음.
 */

import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ScheduleDetailPage } from "@/components/schedules/redesign/ScheduleDetailPage";
import { ScheduleEditModal, type ScheduleEditPayload } from "@/components/schedules/redesign/ScheduleEditModal";
import { useModal } from "@/components/ui/imperative-modal";
import {
  useSchedule, useDeleteScheduleFlow, useRevertSchedule, useCancelSchedule, useConfirmSchedule,
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

  // 같은 user의 같은 주차 스케줄 (related).
  // work_date 는 캘린더 날짜 — toISOString() 으로 되돌리면 timezone offset 만큼 어긋남.
  // 캘린더 산술로만 처리.
  const weekRange = useMemo(() => {
    if (!scheduleQ.data) return null;
    const [y, m, d] = scheduleQ.data.work_date.split("-").map(Number);
    const local = new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1);
    const sunday = new Date(local);
    sunday.setDate(sunday.getDate() - sunday.getDay());
    const saturday = new Date(sunday);
    saturday.setDate(saturday.getDate() + 6);
    const fmt = (dd: Date) => `${dd.getFullYear()}-${String(dd.getMonth() + 1).padStart(2, "0")}-${String(dd.getDate()).padStart(2, "0")}`;
    return { from: fmt(sunday), to: fmt(saturday) };
  }, [scheduleQ.data]);

  const relatedQ = useSchedules({
    user_id: scheduleQ.data?.user_id,
    date_from: weekRange?.from,
    date_to: weekRange?.to,
    per_page: 50,
  });

  const deleteFlow = useDeleteScheduleFlow();
  const revertMutation = useRevertSchedule();
  const cancelMutation = useCancelSchedule();
  const confirmMutation = useConfirmSchedule();
  const updateMutation = useUpdateSchedule();
  const deleteHistoryMutation = useDeleteScheduleHistoryEntry();

  const [editOpen, setEditOpen] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const modal = useModal();

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

  // 모든 confirm 흐름이 modal.confirm 으로 통일됨. 결과 모달은 각 mutation hook 이 자동 발사.
  const handleDelete = (): void => {
    void deleteFlow(id, () => router.push("/schedules"));
  };
  const handleCancelConfirmed = async (): Promise<void> => {
    const reason = await modal.confirm({
      title: "Cancel Confirmed Schedule",
      message: "This will mark the schedule as cancelled (record kept). You can optionally provide a reason.",
      confirmLabel: "Cancel Schedule",
      variant: "danger",
      requiresReason: true,
      reasonLabel: "Cancellation reason (optional)",
    });
    if (reason === undefined) return;
    cancelMutation.mutate(
      { id, cancellation_reason: reason || undefined },
      { onSuccess: () => scheduleQ.refetch() },
    );
  };
  const handleRevert = async (): Promise<void> => {
    const ok = await modal.confirm({
      title: "Revert to Requested",
      message: "The schedule will be moved back to the approval queue.",
      confirmLabel: "Revert",
    });
    if (!ok) return;
    revertMutation.mutate(id, { onSuccess: () => scheduleQ.refetch() });
  };
  const handleConfirmAction = (): void => {
    confirmMutation.mutate(id, { onSuccess: () => scheduleQ.refetch() });
  };
  const handleDeleteHistoryEntry = async (logId: string): Promise<void> => {
    const ok = await modal.confirm({
      title: "Delete History Entry",
      message: "This will permanently remove the audit log entry. This action cannot be undone.",
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;
    deleteHistoryMutation.mutate(logId, { onSuccess: () => auditLogQ.refetch() });
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
        onDeleteHistoryEntry={isOwner ? handleDeleteHistoryEntry : undefined}
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
        onDeleted={() => router.push("/schedules")}
      />

    </>
  );
}
