"use client";

/**
 * Work Roles 관리 패널 — 매장별 Shift×Position 조합 설정.
 *
 * 미등록 콤보에서 +Register Work Role / +Add Checklist 버튼으로 등록.
 * 등록된 role은 drag & drop으로 순서 조절 가능.
 * 체크리스트 이름 hover 시 아이템 목록 프리뷰.
 */

import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
import {
  Clock,
  Users as UsersIcon,
  Coffee,
  CheckSquare,
  GripVertical,
  Camera,
  Type,
} from "lucide-react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  useWorkRoles,
  useCreateWorkRole,
  useUpdateWorkRole,
  useDeleteWorkRole,
  useReorderWorkRoles,
} from "@/hooks/useWorkRoles";
import { useShifts } from "@/hooks/useShifts";
import { usePositions } from "@/hooks/usePositions";
import { useStore } from "@/hooks/useStores";
import { useChecklistTemplates, useChecklistItems } from "@/hooks/useChecklists";
import { Modal, Select, Badge, ConfirmDialog } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { parseApiError } from "@/lib/utils";
import type { WorkRole, WorkRoleUpdate, ChecklistItem } from "@/types";

/* ─── Checklist Hover Preview ─────────────────────── */

function ChecklistHoverBadge({
  checklistId,
  checklistName,
}: {
  checklistId: string;
  checklistName: string;
}) {
  const [hovered, setHovered] = useState(false);
  const { data: items } = useChecklistItems(hovered ? checklistId : undefined);

  const verificationIcon: Record<string, React.ReactNode> = {
    photo: <Camera size={10} className="text-accent" />,
    text: <Type size={10} className="text-accent" />,
  };

  return (
    <span
      className="relative inline-flex items-center gap-1 text-[11px] text-success cursor-default"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <CheckSquare size={11} />
      {checklistName}

      {/* Hover popup */}
      {hovered && (
        <div className="absolute left-0 top-full mt-1 z-50 w-72 bg-surface border border-border rounded-lg shadow-xl p-3 text-left">
          <div className="text-[10px] text-text-muted uppercase tracking-wider font-semibold mb-2">
            Checklist Items
          </div>
          {!items ? (
            <div className="text-xs text-text-muted py-2">Loading...</div>
          ) : items.length === 0 ? (
            <div className="text-xs text-text-muted py-2">No items yet.</div>
          ) : (
            <div className="max-h-48 overflow-y-auto space-y-1">
              {items.map((item: ChecklistItem, idx: number) => (
                <div key={item.id} className="flex items-start gap-2 text-xs">
                  <span className="text-text-muted shrink-0 w-4 text-right">{idx + 1}.</span>
                  <span className="text-text flex-1">{item.title}</span>
                  {item.verification_type !== "none" && verificationIcon[item.verification_type]}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </span>
  );
}

/* ─── Sortable Role Card ──────────────────────────── */

function SortableRoleCard({
  role,
  checklistId,
  clName,
  breakLabel,
  onEdit,
  onDelete,
}: {
  role: WorkRole;
  checklistId: string | null;
  clName: string | null;
  breakLabel: string | null;
  storeId: string;
  onEdit: (r: WorkRole) => void;
  onDelete: (r: WorkRole) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: role.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="bg-card border border-border rounded-xl p-4 transition-shadow hover:shadow-md"
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="cursor-grab active:cursor-grabbing text-text-muted hover:text-text transition-colors"
            {...attributes}
            {...listeners}
          >
            <GripVertical size={16} />
          </button>
          <span className="text-sm font-bold text-text">
            {role.shift_name} · {role.position_name}
          </span>
          {!role.is_active && <Badge variant="default">Inactive</Badge>}
        </div>
        <div className="flex gap-1.5">
          <button
            onClick={() => onEdit(role)}
            className="px-3 py-1 rounded-lg text-xs font-medium text-text-muted hover:text-accent transition-colors"
          >
            Edit
          </button>
          <button
            onClick={() => onDelete(role)}
            className="px-3 py-1 rounded-lg text-xs font-medium text-text-muted hover:text-danger transition-colors"
          >
            Delete
          </button>
        </div>
      </div>
      <div className="flex items-center gap-4 text-xs text-text-secondary mb-2">
        {role.default_start_time && role.default_end_time && (
          <span className="flex items-center gap-1">
            <Clock size={12} />
            {role.default_start_time}–{role.default_end_time}
          </span>
        )}
        {breakLabel && (
          <span className="flex items-center gap-1">
            <Coffee size={12} />
            Break: {breakLabel}
          </span>
        )}
        <span className="flex items-center gap-1">
          <UsersIcon size={12} />
          Headcount: {role.use_per_day_headcount
            ? ["sun","mon","tue","wed","thu","fri","sat"].map((d) => `${d.charAt(0).toUpperCase()}${d.slice(1)}:${role.headcount[d] ?? 0}`).join(" ")
            : (role.headcount.all ?? 1)}
        </span>
      </div>
      {clName && checklistId ? (
        <ChecklistHoverBadge checklistId={checklistId} checklistName={clName} />
      ) : (
        <span className="text-[11px] text-text-muted">No checklist linked</span>
      )}
    </div>
  );
}

/* ─── Main Panel ──────────────────────────────────── */

interface WorkRolesPanelProps {
  storeId: string;
}

export function WorkRolesPanel({ storeId }: WorkRolesPanelProps): React.ReactElement {
  const { toast } = useToast();

  const { data: store } = useStore(storeId);
  const { data: workRoles, isLoading } = useWorkRoles(storeId);
  const { data: shifts } = useShifts(storeId);
  const { data: positions } = usePositions(storeId);
  const { data: checklistTemplates } = useChecklistTemplates(storeId);

  const createMut = useCreateWorkRole();
  const updateMut = useUpdateWorkRole();
  const deleteMut = useDeleteWorkRole();
  const reorderMut = useReorderWorkRoles();

  const [modalOpen, setModalOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<WorkRole | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<WorkRole | null>(null);

  // Form state (edit modal only)
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [breakStart, setBreakStart] = useState("");
  const [breakEnd, setBreakEnd] = useState("");
  const [headcount, setHeadcount] = useState("1");
  const [checklistId, setChecklistId] = useState("");
  const [isActive, setIsActive] = useState(true);
  // 요일별 headcount
  const [usePerDay, setUsePerDay] = useState(false);
  const [headcountByDay, setHeadcountByDay] = useState<Record<string, number>>({
    sun: 1, mon: 1, tue: 1, wed: 1, thu: 1, fri: 1, sat: 1,
  });

  // Auto-link: work role에 체크리스트 없지만 매칭되는 템플릿이 있으면 자동 연결
  const autoLinkedRef = useRef(new Set<string>());
  useEffect(() => {
    if (!workRoles || !checklistTemplates) return;
    const clByKey = new Map<string, string>();
    for (const ct of checklistTemplates) {
      if (ct.shift_id && ct.position_id) {
        const key = `${ct.shift_id}__${ct.position_id}`;
        if (!clByKey.has(key)) clByKey.set(key, ct.id);
      }
    }
    for (const wr of workRoles) {
      if (wr.default_checklist_id) continue;
      if (autoLinkedRef.current.has(wr.id)) continue;
      const matchingCl = clByKey.get(`${wr.shift_id}__${wr.position_id}`);
      if (matchingCl) {
        autoLinkedRef.current.add(wr.id);
        updateMut.mutate({ id: wr.id, data: { default_checklist_id: matchingCl }, storeId });
      }
    }
  }, [workRoles, checklistTemplates, storeId, updateMut]);

  // Sort by sort_order
  const sortedRoles = useMemo(() => {
    const roles = [...(workRoles ?? [])];
    roles.sort((a, b) => a.sort_order - b.sort_order);
    return roles;
  }, [workRoles]);

  // Unregistered shift×position combos (with checklist lookup)
  const missingCombos = useMemo(() => {
    if (!shifts || !positions) return [];
    const wrKeys = new Set((workRoles ?? []).map((wr) => `${wr.shift_id}__${wr.position_id}`));
    const clByKey = new Map<string, { id: string; title: string }>();
    for (const ct of checklistTemplates ?? []) {
      if (ct.shift_id && ct.position_id) {
        const key = `${ct.shift_id}__${ct.position_id}`;
        if (!clByKey.has(key)) clByKey.set(key, { id: ct.id, title: ct.title });
      }
    }
    const combos: { shiftId: string; shiftName: string; shiftOrder: number; positionId: string; positionName: string; positionOrder: number; checklistId: string | null; checklistName: string | null }[] = [];
    for (const s of shifts) {
      for (const p of positions) {
        const key = `${s.id}__${p.id}`;
        if (!wrKeys.has(key)) {
          const cl = clByKey.get(key);
          combos.push({ shiftId: s.id, shiftName: s.name, shiftOrder: s.sort_order, positionId: p.id, positionName: p.name, positionOrder: p.sort_order, checklistId: cl?.id ?? null, checklistName: cl?.title ?? null });
        }
      }
    }
    combos.sort((a, b) => a.shiftOrder - b.shiftOrder || a.positionOrder - b.positionOrder);
    return combos;
  }, [shifts, positions, workRoles, checklistTemplates]);

  // Edit 모달용: 편집 중인 role의 shift+position에 해당하는 체크리스트만 필터
  const checklistOptions = useMemo(() => {
    const filtered = (checklistTemplates ?? []).filter(
      (c) => editingRole && c.shift_id === editingRole.shift_id && c.position_id === editingRole.position_id,
    );
    return [
      { value: "", label: "No checklist" },
      ...filtered.map((c) => ({ value: c.id, label: c.title })),
    ];
  }, [checklistTemplates, editingRole]);

  // Checklist name lookup
  const getChecklistName = useCallback(
    (clId: string | null) => {
      if (!clId) return null;
      return checklistTemplates?.find((c) => c.id === clId)?.title ?? null;
    },
    [checklistTemplates],
  );

  // Break duration display
  const getBreakLabel = useCallback((role: WorkRole) => {
    if (!role.break_start_time || !role.break_end_time) return null;
    const [sh, sm] = role.break_start_time.split(":").map(Number);
    const [eh, em] = role.break_end_time.split(":").map(Number);
    const mins = eh * 60 + em - (sh * 60 + sm);
    return mins > 0 ? `${mins}min` : null;
  }, []);

  // Quick-register: create work role with defaults, appended at end
  const handleQuickRegister = async (shiftId: string, positionId: string, defaultChecklistId: string | null) => {
    let defaultStart = "09:00";
    let defaultEnd = "18:00";
    if (store?.operating_hours) {
      const hours = store.operating_hours as Record<string, string>;
      if (hours.open) defaultStart = hours.open;
      if (hours.close) defaultEnd = hours.close;
    }
    const maxOrder = sortedRoles.length > 0 ? Math.max(...sortedRoles.map((r) => r.sort_order)) : -1;
    try {
      await createMut.mutateAsync({
        storeId,
        data: {
          shift_id: shiftId,
          position_id: positionId,
          default_start_time: defaultStart,
          default_end_time: defaultEnd,
          headcount: { all: 1, sun: 1, mon: 1, tue: 1, wed: 1, thu: 1, fri: 1, sat: 1 },
          use_per_day_headcount: false,
          default_checklist_id: defaultChecklistId,
          is_active: true,
          sort_order: maxOrder + 1,
        },
      });
      toast({ type: "success", message: "Work role registered" });
    } catch (err) {
      toast({ type: "error", message: parseApiError(err, "Failed to register work role") });
    }
  };

  // Edit modal
  const openEdit = (role: WorkRole) => {
    setEditingRole(role);
    setStartTime(role.default_start_time ?? "");
    setEndTime(role.default_end_time ?? "");
    setBreakStart(role.break_start_time ?? "");
    setBreakEnd(role.break_end_time ?? "");
    setHeadcount(String(role.headcount.all ?? 1));
    setChecklistId(role.default_checklist_id ?? "");
    setIsActive(role.is_active);
    setUsePerDay(role.use_per_day_headcount);
    // 요일별 headcount 초기화
    const allVal = role.headcount.all ?? 1;
    setHeadcountByDay({
      sun: role.headcount.sun ?? allVal,
      mon: role.headcount.mon ?? allVal,
      tue: role.headcount.tue ?? allVal,
      wed: role.headcount.wed ?? allVal,
      thu: role.headcount.thu ?? allVal,
      fri: role.headcount.fri ?? allVal,
      sat: role.headcount.sat ?? allVal,
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!editingRole) return;
    try {
      // all과 요일별 값은 각각 독립적으로 보존
      const allVal = parseInt(headcount) || 0;
      const data: WorkRoleUpdate = {
        default_start_time: startTime || null,
        default_end_time: endTime || null,
        break_start_time: breakStart || null,
        break_end_time: breakEnd || null,
        headcount: { all: allVal, ...headcountByDay },
        use_per_day_headcount: usePerDay,
        default_checklist_id: checklistId || null,
        is_active: isActive,
      };
      await updateMut.mutateAsync({ id: editingRole.id, data, storeId });
      toast({ type: "success", message: "Work role updated" });
      setModalOpen(false);
    } catch (err) {
      toast({ type: "error", message: parseApiError(err, "Failed to save work role") });
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteMut.mutateAsync({ id: deleteTarget.id, storeId });
      toast({ type: "success", message: "Work role deleted" });
      setDeleteTarget(null);
    } catch (err) {
      toast({ type: "error", message: parseApiError(err, "Failed to delete work role") });
    }
  };

  // Drag & drop
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = sortedRoles.findIndex((r) => r.id === active.id);
    const newIndex = sortedRoles.findIndex((r) => r.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(sortedRoles, oldIndex, newIndex);
    const items = reordered.map((r, i) => ({ id: r.id, sort_order: i }));
    try {
      await reorderMut.mutateAsync({ storeId, items });
    } catch (err) {
      toast({ type: "error", message: parseApiError(err, "Failed to reorder") });
    }
  };

  const isSaving = createMut.isPending || updateMut.isPending;

  return (
    <div>
      {/* Content */}
      {isLoading ? (
        <div className="text-center py-20 text-text-muted">Loading...</div>
      ) : sortedRoles.length === 0 && missingCombos.length === 0 ? (
        <div className="text-center py-16 bg-card border-2 border-dashed border-border rounded-xl">
          <div className="text-text-muted mb-3">
            <CheckSquare size={48} className="mx-auto opacity-40" />
          </div>
          <h3 className="text-base font-bold text-text mb-1">No Work Roles configured</h3>
          <p className="text-sm text-text-muted max-w-[340px] mx-auto">
            Register work roles from the unregistered combos below, or add shifts and positions first.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Registered Work Roles — drag & drop */}
          {sortedRoles.length > 0 && (
            <div>
              <p className="text-[10px] text-text-muted uppercase tracking-wider font-semibold mb-2">
                Registered ({sortedRoles.length})
              </p>
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={sortedRoles.map((r) => r.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-2.5">
                    {sortedRoles.map((role) => (
                      <SortableRoleCard
                        key={role.id}
                        role={role}
                        checklistId={role.default_checklist_id}
                        clName={getChecklistName(role.default_checklist_id)}
                        breakLabel={getBreakLabel(role)}
                        storeId={storeId}
                        onEdit={openEdit}
                        onDelete={setDeleteTarget}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            </div>
          )}

          {/* Unregistered combos */}
          {missingCombos.length > 0 && (
            <div>
              <p className="text-[10px] text-text-muted uppercase tracking-wider font-semibold mb-2">
                Unregistered Combos ({missingCombos.length})
              </p>
              <div className="space-y-2">
                {missingCombos.map((c) => (
                  <div
                    key={`${c.shiftId}__${c.positionId}`}
                    className="bg-card border border-border border-dashed rounded-xl p-3 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-sm text-text-secondary">
                        {c.shiftName} · {c.positionName}
                      </span>
                      {c.checklistId && c.checklistName ? (
                        <ChecklistHoverBadge checklistId={c.checklistId} checklistName={c.checklistName} />
                      ) : (
                        <span className="text-[11px] text-text-muted">No checklist</span>
                      )}
                    </div>
                    <button
                      onClick={() => handleQuickRegister(c.shiftId, c.positionId, c.checklistId)}
                      disabled={createMut.isPending}
                      className="text-xs text-text-muted hover:text-accent transition-colors disabled:opacity-50"
                    >
                      + Register Work Role
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Edit Modal */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Edit Work Role"
        size="sm"
        closeOnBackdrop={false}
      >
        {editingRole && (
          <div className="space-y-4">
            <div className="bg-surface rounded-lg p-3">
              <div className="text-sm font-bold text-text">
                {editingRole.shift_name} · {editingRole.position_name}
              </div>
              <div className="text-xs text-text-muted mt-0.5">Shift × Position combination</div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-text-muted font-medium">Default Start Time</label>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full mt-1 bg-surface border border-border rounded-lg px-3 py-1.5 text-sm text-text"
                />
              </div>
              <div>
                <label className="text-xs text-text-muted font-medium">Default End Time</label>
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-full mt-1 bg-surface border border-border rounded-lg px-3 py-1.5 text-sm text-text"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-text-muted font-medium">Break Start</label>
                <input
                  type="time"
                  value={breakStart}
                  onChange={(e) => setBreakStart(e.target.value)}
                  className="w-full mt-1 bg-surface border border-border rounded-lg px-3 py-1.5 text-sm text-text"
                />
              </div>
              <div>
                <label className="text-xs text-text-muted font-medium">Break End</label>
                <input
                  type="time"
                  value={breakEnd}
                  onChange={(e) => setBreakEnd(e.target.value)}
                  className="w-full mt-1 bg-surface border border-border rounded-lg px-3 py-1.5 text-sm text-text"
                />
              </div>
            </div>

            <div>
              <label className="text-xs text-text-muted font-medium">Required Headcount</label>
              {!usePerDay && (
                <input
                  type="number"
                  value={headcount}
                  onChange={(e) => setHeadcount(e.target.value)}
                  min={0}
                  className="w-full mt-1 bg-surface border border-border rounded-lg px-3 py-1.5 text-sm text-text"
                />
              )}
              {/* 요일별 headcount 토글 */}
              <label className="flex items-center gap-2 text-xs text-text-secondary mt-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={usePerDay}
                  onChange={(e) => {
                    // 토글만 전환 — 기존 값은 양쪽 다 보존 (덮어쓰지 않음)
                    setUsePerDay(e.target.checked);
                  }}
                  className="accent-accent"
                />
                Set per-day headcount
              </label>
              {usePerDay && (
                <div className="flex gap-2 mt-2">
                  {(["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const).map((day) => (
                    <div key={day} className="flex flex-col items-center gap-1">
                      <span className="text-[10px] text-text-muted uppercase">{day}</span>
                      <input
                        type="number"
                        value={headcountByDay[day]}
                        onChange={(e) =>
                          setHeadcountByDay((prev) => ({ ...prev, [day]: Math.max(0, parseInt(e.target.value) || 0) }))
                        }
                        min={0}
                        className="w-10 bg-surface border border-border rounded px-1 py-1 text-xs text-text text-center"
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            <Select
              label="Linked Checklist"
              options={checklistOptions}
              value={checklistId}
              onChange={(e) => setChecklistId(e.target.value)}
            />

            <label className="flex items-center gap-2 text-sm text-text">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="accent-accent"
              />
              Active
            </label>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setModalOpen(false)}
                className="px-4 py-2 rounded-lg text-sm text-text-secondary hover:bg-surface-hover transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-accent text-white hover:bg-accent-light transition-colors disabled:opacity-50"
              >
                {isSaving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Delete Confirm */}
      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Delete Work Role"
        message={`Delete "${deleteTarget?.shift_name} · ${deleteTarget?.position_name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        isLoading={deleteMut.isPending}
      />
    </div>
  );
}
