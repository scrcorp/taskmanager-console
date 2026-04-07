"use client";

/**
 * 스케줄 상세 페이지 — 모든 데이터를 server API로 fetch 후 ScheduleDetailPage에 props로 전달.
 */

import { useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { ScheduleDetailPage } from "@/components/schedules/redesign/ScheduleDetailPage";
import {
  useSchedule, useDeleteSchedule, useRevertSchedule, useCancelSchedule, useConfirmSchedule,
  useScheduleAuditLog, useSchedules,
} from "@/hooks/useSchedules";
import { useUser } from "@/hooks/useUsers";
import { useAttendances } from "@/hooks/useAttendances";

export default function SchedulesDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;

  const scheduleQ = useSchedule(id);
  const userQ = useUser(scheduleQ.data?.user_id);
  const auditLogQ = useScheduleAuditLog(id);
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

  return (
    <ScheduleDetailPage
      schedule={schedule}
      user={user}
      attendance={attendance}
      auditEvents={auditEvents}
      relatedSchedules={relatedSchedules}
      showCost={true}
      onBack={() => router.push("/schedules")}
      onEdit={() => router.push(`/schedules?edit=${id}`)}
      onSwap={() => {
        // Calendar에서 swap을 띄우려면 별도 query 필요. 지금은 calendar로 보내기.
        router.push(`/schedules?swap=${id}`);
      }}
      onConfirm={schedule.status === "requested" ? handleConfirmAction : undefined}
      onRevert={schedule.status === "confirmed" ? handleRevert : undefined}
      onDelete={schedule.status === "confirmed" ? handleCancelConfirmed : handleDelete}
    />
  );
}
