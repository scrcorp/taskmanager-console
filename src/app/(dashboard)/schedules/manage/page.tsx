"use client";

/**
 * 스케줄 관리 페이지 — SV/GM 워크플로우 기반 주간 그리드.
 *
 * 행 = Work Role 또는 Staff, 열 = 일~토.
 * SV가 스케줄을 편성하고 GM이 확인/발행하는 워크플로우.
 * Entry chip 클릭 → 상세 모달 (view/edit/reject 상태 머신).
 *
 * 목업 기반 기능:
 * - Drag & drop (셀 간 이동, date/user/role 변경)
 * - 셀 내 chip status priority 정렬
 * - Entry: solid left-border, Request: dashed left-border
 * - Chip에 시간 + hours 표시
 * - SV/GM 역할 토글
 * - Detail modal: view/edit/reject 모드
 */

import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  X,
  Edit3,
  RotateCcw,
  Check,
  Send,
  Settings,
  Lock,
  Unlock,
  Trash2,
  AlertTriangle,
} from "lucide-react";
import { useStores } from "@/hooks/useStores";
import { useWorkRoles } from "@/hooks/useWorkRoles";
import { useUsers } from "@/hooks/useUsers";
import { useSchedules, useCreateSchedule, useUpdateSchedule, useDeleteSchedule } from "@/hooks/useSchedules";
import {
  useScheduleRequests,
  useAdminCreateRequest,
  useAdminUpdateRequest,
  useUpdateRequestStatus,
  useRevertRequest,
  useDeleteRequest,
  useConfirmRequests,
  useConfirmPreview,
} from "@/hooks/useScheduleRequests";
import { usePermissions } from "@/hooks/usePermissions";
import { Card, Badge, Modal, Select, Button } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { cn, parseApiError, getWorkDate } from "@/lib/utils";
import { useTimezone } from "@/hooks/useTimezone";
import { useSchedulePeriods, useCreateSchedulePeriod, useTransitionPeriod } from "@/hooks/useSchedulePeriods";
import type { Store, User, WorkRole, Schedule, ScheduleRequestItem, SchedulePeriod, ScheduleConfirmPreview } from "@/types";

// ─── Types ──────────────────────────────────────────

type ViewMode = "role" | "staff";

/** Unified item for grid display — either a schedule entry or a staff request */
interface GridItem {
  id: string;
  kind: "entry" | "request";
  user_id: string;
  work_role_id: string | null;
  work_date: string;
  start_time: string;
  end_time: string;
  break_start_time: string | null;
  break_end_time: string | null;
  status: string;
  note: string | null;
  entry?: Schedule;
  request?: ScheduleRequestItem;
  // Original value tracking (for modified requests)
  original_start_time?: string | null;
  original_end_time?: string | null;
  original_work_role_id?: string | null;
  original_user_id?: string | null;
  original_user_name?: string | null;
  original_work_date?: string | null;
  created_by?: string | null;
  rejection_reason?: string | null;
}

// ─── Date helpers ───────────────────────────────────

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function addDays(d: Date, n: number): Date {
  const r = new Date(d); r.setDate(r.getDate() + n); return r;
}
function getWeekStart(d: Date): Date {
  const r = new Date(d); r.setDate(r.getDate() - r.getDay()); r.setHours(0, 0, 0, 0); return r;
}
function getWeekDays(sun: Date): string[] {
  return Array.from({ length: 7 }, (_, i) => toDateStr(addDays(sun, i)));
}
function shortDay(ds: string): string {
  return new Date(ds + "T00:00:00").toLocaleDateString("en-US", { weekday: "short" });
}
function shortDate(ds: string): string {
  const d = new Date(ds + "T00:00:00"); return `${d.getMonth() + 1}/${d.getDate()}`;
}
function weekLabel(days: string[]): string {
  const s = new Date(days[0] + "T00:00:00"), e = new Date(days[6] + "T00:00:00");
  const o: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  return `${s.toLocaleDateString("en-US", o)} – ${e.toLocaleDateString("en-US", { ...o, year: "numeric" })}`;
}
function timeToMin(t: string | null): number {
  if (!t) return 0; const [h, m] = t.split(":").map(Number); return h * 60 + m;
}
function calcHours(e: { start_time: string; end_time: string; break_start_time: string | null; break_end_time: string | null }): number {
  if (!e.start_time || !e.end_time) return 0;
  let startMin = timeToMin(e.start_time);
  let endMin = timeToMin(e.end_time);
  if (endMin <= startMin) endMin += 24 * 60; // overnight shift
  let total = endMin - startMin;
  if (e.break_start_time && e.break_end_time) {
    let bsMin = timeToMin(e.break_start_time);
    let beMin = timeToMin(e.break_end_time);
    if (beMin <= bsMin) beMin += 24 * 60;
    total -= beMin - bsMin;
  }
  return Math.max(0, total / 60);
}

// ─── Grid item converters ───────────────────────────

function toGridItem(e: Schedule): GridItem {
  return {
    id: e.id, kind: "entry", user_id: e.user_id, work_role_id: e.work_role_id,
    work_date: e.work_date, start_time: e.start_time || "", end_time: e.end_time || "",
    break_start_time: e.break_start_time, break_end_time: e.break_end_time,
    status: e.status, note: e.note ?? null, entry: e,
  };
}

function requestToGridItem(r: ScheduleRequestItem): GridItem {
  return {
    id: r.id, kind: "request", user_id: r.user_id, work_role_id: r.work_role_id,
    work_date: r.work_date, start_time: r.preferred_start_time || "",
    end_time: r.preferred_end_time || "",
    break_start_time: r.break_start_time, break_end_time: r.break_end_time,
    status: `req_${r.status}`, note: r.note, request: r,
    original_start_time: r.original_preferred_start_time,
    original_end_time: r.original_preferred_end_time,
    original_work_role_id: r.original_work_role_id,
    original_user_id: r.original_user_id,
    original_user_name: r.original_user_name,
    original_work_date: r.original_work_date,
    created_by: r.created_by,
    rejection_reason: r.rejection_reason,
  };
}



// ─── Status config ──────────────────────────────────

/** Sort priority: lower = higher in cell */
const STATUS_PRIORITY: Record<string, number> = {
  confirmed: 0, approved: 0, cancelled: 6,
  req_accepted: 1,
  req_modified: 3, req_submitted: 4, req_rejected: 5,
};

const STATUS_CONFIG: Record<string, {
  label: string;
  badge: "default" | "accent" | "success" | "warning" | "danger";
  borderColor: string;
  bg: string;
  nameColor: string;
  timeColor: string;
  dashed: boolean;
  faded: boolean;
  strikethrough: boolean;
}> = {
  // Confirmed schedule (solid green)
  confirmed:        { label: "Confirmed", badge: "success", borderColor: "border-l-success", bg: "bg-surface",     nameColor: "text-text",       timeColor: "text-text-secondary", dashed: false, faded: false, strikethrough: false },
  // Cancelled schedule (faded, strikethrough)
  cancelled:        { label: "Cancelled", badge: "danger",  borderColor: "border-l-danger",  bg: "bg-danger/10",   nameColor: "text-danger",     timeColor: "text-text-muted",     dashed: false, faded: true,  strikethrough: true },
  // Legacy: approved (same as confirmed)
  approved:         { label: "Approved",  badge: "success", borderColor: "border-l-success", bg: "bg-surface",     nameColor: "text-text",       timeColor: "text-text-secondary", dashed: false, faded: false, strikethrough: false },
  // Request (dashed) — request=purple, modified=yellow, rejected=red
  req_submitted:    { label: "Request",   badge: "accent",  borderColor: "border-l-accent",  bg: "bg-accent/10",   nameColor: "text-accent",     timeColor: "text-accent-light",   dashed: true,  faded: false, strikethrough: false },
  req_accepted:     { label: "Accepted",  badge: "success", borderColor: "border-l-success", bg: "bg-success/10",  nameColor: "text-success",    timeColor: "text-text-secondary", dashed: true,  faded: false, strikethrough: false },
  req_modified:     { label: "Modified",  badge: "warning", borderColor: "border-l-warning", bg: "bg-warning/10",  nameColor: "text-warning",    timeColor: "text-text-secondary", dashed: true,  faded: false, strikethrough: false },
  req_rejected:     { label: "Rejected",  badge: "danger",  borderColor: "border-l-danger",  bg: "bg-danger/10",   nameColor: "text-danger",     timeColor: "text-text-muted",     dashed: true,  faded: true,  strikethrough: true },
};

function formatTimeRange(item: GridItem): string {
  if (!item.start_time || !item.end_time) return "No time set";
  if (item.break_start_time && item.break_end_time) {
    return `${item.start_time}–${item.break_start_time} / ${item.break_end_time}–${item.end_time}`;
  }
  return `${item.start_time}–${item.end_time}`;
}

function sortGridItems(items: GridItem[]): GridItem[] {
  return [...items].sort((a, b) => (STATUS_PRIORITY[a.status] ?? 9) - (STATUS_PRIORITY[b.status] ?? 9));
}

// ─── Drag & Drop helpers ────────────────────────────

let dragItemId: string | null = null;

// ─── Main Component ─────────────────────────────────

export default function ScheduleManagePage(): React.ReactElement {
  const { toast } = useToast();
  const { priority } = usePermissions();
  const isGMOrAbove = priority <= 20; // GM=20, Owner=10

  // View state
  const [viewMode, setViewMode] = useState<ViewMode>("staff");

  // Store selection
  const { data: stores } = useStores();
  const [storeId, setStoreId] = useState<string>("");
  const effectiveStoreId = storeId || stores?.[0]?.id || "";

  // Resolve "today" based on selected store's day boundary + timezone
  const selectedStore = useMemo(
    () => stores?.find((s) => s.id === effectiveStoreId),
    [stores, effectiveStoreId],
  );
  const effectiveTz = useTimezone(selectedStore?.timezone);
  const todayStr = useMemo(
    () => getWorkDate(selectedStore?.day_start_time, effectiveTz),
    [selectedStore, effectiveTz],
  );

  // Week navigation — default to next week (manage = 다음 주 확정 목적)
  const [weekStart, setWeekStart] = useState<Date>(() => addDays(getWeekStart(new Date()), 7));
  const weekDays = useMemo(() => getWeekDays(weekStart), [weekStart]);
  const isFutureWeek = weekDays[0] > todayStr;
  const isPastWeek = weekDays[6] < todayStr;
  const isCurrentWeek = weekDays[0] <= todayStr && weekDays[6] >= todayStr;
  const isLocked = isPastWeek || isCurrentWeek; // 이번 주 이하는 잠금

  // Data
  const { data: workRoles } = useWorkRoles(effectiveStoreId || undefined);
  const { data: usersData } = useUsers({ store_id: effectiveStoreId || undefined, is_active: true });
  const { data: entriesData, isLoading } = useSchedules({
    store_id: effectiveStoreId || undefined,
    date_from: weekDays[0],
    date_to: weekDays[6],
    per_page: 500,
  });
  const { data: requestsData } = useScheduleRequests({
    store_id: effectiveStoreId || undefined,
    date_from: weekDays[0],
    date_to: weekDays[6],
    per_page: 500,
  });
  const activeRoles = useMemo(() => (workRoles ?? []).filter((r) => r.is_active), [workRoles]);
  const entries = useMemo(() => entriesData?.items ?? [], [entriesData]);
  const requests = useMemo(() => requestsData?.items ?? [], [requestsData]);
  const users = useMemo(() => usersData ?? [], [usersData]);

  // Merge entries + requests
  const gridItems = useMemo(() => {
    const entryItems = entries.map(toGridItem);
    const linkedRequestIds = new Set(entries.filter((e) => e.request_id).map((e) => e.request_id));
    const requestItems = requests.filter((r) => !linkedRequestIds.has(r.id)).map(requestToGridItem);
    return [...entryItems, ...requestItems];
  }, [entries, requests]);

  // Period — 주간 상태 추적 (sv_draft → gm_review → finalized)
  const { data: periodsData } = useSchedulePeriods({
    store_id: effectiveStoreId || undefined,
    per_page: 100,
  });
  const createPeriod = useCreateSchedulePeriod();
  const transitionPeriod = useTransitionPeriod();

  // 현재 주에 해당하는 period 찾기
  const currentPeriod = useMemo<SchedulePeriod | null>(() => {
    if (!periodsData?.items) return null;
    return periodsData.items.find(
      (p) => p.store_id === effectiveStoreId && p.period_start <= weekDays[0] && p.period_end >= weekDays[6],
    ) ?? null;
  }, [periodsData, effectiveStoreId, weekDays]);

  const periodStatus = currentPeriod?.status ?? null;

  // 자동 period 생성 (SV가 처음 열 때, period 없으면 sv_draft로 생성)
  const autoCreatedRef = useRef<string>("");
  useEffect(() => {
    if (!effectiveStoreId || isLocked || currentPeriod || createPeriod.isPending) return;
    const key = `${effectiveStoreId}_${weekDays[0]}`;
    if (autoCreatedRef.current === key) return;
    autoCreatedRef.current = key;
    // S3: request_deadline 기본값 = 주 시작 2일 전
    const periodStartDate = new Date(weekDays[0] + "T00:00:00");
    const deadlineDate = new Date(periodStartDate);
    deadlineDate.setDate(deadlineDate.getDate() - 2);
    const requestDeadline = toDateStr(deadlineDate);
    createPeriod.mutate({
      store_id: effectiveStoreId,
      period_start: weekDays[0],
      period_end: weekDays[6],
      request_deadline: requestDeadline,
    });
  }, [effectiveStoreId, weekDays, isLocked, currentPeriod, createPeriod]);

  // Mutations — all request-based pre-confirm
  const adminCreateRequest = useAdminCreateRequest();
  const adminUpdateRequest = useAdminUpdateRequest();
  const updateRequestStatus = useUpdateRequestStatus();
  const revertRequest = useRevertRequest();
  const deleteRequest = useDeleteRequest();
  const confirmRequests = useConfirmRequests();
  const confirmPreview = useConfirmPreview();
  const createSchedule = useCreateSchedule();
  const updateSchedule = useUpdateSchedule();
  const deleteSchedule = useDeleteSchedule();

  // GM+ edit mode for confirmed/locked weeks
  const [editMode, setEditMode] = useState(false);
  // Reset edit mode on week change
  useEffect(() => { setEditMode(false); }, [weekStart]);

  // Modals
  const [assignModal, setAssignModal] = useState<{ open: boolean; date: string; role?: WorkRole; userId?: string }>({ open: false, date: "" });
  const [detailModal, setDetailModal] = useState<{ open: boolean; item: GridItem | null; mode: "view" | "edit" | "reject" }>({ open: false, item: null, mode: "view" });
  const [confirmPreviewModal, setConfirmPreviewModal] = useState<{ open: boolean; preview: ScheduleConfirmPreview | null }>({ open: false, preview: null });
  const [confirmErrorsModal, setConfirmErrorsModal] = useState<{ open: boolean; errors: string[] }>({ open: false, errors: [] });

  // ─── Helpers ────────────────────────────────────
  const getUserName = useCallback((uid: string) => users.find((u) => u.id === uid)?.full_name || "?", [users]);
  const getRoleName = useCallback((wrId: string | null) => {
    if (!wrId) return "—";
    const r = activeRoles.find((wr) => wr.id === wrId);
    return r ? `${r.shift_name} · ${r.position_name}` : "—";
  }, [activeRoles]);

  // ─── Week Nav ─────────────────────────────────
  const defaultWeekStart = useMemo(() => addDays(getWeekStart(new Date()), 7), []);
  const isAtDefaultWeek = toDateStr(weekStart) === toDateStr(defaultWeekStart);
  const goPrev = useCallback(() => setWeekStart((d) => addDays(d, -7)), []);
  const goNext = useCallback(() => setWeekStart((d) => addDays(d, 7)), []);
  const goDefaultWeek = useCallback(() => setWeekStart(defaultWeekStart), [defaultWeekStart]);

  // ─── Add Entry Modal ─────────────────────────
  const openAssign = useCallback((date: string, role?: WorkRole, userId?: string) => {
    setAssignModal({ open: true, date, role, userId });
  }, []);

  const handleAddRequest = useCallback(async (data: { userId: string; workRoleId: string; startTime: string; endTime: string; breakStartTime?: string; breakEndTime?: string }) => {
    try {
      if (editMode) {
        // Edit mode: 스케줄 직접 생성 (confirmed)
        await createSchedule.mutateAsync({
          store_id: effectiveStoreId,
          user_id: data.userId,
          work_role_id: data.workRoleId || undefined,
          work_date: assignModal.date,
          start_time: data.startTime,
          end_time: data.endTime,
          break_start_time: data.breakStartTime,
          break_end_time: data.breakEndTime,
        });
        setAssignModal({ open: false, date: "" });
        toast({ type: "success", message: "Schedule added" });
      } else {
        await adminCreateRequest.mutateAsync({
          store_id: effectiveStoreId,
          user_id: data.userId,
          work_role_id: data.workRoleId || undefined,
          work_date: assignModal.date,
          preferred_start_time: data.startTime,
          preferred_end_time: data.endTime,
          break_start_time: data.breakStartTime,
          break_end_time: data.breakEndTime,
        });
        setAssignModal({ open: false, date: "" });
        toast({ type: "success", message: "Request added" });
      }
    } catch (err) {
      toast({ type: "error", message: parseApiError(err, "Operation failed") });
    }
  }, [editMode, adminCreateRequest, createSchedule, effectiveStoreId, assignModal.date, currentPeriod, toast]);

  // ─── Detail Modal ─────────────────────────────
  const openDetail = useCallback((item: GridItem) => {
    setDetailModal({ open: true, item, mode: "view" });
  }, []);

  const closeDetail = useCallback(() => {
    setDetailModal({ open: false, item: null, mode: "view" });
  }, []);

  // ─── Drag & Drop handler — requests in-place, entries in editMode ──
  const handleDrop = useCallback(async (itemId: string, newDate: string, newTargetId: string, targetType: "user" | "role") => {
    const item = gridItems.find((g) => g.id === itemId);
    if (!item) return;

    if (item.kind === "entry") {
      // W3: editMode에서 entry 드래그 지원
      if (!editMode) return;
      const updates: Record<string, string> = {};
      if (item.work_date !== newDate) updates.work_date = newDate;
      if (targetType === "user" && item.user_id !== newTargetId) updates.user_id = newTargetId;
      if (targetType === "role" && item.work_role_id !== newTargetId) updates.work_role_id = newTargetId;
      if (Object.keys(updates).length === 0) return;
      try {
        await updateSchedule.mutateAsync({ id: item.id, data: updates });
        toast({ type: "success", message: "Schedule moved" });
      } catch (err) {
        toast({ type: "error", message: parseApiError(err, "Move failed") });
      }
      return;
    }

    const updates: Record<string, string> = {};
    if (item.work_date !== newDate) updates.work_date = newDate;
    if (targetType === "user" && item.user_id !== newTargetId) updates.user_id = newTargetId;
    if (targetType === "role" && item.work_role_id !== newTargetId) updates.work_role_id = newTargetId;
    if (Object.keys(updates).length === 0) return;

    try {
      await adminUpdateRequest.mutateAsync({ id: item.id, data: updates });
      toast({ type: "success", message: "Request modified" });
    } catch (err) {
      toast({ type: "error", message: parseApiError(err, "Move failed") });
    }
  }, [gridItems, editMode, adminUpdateRequest, updateSchedule, toast]);

  // ─── Close Requests (open → sv_draft) ──────────
  const handleCloseRequests = useCallback(async () => {
    if (!currentPeriod) return;
    try {
      let p = currentPeriod;
      if (p.status === "open") {
        await transitionPeriod.mutateAsync({ id: p.id, action: "close-requests" });
        p = { ...p, status: "closed" };
      }
      if (p.status === "closed") {
        await transitionPeriod.mutateAsync({ id: p.id, action: "start-draft" });
      }
      toast({ type: "success", message: "Request submission closed" });
    } catch (err) {
      toast({ type: "error", message: parseApiError(err, "Close failed") });
    }
  }, [currentPeriod, transitionPeriod, toast]);

  // ─── Reopen Requests (sv_draft/closed → open) ──
  const handleReopenRequests = useCallback(async () => {
    if (!currentPeriod) return;
    try {
      await transitionPeriod.mutateAsync({ id: currentPeriod.id, action: "reopen" });
      toast({ type: "success", message: "Requests reopened" });
    } catch (err) {
      toast({ type: "error", message: parseApiError(err, "Reopen failed") });
    }
  }, [currentPeriod, transitionPeriod, toast]);

  // ─── Submit to GM (SV → gm_review) ─────────────
  const handleSubmitToGM = useCallback(async () => {
    if (!currentPeriod) return;
    try {
      // period가 sv_draft이면 submit-review로 전환
      if (currentPeriod.status === "sv_draft" || currentPeriod.status === "open" || currentPeriod.status === "closed") {
        // open/closed → sv_draft → gm_review 순서 필요시 중간 단계 진행
        let periodToTransition = currentPeriod;
        if (periodToTransition.status === "open") {
          await transitionPeriod.mutateAsync({ id: periodToTransition.id, action: "close-requests" });
          periodToTransition = { ...periodToTransition, status: "closed" };
        }
        if (periodToTransition.status === "closed") {
          await transitionPeriod.mutateAsync({ id: periodToTransition.id, action: "start-draft" });
          periodToTransition = { ...periodToTransition, status: "sv_draft" };
        }
        await transitionPeriod.mutateAsync({ id: periodToTransition.id, action: "submit-review" });
      }
      toast({ type: "success", message: "Schedule submitted to GM for review" });
    } catch (err) {
      toast({ type: "error", message: parseApiError(err, "Submit failed") });
    }
  }, [currentPeriod, transitionPeriod, toast]);

  // ─── Confirm (실제 실행) ───────────────────────
  const doConfirm = useCallback(async () => {
    if (!effectiveStoreId) return;
    try {
      const result = await confirmRequests.mutateAsync({
        store_id: effectiveStoreId,
        date_from: weekDays[0],
        date_to: weekDays[6],
      });
      // period를 finalized로 전환
      if (currentPeriod && currentPeriod.status !== "finalized") {
        try {
          let p = currentPeriod;
          if (p.status === "open") {
            await transitionPeriod.mutateAsync({ id: p.id, action: "close-requests" });
            p = { ...p, status: "closed" };
          }
          if (p.status === "closed") {
            await transitionPeriod.mutateAsync({ id: p.id, action: "start-draft" });
            p = { ...p, status: "sv_draft" };
          }
          if (p.status === "sv_draft") {
            await transitionPeriod.mutateAsync({ id: p.id, action: "submit-review" });
            p = { ...p, status: "gm_review" };
          }
          if (p.status === "gm_review") {
            await transitionPeriod.mutateAsync({ id: p.id, action: "finalize" });
          }
        } catch (e) {
          // W5: period 전환 실패 시 toast로 알림 (confirm 자체는 성공)
          const msg = e instanceof Error ? e.message : "Unknown error";
          toast({ type: "error", message: `Period 전환 실패: ${msg}` });
        }
      }
      // C2: errors 배열 있으면 다이얼로그로 상세 표시
      if (result.errors.length > 0) {
        setConfirmErrorsModal({ open: true, errors: result.errors });
      } else {
        const msg = [`${result.entries_created} entries confirmed`];
        if (result.requests_rejected) msg.push(`${result.requests_rejected} rejected`);
        toast({ type: "success", message: msg.join(", ") });
      }
    } catch (err) {
      toast({ type: "error", message: parseApiError(err, "Confirm failed") });
    }
  }, [effectiveStoreId, weekDays, confirmRequests, currentPeriod, transitionPeriod, toast]);

  // ─── Confirm: Preview → Confirm flow (S1/S2) ──
  const handleConfirm = useCallback(async () => {
    if (!effectiveStoreId) return;
    try {
      const preview = await confirmPreview.mutateAsync({
        store_id: effectiveStoreId,
        date_from: weekDays[0],
        date_to: weekDays[6],
      });
      setConfirmPreviewModal({ open: true, preview });
    } catch {
      // preview 엔드포인트 없을 수 있음 — 바로 confirm 실행
      doConfirm();
    }
  }, [effectiveStoreId, weekDays, confirmPreview, doConfirm]);

  // ─── Workflow status ──────────────────────────
  const isConfirmed = useMemo(() => entries.some((e) => e.status === "confirmed"), [entries]);
  const isSubmittedToGM = periodStatus === "gm_review" || periodStatus === "finalized";

  const workflowStep = useMemo(() => {
    if (isLocked) return 4;
    if (isConfirmed || periodStatus === "finalized") return 4;
    if (isSubmittedToGM) return 3;
    if (periodStatus === "sv_draft" || periodStatus === "closed") return 2;
    const hasModified = requests.some((r) => r.status === "modified");
    if (hasModified) return 2;
    return 1;
  }, [isLocked, isConfirmed, isSubmittedToGM, periodStatus, requests]);

  // canEdit: published/잠금 주는 기본 불가, GM+는 editMode로 진입 가능
  const canEdit = useMemo(() => {
    // GM+ edit mode: 잠금/확정 주에서도 편집 가능
    if (editMode && isGMOrAbove) return true;
    if (isLocked) return false;
    // Published(finalized/confirmed) → view only, Edit 버튼으로 진입 필요
    if (periodStatus === "finalized" || isConfirmed) return false;
    if (isGMOrAbove) {
      // GM: close 이후(sv_draft/gm_review)에서 편집
      return periodStatus !== "open";
    }
    // SV: sv_draft 상태에서만 편집, submit 전이고 confirm 전에만
    return periodStatus === "sv_draft" && !isSubmittedToGM && !isConfirmed;
  }, [editMode, isLocked, isGMOrAbove, periodStatus, isSubmittedToGM, isConfirmed]);

  // ─── Render ───────────────────────────────────
  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-extrabold text-text">Manage Schedules</h1>
          <p className="text-sm text-text-muted mt-0.5 flex items-center gap-2">
            {isLocked ? <Badge variant="default">{isPastWeek ? "Past" : "Current Week"}</Badge>
              : periodStatus === "finalized" || isConfirmed ? <Badge variant="success">Published</Badge>
              : periodStatus === "gm_review" ? <Badge variant="accent">GM Review</Badge>
              : periodStatus === "sv_draft" ? <Badge variant="warning">SV Editing</Badge>
              : periodStatus === "closed" ? <Badge variant="warning">Requests Closed</Badge>
              : <Badge variant="success">Accepting Requests</Badge>}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {effectiveStoreId && (
            <Link href={`/stores/${effectiveStoreId}/work-roles`}
              className="text-xs font-semibold text-accent hover:text-accent-light transition-colors flex items-center gap-1">
              <Settings size={13} /> Work Roles →
            </Link>
          )}
          {/* View toggle */}
          <div className="flex bg-surface rounded-lg p-0.5">
            {([
              { key: "staff" as ViewMode, label: "By Staff" },
              { key: "role" as ViewMode, label: "By Role" },
            ]).map((v) => (
              <button key={v.key} onClick={() => setViewMode(v.key)}
                className={cn("px-3 py-1 rounded-md text-xs font-medium transition-colors",
                  viewMode === v.key ? "bg-accent text-white" : "text-text-secondary hover:text-text")}>
                {v.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Store Tabs */}
      <div className="flex gap-1 overflow-x-auto mb-4">
        {(stores ?? []).map((s: Store) => (
          <button key={s.id} onClick={() => setStoreId(s.id)}
            className={cn("px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors",
              s.id === effectiveStoreId ? "bg-accent text-white" : "bg-surface text-text-secondary hover:text-text hover:bg-surface-hover")}>
            {s.name}
          </button>
        ))}
      </div>

      {/* Workflow Bar */}
      <Card className="mb-4" padding="p-3">
        <div className="flex items-center gap-4">
          {[
            { step: 1, label: "Accepting Requests" },
            { step: 2, label: "SV Editing" },
            { step: 3, label: "GM Review" },
            { step: 4, label: "Published" },
          ].map((s, i) => (
            <React.Fragment key={s.step}>
              {i > 0 && <div className={cn("flex-1 h-px", workflowStep >= s.step ? "bg-accent" : "bg-border")} />}
              <div className="flex items-center gap-2">
                <div className={cn("w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold",
                  workflowStep > s.step ? "bg-accent text-white"
                    : workflowStep === s.step ? "bg-accent/20 text-accent ring-2 ring-accent"
                    : "bg-surface text-text-muted")}>
                  {workflowStep > s.step ? <Check size={12} /> : s.step}
                </div>
                <span className={cn("text-xs font-medium", workflowStep >= s.step ? "text-text" : "text-text-muted")}>
                  {s.label}
                </span>
              </div>
            </React.Fragment>
          ))}
        </div>
      </Card>

      {/* Week Navigation + Bulk Actions */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <button onClick={goPrev} className="p-1.5 rounded-lg text-text-secondary hover:text-text hover:bg-surface-hover transition-colors">
            <ChevronLeft size={18} />
          </button>
          <span className="text-sm font-semibold text-text min-w-[200px] text-center">{weekLabel(weekDays)}</span>
          <button onClick={goNext} className="p-1.5 rounded-lg text-text-secondary hover:text-text hover:bg-surface-hover transition-colors">
            <ChevronRight size={18} />
          </button>
          {!isAtDefaultWeek && (
            <button onClick={goDefaultWeek} className="p-1.5 rounded-lg text-text-secondary hover:text-accent hover:bg-surface-hover transition-colors" title="Back to next week">
              <RotateCcw size={15} />
            </button>
          )}
        </div>
        {/* Bulk Actions */}
        <div className="flex items-center gap-2">
          {/* C3: finalized 또는 isConfirmed이면 Published 표시 */}
          {isLocked || isConfirmed || periodStatus === "finalized" ? (
            isGMOrAbove ? (
              editMode ? (
                <Button variant="secondary" size="sm" onClick={() => setEditMode(false)}>
                  <X size={14} /> Exit Edit Mode
                </Button>
              ) : (
                <>
                  <span className="text-xs text-success font-semibold flex items-center gap-1">
                    <Check size={14} /> Published
                  </span>
                  <Button variant="ghost" size="sm" onClick={() => setEditMode(true)}>
                    <Edit3 size={14} /> Edit
                  </Button>
                </>
              )
            ) : (
              <span className="text-xs text-success font-semibold flex items-center gap-1">
                <Check size={14} /> Published
              </span>
            )
          ) : isGMOrAbove ? (
            <>
              {periodStatus === "open" && (
                <Button variant="ghost" size="sm" onClick={handleCloseRequests}
                  disabled={transitionPeriod.isPending}>
                  <Lock size={14} /> {transitionPeriod.isPending ? "Closing..." : "Close Requests"}
                </Button>
              )}
              {(periodStatus === "sv_draft" || periodStatus === "closed") && (
                <Button variant="ghost" size="sm" onClick={handleReopenRequests}
                  disabled={transitionPeriod.isPending}>
                  <Unlock size={14} /> {transitionPeriod.isPending ? "Reopening..." : "Reopen Requests"}
                </Button>
              )}
              {/* C3: finalized/isConfirmed 아닐 때만 표시 */}
              {periodStatus !== "open" && (
                <Button variant="primary" size="sm" onClick={handleConfirm}
                  disabled={confirmRequests.isPending || confirmPreview.isPending}>
                  <Check size={14} /> {(confirmRequests.isPending || confirmPreview.isPending) ? "Loading..." : "Confirm & Publish"}
                </Button>
              )}
            </>
          ) : (
            // SV 버튼 (W4: periodStatus별 분기)
            <>
              {/* gm_review 또는 finalized: 대기 메시지만 */}
              {(periodStatus === "gm_review") && (
                <span className="text-xs text-accent font-semibold flex items-center gap-1">
                  <Send size={14} /> Submitted — Waiting for GM
                </span>
              )}
              {/* sv_draft 이하에서만 버튼 표시 */}
              {(periodStatus === "open" || periodStatus === "sv_draft" || periodStatus === "closed" || !periodStatus) && (
                <>
                  {periodStatus === "open" && (
                    <Button variant="ghost" size="sm" onClick={handleCloseRequests}
                      disabled={transitionPeriod.isPending}>
                      <Lock size={14} /> {transitionPeriod.isPending ? "Closing..." : "Close Requests"}
                    </Button>
                  )}
                  {(periodStatus === "sv_draft" || periodStatus === "closed") && (
                    <Button variant="ghost" size="sm" onClick={handleReopenRequests}
                      disabled={transitionPeriod.isPending}>
                      <Unlock size={14} /> {transitionPeriod.isPending ? "Reopening..." : "Reopen Requests"}
                    </Button>
                  )}
                  {/* W4: sv_draft 상태일 때만 Submit to GM */}
                  {(periodStatus === "sv_draft") && (
                    <Button variant="primary" size="sm" onClick={handleSubmitToGM}
                      disabled={transitionPeriod.isPending}>
                      <Send size={14} /> {transitionPeriod.isPending ? "Submitting..." : "Submit to GM"}
                    </Button>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* Legend — solid = confirmed, dashed = request */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 mb-3">
        {/* Confirmed (solid) */}
        <div className="flex items-center gap-1.5 text-xs text-text-muted">
          <div className="w-4 h-3 rounded-sm border border-border border-l-[3px] border-l-success bg-surface" />
          Confirmed
        </div>
        <div className="flex items-center gap-1.5 text-xs text-text-muted">
          <div className="w-4 h-3 rounded-sm border border-border border-l-[3px] border-l-warning bg-surface" />
          Modified
        </div>
        <div className="flex items-center gap-1.5 text-xs text-text-muted">
          <div className="w-4 h-3 rounded-sm border border-border border-l-[3px] border-l-danger bg-surface opacity-50" />
          Rejected
        </div>
        <span className="text-border">|</span>
        {/* Request (dashed) */}
        <div className="flex items-center gap-1.5 text-xs text-text-muted">
          <div className="w-4 h-3 rounded-sm border-[1.5px] border-dashed border-accent bg-accent/10" />
          Request
        </div>
        <div className="flex items-center gap-1.5 text-xs text-text-muted">
          <div className="w-4 h-3 rounded-sm border-[1.5px] border-dashed border-warning bg-warning/10" />
          Modified
        </div>
        <div className="flex items-center gap-1.5 text-xs text-text-muted">
          <div className="w-4 h-3 rounded-sm border-[1.5px] border-dashed border-danger bg-danger/10 opacity-50" />
          Rejected
        </div>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="text-center py-20 text-text-muted">Loading...</div>
      ) : viewMode === "role" ? (
        <RoleGrid
          roles={activeRoles} items={gridItems} weekDays={weekDays} todayStr={todayStr}
          canEdit={canEdit} onChipClick={openDetail} onAddClick={openAssign}
          getUserName={getUserName} onDrop={handleDrop}
        />
      ) : (
        <StaffGrid
          users={users} items={gridItems} weekDays={weekDays} todayStr={todayStr}
          storeId={effectiveStoreId} canEdit={canEdit} onChipClick={openDetail}
          onAddClick={openAssign} getRoleName={getRoleName} onDrop={handleDrop}
        />
      )}

      {/* Add Request Modal */}
      <AddRequestModal
        open={assignModal.open} date={assignModal.date} role={assignModal.role}
        userId={assignModal.userId} roles={activeRoles} users={users}
        isLoading={editMode ? createSchedule.isPending : adminCreateRequest.isPending}
        onAdd={handleAddRequest}
        onClose={() => setAssignModal({ open: false, date: "" })}
        editMode={editMode}
      />

      {/* Detail Modal — request-based editing */}
      {detailModal.item && (
        <DetailModal
          open={detailModal.open}
          item={detailModal.item}
          users={users}
          roles={activeRoles}
          canEdit={canEdit}
          isGMOrAbove={isGMOrAbove}
          onClose={closeDetail}
          getUserName={getUserName}
          getRoleName={getRoleName}
          onUpdateRequest={async (id, data) => {
            try {
              const updated = await adminUpdateRequest.mutateAsync({ id, data });
              setDetailModal({ open: true, item: requestToGridItem(updated), mode: "view" });
              toast({ type: "success", message: "Request updated" });
            } catch (err) {
              toast({ type: "error", message: parseApiError(err, "Operation failed") });
            }
          }}
          onRejectRequest={async (id, reason) => {
            try {
              const updated = await updateRequestStatus.mutateAsync({ id, status: "rejected", rejection_reason: reason || null });
              setDetailModal({ open: true, item: requestToGridItem(updated), mode: "view" });
              toast({ type: "success", message: "Request rejected" });
            } catch (err) {
              toast({ type: "error", message: parseApiError(err, "Operation failed") });
            }
          }}
          onRevertRequest={async (id) => {
            try {
              const updated = await revertRequest.mutateAsync(id);
              setDetailModal({ open: true, item: requestToGridItem(updated), mode: "view" });
              toast({ type: "success", message: "Request reverted" });
            } catch (err) {
              toast({ type: "error", message: parseApiError(err, "Operation failed") });
            }
          }}
          onDeleteRequest={async (id) => {
            try {
              await deleteRequest.mutateAsync(id);
              closeDetail();
              toast({ type: "success", message: "Request deleted" });
            } catch (err) {
              toast({ type: "error", message: parseApiError(err, "Operation failed") });
            }
          }}
          onDeleteSchedule={async (id) => {
            try {
              await deleteSchedule.mutateAsync(id);
              closeDetail();
              toast({ type: "success", message: "Schedule deleted" });
            } catch (err) {
              toast({ type: "error", message: parseApiError(err, "Operation failed") });
            }
          }}
          editMode={editMode}
          isUpdating={adminUpdateRequest.isPending}
          isDeleting={deleteRequest.isPending || deleteSchedule.isPending}
        />
      )}

      {/* S1/S2: Confirm Preview Dialog */}
      {confirmPreviewModal.open && confirmPreviewModal.preview && (
        <Modal isOpen={confirmPreviewModal.open} onClose={() => setConfirmPreviewModal({ open: false, preview: null })}
          title="Confirm & Publish — Preview">
          <div className="space-y-4">
            <div className="flex gap-4">
              <div className="flex-1 bg-success/10 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-success">{confirmPreviewModal.preview.will_confirm}</div>
                <div className="text-xs text-text-muted mt-1">Will be confirmed</div>
              </div>
              <div className="flex-1 bg-warning/10 rounded-lg p-3 text-center">
                <div className="text-2xl font-bold text-warning">{confirmPreviewModal.preview.will_skip_rejected}</div>
                <div className="text-xs text-text-muted mt-1">Skipped (rejected)</div>
              </div>
              {confirmPreviewModal.preview.will_fail.length > 0 && (
                <div className="flex-1 bg-danger/10 rounded-lg p-3 text-center">
                  <div className="text-2xl font-bold text-danger">{confirmPreviewModal.preview.will_fail.length}</div>
                  <div className="text-xs text-text-muted mt-1">Will fail</div>
                </div>
              )}
            </div>
            {/* S2: will_confirm === 0 경고 */}
            {confirmPreviewModal.preview.will_confirm === 0 && (
              <div className="flex items-start gap-2 bg-warning/10 border border-warning/30 rounded-lg p-3">
                <AlertTriangle size={16} className="text-warning mt-0.5 shrink-0" />
                <p className="text-sm text-warning">확정할 요청이 없습니다. 빈 주를 확정하시겠습니까?</p>
              </div>
            )}
            {confirmPreviewModal.preview.will_fail.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-text-muted uppercase mb-2">실패 예상 항목</p>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {confirmPreviewModal.preview.will_fail.map((f) => (
                    <div key={f.request_id} className="text-xs bg-danger/5 border border-danger/20 rounded px-2 py-1.5">
                      <span className="font-medium text-text">{f.user_name ?? "-"}</span>
                      <span className="text-text-muted"> · {f.work_date}</span>
                      <span className="text-danger"> — {f.reason}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button variant="ghost" size="sm" onClick={() => setConfirmPreviewModal({ open: false, preview: null })}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" onClick={() => { setConfirmPreviewModal({ open: false, preview: null }); doConfirm(); }}
                disabled={confirmRequests.isPending}>
                <Check size={14} /> {confirmRequests.isPending ? "Confirming..." : "Confirm & Publish"}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* C2: Confirm Errors Dialog */}
      {confirmErrorsModal.open && (
        <Modal isOpen={confirmErrorsModal.open} onClose={() => setConfirmErrorsModal({ open: false, errors: [] })}
          title="Confirm 결과 — 일부 실패">
          <div className="space-y-3">
            <div className="flex items-start gap-2 bg-warning/10 border border-warning/30 rounded-lg p-3">
              <AlertTriangle size={16} className="text-warning mt-0.5 shrink-0" />
              <p className="text-sm text-text">일부 요청이 처리되지 않았습니다.</p>
            </div>
            <div className="space-y-1 max-h-60 overflow-y-auto">
              {confirmErrorsModal.errors.map((e, i) => (
                <div key={i} className="text-xs bg-danger/5 border border-danger/20 rounded px-2 py-1.5 text-danger">
                  {e}
                </div>
              ))}
            </div>
            <div className="flex justify-end pt-2 border-t border-border">
              <Button variant="primary" size="sm" onClick={() => setConfirmErrorsModal({ open: false, errors: [] })}>
                확인
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Entry Chip ─────────────────────────────────────

function EntryChip({ item, label, onClick, canDrag }: {
  item: GridItem; label: string; onClick: () => void; canDrag: boolean;
}) {
  const cfg = STATUS_CONFIG[item.status] || STATUS_CONFIG.confirmed;
  const hours = calcHours(item);
  const hasTime = item.start_time && item.end_time;
  const wasDragging = useRef(false);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => { if (!wasDragging.current) onClick(); wasDragging.current = false; }}
      onKeyDown={(e) => { if (e.key === "Enter") onClick(); }}
      draggable={canDrag}
      onDragStart={(e) => {
        wasDragging.current = true;
        dragItemId = item.id;
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", item.id);
        requestAnimationFrame(() => {
          (e.target as HTMLElement).style.opacity = "0.4";
        });
      }}
      onDragEnd={(e) => {
        dragItemId = null;
        (e.target as HTMLElement).style.opacity = "1";
        // Reset after a tick so onClick doesn't fire
        setTimeout(() => { wasDragging.current = false; }, 0);
      }}
      className={cn(
        "w-full text-left py-1 px-2 rounded-md border border-border transition-all hover:shadow-sm select-none",
        "border-l-[3px]", cfg.borderColor, cfg.bg,
        cfg.dashed && "border-dashed border-l-[3px]",
        cfg.faded && "opacity-50",
        canDrag && "cursor-grab active:cursor-grabbing",
      )}
    >
      <div className={cn("text-xs font-bold truncate leading-tight", cfg.nameColor, cfg.strikethrough && "line-through")}>
        {label}
      </div>
      {hasTime ? (
        <div className={cn("text-[10px] leading-tight mt-0.5 space-y-px", cfg.timeColor)}>
          {item.break_start_time && item.break_end_time ? (
            <>
              <div>{item.start_time}–{item.break_start_time}</div>
              <div>{item.break_end_time}–{item.end_time}</div>
            </>
          ) : (
            <div>{item.start_time}–{item.end_time}</div>
          )}
          <div className="text-text-muted">{hours.toFixed(1)}h</div>
        </div>
      ) : (
        <div className="text-[10px] leading-tight mt-0.5 text-text-muted">No time set</div>
      )}
    </div>
  );
}

// ─── Drop Zone Cell ─────────────────────────────────

function DropCell({ day, targetId, targetType, todayStr, canEdit, children, onDrop }: {
  day: string; targetId: string; targetType: "user" | "role"; todayStr: string;
  canEdit: boolean; children: React.ReactNode;
  onDrop: (itemId: string, newDate: string, newTargetId: string, targetType: "user" | "role") => void;
}) {
  const [isOver, setIsOver] = useState(false);

  return (
    <td
      className={cn(
        "px-1.5 py-2 align-top border-l border-border min-w-[110px] transition-colors h-full",
        day === todayStr && "bg-accent/5",
        day < todayStr && "opacity-60",
        isOver && "bg-accent/10 ring-1 ring-accent ring-inset",
      )}
      onDragOver={canEdit ? (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; setIsOver(true); } : undefined}
      onDragLeave={() => setIsOver(false)}
      onDrop={canEdit ? (e) => {
        e.preventDefault(); setIsOver(false);
        const id = e.dataTransfer.getData("text/plain");
        if (id) onDrop(id, day, targetId, targetType);
      } : undefined}
    >
      {children}
    </td>
  );
}

// ─── Role Grid ──────────────────────────────────────

function RoleGrid({ roles, items, weekDays, todayStr, canEdit, onChipClick, onAddClick, getUserName, onDrop }: {
  roles: WorkRole[]; items: GridItem[]; weekDays: string[]; todayStr: string;
  canEdit: boolean; onChipClick: (item: GridItem) => void;
  onAddClick: (date: string, role?: WorkRole, userId?: string) => void;
  getUserName: (uid: string) => string;
  onDrop: (itemId: string, newDate: string, targetId: string, type: "user" | "role") => void;
}) {
  if (roles.length === 0) return <div className="text-center py-20 text-text-muted">No work roles configured</div>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse min-w-[800px]">
        <thead>
          <tr>
            <th className="text-left px-3 py-2 text-xs font-semibold text-text-muted uppercase w-48">Work Role</th>
            {weekDays.map((ds) => (
              <th key={ds} className={cn("px-2 py-2 text-center text-xs", ds === todayStr && "bg-accent/5")}>
                <div className="font-semibold text-text-secondary">{shortDay(ds)}</div>
                <div className={cn("text-text-muted", ds === todayStr && "text-accent font-bold")}>{shortDate(ds)}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {roles.map((role) => (
            <tr key={role.id} className="border-t border-border">
              <td className="px-3 py-2 align-top">
                <div className="text-xs font-semibold text-text">{role.shift_name} · {role.position_name}</div>
                <div className="text-[10px] text-text-muted">
                  {role.default_start_time}–{role.default_end_time} · {role.required_headcount}p
                </div>
              </td>
              {weekDays.map((ds) => {
                const cellItems = sortGridItems(items.filter((e) => e.work_date === ds && e.work_role_id === role.id));
                const nonCancelled = cellItems.filter((e) => e.status !== "cancelled" && e.status !== "req_rejected");
                const filled = nonCancelled.length;
                const hc = role.required_headcount;
                const hcCls = filled < hc ? "text-danger" : filled === hc ? "text-success" : "text-warning";

                return (
                  <DropCell key={ds} day={ds} targetId={role.id} targetType="role" todayStr={todayStr} canEdit={canEdit} onDrop={onDrop}>
                    <div className="flex flex-col justify-between h-full min-h-[60px]">
                      <div className="space-y-1">
                        {cellItems.map((item) => (
                          <EntryChip key={item.id} item={item} label={getUserName(item.user_id)}
                            onClick={() => onChipClick(item)} canDrag={canEdit} />
                        ))}
                        {canEdit && (
                          <button onClick={() => onAddClick(ds, role)}
                            className="w-full flex items-center justify-center p-1 rounded border border-dashed border-border text-text-muted hover:text-accent hover:border-accent transition-colors">
                            <Plus size={11} />
                          </button>
                        )}
                      </div>
                      {hc > 0 && (
                        <div className={cn("text-[10px] font-medium text-center mt-1 pt-1 border-t border-border/50", hcCls)}>
                          {filled}/{hc}{filled >= hc && " ✓"}
                        </div>
                      )}
                    </div>
                  </DropCell>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Staff Grid ─────────────────────────────────────

function StaffGrid({ users, items, weekDays, todayStr, storeId, canEdit, onChipClick, onAddClick, getRoleName, onDrop }: {
  users: User[]; items: GridItem[]; weekDays: string[]; todayStr: string;
  storeId: string; canEdit: boolean;
  onChipClick: (item: GridItem) => void;
  onAddClick: (date: string, role?: WorkRole, userId?: string) => void;
  getRoleName: (wrId: string | null) => string;
  onDrop: (itemId: string, newDate: string, targetId: string, type: "user" | "role") => void;
}) {
  const relevantUsers = useMemo(() => {
    const itemUserIds = new Set(items.map((e) => e.user_id));
    return users.filter((u) => u.is_active || itemUserIds.has(u.id));
  }, [users, items]);

  if (relevantUsers.length === 0) return <div className="text-center py-20 text-text-muted">No staff found</div>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse min-w-[800px]">
        <thead>
          <tr>
            <th className="text-left px-3 py-2 text-xs font-semibold text-text-muted uppercase w-40">Staff</th>
            {weekDays.map((ds) => (
              <th key={ds} className={cn("px-2 py-2 text-center text-xs", ds === todayStr && "bg-accent/5")}>
                <div className="font-semibold text-text-secondary">{shortDay(ds)}</div>
                <div className={cn("text-text-muted", ds === todayStr && "text-accent font-bold")}>{shortDate(ds)}</div>
              </th>
            ))}
            <th className="px-2 py-2 text-center text-xs font-semibold text-text-muted uppercase w-16">Hours</th>
          </tr>
        </thead>
        <tbody>
          {relevantUsers.map((user) => {
            const userItems = items.filter((e) => e.user_id === user.id);
            const weekHours = userItems
              .filter((e) => e.status !== "cancelled" && e.status !== "req_rejected")
              .reduce((sum, e) => sum + calcHours(e), 0);

            return (
              <tr key={user.id} className="border-t border-border">
                <td className="px-3 py-2 align-top">
                  <div className="text-xs font-semibold text-text">{user.full_name}</div>
                </td>
                {weekDays.map((ds) => {
                  const cellItems = sortGridItems(userItems.filter((e) => e.work_date === ds));
                  return (
                    <DropCell key={ds} day={ds} targetId={user.id} targetType="user" todayStr={todayStr} canEdit={canEdit} onDrop={onDrop}>
                      <div className="space-y-1">
                        {cellItems.map((item) => (
                          <EntryChip key={item.id} item={item}
                            label={getRoleName(item.work_role_id)}
                            onClick={() => onChipClick(item)} canDrag={canEdit} />
                        ))}
                        {canEdit && (
                          <button onClick={() => onAddClick(ds, undefined, user.id)}
                            className="w-full flex items-center justify-center p-1 rounded border border-dashed border-border text-text-muted hover:text-accent hover:border-accent transition-colors">
                            <Plus size={11} />
                          </button>
                        )}
                      </div>
                    </DropCell>
                  );
                })}
                <td className="px-2 py-2 text-center align-top">
                  <span className="text-sm font-semibold text-text">{weekHours.toFixed(1)}</span>
                  <span className="text-[10px] text-text-muted ml-0.5">hrs</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Add Request Modal ──────────────────────────────

function AddRequestModal({ open, date, role, userId, roles, users, isLoading, onAdd, onClose, editMode = false }: {
  open: boolean; date: string; role?: WorkRole; userId?: string;
  roles: WorkRole[]; users: User[]; isLoading: boolean;
  onAdd: (data: { userId: string; workRoleId: string; startTime: string; endTime: string; breakStartTime?: string; breakEndTime?: string }) => void;
  onClose: () => void;
  editMode?: boolean;
}) {
  const [selectedUser, setSelectedUser] = useState("");
  const [selectedRole, setSelectedRole] = useState("");
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("18:00");
  const [breakStartTime, setBreakStartTime] = useState("");
  const [breakEndTime, setBreakEndTime] = useState("");

  useEffect(() => {
    if (open) {
      setSelectedUser(userId || "");
      setSelectedRole(role?.id || "");
      setStartTime(role?.default_start_time || "09:00");
      setEndTime(role?.default_end_time || "18:00");
      setBreakStartTime("");
      setBreakEndTime("");
    }
  }, [open, role, userId]);

  const handleSubmit = () => {
    const uid = userId || selectedUser;
    const rid = role?.id || selectedRole;
    if (!uid || !rid) return;
    onAdd({ userId: uid, workRoleId: rid, startTime, endTime,
      breakStartTime: breakStartTime || undefined, breakEndTime: breakEndTime || undefined });
  };

  const roleOptions = [{ value: "", label: "Select role" }, ...roles.map((r) => ({ value: r.id, label: `${r.shift_name} · ${r.position_name}` }))];
  const userOptions = [{ value: "", label: "Select employee" }, ...users.filter((u) => u.is_active).map((u) => ({ value: u.id, label: u.full_name }))];

  return (
    <Modal isOpen={open} onClose={onClose} title={editMode ? "Add Schedule" : "Add Request"} size="sm">
      <div className="space-y-4">
        <div className="text-sm text-text-secondary">
          {date && `${shortDate(date)} (${shortDay(date)})`}
          {role && ` · ${role.shift_name} · ${role.position_name}`}
        </div>
        {!role && <Select label="Work Role" options={roleOptions} value={selectedRole}
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
            setSelectedRole(e.target.value);
            const r = roles.find((wr) => wr.id === e.target.value);
            if (r) { setStartTime(r.default_start_time || "09:00"); setEndTime(r.default_end_time || "18:00"); }
          }} />}
        {!userId && <Select label="Employee" options={userOptions} value={selectedUser}
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSelectedUser(e.target.value)} />}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-text-muted font-medium">Start</label>
            <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)}
              className="w-full mt-1 bg-surface border border-border rounded-lg px-3 py-1.5 text-sm text-text" />
          </div>
          <div>
            <label className="text-xs text-text-muted font-medium">End</label>
            <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)}
              className="w-full mt-1 bg-surface border border-border rounded-lg px-3 py-1.5 text-sm text-text" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-text-muted font-medium">Break Start</label>
            <input type="time" value={breakStartTime} onChange={(e) => setBreakStartTime(e.target.value)}
              className="w-full mt-1 bg-surface border border-border rounded-lg px-3 py-1.5 text-sm text-text" />
          </div>
          <div>
            <label className="text-xs text-text-muted font-medium">Break End</label>
            <input type="time" value={breakEndTime} onChange={(e) => setBreakEndTime(e.target.value)}
              className="w-full mt-1 bg-surface border border-border rounded-lg px-3 py-1.5 text-sm text-text" />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button variant="primary" size="sm" onClick={handleSubmit}
            disabled={isLoading || !(userId || selectedUser) || !(role?.id || selectedRole)}>
            {isLoading ? "Adding..." : "Add"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Detail Modal — Request-based editing ───────────

function DetailModal({ open, item, users, roles, canEdit, isGMOrAbove, onClose, getUserName, getRoleName,
  onUpdateRequest, onRejectRequest, onRevertRequest, onDeleteRequest, onDeleteSchedule, editMode, isUpdating, isDeleting }: {
  open: boolean; item: GridItem; users: User[]; roles: WorkRole[];
  canEdit: boolean; isGMOrAbove: boolean;
  onClose: () => void;
  getUserName: (uid: string) => string;
  getRoleName: (wrId: string | null) => string;
  onUpdateRequest: (id: string, data: Record<string, string | null | undefined>) => void;
  onRejectRequest: (id: string, reason?: string) => void;
  onRevertRequest: (id: string) => void;
  onDeleteRequest: (id: string) => void;
  onDeleteSchedule: (id: string) => void;
  editMode: boolean;
  isUpdating: boolean; isDeleting: boolean;
}) {
  const [mode, setMode] = useState<"view" | "edit" | "reject">("view");
  const [editStart, setEditStart] = useState("");
  const [editEnd, setEditEnd] = useState("");
  const [editRoleId, setEditRoleId] = useState("");
  const [editUserId, setEditUserId] = useState("");
  const [editNote, setEditNote] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editBreakStart, setEditBreakStart] = useState("");
  const [editBreakEnd, setEditBreakEnd] = useState("");
  const [rejectReason, setRejectReason] = useState("");

  useEffect(() => {
    if (open && item) {
      setMode("view");
      setEditStart(item.start_time || "");
      setEditEnd(item.end_time || "");
      setEditRoleId(item.work_role_id || "");
      setEditUserId(item.user_id || "");
      setEditNote(item.note || "");
      setEditDate(item.work_date || "");
      setEditBreakStart(item.break_start_time || "");
      setEditBreakEnd(item.break_end_time || "");
      setRejectReason("");
    }
  }, [open, item]);

  const cfg = STATUS_CONFIG[item.status] || STATUS_CONFIG.confirmed;
  const hours = calcHours(item);
  const isRequest = item.kind === "request";
  const isModified = item.status === "req_modified";
  const isRejected = item.status === "req_rejected";
  const isAdminCreated = !!item.created_by;

  // Save handler — admin update request
  const handleSave = () => {
    if (!isRequest) return;
    const data: Record<string, string | null | undefined> = {};
    if (editStart !== item.start_time) data.preferred_start_time = editStart || undefined;
    if (editEnd !== item.end_time) data.preferred_end_time = editEnd || undefined;
    if (editRoleId !== (item.work_role_id || "")) data.work_role_id = editRoleId || undefined;
    if (editUserId !== item.user_id) data.user_id = editUserId || undefined;
    if (editDate !== item.work_date) data.work_date = editDate || undefined;
    if (editNote !== (item.note || "")) data.note = editNote || null;
    if (editBreakStart !== (item.break_start_time || "")) data.break_start_time = editBreakStart || undefined;
    if (editBreakEnd !== (item.break_end_time || "")) data.break_end_time = editBreakEnd || undefined;
    onUpdateRequest(item.id, data);
  };

  const roleOptions = roles.map((r) => ({ value: r.id, label: `${r.shift_name} · ${r.position_name}` }));
  const userOptions = users.filter((u) => u.is_active).map((u) => ({ value: u.id, label: u.full_name }));

  return (
    <Modal isOpen={open} onClose={onClose} title={isRequest ? "Schedule Request" : "Schedule Entry"} size="sm">
      <div className="space-y-4">
        {/* Status + Date */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Badge variant={cfg.badge}>{cfg.label}</Badge>
            {isAdminCreated && <Badge variant="accent">Admin</Badge>}
          </div>
          <span className="text-xs text-text-muted">{shortDate(item.work_date)} ({shortDay(item.work_date)})</span>
        </div>

        {/* Info */}
        <div className="space-y-2">
          <div className="flex justify-between">
            <span className="text-xs text-text-muted">Employee</span>
            <span className="text-sm font-medium text-text">{getUserName(item.user_id)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-xs text-text-muted">Role</span>
            <span className="text-sm text-text">
              {getRoleName(item.work_role_id)}
            </span>
          </div>
        </div>

        {/* Modified change list — mockup style, only show rows where current != original */}
        {isModified && (() => {
          const timeChanged = item.original_start_time && (item.original_start_time !== item.start_time || item.original_end_time !== item.end_time);
          const userChanged = item.original_user_name && item.original_user_id !== item.user_id;
          const roleChanged = item.original_work_role_id && item.original_work_role_id !== item.work_role_id;
          const dateChanged = item.original_work_date && item.original_work_date !== item.work_date;
          if (!timeChanged && !userChanged && !roleChanged && !dateChanged) return null;
          return (
            <div className="bg-warning/10 border border-warning/30 rounded-lg p-3 space-y-2">
              <div className="text-[11px] font-semibold text-warning mb-1">Changes</div>
              {timeChanged && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-text-muted w-16 shrink-0">Time</span>
                  <span className="text-text-secondary">{item.original_start_time}–{item.original_end_time}</span>
                  <span className="text-warning">→</span>
                  <span className="text-text font-medium">{item.start_time}–{item.end_time}</span>
                </div>
              )}
              {userChanged && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-text-muted w-16 shrink-0">Assignee</span>
                  <span className="text-text-secondary">{item.original_user_name ?? "-"}</span>
                  <span className="text-warning">→</span>
                  <span className="text-text font-medium">{getUserName(item.user_id)}</span>
                </div>
              )}
              {roleChanged && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-text-muted w-16 shrink-0">Role</span>
                  <span className="text-text-secondary">{getRoleName(item.original_work_role_id!)}</span>
                  <span className="text-warning">→</span>
                  <span className="text-text font-medium">{getRoleName(item.work_role_id)}</span>
                </div>
              )}
              {dateChanged && (
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-text-muted w-16 shrink-0">Date</span>
                  <span className="text-text-secondary">{shortDate(item.original_work_date!)} ({shortDay(item.original_work_date!)})</span>
                  <span className="text-warning">→</span>
                  <span className="text-text font-medium">{shortDate(item.work_date)} ({shortDay(item.work_date)})</span>
                </div>
              )}
            </div>
          );
        })()}

        {mode === "view" ? (
          <>
            {/* Time display */}
            <div className="bg-surface rounded-lg p-3 space-y-1">
              <div className="flex justify-between">
                <span className="text-xs text-text-muted">Time</span>
                <span className="text-sm font-medium text-text">
                  {item.start_time && item.end_time ? formatTimeRange(item) : "Not set"}
                </span>
              </div>
              {item.break_start_time && item.break_end_time && (
                <div className="flex justify-between">
                  <span className="text-xs text-text-muted">Break</span>
                  <span className="text-sm text-text-secondary">{item.break_start_time} – {item.break_end_time}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-xs text-text-muted">Net Hours</span>
                <span className="text-sm font-semibold text-text">{hours.toFixed(1)}h</span>
              </div>
            </div>

            {item.note && (
              <div className="text-xs text-text-secondary bg-surface rounded-lg p-3">
                <span className="text-text-muted block mb-1">Note</span>{item.note}
              </div>
            )}

            {/* Rejection reason */}
            {isRejected && item.rejection_reason && (
              <div className="text-xs text-danger bg-danger/10 rounded-lg p-3">
                <span className="text-text-muted block mb-1">Rejection Reason</span>{item.rejection_reason}
              </div>
            )}

            {/* Request submitted time */}
            {isRequest && item.request?.submitted_at && (
              <div className="text-[10px] text-text-muted text-right">
                Submitted: {new Date(item.request.submitted_at).toLocaleString()}
              </div>
            )}

            {/* Actions — edit mode: delete schedule entry */}
            {editMode && item.kind === "entry" && (
              <div className="flex justify-end pt-2">
                <Button variant="danger" size="sm" onClick={() => onDeleteSchedule(item.id)} disabled={isDeleting}>
                  <Trash2 size={14} /> {isDeleting ? "Deleting..." : "Delete Schedule"}
                </Button>
              </div>
            )}

            {/* Actions — request editing */}
            {canEdit && isRequest && (
              <div className="flex justify-between pt-2">
                <div className="flex gap-2">
                  {/* Delete admin-created request */}
                  {isAdminCreated && (
                    <Button variant="secondary" size="sm" onClick={() => onDeleteRequest(item.id)} disabled={isDeleting}>
                      {isDeleting ? "..." : "Delete"}
                    </Button>
                  )}
                  {/* Reject request */}
                  {!isRejected && (
                    <Button variant="secondary" size="sm" onClick={() => {
                      setRejectReason(""); setMode("reject");
                    }}>
                      <X size={14} /> Reject
                    </Button>
                  )}
                  {/* Revert modified/rejected */}
                  {(isModified || isRejected) && (
                    <Button variant="secondary" size="sm" onClick={() => onRevertRequest(item.id)}>
                      <RotateCcw size={14} /> Revert
                    </Button>
                  )}
                </div>
                <div className="flex gap-2">
                  {/* Edit request */}
                  {!isRejected && (
                    <Button variant="primary" size="sm" onClick={() => setMode("edit")}>
                      <Edit3 size={14} /> Edit
                    </Button>
                  )}
                </div>
              </div>
            )}
          </>
        ) : mode === "edit" ? (
          <>
            {/* Edit form — modifies request in-place */}
            {isModified && (
              <div className="bg-warning/10 border border-warning/30 rounded-lg p-2 text-xs text-warning">
                This request has been modified. Original values are preserved.
              </div>
            )}
            <div className="space-y-3">
              <Select label="Work Role" options={roleOptions} value={editRoleId}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setEditRoleId(e.target.value)} />
              <Select label="Employee" options={userOptions} value={editUserId}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setEditUserId(e.target.value)} />
              <div>
                <label className="text-xs text-text-muted font-medium">Date</label>
                <input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)}
                  className="w-full mt-1 bg-surface border border-border rounded-lg px-3 py-1.5 text-sm text-text" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-text-muted font-medium">Start</label>
                  <input type="time" value={editStart} onChange={(e) => setEditStart(e.target.value)}
                    className="w-full mt-1 bg-surface border border-border rounded-lg px-3 py-1.5 text-sm text-text" />
                </div>
                <div>
                  <label className="text-xs text-text-muted font-medium">End</label>
                  <input type="time" value={editEnd} onChange={(e) => setEditEnd(e.target.value)}
                    className="w-full mt-1 bg-surface border border-border rounded-lg px-3 py-1.5 text-sm text-text" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-text-muted font-medium">Break Start</label>
                  <input type="time" value={editBreakStart} onChange={(e) => setEditBreakStart(e.target.value)}
                    className="w-full mt-1 bg-surface border border-border rounded-lg px-3 py-1.5 text-sm text-text" />
                </div>
                <div>
                  <label className="text-xs text-text-muted font-medium">Break End</label>
                  <input type="time" value={editBreakEnd} onChange={(e) => setEditBreakEnd(e.target.value)}
                    className="w-full mt-1 bg-surface border border-border rounded-lg px-3 py-1.5 text-sm text-text" />
                </div>
              </div>
              <div>
                <label className="text-xs text-text-muted font-medium">Note</label>
                <textarea value={editNote} onChange={(e) => setEditNote(e.target.value)} rows={2}
                  className="w-full mt-1 bg-surface border border-border rounded-lg px-3 py-1.5 text-sm text-text resize-none" />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" size="sm" onClick={() => setMode("view")}>Cancel</Button>
              <Button variant="primary" size="sm" onClick={handleSave} disabled={isUpdating}>
                {isUpdating ? "Saving..." : "Save"}
              </Button>
            </div>
          </>
        ) : mode === "reject" ? (
          <>
            {/* Reject form */}
            <div className="space-y-3">
              <div className="bg-danger/10 border border-danger/30 rounded-lg p-3">
                <div className="text-xs font-semibold text-danger mb-2">Reject this request?</div>
                <textarea value={rejectReason} onChange={(e) => setRejectReason(e.target.value)}
                  placeholder="Reason (optional)" rows={3}
                  className="w-full bg-surface border border-border rounded-lg px-3 py-1.5 text-sm text-text resize-none" />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" size="sm" onClick={() => setMode("view")}>Cancel</Button>
              <Button variant="primary" size="sm"
                onClick={() => onRejectRequest(item.id, rejectReason || undefined)}>
                <X size={14} /> Reject
              </Button>
            </div>
          </>
        ) : null}
      </div>
    </Modal>
  );
}
