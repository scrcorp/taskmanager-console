"use client";

/**
 * 근태 상세 페이지 — 읽기 화면 + audit 모달로 보정.
 *
 * Attendance detail page. The page itself is read-only summary; clicking
 * "Make Correction" opens a focused modal where status/time/note can be
 * adjusted with a required reason. Break sessions remain inline editable
 * (each row is its own mutation, not part of the correction batch).
 *
 * History 카드의 Reason 은 인라인으로 수정 가능 — 급한 보정 후 사유를
 * 나중에 채워 넣는 케이스 지원.
 */

import React, { useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Calendar,
  Clock,
  Coffee,
  Edit2,
  LogIn,
  LogOut,
  MapPin,
  User,
  History,
  X,
  Check,
  Plus,
  Trash2,
  Pencil,
} from "lucide-react";
import {
  useAttendance,
  useAddBreakSession,
  useUpdateBreakSession,
  useDeleteBreakSession,
  useUpdateCorrectionReason,
} from "@/hooks";
import { useTimezone } from "@/hooks/useTimezone";
import type { Attendance, AttendanceBreakItem } from "@/types";
import {
  Button,
  Card,
  Badge,
  Input,
  Select,
  LoadingSpinner,
} from "@/components/ui";
import { useModal } from "@/components/ui/imperative-modal";
import {
  formatDateTime,
  formatFixedDate,
  isoToLocalInputInTz,
  localInputToIsoInTz,
  timeAgo,
} from "@/lib/utils";
import { AttendanceCorrectionModal } from "@/components/attendances/AttendanceCorrectionModal";
import { AttendanceActionBar } from "@/components/attendances/AttendanceActionBar";
import { ReasonPicker } from "@/components/attendances/ReasonPicker";

type StatusKey =
  | "upcoming"
  | "soon"
  | "working"
  | "on_break"
  | "late"
  | "clocked_out"
  | "no_show"
  | "cancelled";

const statusBadge: Record<
  StatusKey,
  { label: string; variant: "success" | "warning" | "default" | "danger" | "accent" }
> = {
  upcoming: { label: "Upcoming", variant: "default" },
  soon: { label: "Soon", variant: "accent" },
  working: { label: "Working", variant: "success" },
  on_break: { label: "On Break", variant: "warning" },
  late: { label: "Late", variant: "warning" },
  clocked_out: { label: "Clocked Out", variant: "default" },
  no_show: { label: "No Show", variant: "danger" },
  cancelled: { label: "Cancelled", variant: "default" },
};

function formatMinutes(minutes: number | null): string {
  if (minutes == null) return "-";
  const h: number = Math.floor(minutes / 60);
  const m: number = minutes % 60;
  return `${h}h ${m.toString().padStart(2, "0")}m`;
}

// 시간 변환 헬퍼는 lib/utils 의 isoToLocalInputInTz / localInputToIsoInTz 사용 (매장 tz 인식).

export default function AttendanceDetailPage(): React.ReactElement {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const modal = useModal();
  const tz = useTimezone();

  const { data: attendance, isLoading } = useAttendance(id);

  /** 보던 날짜로 돌아가기 — ?from=YYYY-MM-DD 우선, 없으면 work_date. */
  const goBack = (): void => {
    const from = searchParams.get("from");
    const fallback = attendance?.work_date;
    const target = from || fallback;
    if (target) router.push(`/attendances?date=${target}`);
    else router.push("/attendances");
  };

  /** Correction modal — Status/Clock In/Out/Note + 필수 Reason. */
  const openCorrectionModal = (): void => {
    if (!attendance) return;
    void modal.open<boolean>(
      ({ close }) => (
        <AttendanceCorrectionModal
          attendance={attendance}
          tz={tz}
          onClose={close}
        />
      ),
      { title: "Make Correction", size: "lg", closeOnBackdrop: false },
    );
  };

  // 같은 시점 (±2s) + 같은 actor 의 corrections 를 한 카드로 묶음.
  // attendance early-return 보다 먼저 hook 실행되어야 hook 순서 안정.
  const correctionGroups: ActivityGroup[] = useCorrectionGroups(attendance, tz);

  if (isLoading) return <LoadingSpinner size="lg" className="mt-32" />;
  if (!attendance) {
    return (
      <div className="text-center py-20 text-text-secondary">
        Attendance record not found
      </div>
    );
  }

  const badge = statusBadge[attendance.status as StatusKey] ?? statusBadge.upcoming;

  return (
    <div>
      {/* 헤더 */}
      <div className="flex items-center gap-3 mb-3">
        <button
          onClick={goBack}
          className="p-1.5 rounded-lg hover:bg-surface-hover text-text-secondary transition-colors"
          aria-label="Back"
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-xl md:text-2xl font-extrabold flex-1 min-w-0 truncate">
          Attendance Detail
        </h1>
        <Button variant="ghost" size="sm" onClick={openCorrectionModal}>
          <Edit2 size={14} className="mr-1" /> Edit times / note
        </Button>
      </div>

      {/* 상태 기반 액션 바 — Status 변경은 모두 여기를 거친다 (state machine). */}
      <div className="mb-6">
        <AttendanceActionBar attendance={attendance} tz={tz} />
      </div>

      {/* 상세 카드 — 전부 읽기 전용. 시간/상태/노트 수정은 모달 사용. */}
      <Card className="p-6 space-y-5">
        <div className="flex items-center gap-3">
          <Badge variant={badge.variant}>{badge.label}</Badge>
        </div>

        {/* 메타 */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
          <div>
            <div className="text-xs text-text-muted mb-0.5">
              <User size={12} className="inline mr-1" />
              Employee
            </div>
            <div className="text-text font-medium">
              {attendance.user_name || "Unknown"}
            </div>
          </div>
          <div>
            <div className="text-xs text-text-muted mb-0.5">
              <MapPin size={12} className="inline mr-1" />
              Store
            </div>
            <div className="text-text">{attendance.store_name || "Unknown"}</div>
          </div>
          <div>
            <div className="text-xs text-text-muted mb-0.5">
              <Calendar size={12} className="inline mr-1" />
              Work Date
            </div>
            <div className="text-text">
              {formatFixedDate(attendance.work_date)}
            </div>
          </div>
        </div>

        {/* Scheduled In/Out (원본 스케줄 — 참고용) */}
        {(attendance.scheduled_start_display || attendance.scheduled_end_display) && (
          <div className="grid grid-cols-2 gap-4 text-sm pt-3 border-t border-border">
            <div>
              <div className="text-xs text-text-muted mb-0.5">
                <Clock size={12} className="inline mr-1" />
                Scheduled In
              </div>
              <div className="text-text-secondary">
                {attendance.scheduled_start_display ?? "—"}
              </div>
            </div>
            <div>
              <div className="text-xs text-text-muted mb-0.5">
                <Clock size={12} className="inline mr-1" />
                Scheduled Out
              </div>
              <div className="text-text-secondary">
                {attendance.scheduled_end_display ?? "—"}
              </div>
            </div>
          </div>
        )}

        {/* Clock In/Out (실제 출퇴근) */}
        <div className="grid grid-cols-2 gap-4 text-sm pt-3 border-t border-border">
          {[
            { label: "Clock In", icon: LogIn, value: attendance.clock_in, tzName: attendance.clock_in_timezone },
            { label: "Clock Out", icon: LogOut, value: attendance.clock_out, tzName: attendance.clock_out_timezone },
          ].map(({ label, icon: Icon, value, tzName }) => (
            <div key={label}>
              <div className="text-xs text-text-muted mb-0.5">
                <Icon size={12} className="inline mr-1" />
                {label}
              </div>
              <div className="text-text">
                {value ? formatDateTime(value, tz) : "-"}
              </div>
              {tzName && (
                <div className="text-[10px] text-text-muted">{tzName}</div>
              )}
            </div>
          ))}
        </div>

        {/* 합계 */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm pt-3 border-t border-border">
          <div>
            <div className="text-xs text-text-muted mb-0.5">
              <Clock size={12} className="inline mr-1" />
              Total Work Time
            </div>
            <div className="text-text font-semibold text-lg">
              {formatMinutes(attendance.total_work_minutes)}
            </div>
          </div>
          <div>
            <div className="text-xs text-text-muted mb-0.5">
              <Clock size={12} className="inline mr-1" />
              Net Work (paid)
            </div>
            <div className="text-text font-semibold text-lg">
              {formatMinutes(attendance.net_work_minutes)}
            </div>
          </div>
          <div>
            <div className="text-xs text-text-muted mb-0.5">
              <Coffee size={12} className="inline mr-1" />
              Break (Paid)
            </div>
            <div className="text-[var(--color-success)] font-semibold text-lg">
              {formatMinutes(attendance.paid_break_minutes ?? 0)}
            </div>
          </div>
          <div>
            <div className="text-xs text-text-muted mb-0.5">
              <Coffee size={12} className="inline mr-1" />
              Break (Unpaid)
            </div>
            <div className="text-[var(--color-warning)] font-semibold text-lg">
              {formatMinutes(attendance.unpaid_break_minutes ?? 0)}
            </div>
          </div>
        </div>

        {/* 휴식 세션 — 항상 inline 편집 가능 (각 row 가 자체 mutation). */}
        <div className="pt-3 border-t border-border">
          <BreakSessionsEditor
            attendanceId={id}
            workDate={attendance.work_date}
            sessions={attendance.breaks ?? []}
            tz={tz}
          />
        </div>

        {/* 메모 — 읽기 전용. 수정은 Correction modal 에서. 비어 있어도 자리 유지. */}
        <div className="pt-3 border-t border-border">
          <div className="text-xs text-text-muted mb-1">Note</div>
          {attendance.note ? (
            <p className="text-sm text-text-secondary whitespace-pre-wrap">
              {attendance.note}
            </p>
          ) : (
            <p className="text-sm text-text-muted italic">No note</p>
          )}
        </div>
      </Card>

      {/* 활동 이력 */}
      <Card className="p-6 mt-6">
        <div className="flex items-center gap-2 mb-4">
          <History size={16} className="text-text-secondary" />
          <h2 className="text-lg font-bold">Activity History</h2>
          {correctionGroups.length > 0 && (
            <Badge variant="accent">{correctionGroups.length}</Badge>
          )}
        </div>

        {correctionGroups.length === 0 ? (
          <div className="text-sm text-text-muted py-4">
            No activity recorded yet.
          </div>
        ) : (
          <div className="space-y-3">
            {correctionGroups.map((group) => (
              <CorrectionGroupCard
                key={group.id}
                attendanceId={id}
                group={group}
                tz={tz}
              />
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// ─── Activity history ──────────────────────────────────────────────────────

interface ActivityEntry {
  before?: string | null;
  after: string;
  label?: string;
}

interface ActivityGroup {
  id: string;
  tag: string;
  actor: string;
  createdAt: string;
  entries: ActivityEntry[];
  reason: string;
}

function useCorrectionGroups(
  attendance: Attendance | undefined,
  tz: string | undefined,
): ActivityGroup[] {
  return React.useMemo(() => {
    const corrections = attendance?.corrections ?? [];
    if (corrections.length === 0) return [];
    const sorted = [...corrections].sort((a, b) =>
      a.created_at < b.created_at ? 1 : -1,
    );
    const groups: ActivityGroup[] = [];
    for (const c of sorted) {
      const last = groups[groups.length - 1];
      const sameBucket =
        last !== undefined &&
        last.tag === c.field_name &&
        last.actor === (c.corrected_by_name || "Unknown") &&
        Math.abs(
          new Date(last.createdAt).getTime() - new Date(c.created_at).getTime(),
        ) < 2000;
      const entry: ActivityEntry = {
        before: humanizeValue(c.original_value, tz),
        after: humanizeValue(c.corrected_value, tz),
        label: undefined,
      };
      if (sameBucket) {
        last!.entries.push(entry);
        if (last!.reason === "(no reason)" && c.reason) last!.reason = c.reason;
      } else {
        groups.push({
          id: c.id,
          tag: c.field_name,
          actor: c.corrected_by_name || "Unknown",
          createdAt: c.created_at,
          entries: [entry],
          reason: c.reason ?? "(no reason)",
        });
      }
    }
    return groups;
  }, [attendance, tz]);
}

function activityTagInfo(tag: string): { label: string; cls: string } {
  switch (tag) {
    case "clock_in":
      return { label: "Clock-in", cls: "bg-success-muted text-success" };
    case "clock_out":
      return { label: "Clock-out", cls: "bg-surface-hover text-text-secondary" };
    case "break_start":
      return { label: "Break start", cls: "bg-warning-muted text-warning" };
    case "break_end":
      return { label: "Break end", cls: "bg-success-muted text-success" };
    case "modify":
    case "status":
      return { label: "Modify", cls: "bg-accent-muted text-accent" };
    case "note":
      return { label: "Note", cls: "bg-accent-muted text-accent" };
    case "auto_clock_out":
      return { label: "Auto clock-out", cls: "bg-danger-muted text-danger" };
    default:
      return { label: tag, cls: "bg-surface-hover text-text-secondary" };
  }
}

function humanizeValue(raw: string | null | undefined, tz?: string): string {
  if (raw === null || raw === undefined) return "—";
  const v = raw.trim();
  if (!v || v === "(none)" || v === "(empty)") return "—";
  if (v === "(cleared)") return "Cleared";
  if (v === "(set)") return "Set";
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)) {
    try {
      const d = new Date(v);
      return new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      }).format(d);
    } catch {
      return v;
    }
  }
  const statusLabels: Record<string, string> = {
    upcoming: "Upcoming",
    soon: "Soon",
    working: "Working",
    on_break: "On break",
    late: "Late",
    clocked_out: "Clocked out",
    no_show: "No show",
    cancelled: "Cancelled",
  };
  return statusLabels[v] ?? v;
}

interface CorrectionGroupCardProps {
  attendanceId: string;
  group: ActivityGroup;
  tz: string | undefined;
}

function CorrectionGroupCard({
  attendanceId,
  group,
  tz,
}: CorrectionGroupCardProps): React.ReactElement {
  const tag = activityTagInfo(group.tag);
  const [editingReason, setEditingReason] = useState<boolean>(false);
  const [reasonDraft, setReasonDraft] = useState<string>(group.reason);
  const updateReason = useUpdateCorrectionReason();

  // 외부 group.reason 이 바뀌면 (다른 곳에서 invalidate) draft 도 sync
  useEffect(() => {
    if (!editingReason) setReasonDraft(group.reason);
  }, [group.reason, editingReason]);

  const handleSaveReason = async (): Promise<void> => {
    const trimmed = reasonDraft.trim();
    if (!trimmed || trimmed === group.reason) {
      setEditingReason(false);
      return;
    }
    try {
      await updateReason.mutateAsync({
        attendanceId,
        correctionId: group.id,
        data: { reason: trimmed },
      });
      setEditingReason(false);
    } catch {
      // hook 자동 모달
    }
  };

  return (
    <div className="p-3 rounded-lg bg-surface-hover border border-border">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold ${tag.cls}`}
          >
            {tag.label}
          </span>
          <span className="text-xs text-text-muted">by {group.actor}</span>
        </div>
        <span
          className="text-xs text-text-muted"
          title={formatDateTime(group.createdAt, tz)}
        >
          {timeAgo(group.createdAt)}
        </span>
      </div>
      {group.entries.map((e, idx) => (
        <div key={idx} className={idx > 0 ? "mt-2 pt-2 border-t border-border" : ""}>
          {e.before !== null && e.before !== undefined ? (
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-xs text-text-muted">Before</div>
                <div className="text-text-secondary">{e.before}</div>
              </div>
              <div>
                <div className="text-xs text-text-muted">After</div>
                <div className="text-text">{e.after}</div>
              </div>
            </div>
          ) : (
            <div className="text-sm">
              <span className="text-xs text-text-muted">Set: </span>
              <span className="text-text">{e.after}</span>
            </div>
          )}
          {e.label && (
            <div className="text-xs text-text-muted mt-1">{e.label}</div>
          )}
        </div>
      ))}
      <div className="mt-2">
        <div className="flex items-center justify-between gap-2">
          <div className="text-xs text-text-muted">Reason</div>
          {!editingReason && (
            <button
              type="button"
              onClick={() => {
                setReasonDraft(group.reason === "(no reason)" ? "" : group.reason);
                setEditingReason(true);
              }}
              className="text-xs text-text-muted hover:text-text inline-flex items-center gap-1"
              aria-label="Edit reason"
            >
              <Pencil size={11} /> Edit
            </button>
          )}
        </div>
        {editingReason ? (
          <div className="mt-1 space-y-2">
            <ReasonPicker
              value={reasonDraft}
              onChange={setReasonDraft}
              compact
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setReasonDraft(group.reason);
                  setEditingReason(false);
                }}
              >
                <X size={12} className="mr-1" /> Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSaveReason}
                disabled={!reasonDraft.trim() || reasonDraft.trim() === group.reason}
                isLoading={updateReason.isPending}
              >
                <Check size={12} className="mr-1" /> Save
              </Button>
            </div>
          </div>
        ) : (
          <p className="text-sm text-text-secondary">{group.reason}</p>
        )}
      </div>
    </div>
  );
}

// ─── Break Sessions Editor — 항상 편집 가능. 각 row 가 자체 mutation 트리거. ───

type BreakType = "paid_10min" | "unpaid_meal";

const breakTypeOptions: Array<{ value: BreakType; label: string }> = [
  { value: "paid_10min", label: "10min Break (Paid)" },
  { value: "unpaid_meal", label: "Meal Break (Unpaid)" },
];

function isPaidBreak(t: string): boolean {
  return t === "paid_10min" || t === "paid_short";
}
function isUnpaidBreak(t: string): boolean {
  return t === "unpaid_meal" || t === "unpaid_long";
}
function breakTypeLabel(t: string): string {
  if (isPaidBreak(t)) return "10min Break (Paid)";
  if (isUnpaidBreak(t)) return "Meal Break (Unpaid)";
  return t;
}
function toCanonicalBreakType(t: string): BreakType {
  return isPaidBreak(t) ? "paid_10min" : "unpaid_meal";
}

interface BreakSessionsEditorProps {
  attendanceId: string;
  workDate: string;
  sessions: AttendanceBreakItem[];
  tz: string | undefined;
}

function BreakSessionsEditor({
  attendanceId,
  workDate,
  sessions,
  tz,
}: BreakSessionsEditorProps): React.ReactElement {
  const modal = useModal();
  const addBreak = useAddBreakSession();
  const updateBreak = useUpdateBreakSession();
  const deleteBreak = useDeleteBreakSession();

  const [showAddForm, setShowAddForm] = useState<boolean>(false);
  const [draftStart, setDraftStart] = useState<string>("");
  const [draftEnd, setDraftEnd] = useState<string>("");
  const [draftType, setDraftType] = useState<BreakType>("paid_10min");
  const [editingRowId, setEditingRowId] = useState<string | null>(null);

  const resetAddForm = (): void => {
    setShowAddForm(false);
    setDraftStart("");
    setDraftEnd("");
    setDraftType("paid_10min");
  };

  const handleAdd = async (): Promise<void> => {
    if (!draftStart) {
      void modal.alert({ type: "error", message: "Start time is required" });
      return;
    }
    const startedIso = localInputToIsoInTz(draftStart, tz);
    const endedIso = draftEnd ? localInputToIsoInTz(draftEnd, tz) : null;
    if (!startedIso) {
      void modal.alert({ type: "error", message: "Invalid start time" });
      return;
    }
    try {
      await addBreak.mutateAsync({
        attendanceId,
        data: {
          started_at: startedIso,
          ended_at: endedIso,
          break_type: draftType,
        },
      });
      resetAddForm();
    } catch {
      // hook 자동 모달
    }
  };

  const handleDelete = async (breakId: string): Promise<void> => {
    const ok = await modal.confirm({
      title: "Delete Break Session",
      message: "Delete this break session?",
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;
    try {
      await deleteBreak.mutateAsync({ attendanceId, breakId });
    } catch {
      // hook 자동 모달
    }
  };

  const handleSessionUpdate = async (
    breakId: string,
    patch: { started_at?: string; ended_at?: string | null; break_type?: BreakType },
  ): Promise<void> => {
    try {
      await updateBreak.mutateAsync({
        attendanceId,
        breakId,
        data: {
          started_at: patch.started_at ?? null,
          ended_at: patch.ended_at === undefined ? null : patch.ended_at,
          break_type: patch.break_type ?? null,
          clear_ended_at: patch.ended_at === null,
        },
      });
      setEditingRowId(null);
    } catch {
      // hook 자동 모달
    }
  };

  if (sessions.length === 0 && !showAddForm) {
    return (
      <div>
        <div className="text-xs text-text-muted mb-2 flex items-center gap-1">
          <Coffee size={12} className="inline" />
          Break Sessions
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setShowAddForm(true)}
          type="button"
        >
          <Plus size={14} className="mr-1" /> Add break session
        </Button>
      </div>
    );
  }

  return (
    <div>
      <div className="text-xs text-text-muted mb-2 flex items-center gap-1">
        <Coffee size={12} className="inline" />
        Break Sessions
      </div>

      <div className="space-y-1.5">
        {sessions.map((br) =>
          editingRowId === br.id ? (
            <BreakSessionRow
              key={br.id}
              session={br}
              tz={tz}
              onSave={(patch) => handleSessionUpdate(br.id, patch)}
              onCancel={() => setEditingRowId(null)}
              onDelete={() => handleDelete(br.id)}
              busy={updateBreak.isPending || deleteBreak.isPending}
            />
          ) : (
            <BreakSessionReadRow
              key={br.id}
              session={br}
              tz={tz}
              onEdit={() => setEditingRowId(br.id)}
            />
          ),
        )}
      </div>

      <div className="mt-2">
        {showAddForm ? (
          <div className="grid grid-cols-12 gap-2 items-end p-2 rounded-lg bg-surface-hover border border-border">
            <div className="col-span-3">
              <Select
                label="Type"
                value={draftType}
                onChange={(e) => setDraftType(e.target.value as BreakType)}
                options={breakTypeOptions}
              />
            </div>
            <div className="col-span-4">
              <Input
                label="Start"
                type="datetime-local"
                value={draftStart}
                onChange={(e) => setDraftStart(e.target.value)}
                placeholder={`${workDate}T00:00`}
              />
            </div>
            <div className="col-span-4">
              <Input
                label="End (optional)"
                type="datetime-local"
                value={draftEnd}
                onChange={(e) => setDraftEnd(e.target.value)}
              />
            </div>
            <div className="col-span-1 flex gap-1 justify-end">
              <Button variant="secondary" size="sm" onClick={resetAddForm} type="button">
                <X size={14} />
              </Button>
              <Button
                size="sm"
                onClick={handleAdd}
                isLoading={addBreak.isPending}
                type="button"
              >
                <Check size={14} />
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setShowAddForm(true)}
            type="button"
          >
            <Plus size={14} className="mr-1" /> Add break session
          </Button>
        )}
      </div>
    </div>
  );
}

interface BreakSessionReadRowProps {
  session: AttendanceBreakItem;
  tz: string | undefined;
  onEdit: () => void;
}

function BreakSessionReadRow({
  session,
  tz,
  onEdit,
}: BreakSessionReadRowProps): React.ReactElement {
  const paid = isPaidBreak(session.break_type);
  const typeLabel = breakTypeLabel(session.break_type);
  const accent = paid
    ? "text-[var(--color-success)]"
    : "text-[var(--color-warning)]";
  const dot = paid ? "bg-[var(--color-success)]" : "bg-[var(--color-warning)]";
  const started = formatDateTime(session.started_at, tz);
  const ended = session.ended_at ? formatDateTime(session.ended_at, tz) : "in progress";
  const dur = session.duration_minutes != null ? `${session.duration_minutes} min` : "—";

  return (
    <div className="group flex items-center gap-2 text-sm tabular-nums px-2 py-1 rounded hover:bg-surface-hover">
      <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
      <span className="text-text">
        {started} – {ended}
      </span>
      <span className="text-text-muted">·</span>
      <span className={accent}>{typeLabel}</span>
      <span className="text-text-muted">·</span>
      <span className="text-text-secondary">{dur}</span>
      <button
        type="button"
        onClick={onEdit}
        className="ml-auto opacity-0 group-hover:opacity-100 text-xs text-text-muted hover:text-text inline-flex items-center gap-1"
        aria-label="Edit break"
      >
        <Pencil size={11} /> Edit
      </button>
    </div>
  );
}

interface BreakSessionRowProps {
  session: AttendanceBreakItem;
  tz: string | undefined;
  onSave: (patch: {
    started_at?: string;
    ended_at?: string | null;
    break_type?: BreakType;
  }) => Promise<void>;
  onCancel: () => void;
  onDelete: () => Promise<void>;
  busy: boolean;
}

function BreakSessionRow({
  session,
  tz,
  onSave,
  onCancel,
  onDelete,
  busy,
}: BreakSessionRowProps): React.ReactElement {
  const [start, setStart] = useState<string>(isoToLocalInputInTz(session.started_at, tz));
  const [end, setEnd] = useState<string>(isoToLocalInputInTz(session.ended_at, tz));
  const [type, setType] = useState<BreakType>(toCanonicalBreakType(session.break_type));

  const dirty =
    start !== isoToLocalInputInTz(session.started_at, tz) ||
    end !== isoToLocalInputInTz(session.ended_at, tz) ||
    type !== toCanonicalBreakType(session.break_type);

  const handleSave = async (): Promise<void> => {
    const startIso = start ? localInputToIsoInTz(start, tz) : null;
    if (!startIso) return;
    const endIso = end ? localInputToIsoInTz(end, tz) : null;
    await onSave({
      started_at: startIso,
      ended_at: endIso,
      break_type: type,
    });
  };

  return (
    <div className="grid grid-cols-12 gap-2 items-end p-2 rounded-lg bg-surface-hover border border-border">
      <div className="col-span-3">
        <Select
          label="Type"
          value={type}
          onChange={(e) => setType(e.target.value as BreakType)}
          options={breakTypeOptions}
        />
      </div>
      <div className="col-span-4">
        <Input
          label="Start"
          type="datetime-local"
          value={start}
          onChange={(e) => setStart(e.target.value)}
        />
      </div>
      <div className="col-span-4">
        <Input
          label="End"
          type="datetime-local"
          value={end}
          onChange={(e) => setEnd(e.target.value)}
        />
      </div>
      <div className="col-span-1 flex gap-1 justify-end">
        <Button
          variant="secondary"
          size="sm"
          onClick={onDelete}
          disabled={busy}
          type="button"
          aria-label="Delete break"
        >
          <Trash2 size={14} />
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={onCancel}
          disabled={busy}
          type="button"
          aria-label="Cancel"
        >
          <X size={14} />
        </Button>
        {dirty && (
          <Button
            size="sm"
            onClick={handleSave}
            isLoading={busy}
            type="button"
            aria-label="Save break"
          >
            <Check size={14} />
          </Button>
        )}
      </div>
    </div>
  );
}
