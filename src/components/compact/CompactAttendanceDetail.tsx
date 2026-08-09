"use client";

/**
 * 간소화 콘솔 — 근태 상세/수정.
 *
 * 담는 것: 시각 정정(clock in/out) · 자동퇴근 확인 · 조기 출근 확인 · break 세션 추가/수정/삭제.
 * 매니저 대행 출퇴근(clock in/out action)은 담지 않는다 — 기록 신뢰도 문제이고 HTMA 와 역할이 겹친다.
 *
 * 시각 값은 서버가 매장 tz 로 pre-format 한 `*_display` 를 읽고,
 * 저장할 때만 `localInputToIsoInTz` 로 되돌린다 (브라우저 로컬 tz 가 끼어들지 않게).
 *
 * break 조작(추가/종류변경/삭제)은 사유를 함께 보낸다 — 선택 입력이지만 비우면 Activity History 에
 * "(no reason)" 으로 남는다. 데스크탑이 세운 규약이라 compact 만 빠지면 이력이 조용히 비어버린다.
 */

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  useAddBreakSession,
  useAttendance,
  useConfirmAutoClockout,
  useConfirmEarlyClockIn,
  useCorrectAttendance,
  useDeleteBreakSession,
  useUpdateBreakSession,
} from "@/hooks/useAttendances";
import { useTimezone } from "@/hooks/useTimezone";
import { isUnconfirmedEarlyClockIn } from "@/components/schedules/redesign/attendanceConfirm";
import { useModal } from "@/components/ui/imperative-modal";
import {
  CORRECTION_REASON_PRESETS,
  OTHER_REASON_LABEL,
} from "@/components/attendances/correctionPresets";
import { isoToLocalInputInTz, localInputToIsoInTz } from "@/lib/utils";
import { suggestedClockInputs } from "@/lib/compactAttendance";
import type { Attendance, BreakSessionCreateRequest } from "@/types";

const FIELD =
  "h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm text-text focus:outline-none focus:ring-2 focus:ring-accent";
const LABEL = "mb-1 block text-xs font-medium text-text-secondary";

export function CompactAttendanceDetail({
  attendance,
  onDone,
}: {
  attendance: Attendance;
  onDone: () => void;
}) {
  const tz = useTimezone();
  const modal = useModal();

  // break 추가/삭제 후에도 시트가 열린 채 최신 상태를 보여야 한다.
  // 넘겨받은 객체만 쓰면 목록만 갱신되고 시트는 낡은 값을 계속 그린다.
  const { data: fresh } = useAttendance(attendance.id);
  const record = fresh ?? attendance;

  const correct = useCorrectAttendance();
  const confirmAutoClockout = useConfirmAutoClockout();
  const confirmEarlyClockIn = useConfirmEarlyClockIn();
  const addBreak = useAddBreakSession();
  const updateBreak = useUpdateBreakSession();
  const deleteBreak = useDeleteBreakSession();

  const originalIn = isoToLocalInputInTz(attendance.clock_in, tz);
  const originalOut = isoToLocalInputInTz(attendance.clock_out, tz);

  // 기록이 없는 칸은 예정 시각으로 미리 채운다 — 폰에서 날짜부터 찍게 만들지 않기 위해.
  const suggested = suggestedClockInputs(attendance, (iso) => isoToLocalInputInTz(iso, tz));

  const [clockIn, setClockIn] = useState(suggested.clockIn);
  const [clockOut, setClockOut] = useState(suggested.clockOut);
  const [reasonPreset, setReasonPreset] = useState(CORRECTION_REASON_PRESETS[0]);
  const [otherReason, setOtherReason] = useState("");
  const [saving, setSaving] = useState(false);

  const reason = reasonPreset === OTHER_REASON_LABEL ? otherReason.trim() : reasonPreset;
  const changed = clockIn !== originalIn || clockOut !== originalOut;

  const needsAutoClockoutConfirm =
    (record.anomalies ?? []).includes("auto_clocked_out") &&
    !record.auto_clock_out_confirmed_at;

  // 조기 출근 강행은 확인 전까지 payroll 확정이 막힌다. /c 가 모바일 주용도라
  // 여기 없으면 폰만 든 매니저는 급여 마감을 풀 방법이 없다.
  const needsEarlyClockInConfirm = isUnconfirmedEarlyClockIn(
    record.anomalies,
    record.early_clock_in_confirmed_at,
  );

  async function handleSaveCorrection() {
    if (!changed) return;
    if (!reason) {
      void modal.alert({ type: "error", message: "Enter a reason for this correction." });
      return;
    }
    setSaving(true);
    try {
      // clock_in 을 먼저 — 서버가 필드별로 순차 처리하므로 시간 무결성 순서를 지킨다.
      const fields: Array<{ key: "clock_in" | "clock_out"; value: string }> = [];
      if (clockIn !== originalIn) fields.push({ key: "clock_in", value: clockIn });
      if (clockOut !== originalOut) fields.push({ key: "clock_out", value: clockOut });

      for (const f of fields) {
        const iso = localInputToIsoInTz(f.value, tz);
        if (!iso) continue;
        await correct.mutateAsync({
          id: attendance.id,
          data: { field_name: f.key, corrected_value: iso, reason },
        });
      }
      onDone();
    } catch {
      // hook 자동 모달
    } finally {
      setSaving(false);
    }
  }

  async function handleAddBreak() {
    const started = localInputToIsoInTz(clockIn || originalIn, tz);
    if (!started) {
      void modal.alert({
        type: "error",
        message: "This record has no clock-in time yet, so a break can't be placed.",
      });
      return;
    }
    const reason = await modal.confirm({
      title: "Add break",
      message: "Adds an unpaid meal break starting at the clock-in time. You can change it below.",
      confirmLabel: "Add break",
      requiresReason: true,
      reasonLabel: "Reason (optional)",
    });
    if (reason === undefined) return;

    const data: BreakSessionCreateRequest = {
      started_at: started,
      break_type: "unpaid_meal",
      reason: typeof reason === "string" && reason ? reason : null,
    };
    try {
      // 시트를 닫지 않는다 — 방금 추가한 break 의 종류/시간을 바로 이어서 고치는 흐름이 자연스럽다.
      await addBreak.mutateAsync({ attendanceId: attendance.id, data });
    } catch {
      // hook 자동 모달
    }
  }

  async function handleChangeBreakType(breakId: string, nextType: string) {
    const reason = await modal.confirm({
      title: "Change break type",
      message: `Change this break to "${nextType.replace(/_/g, " ")}"?`,
      confirmLabel: "Change",
      requiresReason: true,
      reasonLabel: "Reason (optional)",
    });
    if (reason === undefined) return;
    updateBreak.mutate({
      attendanceId: attendance.id,
      breakId,
      data: {
        break_type: nextType as "paid_10min" | "unpaid_meal",
        reason: typeof reason === "string" && reason ? reason : null,
      },
    });
  }

  async function handleDeleteBreak(breakId: string) {
    const reason = await modal.confirm({
      title: "Delete break",
      message: "This break session will be removed from the record.",
      confirmLabel: "Delete",
      variant: "danger",
      requiresReason: true,
      reasonLabel: "Reason (optional)",
    });
    if (reason === undefined) return;
    deleteBreak.mutate({
      attendanceId: attendance.id,
      breakId,
      reason: typeof reason === "string" && reason ? reason : undefined,
    });
  }

  return (
    <div className="space-y-4 px-1 pb-1">
      {needsAutoClockoutConfirm && (
        <div className="rounded-lg border border-warning bg-warning-muted px-3 py-2.5">
          <p className="text-xs text-text">
            This shift was clocked out automatically. Check the time, then confirm it.
          </p>
          <button
            type="button"
            onClick={() =>
              confirmAutoClockout.mutate({ attendanceId: attendance.id }, { onSuccess: onDone })
            }
            className="mt-2 h-10 w-full rounded-lg bg-warning text-sm font-semibold text-black"
          >
            Confirm auto clock-out
          </button>
        </div>
      )}

      {needsEarlyClockInConfirm && (
        <div className="rounded-lg border border-warning bg-warning-muted px-3 py-2.5">
          <p className="text-xs text-text">
            This employee clocked in before their shift started and gave a reason. The extra
            time is in payroll — check the time, then confirm it.
          </p>
          <button
            type="button"
            onClick={() =>
              confirmEarlyClockIn.mutate({ attendanceId: attendance.id }, { onSuccess: onDone })
            }
            className="mt-2 h-10 w-full rounded-lg bg-warning text-sm font-semibold text-black"
          >
            Confirm early clock-in
          </button>
        </div>
      )}

      {(suggested.inPrefilled || suggested.outPrefilled) && (
        <p className="text-xs text-text-secondary">
          Prefilled from the scheduled shift. Adjust the times if they&apos;re different.
        </p>
      )}

      <div>
        <label className={LABEL} htmlFor="compact-clock-in">
          Clock in
        </label>
        <input
          id="compact-clock-in"
          type="datetime-local"
          className={FIELD}
          value={clockIn}
          onChange={(e) => setClockIn(e.target.value)}
        />
      </div>

      <div>
        <label className={LABEL} htmlFor="compact-clock-out">
          Clock out
        </label>
        <input
          id="compact-clock-out"
          type="datetime-local"
          className={FIELD}
          value={clockOut}
          onChange={(e) => setClockOut(e.target.value)}
        />
      </div>

      {changed && (
        <>
          <div>
            <label className={LABEL} htmlFor="compact-reason">
              Reason
            </label>
            <select
              id="compact-reason"
              className={FIELD}
              value={reasonPreset}
              onChange={(e) => setReasonPreset(e.target.value)}
            >
              {CORRECTION_REASON_PRESETS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
              <option value={OTHER_REASON_LABEL}>{OTHER_REASON_LABEL}</option>
            </select>
          </div>

          {reasonPreset === OTHER_REASON_LABEL && (
            <input
              type="text"
              className={FIELD}
              value={otherReason}
              onChange={(e) => setOtherReason(e.target.value)}
              placeholder="Describe the reason"
              aria-label="Other reason"
            />
          )}

          <button
            type="button"
            onClick={handleSaveCorrection}
            disabled={saving}
            className="h-12 w-full rounded-lg bg-accent text-sm font-semibold text-white transition-colors hover:bg-accent-light disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save correction"}
          </button>
        </>
      )}

      {/* Break 세션 — 화면이 복잡해지지 않도록 별도 섹션으로 분리 */}
      <div className="border-t border-border pt-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase text-text-secondary">Breaks</span>
          <button
            type="button"
            onClick={handleAddBreak}
            className="flex h-9 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-accent"
          >
            <Plus size={16} /> Add
          </button>
        </div>

        {record.breaks.length === 0 && (
          <p className="py-2 text-sm text-text-secondary">No breaks recorded.</p>
        )}

        <div className="space-y-2">
          {record.breaks.map((b) => (
            <div
              key={b.id}
              className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <div className="text-sm tabular-nums text-text">
                  {b.started_at_display ?? "--:--"} – {b.ended_at_display ?? "in progress"}
                </div>
                <div className="text-xs text-text-secondary">
                  {b.break_type.replace(/_/g, " ")}
                  {b.duration_minutes !== null && ` · ${b.duration_minutes} min`}
                </div>
              </div>

              <select
                value={b.break_type}
                onChange={(e) => void handleChangeBreakType(b.id, e.target.value)}
                aria-label="Break type"
                className="h-9 rounded-lg border border-border bg-surface px-2 text-xs text-text"
              >
                <option value="paid_10min">paid 10min</option>
                <option value="unpaid_meal">unpaid meal</option>
              </select>

              <button
                type="button"
                onClick={() => void handleDeleteBreak(b.id)}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-danger"
                aria-label="Delete break"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
