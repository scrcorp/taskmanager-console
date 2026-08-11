"use client";

/**
 * 간소화 콘솔 — 스케줄 등록/수정 폼.
 *
 * 시각 조립은 `shiftIsoFields` 로 데스크탑과 같은 경로를 탄다 (벽시계 datetime + 영업일 라벨).
 * 저장 전 `useValidateSchedule` 프리플라이트도 데스크탑과 동일 — warning 이 있으면 확인 후 force.
 */

import { useState } from "react";
import { useUsers } from "@/hooks/useUsers";
import { useWorkRoles } from "@/hooks/useWorkRoles";
import {
  useCancelSchedule,
  useConfirmSchedule,
  useCreateSchedule,
  useDeleteScheduleFlow,
  useUpdateSchedule,
  useValidateSchedule,
  useScheduleWarningGate,
} from "@/hooks/useSchedules";
import { usePermissions } from "@/hooks/usePermissions";
import { useModal } from "@/components/ui/imperative-modal";
import { PERMISSIONS } from "@/lib/permissions";
import { rollEndDate, shiftIsoFields } from "@/lib/scheduleTime";
import { describeScheduleIssues } from "@/lib/scheduleCodes";
import type { Schedule } from "@/types";

const FIELD =
  "h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm text-text focus:outline-none focus:ring-2 focus:ring-accent";
const LABEL = "mb-1 block text-xs font-medium text-text-secondary";

export function CompactScheduleForm({
  storeId,
  date,
  schedule,
  onDone,
}: {
  storeId: string;
  date: string;
  schedule?: Schedule;
  onDone: () => void;
}) {
  const modal = useModal();
  const { hasPermission } = usePermissions();
  const { data: users } = useUsers({ store_id: storeId, is_active: true });
  const { data: workRoles } = useWorkRoles(storeId);

  const createSchedule = useCreateSchedule();
  const updateSchedule = useUpdateSchedule();
  const validateSchedule = useValidateSchedule();
  const warningGate = useScheduleWarningGate();
  const confirmSchedule = useConfirmSchedule();
  const cancelSchedule = useCancelSchedule();
  const deleteFlow = useDeleteScheduleFlow();

  const [userId, setUserId] = useState(schedule?.user_id ?? "");
  const [workRoleId, setWorkRoleId] = useState(schedule?.work_role_id ?? "");
  const [startTime, setStartTime] = useState(schedule?.start_at?.slice(11, 16) ?? "09:00");
  const [endTime, setEndTime] = useState(schedule?.end_at?.slice(11, 16) ?? "17:00");
  const [note, setNote] = useState(schedule?.note ?? "");
  const [saving, setSaving] = useState(false);

  const operatingDay = schedule?.operating_day ?? schedule?.work_date ?? date;
  // 기존 건은 저장된 시작 달력일을 유지한다 (새벽 근무는 영업일 라벨보다 하루 뒤일 수 있음)
  const startDate = schedule?.start_at?.slice(0, 10) ?? operatingDay;

  const canEdit = hasPermission(
    schedule ? PERMISSIONS.SCHEDULES_UPDATE : PERMISSIONS.SCHEDULES_CREATE,
  );

  function buildIso(force: boolean) {
    const endDate = rollEndDate(startDate, startTime, endTime);
    const iso = shiftIsoFields(operatingDay, startDate, startTime, endDate, endTime, null, null);
    return {
      user_id: userId,
      store_id: storeId,
      work_role_id: workRoleId || null,
      work_date: operatingDay,
      start_time: startTime,
      end_time: endTime,
      ...iso,
      note: note || null,
      force,
    };
  }

  async function handleSave() {
    if (!userId) {
      void modal.alert({ type: "error", message: "Pick a staff member for this shift." });
      return;
    }
    setSaving(true);
    try {
      const payload = buildIso(false);

      // 프리플라이트 — overtime/겹침 등 warning 은 저장 전에 사용자 확인.
      let force = false;
      try {
        const res = await validateSchedule.mutateAsync(payload);
        if (res.warnings.length > 0) {
          const ok = await modal.confirm({
            title: "Confirm shift",
            // 문구는 code + params 로 구성 (D9-4). 서버 message 문자열을 쓰지 않는다.
            message: describeScheduleIssues(res.warnings),
            confirmLabel: "Save anyway",
            variant: "danger",
          });
          if (!ok) return;
          force = true;
        }
      } catch {
        // validate 엔드포인트 자체가 죽으면 경고 없이 진행 — 저장 시점에 서버가 다시 거른다.
      }

      const body = buildIso(force);
      try {
        if (schedule) {
          await updateSchedule.mutateAsync({ id: schedule.id, data: body });
        } else {
          await createSchedule.mutateAsync(body);
        }
      } catch (err) {
        // 프리플라이트를 통과했어도 그 사이 다른 스케줄이 생겨 409 가 날 수 있다.
        // **최상위 code 로 식별** — 급여 잠금/폐점 409 에 "Save anyway" 가 뜨면 안 된다.
        const gate = await warningGate(err);
        if (gate !== "retry") throw err;
        const forced = buildIso(true);
        if (schedule) {
          await updateSchedule.mutateAsync({ id: schedule.id, data: forced });
        } else {
          await createSchedule.mutateAsync(forced);
        }
      }
      onDone();
    } catch {
      // 결과 모달은 hook 이 자동으로 띄운다.
    } finally {
      setSaving(false);
    }
  }

  async function handleConfirm() {
    if (!schedule) return;
    try {
      await confirmSchedule.mutateAsync(schedule.id);
      onDone();
    } catch {
      /* hook 자동 모달 */
    }
  }

  async function handleCancel() {
    if (!schedule) return;
    const reason = await modal.confirm({
      title: "Cancel shift",
      message: "The staff member will see this shift as cancelled.",
      confirmLabel: "Cancel shift",
      variant: "danger",
      requiresReason: true,
      reasonLabel: "Reason (optional)",
    });
    if (reason === undefined) return;
    try {
      await cancelSchedule.mutateAsync({
        id: schedule.id,
        cancellation_reason: typeof reason === "string" && reason ? reason : undefined,
      });
      onDone();
    } catch {
      /* hook 자동 모달 */
    }
  }

  return (
    <div className="space-y-4 px-1 pb-1">
      <div>
        <label className={LABEL} htmlFor="compact-staff">
          Staff
        </label>
        <select
          id="compact-staff"
          className={FIELD}
          value={userId}
          onChange={(e) => setUserId(e.target.value)}
          disabled={!canEdit}
        >
          <option value="">Select staff</option>
          {(users ?? []).map((u) => (
            <option key={u.id} value={u.id}>
              {u.full_name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className={LABEL} htmlFor="compact-role">
          Role
        </label>
        <select
          id="compact-role"
          className={FIELD}
          value={workRoleId}
          onChange={(e) => setWorkRoleId(e.target.value)}
          disabled={!canEdit}
        >
          <option value="">No role</option>
          {(workRoles ?? []).map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </div>

      <div className="flex gap-3">
        <div className="flex-1">
          <label className={LABEL} htmlFor="compact-start">
            Start
          </label>
          <input
            id="compact-start"
            type="time"
            className={FIELD}
            value={startTime}
            onChange={(e) => setStartTime(e.target.value)}
            disabled={!canEdit}
          />
        </div>
        <div className="flex-1">
          <label className={LABEL} htmlFor="compact-end">
            End
          </label>
          <input
            id="compact-end"
            type="time"
            className={FIELD}
            value={endTime}
            onChange={(e) => setEndTime(e.target.value)}
            disabled={!canEdit}
          />
        </div>
      </div>

      <div>
        <label className={LABEL} htmlFor="compact-note">
          Note
        </label>
        <input
          id="compact-note"
          type="text"
          className={FIELD}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Optional"
          disabled={!canEdit}
        />
      </div>

      {canEdit && (
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="h-12 w-full rounded-lg bg-accent text-sm font-semibold text-white transition-colors hover:bg-accent-light disabled:opacity-60"
        >
          {saving ? "Saving…" : schedule ? "Save changes" : "Add shift"}
        </button>
      )}

      {schedule && (
        <div className="flex flex-wrap gap-2 border-t border-border pt-3">
          {schedule.status !== "confirmed" && hasPermission(PERMISSIONS.SCHEDULES_APPROVE) && (
            <button
              type="button"
              onClick={handleConfirm}
              className="h-11 flex-1 rounded-lg border border-border text-sm font-semibold text-success"
            >
              Confirm
            </button>
          )}
          {hasPermission(PERMISSIONS.SCHEDULES_CANCEL) && (
            <button
              type="button"
              onClick={handleCancel}
              className="h-11 flex-1 rounded-lg border border-border text-sm font-semibold text-text-secondary"
            >
              Cancel shift
            </button>
          )}
          {hasPermission(PERMISSIONS.SCHEDULES_DELETE) && (
            <button
              type="button"
              onClick={() => void deleteFlow(schedule.id, onDone)}
              className="h-11 flex-1 rounded-lg border border-border text-sm font-semibold text-danger"
            >
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  );
}
