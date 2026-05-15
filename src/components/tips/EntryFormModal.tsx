"use client";

import { Plus, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Modal } from "@/components/ui/Modal";
import {
  useManagerCreateTipEntry,
  useManagerUpdateTipEntry,
} from "@/hooks/useTips";
import { useUsers } from "@/hooks/useUsers";
import { useWorkRoles } from "@/hooks/useWorkRoles";
import { useSchedules } from "@/hooks/useSchedules";
import { usePermissions } from "@/hooks/usePermissions";
import { PERMISSIONS } from "@/lib/permissions";
import type { TipEntry, TipEntryDistributionInput } from "@/types/tip";
import { cn } from "@/lib/utils";

interface BaseProps {
  isOpen: boolean;
  onClose: () => void;
  storeId: string;
}

interface AddProps extends BaseProps {
  mode: "add";
  /** prefill 정보 — Review matrix 의 누락 셀 클릭 시. */
  prefill: { employeeId: string; date: string };
  entry?: undefined;
}

interface EditProps extends BaseProps {
  mode: "edit";
  entry: TipEntry;
  prefill?: undefined;
}

type Props = AddProps | EditProps;

interface DistRow extends TipEntryDistributionInput {
  /** 로컬 row 식별자 (server id 또는 random). */
  _key: string;
}

function fmtMoney(value: string): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "$0.00";
  return `$${n.toFixed(2)}`;
}

const fieldBase =
  "w-full rounded-lg border border-[#E2E4EA] bg-white px-2.5 py-2 text-[13px] text-[#1A1D27] focus:border-[#6C5CE7] focus:outline-none focus:ring-2 focus:ring-[rgba(108,92,231,0.15)] disabled:bg-[#F5F6FA] disabled:text-[#94A3B8]";

export function EntryFormModal(props: Props) {
  const { isOpen, onClose, storeId } = props;
  const isEdit = props.mode === "edit";
  const { hasPermission } = usePermissions();
  // Add 는 tips:add_for_others, Edit 는 tips:edit_all 필요.
  const canSubmit = isEdit
    ? hasPermission(PERMISSIONS.TIPS_EDIT_ALL)
    : hasPermission(PERMISSIONS.TIPS_ADD_FOR_OTHERS);

  // ── 폼 상태
  const [employeeId, setEmployeeId] = useState<string>(
    isEdit ? props.entry.employee_id : props.prefill.employeeId,
  );
  const [workRoleId, setWorkRoleId] = useState<string>(
    isEdit ? props.entry.work_role_id ?? "" : "",
  );
  const [date, setDate] = useState<string>(
    isEdit ? props.entry.date : props.prefill.date,
  );
  const [cardTips, setCardTips] = useState<string>(
    isEdit ? props.entry.card_tips : "0",
  );
  const [cashTipsKept, setCashTipsKept] = useState<string>(
    isEdit ? props.entry.cash_tips_kept : "0",
  );
  const [comment, setComment] = useState<string>("");
  const [dists, setDists] = useState<DistRow[]>(() =>
    isEdit
      ? props.entry.distributions.map((d) => ({
          _key: d.id,
          receiver_id: d.receiver_id ?? "",
          amount: d.amount,
          reason: d.reason,
        }))
      : [],
  );
  // schedule_id: schedule picker 로 선택. null = freeform.
  // Add 모드는 직원+날짜 결정되면 schedule 옵션 fetch.
  const [scheduleId, setScheduleId] = useState<string | null>(
    isEdit ? props.entry.schedule_id : null,
  );
  // freeform 모드 토글 — schedule 옵션이 있을 때 사용자가 명시적으로 freeform 선호 시.
  const [useFreeform, setUseFreeform] = useState<boolean>(false);
  // 분배가 변경됐는지 — true 면 server 에 distributions 전체 전송. false 면 omit (기존 유지).
  const [distsTouched, setDistsTouched] = useState<boolean>(false);

  useEffect(() => {
    if (!isOpen) return;
    if (isEdit) {
      setEmployeeId(props.entry.employee_id);
      setWorkRoleId(props.entry.work_role_id ?? "");
      setDate(props.entry.date);
      setCardTips(props.entry.card_tips);
      setCashTipsKept(props.entry.cash_tips_kept);
      setScheduleId(props.entry.schedule_id);
      setUseFreeform(props.entry.schedule_id === null);
      setDists(
        props.entry.distributions.map((d) => ({
          _key: d.id,
          receiver_id: d.receiver_id ?? "",
          amount: d.amount,
          reason: d.reason,
        })),
      );
    } else {
      setEmployeeId(props.prefill.employeeId);
      setWorkRoleId("");
      setDate(props.prefill.date);
      setCardTips("0");
      setCashTipsKept("0");
      setScheduleId(null);
      setUseFreeform(false);
      setDists([]);
    }
    setComment("");
    setDistsTouched(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const { data: workRoles = [] } = useWorkRoles(storeId);
  const { data: storeUsers = [] } = useUsers({ store_ids: [storeId] });
  // 직원+날짜에 해당하는 schedule 옵션 — Add 모드일 때만 fetch.
  const scheduleFilters = useMemo(
    () =>
      isEdit || !employeeId || !date
        ? null
        : {
            user_ids: [employeeId],
            date_from: date,
            date_to: date,
            status: "confirmed",
            per_page: 50,
          },
    [isEdit, employeeId, date],
  );
  const { data: schedulePage } = useSchedules(scheduleFilters ?? {});
  const scheduleOptions = useMemo(() => {
    if (!schedulePage || isEdit) return [];
    return schedulePage.items.filter((s) => s.store_id === storeId);
  }, [schedulePage, isEdit, storeId]);

  // schedule 선택 시 store/work_role 자동 prefill.
  useEffect(() => {
    if (isEdit || useFreeform) return;
    if (scheduleId == null) return;
    const sched = scheduleOptions.find((s) => s.id === scheduleId);
    if (sched) {
      setWorkRoleId(sched.work_role_id ?? "");
    }
  }, [scheduleId, scheduleOptions, isEdit, useFreeform]);

  // 직원/날짜 변경 후 옵션 갱신되면 첫 가용 schedule 자동 선택.
  useEffect(() => {
    if (isEdit || useFreeform) return;
    if (scheduleOptions.length === 0) {
      setScheduleId(null);
      return;
    }
    // 기존 선택이 옵션에 없으면 첫 옵션으로.
    if (!scheduleOptions.some((s) => s.id === scheduleId)) {
      setScheduleId(scheduleOptions[0].id);
    }
  }, [scheduleOptions, scheduleId, isEdit, useFreeform]);

  const distTotal = useMemo(
    () => dists.reduce((s, d) => s + (Number(d.amount) || 0), 0),
    [dists],
  );
  const cardNum = Number(cardTips) || 0;
  const cashNum = Number(cashTipsKept) || 0;
  const reportableCard = cardNum - distTotal;
  const reportedOn4070 = cashNum + reportableCard;
  const distExceedsCard = distTotal > cardNum;

  const createMut = useManagerCreateTipEntry();
  const updateMut = useManagerUpdateTipEntry();
  const busy = createMut.isPending || updateMut.isPending;

  const validReason = (raw: string | null | undefined): string | null =>
    raw && raw.trim() ? raw.trim() : null;

  const submit = async () => {
    if (distExceedsCard) return;
    if (!comment.trim()) return;
    if (isEdit) {
      await updateMut.mutateAsync({
        entryId: props.entry.id,
        data: {
          card_tips: cardTips,
          cash_tips_kept: cashTipsKept,
          comment: comment.trim(),
          distributions: distsTouched
            ? dists.map((d) => ({
                receiver_id: d.receiver_id,
                amount: d.amount,
                reason: validReason(d.reason),
              }))
            : undefined,
        },
      });
    } else {
      if (!employeeId || !date) return;
      // schedule_id 가 있고 freeform 모드 아니면 schedule 기반.
      // 그 외는 freeform — store/work_role/date 직접.
      const useSchedule = !useFreeform && scheduleId != null;
      await createMut.mutateAsync({
        employee_id: employeeId,
        schedule_id: useSchedule ? scheduleId : null,
        store_id: useSchedule ? null : storeId,
        work_role_id: useSchedule ? null : (workRoleId || null),
        date: useSchedule ? null : date,
        card_tips: cardTips,
        cash_tips_kept: cashTipsKept,
        comment: comment.trim(),
        distributions: dists.map((d) => ({
          receiver_id: d.receiver_id,
          amount: d.amount,
          reason: validReason(d.reason),
        })),
      });
    }
    onClose();
  };

  const addDistRow = () => {
    setDistsTouched(true);
    setDists((prev) => [
      ...prev,
      { _key: crypto.randomUUID(), receiver_id: "", amount: "0", reason: null },
    ]);
  };
  const removeDistRow = (key: string) => {
    setDistsTouched(true);
    setDists((prev) => prev.filter((d) => d._key !== key));
  };
  const updateDistRow = (key: string, patch: Partial<DistRow>) => {
    setDistsTouched(true);
    setDists((prev) =>
      prev.map((d) => (d._key === key ? { ...d, ...patch } : d)),
    );
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={isEdit ? "Edit tip entry" : "Add tip entry"}
      size="lg"
      closeOnBackdrop={false}
      footer={
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-lg px-3 py-1.5 text-[13px] font-medium text-[#64748B] hover:bg-[#F5F6FA] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy || distExceedsCard || !comment.trim() || (!isEdit && !employeeId) || !canSubmit}
            title={canSubmit ? undefined : "You don't have permission to submit this change"}
            className="rounded-lg bg-[#6C5CE7] px-4 py-1.5 text-[13px] font-semibold text-white hover:bg-[#7C6DF0] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isEdit ? "Save changes" : "Add entry"}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Staff">
            <select
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              disabled={isEdit}
              className={fieldBase}
            >
              <option value="">Select staff...</option>
              {storeUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.full_name} ({u.role_name})
                </option>
              ))}
            </select>
          </Field>
          <Field label="Date">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              disabled={isEdit}
              className={fieldBase}
            />
          </Field>
          {/* Schedule picker (Add 모드만). Edit 모드는 schedule_id snapshot. */}
          {!isEdit && (
            <div className="col-span-2">
              <Field
                label={
                  scheduleOptions.length > 0
                    ? "Schedule (preferred)"
                    : "Schedule"
                }
              >
                {scheduleOptions.length === 0 ? (
                  <div
                    className={cn(
                      fieldBase,
                      "flex items-center text-[#94A3B8]",
                    )}
                  >
                    No schedule on this date — entering free-form
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <select
                      value={useFreeform ? "__freeform" : (scheduleId ?? "")}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (v === "__freeform") {
                          setUseFreeform(true);
                          setScheduleId(null);
                        } else {
                          setUseFreeform(false);
                          setScheduleId(v || null);
                        }
                      }}
                      className={fieldBase}
                    >
                      {scheduleOptions.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.start_time && s.end_time
                            ? `${s.start_time}–${s.end_time}`
                            : "(no time)"}
                          {s.work_role_name ? ` · ${s.work_role_name}` : ""}
                        </option>
                      ))}
                      <option value="__freeform">
                        Free-form (no schedule)
                      </option>
                    </select>
                  </div>
                )}
              </Field>
            </div>
          )}
          {isEdit && props.entry.schedule_id && (
            <div className="col-span-2">
              <Field label="Schedule">
                <div
                  className={cn(
                    fieldBase,
                    "text-[#64748B]",
                  )}
                >
                  Linked to a schedule (immutable)
                </div>
              </Field>
            </div>
          )}
          <div className="col-span-2">
            <Field label="Work role">
              <select
                value={workRoleId}
                onChange={(e) => setWorkRoleId(e.target.value)}
                disabled={!isEdit && !useFreeform && scheduleId != null}
                className={fieldBase}
              >
                <option value="">(none)</option>
                {workRoles
                  .filter((r) => r.is_active)
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name ?? `${r.shift_name} · ${r.position_name}`}
                    </option>
                  ))}
              </select>
            </Field>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Card tips (gross)">
            <input
              type="number"
              step="0.01"
              min="0"
              value={cardTips}
              onChange={(e) => setCardTips(e.target.value)}
              className={fieldBase}
            />
          </Field>
          <Field label="Cash kept">
            <input
              type="number"
              step="0.01"
              min="0"
              value={cashTipsKept}
              onChange={(e) => setCashTipsKept(e.target.value)}
              className={fieldBase}
            />
          </Field>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">
              Card distributions
            </label>
            <button
              type="button"
              onClick={addDistRow}
              className="flex items-center gap-1 text-[12px] font-medium text-[#6C5CE7] hover:underline"
            >
              <Plus size={12} /> Add recipient
            </button>
          </div>
          {dists.length === 0 && (
            <p className="rounded-lg border border-dashed border-[#E2E4EA] px-3 py-3 text-center text-[12px] text-[#94A3B8]">
              No distributions. Cash kept and full card tips will be reported.
            </p>
          )}
          <ul className="space-y-1.5">
            {dists.map((d) => (
              <li
                key={d._key}
                className="flex items-center gap-2 rounded-lg border border-[#E2E4EA] bg-white px-2 py-1.5"
              >
                <select
                  className={cn(fieldBase, "flex-1")}
                  value={d.receiver_id}
                  onChange={(e) =>
                    updateDistRow(d._key, { receiver_id: e.target.value })
                  }
                >
                  <option value="">Select staff...</option>
                  {storeUsers
                    .filter((u) => u.id !== employeeId)
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.full_name}
                      </option>
                    ))}
                </select>
                <input
                  className={cn(fieldBase, "w-24")}
                  type="number"
                  step="0.01"
                  min="0"
                  value={d.amount}
                  onChange={(e) =>
                    updateDistRow(d._key, { amount: e.target.value })
                  }
                />
                <input
                  className={cn(fieldBase, "w-32")}
                  placeholder="Reason (optional)"
                  value={d.reason ?? ""}
                  onChange={(e) =>
                    updateDistRow(d._key, { reason: e.target.value || null })
                  }
                />
                <button
                  type="button"
                  onClick={() => removeDistRow(d._key)}
                  className="rounded-md p-1.5 text-[#94A3B8] hover:bg-[#F5F6FA] hover:text-[#FF6B6B]"
                  aria-label="Remove distribution"
                >
                  <Trash2 size={14} />
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-xl border border-[#E2E4EA] bg-[#F5F6FA] p-3">
          <div className="grid grid-cols-4 gap-2 text-center">
            <Stat label="Cash kept" value={fmtMoney(cashTipsKept)} />
            <Stat
              label="Distributed"
              value={fmtMoney(distTotal.toFixed(2))}
              tone={distExceedsCard ? "danger" : undefined}
            />
            <Stat
              label="Reportable card"
              value={fmtMoney(reportableCard.toFixed(2))}
              tone={distExceedsCard ? "danger" : undefined}
            />
            <Stat
              label="Reported on 4070"
              value={fmtMoney(reportedOn4070.toFixed(2))}
              tone="accent"
            />
          </div>
          {distExceedsCard && (
            <p className="mt-2 flex items-center gap-1.5 text-[12px] text-[#FF6B6B]">
              <X size={14} /> Distributed exceeds card tips by{" "}
              {fmtMoney((distTotal - cardNum).toFixed(2))}.
            </p>
          )}
        </div>

        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">
            Manager note <span className="text-[#FF6B6B]">*</span>
          </label>
          <textarea
            rows={2}
            placeholder="Why is this entry being added/changed? (required, audit trail)"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            className={fieldBase}
          />
          {!comment.trim() && (
            <p className="mt-1 text-[11px] text-[#94A3B8]">
              Required — visible to staff and recorded in audit log.
            </p>
          )}
        </div>
      </div>
    </Modal>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">
        {label}
      </label>
      {children}
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "accent" | "danger";
}) {
  const valueClass =
    tone === "accent"
      ? "text-[#6C5CE7]"
      : tone === "danger"
        ? "text-[#FF6B6B]"
        : "text-[#1A1D27]";
  return (
    <div>
      <p className="text-[10px] font-medium uppercase tracking-wider text-[#94A3B8]">
        {label}
      </p>
      <p className={`mt-0.5 text-[14px] font-semibold ${valueClass}`}>{value}</p>
    </div>
  );
}
