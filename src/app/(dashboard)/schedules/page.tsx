"use client";

/**
 * 배정 스케줄 페이지 (기본 화면) -- 매장별 Shift×Position 조합으로 워커를 배치합니다.
 *
 * Schedule page (default view) showing all Store → Shift × Position combos with
 * worker cards and inline assignment creation. Supports multiple
 * workers per combo.
 */

import React, { useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Plus, List, FileText, X, ChevronLeft, ChevronRight, Calendar, Edit, Trash2, Search, Camera, Type, Settings } from "lucide-react";
import { useStores } from "@/hooks/useStores";
import { useUsers } from "@/hooks/useUsers";
import { useShifts } from "@/hooks/useShifts";
import { usePositions } from "@/hooks/usePositions";
import { useChecklistTemplates, useChecklistItems } from "@/hooks/useChecklists";
import {
  useAssignments,
  useCreateAssignment,
  useDeleteAssignment,
  useBulkCreateAssignments,
  useRecentAssignmentUsers,
} from "@/hooks/useAssignments";
import { Button, Card, Badge, Modal, ConfirmDialog } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import type {
  Store,
  User,
  Shift,
  Position,
  ChecklistTemplate,
  ChecklistItem,
  Assignment,
} from "@/types";
import { cn, formatFixedDateWithDay, parseApiError, todayInTimezone } from "@/lib/utils";
import { useTimezone } from "@/hooks/useTimezone";

// ─── View mode types ────────────────────────────────────

type ViewMode = "day" | "week" | "month";

// ─── Date helpers ───────────────────────────────────────

function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function shiftDate(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return toDateStr(d);
}

/** 주의 일요일~토요일 날짜 배열 반환 (Return Sun-Sat date array for the week) */
function getWeekDays(dateStr: string): string[] {
  const d = new Date(dateStr + "T00:00:00");
  const dayOfWeek = d.getDay(); // 0=Sun, 1=Mon, ...
  const sunday = new Date(d);
  sunday.setDate(d.getDate() - dayOfWeek);
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(sunday);
    day.setDate(sunday.getDate() + i);
    return toDateStr(day);
  });
}

/** 월 달력 그리드 반환: 6×7 배열 (Return 6×7 month calendar grid) */
function getMonthCalendar(dateStr: string): string[][] {
  const d = new Date(dateStr + "T00:00:00");
  const year = d.getFullYear();
  const month = d.getMonth();
  const firstDay = new Date(year, month, 1);
  const dayOfWeek = firstDay.getDay(); // 0=Sun
  const startOffset = -dayOfWeek;
  const start = new Date(firstDay);
  start.setDate(firstDay.getDate() + startOffset);

  const weeks: string[][] = [];
  const cursor = new Date(start);
  for (let w = 0; w < 6; w++) {
    const week: string[] = [];
    for (let d = 0; d < 7; d++) {
      week.push(toDateStr(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);
  }
  return weeks;
}

/** 날짜 포맷: "Mon", "Tue" 등 (Format short day name) */
function shortDayName(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short" });
}

/** 날짜 포맷: "2/24" (Format MM/DD) */
function shortDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/** 월 이름 포맷: "February 2026" (Format month name) */
function monthYearLabel(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

/** 주 범위 라벨: "Feb 24 - Mar 2, 2026" */
function weekRangeLabel(weekDays: string[]): string {
  const start = new Date(weekDays[0] + "T00:00:00");
  const end = new Date(weekDays[6] + "T00:00:00");
  const startStr = start.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const endStr = end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return `${startStr} - ${endStr}`;
}

// ─── Status config ──────────────────────────────────────

const statusConfig: Record<
  string,
  { label: string; variant: "default" | "warning" | "success" }
> = {
  assigned: { label: "Pending", variant: "default" },
  in_progress: { label: "Active", variant: "warning" },
  completed: { label: "Done", variant: "success" },
};

const progressColor: Record<string, string> = {
  assigned: "bg-text-muted",
  in_progress: "bg-accent",
  completed: "bg-success",
};

// ─── Worker Card ────────────────────────────────────────

function WorkerCard({
  assignment,
  onReassign,
  onDelete,
  onClick,
}: {
  assignment: Assignment;
  onReassign: (assignment: Assignment) => void;
  onDelete: (assignment: Assignment) => void;
  onClick: (assignment: Assignment) => void;
}): React.ReactElement {
  const pct: number =
    assignment.total_items > 0
      ? Math.round(
          (assignment.completed_items / assignment.total_items) * 100,
        )
      : 0;
  const cfg = statusConfig[assignment.status] ?? statusConfig.assigned;
  const bar: string = progressColor[assignment.status] ?? "bg-accent";

  return (
    <div
      className="w-52 p-3.5 bg-card rounded-xl border border-border space-y-2.5 group relative cursor-pointer hover:border-accent/50 transition-colors"
      onClick={() => onClick(assignment)}
    >
      {/* Action buttons - visible on hover */}
      <div className="absolute top-2 right-2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onReassign(assignment); }}
          className="p-1 rounded-md text-text-muted hover:text-text hover:bg-surface-hover transition-colors"
          aria-label={`Reassign ${assignment.user_name}`}
        >
          <Edit className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDelete(assignment); }}
          className="p-1 rounded-md text-text-muted hover:text-danger hover:bg-danger-muted transition-colors"
          aria-label={`Remove ${assignment.user_name}`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      <p className="text-sm font-semibold text-text truncate pr-12">
        {assignment.user_name}
      </p>
      <div className="w-full h-1.5 bg-surface rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all", bar)}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-text-secondary">
          {assignment.completed_items}/{assignment.total_items}
        </span>
        <Badge variant={cfg.variant}>{cfg.label}</Badge>
      </div>
    </div>
  );
}

// ─── Bulk Assign Modal ──────────────────────────────────

function BulkAssignModal({
  isOpen,
  onClose,
  storeId,
  shiftId,
  positionId,
  date,
  users,
  existingAssignments,
  recentUserIds,
}: {
  isOpen: boolean;
  onClose: () => void;
  storeId: string;
  shiftId: string;
  positionId: string;
  date: string;
  users: User[];
  existingAssignments: Assignment[];
  recentUserIds: Set<string>;
}): React.ReactElement {
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const { toast } = useToast();
  const bulkCreate = useBulkCreateAssignments();

  const assignedUserIds: Set<string> = useMemo(
    () => new Set(existingAssignments.map((a: Assignment) => a.user_id)),
    [existingAssignments],
  );

  // Sort: staff first, then recently assigned first within each group
  const sortedAndFilteredUsers: User[] = useMemo(() => {
    let list: User[] = users;
    if (searchQuery.trim()) {
      const q: string = searchQuery.toLowerCase();
      list = list.filter((u: User) => u.full_name.toLowerCase().includes(q));
    }
    return [...list].sort((a: User, b: User) => {
      // Already assigned always at bottom
      const aAssigned: boolean = assignedUserIds.has(a.id);
      const bAssigned: boolean = assignedUserIds.has(b.id);
      if (aAssigned !== bAssigned) return aAssigned ? 1 : -1;
      // Recent users first
      const aRecent: boolean = recentUserIds.has(a.id);
      const bRecent: boolean = recentUserIds.has(b.id);
      if (aRecent !== bRecent) return aRecent ? -1 : 1;
      // Higher role_priority first: staff(4) → supervisor(3) → manager(2) → admin(1)
      if (a.role_priority !== b.role_priority) return b.role_priority - a.role_priority;
      // Alphabetical
      return a.full_name.localeCompare(b.full_name);
    });
  }, [users, searchQuery, assignedUserIds, recentUserIds]);

  const toggleUser = useCallback((userId: string): void => {
    setSelectedIds((prev: string[]) =>
      prev.includes(userId)
        ? prev.filter((id: string) => id !== userId)
        : [...prev, userId],
    );
  }, []);

  const handleAssign = useCallback(async (): Promise<void> => {
    if (selectedIds.length === 0) return;
    try {
      await bulkCreate.mutateAsync({
        store_id: storeId,
        shift_id: shiftId,
        position_id: positionId,
        user_ids: selectedIds,
        work_date: date,
      });
      toast({
        type: "success",
        message: `${selectedIds.length} worker(s) assigned!`,
      });
      setSelectedIds([]);
      setSearchQuery("");
      onClose();
    } catch (err) {
      toast({ type: "error", message: parseApiError(err, "Failed to assign workers.") });
    }
  }, [selectedIds, bulkCreate, storeId, shiftId, positionId, date, toast, onClose]);

  const handleClose = useCallback((): void => {
    setSelectedIds([]);
    setSearchQuery("");
    onClose();
  }, [onClose]);

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Assign Workers" size="lg">
      <div className="space-y-4">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
          <input
            type="text"
            placeholder="Search by name..."
            value={searchQuery}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setSearchQuery(e.target.value)
            }
            className="w-full pl-9 pr-3 py-2 text-sm bg-surface border border-border rounded-lg text-text placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>

        {/* Worker list */}
        <div className="max-h-64 overflow-y-auto border border-border rounded-lg divide-y divide-border">
          {sortedAndFilteredUsers.length === 0 ? (
            <p className="text-sm text-text-muted text-center py-4">
              No workers found.
            </p>
          ) : (
            sortedAndFilteredUsers.map((user: User) => {
              const isAssigned: boolean = assignedUserIds.has(user.id);
              const isSelected: boolean = selectedIds.includes(user.id);
              const isRecent: boolean = recentUserIds.has(user.id);
              return (
                <label
                  key={user.id}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors",
                    isAssigned
                      ? "opacity-50 cursor-not-allowed bg-surface"
                      : "hover:bg-surface-hover",
                    isSelected && !isAssigned && "bg-accent/5",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={isSelected || isAssigned}
                    disabled={isAssigned}
                    onChange={() => !isAssigned && toggleUser(user.id)}
                    className="accent-accent"
                  />
                  <span className="text-sm text-text flex-1">
                    {user.full_name}
                  </span>
                  <span className="flex items-center gap-1.5">
                    {isRecent && !isAssigned && (
                      <Badge variant="warning">Recent</Badge>
                    )}
                    <Badge variant="default">{user.role_name}</Badge>
                    {isAssigned && <Badge variant="default">Assigned</Badge>}
                  </span>
                </label>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-2">
          <span className="text-xs text-text-muted">
            {selectedIds.length} selected
          </span>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleAssign}
              isLoading={bulkCreate.isPending}
              disabled={selectedIds.length === 0}
            >
              {selectedIds.length > 0
                ? `Assign ${selectedIds.length} Worker${selectedIds.length > 1 ? "s" : ""}`
                : "Assign"}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ─── Reassign Modal ─────────────────────────────────────

function ReassignModal({
  isOpen,
  onClose,
  assignment,
  users,
  existingUserIds,
  recentUserIds,
}: {
  isOpen: boolean;
  onClose: () => void;
  assignment: Assignment | null;
  users: User[];
  existingUserIds: Set<string>;
  recentUserIds: Set<string>;
}): React.ReactElement {
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const { toast } = useToast();
  const deleteAssignment = useDeleteAssignment();
  const createAssignment = useCreateAssignment();

  const sortedAndFilteredUsers: User[] = useMemo(() => {
    let list: User[] = users.filter(
      (u: User) => u.id !== assignment?.user_id,
    );
    if (searchQuery.trim()) {
      const q: string = searchQuery.toLowerCase();
      list = list.filter((u: User) =>
        u.full_name.toLowerCase().includes(q),
      );
    }
    return [...list].sort((a: User, b: User) => {
      // Already assigned always at bottom
      const aAssigned: boolean = existingUserIds.has(a.id);
      const bAssigned: boolean = existingUserIds.has(b.id);
      if (aAssigned !== bAssigned) return aAssigned ? 1 : -1;
      // Recent users first
      const aRecent: boolean = recentUserIds.has(a.id);
      const bRecent: boolean = recentUserIds.has(b.id);
      if (aRecent !== bRecent) return aRecent ? -1 : 1;
      // Higher role_priority first: staff(4) → supervisor(3) → manager(2) → admin(1)
      if (a.role_priority !== b.role_priority) return b.role_priority - a.role_priority;
      // Alphabetical
      return a.full_name.localeCompare(b.full_name);
    });
  }, [users, searchQuery, assignment, existingUserIds, recentUserIds]);

  const handleReassign = useCallback(async (): Promise<void> => {
    if (!assignment || !selectedUserId) return;
    setIsProcessing(true);
    try {
      await deleteAssignment.mutateAsync(assignment.id);
      await createAssignment.mutateAsync({
        store_id: assignment.store_id,
        shift_id: assignment.shift_id,
        position_id: assignment.position_id,
        user_id: selectedUserId,
        work_date: assignment.work_date,
      });
      toast({ type: "success", message: "Worker reassigned!" });
      setSelectedUserId(null);
      setSearchQuery("");
      onClose();
    } catch (err) {
      toast({ type: "error", message: parseApiError(err, "Failed to reassign worker.") });
    } finally {
      setIsProcessing(false);
    }
  }, [assignment, selectedUserId, deleteAssignment, createAssignment, toast, onClose]);

  const handleClose = useCallback((): void => {
    setSelectedUserId(null);
    setSearchQuery("");
    onClose();
  }, [onClose]);

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Reassign Worker">
      <div className="space-y-4">
        {/* Current worker */}
        {assignment && (
          <div className="px-3 py-2.5 bg-surface border border-border rounded-lg">
            <p className="text-xs text-text-muted mb-0.5">Current Worker</p>
            <p className="text-sm font-medium text-text">
              {assignment.user_name}
            </p>
          </div>
        )}

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
          <input
            type="text"
            placeholder="Search new worker..."
            value={searchQuery}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setSearchQuery(e.target.value)
            }
            className="w-full pl-9 pr-3 py-2 text-sm bg-surface border border-border rounded-lg text-text placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>

        {/* Worker list */}
        <div className="max-h-48 overflow-y-auto border border-border rounded-lg divide-y divide-border">
          {sortedAndFilteredUsers.length === 0 ? (
            <p className="text-sm text-text-muted text-center py-4">
              No workers found.
            </p>
          ) : (
            sortedAndFilteredUsers.map((user: User) => {
              const alreadyAssigned: boolean = existingUserIds.has(user.id);
              const isRecent: boolean = recentUserIds.has(user.id);
              return (
                <label
                  key={user.id}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors",
                    alreadyAssigned
                      ? "opacity-50 cursor-not-allowed bg-surface"
                      : "hover:bg-surface-hover",
                    selectedUserId === user.id &&
                      !alreadyAssigned &&
                      "bg-accent/5",
                  )}
                >
                  <input
                    type="radio"
                    name="reassign-worker"
                    checked={selectedUserId === user.id}
                    disabled={alreadyAssigned}
                    onChange={() =>
                      !alreadyAssigned && setSelectedUserId(user.id)
                    }
                    className="accent-accent"
                  />
                  <span className="text-sm text-text flex-1">
                    {user.full_name}
                  </span>
                  <span className="flex items-center gap-1.5">
                    {isRecent && !alreadyAssigned && (
                      <Badge variant="warning">Recent</Badge>
                    )}
                    <Badge variant="default">{user.role_name}</Badge>
                    {alreadyAssigned && (
                      <Badge variant="default">Already assigned</Badge>
                    )}
                  </span>
                </label>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleReassign}
            isLoading={isProcessing}
            disabled={!selectedUserId}
          >
            Reassign
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Checklist Preview Modal ────────────────────────────

function ChecklistPreviewModal({
  isOpen,
  onClose,
  template,
}: {
  isOpen: boolean;
  onClose: () => void;
  template: ChecklistTemplate | null;
}): React.ReactElement {
  const { data: items, isLoading } = useChecklistItems(
    isOpen ? template?.id : undefined,
  );

  const verificationIcon: Record<string, React.ReactNode> = {
    photo: <Camera size={12} className="text-accent" />,
    text: <Type size={12} className="text-accent" />,
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={template?.title ?? "Checklist"} size="md">
      <div className="space-y-3">
        {/* Meta info */}
        <div className="flex items-center gap-2 text-xs text-text-muted">
          <span>{template?.shift_name}</span>
          <span>—</span>
          <span>{template?.position_name}</span>
          <span className="ml-auto">{template?.item_count ?? 0} items</span>
        </div>

        {/* Items list */}
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full border-accent border-t-transparent h-6 w-6 border-2" />
          </div>
        ) : !items || items.length === 0 ? (
          <div className="text-center py-8 text-sm text-text-muted">
            No checklist items yet.
          </div>
        ) : (
          <div className="max-h-80 overflow-y-auto divide-y divide-border border border-border rounded-lg">
            {items.map((item: ChecklistItem, idx: number) => (
              <div key={item.id} className="flex items-start gap-3 px-4 py-3">
                <span className="text-xs text-text-muted mt-0.5 w-5 shrink-0 text-right">
                  {idx + 1}.
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-text">{item.title}</p>
                  {item.description && (
                    <p className="text-xs text-text-muted mt-0.5">
                      {item.description}
                    </p>
                  )}
                </div>
                {item.verification_type !== "none" && (
                  <span className="flex items-center gap-1 shrink-0">
                    {verificationIcon[item.verification_type]}
                    <span className="text-[10px] text-text-muted capitalize">
                      {item.verification_type}
                    </span>
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-end pt-1">
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Create Checklist Modal ─────────────────────────────

// ─── Store Schedule Section ─────────────────────────────

function StoreScheduleSection({
  store,
  date,
  users,
}: {
  store: Store;
  date: string;
  users: User[];
}): React.ReactElement | null {
  const router = useRouter();
  const { toast } = useToast();
  const { data: shifts, isLoading: isLoadingShifts } = useShifts(store.id);
  const { data: positions, isLoading: isLoadingPositions } = usePositions(
    store.id,
  );
  const { data: templates } = useChecklistTemplates(store.id);
  const { data: assignmentsData } = useAssignments({
    store_id: store.id,
    work_date: date,
    per_page: 100,
  });

  // Fetch recent users per shift×position combo via dedicated API
  const { data: recentUsersData } = useRecentAssignmentUsers(store.id, date);

  /* ---- Modal state ---- */
  const [deleteTarget, setDeleteTarget] = useState<Assignment | null>(null);
  const [reassignTarget, setReassignTarget] = useState<Assignment | null>(null);
  const [bulkAssignCombo, setBulkAssignCombo] = useState<{
    shiftId: string;
    positionId: string;
  } | null>(null);
  const [previewTemplate, setPreviewTemplate] = useState<ChecklistTemplate | null>(null);
  /* ---- Mutations ---- */
  const deleteAssignment = useDeleteAssignment();

  const sortedShifts: Shift[] = useMemo(
    () =>
      [...(shifts ?? [])].sort(
        (a: Shift, b: Shift) => a.sort_order - b.sort_order,
      ),
    [shifts],
  );

  const sortedPositions: Position[] = useMemo(
    () =>
      [...(positions ?? [])].sort(
        (a: Position, b: Position) => a.sort_order - b.sort_order,
      ),
    [positions],
  );

  // Template lookup by "shiftId-positionId"
  const templatesByCombo: Record<string, ChecklistTemplate[]> = useMemo(() => {
    const map: Record<string, ChecklistTemplate[]> = {};
    for (const t of templates ?? []) {
      const key: string = `${t.shift_id}-${t.position_id}`;
      if (!map[key]) map[key] = [];
      map[key].push(t);
    }
    return map;
  }, [templates]);

  // Assignment lookup by "shiftId-positionId" → multiple assignments
  const assignmentsByCombo: Record<string, Assignment[]> = useMemo(() => {
    const map: Record<string, Assignment[]> = {};
    for (const a of assignmentsData?.items ?? []) {
      const key: string = `${a.shift_id}-${a.position_id}`;
      if (!map[key]) map[key] = [];
      map[key].push(a);
    }
    return map;
  }, [assignmentsData]);

  // Recent user IDs by combo key (from dedicated API)
  const recentUsersByCombo: Record<string, Set<string>> = useMemo(() => {
    const map: Record<string, Set<string>> = {};
    for (const r of recentUsersData ?? []) {
      const key: string = `${r.shift_id}-${r.position_id}`;
      if (!map[key]) map[key] = new Set<string>();
      map[key].add(r.user_id);
    }
    return map;
  }, [recentUsersData]);

  // Existing user IDs for the combo being reassigned
  const reassignExistingUserIds: Set<string> = useMemo(() => {
    if (!reassignTarget) return new Set<string>();
    const comboKey: string = `${reassignTarget.shift_id}-${reassignTarget.position_id}`;
    return new Set(
      (assignmentsByCombo[comboKey] ?? []).map((a: Assignment) => a.user_id),
    );
  }, [reassignTarget, assignmentsByCombo]);

  // Recent user IDs for the combo being reassigned
  const reassignRecentUserIds: Set<string> = useMemo(() => {
    if (!reassignTarget) return new Set<string>();
    const comboKey: string = `${reassignTarget.shift_id}-${reassignTarget.position_id}`;
    return recentUsersByCombo[comboKey] ?? new Set<string>();
  }, [reassignTarget, recentUsersByCombo]);

  // Existing assignments for the combo being bulk-assigned
  const bulkAssignExisting: Assignment[] = useMemo(() => {
    if (!bulkAssignCombo) return [];
    const comboKey: string = `${bulkAssignCombo.shiftId}-${bulkAssignCombo.positionId}`;
    return assignmentsByCombo[comboKey] ?? [];
  }, [bulkAssignCombo, assignmentsByCombo]);

  // Recent user IDs for the combo being bulk-assigned
  const bulkAssignRecentUserIds: Set<string> = useMemo(() => {
    if (!bulkAssignCombo) return new Set<string>();
    const comboKey: string = `${bulkAssignCombo.shiftId}-${bulkAssignCombo.positionId}`;
    return recentUsersByCombo[comboKey] ?? new Set<string>();
  }, [bulkAssignCombo, recentUsersByCombo]);

  /* ---- Handlers ---- */
  const handleDelete = useCallback(async (): Promise<void> => {
    if (!deleteTarget) return;
    try {
      await deleteAssignment.mutateAsync(deleteTarget.id);
      toast({ type: "success", message: "Assignment removed." });
      setDeleteTarget(null);
    } catch (err) {
      toast({ type: "error", message: parseApiError(err, "Failed to remove assignment.") });
    }
  }, [deleteTarget, deleteAssignment, toast]);

  if (isLoadingShifts || isLoadingPositions) {
    return (
      <Card className="mb-4" padding="p-6">
        <p className="text-lg font-bold text-text mb-3">{store.name}</p>
        <div className="flex items-center justify-center h-16">
          <div className="animate-spin rounded-full border-accent border-t-transparent h-6 w-6 border-2" />
        </div>
      </Card>
    );
  }

  // Hide stores with no shifts or positions
  if (sortedShifts.length === 0 || sortedPositions.length === 0) return null;

  return (
    <Card className="mb-4" padding="p-6">
      <p className="text-lg font-bold text-text mb-5">{store.name}</p>

      <div className="space-y-6">
        {sortedShifts.map((shift: Shift) =>
          sortedPositions.map((pos: Position) => {
            const comboKey: string = `${shift.id}-${pos.id}`;
            const comboAssignments: Assignment[] =
              assignmentsByCombo[comboKey] ?? [];
            const comboTemplates: ChecklistTemplate[] =
              templatesByCombo[comboKey] ?? [];

            // Hide combos without checklists
            if (comboTemplates.length === 0) return null;

            return (
              <div key={comboKey}>
                {/* Combo header */}
                <div className="flex items-center gap-3 mb-2.5">
                  <span className="text-xs font-semibold text-text-muted uppercase tracking-wider">
                    {shift.name} — {pos.name}
                  </span>
                    <button
                      type="button"
                      onClick={() => setPreviewTemplate(comboTemplates[0])}
                      className="flex items-center gap-1 text-[10px] text-success hover:text-accent hover:underline transition-colors cursor-pointer"
                    >
                      <FileText size={10} />
                      {comboTemplates.length === 1
                        ? comboTemplates[0].title
                        : `${comboTemplates.length} checklists`}
                    </button>
                </div>

                {/* Worker cards row */}
                <div className="flex flex-wrap gap-3">
                  {comboAssignments.map((a: Assignment) => (
                    <WorkerCard
                      key={a.id}
                      assignment={a}
                      onReassign={setReassignTarget}
                      onDelete={setDeleteTarget}
                      onClick={(assignment) => router.push(`/schedules/${assignment.id}`)}
                    />
                  ))}
                  <button
                      type="button"
                      onClick={() =>
                        setBulkAssignCombo({
                          shiftId: shift.id,
                          positionId: pos.id,
                        })
                      }
                      className="w-44 min-h-[96px] flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border text-text-muted hover:border-accent hover:text-accent transition-colors cursor-pointer"
                    >
                      <Plus size={16} />
                      <span className="text-sm">Assign</span>
                    </button>
                </div>
              </div>
            );
          }),
        )}
      </div>

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Remove Assignment"
        message={`Are you sure you want to remove the assignment for "${deleteTarget?.user_name}"?`}
        confirmLabel="Remove"
        isLoading={deleteAssignment.isPending}
      />

      {/* Reassign Modal */}
      <ReassignModal
        isOpen={reassignTarget !== null}
        onClose={() => setReassignTarget(null)}
        assignment={reassignTarget}
        users={users}
        existingUserIds={reassignExistingUserIds}
        recentUserIds={reassignRecentUserIds}
      />

      {/* Bulk Assign Modal */}
      <BulkAssignModal
        isOpen={bulkAssignCombo !== null}
        onClose={() => setBulkAssignCombo(null)}
        storeId={store.id}
        shiftId={bulkAssignCombo?.shiftId ?? ""}
        positionId={bulkAssignCombo?.positionId ?? ""}
        date={date}
        users={users}
        existingAssignments={bulkAssignExisting}
        recentUserIds={bulkAssignRecentUserIds}
      />

      {/* Checklist Preview Modal */}
      <ChecklistPreviewModal
        isOpen={previewTemplate !== null}
        onClose={() => setPreviewTemplate(null)}
        template={previewTemplate}
      />

    </Card>
  );
}

// ─── Week View ──────────────────────────────────────────

function WeekView({
  weekDays,
  stores,
  selectedStoreId,
  onDayClick,
}: {
  weekDays: string[];
  stores: Store[];
  selectedStoreId: string;
  onDayClick: (dateStr: string) => void;
}): React.ReactElement {
  const router = useRouter();
  const tz = useTimezone();
  const today: string = todayInTimezone(tz);

  // Fetch all assignments for the week
  const { data: weekData, isLoading } = useAssignments({
    store_id: selectedStoreId || undefined,
    date_from: weekDays[0],
    date_to: weekDays[6],
    per_page: 500,
  });

  // Group assignments by date → store
  const grid: Record<string, Record<string, Assignment[]>> = useMemo(() => {
    const map: Record<string, Record<string, Assignment[]>> = {};
    for (const a of weekData?.items ?? []) {
      if (!map[a.work_date]) map[a.work_date] = {};
      if (!map[a.work_date][a.store_id]) map[a.work_date][a.store_id] = [];
      map[a.work_date][a.store_id].push(a);
    }
    return map;
  }, [weekData]);

  const filteredStores: Store[] = selectedStoreId
    ? stores.filter((s) => s.id === selectedStoreId)
    : stores;

  if (isLoading) {
    return (
      <Card padding="p-16">
        <div className="flex items-center justify-center">
          <div className="animate-spin rounded-full border-accent border-t-transparent h-6 w-6 border-2" />
        </div>
      </Card>
    );
  }

  return (
    <Card padding="p-0">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse min-w-[700px]">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left text-xs font-semibold text-text-muted uppercase tracking-wider p-3 w-32 bg-surface sticky left-0 z-10">
                Store
              </th>
              {weekDays.map((day) => (
                <th
                  key={day}
                  className={cn(
                    "text-center text-xs font-semibold uppercase tracking-wider p-3 cursor-pointer hover:bg-surface-hover transition-colors",
                    day === today
                      ? "text-accent bg-accent/5"
                      : "text-text-muted",
                  )}
                  onClick={() => onDayClick(day)}
                >
                  <div>{shortDayName(day)}</div>
                  <div className="text-sm font-bold mt-0.5">{shortDate(day)}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredStores.map((store) => (
              <tr key={store.id} className="border-b border-border last:border-b-0">
                <td className="p-3 text-sm font-semibold text-text bg-surface sticky left-0 z-10">
                  {store.name}
                </td>
                {weekDays.map((day) => {
                  const dayAssignments: Assignment[] = (
                    grid[day]?.[store.id] ?? []
                  ).slice().sort((a, b) => a.shift_sort_order - b.shift_sort_order);

                  return (
                    <td
                      key={day}
                      className={cn(
                        "p-2 text-center align-top cursor-pointer hover:bg-surface-hover transition-colors",
                        day === today && "bg-accent/5",
                      )}
                      onClick={() => onDayClick(day)}
                    >
                      {dayAssignments.length > 0 ? (
                        <div className="space-y-1">
                          {dayAssignments.slice(0, 3).map((a) => {
                            const aPct: number = a.total_items > 0
                              ? Math.round((a.completed_items / a.total_items) * 100)
                              : 0;
                            return (
                              <div
                                key={a.id}
                                className="relative text-left px-1.5 py-1 rounded-md border border-border cursor-pointer hover:border-accent/50 overflow-hidden"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  router.push(`/schedules/${a.id}`);
                                }}
                              >
                                {/* 배경 채우기 — fill card background by completion % */}
                                <div
                                  className="absolute inset-0 bg-accent/40 rounded-md"
                                  style={{ width: `${aPct}%` }}
                                />
                                <div className="relative text-xs text-text truncate">
                                  {a.user_name}
                                </div>
                                <div className="relative text-[10px] text-text-muted truncate">
                                  {a.shift_name}
                                </div>
                              </div>
                            );
                          })}
                          {dayAssignments.length > 3 && (
                            <div className="text-[10px] text-text-muted">
                              +{dayAssignments.length - 3} more
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-xs text-text-muted/40">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ─── Month View ─────────────────────────────────────────

function MonthView({
  dateStr,
  selectedStoreId,
  onDayClick,
}: {
  dateStr: string;
  selectedStoreId: string;
  onDayClick: (dateStr: string) => void;
}): React.ReactElement {
  const tz = useTimezone();
  const d = new Date(dateStr + "T00:00:00");
  const currentMonth: number = d.getMonth();
  const today: string = todayInTimezone(tz);
  const weeks: string[][] = getMonthCalendar(dateStr);
  const monthStart: string = weeks[0][0];
  const monthEnd: string = weeks[5][6];

  // Fetch all assignments for the visible calendar range
  const { data: monthData, isLoading } = useAssignments({
    store_id: selectedStoreId || undefined,
    date_from: monthStart,
    date_to: monthEnd,
    per_page: 1000,
  });

  // Group by date → count + status breakdown
  const daySummary: Record<string, { count: number; completed: number; inProgress: number }> = useMemo(() => {
    const map: Record<string, { count: number; completed: number; inProgress: number }> = {};
    for (const a of monthData?.items ?? []) {
      if (!map[a.work_date]) map[a.work_date] = { count: 0, completed: 0, inProgress: 0 };
      map[a.work_date].count++;
      if (a.status === "completed") map[a.work_date].completed++;
      if (a.status === "in_progress") map[a.work_date].inProgress++;
    }
    return map;
  }, [monthData]);

  const dayNames: string[] = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  if (isLoading) {
    return (
      <Card padding="p-16">
        <div className="flex items-center justify-center">
          <div className="animate-spin rounded-full border-accent border-t-transparent h-6 w-6 border-2" />
        </div>
      </Card>
    );
  }

  return (
    <Card padding="p-0">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {dayNames.map((name) => (
                <th
                  key={name}
                  className="text-center text-xs font-semibold text-text-muted uppercase tracking-wider p-3 border-b border-border"
                >
                  {name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {weeks.map((week, wi) => (
              <tr key={wi}>
                {week.map((day) => {
                  const dayDate = new Date(day + "T00:00:00");
                  const isCurrentMonth: boolean = dayDate.getMonth() === currentMonth;
                  const isToday: boolean = day === today;
                  const summary = daySummary[day];

                  return (
                    <td
                      key={day}
                      className={cn(
                        "p-2 border border-border h-24 align-top cursor-pointer hover:bg-surface-hover transition-colors",
                        !isCurrentMonth && "bg-surface/50",
                        isToday && "bg-accent/5",
                      )}
                      onClick={() => onDayClick(day)}
                    >
                      <div className="flex flex-col h-full">
                        <span
                          className={cn(
                            "text-sm font-medium",
                            isToday
                              ? "text-accent font-bold"
                              : isCurrentMonth
                                ? "text-text"
                                : "text-text-muted/40",
                          )}
                        >
                          {dayDate.getDate()}
                        </span>
                        {summary && (
                          <div className="mt-1 flex flex-col gap-1">
                            <div className="flex items-center gap-1">
                              {/* Status dots */}
                              {summary.completed > 0 && (
                                <span className="w-2 h-2 rounded-full bg-success shrink-0" />
                              )}
                              {summary.inProgress > 0 && (
                                <span className="w-2 h-2 rounded-full bg-accent shrink-0" />
                              )}
                              {summary.count - summary.completed - summary.inProgress > 0 && (
                                <span className="w-2 h-2 rounded-full bg-text-muted shrink-0" />
                              )}
                              <span className="text-[10px] text-text-secondary ml-auto">
                                {summary.count}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ─── Main Page ──────────────────────────────────────────

export default function SchedulesPage(): React.ReactElement {
  const router = useRouter();
  const tz = useTimezone();

  const [viewMode, setViewMode] = useState<ViewMode>("day");
  const [selectedDate, setSelectedDate] = useState<string>(
    () => todayInTimezone(tz),
  );
  const [selectedStoreId, setSelectedStoreId] = useState<string>("");

  const { data: stores } = useStores();
  const { data: users } = useUsers();

  const activeStores: Store[] = useMemo(
    () => (stores ?? []).filter((b: Store) => b.is_active),
    [stores],
  );

  const activeUsers: User[] = useMemo(
    () => (users ?? []).filter((u: User) => u.is_active),
    [users],
  );

  const dateInputRef = React.useRef<HTMLInputElement>(null);

  // Week view data
  const weekDays: string[] = useMemo(
    () => getWeekDays(selectedDate),
    [selectedDate],
  );

  // Navigation step per view mode
  const handlePrev = useCallback((): void => {
    if (viewMode === "day") setSelectedDate((d) => shiftDate(d, -1));
    else if (viewMode === "week") setSelectedDate((d) => shiftDate(d, -7));
    else {
      setSelectedDate((d) => {
        const dt = new Date(d + "T00:00:00");
        dt.setMonth(dt.getMonth() - 1);
        return toDateStr(dt);
      });
    }
  }, [viewMode]);

  const handleNext = useCallback((): void => {
    if (viewMode === "day") setSelectedDate((d) => shiftDate(d, 1));
    else if (viewMode === "week") setSelectedDate((d) => shiftDate(d, 7));
    else {
      setSelectedDate((d) => {
        const dt = new Date(d + "T00:00:00");
        dt.setMonth(dt.getMonth() + 1);
        return toDateStr(dt);
      });
    }
  }, [viewMode]);

  // Click a day in week/month view → switch to day view
  const handleDayClick = useCallback((dateStr: string): void => {
    setSelectedDate(dateStr);
    setViewMode("day");
  }, []);

  // Date label for nav bar
  const dateLabel: string = useMemo(() => {
    if (viewMode === "day") return formatFixedDateWithDay(selectedDate);
    if (viewMode === "week") return weekRangeLabel(weekDays);
    return monthYearLabel(selectedDate);
  }, [viewMode, selectedDate, weekDays]);

  // Filtered stores for day view
  const filteredStores: Store[] = useMemo(() => {
    if (!selectedStoreId) return activeStores;
    return activeStores.filter((s) => s.id === selectedStoreId);
  }, [activeStores, selectedStoreId]);

  // Date range for the current view (used when navigating to List/Logs)
  const currentDateRange: { from: string; to: string } = useMemo(() => {
    if (viewMode === "day") return { from: selectedDate, to: selectedDate };
    if (viewMode === "week") return { from: weekDays[0], to: weekDays[6] };
    // month: use the visible calendar grid range
    const weeks = getMonthCalendar(selectedDate);
    return { from: weeks[0][0], to: weeks[5][6] };
  }, [viewMode, selectedDate, weekDays]);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-extrabold text-text">Schedules</h1>
          <p className="text-sm text-text-muted mt-0.5">
            Manage daily work assignments across all stores
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* View mode toggle */}
          <div className="flex items-center p-1 bg-surface rounded-lg border border-border">
            {(["day", "week", "month"] as ViewMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setViewMode(mode)}
                className={cn(
                  "px-3 py-1.5 text-xs font-medium rounded-md transition-colors capitalize",
                  viewMode === mode
                    ? "bg-accent text-white"
                    : "text-text-secondary hover:text-text hover:bg-surface-hover",
                )}
              >
                {mode}
              </button>
            ))}
          </div>

          <Button
            variant="secondary"
            size="md"
            onClick={() =>
              router.push(
                `/schedules/list?from=${currentDateRange.from}&to=${currentDateRange.to}`,
              )
            }
          >
            <List size={16} />
            List
          </Button>

          <div className="relative group">
            <Button
              variant="secondary"
              size="md"
              disabled
            >
              <Settings size={16} />
              Manage
            </Button>
            <span className="absolute -bottom-8 left-1/2 -translate-x-1/2 px-2 py-1 text-xs text-white bg-text rounded-md whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
              Coming Soon
            </span>
          </div>
        </div>
      </div>

      {/* Store tab bar */}
      <div className="flex items-center gap-1 mb-4 p-1 bg-surface rounded-lg border border-border overflow-x-auto">
        <button
          type="button"
          onClick={() => setSelectedStoreId("")}
          className={cn(
            "px-4 py-1.5 text-sm font-medium rounded-md transition-colors whitespace-nowrap",
            selectedStoreId === ""
              ? "bg-accent text-white"
              : "text-text-secondary hover:text-text hover:bg-surface-hover",
          )}
        >
          All Stores
        </button>
        {activeStores.map((store: Store) => (
          <button
            key={store.id}
            type="button"
            onClick={() => setSelectedStoreId(store.id)}
            className={cn(
              "px-4 py-1.5 text-sm font-medium rounded-md transition-colors whitespace-nowrap",
              selectedStoreId === store.id
                ? "bg-accent text-white"
                : "text-text-secondary hover:text-text hover:bg-surface-hover",
            )}
          >
            {store.name}
          </button>
        ))}
      </div>

      {/* Date Navigation Bar */}
      <div className="flex items-center justify-center gap-4 mb-6 py-3 px-4 bg-card rounded-xl border border-border">
        <button
          type="button"
          onClick={handlePrev}
          className="p-2 rounded-lg text-text-muted hover:text-text hover:bg-surface transition-colors"
        >
          <ChevronLeft size={20} />
        </button>

        <div className="relative flex items-center gap-2 overflow-hidden">
          <span className="text-lg font-bold text-text">
            {dateLabel}
          </span>
          {viewMode === "day" && (
            <>
              <button
                type="button"
                onClick={() => dateInputRef.current?.showPicker()}
                className="relative z-10 p-1.5 rounded-lg text-text-muted hover:text-accent hover:bg-surface transition-colors"
              >
                <Calendar size={18} />
              </button>
              <input
                ref={dateInputRef}
                type="date"
                value={selectedDate}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setSelectedDate(e.target.value)
                }
                className="absolute inset-0 opacity-0 pointer-events-none"
                tabIndex={-1}
              />
            </>
          )}
        </div>

        <button
          type="button"
          onClick={handleNext}
          className="p-2 rounded-lg text-text-muted hover:text-text hover:bg-surface transition-colors"
        >
          <ChevronRight size={20} />
        </button>
      </div>

      {/* View content */}
      {viewMode === "day" && (
        <>
          {filteredStores.length === 0 ? (
            <Card padding="p-16">
              <p className="text-center text-sm text-text-muted">
                No active stores found.
              </p>
            </Card>
          ) : (
            filteredStores.map((store: Store) => (
              <StoreScheduleSection
                key={store.id}
                store={store}
                date={selectedDate}
                users={activeUsers}
              />
            ))
          )}
        </>
      )}

      {viewMode === "week" && (
        <WeekView
          weekDays={weekDays}
          stores={activeStores}
          selectedStoreId={selectedStoreId}
          onDayClick={handleDayClick}
        />
      )}

      {viewMode === "month" && (
        <MonthView
          dateStr={selectedDate}
          selectedStoreId={selectedStoreId}
          onDayClick={handleDayClick}
        />
      )}
    </div>
  );
}
