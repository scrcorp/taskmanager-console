"use client";

/**
 * 통합 상세 — 한 사람의 그날 근무를 계획(Shift)과 실제(Attendance) 한 시트에서 본다.
 *
 * 화면의 중심은 times 그리드 하나다. Scheduled / Actual 을 Start·End 두 열에 겹쳐 놓고
 * 그 자리에서 차이(15m early / late 31m / no clock-out)를 보여준다. 카드 두 장으로
 * 나누면 같은 걸 보려고 위아래로 눈을 옮겨야 한다.
 *
 * 기본은 읽기 전용. Edit 을 눌러야 같은 그리드가 입력 칸으로 바뀐다 — 값 자체를 탭하면
 * 편집으로 들어가는 방식은 목록에서 넘어와 훑어보는 중에 오조작이 난다.
 *
 * 저장은 바뀐 쪽만 나간다. Sched 만 고치면 스케줄 API, Actual 만 고치면 근태 API,
 * 둘 다면 둘 다 — 순서는 shift 먼저다 (근태 status 가 스케줄 시각 기준으로 재판정되므로).
 */

import { useMemo, useState } from "react";
import { AlertTriangle, Lock, Pencil } from "lucide-react";
import {
  useAttendance,
  useClockInAction,
  useClockOutAction,
  useConfirmAutoClockout,
  useConfirmEarlyClockIn,
  useCorrectAttendance,
  useEndBreakAction,
  useStartBreakAction,
  useUpdateBreakSession,
} from "@/hooks/useAttendances";
import { useSchedule, useUpdateSchedule } from "@/hooks/useSchedules";
import { usePermissions } from "@/hooks/usePermissions";
import { useStoreTimezone } from "@/hooks/useTimezone";
import { useModal } from "@/components/ui/imperative-modal";
import { PERMISSIONS } from "@/lib/permissions";
import { isoToLocalInputInTz, localInputToIsoInTz, cn } from "@/lib/utils";
import { rollEndDate, shiftIsoFields } from "@/lib/scheduleTime";
import { wallClock, type DayRow } from "@/lib/compactDay";
import {
  OVERLAP_EXPLANATION,
  OVERLAP_TITLE,
  hasOverlappingClockIn,
} from "@/lib/attendanceAnomalies";
import { CompactReviewSave, type ChangeLine } from "./CompactReviewSave";
import { CompactStaffPicker } from "./CompactStaffPicker";
import { CompactTimePickerSheet, type TimePickerResult } from "./CompactTimePickerSheet";
import { CompactMoreActions } from "./CompactMoreActions";
import type { Schedule, User } from "@/types";

interface Stamp {
  date: string;
  time: string;
}

function splitInput(input: string): Stamp | null {
  if (!input || input.length < 16) return null;
  return { date: input.slice(0, 10), time: input.slice(11, 16) };
}

function joinInput(stamp: Stamp): string {
  return `${stamp.date}T${stamp.time}`;
}

function sameStamp(a: Stamp | null, b: Stamp | null): boolean {
  if (a === null || b === null) return a === b;
  return a.date === b.date && a.time === b.time;
}

/** 예정 대비 실제의 차이를 사람이 읽는 한 마디로. 5분 이내는 잡음이라 표시하지 않는다. */
function deltaLabel(planned: string | null, actual: string | null, kind: "in" | "out"): {
  text: string;
  tone: "early" | "late" | "ok";
} | null {
  if (!planned || !actual) return null;
  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const diff = toMin(actual) - toMin(planned);
  if (Math.abs(diff) < 5) return null;
  const mins = Math.abs(diff);
  const span = mins >= 60 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`;
  if (kind === "in") {
    return diff < 0
      ? { text: `${span} early`, tone: "early" }
      : { text: `${span} late`, tone: "late" };
  }
  return diff > 0
    ? { text: `${span} over`, tone: "late" }
    : { text: `${span} short`, tone: "early" };
}

const CELL = "flex h-11 w-full items-center justify-center gap-1 rounded-lg border text-lg font-extrabold tabular-nums";

export function CompactEntryDetail({
  row,
  storeId,
  daySchedules,
  onDone,
}: {
  row: DayRow;
  storeId: string;
  daySchedules: Schedule[];
  onDone: () => void;
}) {
  // 선택한 매장의 시간대로 읽고 쓴다 — 조직 시간대로 인코딩하면 시간대가 다른 매장에서
  // 방금 넣은 시각이 몇 시간 밀린 값으로 저장된다.
  const tz = useStoreTimezone(storeId);
  const modal = useModal();
  const { hasPermission } = usePermissions();

  // 액션(휴식 시작 등)이나 저장 뒤에도 시트가 열린 채 최신 값을 그려야 한다.
  // 목록에서 받은 row 는 저장 순간 낡은 값이 되므로 둘 다 단건으로 다시 읽는다.
  const { data: fresh } = useAttendance(row.attendance?.id);
  const { data: freshSchedule } = useSchedule(row.schedule?.id);
  const attendance = fresh ?? row.attendance ?? null;
  const schedule = freshSchedule ?? row.schedule;

  const updateSchedule = useUpdateSchedule();
  const correct = useCorrectAttendance();
  const updateBreak = useUpdateBreakSession();
  const clockIn = useClockInAction();
  const clockOut = useClockOutAction();
  const startBreak = useStartBreakAction();
  const endBreak = useEndBreakAction();
  const confirmEarly = useConfirmEarlyClockIn();
  const confirmAuto = useConfirmAutoClockout();

  // ── 원본 값 ────────────────────────────────────────────────────────
  const origSchedStart = schedule ? wallClock(schedule.start_at) ?? schedule.start_time ?? "" : "";
  const origSchedEnd = schedule ? wallClock(schedule.end_at) ?? schedule.end_time ?? "" : "";
  const origIn = splitInput(isoToLocalInputInTz(attendance?.clock_in, tz));
  const origOut = splitInput(isoToLocalInputInTz(attendance?.clock_out, tz));
  const origUserId = schedule?.user_id ?? attendance?.user_id ?? "";
  const origRoleId = schedule?.work_role_id ?? "";
  const origNote = schedule?.note ?? "";

  // ── 편집 초안 ──────────────────────────────────────────────────────
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [schedStart, setSchedStart] = useState(origSchedStart);
  const [schedEnd, setSchedEnd] = useState(origSchedEnd);
  const [actualIn, setActualIn] = useState<Stamp | null>(origIn);
  const [actualOut, setActualOut] = useState<Stamp | null>(origOut);
  const [userId, setUserId] = useState(origUserId);
  const [userName, setUserName] = useState(row.userName);
  const [note, setNote] = useState(origNote);
  const [breakDraft, setBreakDraft] = useState<Record<string, { started?: Stamp; ended?: Stamp }>>({});
  const [saving, setSaving] = useState(false);

  const clockedIn = !!attendance?.clock_in;
  const canEditShift = hasPermission(PERMISSIONS.SCHEDULES_UPDATE);
  /** 출근 기록이 있으면 담당자 교체를 막는다 — 서버가 근태 담당자까지 함께 옮겨서
   *  A 가 찍은 시각이 B 의 기록으로 둔갑한다. 시프트를 취소하고 새로 만드는 게 맞다. */
  const staffLocked = clockedIn;

  /** 근태 시각의 날짜 열 후보 — 영업일 전날/당일/다음날. 자정 넘긴 퇴근을 한 번에 고른다. */
  const dateChoices = useMemo(() => {
    const base = schedule?.operating_day ?? schedule?.work_date ?? attendance?.work_date ?? "";
    if (!base) return undefined;
    const [y, m, d] = base.split("-").map(Number);
    return [-1, 0, 1].map((n) =>
      new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10),
    );
  }, [schedule, attendance]);

  const anchorDate = dateChoices?.[1] ?? "";

  // ── 변경 요약 ──────────────────────────────────────────────────────
  const breakChanges = useMemo(
    () =>
      Object.entries(breakDraft).flatMap(([id, draft]) => {
        const original = (attendance?.breaks ?? []).find((b) => b.id === id);
        if (!original) return [];
        const lines: { id: string; field: "started_at" | "ended_at"; before: string; after: Stamp }[] = [];
        const origStart = splitInput(isoToLocalInputInTz(original.started_at, tz));
        const origEnd = splitInput(isoToLocalInputInTz(original.ended_at, tz));
        if (draft.started && !sameStamp(draft.started, origStart)) {
          lines.push({ id, field: "started_at", before: origStart?.time ?? "—", after: draft.started });
        }
        if (draft.ended && !sameStamp(draft.ended, origEnd)) {
          lines.push({ id, field: "ended_at", before: origEnd?.time ?? "—", after: draft.ended });
        }
        return lines;
      }),
    [breakDraft, attendance, tz],
  );

  const shiftChanges: ChangeLine[] = useMemo(() => {
    if (!schedule) return [];
    const lines: ChangeLine[] = [];
    if (schedStart !== origSchedStart) {
      lines.push({ label: "Start", before: origSchedStart || "—", after: schedStart });
    }
    if (schedEnd !== origSchedEnd) {
      lines.push({ label: "End", before: origSchedEnd || "—", after: schedEnd });
    }
    if (userId !== origUserId) {
      lines.push({ label: "Staff", before: row.userName, after: userName });
    }
    if (note !== origNote) {
      lines.push({ label: "Note", before: origNote || "(empty)", after: note || "(empty)" });
    }
    return lines;
  }, [schedule, schedStart, schedEnd, userId, userName, note, origSchedStart, origSchedEnd, origUserId, origNote, row.userName]);

  const attendanceChanges: ChangeLine[] = useMemo(() => {
    const lines: ChangeLine[] = [];
    if (!sameStamp(actualIn, origIn)) {
      lines.push({ label: "Clock in", before: origIn?.time ?? "—", after: actualIn?.time ?? "—" });
    }
    if (!sameStamp(actualOut, origOut)) {
      lines.push({ label: "Clock out", before: origOut?.time ?? "—", after: actualOut?.time ?? "—" });
    }
    for (const b of breakChanges) {
      lines.push({
        label: b.field === "started_at" ? "Break start" : "Break end",
        before: b.before,
        after: b.after.time,
      });
    }
    return lines;
  }, [actualIn, actualOut, origIn, origOut, breakChanges]);

  const dirty = shiftChanges.length + attendanceChanges.length > 0;

  // ── 시간 피커 ──────────────────────────────────────────────────────
  const pickTime = async (
    title: string,
    step: 1 | 5,
    initial: Stamp,
    opts?: { dates?: string[]; allowClear?: boolean },
  ): Promise<TimePickerResult | undefined> =>
    modal.open<TimePickerResult>(
      ({ close }) => (
        <CompactTimePickerSheet
          initial={initial}
          step={step}
          dates={opts?.dates}
          allowClear={opts?.allowClear}
          onDone={close}
        />
      ),
      { title, size: "sm", closeOnBackdrop: false },
    );

  const pickSchedTime = async (which: "start" | "end") => {
    const current = which === "start" ? schedStart : schedEnd;
    const result = await pickTime(
      which === "start" ? "Shift start" : "Shift end",
      5,
      { date: anchorDate, time: current || "09:00" },
    );
    if (!result || result.cleared) return;
    if (which === "start") setSchedStart(result.value.time);
    else setSchedEnd(result.value.time);
  };

  const pickActual = async (which: "in" | "out") => {
    const current = which === "in" ? actualIn : actualOut;
    const fallback: Stamp = {
      date: anchorDate,
      time: which === "in" ? origSchedStart || "09:00" : origSchedEnd || "17:00",
    };
    const result = await pickTime(
      which === "in" ? "Clock in" : "Clock out",
      1,
      current ?? fallback,
      { dates: dateChoices, allowClear: !!current },
    );
    if (!result) return;
    if (result.cleared) {
      // 값을 비우는 건 correct 로 못 한다 (서버가 null 을 못 받는다) — Clear time records 로 안내.
      void modal.alert({
        type: "error",
        message:
          "Times can't be emptied here. Use “Clear time records” in More actions to remove them.",
      });
      return;
    }
    if (which === "in") setActualIn(result.value);
    else setActualOut(result.value);
  };

  const pickBreak = async (breakId: string, which: "started" | "ended", initial: Stamp) => {
    const result = await pickTime(
      which === "started" ? "Break start" : "Break end",
      1,
      initial,
      { dates: dateChoices },
    );
    if (!result || result.cleared) return;
    setBreakDraft((d) => ({ ...d, [breakId]: { ...d[breakId], [which]: result.value } }));
  };

  const pickStaff = async () => {
    const picked = await modal.open<User>(
      ({ close }) => (
        <CompactStaffPicker
          storeId={storeId}
          currentUserId={userId}
          daySchedules={daySchedules}
          onPick={close}
        />
      ),
      { title: "Select staff", size: "md" },
    );
    if (!picked) return;
    setUserId(picked.id);
    setUserName(picked.full_name);
  };

  // ── 저장 ──────────────────────────────────────────────────────────
  const handleSave = async () => {
    const result = await modal.open<{ shiftReason: string; attendanceReason: string }>(
      ({ close }) => (
        <CompactReviewSave
          shiftChanges={shiftChanges}
          attendanceChanges={attendanceChanges}
          saving={false}
          onCancel={() => close(undefined)}
          onConfirm={close}
        />
      ),
      { title: "Review changes", size: "md", closeOnBackdrop: false },
    );
    if (!result) return;

    setSaving(true);
    let shiftSaved = false;
    try {
      // 1) shift 먼저 — 근태 status 가 스케줄 시각 기준으로 재판정되므로 순서가 뒤집히면
      //    방금 고친 근태가 옛 스케줄 기준으로 판정된다.
      if (schedule && shiftChanges.length > 0) {
        const operatingDay = schedule.operating_day ?? schedule.work_date;
        const startDate = schedule.start_at?.slice(0, 10) ?? operatingDay;
        const endDate = rollEndDate(startDate, schedStart, schedEnd);
        await updateSchedule.mutateAsync({
          id: schedule.id,
          data: {
            user_id: userId,
            work_role_id: origRoleId || null,
            work_date: operatingDay,
            start_time: schedStart,
            end_time: schedEnd,
            ...shiftIsoFields(operatingDay, startDate, schedStart, endDate, schedEnd, null, null),
            note: note || null,
            change_reason: result.shiftReason,
          },
        });
        shiftSaved = true;
      }

      // 2) attendance — 필드별 순차. clock_in 먼저여야 시간 무결성 검증을 통과한다.
      if (attendance && attendanceChanges.length > 0) {
        const reason = result.attendanceReason;
        if (!sameStamp(actualIn, origIn) && actualIn) {
          const iso = localInputToIsoInTz(joinInput(actualIn), tz);
          if (iso) {
            await correct.mutateAsync({
              id: attendance.id,
              data: { field_name: "clock_in", corrected_value: iso, reason },
            });
          }
        }
        if (!sameStamp(actualOut, origOut) && actualOut) {
          const iso = localInputToIsoInTz(joinInput(actualOut), tz);
          if (iso) {
            await correct.mutateAsync({
              id: attendance.id,
              data: { field_name: "clock_out", corrected_value: iso, reason },
            });
          }
        }
        for (const change of breakChanges) {
          const iso = localInputToIsoInTz(joinInput(change.after), tz);
          if (!iso) continue;
          await updateBreak.mutateAsync({
            attendanceId: attendance.id,
            breakId: change.id,
            data: { [change.field]: iso, reason } as never,
          });
        }
      }

      // 저장했다고 시트를 닫지 않는다 — 방금 고친 값이 맞게 들어갔는지 바로 확인하고,
      // 이어서 다른 것도 고치는 게 보통이다. 목록으로 튕기면 그 사람을 다시 찾아 들어와야 한다.
      // 스케줄·근태 모두 단건 쿼리라 무효화된 값이 곧 새로 그려진다.
      setBreakDraft({});
      setMode("view");
    } catch {
      // 결과 모달은 hook 이 띄운다. 다만 반쪽만 저장된 경우는 별도로 알린다 —
      // 조용히 지나가면 사용자가 스케줄이 이미 바뀐 걸 모른 채 다시 저장한다.
      if (shiftSaved && attendanceChanges.length > 0) {
        void modal.alert({
          type: "error",
          message:
            "The shift was saved, but the attendance times were not. Reopen this record and try the attendance change again.",
        });
      }
    } finally {
      setSaving(false);
    }
  };

  const resetDraft = () => {
    setSchedStart(origSchedStart);
    setSchedEnd(origSchedEnd);
    setActualIn(origIn);
    setActualOut(origOut);
    setUserId(origUserId);
    setUserName(row.userName);
    setNote(origNote);
    setBreakDraft({});
    setMode("view");
  };

  // ── 액션 (view 모드) ───────────────────────────────────────────────
  const askReason = async (title: string, message: string): Promise<string | null> => {
    const reason = await modal.confirm({
      title,
      message,
      confirmLabel: title,
      requiresReason: true,
      reasonLabel: "Reason (optional)",
    });
    if (reason === undefined) return null;
    return typeof reason === "string" && reason ? reason : "(no reason)";
  };

  const nowIso = (): string => new Date().toISOString();

  const doClockIn = async () => {
    if (!attendance) return;
    const reason = await askReason("Clock in", "Records a clock-in at the current time.");
    if (reason === null) return;
    clockIn.mutate({ attendanceId: attendance.id, data: { at: nowIso(), reason } });
  };
  const doClockOut = async () => {
    if (!attendance) return;
    const reason = await askReason("Clock out", "Records a clock-out at the current time.");
    if (reason === null) return;
    clockOut.mutate({ attendanceId: attendance.id, data: { at: nowIso(), reason } });
  };
  const doStartBreak = async () => {
    if (!attendance) return;
    const reason = await askReason("Start break", "Starts an unpaid meal break now.");
    if (reason === null) return;
    startBreak.mutate({
      attendanceId: attendance.id,
      data: { at: nowIso(), break_type: "unpaid_meal", reason },
    });
  };
  const doEndBreak = async () => {
    if (!attendance) return;
    const reason = await askReason("End break", "Ends the break that is in progress.");
    if (reason === null) return;
    endBreak.mutate({ attendanceId: attendance.id, data: { at: nowIso(), reason } });
  };

  const openMore = async () => {
    await modal.open(
      ({ close }) => (
        <CompactMoreActions
          schedule={schedule}
          attendance={attendance}
          tz={tz}
          onDone={() => {
            close(undefined);
            onDone();
          }}
          onClose={() => close(undefined)}
        />
      ),
      { title: "More actions", size: "md" },
    );
  };

  // ── 렌더 ──────────────────────────────────────────────────────────
  const inDelta = deltaLabel(origSchedStart, origIn?.time ?? null, "in");
  const outDelta = deltaLabel(origSchedEnd, origOut?.time ?? null, "out");
  const status = attendance?.status ?? schedule?.status ?? "upcoming";
  const editing = mode === "edit";

  const needsEarly =
    (attendance?.anomalies ?? []).includes("early_clock_in_override")
    && !attendance?.early_clock_in_confirmed_at;
  const needsAuto =
    (attendance?.anomalies ?? []).includes("auto_clocked_out")
    && !attendance?.auto_clock_out_confirmed_at;
  // 겹침은 확인 버튼이 없다 — 한쪽을 실제로 지워야 풀린다. 그래서 안내만 띄우고
  // More actions(Clear times / Cancel) 로 보낸다.
  const overlapping = hasOverlappingClockIn(attendance?.anomalies);

  return (
    <div className="space-y-3 px-1 pb-1">
      {/* 머리 — 역할/날짜 + Edit 토글 */}
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs text-text-secondary">
            {[row.roleName, schedule?.operating_day ?? attendance?.work_date]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-surface-hover px-2 py-0.5 text-[10px] font-extrabold uppercase text-text-secondary">
          {status.replace(/_/g, " ")}
        </span>
        {canEditShift && !editing && (
          <button
            type="button"
            onClick={() => setMode("edit")}
            className="flex h-8 shrink-0 items-center gap-1 rounded-full border border-border px-3 text-xs font-bold text-text"
          >
            <Pencil size={12} /> Edit
          </button>
        )}
      </div>

      {/* 겹침 경보 — 확인 도장이 없는 유일한 근태 경고. 제일 위에 둔다. */}
      {overlapping && (
        <div className="rounded-xl border border-danger bg-danger-muted px-3 py-2.5">
          <p className="text-xs text-text">
            <b>{OVERLAP_TITLE}.</b> {OVERLAP_EXPLANATION}
          </p>
          <p className="mt-1.5 text-xs text-text-secondary">
            Use More actions on the record that should not be there — clear its
            times, then cancel it.
          </p>
        </div>
      )}

      {/* 확인 필요 배너 */}
      {needsEarly && (
        <div className="rounded-xl border border-warning bg-warning-muted px-3 py-2.5">
          <p className="text-xs text-text">
            <b>Early clock-in not confirmed.</b> They clocked in before the shift and gave a
            reason. The extra time counts toward payroll — check it, then confirm.
          </p>
          <button
            type="button"
            // 확인만 하고 시트는 열어둔다 — 배너가 사라지는 걸 그 자리에서 보는 게 맞다.
            onClick={() => attendance && confirmEarly.mutate({ attendanceId: attendance.id })}
            className="mt-2 h-10 w-full rounded-lg bg-warning text-sm font-bold text-black"
          >
            Confirm early clock-in
          </button>
        </div>
      )}
      {needsAuto && (
        <div className="rounded-xl border border-warning bg-warning-muted px-3 py-2.5">
          <p className="text-xs text-text">
            <b>Clocked out automatically.</b> Check the time, then confirm it.
          </p>
          <button
            type="button"
            onClick={() => attendance && confirmAuto.mutate({ attendanceId: attendance.id })}
            className="mt-2 h-10 w-full rounded-lg bg-warning text-sm font-bold text-black"
          >
            Confirm auto clock-out
          </button>
        </div>
      )}

      {!needsEarly && !needsAuto && row.issues.length > 0 && (
        <div className="flex items-start gap-2 rounded-xl border border-danger/40 bg-danger-muted px-3 py-2.5">
          <AlertTriangle size={14} className="mt-0.5 shrink-0 text-danger" />
          <p className="text-xs text-text">{row.issues.join(" · ")}</p>
        </div>
      )}

      {/* times 그리드 — 이 화면의 중심 */}
      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        <div className="grid grid-cols-[56px_1fr_1fr] items-center gap-x-1">
          <div />
          <div className="py-2 text-center text-[10px] font-extrabold uppercase tracking-wide text-text-muted">
            Start
          </div>
          <div className="py-2 text-center text-[10px] font-extrabold uppercase tracking-wide text-text-muted">
            End
          </div>

          <div className="pl-3 text-[10px] font-extrabold uppercase tracking-wide text-text-muted">
            Sched
          </div>
          <div className="px-1.5 py-1 text-center">
            {editing && schedule ? (
              <button
                type="button"
                onClick={() => pickSchedTime("start")}
                className={cn(
                  CELL,
                  "text-base font-bold",
                  schedStart !== origSchedStart
                    ? "border-accent bg-accent-muted text-accent"
                    : "border-border text-text-secondary",
                )}
              >
                {schedStart || "—"}
              </button>
            ) : (
              <span className="text-base font-semibold tabular-nums text-text-secondary">
                {origSchedStart || "—"}
              </span>
            )}
          </div>
          <div className="px-1.5 py-1 text-center">
            {editing && schedule ? (
              <button
                type="button"
                onClick={() => pickSchedTime("end")}
                className={cn(
                  CELL,
                  "text-base font-bold",
                  schedEnd !== origSchedEnd
                    ? "border-accent bg-accent-muted text-accent"
                    : "border-border text-text-secondary",
                )}
              >
                {schedEnd || "—"}
              </button>
            ) : (
              <span className="text-base font-semibold tabular-nums text-text-secondary">
                {origSchedEnd || "—"}
              </span>
            )}
          </div>

          <div className="border-t border-border py-2 pl-3 text-[10px] font-extrabold uppercase tracking-wide text-text">
            Actual
          </div>
          <div className="border-t border-border px-1.5 py-1.5 text-center">
            {editing ? (
              <button
                type="button"
                onClick={() => pickActual("in")}
                disabled={!attendance}
                className={cn(
                  CELL,
                  !sameStamp(actualIn, origIn)
                    ? "border-accent bg-accent-muted text-accent"
                    : actualIn
                      ? "border-border-strong text-text"
                      : "border-dashed border-border text-sm font-bold text-text-muted",
                  !attendance && "opacity-50",
                )}
              >
                {attendance ? (actualIn?.time ?? "＋ Set") : "no record"}
              </button>
            ) : (
              <>
                <div
                  className={cn(
                    "text-lg font-extrabold tabular-nums",
                    origIn ? "text-text" : "text-sm font-semibold text-text-muted",
                  )}
                >
                  {origIn?.time ?? (status === "no_show" ? "not recorded" : "—")}
                </div>
                {inDelta && (
                  <span
                    className={cn(
                      "mt-0.5 inline-block rounded-full px-1.5 text-[10px] font-extrabold",
                      inDelta.tone === "late"
                        ? "bg-danger-muted text-danger"
                        : "bg-warning-muted text-warning",
                    )}
                  >
                    {inDelta.text}
                  </span>
                )}
              </>
            )}
          </div>
          <div className="border-t border-border px-1.5 py-1.5 text-center">
            {editing ? (
              <button
                type="button"
                onClick={() => pickActual("out")}
                disabled={!clockedIn}
                className={cn(
                  CELL,
                  !sameStamp(actualOut, origOut)
                    ? "border-accent bg-accent-muted text-accent"
                    : actualOut
                      ? "border-border-strong text-text"
                      : "border-dashed border-border text-sm font-bold text-text-muted",
                  !clockedIn && "opacity-50",
                )}
              >
                {actualOut?.time ?? (clockedIn ? "＋ Set" : "locked")}
              </button>
            ) : (
              <>
                <div
                  className={cn(
                    "text-lg font-extrabold tabular-nums",
                    origOut
                      ? "text-text"
                      : "text-sm font-semibold " +
                        (status === "working" || status === "on_break"
                          ? "text-success"
                          : "text-text-muted"),
                  )}
                >
                  {origOut?.time
                    ?? (status === "working" || status === "on_break"
                      ? "— working"
                      : clockedIn
                        ? "not clocked out"
                        : "—")}
                </div>
                {outDelta && (
                  <span
                    className={cn(
                      "mt-0.5 inline-block rounded-full px-1.5 text-[10px] font-extrabold",
                      outDelta.tone === "late"
                        ? "bg-success-muted text-success"
                        : "bg-warning-muted text-warning",
                    )}
                  >
                    {outDelta.text}
                  </span>
                )}
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 border-t border-border bg-surface-hover px-3 py-2 text-[11px] text-text-secondary">
          {editing ? (
            <span>
              {attendance
                ? "Sched moves in 5-min steps · Actual in 1-min steps"
                : "No attendance record yet — only the shift can be edited."}
            </span>
          ) : (
            <>
              <span>
                Worked <b className="tabular-nums text-text">{fmtMinutes(attendance?.total_work_minutes)}</b>
              </span>
              <span className="h-0.5 w-0.5 rounded-full bg-text-muted" />
              <span>
                Break <b className="tabular-nums text-text">{fmtMinutes(attendance?.total_break_minutes)}</b>
              </span>
              <span className="h-0.5 w-0.5 rounded-full bg-text-muted" />
              <span>
                Net <b className="tabular-nums text-text">{fmtMinutes(attendance?.net_work_minutes)}</b>
              </span>
            </>
          )}
        </div>
      </div>

      {/* Staff / Note */}
      {editing && schedule && (
        <>
          <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2">
            <span className="w-12 shrink-0 text-[10px] font-extrabold uppercase tracking-wide text-text-muted">
              Staff
            </span>
            <button
              type="button"
              onClick={staffLocked ? undefined : pickStaff}
              disabled={staffLocked}
              className={cn(
                "flex h-10 flex-1 items-center gap-2 rounded-lg border px-3 text-sm font-bold",
                staffLocked
                  ? "border-border bg-surface-hover text-text-muted"
                  : userId !== origUserId
                    ? "border-accent bg-accent-muted text-accent"
                    : "border-border text-text",
              )}
            >
              <span className="truncate">{userName}</span>
              {staffLocked && <Lock size={13} className="ml-auto shrink-0" />}
            </button>
          </div>
          {staffLocked && (
            <p className="px-1 text-[11px] text-text-muted">
              Already clocked in — the time records belong to this person. To move the shift to
              someone else, cancel it and create a new one.
            </p>
          )}

          <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2">
            <span className="w-12 shrink-0 text-[10px] font-extrabold uppercase tracking-wide text-text-muted">
              Note
            </span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional"
              aria-label="Shift note"
              className="h-10 flex-1 rounded-lg border border-border bg-surface px-3 text-sm text-text focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>
        </>
      )}

      {!editing && (schedule?.note || row.roleName) && (
        <div className="flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-[13px]">
          <span className="w-12 shrink-0 text-[10px] font-extrabold uppercase tracking-wide text-text-muted">
            Note
          </span>
          <span className={schedule?.note ? "text-text" : "text-text-muted"}>
            {schedule?.note || "—"}
          </span>
        </div>
      )}

      {/* Breaks */}
      {attendance && (
        <div className="rounded-xl border border-border bg-surface px-3 py-2.5">
          <div className="mb-1.5 text-[10px] font-extrabold uppercase tracking-wide text-text-muted">
            Breaks
          </div>
          {attendance.breaks.length === 0 && (
            <p className="py-1 text-sm text-text-secondary">No breaks recorded.</p>
          )}
          {attendance.breaks.map((b) => {
            const draft = breakDraft[b.id] ?? {};
            const origStart = splitInput(isoToLocalInputInTz(b.started_at, tz));
            const origEnd = splitInput(isoToLocalInputInTz(b.ended_at, tz));
            const start = draft.started ?? origStart;
            const end = draft.ended ?? origEnd;
            return (
              <div key={b.id} className="border-t border-border py-2 first:border-t-0">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "rounded-full px-1.5 py-0.5 text-[10px] font-extrabold uppercase",
                      b.break_type === "paid_10min"
                        ? "bg-success-muted text-success"
                        : "bg-surface-hover text-text-secondary",
                    )}
                  >
                    {b.break_type.replace(/_/g, " ")}
                  </span>
                  {b.duration_minutes !== null && (
                    <span className="ml-auto text-[11px] font-bold text-text-secondary">
                      {b.duration_minutes}m
                    </span>
                  )}
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  {editing ? (
                    <>
                      <button
                        type="button"
                        onClick={() => start && pickBreak(b.id, "started", start)}
                        className={cn(
                          "h-9 flex-1 rounded-lg border text-sm font-bold tabular-nums",
                          draft.started
                            ? "border-accent bg-accent-muted text-accent"
                            : "border-border-strong text-text",
                        )}
                      >
                        {start?.time ?? "—"}
                      </button>
                      <span className="text-text-muted">–</span>
                      <button
                        type="button"
                        onClick={() => end && pickBreak(b.id, "ended", end)}
                        disabled={!end}
                        className={cn(
                          "h-9 flex-1 rounded-lg border text-sm font-bold tabular-nums",
                          draft.ended
                            ? "border-accent bg-accent-muted text-accent"
                            : "border-border-strong text-text",
                          !end && "opacity-50",
                        )}
                      >
                        {end?.time ?? "in progress"}
                      </button>
                    </>
                  ) : (
                    <span className="text-sm tabular-nums text-text">
                      {origStart?.time ?? "—"} – {origEnd?.time ?? "in progress"}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* 액션 */}
      {editing ? (
        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={resetDraft}
            disabled={saving}
            className="h-12 flex-[0.6] rounded-lg border border-border text-sm font-bold text-text-secondary disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!dirty || saving}
            className="h-12 flex-[1.4] rounded-lg bg-accent text-sm font-bold text-white active:bg-accent-light disabled:opacity-50"
          >
            {saving
              ? "Saving…"
              : dirty
                ? `Review & save (${shiftChanges.length + attendanceChanges.length})`
                : "No changes"}
          </button>
        </div>
      ) : (
        <>
          {attendance && (
            <div className="flex gap-2">
              {!clockedIn && attendance.status !== "cancelled" && (
                <button
                  type="button"
                  onClick={doClockIn}
                  className="h-12 flex-1 rounded-lg bg-accent text-sm font-bold text-white active:bg-accent-light"
                >
                  ＋ Add clock-in
                </button>
              )}
              {attendance.status === "working" && (
                <>
                  <button
                    type="button"
                    onClick={doStartBreak}
                    className="h-12 flex-1 rounded-lg bg-warning text-sm font-bold text-black"
                  >
                    Start break
                  </button>
                  <button
                    type="button"
                    onClick={doClockOut}
                    className="h-12 flex-1 rounded-lg bg-success text-sm font-bold text-white"
                  >
                    Clock out
                  </button>
                </>
              )}
              {attendance.status === "on_break" && (
                <button
                  type="button"
                  onClick={doEndBreak}
                  className="h-12 flex-1 rounded-lg bg-accent text-sm font-bold text-white"
                >
                  End break
                </button>
              )}
            </div>
          )}
          <button
            type="button"
            onClick={openMore}
            className="h-11 w-full rounded-lg border border-dashed border-border text-xs font-bold text-text-secondary"
          >
            More actions · History
          </button>
        </>
      )}
    </div>
  );
}

/** 분 → "4h 20m". 값이 없으면 대시 (0 과 구분한다). */
function fmtMinutes(minutes: number | null | undefined): string {
  if (minutes === null || minutes === undefined) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
