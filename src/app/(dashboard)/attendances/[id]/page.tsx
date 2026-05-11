"use client";

/**
 * 근태 상세 페이지 — inline edit 모드로 시간/상태를 한꺼번에 수정.
 *
 * Attendance detail page with inline edit mode. Edit toggles all time
 * fields and status into editable inputs with current values prefilled.
 * Optional reason at save time. Each changed field is logged separately.
 */

import React, { useEffect, useMemo, useState } from "react";
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
} from "lucide-react";
import {
  useAttendance,
  useCorrectAttendance,
  useAddBreakSession,
  useUpdateBreakSession,
  useDeleteBreakSession,
} from "@/hooks";
import { useTimezone } from "@/hooks/useTimezone";
import type { Attendance, AttendanceBreakItem, AttendanceCorrection } from "@/types";
import {
  Button,
  Card,
  Badge,
  Input,
  Select,
  LoadingSpinner,
} from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { formatDateTime, formatFixedDate, timeAgo, parseApiError } from "@/lib/utils";

type StatusKey =
  | "upcoming"
  | "soon"
  | "working"
  | "on_break"
  | "late"
  | "clocked_out"
  | "no_show"
  | "cancelled";

/** 상태별 배지 색상 매핑 — 새로 늘어난 상태들도 모두 매핑 (BUG fix). */
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

/** Status select 에 노출할 화이트리스트. */
const statusOptions: Array<{ value: StatusKey; label: string }> = [
  { value: "upcoming", label: "Upcoming" },
  { value: "soon", label: "Soon" },
  { value: "late", label: "Late" },
  { value: "working", label: "Working" },
  { value: "on_break", label: "On Break" },
  { value: "clocked_out", label: "Clocked Out" },
  { value: "no_show", label: "No Show" },
  { value: "cancelled", label: "Cancelled" },
];

/** 분을 시:분 형식으로 변환합니다. */
function formatMinutes(minutes: number | null): string {
  if (minutes == null) return "-";
  const h: number = Math.floor(minutes / 60);
  const m: number = minutes % 60;
  return `${h}h ${m.toString().padStart(2, "0")}m`;
}

/** ISO datetime 문자열을 `<input type="datetime-local">` 가 받을 수 있는
 *  "YYYY-MM-DDTHH:mm" 로 변환. null/빈 값이면 "" 반환. */
function isoToLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number): string => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}


/** local input 문자열 → ISO 문자열. 빈 문자열은 null. */
function localInputToIso(s: string): string | null {
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

interface DraftState {
  clock_in: string;
  clock_out: string;
  status: StatusKey;
}

/** 값이 있으면 그대로 input 형식으로, 없으면 빈 문자열.
 *  사용자가 의도적으로 입력하지 않은 시간이 저장되지 않도록 prefill 안 함. */
function buildDraft(att: Attendance): DraftState {
  return {
    clock_in: isoToLocalInput(att.clock_in),
    clock_out: isoToLocalInput(att.clock_out),
    status: att.status as StatusKey,
  };
}

export default function AttendanceDetailPage(): React.ReactElement {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const tz = useTimezone();

  const { data: attendance, isLoading } = useAttendance(id);
  const correctAttendance = useCorrectAttendance();

  const [editing, setEditing] = useState<boolean>(false);
  const [draft, setDraft] = useState<DraftState | null>(null);
  // 편집 시작 시 snapshot — 사용자가 prefill 된 값을 그대로 두면 변경으로 잡지 않기 위해.
  const [initialDraft, setInitialDraft] = useState<DraftState | null>(null);
  const [reason, setReason] = useState<string>("");

  // attendance 가 로드되면 draft 초기화 (read-only 표시용)
  useEffect(() => {
    if (attendance && draft === null) {
      setDraft(buildDraft(attendance));
    }
  }, [attendance, draft]);

  /** 보던 날짜로 돌아가기 — ?from=YYYY-MM-DD 가 있으면 그 날짜로,
   *  없으면 attendance.work_date, 그것도 없으면 attendances 기본 페이지. */
  const goBack = (): void => {
    const from = searchParams.get("from");
    const fallback = attendance?.work_date;
    const target = from || fallback;
    if (target) router.push(`/attendances?date=${target}`);
    else router.push("/attendances");
  };

  /** 편집 시작: 현재 값으로 prefill, reason 비움. snapshot 저장. */
  const enterEdit = (): void => {
    if (!attendance) return;
    const d = buildDraft(attendance);
    setDraft(d);
    setInitialDraft(d);
    setReason("");
    setEditing(true);
  };

  /** 편집 취소: 변경 내용 폐기. */
  const cancelEdit = (): void => {
    if (attendance) setDraft(buildDraft(attendance));
    setInitialDraft(null);
    setReason("");
    setEditing(false);
  };

  /** 변경된 필드만 추려서 correction 요청을 순차 실행.
   *  initialDraft (편집 시작 시 snapshot) 와 비교해 사용자가 실제로 변경한 필드만 보냄.
   *  → prefill 한 값만 그대로 두면 저장되지 않음. */
  const handleSave = async (): Promise<void> => {
    if (!attendance || !draft || !initialDraft) return;

    const trimmedReason = reason.trim() || null;
    const calls: Array<{ field: string; value: string }> = [];

    const timeFields: Array<keyof Pick<DraftState, "clock_in" | "clock_out">> = [
      "clock_in",
      "clock_out",
    ];
    for (const f of timeFields) {
      if (draft[f] !== initialDraft[f]) {
        const iso = localInputToIso(draft[f]);
        if (iso) calls.push({ field: f, value: iso });
      }
    }
    if (draft.status !== initialDraft.status) {
      calls.push({ field: "status", value: draft.status });
    }

    if (calls.length === 0) {
      toast({ type: "info", message: "No changes" });
      setEditing(false);
      return;
    }

    try {
      // 순차 호출 — 시간 재계산이 누적되도록 (서버가 매 요청마다 total_work_minutes 갱신)
      for (const call of calls) {
        await correctAttendance.mutateAsync({
          id,
          data: {
            field_name: call.field,
            corrected_value: call.value,
            reason: trimmedReason,
          },
        });
      }
      toast({
        type: "success",
        message: `Updated ${calls.length} field${calls.length > 1 ? "s" : ""}`,
      });
      setEditing(false);
      setInitialDraft(null);
      setReason("");
    } catch (err) {
      toast({ type: "error", message: parseApiError(err, "Correction failed") });
    }
  };

  // hook 순서 안정화 — attendance 가 없을 때도 동일 호출.
  // 편집 시작 시 snapshot (initialDraft) 와 비교 — 안 건드린 필드는 변경 없음.
  const hasChanges: boolean = useMemo<boolean>(() => {
    if (!draft || !initialDraft) return false;
    return (
      draft.clock_in !== initialDraft.clock_in ||
      draft.clock_out !== initialDraft.clock_out ||
      draft.status !== initialDraft.status
    );
  }, [draft, initialDraft]);

  if (isLoading) return <LoadingSpinner size="lg" className="mt-32" />;
  if (!attendance) {
    return (
      <div className="text-center py-20 text-text-secondary">
        Attendance record not found
      </div>
    );
  }

  const badge = statusBadge[attendance.status as StatusKey] ?? statusBadge.upcoming;
  const corrections: AttendanceCorrection[] = attendance.corrections ?? [];

  return (
    <div>
      {/* 헤더 */}
      <div className="flex items-center gap-3 mb-6">
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
        {editing ? (
          <>
            <Button variant="secondary" size="sm" onClick={cancelEdit}>
              <X size={14} className="mr-1" /> Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSave}
              isLoading={correctAttendance.isPending}
              disabled={!hasChanges}
            >
              <Check size={14} className="mr-1" /> Save
            </Button>
          </>
        ) : (
          <Button variant="secondary" size="sm" onClick={enterEdit}>
            <Edit2 size={14} className="mr-1" /> Edit
          </Button>
        )}
      </div>

      {/* 상세 카드 */}
      <Card className="p-6 space-y-5">
        {/* 상태 배지 / 편집 시 select */}
        <div className="flex items-center gap-3">
          {editing && draft ? (
            <div className="min-w-[180px]">
              <Select
                label="Status"
                value={draft.status}
                onChange={(e) =>
                  setDraft({ ...draft, status: e.target.value as StatusKey })
                }
                options={statusOptions}
              />
            </div>
          ) : (
            <Badge variant={badge.variant}>{badge.label}</Badge>
          )}
        </div>

        {/* 메타 정보 — 편집 불가 (사용자/매장/날짜) */}
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

        {/* 시간 정보 — Clock In / Out 만 편집. Break 는 다중 세션이라 아래 Break Sessions 영역에서 별도 관리 (현재 read-only). */}
        <div className="grid grid-cols-2 gap-4 text-sm pt-3 border-t border-border">
          {[
            { key: "clock_in" as const, label: "Clock In", icon: LogIn, value: attendance.clock_in, tzName: attendance.clock_in_timezone },
            { key: "clock_out" as const, label: "Clock Out", icon: LogOut, value: attendance.clock_out, tzName: attendance.clock_out_timezone },
          ].map(({ key, label, icon: Icon, value, tzName }) => (
            <div key={key}>
              <div className="text-xs text-text-muted mb-0.5">
                <Icon size={12} className="inline mr-1" />
                {label}
              </div>
              {editing && draft ? (
                <Input
                  type="datetime-local"
                  value={draft[key]}
                  onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
                />
              ) : (
                <>
                  <div className="text-text">
                    {value ? formatDateTime(value, tz) : "-"}
                  </div>
                  {tzName && (
                    <div className="text-[10px] text-text-muted">{tzName}</div>
                  )}
                </>
              )}
            </div>
          ))}
        </div>

        {/* 합계 — 편집 모드에서도 그대로 (서버가 재계산) */}
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

        {/* 휴식 세션 — 편집 모드면 row 별 추가/수정/삭제, 아니면 read-only 타임라인. */}
        <div className="pt-3 border-t border-border">
          <BreakSessionsEditor
            attendanceId={id}
            workDate={attendance.work_date}
            sessions={attendance.breaks ?? []}
            tz={tz}
            editable={editing}
          />
        </div>

        {/* 메모 */}
        {attendance.note && (
          <div className="pt-3 border-t border-border">
            <div className="text-xs text-text-muted mb-1">Note</div>
            <p className="text-sm text-text-secondary whitespace-pre-wrap">
              {attendance.note}
            </p>
          </div>
        )}

        {/* 편집 모드: 저장 시점 optional reason */}
        {editing && (
          <div className="pt-3 border-t border-border">
            <Input
              label="Reason (optional)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Why is this correction needed?"
            />
            <p className="text-xs text-text-muted mt-1">
              Each changed field is logged separately in correction history.
            </p>
          </div>
        )}
      </Card>

      {/* 수정 이력 */}
      <Card className="p-6 mt-6">
        <div className="flex items-center gap-2 mb-4">
          <History size={16} className="text-text-secondary" />
          <h2 className="text-lg font-bold">Correction History</h2>
          {corrections.length > 0 && (
            <Badge variant="accent">{corrections.length}</Badge>
          )}
        </div>

        {corrections.length === 0 ? (
          <div className="text-sm text-text-muted py-4">
            No corrections have been made.
          </div>
        ) : (
          <div className="space-y-3">
            {corrections.map((correction: AttendanceCorrection) => (
              <div
                key={correction.id}
                className="p-3 rounded-lg bg-surface-hover border border-border"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="accent">{correction.field_name}</Badge>
                    <span className="text-xs text-text-muted">
                      by {correction.corrected_by_name || "Unknown"}
                    </span>
                  </div>
                  <span className="text-xs text-text-muted">
                    {timeAgo(correction.created_at)}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <div className="text-xs text-text-muted">Original</div>
                    <div className="text-text-secondary">
                      {correction.original_value || "(empty)"}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-text-muted">Corrected</div>
                    <div className="text-text">{correction.corrected_value}</div>
                  </div>
                </div>
                {correction.reason && (
                  <div className="mt-2">
                    <div className="text-xs text-text-muted">Reason</div>
                    <p className="text-sm text-text-secondary">{correction.reason}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

// ─── Break Sessions Editor ────────────────────────────────────────────────
// 편집 모드: row 별 type/시작/종료 입력 + 삭제 버튼, 하단에 "Add break session"
// 읽기 모드: 기존 타임라인 그대로.

type BreakType = "paid_10min" | "unpaid_meal";

const breakTypeOptions: Array<{ value: BreakType; label: string }> = [
  { value: "paid_10min", label: "10min Break (Paid)" },
  { value: "unpaid_meal", label: "Meal Break (Unpaid)" },
];

// 레거시 paid_short/unpaid_long 도 dual-read 인식. write 는 항상 신규 값.
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
  editable: boolean;
}

function BreakSessionsEditor({
  attendanceId,
  workDate,
  sessions,
  tz,
  editable,
}: BreakSessionsEditorProps): React.ReactElement {
  const { toast } = useToast();
  const addBreak = useAddBreakSession();
  const updateBreak = useUpdateBreakSession();
  const deleteBreak = useDeleteBreakSession();

  // "추가" 폼은 토글 가능. 기본 닫힘.
  const [showAddForm, setShowAddForm] = useState<boolean>(false);
  const [draftStart, setDraftStart] = useState<string>("");
  const [draftEnd, setDraftEnd] = useState<string>("");
  const [draftType, setDraftType] = useState<BreakType>("paid_10min");

  const resetAddForm = (): void => {
    setShowAddForm(false);
    setDraftStart("");
    setDraftEnd("");
    setDraftType("paid_10min");
  };

  const handleAdd = async (): Promise<void> => {
    if (!draftStart) {
      toast({ type: "error", message: "Start time is required" });
      return;
    }
    const startedIso = localInputToIso(draftStart);
    const endedIso = draftEnd ? localInputToIso(draftEnd) : null;
    if (!startedIso) {
      toast({ type: "error", message: "Invalid start time" });
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
      toast({ type: "success", message: "Break added" });
      resetAddForm();
    } catch (err) {
      toast({ type: "error", message: parseApiError(err, "Failed to add break") });
    }
  };

  const handleDelete = async (breakId: string): Promise<void> => {
    if (!window.confirm("Delete this break session?")) return;
    try {
      await deleteBreak.mutateAsync({ attendanceId, breakId });
      toast({ type: "success", message: "Break deleted" });
    } catch (err) {
      toast({ type: "error", message: parseApiError(err, "Failed to delete break") });
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
    } catch (err) {
      toast({ type: "error", message: parseApiError(err, "Failed to update break") });
    }
  };

  // 비편집 + 데이터 없음이면 영역 숨김
  if (!editable && sessions.length === 0) return <></>;

  return (
    <div>
      <div className="text-xs text-text-muted mb-2 flex items-center gap-1">
        <Coffee size={12} className="inline" />
        Break Sessions
      </div>

      {sessions.length === 0 && !editable && (
        <div className="text-sm text-text-muted">No break sessions.</div>
      )}

      {!editable ? (
        <ul className="space-y-1.5">
          {sessions.map((br) => {
            const paid = isPaidBreak(br.break_type);
            const typeLabel = breakTypeLabel(br.break_type);
            const accent = paid
              ? "text-[var(--color-success)]"
              : "text-[var(--color-warning)]";
            const dot = paid ? "bg-[var(--color-success)]" : "bg-[var(--color-warning)]";
            const started = formatDateTime(br.started_at, tz);
            const ended = br.ended_at ? formatDateTime(br.ended_at, tz) : "in progress";
            const dur = br.duration_minutes != null ? `${br.duration_minutes} min` : "—";
            return (
              <li key={br.id} className="flex items-center gap-2 text-sm tabular-nums">
                <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />
                <span className="text-text">
                  {started} – {ended}
                </span>
                <span className="text-text-muted">·</span>
                <span className={accent}>{typeLabel}</span>
                <span className="text-text-muted">·</span>
                <span className="text-text-secondary">{dur}</span>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="space-y-2">
          {sessions.map((br) => (
            <BreakSessionRow
              key={br.id}
              session={br}
              onSave={(patch) => handleSessionUpdate(br.id, patch)}
              onDelete={() => handleDelete(br.id)}
              busy={updateBreak.isPending || deleteBreak.isPending}
            />
          ))}
          {showAddForm ? (
            <div className="grid grid-cols-12 gap-2 items-end p-2 rounded-lg bg-surface-hover border border-border">
              <div className="col-span-3">
                <Select
                  label="Type"
                  value={draftType}
                  onChange={(e) =>
                    setDraftType(e.target.value as BreakType)
                  }
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
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={resetAddForm}
                  type="button"
                >
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
      )}
    </div>
  );
}

interface BreakSessionRowProps {
  session: AttendanceBreakItem;
  onSave: (patch: {
    started_at?: string;
    ended_at?: string | null;
    break_type?: BreakType;
  }) => Promise<void>;
  onDelete: () => Promise<void>;
  busy: boolean;
}

function BreakSessionRow({
  session,
  onSave,
  onDelete,
  busy,
}: BreakSessionRowProps): React.ReactElement {
  const [start, setStart] = useState<string>(isoToLocalInput(session.started_at));
  const [end, setEnd] = useState<string>(isoToLocalInput(session.ended_at));
  const [type, setType] = useState<BreakType>(toCanonicalBreakType(session.break_type));

  // 외부에서 session prop 이 바뀌면 (mutation 후 invalidate) 로컬 state 갱신
  useEffect(() => {
    setStart(isoToLocalInput(session.started_at));
    setEnd(isoToLocalInput(session.ended_at));
    setType(toCanonicalBreakType(session.break_type));
  }, [session.started_at, session.ended_at, session.break_type]);

  const dirty =
    start !== isoToLocalInput(session.started_at) ||
    end !== isoToLocalInput(session.ended_at) ||
    type !== toCanonicalBreakType(session.break_type);

  const handleSave = async (): Promise<void> => {
    const startIso = start ? localInputToIso(start) : null;
    if (!startIso) return;
    const endIso = end ? localInputToIso(end) : null;
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
        {dirty && (
          <Button size="sm" onClick={handleSave} isLoading={busy} type="button" aria-label="Save break">
            <Check size={14} />
          </Button>
        )}
      </div>
    </div>
  );
}

