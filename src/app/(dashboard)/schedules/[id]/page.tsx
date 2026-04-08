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
  useScheduleAuditLog, useSchedules, useUpdateSchedule,
} from "@/hooks/useSchedules";
import { useUser, useUsers } from "@/hooks/useUsers";
import { useAttendances } from "@/hooks/useAttendances";
import { useAuthStore } from "@/stores/authStore";

export default function SchedulesDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;

  // 로그인 사용자 role 기반 cost 표시
  const currentUser = useAuthStore((s) => s.user);
  const showCost = (currentUser?.role_priority ?? 99) <= 20;

  const scheduleQ = useSchedule(id);
  const userQ = useUser(scheduleQ.data?.user_id);
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
        onBack={() => router.back()}
        onEdit={() => setEditOpen(true)}
        onSwap={() => {
          // Swap은 calendar view에서만 (candidate list 필요)
          router.push(`/schedules?swap=${id}`);
        }}
        onConfirm={schedule.status === "requested" ? handleConfirmAction : undefined}
        onRevert={schedule.status === "confirmed" ? handleRevert : undefined}
        onDelete={schedule.status === "confirmed" ? handleCancelConfirmed : handleDelete}
      />

      <ScheduleEditModal
        open={editOpen}
        mode="edit"
        schedule={schedule}
        users={usersQ.data ?? []}
        storeId={schedule.store_id}
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
