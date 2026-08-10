"use client";

/**
 * 저장 직전 확인 시트 — 무엇이 바뀌는지 보여주고 사유를 받는다.
 *
 * 사유 입력칸을 편집 화면 하단 바에 두면 폰에서 두 칸(스케줄/근태)이 화면을 다 먹는다.
 * 그래서 한 겹 뒤로 뺐고, 그 김에 "정말 이게 바뀌는 게 맞나" 를 되짚는 자리가 됐다.
 *
 * 사유는 양쪽 다 필수다 — History 를 나중에 읽는 사람에게 "왜" 가 없으면 기록이 반쪽이다.
 */

import { useState } from "react";
import {
  CORRECTION_REASON_PRESETS,
  OTHER_REASON_LABEL,
  SHIFT_REASON_PRESETS,
} from "@/lib/compactReasons";

/** 한 줄짜리 변경 요약. */
export interface ChangeLine {
  label: string;
  before: string;
  after: string;
}

export interface ReviewResult {
  shiftReason: string;
  attendanceReason: string;
}

const FIELD =
  "h-11 w-full rounded-lg border border-border bg-surface px-3 text-sm text-text focus:outline-none focus:ring-2 focus:ring-accent";

function ReasonPicker({
  presets,
  value,
  onChange,
  idPrefix,
}: {
  presets: readonly string[];
  value: string;
  onChange: (v: string) => void;
  idPrefix: string;
}) {
  // preset 목록에 없는 값이면 자유 입력 중이라는 뜻.
  const isOther = value !== "" && !presets.includes(value);
  const [otherOpen, setOtherOpen] = useState(isOther);

  return (
    <div>
      <label className="mb-1 block text-xs font-bold text-text-secondary" htmlFor={`${idPrefix}-reason`}>
        Reason <span className="text-danger">*</span>
      </label>
      <select
        id={`${idPrefix}-reason`}
        className={FIELD}
        value={otherOpen ? OTHER_REASON_LABEL : value}
        onChange={(e) => {
          if (e.target.value === OTHER_REASON_LABEL) {
            setOtherOpen(true);
            onChange("");
          } else {
            setOtherOpen(false);
            onChange(e.target.value);
          }
        }}
      >
        <option value="">Select a reason</option>
        {presets.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
        <option value={OTHER_REASON_LABEL}>{OTHER_REASON_LABEL}…</option>
      </select>
      {otherOpen && (
        <input
          type="text"
          className={`${FIELD} mt-2`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Describe the reason"
          aria-label="Other reason"
        />
      )}
    </div>
  );
}

function ChangeBlock({
  tag,
  tone,
  lines,
  children,
}: {
  tag: string;
  tone: "shift" | "attendance";
  lines: ChangeLine[];
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface">
      <div className="flex items-center gap-2 border-b border-border bg-surface-hover px-3 py-2">
        <span
          className={`rounded px-1.5 py-0.5 text-[9px] font-extrabold uppercase ${
            tone === "shift" ? "bg-accent-muted text-accent" : "bg-success-muted text-success"
          }`}
        >
          {tag}
        </span>
        <span className="text-xs font-bold text-text-secondary">
          {lines.length} change{lines.length > 1 ? "s" : ""}
        </span>
      </div>
      <div className="space-y-1 px-3 py-2.5 text-[13px]">
        {lines.map((l) => (
          <div key={`${l.label}-${l.before}-${l.after}`}>
            {l.label} <span className="text-text-muted line-through">{l.before}</span>{" "}
            → <b className="tabular-nums">{l.after}</b>
          </div>
        ))}
      </div>
      <div className="px-3 pb-3">{children}</div>
    </div>
  );
}

export function CompactReviewSave({
  shiftChanges,
  attendanceChanges,
  saving,
  onCancel,
  onConfirm,
}: {
  shiftChanges: ChangeLine[];
  attendanceChanges: ChangeLine[];
  saving: boolean;
  onCancel: () => void;
  onConfirm: (result: ReviewResult) => void;
}) {
  const [shiftReason, setShiftReason] = useState("");
  const [attendanceReason, setAttendanceReason] = useState("");

  const needsShift = shiftChanges.length > 0;
  const needsAttendance = attendanceChanges.length > 0;
  const ready =
    (!needsShift || shiftReason.trim() !== "")
    && (!needsAttendance || attendanceReason.trim() !== "");
  const total = shiftChanges.length + attendanceChanges.length;

  return (
    <div className="space-y-3 px-1 pb-1">
      {needsShift && (
        <ChangeBlock tag="shift" tone="shift" lines={shiftChanges}>
          <ReasonPicker
            idPrefix="shift"
            presets={SHIFT_REASON_PRESETS}
            value={shiftReason}
            onChange={setShiftReason}
          />
        </ChangeBlock>
      )}

      {needsAttendance && (
        <ChangeBlock tag="attendance" tone="attendance" lines={attendanceChanges}>
          <ReasonPicker
            idPrefix="attendance"
            presets={CORRECTION_REASON_PRESETS}
            value={attendanceReason}
            onChange={setAttendanceReason}
          />
        </ChangeBlock>
      )}

      <p className="px-1 text-xs text-text-muted">
        The reason is stored in History and shown to whoever reviews this record later.
      </p>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="h-12 flex-[0.6] rounded-lg border border-border text-sm font-bold text-text-secondary disabled:opacity-60"
        >
          Back
        </button>
        <button
          type="button"
          onClick={() => onConfirm({ shiftReason: shiftReason.trim(), attendanceReason: attendanceReason.trim() })}
          disabled={!ready || saving}
          className="h-12 flex-[1.4] rounded-lg bg-accent text-sm font-bold text-white transition-colors active:bg-accent-light disabled:opacity-50"
        >
          {saving ? "Saving…" : `Save ${total} change${total > 1 ? "s" : ""}`}
        </button>
      </div>
    </div>
  );
}
