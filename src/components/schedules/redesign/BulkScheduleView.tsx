"use client";

/**
 * BulkScheduleView — 벌크 모드 전용 주간 뷰.
 *
 * Save 전까지 모든 작업(추가/수정/삭제)이 클라이언트 preview.
 * 독립 컴포넌트: 전용 헤더(store radio, week picker, copy), 전용 그리드(sorting/daily 전환 없음),
 * 하단 액션바(Deselect/Undo/Redo/Discard All | Cancel | Save).
 */

import { useState, useMemo, useEffect, useRef } from "react";
import type { Schedule, Store, User, WorkRole } from "@/types";
import { ScheduleBlock } from "./ScheduleBlock";
import { ApplyToSelectedModal, type PreviewEntry } from "./ApplyToSelectedModal";
import { BlockEditModal } from "./BlockEditModal";
import { WeekPickerCalendar, getWeekStart } from "./WeekPickerCalendar";
import { FilterBar, type FilterState } from "./FilterBar";
import { useSchedules, useBulkPreviewSchedules } from "@/hooks/useSchedules";
import { useUsers } from "@/hooks/useUsers";
import { useStores } from "@/hooks/useStores";
import { useWorkRoles } from "@/hooks/useWorkRoles";
import { useToast } from "@/components/ui/Toast";
import { ROLE_PRIORITY } from "@/lib/permissions";

// ─── Helpers ──────────────────────────────────────────

function fmtLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

interface WeekDay { date: string; dayName: string; dayNum: string; isWeekend: boolean; isSunday: boolean; }

function buildWeekDates(weekStart: Date): WeekDay[] {
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return {
      date: fmtLocalDate(d),
      dayName: dayNames[i]!,
      dayNum: String(d.getDate()),
      isWeekend: i === 0 || i === 6,
      isSunday: i === 0,
    };
  });
}

function getInitials(name: string | null | undefined): string {
  if (!name) return "??";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "??";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return ((parts[0]![0] ?? "") + (parts[parts.length - 1]![0] ?? "")).toUpperCase();
}

function rolePriorityToBadge(p: number): string {
  if (p <= ROLE_PRIORITY.OWNER) return "Owner";
  if (p <= ROLE_PRIORITY.GM) return "GM";
  if (p <= ROLE_PRIORITY.SV) return "SV";
  return "Staff";
}

function rolePriorityToColor(p: number): string {
  if (p <= ROLE_PRIORITY.GM) return "bg-[var(--color-accent-muted)] text-[var(--color-accent)]";
  if (p <= ROLE_PRIORITY.SV) return "bg-[var(--color-warning-muted)] text-[var(--color-warning)]";
  return "bg-[var(--color-success-muted)] text-[var(--color-success)]";
}

function parseTimeToHours(t: string | null): number {
  if (!t) return 0;
  const [hh, mm] = t.split(":");
  return (Number.parseInt(hh ?? "0", 10) || 0) + (Number.parseInt(mm ?? "0", 10) || 0) / 60;
}

// ─── Types ────────────────────────────────────────────

interface ScheduleModification {
  workRoleId?: string | null;
  workRoleName?: string | null;
  startTime?: string;
  endTime?: string;
  breakStartTime?: string | null;
  breakEndTime?: string | null;
}

interface SavePayload {
  creates: PreviewEntry[];
  updates: { id: string; data: ScheduleModification }[];
  deletes: string[];
}

interface BulkScheduleViewProps {
  initialStoreId: string;
  initialWeekStart: Date;
  isGMView: boolean;
  isSaving: boolean;
  onSave: (payload: SavePayload) => void;
  onExit: () => void;
}

export type { SavePayload };

// ─── Component ────────────────────────────────────────

export default function BulkScheduleView({
  initialStoreId,
  initialWeekStart,
  isGMView,
  isSaving,
  onSave,
  onExit,
}: BulkScheduleViewProps) {
  const { toast } = useToast();

  // ─── Local state ──────────────────────────────────
  const [storeId, setStoreId] = useState(initialStoreId);
  const [weekStart, setWeekStart] = useState<Date>(initialWeekStart);
  const weekDates = useMemo(() => buildWeekDates(weekStart), [weekStart]);
  const [filters, setFilters] = useState<FilterState>({ staffIds: [], roles: [], statuses: [], positions: [], shifts: [] });

  // Selection
  const [selectionMode, setSelectionMode] = useState<"add" | "edit">("add");
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set());
  const [selectedBlockIds, setSelectedBlockIds] = useState<Set<string>>(new Set());

  // Modals
  const [applyModalOpen, setApplyModalOpen] = useState(false);
  const [blockEditModalOpen, setBlockEditModalOpen] = useState(false);
  const [directEditIds, setDirectEditIds] = useState<string[]>([]); // 개별 수정 시 selectedBlockIds 건드리지 않고 직접 전달
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  // Preview state — Save 전까지 서버 미전송
  const [previewEntries, setPreviewEntries] = useState<PreviewEntry[]>([]);
  const [modifiedSchedules, setModifiedSchedules] = useState<Map<string, ScheduleModification>>(new Map());
  const [deletedScheduleIds, setDeletedScheduleIds] = useState<Set<string>>(new Set());

  // Undo/Redo — simple: undoStack holds past states, redoStack holds future states
  type DataSnapshot = {
    previews: PreviewEntry[];
    modified: Map<string, ScheduleModification>;
    deleted: Set<string>;
  };
  const undoStackRef = useRef<DataSnapshot[]>([]);
  const redoStackRef = useRef<DataSnapshot[]>([]);
  const [, forceHistoryRender] = useState(0);
  const canUndo = undoStackRef.current.length > 0;
  const canRedo = redoStackRef.current.length > 0;

  // Clipboard — row/column/block copy
  type ClipboardType = "row" | "column" | "block";
  type ClipboardData = {
    type: ClipboardType;
    entries: { workRoleId: string | null; workRoleName: string | null; startTime: string; endTime: string; breakStartTime: string | null; breakEndTime: string | null; dayIndex?: number }[];
    sourceUserId?: string;
    sourceDate?: string;
  };
  const [clipboard, setClipboard] = useState<ClipboardData | null>(null);

  // Header collapse
  const [headerExpanded, setHeaderExpanded] = useState(true);

  // Week picker / Copy from week
  const [weekPickerOpen, setWeekPickerOpen] = useState(false);
  const [copyPickerOpen, setCopyPickerOpen] = useState(false);
  const [copyWeekStart, setCopyWeekStart] = useState<Date>(() => {
    const d = new Date(initialWeekStart);
    d.setDate(d.getDate() - 7);
    return d;
  });

  // ─── Self-fetch data ───────────────────────────────
  const storesQ = useStores();
  const stores: Store[] = storesQ.data ?? [];
  const storeName = stores.find((s) => s.id === storeId)?.name ?? "Store";

  const usersQ = useUsers({ store_ids: [storeId] });
  const allUsers: User[] = usersQ.data ?? [];

  const workRolesQ = useWorkRoles(storeId || undefined);
  const workRoles: WorkRole[] = workRolesQ.data ?? [];

  // 현재 주간 스케줄
  const schedulesQ = useSchedules({
    store_id: storeId,
    date_from: weekDates[0]?.date,
    date_to: weekDates[6]?.date,
    per_page: 500,
  });
  const schedules: Schedule[] = schedulesQ.data?.items ?? [];

  // Copy 소스 주간 스케줄
  const copySourceDates = useMemo(() => buildWeekDates(copyWeekStart), [copyWeekStart]);
  const copySourceQ = useSchedules({
    store_id: storeId,
    date_from: copySourceDates[0]?.date,
    date_to: copySourceDates[6]?.date,
    per_page: 500,
  });
  const copySourceSchedules: Schedule[] = copySourceQ.data?.items ?? [];

  // ─── Derived data ─────────────────────────────────

  // Filtered users (FilterBar 적용)
  const filteredUsers = useMemo(() => {
    let result = allUsers;
    if (filters.staffIds.length > 0) result = result.filter((u) => filters.staffIds.includes(u.id));
    if (filters.roles.length > 0) result = result.filter((u) => filters.roles.includes(rolePriorityToBadge(u.role_priority).toLowerCase()));
    return result;
  }, [allUsers, filters]);

  const weekSchedules = useMemo(() =>
    schedules.filter((s) => s.status !== "deleted"),
    [schedules],
  );

  // Total changes count
  const totalChanges = previewEntries.length + modifiedSchedules.size + deletedScheduleIds.size;

  // ─── Aggregation helpers ───────────────────────────

  function getNetHours(start: string | null, end: string | null, bStart?: string | null, bEnd?: string | null): number {
    const gross = Math.max(0, parseTimeToHours(end) - parseTimeToHours(start));
    if (bStart && bEnd) return Math.max(0, gross - Math.max(0, parseTimeToHours(bEnd) - parseTimeToHours(bStart)));
    return gross;
  }

  function getUserRate(userId: string): number {
    const u = allUsers.find((x) => x.id === userId);
    return u?.hourly_rate ?? u?.effective_hourly_rate ?? 0;
  }

  // Daily column aggregations
  const dailyAgg = useMemo(() => weekDates.map((day) => {
    let existingHrs = 0;
    let existingCost = 0;
    let existingStaff = new Set<string>();
    let previewHrs = 0;
    let previewCost = 0;
    let previewCount = 0;

    for (const s of weekSchedules) {
      if (s.work_date !== day.date || isDeleted(s.id)) continue;
      const eff = getEffectiveSchedule(s);
      const h = getNetHours(eff.start_time, eff.end_time, eff.break_start_time, eff.break_end_time);
      existingHrs += h;
      existingCost += h * (eff.hourly_rate ?? 0);
      existingStaff.add(s.user_id);
    }
    for (const p of previewEntries) {
      if (p.workDate !== day.date) continue;
      const h = getNetHours(p.startTime, p.endTime, p.breakStartTime, p.breakEndTime);
      previewHrs += h;
      previewCost += h * getUserRate(p.userId);
      previewCount++;
    }
    return { existingHrs, existingCost, existingStaff: existingStaff.size, previewHrs, previewCost, previewCount };
  }), [weekDates, weekSchedules, previewEntries, deletedScheduleIds, modifiedSchedules, allUsers]);

  // Weekly totals
  const weeklyAgg = useMemo(() => {
    const a = dailyAgg.reduce((acc, d) => ({
      existingHrs: acc.existingHrs + d.existingHrs,
      existingCost: acc.existingCost + d.existingCost,
      previewHrs: acc.previewHrs + d.previewHrs,
      previewCost: acc.previewCost + d.previewCost,
      previewCount: acc.previewCount + d.previewCount,
    }), { existingHrs: 0, existingCost: 0, previewHrs: 0, previewCost: 0, previewCount: 0 });
    return a;
  }, [dailyAgg]);

  // Per-user weekly hours (for overtime warning at 40h)
  const userWeeklyHrs = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of weekSchedules) {
      if (isDeleted(s.id)) continue;
      const eff = getEffectiveSchedule(s);
      const h = getNetHours(eff.start_time, eff.end_time, eff.break_start_time, eff.break_end_time);
      map.set(s.user_id, (map.get(s.user_id) ?? 0) + h);
    }
    for (const p of previewEntries) {
      const h = getNetHours(p.startTime, p.endTime, p.breakStartTime, p.breakEndTime);
      map.set(p.userId, (map.get(p.userId) ?? 0) + h);
    }
    return map;
  }, [weekSchedules, previewEntries, deletedScheduleIds, modifiedSchedules]);

  // ─── Cell/Block helpers ───────────────────────────

  function getSchedulesForCell(userId: string, date: string): Schedule[] {
    return weekSchedules.filter((s) => s.user_id === userId && s.work_date === date);
  }

  function getPreviewsForCell(userId: string, date: string): PreviewEntry[] {
    return previewEntries.filter((e) => e.userId === userId && e.workDate === date);
  }

  /** 기존 스케줄에 modification 적용 */
  function getEffectiveSchedule(s: Schedule): Schedule {
    const mod = modifiedSchedules.get(s.id);
    if (!mod) return s;
    // workRoleName resolve: mod에 workRoleId가 있으면 workRoles에서 이름 조회
    let resolvedRoleName = mod.workRoleName;
    if (mod.workRoleId !== undefined && resolvedRoleName === undefined) {
      const wr = workRoles.find((w) => w.id === mod.workRoleId);
      resolvedRoleName = wr ? (wr.name || `${wr.shift_name ?? ""} - ${wr.position_name ?? ""}`) : null;
    }
    return {
      ...s,
      work_role_id: mod.workRoleId !== undefined ? mod.workRoleId : s.work_role_id,
      work_role_name: resolvedRoleName !== undefined ? resolvedRoleName : s.work_role_name,
      // snapshot도 갱신해야 ScheduleBlock에 반영됨
      work_role_name_snapshot: resolvedRoleName !== undefined ? resolvedRoleName : s.work_role_name_snapshot,
      start_time: mod.startTime ?? s.start_time,
      end_time: mod.endTime ?? s.end_time,
      break_start_time: mod.breakStartTime !== undefined ? mod.breakStartTime : s.break_start_time,
      break_end_time: mod.breakEndTime !== undefined ? mod.breakEndTime : s.break_end_time,
    };
  }

  function isDeleted(id: string): boolean {
    return deletedScheduleIds.has(id);
  }

  function isModified(id: string): boolean {
    return modifiedSchedules.has(id);
  }

  // ─── Selection ────────────────────────────────────

  /** 현재 상태를 undo 스택에 저장, redo 스택 클리어 */
  function pushDataSnapshot() {
    undoStackRef.current = [...undoStackRef.current, {
      previews: [...previewEntries],
      modified: new Map(modifiedSchedules),
      deleted: new Set(deletedScheduleIds),
    }];
    redoStackRef.current = []; // 새 변경 시 redo 불가
    forceHistoryRender((n) => n + 1);
  }

  // ─── Clipboard ─────────────────────────────────────

  /** 셀 내 모든 블록(서버+preview)을 entry 배열로 수집 */
  function collectCellBlocks(userId: string, date: string, dayIndex?: number): ClipboardData["entries"] {
    const result: ClipboardData["entries"] = [];
    for (const s of getSchedulesForCell(userId, date).filter((x) => !isDeleted(x.id))) {
      const eff = getEffectiveSchedule(s);
      result.push({ workRoleId: eff.work_role_id, workRoleName: eff.work_role_name, startTime: eff.start_time ?? "", endTime: eff.end_time ?? "", breakStartTime: eff.break_start_time, breakEndTime: eff.break_end_time, dayIndex });
    }
    for (const p of getPreviewsForCell(userId, date)) {
      result.push({ workRoleId: p.workRoleId, workRoleName: p.workRoleName, startTime: p.startTime, endTime: p.endTime, breakStartTime: p.breakStartTime, breakEndTime: p.breakEndTime, dayIndex });
    }
    return result;
  }

  /** 행 복사: 해당 직원의 이번 주 모든 스케줄 (복수 블록 포함) */
  function copyRow(userId: string) {
    const entries: ClipboardData["entries"] = [];
    weekDates.forEach((day, i) => entries.push(...collectCellBlocks(userId, day.date, i)));
    if (entries.length === 0) { toast({ type: "error", message: "No schedules to copy" }); return; }
    setClipboard({ type: "row", entries, sourceUserId: userId });
    toast({ type: "success", message: `Copied ${entries.length} schedules from row` });
  }

  /** 열 복사: 해당 날짜의 모든 직원 스케줄 */
  function copyColumn(date: string) {
    const entries: ClipboardData["entries"] = [];
    for (const u of filteredUsers) entries.push(...collectCellBlocks(u.id, date));
    if (entries.length === 0) { toast({ type: "error", message: "No schedules to copy" }); return; }
    setClipboard({ type: "column", entries, sourceDate: date });
    toast({ type: "success", message: `Copied ${entries.length} schedules from column` });
  }

  /** 블록 복사 */
  function copyBlock(block: { workRoleId: string | null; workRoleName: string | null; startTime: string; endTime: string; breakStartTime: string | null; breakEndTime: string | null }) {
    setClipboard({ type: "block", entries: [{ ...block }] });
    toast({ type: "success", message: "Schedule copied" });
  }

  /** 행에 붙여넣기: clipboard entries를 대상 유저의 요일별로 */
  function pasteToRow(userId: string) {
    if (!clipboard) return;
    pushDataSnapshot();
    const newEntries: PreviewEntry[] = [];
    if (clipboard.type === "row") {
      for (const e of clipboard.entries) {
        if (e.dayIndex == null) continue;
        const targetDate = weekDates[e.dayIndex]?.date;
        if (!targetDate || !e.startTime) continue;
        newEntries.push({
          tempId: `paste-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          userId, storeId, workRoleId: e.workRoleId, workRoleName: e.workRoleName,
          workDate: targetDate, startTime: e.startTime, endTime: e.endTime,
          breakStartTime: e.breakStartTime, breakEndTime: e.breakEndTime,
        });
      }
    } else if (clipboard.type === "block") {
      // 블록 → 선택된 셀에 붙여넣기 (선택 없으면 7일 전체)
      const targets = selectedCells.size > 0
        ? Array.from(selectedCells).filter((k) => k.startsWith(userId + ":")).map((k) => k.split(":")[1]!)
        : weekDates.map((d) => d.date);
      for (const date of targets) {
        const e = clipboard.entries[0]!;
        newEntries.push({
          tempId: `paste-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          userId, storeId, workRoleId: e.workRoleId, workRoleName: e.workRoleName,
          workDate: date, startTime: e.startTime, endTime: e.endTime,
          breakStartTime: e.breakStartTime, breakEndTime: e.breakEndTime,
        });
      }
    }
    if (newEntries.length > 0) {
      setPreviewEntries((prev) => [...prev, ...newEntries]);
      toast({ type: "success", message: `Pasted ${newEntries.length} previews` });
    }
  }

  /** 셀에 블록 붙여넣기 (모든 clipboard entries) */
  function pasteToCell(userId: string, date: string) {
    if (!clipboard || clipboard.entries.length === 0) return;
    pushDataSnapshot();
    const newEntries = clipboard.entries.map((e) => ({
      tempId: `paste-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      userId, storeId, workRoleId: e.workRoleId, workRoleName: e.workRoleName,
      workDate: date, startTime: e.startTime, endTime: e.endTime,
      breakStartTime: e.breakStartTime, breakEndTime: e.breakEndTime,
    }));
    setPreviewEntries((prev) => [...prev, ...newEntries]);
  }

  /** 선택된 셀 전체에 붙여넣기 (1개 복사 → 다중 셀) */
  function pasteToSelectedCells() {
    if (!clipboard || clipboard.entries.length === 0 || selectedCells.size === 0) return;
    pushDataSnapshot();
    const newEntries: PreviewEntry[] = [];
    for (const key of selectedCells) {
      const [userId, date] = key.split(":") as [string, string];
      for (const e of clipboard.entries) {
        newEntries.push({
          tempId: `paste-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          userId, storeId, workRoleId: e.workRoleId, workRoleName: e.workRoleName,
          workDate: date, startTime: e.startTime, endTime: e.endTime,
          breakStartTime: e.breakStartTime, breakEndTime: e.breakEndTime,
        });
      }
    }
    setPreviewEntries((prev) => [...prev, ...newEntries]);
    setSelectedCells(new Set());
    toast({ type: "success", message: `Pasted to ${selectedCells.size} cells` });
  }

  function toggleCell(key: string) {
    setSelectedCells((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  function toggleBlock(id: string) {
    setSelectedBlockIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function deselectAll() {
    if (selectionMode === "add") setSelectedCells(new Set());
    else setSelectedBlockIds(new Set());
  }

  function handleUndo() {
    if (undoStackRef.current.length === 0) return;
    // 현재 상태를 redo에 저장
    redoStackRef.current = [...redoStackRef.current, {
      previews: [...previewEntries],
      modified: new Map(modifiedSchedules),
      deleted: new Set(deletedScheduleIds),
    }];
    // undo 스택에서 꺼내서 복원
    const snap = undoStackRef.current[undoStackRef.current.length - 1]!;
    undoStackRef.current = undoStackRef.current.slice(0, -1);
    setPreviewEntries([...snap.previews]);
    setModifiedSchedules(new Map(snap.modified));
    setDeletedScheduleIds(new Set(snap.deleted));
    forceHistoryRender((n) => n + 1);
  }

  function handleRedo() {
    if (redoStackRef.current.length === 0) return;
    // 현재 상태를 undo에 저장
    undoStackRef.current = [...undoStackRef.current, {
      previews: [...previewEntries],
      modified: new Map(modifiedSchedules),
      deleted: new Set(deletedScheduleIds),
    }];
    // redo 스택에서 꺼내서 복원
    const snap = redoStackRef.current[redoStackRef.current.length - 1]!;
    redoStackRef.current = redoStackRef.current.slice(0, -1);
    setPreviewEntries([...snap.previews]);
    setModifiedSchedules(new Map(snap.modified));
    setDeletedScheduleIds(new Set(snap.deleted));
    forceHistoryRender((n) => n + 1);
  }

  function clearAll() {
    pushDataSnapshot(); // discard 전 상태 저장 → undo로 복구 가능
    setPreviewEntries([]);
    setModifiedSchedules(new Map());
    setDeletedScheduleIds(new Set());
    setSelectedCells(new Set());
    setSelectedBlockIds(new Set());
  }

  // ─── Bulk actions ─────────────────────────────────

  function handleApplyPreviews(entries: PreviewEntry[]) {
    pushDataSnapshot();
    setPreviewEntries((prev) => [...prev, ...entries]);
    setApplyModalOpen(false);
    setSelectedCells(new Set());
    toast({ type: "success", message: `${entries.length} previews added` });
  }

  function handleEditApply(updates: { id: string; workRoleId: string | null | undefined; startTime: string | undefined; endTime: string | undefined; breakStartTime?: string; breakEndTime?: string }[]) {
    pushDataSnapshot();
    setModifiedSchedules((prev) => {
      const next = new Map(prev);
      for (const u of updates) {
        // preview entry인 경우 직접 수정
        const previewIdx = previewEntries.findIndex((e) => e.tempId === u.id);
        if (previewIdx >= 0) {
          setPreviewEntries((pe) => pe.map((e) =>
            e.tempId === u.id ? {
              ...e,
              workRoleId: u.workRoleId !== undefined ? u.workRoleId : e.workRoleId,
              startTime: u.startTime ?? e.startTime,
              endTime: u.endTime ?? e.endTime,
              breakStartTime: u.breakStartTime !== undefined ? (u.breakStartTime || null) : e.breakStartTime,
              breakEndTime: u.breakEndTime !== undefined ? (u.breakEndTime || null) : e.breakEndTime,
            } : e,
          ));
        } else {
          // 서버 스케줄 수정
          const existing = next.get(u.id) ?? {};
          next.set(u.id, {
            ...existing,
            ...(u.workRoleId !== undefined && { workRoleId: u.workRoleId }),
            ...(u.startTime && { startTime: u.startTime }),
            ...(u.endTime && { endTime: u.endTime }),
            ...(u.breakStartTime !== undefined && { breakStartTime: u.breakStartTime || null }),
            ...(u.breakEndTime !== undefined && { breakEndTime: u.breakEndTime || null }),
          });
        }
      }
      return next;
    });
    setBlockEditModalOpen(false);
    setDirectEditIds([]);
    // 다중 선택에서 Edit 한 경우만 선택 해제 (개별 수정은 선택 유지)
    if (directEditIds.length === 0) setSelectedBlockIds(new Set());
    toast({ type: "success", message: `${updates.length} items updated (preview)` });
  }

  /** 선택된 블록의 수정/삭제를 되돌림 */
  function handleRevertSelected() {
    for (const id of selectedBlockIds) {
      // preview → 제거
      if (previewEntries.some((e) => e.tempId === id)) {
        setPreviewEntries((prev) => prev.filter((e) => e.tempId !== id));
      } else {
        // server schedule → modification/deletion 제거
        setModifiedSchedules((prev) => { const n = new Map(prev); n.delete(id); return n; });
        setDeletedScheduleIds((prev) => { const n = new Set(prev); n.delete(id); return n; });
      }
    }
    toast({ type: "success", message: `${selectedBlockIds.size} items reverted` });
    setSelectedBlockIds(new Set());
  }

  /** 단일 블록 되돌리기 */
  function revertSingle(id: string) {
    pushDataSnapshot();
    if (previewEntries.some((e) => e.tempId === id)) {
      setPreviewEntries((prev) => prev.filter((e) => e.tempId !== id));
    } else {
      setModifiedSchedules((prev) => { const n = new Map(prev); n.delete(id); return n; });
      setDeletedScheduleIds((prev) => { const n = new Set(prev); n.delete(id); return n; });
    }
  }

  /** 단일 블록 삭제 */
  function deleteSingle(id: string) {
    pushDataSnapshot();
    if (previewEntries.some((e) => e.tempId === id)) {
      setPreviewEntries((prev) => prev.filter((e) => e.tempId !== id));
    } else {
      setDeletedScheduleIds((prev) => new Set(prev).add(id));
    }
  }

  function handleDeleteSelected() {
    pushDataSnapshot();
    const previewIds = new Set<string>();
    const serverIds = new Set<string>();
    for (const id of selectedBlockIds) {
      if (previewEntries.some((e) => e.tempId === id)) previewIds.add(id);
      else serverIds.add(id);
    }
    // preview는 직접 제거
    if (previewIds.size > 0) {
      setPreviewEntries((prev) => prev.filter((e) => !previewIds.has(e.tempId)));
    }
    // 서버 스케줄은 deletedIds에 추가
    if (serverIds.size > 0) {
      setDeletedScheduleIds((prev) => {
        const next = new Set(prev);
        serverIds.forEach((id) => next.add(id));
        return next;
      });
    }
    setDeleteConfirmOpen(false);
    setSelectedBlockIds(new Set());
    toast({ type: "success", message: `${selectedBlockIds.size} items marked for deletion` });
  }

  function handleSave(excluded?: Set<string>) {
    const creates = excluded
      ? previewEntries.filter((e) => !excluded.has(e.tempId))
      : [...previewEntries];
    const updates = Array.from(modifiedSchedules.entries())
      .filter(([id]) => !excluded?.has(id))
      .map(([id, data]) => ({ id, data }));
    const deletes = Array.from(deletedScheduleIds)
      .filter((id) => !excluded?.has(id));
    onSave({ creates, updates, deletes });
  }

  // ─── Copy from week ──────────────────────────────

  function handleCopyFromWeek() {
    pushDataSnapshot();
    if (copySourceQ.isLoading) {
      toast({ type: "error", message: "Loading source week data…" });
      return;
    }
    const sourceDates = copySourceDates.map((d) => d.date);
    const sourceScheds = copySourceSchedules.filter((s) =>
      s.status !== "cancelled" && s.status !== "deleted" && s.status !== "rejected",
    );

    // 전부 preview로 가져옴 (겹침은 유저가 시각적으로 판단)
    let added = 0;
    const newEntries: PreviewEntry[] = [];
    for (const s of sourceScheds) {
      const srcIdx = sourceDates.indexOf(s.work_date);
      const targetDate = weekDates[srcIdx]?.date;
      if (!targetDate) continue;
      newEntries.push({
        tempId: `copy-${++added}-${Date.now()}`,
        userId: s.user_id,
        storeId: s.store_id,
        workRoleId: s.work_role_id,
        workRoleName: s.work_role_name_snapshot ?? s.work_role_name,
        workDate: targetDate,
        startTime: s.start_time ?? "09:00",
        endTime: s.end_time ?? "18:00",
        breakStartTime: s.break_start_time,
        breakEndTime: s.break_end_time,
      });
    }
    setPreviewEntries((prev) => [...prev, ...newEntries]);
    setCopyPickerOpen(false);
    if (added > 0) toast({ type: "success", message: `${added} schedules copied as preview` });
    else toast({ type: "error", message: "No schedules found in source week" });
  }

  // ─── Outside click ────────────────────────────────

  useEffect(() => {
    if (!weekPickerOpen && !copyPickerOpen) return;
    const handler = (e: MouseEvent) => {
      const wp = document.getElementById("bulk-week-picker");
      const cp = document.getElementById("bulk-copy-picker");
      if (weekPickerOpen && wp && !wp.contains(e.target as Node)) setWeekPickerOpen(false);
      if (copyPickerOpen && cp && !cp.contains(e.target as Node)) setCopyPickerOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [weekPickerOpen, copyPickerOpen]);

  // Store 변경 시 선택 초기화
  useEffect(() => {
    setSelectedCells(new Set());
    setSelectedBlockIds(new Set());
  }, [storeId]);

  // ─── Confirm dialogs ───────────────────────────────
  const [discardAllConfirmOpen, setDiscardAllConfirmOpen] = useState(false);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const [saveConfirmOpen, setSaveConfirmOpen] = useState(false);

  // ─── Render ───────────────────────────────────────

  const todayStr = fmtLocalDate(new Date());
  const selCount = selectionMode === "add" ? selectedCells.size : selectedBlockIds.size;
  const activeWorkRoles = workRoles.filter((wr) => wr.is_active);

  // Schedules + previews for BlockEditModal
  // directEditIds가 있으면 그걸 사용 (개별 수정), 없으면 selectedBlockIds (다중 선택)
  const editTargetIds = useMemo(() => {
    if (directEditIds.length > 0) return new Set(directEditIds);
    return selectedBlockIds;
  }, [directEditIds, selectedBlockIds]);

  const selectedForEdit = useMemo(() => {
    const serverScheds = weekSchedules.filter((s) => editTargetIds.has(s.id)).map(getEffectiveSchedule);
    // Preview entries도 가짜 Schedule로 변환
    const previewScheds: Schedule[] = previewEntries
      .filter((e) => editTargetIds.has(e.tempId))
      .map((e) => ({
        id: e.tempId,
        organization_id: "",
        request_id: null,
        user_id: e.userId,
        user_name: allUsers.find((u: User) => u.id === e.userId)?.full_name ?? null,
        store_id: e.storeId,
        store_name: stores.find((s: Store) => s.id === e.storeId)?.name ?? null,
        work_role_id: e.workRoleId,
        work_role_name: e.workRoleName,
        work_role_name_snapshot: e.workRoleName,
        position_snapshot: null,
        work_date: e.workDate,
        start_time: e.startTime,
        end_time: e.endTime,
        break_start_time: e.breakStartTime,
        break_end_time: e.breakEndTime,
        net_work_minutes: 0,
        hourly_rate: 0,
        status: "draft" as const,
        submitted_at: null,
        is_modified: false,
        rejected_by: null,
        rejected_at: null,
        rejection_reason: null,
        cancelled_by: null,
        cancelled_at: null,
        cancellation_reason: null,
        created_by: null,
        approved_by: null,
        confirmed_at: null,
        note: null,
        created_at: "",
        updated_at: "",
      }));
    return [...serverScheds, ...previewScheds];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editTargetIds, weekSchedules, previewEntries, modifiedSchedules]);

  return (
    <div className="min-h-screen bg-[var(--color-bg)] -m-4 md:-m-8">
      <div className="px-3 sm:px-4 lg:px-6 pb-20">
        {/* ── Row 1: Title + Stats (기존 헤더 구조 유지) ─── */}
        <div className="flex items-center gap-3 md:gap-5 pt-4 pb-1 min-h-[40px]">
          <h1 className="text-[22px] font-semibold text-[var(--color-text)] shrink-0">Schedules</h1>
          <span className="text-[11px] px-2 py-0.5 rounded-full bg-[var(--color-accent-muted)] text-[var(--color-accent)] font-semibold shrink-0">
            Bulk Mode
          </span>
          {totalChanges > 0 && (
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-[var(--color-success-muted)] text-[var(--color-success)] font-semibold shrink-0">
              {totalChanges} change{totalChanges !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        {/* ── Row 2: Store(left) | Nav + Copy + Actions(right) ─── */}
        <div className="flex items-center justify-between py-2 gap-2 flex-wrap min-h-[48px]">
          {/* Left: Store selector (single select, matches existing style) */}
          <div className="flex items-center gap-2 shrink-0">
            <select
              value={storeId}
              onChange={(e) => setStoreId(e.target.value)}
              className="px-3 py-1.5 bg-[var(--color-surface)] border-2 border-[var(--color-accent)] rounded-lg text-[13px] font-semibold text-[var(--color-accent)] cursor-pointer max-w-[200px] truncate"
            >
              {stores.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          {/* Right: Nav + Copy */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Week navigation with picker */}
            <div className="flex items-center gap-1 sm:gap-2 shrink-0">
              <button type="button" onClick={() => setWeekStart((ws) => { const d = new Date(ws); d.setDate(d.getDate() - 7); return d; })}
                className="w-8 h-8 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] flex items-center justify-center text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="9 11 5 7 9 3" /></svg>
              </button>

              <div id="bulk-week-picker" className="relative">
                <button type="button" onClick={() => { setWeekPickerOpen((p) => !p); setCopyPickerOpen(false); }}
                  className="text-[12px] sm:text-[13px] font-semibold text-[var(--color-text)] min-w-[100px] sm:min-w-[200px] text-center tabular-nums px-2 py-1.5 rounded-lg hover:bg-[var(--color-surface-hover)] transition-colors">
                  {(() => {
                    const d0 = weekDates[0]?.date ? new Date(weekDates[0].date + "T00:00:00") : null;
                    const d6 = weekDates[6]?.date ? new Date(weekDates[6].date + "T00:00:00") : null;
                    if (!d0 || !d6) return "";
                    const m0 = d0.toLocaleDateString("en-US", { month: "short" }).toUpperCase();
                    const m6 = d6.toLocaleDateString("en-US", { month: "short" }).toUpperCase();
                    return `${m0} ${d0.getDate()} – ${m6} ${d6.getDate()}`;
                  })()}
                </button>
                {weekPickerOpen && (
                  <div className="absolute top-full right-0 mt-1 z-50">
                    <WeekPickerCalendar selectedWeekStart={weekStart} onSelect={(ws) => { setWeekStart(ws); setWeekPickerOpen(false); }} />
                  </div>
                )}
              </div>

              <button type="button" onClick={() => setWeekStart((ws) => { const d = new Date(ws); d.setDate(d.getDate() + 7); return d; })}
                className="w-8 h-8 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] flex items-center justify-center text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="5 3 9 7 5 11" /></svg>
              </button>
            </div>

            {/* Copy from week */}
            <div id="bulk-copy-picker" className="relative">
              <button type="button" onClick={() => { setCopyPickerOpen((p) => !p); setWeekPickerOpen(false); }}
                className="px-3 py-1.5 rounded-lg text-[12px] font-semibold bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-[var(--color-text)] transition-colors shrink-0">
                Copy from week
              </button>
              {copyPickerOpen && (
                <div className="absolute top-full right-0 mt-1 z-50">
                  <WeekPickerCalendar selectedWeekStart={copyWeekStart} onSelect={(ws) => setCopyWeekStart(ws)} />
                  <div className="mt-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-3 shadow-xl">
                    <button type="button" onClick={handleCopyFromWeek}
                      className="w-full px-3 py-2 rounded-lg text-[12px] font-semibold bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] transition-colors">
                      Copy to current week
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Row 3: Filters (above mode toggle) ── */}
        <FilterBar
          filters={filters}
          onChange={setFilters}
          users={allUsers}
          schedules={schedules}
          selectedStoreId={storeId}
        />

        {/* ── Row 4: Mode toggle + actions ─────────── */}
        <div className="flex items-center gap-2 py-2">
          <div className="flex bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-0.5">
            {(["add", "edit"] as const).map((m) => (
              <button key={m} type="button" onClick={() => { setSelectionMode(m); deselectAll(); }}
                className={`px-3 py-1 rounded-md text-[12px] font-semibold transition-all ${
                  selectionMode === m ? "bg-[var(--color-accent)] text-white" : "text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"
                }`}>
                {m === "add" ? "Add" : "Edit"}
              </button>
            ))}
          </div>

          <span className="text-[12px] text-[var(--color-text-secondary)] min-w-[80px]">
            {selCount > 0 ? <span className="text-[var(--color-text)] font-semibold">{selCount} selected</span> : "Click to select"}
          </span>

          {/* Clipboard indicator */}
          {clipboard && (
            <span className="flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-[var(--color-accent-muted)] text-[var(--color-accent)] font-semibold">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
              {clipboard.type === "row" ? "Row" : clipboard.type === "column" ? "Column" : "Block"} copied
              <button type="button" onClick={() => setClipboard(null)} className="ml-0.5 hover:text-[var(--color-text)]">×</button>
            </span>
          )}

          {selectionMode === "add" ? (
            <div className="flex items-center gap-1.5">
              <button type="button" onClick={() => setApplyModalOpen(true)} disabled={selectedCells.size === 0}
                className="px-3 py-1.5 rounded-lg text-[12px] font-semibold bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                + Add to {selectedCells.size || 0} cells
              </button>
              {clipboard && selectedCells.size > 0 && (
                <button type="button" onClick={pasteToSelectedCells}
                  className="px-3 py-1.5 rounded-lg text-[12px] font-semibold bg-[var(--color-surface)] border border-[var(--color-accent)] text-[var(--color-accent)] hover:bg-[var(--color-accent-muted)] transition-colors flex items-center gap-1">
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
                  Paste to {selectedCells.size}
                </button>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <button type="button" onClick={() => setBlockEditModalOpen(true)} disabled={selectedBlockIds.size === 0}
                className="px-3 py-1.5 rounded-lg text-[12px] font-semibold bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                Edit {selectedBlockIds.size > 0 ? `(${selectedBlockIds.size})` : ""}
              </button>
              <button type="button" onClick={() => setDeleteConfirmOpen(true)} disabled={selectedBlockIds.size === 0}
                className="px-3 py-1.5 rounded-lg text-[12px] font-semibold bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-danger)] hover:bg-[var(--color-danger-muted)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                Delete
              </button>
              <button type="button" onClick={handleRevertSelected} disabled={selectedBlockIds.size === 0}
                className="px-3 py-1.5 rounded-lg text-[12px] font-semibold bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                Revert
              </button>
            </div>
          )}
        </div>

        {/* ── Grid + top-right controls ──────────── */}
        <div className="flex items-center justify-end gap-1.5 mb-1">
          <button type="button" onClick={deselectAll} disabled={selCount === 0}
            className="px-2.5 py-1.5 rounded-lg text-[12px] text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
            Deselect All
          </button>
          <div className="w-px h-4 bg-[var(--color-border)]" />
          <button type="button" onClick={handleUndo} disabled={!canUndo} title="Undo"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7v6h6" /><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" /></svg>
          </button>
          <button type="button" onClick={handleRedo} disabled={!canRedo} title="Redo"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 7v6h-6" /><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13" /></svg>
          </button>
          <button type="button" onClick={() => { if (totalChanges > 0) setDiscardAllConfirmOpen(true); else clearAll(); }}
            className="px-2 py-1 rounded-lg text-[11px] text-[var(--color-danger)] hover:bg-[var(--color-danger-muted)] transition-colors">
            Discard All
          </button>
        </div>
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl overflow-auto" style={{ maxHeight: "calc(100vh - 300px)" }}>
          <div style={{ minWidth: 220 + 7 * 120 + 90 }}>
            <table className="w-full border-collapse" style={{ tableLayout: "fixed" }}>
              <colgroup>
                <col className="w-[180px] xl:w-[220px]" />
                {weekDates.map((d) => <col key={d.date} />)}
                <col className="w-[80px] xl:w-[90px]" />
              </colgroup>

              <thead>
                <tr className="border-b border-[var(--color-border)]">
                  {/* Staff header with expand toggle — centered, arrow down */}
                  <th className="px-4 py-2 sticky left-0 z-10 bg-[var(--color-surface)]">
                    <button type="button" onClick={() => setHeaderExpanded((p) => !p)}
                      className="flex items-center justify-center gap-1.5 w-full text-[11px] font-semibold text-[var(--color-text-secondary)] uppercase tracking-wide hover:text-[var(--color-text)] transition-colors">
                      Overview
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"
                        className={`transition-transform ${headerExpanded ? "rotate-180" : ""}`}>
                        <polyline points="2 3.5 5 6.5 8 3.5" />
                      </svg>
                    </button>
                  </th>
                  {weekDates.map((day, i) => {
                    const agg = dailyAgg[i]!;
                    const fH = (h: number) => { const r = Math.round(h * 10) / 10; return r % 1 === 0 ? String(r) : r.toFixed(1); };
                    return (
                      <th key={day.date}
                        className={`px-1.5 py-2 text-center align-top border-l border-[var(--color-border)] cursor-pointer hover:bg-[var(--color-accent-muted)] transition-colors ${day.date === todayStr ? "bg-[var(--color-accent)]/[0.06]" : ""}`}
                        onClick={() => {
                          if (selectionMode === "add") {
                            const colKeys = filteredUsers.map((u) => `${u.id}:${day.date}`);
                            const allSelected = colKeys.every((k) => selectedCells.has(k));
                            setSelectedCells((prev) => {
                              const next = new Set(prev);
                              for (const k of colKeys) { if (allSelected) next.delete(k); else next.add(k); }
                              return next;
                            });
                          }
                        }}
                      >
                        <div className="group/col relative">
                          <div className={`text-[12px] font-semibold ${day.isSunday ? "text-[var(--color-danger)]" : day.isWeekend ? "text-[var(--color-accent)]" : "text-[var(--color-text)]"}`}>
                            {day.dayName}
                          </div>
                          <div className="text-[11px] text-[var(--color-text-secondary)]">{day.dayNum}</div>
                          {/* Column copy/paste buttons */}
                          <div className="absolute -top-0.5 -right-0.5 flex gap-0.5 opacity-0 group-hover/col:opacity-100 transition-opacity">
                            <button type="button" onClick={(e) => { e.stopPropagation(); copyColumn(day.date); }}
                              title="Copy column"
                              className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-accent)] hover:bg-[var(--color-accent-muted)] transition-colors">
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
                            </button>
                            {clipboard && (
                              <button type="button" onClick={(e) => {
                                e.stopPropagation();
                                pushDataSnapshot();
                                // 열 붙여넣기: 각 직원에게 clipboard 내용 붙여넣기
                                const newEntries: PreviewEntry[] = [];
                                for (const u of filteredUsers) {
                                  for (const entry of clipboard.entries) {
                                    newEntries.push({
                                      tempId: `paste-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                                      userId: u.id, storeId, workRoleId: entry.workRoleId, workRoleName: entry.workRoleName,
                                      workDate: day.date, startTime: entry.startTime, endTime: entry.endTime,
                                      breakStartTime: entry.breakStartTime, breakEndTime: entry.breakEndTime,
                                    });
                                  }
                                }
                                setPreviewEntries((prev) => [...prev, ...newEntries]);
                                toast({ type: "success", message: `Pasted to ${filteredUsers.length} staff` });
                              }}
                                title="Paste to column"
                                className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--color-accent)] hover:bg-[var(--color-accent-muted)] transition-colors">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 2H9a1 1 0 0 0-1 1v2c0 .6.4 1 1 1h6c.6 0 1-.4 1-1V3c0-.6-.4-1-1-1Z" /><path d="M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2" /></svg>
                              </button>
                            )}
                          </div>
                        </div>
                        {/* Aggregation inline */}
                        {headerExpanded && (
                          <div className="mt-1 font-normal">
                            <div className="text-[10px]">
                              <span className="text-[var(--color-success)] font-semibold">{agg.existingStaff}</span>
                              {agg.previewCount > 0 && <span className="text-[var(--color-accent)] font-semibold"> +{agg.previewCount}</span>}
                            </div>
                            <div className="text-[10px]">
                              <span className="text-[var(--color-success)]">{fH(agg.existingHrs)}h</span>
                              {agg.previewHrs > 0 && <span className="text-[var(--color-accent)]"> +{fH(agg.previewHrs)}h</span>}
                            </div>
                            {isGMView && (agg.existingCost > 0 || agg.previewCost > 0) && (
                              <div className="text-[10px]">
                                {agg.existingCost > 0 && <span className="text-[var(--color-success)]">${agg.existingCost.toFixed(0)}</span>}
                                {agg.previewCost > 0 && <span className="text-[var(--color-accent)]"> +${agg.previewCost.toFixed(0)}</span>}
                              </div>
                            )}
                          </div>
                        )}
                      </th>
                    );
                  })}
                  <th className="px-2 py-2 text-center align-top border-l border-[var(--color-border)]">
                    <div className="text-[11px] font-semibold text-[var(--color-text-secondary)] uppercase tracking-wide">Total</div>
                    {headerExpanded && (
                      <div className="mt-1 font-normal">
                        <div className="text-[10px] text-[var(--color-success)] font-semibold">{Math.round(weeklyAgg.existingHrs * 10) / 10}h</div>
                        {weeklyAgg.previewHrs > 0 && <div className="text-[10px] text-[var(--color-accent)] font-semibold">+{Math.round(weeklyAgg.previewHrs * 10) / 10}h</div>}
                        {isGMView && weeklyAgg.existingCost > 0 && <div className="text-[10px] text-[var(--color-success)]">${weeklyAgg.existingCost.toFixed(0)}</div>}
                        {isGMView && weeklyAgg.previewCost > 0 && <div className="text-[10px] text-[var(--color-accent)]">+${weeklyAgg.previewCost.toFixed(0)}</div>}
                      </div>
                    )}
                  </th>
                </tr>
              </thead>

              <tbody>
                {filteredUsers.map((u) => {
                  const uWeekHrs = userWeeklyHrs.get(u.id) ?? 0;
                  const uOvertime = uWeekHrs > 40;
                  return (
                  <tr key={u.id} className={`border-b border-[var(--color-border)] last:border-b-0 hover:bg-[var(--color-surface-hover)] transition-[background-color] duration-100 ${uOvertime ? "bg-[var(--color-warning-muted)]/30" : ""}`}>
                    {/* Staff cell — click to select/deselect entire row, hover for copy/paste */}
                    <td className="group/staff px-4 py-3 border-r-2 border-[var(--color-border)] sticky left-0 z-[5] bg-[var(--color-surface)] cursor-pointer hover:bg-[var(--color-surface-hover)]"
                      onClick={() => {
                        if (selectionMode === "add") {
                          const rowKeys = weekDates.map((d) => `${u.id}:${d.date}`);
                          const allSelected = rowKeys.every((k) => selectedCells.has(k));
                          setSelectedCells((prev) => {
                            const next = new Set(prev);
                            for (const k of rowKeys) { if (allSelected) next.delete(k); else next.add(k); }
                            return next;
                          });
                        } else {
                          // Edit mode: select/deselect all blocks for this user
                          const userBlockIds = [
                            ...weekSchedules.filter((s) => s.user_id === u.id).map((s) => s.id),
                            ...previewEntries.filter((e) => e.userId === u.id).map((e) => e.tempId),
                          ];
                          const allSelected = userBlockIds.every((id) => selectedBlockIds.has(id));
                          setSelectedBlockIds((prev) => {
                            const next = new Set(prev);
                            for (const id of userBlockIds) { if (allSelected) next.delete(id); else next.add(id); }
                            return next;
                          });
                        }
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${rolePriorityToColor(u.role_priority)}`}>
                          {getInitials(u.full_name)}
                        </div>
                        <div className="min-w-0">
                          <div className="text-[13px] font-semibold text-[var(--color-text)] truncate">{u.full_name || u.username}</div>
                          <div className="text-[10px] text-[var(--color-text-muted)]">
                            <span className={u.role_priority <= ROLE_PRIORITY.GM ? "text-[var(--color-accent)] font-semibold" : u.role_priority <= ROLE_PRIORITY.SV ? "text-[var(--color-warning)] font-semibold" : "font-semibold"}>
                              {rolePriorityToBadge(u.role_priority)}
                            </span>
                            {isGMView && (() => {
                              const rate = u.hourly_rate ?? u.effective_hourly_rate;
                              if (rate != null) return <span title="Default hourly rate"> · ${rate}/hr{u.hourly_rate == null ? " (inherited)" : ""}</span>;
                              return <span className="text-[var(--color-danger)]"> · No rate</span>;
                            })()}
                          </div>
                        </div>
                      </div>
                      {/* Row copy/paste — hover icons */}
                      <div className="flex items-center gap-1 mt-1 opacity-0 group-hover/staff:opacity-100 transition-opacity">
                        <button type="button" onClick={(e) => { e.stopPropagation(); copyRow(u.id); }} title="Copy row"
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-accent)] hover:bg-[var(--color-accent-muted)] transition-colors">
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
                        </button>
                        {clipboard && (
                          <button type="button" onClick={(e) => { e.stopPropagation(); pasteToRow(u.id); }} title={`Paste ${clipboard.type}`}
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-[var(--color-accent)] hover:bg-[var(--color-accent-muted)] transition-colors">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 2H9a1 1 0 0 0-1 1v2c0 .6.4 1 1 1h6c.6 0 1-.4 1-1V3c0-.6-.4-1-1-1Z" /><path d="M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2" /></svg>
                          </button>
                        )}
                      </div>
                    </td>

                    {/* Day cells */}
                    {weekDates.map((day) => {
                      const cellSchedules = getSchedulesForCell(u.id, day.date);
                      const cellPreviews = getPreviewsForCell(u.id, day.date);
                      const cellKey = `${u.id}:${day.date}`;
                      const isCellSelected = selectionMode === "add" && selectedCells.has(cellKey);
                      const hasContent = cellSchedules.length > 0 || cellPreviews.length > 0;

                      return (
                        <td key={day.date}
                          className={`group/cell relative px-1.5 py-2 border-r border-[var(--color-border)] align-top transition-colors ${
                            isCellSelected ? "bg-[var(--color-accent-muted)] ring-1 ring-inset ring-[var(--color-accent)]/40" : ""
                          } ${selectionMode === "add" ? "cursor-pointer" : ""} ${day.date === todayStr ? "bg-[var(--color-accent)]/[0.03]" : ""}`}
                          onClick={selectionMode === "add" ? () => toggleCell(cellKey) : undefined}
                        >
                          {/* Cell hover buttons (bottom-right) */}
                          <div className="absolute bottom-0.5 right-0.5 flex gap-1 opacity-0 group-hover/cell:opacity-100 z-10">
                            {/* Copy cell (all blocks) */}
                            {hasContent && (
                              <button type="button"
                                onClick={(e) => { e.stopPropagation(); const entries = collectCellBlocks(u.id, day.date); if (entries.length > 0) { setClipboard({ type: "block", entries }); toast({ type: "success", message: `Copied ${entries.length} schedule${entries.length > 1 ? "s" : ""}` }); } }}
                                className="w-7 h-7 rounded-lg bg-[var(--color-surface)]/90 border border-[var(--color-border)] text-[var(--color-text-muted)] shadow-sm flex items-center justify-center hover:text-[var(--color-accent)] hover:border-[var(--color-accent)] transition-colors"
                                title="Copy cell">
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
                              </button>
                            )}
                            {/* Paste */}
                            {clipboard && (
                              <button type="button"
                                onClick={(e) => { e.stopPropagation(); pasteToCell(u.id, day.date); }}
                                className="w-7 h-7 rounded-lg bg-[var(--color-accent-muted)] border border-[var(--color-accent)] text-[var(--color-accent)] shadow-sm flex items-center justify-center hover:bg-[var(--color-accent)] hover:text-white transition-colors"
                                title="Paste">
                                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 2H9a1 1 0 0 0-1 1v2c0 .6.4 1 1 1h6c.6 0 1-.4 1-1V3c0-.6-.4-1-1-1Z" /><path d="M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2" /></svg>
                              </button>
                            )}
                            {/* Add */}
                            <button type="button"
                              onClick={(e) => { e.stopPropagation(); setSelectedCells(new Set([cellKey])); setApplyModalOpen(true); }}
                              className="w-7 h-7 rounded-lg bg-[var(--color-surface)]/90 border border-[var(--color-border)] text-[var(--color-accent)] shadow-sm flex items-center justify-center text-[14px] hover:bg-[var(--color-accent)] hover:text-white hover:border-[var(--color-accent)] transition-colors"
                              title="Add schedule">+</button>
                          </div>
                          {hasContent ? (
                            <div className="flex flex-col gap-1">
                              {/* Server schedules */}
                              {cellSchedules.map((rawS) => {
                                const s = getEffectiveSchedule(rawS);
                                const deleted = isDeleted(s.id);
                                const modified = isModified(s.id);
                                const blockSelected = selectionMode === "edit" && selectedBlockIds.has(s.id);
                                return (
                                  <div key={s.id} className={`group/block relative ${blockSelected ? "ring-2 ring-[var(--color-accent)] rounded-lg" : ""}`}>
                                    {/* Hover action buttons (top-right) */}
                                    <div className="absolute -top-1 -right-1 z-10 flex gap-0.5 opacity-0 group-hover/block:opacity-100 transition-opacity">
                                      {deleted ? (
                                        <button type="button" onClick={(e) => { e.stopPropagation(); revertSingle(s.id); }} title="Undo delete"
                                          className="w-7 h-7 rounded-full bg-[var(--color-accent)] text-white flex items-center justify-center shadow-sm">
                                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7v6h6" /><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" /></svg>
                                        </button>
                                      ) : (
                                        <>
                                          {modified && (
                                            <button type="button" onClick={(e) => { e.stopPropagation(); revertSingle(s.id); }} title="Revert edit"
                                              className="w-7 h-7 rounded-full bg-[var(--color-accent)] text-white flex items-center justify-center shadow-sm">
                                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7v6h6" /><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" /></svg>
                                            </button>
                                          )}
                                          <button type="button" onClick={(e) => { e.stopPropagation(); const eff = getEffectiveSchedule(s); copyBlock({ workRoleId: eff.work_role_id, workRoleName: eff.work_role_name, startTime: eff.start_time ?? "", endTime: eff.end_time ?? "", breakStartTime: eff.break_start_time, breakEndTime: eff.break_end_time }); }} title="Copy"
                                            className="w-7 h-7 rounded-full bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-secondary)] flex items-center justify-center shadow-sm hover:bg-[var(--color-accent)] hover:text-white hover:border-[var(--color-accent)]">
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
                                          </button>
                                          <button type="button" onClick={(e) => { e.stopPropagation(); setDirectEditIds([s.id]); setBlockEditModalOpen(true); }} title="Edit"
                                            className="w-7 h-7 rounded-full bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-secondary)] flex items-center justify-center shadow-sm hover:bg-[var(--color-accent)] hover:text-white hover:border-[var(--color-accent)]">
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.85 0 114 4L7.5 20.5 2 22l1.5-5.5Z" /></svg>
                                          </button>
                                          <button type="button" onClick={(e) => { e.stopPropagation(); deleteSingle(s.id); }} title="Delete"
                                            className="w-7 h-7 rounded-full bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-danger)] flex items-center justify-center shadow-sm hover:bg-[var(--color-danger)] hover:text-white hover:border-[var(--color-danger)]">
                                            <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="3" x2="11" y2="11" /><line x1="11" y1="3" x2="3" y2="11" /></svg>
                                          </button>
                                        </>
                                      )}
                                    </div>
                                    {/* Status badges */}
                                    {modified && !deleted && (
                                      <span className="absolute -top-1 -left-1 z-10 text-[8px] px-1 py-0.5 rounded bg-[var(--color-accent)] text-white font-semibold pointer-events-none">Edited</span>
                                    )}
                                    {deleted && (
                                      <span className="absolute -top-1 -left-1 z-10 text-[8px] px-1 py-0.5 rounded bg-[var(--color-danger)] text-white font-semibold pointer-events-none">Deleted</span>
                                    )}
                                    {/* Block — deleted: red border + line-through, NOT opacity */}
                                    <div className={deleted ? "rounded-md border-[1.5px] border-[var(--color-danger)] bg-[var(--color-danger-muted)] px-2 py-1.5 [&_*]:line-through [&_*]:text-[var(--color-text-muted)]" : ""}>
                                      <ScheduleBlock
                                        schedule={s}
                                        showCost={isGMView}
                                        currentStoreId={storeId}
                                        onClick={(e) => {
                                          if (selectionMode === "edit") {
                                            e.stopPropagation();
                                            toggleBlock(s.id);
                                          }
                                        }}
                                      />
                                    </div>
                                  </div>
                                );
                              })}
                              {/* Preview blocks */}
                              {cellPreviews.map((p) => {
                                const blockSelected = selectionMode === "edit" && selectedBlockIds.has(p.tempId);
                                // Conflict detection: check overlap with active existing schedules
                                const pStart = parseTimeToHours(p.startTime);
                                const pEnd = parseTimeToHours(p.endTime);
                                const activeExisting = cellSchedules.filter((s) => !isDeleted(s.id));
                                const hasConflict = activeExisting.some((s) => {
                                  const es = parseTimeToHours(getEffectiveSchedule(s).start_time);
                                  const ee = parseTimeToHours(getEffectiveSchedule(s).end_time);
                                  return pStart < ee && pEnd > es;
                                });
                                // Cost
                                const pHours = Math.max(0, pEnd - pStart);
                                const pUser = allUsers.find((u) => u.id === p.userId);
                                const pRate = pUser?.hourly_rate ?? pUser?.effective_hourly_rate ?? 0;
                                const pCost = pHours * pRate;
                                // Break 제외
                                const bStart = parseTimeToHours(p.breakStartTime);
                                const bEnd = parseTimeToHours(p.breakEndTime);
                                const breakHrs = (p.breakStartTime && p.breakEndTime) ? Math.max(0, bEnd - bStart) : 0;
                                const netCost = (pHours - breakHrs) * pRate;
                                return (
                                  <div key={p.tempId}
                                    className={`group/block relative rounded-md border-[1.5px] border-dashed px-2 py-1.5 cursor-pointer transition-shadow hover:shadow-[0_2px_8px_rgba(0,0,0,0.08)] ${
                                      hasConflict
                                        ? "border-[var(--color-danger)] bg-[var(--color-danger-muted)]"
                                        : "border-[var(--color-accent)] bg-[var(--color-accent-muted)]"
                                    } ${blockSelected ? "ring-2 ring-[var(--color-accent)]" : ""}`}
                                    onClick={(e) => { if (selectionMode === "edit") { e.stopPropagation(); toggleBlock(p.tempId); } }}
                                  >
                                    {/* Hover: edit + remove */}
                                    <div className="absolute -top-1 -right-1 z-10 flex gap-0.5 opacity-0 group-hover/block:opacity-100 transition-opacity">
                                      <button type="button" onClick={(e) => { e.stopPropagation(); copyBlock({ workRoleId: p.workRoleId, workRoleName: p.workRoleName, startTime: p.startTime, endTime: p.endTime, breakStartTime: p.breakStartTime, breakEndTime: p.breakEndTime }); }} title="Copy"
                                        className="w-7 h-7 rounded-full bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-secondary)] flex items-center justify-center shadow-sm hover:bg-[var(--color-accent)] hover:text-white hover:border-[var(--color-accent)]">
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
                                      </button>
                                      <button type="button" onClick={(e) => { e.stopPropagation(); setDirectEditIds([p.tempId]); setBlockEditModalOpen(true); }} title="Edit"
                                        className="w-7 h-7 rounded-full bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-text-secondary)] flex items-center justify-center shadow-sm hover:bg-[var(--color-accent)] hover:text-white hover:border-[var(--color-accent)]">
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.85 0 114 4L7.5 20.5 2 22l1.5-5.5Z" /></svg>
                                      </button>
                                      <button type="button" onClick={(e) => { e.stopPropagation(); revertSingle(p.tempId); }} title="Remove"
                                        className="w-7 h-7 rounded-full bg-[var(--color-surface)] border border-[var(--color-border)] text-[var(--color-danger)] flex items-center justify-center shadow-sm hover:bg-[var(--color-danger)] hover:text-white hover:border-[var(--color-danger)]">
                                        <svg width="12" height="12" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="3" x2="11" y2="11" /><line x1="11" y1="3" x2="3" y2="11" /></svg>
                                      </button>
                                    </div>
                                    <div className="flex items-center justify-between gap-1">
                                      <span className={`text-[11px] font-semibold truncate flex-1 min-w-0 ${hasConflict ? "text-[var(--color-danger)]" : "text-[var(--color-accent)]"}`}>
                                        {p.workRoleName ?? "No role"}
                                      </span>
                                      <span className={`text-[9px] px-1 py-0.5 rounded font-semibold shrink-0 ${hasConflict ? "bg-[var(--color-danger)] text-white" : "bg-[var(--color-accent)] text-white"}`}>
                                        {hasConflict ? "Conflict!" : "New"}
                                      </span>
                                    </div>
                                    <div className="text-[10px] text-[var(--color-text-secondary)] tabular-nums mt-0.5">
                                      {p.startTime} – {p.endTime}
                                    </div>
                                    {isGMView && netCost > 0 && (
                                      <div className="text-[10px] text-[var(--color-success)] font-semibold mt-0.5">${netCost.toFixed(0)}</div>
                                    )}
                                    {isGMView && pRate === 0 && (
                                      <div className="text-[10px] text-[var(--color-danger)] mt-0.5">No rate</div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="h-full min-h-[44px]" />
                          )}
                        </td>
                      );
                    })}

                    {/* Total */}
                    <td className="px-2 py-3 text-center border-l border-[var(--color-border)]">
                      {(() => {
                        const rate = getUserRate(u.id);
                        let existHrs = 0;
                        let existCost = 0;
                        let pvHrs = 0;
                        let pvCost = 0;
                        for (const d of weekDates) {
                          for (const s of getSchedulesForCell(u.id, d.date)) {
                            if (isDeleted(s.id)) continue;
                            const eff = getEffectiveSchedule(s);
                            const h = getNetHours(eff.start_time, eff.end_time, eff.break_start_time, eff.break_end_time);
                            existHrs += h;
                            existCost += h * (eff.hourly_rate ?? 0);
                          }
                          for (const p of getPreviewsForCell(u.id, d.date)) {
                            const h = getNetHours(p.startTime, p.endTime, p.breakStartTime, p.breakEndTime);
                            pvHrs += h;
                            pvCost += h * rate;
                          }
                        }
                        const totalHrs = existHrs + pvHrs;
                        const isOvertime = totalHrs > 40;
                        const fmtH = (h: number) => { const r = Math.round(h * 10) / 10; return r % 1 === 0 ? String(r) : r.toFixed(1); };
                        return (
                          <div className="flex flex-col items-center">
                            {existHrs > 0 && <span className="text-[13px] font-bold text-[var(--color-success)]">{fmtH(existHrs)}h</span>}
                            {pvHrs > 0 && <span className="text-[10px] font-semibold text-[var(--color-accent)]">+{fmtH(pvHrs)}h</span>}
                            {isGMView && existCost > 0 && <span className="text-[10px] text-[var(--color-success)]">${existCost.toFixed(0)}</span>}
                            {isGMView && pvCost > 0 && <span className="text-[10px] text-[var(--color-accent)]">+${pvCost.toFixed(0)}</span>}
                            {existHrs === 0 && pvHrs === 0 && <span className="text-[11px] text-[var(--color-text-muted)]">--</span>}
                            {isOvertime && <span className="text-[9px] px-1 py-0.5 rounded bg-[var(--color-warning-muted)] text-[var(--color-warning)] font-semibold mt-0.5">OT</span>}
                          </div>
                        );
                      })()}
                    </td>
                  </tr>
                  );
                })}
              </tbody>

            </table>
          </div>
        </div>
      </div>

      {/* ── Bottom Action Bar (sticky) ───────────── */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-[var(--color-surface)] border-t border-[var(--color-border)] shadow-[0_-4px_12px_rgba(0,0,0,0.1)]">
        <div className="flex items-center gap-2 px-4 lg:px-6 py-3">
          {/* Left: change summary */}
          <div className="flex items-center gap-3 text-[11px] flex-wrap">
            {previewEntries.length > 0 && (
              <span className="text-[var(--color-accent)] font-semibold">{previewEntries.length} new</span>
            )}
            {modifiedSchedules.size > 0 && (
              <span className="text-[var(--color-text)] font-semibold">{modifiedSchedules.size} edited</span>
            )}
            {deletedScheduleIds.size > 0 && (
              <span className="text-[var(--color-danger)] font-semibold">{deletedScheduleIds.size} deleted</span>
            )}
            {weeklyAgg.previewHrs > 0 && (
              <span className="text-[var(--color-text-secondary)]">+{Math.round(weeklyAgg.previewHrs * 10) / 10}h</span>
            )}
            {isGMView && weeklyAgg.previewCost > 0 && (
              <span className="text-[var(--color-text-secondary)]">+${weeklyAgg.previewCost.toFixed(0)}</span>
            )}
          </div>

          {/* Right: actions */}
          <div className="flex items-center gap-2 ml-auto">
          <button type="button" onClick={() => { if (totalChanges > 0) setCancelConfirmOpen(true); else onExit(); }} disabled={isSaving}
            className="px-4 py-2 rounded-lg text-[13px] font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] transition-colors">
            Cancel
          </button>
          <button type="button" onClick={() => setSaveConfirmOpen(true)} disabled={totalChanges === 0 || isSaving}
            className="px-5 py-2 rounded-lg text-[13px] font-semibold bg-[var(--color-success)] text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
            {isSaving ? "Saving…" : `Save (${totalChanges})`}
          </button>
          </div>
        </div>
      </div>

      {/* ── Modals ─────────────────────────────────── */}
      <ApplyToSelectedModal
        open={applyModalOpen}
        selectedCells={selectedCells}
        users={filteredUsers}
        workRoles={workRoles}
        stores={stores}
        storeId={storeId}
        onClose={() => setApplyModalOpen(false)}
        onApply={handleApplyPreviews}
      />

      <BlockEditModal
        open={blockEditModalOpen}
        selectedSchedules={selectedForEdit}
        workRoles={workRoles}
        isSubmitting={false}
        onClose={() => { setBlockEditModalOpen(false); setDirectEditIds([]); }}
        onApply={handleEditApply}
      />

      {/* Delete confirm */}
      {deleteConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setDeleteConfirmOpen(false)} />
          <div className="relative bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl shadow-2xl w-[min(420px,96vw)] p-6">
            <h2 className="text-[16px] font-semibold text-[var(--color-text)] mb-2">Delete {selectedBlockIds.size} items?</h2>
            <p className="text-[13px] text-[var(--color-text-secondary)] mb-5">
              Marked for deletion until you Save. Use Discard All to undo.
            </p>
            <div className="flex items-center justify-end gap-2">
              <button type="button" onClick={() => setDeleteConfirmOpen(false)}
                className="px-4 py-2 rounded-lg text-[13px] font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] transition-colors">
                Cancel
              </button>
              <button type="button" onClick={handleDeleteSelected}
                className="px-5 py-2 rounded-lg text-[13px] font-semibold bg-[var(--color-danger)] text-white hover:opacity-90 transition-colors">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Discard All confirm */}
      {discardAllConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setDiscardAllConfirmOpen(false)} />
          <div className="relative bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl shadow-2xl w-[min(420px,96vw)] p-6">
            <h2 className="text-[16px] font-semibold text-[var(--color-text)] mb-2">Discard All Changes?</h2>
            <p className="text-[13px] text-[var(--color-text-secondary)] mb-5">
              This will discard all {totalChanges} unsaved change{totalChanges !== 1 ? "s" : ""} (added, edited, and deleted items).
            </p>
            <div className="flex items-center justify-end gap-2">
              <button type="button" onClick={() => setDiscardAllConfirmOpen(false)}
                className="px-4 py-2 rounded-lg text-[13px] font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] transition-colors">
                Keep Changes
              </button>
              <button type="button" onClick={() => { clearAll(); setDiscardAllConfirmOpen(false); }}
                className="px-5 py-2 rounded-lg text-[13px] font-semibold bg-[var(--color-danger)] text-white hover:opacity-90 transition-colors">
                Discard All
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel confirm (unsaved changes) */}
      {cancelConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60" onClick={() => setCancelConfirmOpen(false)} />
          <div className="relative bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl shadow-2xl w-[min(420px,96vw)] p-6">
            <h2 className="text-[16px] font-semibold text-[var(--color-text)] mb-2">Leave Bulk Mode?</h2>
            <p className="text-[13px] text-[var(--color-text-secondary)] mb-5">
              You have {totalChanges} unsaved change{totalChanges !== 1 ? "s" : ""}. All changes will be lost.
            </p>
            <div className="flex items-center justify-end gap-2">
              <button type="button" onClick={() => setCancelConfirmOpen(false)}
                className="px-4 py-2 rounded-lg text-[13px] font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] transition-colors">
                Stay
              </button>
              <button type="button" onClick={() => { setCancelConfirmOpen(false); onExit(); }}
                className="px-5 py-2 rounded-lg text-[13px] font-semibold bg-[var(--color-danger)] text-white hover:opacity-90 transition-colors">
                Leave Without Saving
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Save review modal — detailed list with checkboxes */}
      {saveConfirmOpen && <SaveReviewModal
        previewEntries={previewEntries}
        modifiedSchedules={modifiedSchedules}
        deletedScheduleIds={deletedScheduleIds}
        weekSchedules={weekSchedules}
        allUsers={allUsers}
        storeId={storeId}
        isSaving={isSaving}
        onClose={() => setSaveConfirmOpen(false)}
        onConfirm={(excluded) => { setSaveConfirmOpen(false); handleSave(excluded); }}
      />}
    </div>
  );
}

// ─── Save Review Modal ──────────────────────────────

function fmtDateShort(d: string): string {
  const dt = new Date(d + "T00:00:00");
  return dt.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

interface SaveReviewModalProps {
  previewEntries: PreviewEntry[];
  modifiedSchedules: Map<string, ScheduleModification>;
  deletedScheduleIds: Set<string>;
  weekSchedules: Schedule[];
  allUsers: User[];
  storeId: string;
  isSaving: boolean;
  onClose: () => void;
  onConfirm: (excluded: Set<string>) => void;
}

function SaveReviewModal({
  previewEntries,
  modifiedSchedules,
  deletedScheduleIds,
  weekSchedules,
  allUsers,
  storeId,
  isSaving,
  onClose,
  onConfirm,
}: SaveReviewModalProps) {
  const [excluded, setExcluded] = useState<Set<string>>(new Set());

  // Call POST /bulk/preview for conflict + overtime validation
  const previewMutation = useBulkPreviewSchedules();
  useEffect(() => {
    if (previewEntries.length === 0) return;
    const entries = previewEntries.map((e) => ({
      user_id: e.userId,
      store_id: e.storeId || storeId,
      work_role_id: e.workRoleId,
      work_date: e.workDate,
      start_time: e.startTime,
      end_time: e.endTime,
      break_start_time: e.breakStartTime,
      break_end_time: e.breakEndTime,
    }));
    previewMutation.mutate({ entries });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const conflicts = previewMutation.data?.conflicts ?? [];
  const warnings = previewMutation.data?.warnings ?? [];
  const hasConflicts = conflicts.filter((c) => !excluded.has(previewEntries[c.index]?.tempId ?? "")).length > 0;

  function toggle(id: string) {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const creates = previewEntries.filter((e) => !excluded.has(e.tempId));
  const updates = Array.from(modifiedSchedules.keys()).filter((id) => !excluded.has(id));
  const deletes = Array.from(deletedScheduleIds).filter((id) => !excluded.has(id));
  const activeCount = creates.length + updates.length + deletes.length;

  function userName(userId: string): string {
    return allUsers.find((u) => u.id === userId)?.full_name ?? "Unknown";
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-[var(--color-surface)] border border-[var(--color-border)] rounded-2xl shadow-2xl w-[min(640px,96vw)] max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)]">
          <div>
            <h2 className="text-[16px] font-semibold text-[var(--color-text)]">Review Changes</h2>
            <p className="text-[12px] text-[var(--color-text-secondary)] mt-0.5">
              Uncheck items to exclude from this save
            </p>
          </div>
          <button type="button" onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] transition-colors">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="1" y1="1" x2="13" y2="13" /><line x1="13" y1="1" x2="1" y2="13" /></svg>
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto flex-1 divide-y divide-[var(--color-border)]">
          {/* Creates */}
          {previewEntries.length > 0 && (
            <div className="px-5 py-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-7 h-7 rounded-full bg-[var(--color-success-muted)] text-[var(--color-success)] flex items-center justify-center text-[11px] font-bold">+</span>
                <span className="text-[13px] font-semibold text-[var(--color-text)]">New ({creates.length})</span>
              </div>
              <div className="space-y-1">
                {previewEntries.map((e) => {
                  const off = excluded.has(e.tempId);
                  return (
                    <label key={e.tempId} className={`flex items-center gap-2.5 px-2 py-1.5 rounded-lg cursor-pointer hover:bg-[var(--color-surface-hover)] transition-colors ${off ? "opacity-40" : ""}`}>
                      <input type="checkbox" checked={!off} onChange={() => toggle(e.tempId)} className="w-4 h-4 accent-[var(--color-accent)] shrink-0" />
                      <div className="flex-1 min-w-0">
                        <span className="text-[12px] font-semibold text-[var(--color-text)]">{userName(e.userId)}</span>
                        <span className="text-[11px] text-[var(--color-text-muted)] ml-2">{fmtDateShort(e.workDate)}</span>
                      </div>
                      <span className="text-[11px] text-[var(--color-text-secondary)] tabular-nums shrink-0">{e.startTime} – {e.endTime}</span>
                      {e.workRoleName && <span className="text-[10px] text-[var(--color-accent)] font-semibold shrink-0 max-w-[100px] truncate">{e.workRoleName}</span>}
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/* Updates */}
          {modifiedSchedules.size > 0 && (
            <div className="px-5 py-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-7 h-7 rounded-full bg-[var(--color-accent-muted)] text-[var(--color-accent)] flex items-center justify-center text-[11px] font-bold">~</span>
                <span className="text-[13px] font-semibold text-[var(--color-text)]">Updated ({updates.length})</span>
              </div>
              <div className="space-y-1">
                {Array.from(modifiedSchedules.entries()).map(([id, mod]) => {
                  const off = excluded.has(id);
                  const s = weekSchedules.find((x) => x.id === id);
                  return (
                    <label key={id} className={`flex items-center gap-2.5 px-2 py-1.5 rounded-lg cursor-pointer hover:bg-[var(--color-surface-hover)] transition-colors ${off ? "opacity-40" : ""}`}>
                      <input type="checkbox" checked={!off} onChange={() => toggle(id)} className="w-4 h-4 accent-[var(--color-accent)] shrink-0" />
                      <div className="flex-1 min-w-0">
                        <span className="text-[12px] font-semibold text-[var(--color-text)]">{s?.user_name ?? "Unknown"}</span>
                        <span className="text-[11px] text-[var(--color-text-muted)] ml-2">{s ? fmtDateShort(s.work_date) : ""}</span>
                      </div>
                      <span className="text-[11px] text-[var(--color-text-secondary)] tabular-nums shrink-0">
                        {mod.startTime ?? s?.start_time} – {mod.endTime ?? s?.end_time}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/* Deletes */}
          {deletedScheduleIds.size > 0 && (
            <div className="px-5 py-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="w-7 h-7 rounded-full bg-[var(--color-danger-muted)] text-[var(--color-danger)] flex items-center justify-center text-[11px] font-bold">−</span>
                <span className="text-[13px] font-semibold text-[var(--color-text)]">Deleted ({deletes.length})</span>
              </div>
              <div className="space-y-1">
                {Array.from(deletedScheduleIds).map((id) => {
                  const off = excluded.has(id);
                  const s = weekSchedules.find((x) => x.id === id);
                  return (
                    <label key={id} className={`flex items-center gap-2.5 px-2 py-1.5 rounded-lg cursor-pointer hover:bg-[var(--color-surface-hover)] transition-colors ${off ? "opacity-40" : ""}`}>
                      <input type="checkbox" checked={!off} onChange={() => toggle(id)} className="w-4 h-4 accent-[var(--color-accent)] shrink-0" />
                      <div className="flex-1 min-w-0">
                        <span className="text-[12px] font-semibold text-[var(--color-text)] line-through">{s?.user_name ?? "Unknown"}</span>
                        <span className="text-[11px] text-[var(--color-text-muted)] ml-2">{s ? fmtDateShort(s.work_date) : ""}</span>
                      </div>
                      <span className="text-[11px] text-[var(--color-text-secondary)] tabular-nums shrink-0 line-through">
                        {s?.start_time} – {s?.end_time}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Conflicts & Warnings from server preview */}
        {(conflicts.length > 0 || warnings.length > 0) && (
          <div className="px-5 py-3 border-t border-[var(--color-border)] bg-[var(--color-bg)]">
            {conflicts.length > 0 && (
              <div className="mb-2">
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="w-4 h-4 rounded-full bg-[var(--color-danger)] text-white flex items-center justify-center text-[10px] font-bold">!</span>
                  <span className="text-[12px] font-semibold text-[var(--color-danger)]">Conflicts ({conflicts.length})</span>
                </div>
                <div className="space-y-0.5 pl-6">
                  {conflicts.slice(0, 5).map((c) => {
                    const entry = previewEntries[c.index];
                    return (
                      <div key={c.index} className="text-[11px] text-[var(--color-danger)]">
                        {entry ? `${userName(entry.userId)} ${fmtDateShort(entry.workDate)}` : `Entry #${c.index}`}: {c.message}
                      </div>
                    );
                  })}
                  {conflicts.length > 5 && <div className="text-[11px] text-[var(--color-text-muted)]">...and {conflicts.length - 5} more</div>}
                </div>
              </div>
            )}
            {warnings.length > 0 && (
              <div>
                <div className="flex items-center gap-1.5 mb-1">
                  <span className="w-4 h-4 rounded-full bg-[var(--color-warning)] text-white flex items-center justify-center text-[10px] font-bold">⚠</span>
                  <span className="text-[12px] font-semibold text-[var(--color-warning)]">Overtime Warnings ({warnings.length})</span>
                </div>
                <div className="space-y-0.5 pl-6">
                  {warnings.map((w) => (
                    <div key={w.user_id} className="text-[11px] text-[var(--color-warning)]">
                      {userName(w.user_id)}: {Math.round(w.total_minutes / 60)}h / {Math.round(w.limit_minutes / 60)}h weekly
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-[var(--color-border)]">
          <span className="text-[12px] text-[var(--color-text-secondary)]">
            {activeCount} of {previewEntries.length + modifiedSchedules.size + deletedScheduleIds.size} items
            {hasConflicts && <span className="text-[var(--color-danger)] font-semibold ml-1">· Resolve conflicts to save</span>}
          </span>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose}
              className="px-4 py-2 rounded-lg text-[13px] font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] transition-colors">
              Cancel
            </button>
            <button type="button" onClick={() => onConfirm(excluded)} disabled={activeCount === 0 || isSaving || hasConflicts}
              title={hasConflicts ? "Resolve or exclude conflicting items first" : undefined}
              className="px-5 py-2 rounded-lg text-[13px] font-semibold bg-[var(--color-success)] text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
              {isSaving ? "Saving…" : `Save ${activeCount} Changes`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
