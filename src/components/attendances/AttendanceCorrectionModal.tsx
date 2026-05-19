"use client";

import React, { useMemo, useState } from "react";
import { ArrowRight } from "lucide-react";
import { Button, Input, Textarea } from "@/components/ui";
import { useCorrectAttendance } from "@/hooks";
import type { Attendance } from "@/types";
import { formatDateTime } from "@/lib/utils";
import { ReasonPicker } from "./ReasonPicker";

/**
 * Attendance time/note correction modal — Clock In / Clock Out / Note 시간 정정 전용.
 *
 * Status 변경은 AttendanceActionBar 의 액션 버튼에서 처리한다 (state machine).
 * 여기서는 이미 기록된 시각이나 노트의 오타/오기록 정정 같이 status 가 안 바뀌는
 * 단순 보정만 다룬다. Reason 필수 + Before → After diff.
 *
 * useModal().open() 으로 띄울 것 — close(true) 면 성공, close() 면 취소.
 */

function isoToLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number): string => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

function localInputToIso(s: string): string | null {
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

interface Draft {
  clock_in: string;
  clock_out: string;
  note: string;
}

interface AttendanceCorrectionModalProps {
  attendance: Attendance;
  tz?: string;
  /** 성공 시 true, 취소면 호출되지 않음. modal.open 의 close handler 를 그대로 넘김. */
  onClose: (success?: boolean) => void;
}

export function AttendanceCorrectionModal({
  attendance,
  tz,
  onClose,
}: AttendanceCorrectionModalProps): React.ReactElement {
  const original: Draft = useMemo(
    () => ({
      clock_in: isoToLocalInput(attendance.clock_in),
      clock_out: isoToLocalInput(attendance.clock_out),
      note: attendance.note ?? "",
    }),
    [attendance],
  );

  const [draft, setDraft] = useState<Draft>(original);
  const [reason, setReason] = useState<string>("");
  const correctAttendance = useCorrectAttendance();

  const changedFields = useMemo<
    Array<{ key: keyof Draft; label: string; before: string; after: string }>
  >(() => {
    const out: Array<{ key: keyof Draft; label: string; before: string; after: string }> = [];
    if (draft.clock_in !== original.clock_in) {
      out.push({
        key: "clock_in",
        label: "Clock In",
        before: attendance.clock_in ? formatDateTime(attendance.clock_in, tz) : "—",
        after: draft.clock_in
          ? formatDateTime(localInputToIso(draft.clock_in) ?? "", tz)
          : "—",
      });
    }
    if (draft.clock_out !== original.clock_out) {
      out.push({
        key: "clock_out",
        label: "Clock Out",
        before: attendance.clock_out ? formatDateTime(attendance.clock_out, tz) : "—",
        after: draft.clock_out
          ? formatDateTime(localInputToIso(draft.clock_out) ?? "", tz)
          : "—",
      });
    }
    if (draft.note !== original.note) {
      out.push({
        key: "note",
        label: "Note",
        before: original.note || "—",
        after: draft.note || "—",
      });
    }
    return out;
  }, [draft, original, attendance, tz]);

  const reasonValid: boolean = reason.trim().length > 0;
  const canSave: boolean = changedFields.length > 0 && reasonValid;

  const handleSave = async (): Promise<void> => {
    if (!canSave) return;
    const trimmedReason = reason.trim();
    try {
      for (const f of changedFields) {
        const value: string =
          f.key === "clock_in" || f.key === "clock_out"
            ? localInputToIso(draft[f.key]) ?? ""
            : (draft[f.key] as string);
        if (!value && (f.key === "clock_in" || f.key === "clock_out")) continue;
        await correctAttendance.mutateAsync({
          id: attendance.id,
          data: {
            field_name: f.key,
            corrected_value: value,
            reason: trimmedReason,
          },
        });
      }
      onClose(true);
    } catch {
      // hook 자동 모달
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="text-xs text-text-muted">
        {attendance.user_name} · {attendance.store_name} · {attendance.work_date}
        <span className="ml-2 text-text-muted">
          (Status changes use the action buttons on the page.)
        </span>
      </div>

      <ReasonPicker
        value={reason}
        onChange={setReason}
        hint="Required. Choose a preset or pick Other to describe."
      />

      <div className="grid grid-cols-2 gap-3">
        <Input
          label="Clock In"
          type="datetime-local"
          value={draft.clock_in}
          onChange={(e) => setDraft({ ...draft, clock_in: e.target.value })}
        />
        <Input
          label="Clock Out"
          type="datetime-local"
          value={draft.clock_out}
          onChange={(e) => setDraft({ ...draft, clock_out: e.target.value })}
        />
      </div>

      <Textarea
        label="Note"
        rows={2}
        value={draft.note}
        onChange={(e) => setDraft({ ...draft, note: e.target.value })}
        placeholder="Manager memo (optional)"
      />

      {changedFields.length > 0 && (
        <div className="rounded-lg border border-border bg-surface-hover p-3">
          <div className="text-xs text-text-muted mb-2">
            Changes ({changedFields.length})
          </div>
          <ul className="space-y-1.5">
            {changedFields.map((f) => (
              <li key={f.key} className="flex items-center gap-2 text-sm">
                <span className="text-text-secondary min-w-[80px]">{f.label}</span>
                <span className="text-text-muted line-through">{f.before}</span>
                <ArrowRight size={12} className="text-text-muted" />
                <span className="text-text font-medium">{f.after}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2 border-t border-border">
        <Button variant="secondary" onClick={() => onClose()}>
          Cancel
        </Button>
        <Button
          onClick={handleSave}
          disabled={!canSave}
          isLoading={correctAttendance.isPending}
        >
          Save correction
        </Button>
      </div>
    </div>
  );
}
