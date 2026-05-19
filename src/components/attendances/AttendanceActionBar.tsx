"use client";

import React from "react";
import {
  LogIn,
  LogOut,
  Coffee,
  Play,
  UserX,
  XCircle,
  RotateCcw,
} from "lucide-react";
import { Button } from "@/components/ui";
import { useModal } from "@/components/ui/imperative-modal";
import {
  useClockInAction,
  useClockOutAction,
  useStartBreakAction,
  useEndBreakAction,
  useMarkNoShowAction,
  useCancelAction,
  useReopenAction,
} from "@/hooks";
import type { Attendance } from "@/types";
import {
  ActionFormModal,
  nowAsLocalInput,
  type ActionPayload,
} from "./ActionFormModal";

/**
 * Attendance 상세 페이지 헤더의 액션 버튼 묶음.
 *
 * 현재 status 에 따라 의미 있는 액션만 노출. 각 버튼은 그 액션 전용 작은
 * 모달을 띄우고, 결과를 해당 mutation 으로 전송한다. 모달은 시간 picker +
 * Reason preset (+ Other) 만 필요한 항목으로 구성됨.
 *
 * Status 직접 변경 UI 는 없다 — 모순 상태가 만들어지지 않게 강제.
 */

interface AttendanceActionBarProps {
  attendance: Attendance;
}

export function AttendanceActionBar({
  attendance,
}: AttendanceActionBarProps): React.ReactElement {
  const modal = useModal();
  const clockIn = useClockInAction();
  const clockOut = useClockOutAction();
  const startBreak = useStartBreakAction();
  const endBreak = useEndBreakAction();
  const markNoShow = useMarkNoShowAction();
  const cancel = useCancelAction();
  const reopen = useReopenAction();

  const status = attendance.status;
  const aid = attendance.id;

  // ── handlers ─────────────────────────────────────────────────────────

  const handleClockIn = async (): Promise<void> => {
    const result = await modal.open<ActionPayload>(
      ({ close }) => (
        <ActionFormModal
          title="Clock In"
          description={`Record when ${attendance.user_name ?? "the employee"} actually clocked in.`}
          needsTime
          defaultTime={nowAsLocalInput()}
          timeLabel="Clock-in time"
          submitLabel="Clock in"
          busy={clockIn.isPending}
          onClose={close}
        />
      ),
      { title: "Clock In", size: "sm", closeOnBackdrop: false },
    );
    if (!result || !result.at) return;
    await clockIn.mutateAsync({
      attendanceId: aid,
      data: { at: result.at, reason: result.reason },
    });
  };

  const handleClockOut = async (): Promise<void> => {
    const result = await modal.open<ActionPayload>(
      ({ close }) => (
        <ActionFormModal
          title="Clock Out"
          description={
            status === "on_break"
              ? "Any open break will be closed at the same time."
              : "Record the end of this shift."
          }
          needsTime
          defaultTime={nowAsLocalInput()}
          timeLabel="Clock-out time"
          submitLabel="Clock out"
          busy={clockOut.isPending}
          onClose={close}
        />
      ),
      { title: "Clock Out", size: "sm", closeOnBackdrop: false },
    );
    if (!result || !result.at) return;
    await clockOut.mutateAsync({
      attendanceId: aid,
      data: { at: result.at, reason: result.reason },
    });
  };

  const handleStartBreak = async (
    breakType: "paid_10min" | "unpaid_meal",
  ): Promise<void> => {
    const label = breakType === "paid_10min" ? "10-min Break (paid)" : "Meal Break (unpaid)";
    const result = await modal.open<ActionPayload>(
      ({ close }) => (
        <ActionFormModal
          title={`Start ${label}`}
          description={`Record when the break started. Status will change to "On break".`}
          needsTime
          defaultTime={nowAsLocalInput()}
          breakType={breakType}
          timeLabel="Break start time"
          submitLabel={`Start ${breakType === "paid_10min" ? "10-min break" : "meal break"}`}
          busy={startBreak.isPending}
          onClose={close}
        />
      ),
      { title: `Start ${label}`, size: "sm", closeOnBackdrop: false },
    );
    if (!result || !result.at || !result.break_type) return;
    await startBreak.mutateAsync({
      attendanceId: aid,
      data: {
        at: result.at,
        break_type: result.break_type,
        reason: result.reason,
      },
    });
  };

  const handleEndBreak = async (): Promise<void> => {
    const result = await modal.open<ActionPayload>(
      ({ close }) => (
        <ActionFormModal
          title="End Break"
          description="Record when the break actually ended."
          needsTime
          defaultTime={nowAsLocalInput()}
          timeLabel="Break end time"
          submitLabel="End break"
          busy={endBreak.isPending}
          onClose={close}
        />
      ),
      { title: "End Break", size: "sm", closeOnBackdrop: false },
    );
    if (!result || !result.at) return;
    await endBreak.mutateAsync({
      attendanceId: aid,
      data: { at: result.at, reason: result.reason },
    });
  };

  const handleMarkNoShow = async (): Promise<void> => {
    const result = await modal.open<ActionPayload>(
      ({ close }) => (
        <ActionFormModal
          title="Mark No-show"
          description="The employee did not arrive for this shift."
          needsTime={false}
          submitLabel="Mark no-show"
          danger
          busy={markNoShow.isPending}
          onClose={close}
        />
      ),
      { title: "Mark No-show", size: "sm", closeOnBackdrop: false },
    );
    if (!result) return;
    await markNoShow.mutateAsync({
      attendanceId: aid,
      data: { reason: result.reason },
    });
  };

  const handleCancel = async (): Promise<void> => {
    const result = await modal.open<ActionPayload>(
      ({ close }) => (
        <ActionFormModal
          title="Cancel Shift"
          description="The shift was cancelled before it started."
          needsTime={false}
          submitLabel="Cancel shift"
          danger
          busy={cancel.isPending}
          onClose={close}
        />
      ),
      { title: "Cancel Shift", size: "sm", closeOnBackdrop: false },
    );
    if (!result) return;
    await cancel.mutateAsync({
      attendanceId: aid,
      data: { reason: result.reason },
    });
  };

  const handleReopen = async (): Promise<void> => {
    const result = await modal.open<ActionPayload>(
      ({ close }) => (
        <ActionFormModal
          title="Reopen"
          description={
            status === "clocked_out"
              ? "Undo the clock-out. Status will revert to working (or on-break if a break is open)."
              : "Reopen this attendance back to upcoming so corrections can be made."
          }
          needsTime={false}
          submitLabel="Reopen"
          busy={reopen.isPending}
          onClose={close}
        />
      ),
      { title: "Reopen", size: "sm", closeOnBackdrop: false },
    );
    if (!result) return;
    await reopen.mutateAsync({
      attendanceId: aid,
      data: { reason: result.reason },
    });
  };

  // ── 버튼 구성 ─────────────────────────────────────────────────────────

  const buttons: React.ReactNode[] = [];

  // 출근 전 (upcoming/soon/cancelled/no_show — clock_in 이 없는 상태)
  if (
    attendance.clock_in === null &&
    (status === "upcoming" || status === "soon" || status === "late" || status === "no_show" || status === "cancelled")
  ) {
    if (status === "no_show" || status === "cancelled") {
      buttons.push(
        <Button key="reopen" size="sm" variant="secondary" onClick={handleReopen}>
          <RotateCcw size={14} className="mr-1" /> Reopen
        </Button>,
      );
    } else {
      buttons.push(
        <Button key="clockin" size="sm" variant="primary" onClick={handleClockIn}>
          <LogIn size={14} className="mr-1" /> Clock in
        </Button>,
        <Button key="noshow" size="sm" variant="secondary" onClick={handleMarkNoShow}>
          <UserX size={14} className="mr-1" /> No-show
        </Button>,
        <Button key="cancel" size="sm" variant="secondary" onClick={handleCancel}>
          <XCircle size={14} className="mr-1" /> Cancel
        </Button>,
      );
    }
  }

  // 출근 중
  if (status === "working" || status === "late") {
    buttons.push(
      <Button
        key="break10"
        size="sm"
        variant="secondary"
        onClick={() => handleStartBreak("paid_10min")}
      >
        <Coffee size={14} className="mr-1" /> Start 10-min break
      </Button>,
      <Button
        key="breakmeal"
        size="sm"
        variant="secondary"
        onClick={() => handleStartBreak("unpaid_meal")}
      >
        <Coffee size={14} className="mr-1" /> Start meal break
      </Button>,
      <Button key="clockout" size="sm" variant="primary" onClick={handleClockOut}>
        <LogOut size={14} className="mr-1" /> Clock out
      </Button>,
    );
  }

  if (status === "on_break") {
    buttons.push(
      <Button key="endbreak" size="sm" variant="primary" onClick={handleEndBreak}>
        <Play size={14} className="mr-1" /> End break
      </Button>,
      <Button key="clockout" size="sm" variant="secondary" onClick={handleClockOut}>
        <LogOut size={14} className="mr-1" /> Clock out
      </Button>,
    );
  }

  if (status === "clocked_out") {
    buttons.push(
      <Button key="reopen" size="sm" variant="secondary" onClick={handleReopen}>
        <RotateCcw size={14} className="mr-1" /> Reopen
      </Button>,
    );
  }

  return <div className="flex flex-wrap gap-2 justify-end">{buttons}</div>;
}
