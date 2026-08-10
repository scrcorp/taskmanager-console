"use client";

/**
 * 자주 쓰지 않는 액션 + 히스토리.
 *
 * 상세 본문에 다 늘어놓으면 정작 매일 쓰는 시각 확인이 스크롤 아래로 밀린다.
 * 되돌리기·기록 삭제처럼 무거운 것일수록 한 겹 뒤에 있는 편이 안전하기도 하다.
 *
 * 히스토리는 스케줄 audit 과 근태 correction 을 시간순으로 합친다 — 둘이 갈려 있으면
 * "스케줄을 옮겼더니 지각이 됐다" 같은 인과를 사람이 머리로 이어붙여야 한다.
 */

import { useMemo } from "react";
import {
  useCancelAction,
  useClearTimesAction,
  useMarkNoShowAction,
  useReopenAction,
} from "@/hooks/useAttendances";
import { useDeleteScheduleFlow, useScheduleAuditLog } from "@/hooks/useSchedules";
import { usePermissions } from "@/hooks/usePermissions";
import { useModal } from "@/components/ui/imperative-modal";
import { PERMISSIONS } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import type { Attendance, Schedule } from "@/types";

interface TimelineItem {
  id: string;
  source: "shift" | "att";
  at: string;
  title: string;
  detail: string | null;
  meta: string;
  tone: "neutral" | "shift" | "good" | "bad";
}

/** "clock_in" → "Clock in". 코드값을 그대로 노출하지 않는다. */
function humanize(value: string): string {
  const spaced = value.replace(/_/g, " ");
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function shortTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** correction 의 저장값이 ISO datetime 이면 시:분만 보여준다. 센티널/코드값은 그대로. */
function displayValue(value: string | null): string {
  if (!value) return "—";
  const m = value.match(/^\d{4}-\d{2}-\d{2}T(\d{2}:\d{2})/);
  return m ? m[1] : value;
}

export function CompactMoreActions({
  schedule,
  attendance,
  onDone,
  onClose,
}: {
  schedule: Schedule | null;
  attendance: Attendance | null;
  /** 레코드가 사라지거나 크게 바뀌어 상세를 닫아야 할 때. */
  onDone: () => void;
  onClose: () => void;
}) {
  const modal = useModal();
  const { hasPermission } = usePermissions();

  const reopen = useReopenAction();
  const clearTimes = useClearTimesAction();
  const markNoShow = useMarkNoShowAction();
  const cancelAttendance = useCancelAction();
  const deleteFlow = useDeleteScheduleFlow();

  const auditQ = useScheduleAuditLog(schedule?.id);

  const timeline = useMemo<TimelineItem[]>(() => {
    const items: TimelineItem[] = [];

    for (const e of auditQ.data ?? []) {
      items.push({
        id: `s-${e.id}`,
        source: "shift",
        at: e.timestamp,
        title: humanize(e.event_type),
        detail: e.description ?? null,
        meta: [shortTime(e.timestamp), e.actor_name, e.reason ? `“${e.reason}”` : null]
          .filter(Boolean)
          .join(" · "),
        tone: e.event_type === "cancelled" || e.event_type === "rejected" ? "bad" : "shift",
      });
    }

    // 한 사용자 액션이 여러 행으로 쪼개져 있으므로 group_id 로 묶어 카드 하나로 만든다.
    const groups = new Map<string, typeof attendance extends null ? never : NonNullable<Attendance["corrections"]>>();
    for (const c of attendance?.corrections ?? []) {
      const key = c.group_id ?? c.id;
      const list = groups.get(key);
      if (list) list.push(c);
      else groups.set(key, [c]);
    }
    for (const [key, rows] of groups) {
      const head = rows[0];
      const changes = rows
        .filter((r) => r.field_name !== "status")
        .map((r) => `${humanize(r.field_name)} ${displayValue(r.original_value)} → ${displayValue(r.corrected_value)}`);
      const statusRow = rows.find((r) => r.field_name === "status");
      items.push({
        id: `a-${key}`,
        source: "att",
        at: head.created_at,
        title: humanize(head.action ?? head.field_name),
        detail:
          changes.length > 0
            ? changes.join(" · ")
            : statusRow
              ? `${displayValue(statusRow.original_value)} → ${displayValue(statusRow.corrected_value)}`
              : null,
        meta: [shortTime(head.created_at), head.corrected_by_name, head.reason ? `“${head.reason}”` : null]
          .filter(Boolean)
          .join(" · "),
        tone: head.action === "clear_times" || head.action === "no_show" ? "bad" : "good",
      });
    }

    return items.sort((a, b) => (a.at < b.at ? 1 : -1));
  }, [auditQ.data, attendance]);

  const askReason = async (
    title: string,
    message: string,
    danger?: boolean,
  ): Promise<string | null> => {
    const reason = await modal.confirm({
      title,
      message,
      confirmLabel: title,
      variant: danger ? "danger" : undefined,
      requiresReason: true,
      reasonLabel: "Reason (optional)",
    });
    if (reason === undefined) return null;
    return typeof reason === "string" && reason ? reason : "(no reason)";
  };

  const canReopen =
    attendance
    && (attendance.status === "clocked_out"
      || attendance.status === "no_show"
      || attendance.status === "cancelled");
  const hasTimes = !!attendance && (!!attendance.clock_in || !!attendance.clock_out || attendance.breaks.length > 0);
  const canNoShow = !!attendance && !hasTimes && attendance.status !== "no_show";
  const canCancelAttendance = !!attendance && !attendance.clock_in && attendance.status !== "cancelled";

  return (
    <div className="space-y-3 px-1 pb-1">
      <div className="space-y-2">
        {canReopen && (
          <button
            type="button"
            onClick={async () => {
              const reason = await askReason("Reopen", "Undo the last transition on this record.");
              if (reason === null) return;
              reopen.mutate({ attendanceId: attendance.id, data: { reason } }, { onSuccess: onClose });
            }}
            className="h-11 w-full rounded-lg border border-border text-sm font-bold text-text-secondary"
          >
            Reopen
          </button>
        )}

        {hasTimes && attendance && (
          <button
            type="button"
            onClick={async () => {
              const reason = await askReason(
                "Clear time records",
                "Removes clock-in, clock-out and breaks so this record can be marked no-show. The removed values stay in History.",
                true,
              );
              if (reason === null) return;
              clearTimes.mutate({ attendanceId: attendance.id, data: { reason } }, { onSuccess: onClose });
            }}
            className="h-11 w-full rounded-lg border border-danger/40 text-sm font-bold text-danger"
          >
            Clear time records
          </button>
        )}

        {canNoShow && (
          <button
            type="button"
            onClick={async () => {
              const reason = await askReason("Mark no-show", "The employee did not arrive for this shift.");
              if (reason === null) return;
              markNoShow.mutate({ attendanceId: attendance.id, data: { reason } }, { onSuccess: onClose });
            }}
            className="h-11 w-full rounded-lg border border-border text-sm font-bold text-text-secondary"
          >
            Mark no-show
          </button>
        )}

        {canCancelAttendance && (
          <button
            type="button"
            onClick={async () => {
              const reason = await askReason("Cancel record", "The shift was cancelled before it started.", true);
              if (reason === null) return;
              cancelAttendance.mutate({ attendanceId: attendance.id, data: { reason } }, { onSuccess: onClose });
            }}
            className="h-11 w-full rounded-lg border border-border text-sm font-bold text-text-secondary"
          >
            Cancel record
          </button>
        )}

        {schedule && hasPermission(PERMISSIONS.SCHEDULES_DELETE) && (
          <button
            type="button"
            onClick={() => void deleteFlow(schedule.id, onDone)}
            className="h-11 w-full rounded-lg border border-danger/40 text-sm font-bold text-danger"
          >
            Delete shift
          </button>
        )}
      </div>

      <div className="rounded-xl border border-border bg-surface px-3 py-2.5">
        <div className="mb-1 text-[10px] font-extrabold uppercase tracking-wide text-text-muted">
          History {timeline.length > 0 && `(${timeline.length})`}
        </div>

        {auditQ.isLoading && <p className="py-3 text-sm text-text-secondary">Loading history…</p>}

        {!auditQ.isLoading && timeline.length === 0 && (
          <p className="py-3 text-sm text-text-secondary">
            Nothing has changed on this record yet.
          </p>
        )}

        {timeline.map((item) => (
          <div key={item.id} className="flex gap-2 border-t border-border py-2 first:border-t-0">
            <span
              className={cn(
                "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                item.tone === "shift" && "bg-accent",
                item.tone === "good" && "bg-success",
                item.tone === "bad" && "bg-danger",
                item.tone === "neutral" && "bg-text-muted",
              )}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5 text-[12.5px] font-bold text-text">
                <span
                  className={cn(
                    "rounded px-1 py-0.5 text-[8.5px] font-extrabold uppercase",
                    item.source === "shift"
                      ? "bg-accent-muted text-accent"
                      : "bg-success-muted text-success",
                  )}
                >
                  {item.source}
                </span>
                <span className="truncate">{item.title}</span>
              </div>
              {item.detail && (
                <div className="break-words text-[11.5px] text-text-secondary">{item.detail}</div>
              )}
              <div className="text-[10.5px] text-text-muted">{item.meta}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
