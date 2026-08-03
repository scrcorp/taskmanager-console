"use client";

/**
 * 매장 목록 페이지 -- 매장 CRUD 관리 페이지입니다.
 * 검색, 생성, 수정, 삭제 기능을 제공합니다.
 *
 * Stores List Page -- Full store management page with CRUD operations.
 * Provides search, create, edit, and delete functionality.
 */

import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { usePersistedFilters } from "@/hooks/usePersistedFilters";
import { Plus, Search, Edit, Trash2, X, GripVertical, Layers } from "lucide-react";
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
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useStores, useCreateStore, useUpdateStore, useDeleteStore, useReorderStores } from "@/hooks/useStores";
import {
  useStoreGroups,
  useCreateStoreGroup,
  useUpdateStoreGroup,
  useDeleteStoreGroup,
  useReorderStoreGroups,
} from "@/hooks/useStoreGroups";
import { useCreateShift } from "@/hooks/useShifts";
import { useCreatePosition } from "@/hooks/usePositions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Table, Badge, Modal } from "@/components/ui";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useModal } from "@/components/ui/imperative-modal";
import { useMutationToast } from "@/lib/mutationToast";
import { formatDate, parseApiError } from "@/lib/utils";
import { previewStoreCode } from "@/lib/storeCode";
import { useTimezone } from "@/hooks/useTimezone";
import { TIMEZONE_OPTIONS } from "@/lib/timezones";
import { usePermissions } from "@/hooks/usePermissions";
import { PERMISSIONS } from "@/lib/permissions";
import type { Store, StoreGroup, StoreStatus } from "@/types";
import { STORE_STATUS_OPTIONS } from "@/types";

/** status → Badge variant 매핑 / Store status → badge variant */
const STATUS_BADGE: Record<StoreStatus, { variant: "success" | "warning" | "danger" | "default"; label: string }> = {
  open: { variant: "success", label: "Open" },
  preparing: { variant: "warning", label: "Preparing" },
  paused: { variant: "default", label: "Paused" },
  closed: { variant: "danger", label: "Closed" },
};

/** 폼 내 드래그 가능한 아이템 / Draggable item in form */
interface FormItem {
  id: string;
  name: string;
}

/** 매장 폼 데이터 인터페이스 / Store form data interface */
interface StoreFormData {
  name: string;
  code: string;
  address: string;
  phone: string;
  email: string;
  status: StoreStatus;
  timezone: string;
  /** 소속 그룹 ID ("" = None) / Group id, empty string = none */
  groupId: string;
  /** EMPID 시작 번호 입력값 ("" = null) / Number range start input, empty = null */
  numberRangeStart: string;
  shifts: FormItem[];
  positions: FormItem[];
}

/** 테이블 컬럼 타입 / Table column type */
interface Column<T> {
  key: string;
  header: string;
  render?: (item: T) => React.ReactNode;
  className?: string;
  hideOnMobile?: boolean;
}

/** 초기 폼 상태 / Initial form state */
const INITIAL_FORM: StoreFormData = {
  name: "",
  code: "",
  address: "",
  phone: "",
  email: "",
  status: "open",
  timezone: "",
  groupId: "",
  numberRangeStart: "",
  shifts: [],
  positions: [],
};

/** numbering 모드 라벨 / Numbering mode labels */
const NUMBERING_MODE_LABEL: Record<StoreGroup["numbering_mode"], string> = {
  group: "Shared numbering",
  store: "Per-store numbering",
};

/** 빈 값/비정상 입력 → null, 1 이상 정수만 유효 / Parse range-start input ("" = null, server ge=1) */
function parseRangeStart(value: string): number | null {
  const parsed: number = parseInt(value.trim(), 10);
  return Number.isFinite(parsed) && parsed >= 1 ? parsed : null;
}

/**
 * 번호대 입력 유효성 — 빈 값(=기본값) 또는 1 이상의 정수만 허용. 무효 입력은
 * parseRangeStart 가 조용히 null 로 만들기 때문에(의도치 않은 해제 PUT 위험)
 * 저장 전에 인라인 경고 + Save 비활성으로 차단한다.
 *
 * Range input validity: empty (= default) or an integer >= 1. Invalid input
 * would silently become null in parseRangeStart (risking an unintended
 * clearing PUT), so it blocks Save with an inline warning instead.
 */
function isValidRangeInput(value: string): boolean {
  const trimmed: string = value.trim();
  if (trimmed === "") return true;
  return /^\d+$/.test(trimmed) && parseInt(trimmed, 10) >= 1;
}

/** 그룹 섹션 (마지막은 Ungrouped) / One rendered store section (last = Ungrouped) */
interface StoreSection {
  groupId: string | null;
  name: string;
  group: StoreGroup | null;
  stores: Store[];
}

/** EMPID 중복 경고 문구 / Duplicate-EMPID warning copy */
function duplicateEmpidMessage(count: number): string {
  return `${count} duplicate EMPIDs in this group's shared numbering scope — resolve them in Users → Bulk Edit → EMPID Import.`;
}

/** 드래그 가능한 문자열 행 컴포넌트 / Draggable string row component */
function DraggableStringRow({
  id,
  name,
  index,
  onRemove,
}: {
  id: string;
  name: string;
  index: number;
  onRemove: () => void;
}): React.ReactElement {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface border border-border ${isDragging ? "opacity-50 shadow-lg z-10 relative" : ""}`}
    >
      <button
        type="button"
        className="cursor-grab active:cursor-grabbing text-text-muted hover:text-text transition-colors touch-none shrink-0"
        aria-label="Drag to reorder"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <span className="text-xs font-mono text-text-muted w-5">{index + 1}.</span>
      <span className="text-sm text-text flex-1">{name}</span>
      <button
        type="button"
        onClick={onRemove}
        className="p-0.5 text-text-muted hover:text-danger transition-colors"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/**
 * Manage Groups 모달의 draft 모델 — 모달 안의 모든 편집(이름/채번 모드/번호대/순서/
 * 매장 편성/그룹 추가/삭제)을 로컬에 쌓았다가 Save 로 일괄 적용, Cancel 로 폐기한다.
 *
 * Draft model for the Manage Groups modal. Every edit accumulates locally and
 * commits as a batch on Save (or is discarded on Cancel).
 */

/** 아직 서버에 없는 신규 그룹의 tempId 접두사 / Prefix for not-yet-created group ids */
const TEMP_GROUP_ID_PREFIX = "new-";

/** draft 그룹 id 가 신규(tempId)인지 / Whether a draft group id is a tempId */
function isTempGroupId(id: string): boolean {
  return id.startsWith(TEMP_GROUP_ID_PREFIX);
}

/** draft 상의 그룹 한 건 — 입력값은 raw 로 두고 저장 시 trim/parse / One draft group (raw inputs, normalized on save) */
interface DraftGroup {
  /** 기존 그룹 id 또는 "new-N" tempId / Existing id or "new-N" tempId */
  id: string;
  name: string;
  numbering_mode: "group" | "store";
  /** number_range_start raw 입력 ("" = null) / Raw range-start input, empty = null */
  rangeStart: string;
}

/** Manage Groups 모달의 draft 전체 / The whole modal draft */
interface GroupsDraft {
  groups: Record<string, DraftGroup>;
  /** 표시 순서 (삭제 표시 그룹 포함) / Display order, including deletion-marked rows */
  order: string[];
  /** 삭제 표시 — 기존 그룹은 Save 시 DELETE, tempId 는 생성 취소 / Marked for deletion */
  deleted: string[];
  /** 매장별 소속: storeId → groupId | tempId | null / Store assignment map */
  storeAssign: Record<string, string | null>;
  /** 매장별 number_range_start raw 입력 ("" = null) — Per-store 모드에서 편집 / Raw per-store range inputs */
  storeRange: Record<string, string>;
}

/** 서버 데이터로 draft 초기화 / Build a fresh draft from server data */
function buildGroupsDraft(groups: StoreGroup[], stores: Store[]): GroupsDraft {
  // stores 캐시가 groups 보다 오래돼 이미 사라진 그룹을 가리켜도 Ungrouped 로 정규화
  // Stale store→group refs (group gone from the groups cache) normalize to null
  const knownIds = new Set<string>(groups.map((g: StoreGroup) => g.id));
  return {
    groups: Object.fromEntries(
      groups.map((g: StoreGroup) => [
        g.id,
        {
          id: g.id,
          name: g.name,
          numbering_mode: g.numbering_mode,
          rangeStart: g.number_range_start != null ? String(g.number_range_start) : "",
        },
      ]),
    ),
    order: groups.map((g: StoreGroup) => g.id),
    deleted: [],
    storeAssign: Object.fromEntries(
      stores.map((s: Store) => [
        s.id,
        s.group_id != null && knownIds.has(s.group_id) ? s.group_id : null,
      ]),
    ),
    storeRange: Object.fromEntries(
      stores.map((s: Store) => [
        s.id,
        s.number_range_start != null ? String(s.number_range_start) : "",
      ]),
    ),
  };
}

/** Save 가 실행할 서버 연산 계획 — footer 의 (N) 과 실행 로직이 공유 / Planned server ops (footer count + Save share this) */
interface GroupSaveOps {
  /** ① 생성할 신규 그룹 (draft 순서) / Groups to POST, in draft order */
  creates: DraftGroup[];
  /** ② 변경 필드만 담은 기존 그룹 수정 / Changed fields per existing group to PUT */
  updates: {
    id: string;
    data: { name?: string; numbering_mode?: "group" | "store"; number_range_start?: number | null };
  }[];
  /**
   * ③ 변경 필드만 담은 매장 수정 — 필드 생략 = 미변경. target 은 tempId 일 수 있고,
   * 매장당 PUT 1회에 두 필드가 함께 실릴 수 있다.
   * Per-store PUTs carrying only changed fields (omitted = unchanged). target
   * may be a tempId; one PUT per store can carry both fields.
   */
  moves: { storeId: string; target?: string | null; rangeStart?: number | null }[];
  /** ④ 삭제할 기존 그룹 / Existing groups to DELETE */
  deletes: string[];
  /** ⑤ 순서 저장 필요 여부 / Whether a reorder PUT is needed */
  reorder: boolean;
  /** 최종 순서 (tempId 포함, 삭제 제외) / Final order (tempIds included, deleted excluded) */
  finalOrder: string[];
  /** 총 연산 수 = Save 버튼의 N / Total op count shown on the Save button */
  count: number;
}

/**
 * draft 와 서버 상태의 차이를 서버 연산 목록으로 계산. dirty 판정(count > 0)과
 * Save 실행이 같은 계산을 공유하므로 버튼의 N 과 실제 적용이 항상 일치한다.
 *
 * Diff the draft against server state into a list of server ops. Dirty
 * detection (count > 0) and Save share this computation, so the button's N
 * always matches what gets applied.
 */
function computeGroupSaveOps(
  draft: GroupsDraft,
  serverGroups: StoreGroup[],
  serverStores: Store[],
): GroupSaveOps {
  const deleted = new Set<string>(draft.deleted);
  const serverById = new Map<string, StoreGroup>(serverGroups.map((g: StoreGroup) => [g.id, g]));

  // 삭제 표시 제외 + 서버에서 이미 사라진 비-temp 행 제외 (부분 실패 후 Undo 잔재가
  // reorder/영구 dirty 를 만들지 않게) / Drop deletion-marked rows and non-temp rows the
  // server no longer has (leftovers after a partial failure must not keep us dirty)
  const finalOrder: string[] = draft.order.filter(
    (id: string) => !deleted.has(id) && (isTempGroupId(id) || serverById.has(id)),
  );

  const creates: DraftGroup[] = finalOrder
    .filter(isTempGroupId)
    .map((id: string) => draft.groups[id])
    .filter((g): g is DraftGroup => g !== undefined);

  const updates: GroupSaveOps["updates"] = [];
  for (const id of finalOrder) {
    const server = serverById.get(id);
    const d = draft.groups[id];
    if (!server || !d) continue;
    const data: GroupSaveOps["updates"][number]["data"] = {};
    const name: string = d.name.trim();
    if (name && name !== server.name) data.name = name;
    if (d.numbering_mode !== server.numbering_mode) data.numbering_mode = d.numbering_mode;
    const range: number | null = parseRangeStart(d.rangeStart);
    if (range !== (server.number_range_start ?? null)) data.number_range_start = range;
    if (Object.keys(data).length > 0) updates.push({ id, data });
  }

  // 매장별 변경 합산 — 소속(group_id)과 번호대(number_range_start)를 매장당 PUT 1회로.
  // 삭제 표시 그룹으로의 배정은 Ungrouped 로 해석하고, 삭제될 그룹에 그대로 남는 매장은
  // 서버 DELETE 의 SET NULL 이 처리하므로 소속 PUT 을 만들지 않는다.
  // Per-store diffs: group_id and number_range_start combine into one PUT per
  // store. Deleted-marked targets resolve to null; stores simply left in a
  // deleted group are covered by the server's SET NULL on DELETE (no group PUT).
  const moves: GroupSaveOps["moves"] = [];
  for (const store of serverStores) {
    const rawOriginal: string | null = store.group_id ?? null;
    // 서버에 없는 그룹을 가리키는 잔재는 Ungrouped 취급 / Stale refs count as ungrouped
    const original: string | null =
      rawOriginal != null && serverById.has(rawOriginal) ? rawOriginal : null;
    const assigned = draft.storeAssign[store.id];
    const raw: string | null = assigned === undefined ? original : assigned;
    const effective: string | null = raw != null && deleted.has(raw) ? null : raw;
    // 저장 불가능한 대상(서버에 없고 tempId 도 아님)으로의 배정은 계획에서 제외
    // Unsavable targets (gone on the server, not a tempId) never become ops
    const targetSavable: boolean =
      effective == null || isTempGroupId(effective) || serverById.has(effective);
    const groupChanged: boolean =
      targetSavable &&
      effective !== original &&
      !(effective === null && rawOriginal != null && deleted.has(rawOriginal));

    const rawRange: string | undefined = draft.storeRange[store.id];
    const originalRange: number | null = store.number_range_start ?? null;
    const desiredRange: number | null =
      rawRange === undefined ? originalRange : parseRangeStart(rawRange);
    const rangeChanged: boolean = desiredRange !== originalRange;

    if (!groupChanged && !rangeChanged) continue;
    const move: GroupSaveOps["moves"][number] = { storeId: store.id };
    if (groupChanged) move.target = effective;
    if (rangeChanged) move.rangeStart = desiredRange;
    moves.push(move);
  }

  const deletes: string[] = draft.deleted.filter((id: string) => serverById.has(id));

  // ①~④ 반영 후 서버가 갖게 될 순서(기존 상대 순서 + 신규 append)와 draft 순서 비교
  // Order the server would hold after ①-④ (existing relative order + creations appended)
  const expected: string[] = [
    ...serverGroups.filter((g: StoreGroup) => !deleted.has(g.id)).map((g: StoreGroup) => g.id),
    ...creates.map((g: DraftGroup) => g.id),
  ];
  const reorder: boolean =
    finalOrder.length !== expected.length ||
    finalOrder.some((v: string, i: number) => v !== expected[i]);

  return {
    creates,
    updates,
    moves,
    deletes,
    reorder,
    finalOrder,
    count: creates.length + updates.length + moves.length + deletes.length + (reorder ? 1 : 0),
  };
}

/**
 * 그룹 관리 모달의 드래그 가능한 그룹 행 — 모든 편집은 draft 콜백으로만 전달되고
 * 서버 반영은 모달의 Save 가 일괄 처리한다 (행 자체는 아무것도 저장하지 않음).
 *
 * Sortable group row inside the Manage Groups modal. Every edit flows through
 * draft callbacks only; the modal's Save commits the batch (the row itself
 * never saves anything).
 */
function SortableGroupRow({
  draftGroup,
  isNew,
  isDeleted,
  members,
  candidates,
  effectiveGroupIds,
  groupNamesById,
  storeRanges,
  disabled,
  onPatch,
  onDelete,
  onUndoDelete,
  onRemoveStore,
  onAddStore,
  onStoreRangeChange,
}: {
  /** draft 상의 그룹 값 / Draft values for this row */
  draftGroup: DraftGroup;
  /** 신규(미생성) 그룹 — Save 시 생성 / Not yet created on the server */
  isNew: boolean;
  /** 삭제 표시 — Save 시 삭제, Undo 로 복구 / Marked for deletion (Undo restores) */
  isDeleted: boolean;
  /** draft 기준 이 그룹 소속 매장 (칩 표시) / Stores in this group per the draft */
  members: Store[];
  /** 추가 가능한 매장 (draft 기준 미그룹 + 타그룹) / Stores addable per the draft */
  candidates: Store[];
  /** draft 기준 매장별 소속 그룹 — "(current: ...)" 라벨용 / Store id → effective draft group id */
  effectiveGroupIds: Record<string, string | null>;
  /** 미삭제 그룹의 draft 이름 맵 / Draft names of surviving groups */
  groupNamesById: Record<string, string>;
  /** 매장별 number_range_start raw 입력 (draft) / Raw per-store range inputs from the draft */
  storeRanges: Record<string, string>;
  /** 저장 중 — 조작 전체 잠금 / Saving in progress, all controls locked */
  disabled: boolean;
  /** draft 필드 갱신 / Patch draft fields */
  onPatch: (fields: Partial<Omit<DraftGroup, "id">>) => void;
  /** 삭제 표시 (즉시 삭제 아님) / Mark for deletion (not immediate) */
  onDelete: () => void;
  onUndoDelete: () => void;
  /** 칩 × — 그룹에서 제거 (draft) / Remove a store from this group in the draft */
  onRemoveStore: (store: Store) => void;
  /** select 선택 — 그룹에 추가 (draft) / Add a store to this group in the draft */
  onAddStore: (store: Store) => void;
  /** Per-store 모드의 매장별 번호대 입력 갱신 (draft) / Update one store's raw range input */
  onStoreRangeChange: (storeId: string, value: string) => void;
}): React.ReactElement {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: draftGroup.id, disabled: disabled || isDeleted });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const blurOnEnter = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === "Enter") {
      e.preventDefault();
      e.currentTarget.blur();
    }
  };

  const displayName: string = draftGroup.name.trim() || "Untitled group";
  /** Per-store 채번 모드 — 매장 칩마다 번호대 입력 노출 / Per-store numbering shows a range input per chip */
  const perStore: boolean = draftGroup.numbering_mode === "store";
  const groupRangeBad: boolean = !isValidRangeInput(draftGroup.rangeStart);

  // 삭제 표시 행 — 편집 대신 Undo 만 제공 (Save 전까지 복구 가능, 실수 방지)
  // Deletion-marked row: no editing, just Undo until Save (mistake-proofing)
  if (isDeleted) {
    return (
      <div
        ref={setNodeRef}
        style={style}
        className="rounded-lg bg-surface border border-danger/40 px-3 py-2"
      >
        <div className="flex items-center gap-2">
          <span className="flex-1 min-w-0 truncate px-2 py-1 text-sm text-text-muted line-through">
            {displayName}
          </span>
          <span className="text-xs text-danger shrink-0">Will be deleted on save</span>
          <button
            type="button"
            onClick={onUndoDelete}
            disabled={disabled}
            className="shrink-0 rounded-md border border-border px-2.5 py-1 text-xs text-text hover:bg-surface-hover transition-colors disabled:opacity-50"
          >
            Undo
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`rounded-lg bg-surface border border-border px-3 py-2 ${isDragging ? "opacity-50 shadow-lg z-10 relative" : ""}`}
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="cursor-grab active:cursor-grabbing text-text-muted hover:text-text transition-colors touch-none shrink-0 disabled:opacity-50"
          aria-label="Drag to reorder"
          disabled={disabled}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
        <input
          type="text"
          value={draftGroup.name}
          disabled={disabled}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => onPatch({ name: e.target.value })}
          onKeyDown={blurOnEnter}
          aria-label={`Group name for ${displayName}`}
          className="flex-1 min-w-0 rounded-md border border-transparent bg-transparent px-2 py-1 text-sm text-text hover:border-border focus:border-accent focus:bg-surface focus:outline-none focus:ring-2 focus:ring-accent/50 transition-colors disabled:opacity-50"
        />
        {isNew && <Badge variant="accent">New</Badge>}
        <span className="text-xs text-text-muted shrink-0">
          {members.length} {members.length === 1 ? "store" : "stores"}
        </span>
        <button
          type="button"
          onClick={onDelete}
          disabled={disabled}
          className="p-1.5 rounded-md text-text-muted hover:text-danger hover:bg-danger-muted transition-colors shrink-0 disabled:opacity-50"
          aria-label={`Delete group ${displayName}`}
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2 pl-7">
        <div className="inline-flex rounded-lg border border-border overflow-hidden">
          {(["group", "store"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              disabled={disabled}
              onClick={() => {
                if (draftGroup.numbering_mode !== mode) onPatch({ numbering_mode: mode });
              }}
              className={`px-2.5 py-1 text-xs transition-colors disabled:opacity-50 ${
                draftGroup.numbering_mode === mode
                  ? "bg-accent-muted text-accent font-medium"
                  : "text-text-muted hover:text-text hover:bg-surface-hover"
              }`}
            >
              {NUMBERING_MODE_LABEL[mode]}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-xs text-text-muted">
          {/* Per-store 모드에선 매장 미설정 시 폴백이라 "Default range" / Fallback label in per-store mode */}
          {perStore ? "Default range" : "Range start"}
          <input
            type="number"
            min={1}
            value={draftGroup.rangeStart}
            placeholder="Default"
            disabled={disabled}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              onPatch({ rangeStart: e.target.value })
            }
            onKeyDown={blurOnEnter}
            aria-label={`Number range start for ${displayName}`}
            aria-invalid={groupRangeBad || undefined}
            className={`w-20 rounded-md border bg-surface px-2 py-1 text-xs text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent disabled:opacity-50 ${groupRangeBad ? "border-danger" : "border-border"}`}
          />
        </label>
        {groupRangeBad && (
          <span className="text-xs text-danger">Whole number of 1 or more.</span>
        )}
      </div>
      {/* 소속 매장 칩 + 추가 select — draft 만 갱신. Per-store 모드에선 칩마다 번호대
          입력을 노출 (Shared 모드에선 숨김 — 값은 draft 에 보존) / Member chips +
          add-store select (draft only); per-store mode adds a range input per chip
          (hidden in shared mode, values kept in the draft) */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5 pl-7">
        {members.map((store: Store) => {
          const rawRange: string = storeRanges[store.id] ?? "";
          const rangeBad: boolean = perStore && !isValidRangeInput(rawRange);
          return (
            <span
              key={store.id}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-2 py-0.5 text-xs text-text-secondary"
            >
              {store.name}
              {perStore && (
                <label className="ml-1 flex items-center gap-1 text-text-muted">
                  Range
                  <input
                    type="number"
                    min={1}
                    value={rawRange}
                    placeholder="—"
                    disabled={disabled}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      onStoreRangeChange(store.id, e.target.value)
                    }
                    onKeyDown={blurOnEnter}
                    aria-label={`Number range start for ${store.name}`}
                    aria-invalid={rangeBad || undefined}
                    className={`w-16 rounded-md border bg-surface px-1.5 py-0.5 text-xs text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent disabled:opacity-50 ${rangeBad ? "border-danger" : "border-border"}`}
                  />
                </label>
              )}
              <button
                type="button"
                onClick={() => onRemoveStore(store)}
                disabled={disabled}
                className="p-0.5 text-text-muted hover:text-danger transition-colors disabled:opacity-50"
                aria-label={`Remove ${store.name} from ${displayName}`}
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          );
        })}
        {members.length === 0 && (
          <span className="text-xs text-text-muted">No stores in this group yet.</span>
        )}
        <select
          value=""
          disabled={disabled || candidates.length === 0}
          onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
            const store = candidates.find((s: Store) => s.id === e.target.value);
            if (store) onAddStore(store);
          }}
          aria-label={`Add store to ${displayName}`}
          className="rounded-md border border-border bg-surface px-2 py-1 text-xs text-text focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent disabled:opacity-50"
        >
          <option value="">Add store...</option>
          {candidates.map((store: Store) => {
            const currentId: string | null = effectiveGroupIds[store.id] ?? null;
            return (
              <option key={store.id} value={store.id}>
                {currentId && groupNamesById[currentId]
                  ? `${store.name} (current: ${groupNamesById[currentId]})`
                  : store.name}
              </option>
            );
          })}
        </select>
      </div>
      {perStore && members.some((s: Store) => !isValidRangeInput(storeRanges[s.id] ?? "")) && (
        <p className="mt-1 pl-7 text-xs text-danger">
          Store range must be a whole number of 1 or more.
        </p>
      )}
    </div>
  );
}

/**
 * 그룹 관리 모달 — 이름/채번 모드/번호대/순서/매장 편성/그룹 추가/삭제를 draft 에
 * 쌓고 Save 로 일괄 적용 (① 생성 → ② 수정 → ③ 편성 → ④ 삭제 → ⑤ 순서),
 * Cancel/ESC/backdrop 은 dirty 면 확인 후 폐기한다.
 *
 * Manage Groups modal. All edits accumulate in a local draft and commit on
 * Save (create → update → reassign → delete → reorder); Cancel/ESC/backdrop
 * discards after confirmation when dirty.
 */
function ManageGroupsModal({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}): React.ReactElement {
  const modal = useModal();
  const { success } = useMutationToast();
  const queryClient = useQueryClient();
  const { data: groups, isLoading } = useStoreGroups();
  // 그룹별 매장 칩/추가 select 용 — 기본 뷰(closed 제외), 페이지와 ["stores"] 캐시 공유
  const { data: stores } = useStores();
  // 전부 silent + mutateAsync — per-op 모달/토스트 없이 Save 흐름이 결과를 직접 표시
  const createGroup = useCreateStoreGroup({ silent: true });
  const updateGroup = useUpdateStoreGroup({ silent: true });
  const deleteGroup = useDeleteStoreGroup({ silent: true });
  const reorderGroups = useReorderStoreGroups({ silent: true });
  const updateStore = useUpdateStore({ silent: true });

  const [newName, setNewName] = useState<string>("");
  /** 그룹별 EMPID 중복 경고 (실제 group id 키) / Per-group duplicate-EMPID warnings keyed by real group id */
  const [dupWarnings, setDupWarnings] = useState<Record<string, { groupName: string; count: number }>>({});
  /** 모달 안의 모든 편집이 쌓이는 draft — null 이면 서버 데이터로 (재)초기화 대기 / Local draft; null = awaiting (re)init */
  const [draft, setDraft] = useState<GroupsDraft | null>(null);
  /** Save 진행 중 — 모달 전체 잠금 / Save in flight, whole modal locked */
  const [isSaving, setIsSaving] = useState<boolean>(false);
  /** 신규 그룹 tempId 카운터 / tempId counter for new groups */
  const tempIdCounter = useRef(0);

  const groupList: StoreGroup[] = useMemo(
    () =>
      Array.isArray(groups) ? [...groups].sort((a, b) => a.sort_order - b.sort_order) : [],
    [groups],
  );

  /** 캐시 순서(전역 sort_order) 그대로의 매장 목록 / Stores in cached (global) order */
  const storeList: Store[] = useMemo(
    () => (Array.isArray(stores) ? stores : []),
    [stores],
  );

  // 모달 오픈 시 draft 리셋 — 아래 초기화 effect 가 서버 데이터로 채움
  // Reset the draft when the modal opens; the init effect below refills it
  const wasOpen = useRef(false);
  useEffect(() => {
    if (isOpen && !wasOpen.current) {
      setDraft(null);
      setNewName("");
    }
    wasOpen.current = isOpen;
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && draft === null && Array.isArray(groups) && Array.isArray(stores)) {
      setDraft(buildGroupsDraft(groupList, storeList));
    }
  }, [isOpen, draft, groups, stores, groupList, storeList]);

  /** 적용될 서버 연산 계획 — footer 의 (N) 과 Save 가 공유 / Planned ops (footer count + Save) */
  const ops: GroupSaveOps | null = useMemo(
    () => (draft ? computeGroupSaveOps(draft, groupList, storeList) : null),
    [draft, groupList, storeList],
  );
  /** dirty = 적용될 서버 연산이 1개 이상 / Dirty when at least one server op would apply */
  const dirty: boolean = (ops?.count ?? 0) > 0;

  /**
   * 무효 번호대 입력 존재 여부 — 그룹(미삭제 행) + 매장 전부. parseRangeStart 가 무효
   * 입력을 조용히 null 로 저장해 버리지 않도록 Save 를 막는다 (인라인 경고와 짝).
   * Any invalid range input across surviving group rows and all stores. Blocks
   * Save so parseRangeStart never silently persists an invalid entry as null.
   */
  const invalidRanges: boolean = useMemo(() => {
    if (!draft) return false;
    const deleted = new Set<string>(draft.deleted);
    const badGroup: boolean = draft.order.some(
      (id: string) => !deleted.has(id) && !isValidRangeInput(draft.groups[id]?.rangeStart ?? ""),
    );
    const badStore: boolean = Object.values(draft.storeRange).some(
      (v: string) => !isValidRangeInput(v),
    );
    return badGroup || badStore;
  }, [draft]);

  /** draft 기준 매장별 소속 그룹 (삭제 표시 그룹 소속 → Ungrouped) / Effective store→group per draft */
  const effectiveGroupIds: Record<string, string | null> = useMemo(() => {
    if (!draft) return {};
    const deleted = new Set<string>(draft.deleted);
    const result: Record<string, string | null> = {};
    for (const store of storeList) {
      const assigned = draft.storeAssign[store.id];
      const raw: string | null = assigned === undefined ? (store.group_id ?? null) : assigned;
      result[store.id] = raw != null && deleted.has(raw) ? null : raw;
    }
    return result;
  }, [draft, storeList]);

  /** "(current: 그룹명)" 라벨용 — 미삭제 그룹의 draft 이름 / Surviving groups' draft names for labels */
  const groupNamesById: Record<string, string> = useMemo(() => {
    if (!draft) return {};
    const deleted = new Set<string>(draft.deleted);
    return Object.fromEntries(
      draft.order
        .filter((id: string) => !deleted.has(id))
        .map((id: string) => [id, draft.groups[id]?.name.trim() || "Untitled group"]),
    );
  }, [draft]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  /** 그룹 드래그 정렬 — draft 순서만 변경 / Drag reorder (draft only) */
  const handleDragEnd = useCallback((event: DragEndEvent): void => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setDraft((prev) => {
      if (!prev) return prev;
      const oldIndex: number = prev.order.indexOf(String(active.id));
      const newIndex: number = prev.order.indexOf(String(over.id));
      if (oldIndex === -1 || newIndex === -1) return prev;
      return { ...prev, order: arrayMove(prev.order, oldIndex, newIndex) };
    });
  }, []);

  /** draft 그룹 필드 갱신 / Patch one draft group's fields */
  const patchGroup = useCallback((id: string, fields: Partial<Omit<DraftGroup, "id">>): void => {
    setDraft((prev) => {
      const current = prev?.groups[id];
      if (!prev || !current) return prev;
      return { ...prev, groups: { ...prev.groups, [id]: { ...current, ...fields } } };
    });
  }, []);

  /** 삭제 표시 — Save 전까지 Undo 가능 (실수 방지) / Mark for deletion, undoable until Save */
  const markDeleted = useCallback((id: string): void => {
    setDraft((prev) =>
      prev && !prev.deleted.includes(id) ? { ...prev, deleted: [...prev.deleted, id] } : prev,
    );
  }, []);

  const undoDelete = useCallback((id: string): void => {
    setDraft((prev) =>
      prev ? { ...prev, deleted: prev.deleted.filter((d: string) => d !== id) } : prev,
    );
  }, []);

  /** 매장 편성 변경 (null = Ungrouped) — draft 만 / Reassign a store in the draft */
  const assignStore = useCallback((storeId: string, groupId: string | null): void => {
    setDraft((prev) =>
      prev ? { ...prev, storeAssign: { ...prev.storeAssign, [storeId]: groupId } } : prev,
    );
  }, []);

  /** 매장별 번호대 raw 입력 갱신 — draft 만 / Update one store's raw range input in the draft */
  const setStoreRange = useCallback((storeId: string, value: string): void => {
    setDraft((prev) =>
      prev ? { ...prev, storeRange: { ...prev.storeRange, [storeId]: value } } : prev,
    );
  }, []);

  /** 그룹 추가 — tempId 로 draft 에만 추가, POST 는 Save 에서 / Add a group to the draft only */
  const handleAdd = useCallback((): void => {
    const trimmed: string = newName.trim();
    if (!trimmed) return;
    tempIdCounter.current += 1;
    const tempId: string = `${TEMP_GROUP_ID_PREFIX}${tempIdCounter.current}`;
    setDraft((prev) =>
      prev
        ? {
            ...prev,
            groups: {
              ...prev.groups,
              [tempId]: { id: tempId, name: trimmed, numbering_mode: "group", rangeStart: "" },
            },
            order: [...prev.order, tempId],
          }
        : prev,
    );
    setNewName("");
  }, [newName]);

  /** 폐기 확인 모달 표시 중 재진입 방지 (ESC 연타 등) / Guards re-entrant discard confirms (e.g. ESC mashing) */
  const confirmingRef = useRef(false);

  /** 닫기 요청 — dirty 면 폐기 확인, 저장/확인 중엔 무시 / Close request (confirm when dirty; ignored while saving or already confirming) */
  const requestClose = useCallback(async (): Promise<void> => {
    if (isSaving || confirmingRef.current) return;
    if (dirty) {
      confirmingRef.current = true;
      try {
        const ok = await modal.confirm({
          title: "Discard changes",
          message: "Discard unsaved changes?",
          confirmLabel: "Discard",
          variant: "danger",
        });
        if (!ok) return;
      } finally {
        confirmingRef.current = false;
      }
    }
    onClose();
  }, [isSaving, dirty, modal, onClose]);

  /**
   * Save — 계획된 연산을 ① 생성 → ② 수정 → ③ 매장 편성 → ④ 삭제 → ⑤ 순서로 순차
   * 적용. 실패 시 그 지점에서 중단: 이미 생성된 그룹은 draft 의 tempId 를 실제 id 로
   * 치환해 재시도가 중복 생성하지 않게 하고, 캐시를 무효화해 서버 상태로 재동기화한다
   * (모달은 유지). 전부 성공 시 ②③ 응답의 duplicate_empids 로 경고를 갱신하고 캐시
   * 무효화 + draft 재초기화(모달 유지, 경고 배너 확인 가능) + 성공 안내 1회.
   *
   * Save applies the planned ops in order (create → update → reassign →
   * delete → reorder), stopping at the first failure: already-created groups
   * get their tempIds remapped in the draft so a retry can't create
   * duplicates, and caches are invalidated to resync (modal stays open). On
   * full success, duplicate-EMPID warnings update from the ②③ responses,
   * caches invalidate, and the draft re-initializes with the modal kept open.
   */
  const handleSave = useCallback(async (): Promise<void> => {
    if (!draft || !ops || ops.count === 0 || isSaving || invalidRanges) return;
    // 빈 이름은 서버 요청 전에 차단 / Block empty names before any request
    const unnamed: string[] = ops.finalOrder.filter((id: string) => !draft.groups[id]?.name.trim());
    if (unnamed.length > 0) {
      void modal.alert({
        type: "error",
        message: "Every group needs a name. Fill in the blank group name and save again.",
      });
      return;
    }
    setIsSaving(true);
    /** tempId → 생성된 실제 id / tempId → created real id */
    const tempIdMap: Record<string, string> = {};
    const realId = (id: string): string => tempIdMap[id] ?? id;
    /** ②③ 응답으로 모으는 경고 변화 (null = 해제) / Warning changes from ②③ (null clears) */
    const warningChanges: Record<string, { groupName: string; count: number } | null> = {};
    try {
      // ① 신규 그룹 생성 — tempId 매핑 확보 / Create new groups, capture id mapping
      for (const g of ops.creates) {
        const created = await createGroup.mutateAsync({
          name: g.name.trim(),
          numbering_mode: g.numbering_mode,
          number_range_start: parseRangeStart(g.rangeStart),
        });
        tempIdMap[g.id] = created.id;
      }
      // ② 기존 그룹 변경분 — 변경 필드만 / Update changed fields of existing groups
      for (const u of ops.updates) {
        const updated = await updateGroup.mutateAsync({ id: u.id, ...u.data });
        warningChanges[u.id] =
          updated.duplicate_empids.length > 0
            ? { groupName: updated.name, count: updated.duplicate_empids.length }
            : null;
      }
      // ③ 매장 수정 — 변경 필드(group_id/number_range_start)만 담아 매장당 PUT 1회,
      // tempId 는 ① 매핑으로 해석 / Per-store PUTs carrying only the changed fields
      // (group_id and/or number_range_start); tempIds resolved via ①
      for (const m of ops.moves) {
        const targetId: string | null = m.target != null ? realId(m.target) : null;
        const data: { group_id?: string | null; number_range_start?: number | null } = {};
        if (m.target !== undefined) data.group_id = targetId;
        if (m.rangeStart !== undefined) data.number_range_start = m.rangeStart;
        const updated = await updateStore.mutateAsync({ id: m.storeId, ...data });
        // EMPID 중복 경고 갱신은 편성(group_id)이 바뀐 매장에만 해당 / Duplicate-EMPID
        // warning updates only apply to moves that changed group_id
        if (m.target !== undefined) {
          // 매장이 빠진 그룹은 중복이 늘 수 없다 — 이전 그룹의 남은 경고 해제
          // A store leaving a group can't add duplicates there — drop its stale warning
          const prevGroupId: string | null =
            storeList.find((s: Store) => s.id === m.storeId)?.group_id ?? null;
          if (prevGroupId && prevGroupId !== targetId && !(prevGroupId in warningChanges)) {
            warningChanges[prevGroupId] = null;
          }
          if (targetId != null && m.target != null) {
            const dupes = updated.duplicate_empids ?? [];
            const groupName: string = draft.groups[m.target]?.name.trim() || "Group";
            warningChanges[targetId] =
              dupes.length > 0 ? { groupName, count: dupes.length } : null;
          }
        }
      }
      // ④ 그룹 삭제 — 남은 소속 매장은 서버가 SET NULL / Delete groups (server SET NULLs members)
      for (const id of ops.deletes) {
        await deleteGroup.mutateAsync(id);
        warningChanges[id] = null;
      }
      // ⑤ 순서 저장 — 실제 id 순서 / Persist the final order with real ids
      if (ops.reorder) {
        await reorderGroups.mutateAsync(ops.finalOrder.map(realId));
      }
      // 전부 성공 — 경고 반영, 서버 재동기화, draft 재초기화 (모달은 열린 채 유지)
      // All succeeded: apply warnings, resync, re-init draft (modal stays open)
      setDupWarnings((prev) => {
        const next = { ...prev };
        for (const [gid, warning] of Object.entries(warningChanges)) {
          if (warning) next[gid] = warning;
          else delete next[gid];
        }
        return next;
      });
      // refetch 완료를 기다린 뒤에 draft 를 비워야 초기화 effect 가 stale 캐시로
      // 재초기화하지 않는다 (팬텀 dirty 방지) / Await the refetches before clearing the
      // draft so the init effect never rebuilds from a stale cache (phantom dirty)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["stores"] }),
        queryClient.invalidateQueries({ queryKey: ["store-groups"] }),
      ]);
      setDraft(null); // 초기화 effect 가 최신 캐시로 다시 채움 / init effect refills from fresh cache
      success("Groups saved.");
    } catch (err) {
      // 실패 지점에서 중단 — 생성 완료분의 tempId 를 실제 id 로 치환 (재시도 시 중복 생성 방지)
      // Stop at the failure point; remap created tempIds so a retry can't duplicate them
      if (Object.keys(tempIdMap).length > 0) {
        setDraft((prev) => {
          if (!prev) return prev;
          return {
            groups: Object.fromEntries(
              Object.values(prev.groups).map((g: DraftGroup) => [
                realId(g.id),
                { ...g, id: realId(g.id) },
              ]),
            ),
            order: prev.order.map(realId),
            deleted: prev.deleted.map(realId),
            storeAssign: Object.fromEntries(
              Object.entries(prev.storeAssign).map(([sid, gid]) => [
                sid,
                gid != null ? realId(gid) : null,
              ]),
            ),
            // storeRange 는 storeId 키라 remap 불필요 / Keyed by store id, no remap needed
            storeRange: prev.storeRange,
          };
        });
      }
      queryClient.invalidateQueries({ queryKey: ["stores"] });
      queryClient.invalidateQueries({ queryKey: ["store-groups"] });
      void modal.alert({
        type: "error",
        title: "Couldn't save all changes",
        message: parseApiError(err, "Something went wrong while saving."),
        details: [
          "Changes applied before the error were kept. The rest are still here — review and save again.",
        ],
      });
    } finally {
      setIsSaving(false);
    }
  }, [
    draft,
    ops,
    isSaving,
    invalidRanges,
    createGroup,
    updateGroup,
    updateStore,
    deleteGroup,
    reorderGroups,
    storeList,
    queryClient,
    modal,
    success,
  ]);

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => void requestClose()}
      title="Manage Groups"
      size="lg"
      closeOnBackdrop
    >
      <div className="space-y-4">
        {Object.entries(dupWarnings).map(([groupId, warning]) => (
          <div
            key={groupId}
            className="rounded-lg border border-warning/40 bg-warning-muted px-3 py-2 text-xs text-text"
          >
            <span className="font-semibold">{warning.groupName}:</span>{" "}
            {duplicateEmpidMessage(warning.count)}
          </div>
        ))}
        {isLoading || !draft ? (
          <div className="flex items-center justify-center py-8">
            <LoadingSpinner />
          </div>
        ) : draft.order.length === 0 ? (
          <p className="py-4 text-center text-sm text-text-muted">
            No groups yet. Add one below to organize stores into sections.
          </p>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={draft.order} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">
                {draft.order.map((id: string) => {
                  const draftGroup = draft.groups[id];
                  if (!draftGroup) return null;
                  return (
                    <SortableGroupRow
                      key={id}
                      draftGroup={draftGroup}
                      isNew={isTempGroupId(id)}
                      isDeleted={draft.deleted.includes(id)}
                      members={storeList.filter((s: Store) => effectiveGroupIds[s.id] === id)}
                      candidates={storeList.filter((s: Store) => effectiveGroupIds[s.id] !== id)}
                      effectiveGroupIds={effectiveGroupIds}
                      groupNamesById={groupNamesById}
                      storeRanges={draft.storeRange}
                      disabled={isSaving}
                      onPatch={(fields) => patchGroup(id, fields)}
                      onDelete={() => markDeleted(id)}
                      onUndoDelete={() => undoDelete(id)}
                      onRemoveStore={(store: Store) => assignStore(store.id, null)}
                      onAddStore={(store: Store) => assignStore(store.id, id)}
                      onStoreRangeChange={setStoreRange}
                    />
                  );
                })}
              </div>
            </SortableContext>
          </DndContext>
        )}
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="New group name"
            value={newName}
            disabled={isSaving || !draft}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewName(e.target.value)}
            onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
              if (e.key === "Enter") {
                e.preventDefault();
                handleAdd();
              }
            }}
            className="flex-1 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent disabled:opacity-50"
          />
          <Button
            variant="secondary"
            size="sm"
            onClick={handleAdd}
            disabled={!newName.trim() || isSaving || !draft}
          >
            Add
          </Button>
        </div>
        {/* Footer — draft 폐기(dirty 면 확인) / 일괄 저장 (N = 적용될 서버 연산 수) */}
        <div className="flex items-center justify-end gap-2 pt-2">
          {invalidRanges && (
            <span className="mr-auto text-xs text-danger">
              Range inputs must be whole numbers of 1 or more.
            </span>
          )}
          <Button variant="secondary" onClick={() => void requestClose()} disabled={isSaving}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => void handleSave()}
            isLoading={isSaving}
            disabled={!dirty || isSaving || invalidRanges}
          >
            {isSaving ? "Saving..." : dirty ? `Save changes (${ops?.count ?? 0})` : "Save changes"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export default function StoresPage(): React.ReactElement {
  const router = useRouter();
  const modal = useModal();

  /** 권한 훅 / Permission hook */
  const { hasPermission } = usePermissions();
  const tz = useTimezone();
  const canWrite = hasPermission(PERMISSIONS.STORES_CREATE);

  /** 검색어 + 상태 필터 (URL-persisted) / Search + status filter state */
  const [urlParams, setUrlParams] = usePersistedFilters("stores", {
    search: "",
    status: "active", // active = closed 제외 전체 (기본). open/preparing/paused/closed = 해당만
  });
  const searchQuery = urlParams.search;
  const statusFilter = urlParams.status;
  const includeClosed = statusFilter === "closed";

  /** 매장 데이터 훅 / Store data hooks */
  const { data: stores, isLoading } = useStores({ includeClosed });
  const { data: groups } = useStoreGroups();
  const queryClient = useQueryClient();
  // 매장 생성/수정/삭제 — handleCreate 가 매장+shifts+positions chain 을 통합 결과 1번으로 표시하려고 silent 옵션 사용
  const createStore = useCreateStore({ silent: true });
  const updateStore = useUpdateStore();
  const deleteStore = useDeleteStore();
  const reorderStores = useReorderStores();
  const createShift = useCreateShift({ silent: true });
  const createPosition = useCreatePosition({ silent: true });

  /** 생성 모달 상태 / Create modal state */
  const [isCreateOpen, setIsCreateOpen] = useState<boolean>(false);
  const [createForm, setCreateForm] = useState<StoreFormData>(INITIAL_FORM);
  const [newShiftName, setNewShiftName] = useState<string>("");
  const [newPositionName, setNewPositionName] = useState<string>("");
  const [isCreating, setIsCreating] = useState<boolean>(false);

  /** 수정 모달 상태 / Edit modal state */
  const [isEditOpen, setIsEditOpen] = useState<boolean>(false);
  const [editForm, setEditForm] = useState<StoreFormData>(INITIAL_FORM);
  const [editingStoreId, setEditingStoreId] = useState<string | null>(null);

  /** 그룹 관리 모달 상태 / Manage Groups modal state */
  const [isGroupsOpen, setIsGroupsOpen] = useState<boolean>(false);

  /** 검색 + 상태로 필터링된 매장 목록 / Filtered stores by search + status */
  const filteredStores: Store[] = useMemo(() => {
    if (!Array.isArray(stores)) return [];
    let result = stores;
    // 상태 필터: active = closed 제외 전체, 그 외 = 해당 status 만
    if (statusFilter === "active") {
      result = result.filter((s) => s.status !== "closed");
    } else if (statusFilter !== "all") {
      result = result.filter((s) => s.status === statusFilter);
    }
    const query: string = searchQuery.trim().toLowerCase();
    if (query) {
      result = result.filter(
        (store: Store) =>
          store.name.toLowerCase().includes(query) ||
          (store.code && store.code.toLowerCase().includes(query)) ||
          (store.address && store.address.toLowerCase().includes(query)),
      );
    }
    return result;
  }, [stores, searchQuery, statusFilter]);

  /** 사용 중인 코드 집합 — 폐점 매장은 코드를 반납하므로 제외 (서버 dedup과 일치) */
  const liveCodes: string[] = useMemo(
    () =>
      Array.isArray(stores)
        ? stores
            .filter((s) => s.status !== "closed")
            .map((s) => s.code)
            .filter((c): c is string => Boolean(c))
        : [],
    [stores],
  );

  /** 코드 미리보기 — 이름 입력 시 비워두면 자동 생성될 코드를 placeholder로 안내 */
  const codePreview: string = useMemo(
    () => (createForm.name.trim() ? previewStoreCode(createForm.name, liveCodes) : ""),
    [createForm.name, liveCodes],
  );

  /** 드래그 정렬 가능 여부 — 기본 active 뷰 + 검색 없을 때만 (순서는 org 전역) */
  const canReorder = canWrite && statusFilter === "active" && !searchQuery.trim();

  /** sort_order 순 그룹 목록 / Groups sorted by sort_order */
  const groupList: StoreGroup[] = useMemo(
    () =>
      Array.isArray(groups) ? [...groups].sort((a, b) => a.sort_order - b.sort_order) : [],
    [groups],
  );

  /** Create/Edit 모달의 Group select 옵션 / Group select options */
  const groupOptions = useMemo(
    () => [
      { value: "", label: "None" },
      ...groupList.map((g: StoreGroup) => ({ value: g.id, label: g.name })),
    ],
    [groupList],
  );

  /** 그룹 섹션 (sort_order 순) + 마지막 Ungrouped / Group sections in sort_order, Ungrouped last */
  const sections: StoreSection[] = useMemo(() => {
    const byGroup = new Map<string, Store[]>();
    const ungrouped: Store[] = [];
    const knownGroupIds = new Set(groupList.map((g) => g.id));
    for (const store of filteredStores) {
      const gid = store.group_id ?? null;
      if (gid && knownGroupIds.has(gid)) {
        const list = byGroup.get(gid);
        if (list) list.push(store);
        else byGroup.set(gid, [store]);
      } else {
        ungrouped.push(store);
      }
    }
    const result: StoreSection[] = groupList.map((g: StoreGroup) => ({
      groupId: g.id,
      name: g.name,
      group: g,
      stores: byGroup.get(g.id) ?? [],
    }));
    result.push({ groupId: null, name: "Ungrouped", group: null, stores: ungrouped });
    return result;
  }, [filteredStores, groupList]);

  /** 검색/상태 필터 중에는 빈 섹션 숨김, 빈 Ungrouped 는 항상 숨김 / Visible sections */
  const isFiltering: boolean = Boolean(searchQuery.trim()) || statusFilter !== "active";
  const visibleSections: StoreSection[] = useMemo(
    () => sections.filter((s) => s.stores.length > 0 || (!isFiltering && s.groupId !== null)),
    [sections, isFiltering],
  );

  /**
   * 섹션 내 재정렬을 화면 전체 store 순서 배열로 확장 — 다른 매장의 전역
   * 위치는 보존하고, 드래그한 섹션이 차지한 슬롯만 새 섹션 내 순서로 교체.
   * 서버 PUT /console/stores/reorder 와 useReorderStores 의 낙관적 캐시는
   * "완전한 전체 순서 배열"을 가정하므로 부분 배열을 절대 넘기면 안 됨.
   *
   * Expand a within-section reorder into the complete flat order of every
   * store on screen, preserving every other store's global position — only
   * the dragged section's slots are reassigned. The server and the
   * optimistic cache both assume the full ordered array (a partial array
   * would drop other stores from cache).
   */
  const buildFlatOrder = useCallback(
    (groupId: string | null, idsInGroup: string[]): string[] => {
      // Keep every other store's global position: walk the current global order
      // (cache order) and reassign only the dragged section's slots to the new
      // in-section order.
      const sectionIds = new Set(
        sections.find((s: StoreSection) => s.groupId === groupId)?.stores.map((x: Store) => x.id) ?? [],
      );
      let i = 0;
      return filteredStores.map((store: Store) =>
        sectionIds.has(store.id) ? (idsInGroup[i++] ?? store.id) : store.id,
      );
    },
    [filteredStores, sections],
  );

  /** 고유 ID 카운터 / Unique ID counter for form items */
  const idCounter = useRef(0);
  const nextId = useCallback((): string => {
    idCounter.current += 1;
    return `item-${idCounter.current}`;
  }, []);

  /** Shift 추가 핸들러 / Add shift to create form */
  const handleAddShift = useCallback((): void => {
    if (!newShiftName.trim()) return;
    setCreateForm((prev: StoreFormData) => ({
      ...prev,
      shifts: [...prev.shifts, { id: nextId(), name: newShiftName.trim() }],
    }));
    setNewShiftName("");
  }, [newShiftName, nextId]);

  /** Position 추가 핸들러 / Add position to create form */
  const handleAddPosition = useCallback((): void => {
    if (!newPositionName.trim()) return;
    setCreateForm((prev: StoreFormData) => ({
      ...prev,
      positions: [...prev.positions, { id: nextId(), name: newPositionName.trim() }],
    }));
    setNewPositionName("");
  }, [newPositionName, nextId]);

  /** Shift 제거 핸들러 / Remove shift from create form */
  const handleRemoveShift = useCallback((id: string): void => {
    setCreateForm((prev: StoreFormData) => ({
      ...prev,
      shifts: prev.shifts.filter((item: FormItem) => item.id !== id),
    }));
  }, []);

  /** Position 제거 핸들러 / Remove position from create form */
  const handleRemovePosition = useCallback((id: string): void => {
    setCreateForm((prev: StoreFormData) => ({
      ...prev,
      positions: prev.positions.filter((item: FormItem) => item.id !== id),
    }));
  }, []);

  /** dnd-kit 센서 / dnd-kit sensors */
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  /** Shift 드래그앤드롭 핸들러 / Shift drag-and-drop reorder */
  const handleDragEndShifts = useCallback((event: DragEndEvent): void => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setCreateForm((prev: StoreFormData) => {
      const oldIndex = prev.shifts.findIndex((item: FormItem) => item.id === active.id);
      const newIndex = prev.shifts.findIndex((item: FormItem) => item.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return prev;
      return { ...prev, shifts: arrayMove(prev.shifts, oldIndex, newIndex) };
    });
  }, []);

  /** Position 드래그앤드롭 핸들러 / Position drag-and-drop reorder */
  const handleDragEndPositions = useCallback((event: DragEndEvent): void => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setCreateForm((prev: StoreFormData) => {
      const oldIndex = prev.positions.findIndex((item: FormItem) => item.id === active.id);
      const newIndex = prev.positions.findIndex((item: FormItem) => item.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return prev;
      return { ...prev, positions: arrayMove(prev.positions, oldIndex, newIndex) };
    });
  }, []);

  /** 매장 생성 핸들러 / Handle store creation with shifts/positions */
  const handleCreate = useCallback(async (): Promise<void> => {
    if (!createForm.name.trim()) return;
    setIsCreating(true);
    // 매장 생성과 shift/position 생성은 분리된 호출이라 비원자적이다.
    // 매장이 만들어진 뒤 자식 생성이 실패하면 매장은 남으므로, 그 경우를 구분해 안내한다.
    let createdStoreId: string | null = null;
    try {
      // 변수로 구성 — useStores 의 CreateStoreData 에 아직 없는 group 필드를 함께 전송
      const payload = {
        name: createForm.name.trim(),
        code: createForm.code.trim() || undefined, // 비우면 서버가 자동 생성
        address: createForm.address.trim() || undefined,
        phone: createForm.phone.trim() || null,
        email: createForm.email.trim() || null,
        status: createForm.status,
        timezone: createForm.timezone || null,
        group_id: createForm.groupId || null,
        number_range_start: parseRangeStart(createForm.numberRangeStart),
      };
      const store = await createStore.mutateAsync(payload);
      // 그룹 store_count 갱신 / Refresh group store counts
      queryClient.invalidateQueries({ queryKey: ["store-groups"] });

      const storeId: string = store.id;
      createdStoreId = storeId;

      if (createForm.shifts.length > 0) {
        await Promise.all(
          createForm.shifts.map((item: FormItem, index: number) =>
            createShift.mutateAsync({ storeId: storeId, name: item.name, sort_order: index + 1 }),
          ),
        );
      }

      if (createForm.positions.length > 0) {
        await Promise.all(
          createForm.positions.map((item: FormItem, index: number) =>
            createPosition.mutateAsync({ storeId: storeId, name: item.name, sort_order: index + 1 }),
          ),
        );
      }

      setIsCreateOpen(false);
      setCreateForm(INITIAL_FORM);
      setNewShiftName("");
      setNewPositionName("");
      void modal.alert({ type: "success", message: "Brand created." });
    } catch (err) {
      if (createdStoreId) {
        // 매장은 생성됨 — 자식(shift/position) 일부 실패. 상세에서 마저 설정하도록 안내.
        setIsCreateOpen(false);
        setCreateForm(INITIAL_FORM);
        setNewShiftName("");
        setNewPositionName("");
        void modal.alert({
          type: "error",
          message:
            "The store was created, but some shifts or positions didn't save. " +
            "Open the store and finish setting them up.",
        });
        router.push(`/stores/${createdStoreId}`);
      } else {
        void modal.alert({ type: "error", message: parseApiError(err, "Couldn't create brand") });
      }
    } finally {
      setIsCreating(false);
    }
  }, [createForm, createStore, createShift, createPosition, modal, router, queryClient]);

  /** 수정 모달 열기 / Open edit modal */
  const handleOpenEdit = useCallback(
    (store: Store, e: React.MouseEvent): void => {
      e.stopPropagation();
      setEditingStoreId(store.id);
      setEditForm({
        name: store.name,
        code: store.code || "",
        address: store.address || "",
        phone: store.phone || "",
        email: store.email || "",
        status: store.status,
        timezone: store.timezone || "",
        groupId: store.group_id ?? "",
        numberRangeStart: store.number_range_start != null ? String(store.number_range_start) : "",
        shifts: [],
        positions: [],
      });
      setIsEditOpen(true);
    },
    [],
  );

  /** 매장 수정 핸들러 / Handle store update */
  const handleUpdate = useCallback(async (): Promise<void> => {
    if (!editingStoreId || !editForm.name.trim()) return;
    try {
      // 변수로 구성 — useStores 의 UpdateStoreData 에 아직 없는 group 필드를 함께 전송
      const payload = {
        id: editingStoreId,
        name: editForm.name.trim(),
        code: editForm.code.trim() || null,
        address: editForm.address.trim() || undefined,
        phone: editForm.phone.trim() || null,
        email: editForm.email.trim() || null,
        status: editForm.status,
        timezone: editForm.timezone || null,
        group_id: editForm.groupId || null, // 명시적 null = 그룹 해제
        number_range_start: parseRangeStart(editForm.numberRangeStart),
      };
      const updated = await updateStore.mutateAsync(payload);
      // 그룹 편성이 바뀌었을 수 있으므로 store_count 갱신 / Group membership may have changed
      queryClient.invalidateQueries({ queryKey: ["store-groups"] });
      setIsEditOpen(false);
      setEditingStoreId(null);
      setEditForm(INITIAL_FORM);
      // 그룹 편성 변경 응답에만 실리는 EMPID 중복 경고 / Duplicate-EMPID warning from group-change responses
      if (updated.duplicate_empids && updated.duplicate_empids.length > 0) {
        void modal.alert({
          type: "info",
          title: "Duplicate EMPIDs",
          message: duplicateEmpidMessage(updated.duplicate_empids.length),
        });
      }
    } catch {
      // hook 이 자동으로 에러 모달
    }
  }, [editingStoreId, editForm, updateStore, queryClient, modal]);

  /** 매장 삭제 핸들러 / Handle store deletion (inline confirm) */
  const handleOpenDelete = useCallback(
    async (store: Store, e: React.MouseEvent): Promise<void> => {
      e.stopPropagation();
      // Hard delete 가드 — 데이터 영구 삭제. store 이름을 직접 입력해야 진행.
      const typed = await modal.confirm({
        title: "Permanently delete store",
        message:
          `This permanently deletes "${store.name}" and all its data (shifts, positions, schedules, assignments). ` +
          `This cannot be undone. To only stop operating, set status to Paused or Closed instead.\n\n` +
          `Type the store name to confirm.`,
        confirmLabel: "Delete forever",
        variant: "danger",
        requiresReason: true,
        reasonLabel: `Type "${store.name}" to confirm`,
      });
      if (typed === undefined) return; // 취소
      if (typed.trim() !== store.name) {
        void modal.alert({ type: "error", message: "The name you typed doesn't match. Deletion cancelled." });
        return;
      }
      try {
        await deleteStore.mutateAsync(store.id);
      } catch {
        // hook 이 자동으로 에러 모달
      }
    },
    [modal, deleteStore],
  );

  /** 행 클릭으로 상세 페이지 이동 / Navigate to detail on row click */
  const handleRowClick = useCallback(
    (store: Store): void => {
      router.push(`/stores/${store.id}`);
    },
    [router],
  );

  /** 테이블 컬럼 정의 / Table column definitions */
  const columns: Column<Store>[] = useMemo(
    () => [
      {
        key: "code",
        header: "Code",
        className: "w-24",
        render: (store: Store) =>
          store.code ? (
            <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-surface border border-border text-text-secondary">
              {store.code}
            </span>
          ) : (
            <span className="text-text-muted">-</span>
          ),
      },
      {
        key: "name",
        header: "Name",
        render: (store: Store) => (
          <span className="font-medium text-text">{store.name}</span>
        ),
      },
      {
        key: "address",
        header: "Address",
        hideOnMobile: true,
        render: (store: Store) => (
          <span className="text-text-secondary">
            {store.address || "-"}
          </span>
        ),
      },
      {
        key: "status",
        header: "Status",
        render: (store: Store) => {
          const s = STATUS_BADGE[store.status] ?? STATUS_BADGE.open;
          return <Badge variant={s.variant}>{s.label}</Badge>;
        },
      },
      {
        key: "created_at",
        header: "Created",
        hideOnMobile: true,
        render: (store: Store) => (
          <span className="text-text-muted text-xs">
            {formatDate(store.created_at, tz)}
          </span>
        ),
      },
      ...(canWrite
        ? [
            {
              key: "actions",
              header: "",
              className: "w-24 text-right",
              render: (store: Store) => (
                <div className="flex items-center justify-end gap-1">
                  <button
                    type="button"
                    onClick={(e: React.MouseEvent) => handleOpenEdit(store, e)}
                    className="p-1.5 rounded-md text-text-muted hover:text-text hover:bg-surface-hover transition-colors"
                    aria-label={`Edit ${store.name}`}
                  >
                    <Edit className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={(e: React.MouseEvent) => void handleOpenDelete(store, e)}
                    className="p-1.5 rounded-md text-text-muted hover:text-danger hover:bg-danger-muted transition-colors"
                    aria-label={`Delete ${store.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ),
            },
          ]
        : []),
    ],
    [handleOpenEdit, handleOpenDelete, canWrite, tz],
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div>
      {/* Page Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-extrabold text-text">Stores</h1>
        {canWrite && (
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              onClick={() => setIsGroupsOpen(true)}
            >
              <Layers className="h-4 w-4" />
              Manage Groups
            </Button>
            <Button
              variant="primary"
              onClick={() => setIsCreateOpen(true)}
            >
              <Plus className="h-4 w-4" />
              Add Store
            </Button>
          </div>
        )}
      </div>

      {/* Search + Status Filter */}
      <div className="mb-4 flex items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
          <input
            type="text"
            placeholder="Search stores..."
            value={searchQuery}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setUrlParams({ search: e.target.value })
            }
            className="w-full rounded-lg border border-border bg-surface pl-9 pr-3 py-2 text-sm text-text placeholder:text-text-muted transition-colors focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setUrlParams({ status: e.target.value })}
          className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent"
          aria-label="Filter by status"
        >
          <option value="active">All active</option>
          <option value="open">Open</option>
          <option value="preparing">Preparing</option>
          <option value="paused">Paused</option>
          <option value="closed">Closed</option>
        </select>
      </div>

      {/* Stores — 그룹이 없으면 기존 단일 테이블, 있으면 그룹 섹션 렌더 (검색 중 드래그 정렬 불가, 순서는 org 전역) */}
      {groupList.length === 0 ? (
        <Table<Store>
          columns={columns}
          data={filteredStores}
          isLoading={isLoading}
          onRowClick={handleRowClick}
          onReorder={
            canReorder ? (ids: string[]) => reorderStores.mutate(ids) : undefined
          }
          emptyMessage={
            statusFilter === "closed"
              ? "No closed stores."
              : "No stores found. Create your first store to get started."
          }
        />
      ) : visibleSections.length === 0 ? (
        <Table<Store>
          columns={columns}
          data={[]}
          isLoading={isLoading}
          emptyMessage={
            statusFilter === "closed"
              ? "No closed stores."
              : "No stores found. Create your first store to get started."
          }
        />
      ) : (
        <div className="space-y-8">
          {visibleSections.map((section: StoreSection) => (
            <div key={section.groupId ?? "ungrouped"}>
              {/* Section Header — 그룹명 + store 수 + numbering 뱃지 (checklists 의 store 섹션 헤더 패턴) */}
              <div className="flex items-center gap-3 mb-2">
                <h2 className="text-sm font-semibold text-text">{section.name}</h2>
                <span className="text-xs text-text-muted">
                  {section.group ? section.group.store_count : section.stores.length}{" "}
                  {(section.group ? section.group.store_count : section.stores.length) === 1
                    ? "store"
                    : "stores"}
                </span>
                {section.group && (
                  <Badge variant="accent">
                    {NUMBERING_MODE_LABEL[section.group.numbering_mode]}
                  </Badge>
                )}
                {section.group?.number_range_start != null && (
                  <span className="text-xs text-text-muted">
                    Starts at {section.group.number_range_start}
                  </span>
                )}
                <div className="flex-1 border-t border-border" />
              </div>

              {/* Stores in this group — onReorder 는 전체 순서 배열로 확장해서 전달 */}
              <Table<Store>
                columns={columns}
                data={section.stores}
                isLoading={isLoading}
                onRowClick={handleRowClick}
                onReorder={
                  canReorder
                    ? (ids: string[]) =>
                        reorderStores.mutate(buildFlatOrder(section.groupId, ids))
                    : undefined
                }
                emptyMessage={
                  section.groupId ? "No stores in this group yet." : "No ungrouped stores."
                }
              />
            </div>
          ))}
        </div>
      )}
      {canReorder && filteredStores.length > 1 && (
        <p className="mt-2 text-xs text-text-muted">
          Drag the handle to reorder how stores appear across the console.
        </p>
      )}
      {statusFilter === "closed" && filteredStores.length > 0 && (
        <p className="mt-2 text-xs text-text-muted">
          Closed stores are hidden from staff and block new schedules/clock-ins. Edit one and set its status back to Open to reopen it.
        </p>
      )}

      {/* Create Store Modal */}
      <Modal
        isOpen={isCreateOpen}
        onClose={() => {
          setIsCreateOpen(false);
          setCreateForm(INITIAL_FORM);
          setNewShiftName("");
          setNewPositionName("");
        }}
        title="Create Store"
        size="lg"
        closeOnBackdrop={false}
      >
        <div className="space-y-4">
          <Input
            label="Store Name"
            placeholder="Enter store name"
            value={createForm.name}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setCreateForm((prev: StoreFormData) => ({
                ...prev,
                name: e.target.value,
              }))
            }
          />
          <div>
            <Input
              label="Code"
              placeholder={codePreview ? `${codePreview} (auto)` : "Auto from name if blank (e.g. SWC)"}
              value={createForm.code}
              maxLength={10}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setCreateForm((prev: StoreFormData) => ({
                  ...prev,
                  code: e.target.value.toUpperCase(),
                }))
              }
            />
            <p className="mt-1 text-xs text-text-muted">
              {codePreview && !createForm.code.trim() ? (
                <>
                  2–10 letters/numbers. Leave blank to use{" "}
                  <span className="font-semibold text-text-secondary">{codePreview}</span>,
                  auto-generated from the name.
                </>
              ) : (
                <>2–10 letters/numbers. Leave blank to auto-generate from the name (first 3 letters).</>
              )}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Phone"
              placeholder="Optional"
              value={createForm.phone}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setCreateForm((prev: StoreFormData) => ({ ...prev, phone: e.target.value }))
              }
            />
            <Input
              label="Email"
              placeholder="Optional"
              value={createForm.email}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setCreateForm((prev: StoreFormData) => ({ ...prev, email: e.target.value }))
              }
            />
          </div>
          <Input
            label="Address"
            placeholder="Enter address (optional)"
            value={createForm.address}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setCreateForm((prev: StoreFormData) => ({
                ...prev,
                address: e.target.value,
              }))
            }
          />
          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Status"
              options={STORE_STATUS_OPTIONS}
              value={createForm.status}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                setCreateForm((prev: StoreFormData) => ({
                  ...prev,
                  status: e.target.value as StoreStatus,
                }))
              }
            />
            <Select
              label="Timezone"
              placeholder="Use Organization Default"
              options={TIMEZONE_OPTIONS}
              value={createForm.timezone}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                setCreateForm((prev: StoreFormData) => ({
                  ...prev,
                  timezone: e.target.value,
                }))
              }
            />
          </div>
          <div>
            <div className="grid grid-cols-2 gap-3">
              <Select
                label="Group"
                options={groupOptions}
                value={createForm.groupId}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  setCreateForm((prev: StoreFormData) => ({
                    ...prev,
                    groupId: e.target.value,
                  }))
                }
              />
              <Input
                label="Number Range Start"
                type="number"
                min={1}
                placeholder="Optional"
                value={createForm.numberRangeStart}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setCreateForm((prev: StoreFormData) => ({
                    ...prev,
                    numberRangeStart: e.target.value,
                  }))
                }
              />
            </div>
            <p className="mt-1 text-xs text-text-muted">
              Number range start sets the first EMPID for this store&apos;s own numbering. Leave blank for the default.
            </p>
          </div>

          {/* Shifts Section */}
          <div>
            <label className="text-sm font-medium text-text-secondary block mb-2">
              Shifts (optional)
            </label>
            {createForm.shifts.length > 0 && (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEndShifts}
              >
                <SortableContext
                  items={createForm.shifts.map((item: FormItem) => item.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-1 mb-2">
                    {createForm.shifts.map((item: FormItem, index: number) => (
                      <DraggableStringRow
                        key={item.id}
                        id={item.id}
                        name={item.name}
                        index={index}
                        onRemove={() => handleRemoveShift(item.id)}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="e.g. Morning, Afternoon, Night"
                value={newShiftName}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setNewShiftName(e.target.value)
                }
                onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddShift();
                  }
                }}
                className="flex-1 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent"
              />
              <Button
                variant="secondary"
                size="sm"
                onClick={handleAddShift}
                disabled={!newShiftName.trim()}
              >
                Add
              </Button>
            </div>
          </div>

          {/* Positions Section */}
          <div>
            <label className="text-sm font-medium text-text-secondary block mb-2">
              Positions (optional)
            </label>
            {createForm.positions.length > 0 && (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEndPositions}
              >
                <SortableContext
                  items={createForm.positions.map((item: FormItem) => item.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-1 mb-2">
                    {createForm.positions.map((item: FormItem, index: number) => (
                      <DraggableStringRow
                        key={item.id}
                        id={item.id}
                        name={item.name}
                        index={index}
                        onRemove={() => handleRemovePosition(item.id)}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="e.g. Barista, Manager, Cashier"
                value={newPositionName}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setNewPositionName(e.target.value)
                }
                onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddPosition();
                  }
                }}
                className="flex-1 rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent"
              />
              <Button
                variant="secondary"
                size="sm"
                onClick={handleAddPosition}
                disabled={!newPositionName.trim()}
              >
                Add
              </Button>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="secondary"
              onClick={() => {
                setIsCreateOpen(false);
                setCreateForm(INITIAL_FORM);
                setNewShiftName("");
                setNewPositionName("");
              }}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleCreate}
              isLoading={isCreating}
              disabled={!createForm.name.trim()}
            >
              Create
            </Button>
          </div>
        </div>
      </Modal>

      {/* Edit Store Modal */}
      <Modal
        isOpen={isEditOpen}
        onClose={() => {
          setIsEditOpen(false);
          setEditingStoreId(null);
          setEditForm(INITIAL_FORM);
        }}
        title="Edit Store"
        closeOnBackdrop={false}
      >
        <div className="space-y-4">
          <Input
            label="Store Name"
            placeholder="Enter store name"
            value={editForm.name}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setEditForm((prev: StoreFormData) => ({
                ...prev,
                name: e.target.value,
              }))
            }
          />
          <div>
            <Input
              label="Code"
              placeholder="e.g. SWC"
              value={editForm.code}
              maxLength={10}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setEditForm((prev: StoreFormData) => ({
                  ...prev,
                  code: e.target.value.toUpperCase(),
                }))
              }
            />
            <p className="mt-1 text-xs text-text-muted">
              2–10 letters/numbers, unique within your organization.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Phone"
              placeholder="Optional"
              value={editForm.phone}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setEditForm((prev: StoreFormData) => ({ ...prev, phone: e.target.value }))
              }
            />
            <Input
              label="Email"
              placeholder="Optional"
              value={editForm.email}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setEditForm((prev: StoreFormData) => ({ ...prev, email: e.target.value }))
              }
            />
          </div>
          <Input
            label="Address"
            placeholder="Enter address (optional)"
            value={editForm.address}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setEditForm((prev: StoreFormData) => ({
                ...prev,
                address: e.target.value,
              }))
            }
          />
          <div className="grid grid-cols-2 gap-3">
            <Select
              label="Status"
              options={STORE_STATUS_OPTIONS}
              value={editForm.status}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                setEditForm((prev: StoreFormData) => ({
                  ...prev,
                  status: e.target.value as StoreStatus,
                }))
              }
            />
            <Select
              label="Timezone"
              placeholder="Use Organization Default"
              options={TIMEZONE_OPTIONS}
              value={editForm.timezone}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                setEditForm((prev: StoreFormData) => ({
                  ...prev,
                  timezone: e.target.value,
                }))
              }
            />
          </div>
          <div>
            <div className="grid grid-cols-2 gap-3">
              <Select
                label="Group"
                options={groupOptions}
                value={editForm.groupId}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  setEditForm((prev: StoreFormData) => ({
                    ...prev,
                    groupId: e.target.value,
                  }))
                }
              />
              <Input
                label="Number Range Start"
                type="number"
                min={1}
                placeholder="Optional"
                value={editForm.numberRangeStart}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setEditForm((prev: StoreFormData) => ({
                    ...prev,
                    numberRangeStart: e.target.value,
                  }))
                }
              />
            </div>
            <p className="mt-1 text-xs text-text-muted">
              Number range start sets the first EMPID for this store&apos;s own numbering. Leave blank for the default.
            </p>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="secondary"
              onClick={() => {
                setIsEditOpen(false);
                setEditingStoreId(null);
                setEditForm(INITIAL_FORM);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleUpdate}
              isLoading={updateStore.isPending}
              disabled={!editForm.name.trim()}
            >
              Save Changes
            </Button>
          </div>
        </div>
      </Modal>

      {/* Manage Groups Modal */}
      <ManageGroupsModal isOpen={isGroupsOpen} onClose={() => setIsGroupsOpen(false)} />
    </div>
  );
}
