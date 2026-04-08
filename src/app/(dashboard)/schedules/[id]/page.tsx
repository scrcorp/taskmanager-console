"use client";

/**
 * 스케줄 상세 페이지 — server API fetch + inline ScheduleEditModal.
 * Edit 클릭 시 같은 페이지에서 modal을 띄우므로 overview로 튕기지 않음.
 */

import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ScheduleDetailPage } from "@/components/schedules/redesign/ScheduleDetailPage";
import { ScheduleEditModal, type ScheduleEditPayload } from "@/components/schedules/redesign/ScheduleEditModal";
import {
  useSchedule, useDeleteSchedule, useRevertSchedule, useCancelSchedule, useConfirmSchedule,
  useScheduleAuditLog, useSchedules, useUpdateSchedule, useDeleteScheduleHistoryEntry,
} from "@/hooks/useSchedules";
import { useUser, useUsers } from "@/hooks/useUsers";
import { useStore } from "@/hooks/useStores";
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
  const showCost = userPriority <= 20;       // Owner/GM
  const isGMPlus = userPriority <= 20;       // confirmed schedule modify/delete/revert/cancel/swap
  const isOwner = userPriority <= 10;        // history entry 삭제

  const scheduleQ = useSchedule(id);
  const userQ = useUser(scheduleQ.data?.user_id);
  const storeQ = useStore(scheduleQ.data?.store_id);
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

  const handleDelete = () => {
    if (!window.confirm("Delete this schedule?")) return;
    deleteMutation.mutate(id, { onSuccess: () => router.push("/schedules") });
  };
  const handleCancelConfirmed = () => {
    const reason = window.prompt("Cancellation reason (optional):") ?? undefined;
    cancelMutation.mutate({ id, cancellation_reason: reason }, {
      onSuccess: () => scheduleQ.refetch(),
    });
  };
  const handleRevert = () => {
    if (!window.confirm("Revert this confirmed schedule to requested?")) return;
    revertMutation.mutate(id, { onSuccess: () => scheduleQ.refetch() });
  };
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
  const canSyncRate = showCost && currentEffectiveRate != null && (currentUser?.role_priority ?? 99) <= 20;
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
    updateMutation.mutate(
      {
        id,
        data: {
          user_id: payload.userId,
          work_role_id: payload.workRoleId,
          work_date: payload.date,
          start_time: payload.startTime,
          end_time: payload.endTime,
          note: payload.notes || null,
          hourly_rate: payload.hourlyRate,
        },
      },
      {
        onSuccess: () => {
          setEditOpen(false);
          scheduleQ.refetch();
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
        showCost={showCost}
        currentEffectiveRate={currentEffectiveRate}
        onSyncRate={handleSyncRate}
        isSyncingRate={updateMutation.isPending}
        onBack={() => router.back()}
        // Edit: confirmed면 GM+ only (서버 정책), draft/requested는 SV 이상 모두 가능
        onEdit={schedule.status === "confirmed" ? (isGMPlus ? () => setEditOpen(true) : undefined) : () => setEditOpen(true)}
        // Swap: GM+ only
        onSwap={isGMPlus && schedule.status === "confirmed" ? () => router.push(`/schedules?swap=${id}`) : undefined}
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
        onDeleteHistoryEntry={isOwner ? (logId) => deleteHistoryMutation.mutate(logId, { onSuccess: () => auditLogQ.refetch() }) : undefined}
      />

      <ScheduleEditModal
        open={editOpen}
        mode="edit"
        schedule={schedule}
        users={usersQ.data ?? []}
        storeId={schedule.store_id}
        inheritedRate={currentEffectiveRate}
        showCost={showCost}
        onClose={() => setEditOpen(false)}
        onSave={handleEditSave}
        isSaving={updateMutation.isPending}
        onDelete={() => {
          setEditOpen(false);
          handleDelete();
        }}
      />
    </>
  );
}
