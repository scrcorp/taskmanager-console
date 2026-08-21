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
import { isImeComposing } from "@/lib/ime";
import { useSearchState } from "@/hooks/useSearchState";
import { Plus, Search, Edit, Trash2, X, GripVertical, Layers, AlertTriangle, Archive, RefreshCw } from "lucide-react";
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
  previewGroupAssign,
  type GroupAssignPreview,
} from "@/hooks/useStoreGroups";
import {
  useUpdateEmpidNumbering,
  useRecalculateEmpidNumbering,
} from "@/hooks/useEmpidNumbering";
import { useCreateShift } from "@/hooks/useShifts";
import { useCreatePosition } from "@/hooks/usePositions";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Table, Badge, Modal } from "@/components/ui";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useModal } from "@/components/ui/imperative-modal";
import { useToast } from "@/components/ui/Toast";
import { useMutationToast } from "@/lib/mutationToast";
import { formatDate, parseApiError } from "@/lib/utils";
import { previewStoreCode } from "@/lib/storeCode";
import { useTimezone } from "@/hooks/useTimezone";
import { TIMEZONE_OPTIONS } from "@/lib/timezones";
import { usePermissions } from "@/hooks/usePermissions";
import { PERMISSIONS } from "@/lib/permissions";
import type { EmpidNumbering, Store, StoreGroup, StoreStatus } from "@/types";
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

/**
 * 그룹 이름에서 코드 후보를 만든다 — 운영자가 비워두면 이걸 쓴다.
 * 단어가 여러 개면 각 단어 첫 글자(최대 4자), 한 단어면 앞 3자.
 * "M Korean BBQ" → MKB, "Orange Dining Group" → ODG, "Bakery" → BAK.
 * 이미 쓰는 코드와 겹치면 뒤에 2,3… 을 붙인다 (서버 20자 제한 안에서).
 *
 * Derive a group code from its name when the operator leaves it blank.
 */
function suggestGroupCode(name: string, taken: Set<string>): string {
  const words: string[] = name
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
  let base: string =
    words.length >= 2
      ? words.map((w: string) => w[0]).join("").slice(0, 4)
      : (words[0] ?? "").slice(0, 3);
  if (!base) return "";
  base = base.slice(0, 20);
  if (!taken.has(base)) return base;
  for (let n = 2; n < 100; n += 1) {
    const candidate: string = `${base.slice(0, 20 - String(n).length)}${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  return base;
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

/**
 * 예외 제외 안내 — 재계산이 몇 건을 빼고 계산했는지. 분류는 경고가 아니라 사실 안내다.
 * How many exception numbers the recalculation left out. This is a fact, not a warning.
 */
function exceptionNote(count: number): string {
  return `${count} exception${count === 1 ? "" : "s"} excluded from this calculation`;
}

/**
 * 불일치 경고 문구 (RULE-E) — 원인 + 다음 행동. 커서가 이미 발급된 순번 번호보다
 * 뒤에 있어 다음 채용이 사용 중인 번호를 받게 되는 상태다. 판정(mismatch)과 권고값은
 * 서버가 준 값 그대로 쓴다 — 콘솔은 계산하지 않는다 (INV-8).
 *
 * Mismatch copy: cause + next action. Both the verdict and the recommendation
 * come from the server; the console never computes them.
 */
function mismatchMessage(numbering: EmpidNumbering): string {
  return (
    `Next EMPID ${numbering.next_empid} is behind the numbers already issued in sequence ` +
    `(recommended ${numbering.recommended}). A new hire would get a number that is already ` +
    `taken — recalculate to move it forward.`
  );
}

/**
 * 다음 발급 번호(커서) 편집기 — 값·권고값·예외 건수·불일치는 전부 서버가 준
 * numbering 스냅샷이고, 여기서는 표시와 두 가지 조작(수동 조정 · 재계산)만 한다.
 * 수동 조정은 사유 필수(§3-2)이고, 커서를 낮춘 응답(lowered)은 확인 안내를 띄운다.
 * 재계산은 먼저 apply=false 로 미리보기를 받고, 사유를 받아 적용한다(§3-3).
 *
 * Next-EMPID cursor editor. Every number shown comes from the server's
 * numbering snapshot; this control only displays it and offers the two
 * operations (manual adjust, recalculate). Adjusting requires a reason, and a
 * lowered cursor gets an explicit confirmation. Recalculation previews first
 * (apply=false), then applies with a reason.
 */
function NumberingCursorControl({
  label,
  numbering,
  disabled,
}: {
  /** 커서 주체 표시명 (그룹명 또는 매장명) / Display name of the cursor owner */
  label: string;
  /** 서버 판정 스냅샷 / Server-decided snapshot */
  numbering: EmpidNumbering;
  /** 상위 저장 중 등으로 잠김 / Locked by the parent (e.g. a save in flight) */
  disabled: boolean;
}): React.ReactElement {
  const modal = useModal();
  const updateNumbering = useUpdateEmpidNumbering({ silent: true });
  const recalculate = useRecalculateEmpidNumbering({ silent: true });

  const [value, setValue] = useState<string>(String(numbering.next_empid));
  /** 서버 값이 바뀌면(조정·재계산·refetch) 입력을 서버 값으로 되돌린다 / Resync on server change */
  useEffect(() => {
    setValue(String(numbering.next_empid));
  }, [numbering.next_empid]);

  const busy: boolean = disabled || updateNumbering.isPending || recalculate.isPending;
  const inputValid: boolean = /^\d+$/.test(value.trim()) && parseInt(value.trim(), 10) >= 1;
  const changed: boolean = inputValid && parseInt(value.trim(), 10) !== numbering.next_empid;
  const target = { scope: numbering.scope, scope_id: numbering.scope_id };

  /** 수동 조정 — 사유 필수, 낮추면 응답의 lowered 로 확인 안내 / Manual adjust */
  const handleApply = useCallback(async (): Promise<void> => {
    if (!changed || busy) return;
    const next: number = parseInt(value.trim(), 10);
    // 커서 미초기화(null)면 "낮추는 것"이 아니다 / An unset cursor cannot be lowered
    const lowering: boolean =
      numbering.next_empid != null && next < numbering.next_empid;
    const reason: string | undefined = await modal.confirm({
      title: "Change next EMPID",
      message:
        `${label}: the next EMPID becomes ${next} (now ${numbering.next_empid}).` +
        (lowering
          ? " Lowering it can hand out numbers that are already in use — numbers are never reused automatically."
          : ""),
      confirmLabel: "Change",
      variant: lowering ? "danger" : "primary",
      requiresReason: true,
      reasonMandatory: true,
      reasonLabel: "Reason for this change",
    });
    if (reason === undefined) return;
    try {
      const result = await updateNumbering.mutateAsync({ ...target, next_empid: next, reason });
      if (result.lowered) {
        void modal.alert({
          type: "info",
          title: "Next EMPID lowered",
          message:
            `${label}: the next EMPID went from ${result.previous} down to ${result.next_empid}. ` +
            `Issued numbers are kept, so the next few hires may hit numbers that are already ` +
            `taken. Check them in Users → Bulk Edit → EMPID.`,
        });
      }
    } catch (err) {
      void modal.alert({
        type: "error",
        title: "Couldn't change the next EMPID",
        message: parseApiError(err, "Something went wrong while saving the next EMPID."),
      });
      setValue(String(numbering.next_empid));
    }
  }, [changed, busy, value, numbering.next_empid, target, label, modal, updateNumbering]);

  /** 재계산 — 미리보기(apply=false) → 사유 확인 → 적용 / Recalculate: preview, then apply */
  const handleRecalculate = useCallback(async (): Promise<void> => {
    if (busy) return;
    try {
      const preview = await recalculate.mutateAsync({ ...target, apply: false, reason: null });
      if (preview.recommended === preview.previous) {
        void modal.alert({
          type: "info",
          title: "Nothing to change",
          message:
            `${label}: the next EMPID is already ${preview.recommended}. ` +
            (preview.exception_count > 0
              ? `${exceptionNote(preview.exception_count)}.`
              : ""),
        });
        return;
      }
      const reason: string | undefined = await modal.confirm({
        title: "Recalculate next EMPID",
        message:
          `${label}: the next EMPID becomes ${preview.recommended} (now ${preview.previous}).` +
          (preview.exception_count > 0 ? ` ${exceptionNote(preview.exception_count)}.` : "") +
          (preview.recommended < preview.previous
            ? " This moves the cursor backwards — the numbers in between stay issued."
            : ""),
        confirmLabel: "Apply",
        variant: preview.recommended < preview.previous ? "danger" : "primary",
        requiresReason: true,
        reasonMandatory: true,
        reasonLabel: "Reason for this change",
      });
      if (reason === undefined) return;
      await recalculate.mutateAsync({ ...target, apply: true, reason });
    } catch (err) {
      void modal.alert({
        type: "error",
        title: "Couldn't recalculate the next EMPID",
        message: parseApiError(err, "Something went wrong while recalculating."),
      });
    }
  }, [busy, target, label, modal, recalculate]);

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-1.5 text-xs text-text-muted">
          Next EMPID
          <input
            type="number"
            min={1}
            value={value}
            disabled={busy}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setValue(e.target.value)}
            onKeyDown={(e: React.KeyboardEvent<HTMLInputElement>) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void handleApply();
              }
            }}
            aria-label={`Next EMPID for ${label}`}
            aria-invalid={!inputValid || undefined}
            className={`w-20 rounded-md border bg-surface px-2 py-1 text-xs text-text focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent disabled:opacity-50 ${inputValid ? "border-border" : "border-danger"}`}
          />
        </label>
        <button
          type="button"
          onClick={() => void handleApply()}
          disabled={busy || !changed}
          className="rounded-md border border-border bg-surface px-2 py-1 text-xs text-text hover:bg-surface-hover transition-colors disabled:opacity-50"
        >
          Change
        </button>
        <button
          type="button"
          onClick={() => void handleRecalculate()}
          disabled={busy}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-surface px-2 py-1 text-xs text-text hover:bg-surface-hover transition-colors disabled:opacity-50"
        >
          <RefreshCw className="h-3 w-3" />
          Recalculate
        </button>
        {numbering.mismatch && (
          <Badge variant="warning">Numbering out of sync</Badge>
        )}
      </div>
      {!inputValid && (
        <p className="text-xs text-danger">Next EMPID must be a whole number of 1 or more.</p>
      )}
      {numbering.mismatch && <p className="text-xs text-warning">{mismatchMessage(numbering)}</p>}
      <p className="text-xs text-text-muted">
        {numbering.sequence_count} in sequence
        {numbering.exception_count > 0 && <> · {exceptionNote(numbering.exception_count)}</>}
        {numbering.recommended !== numbering.next_empid && (
          <> · Recommended {numbering.recommended}</>
        )}
      </p>
    </div>
  );
}

/** 편입 미리보기에서 충돌이 발견된 매장 하나 / One store whose assign preview found issues */
interface EmpidPreviewFinding {
  storeId: string;
  storeName: string;
  groupName: string;
  preview: GroupAssignPreview;
}

/**
 * 편입 저장 전 EMPID 충돌 확인 다이얼로그 — 서버는 번호를 절대 바꾸지 않으므로(정책 A)
 * "그대로 편입" 또는 "저장 전체 취소" 만 고른다. modal.open 커스텀 본문.
 *
 * Pre-save EMPID conflict dialog. Numbers are never changed automatically, so
 * the only choices are "assign anyway" or "cancel the whole save".
 */
function EmpidConflictDialog({
  findings,
  onConfirm,
  onCancel,
}: {
  findings: EmpidPreviewFinding[];
  onConfirm: () => void;
  onCancel: () => void;
}): React.ReactElement {
  return (
    <div className="space-y-4">
      <p className="text-sm text-text-secondary">
        These stores are moving into a group with shared numbering, and some EMPIDs
        collide with numbers already in use there.
      </p>
      {findings.map((f: EmpidPreviewFinding) => (
        <div key={f.storeId} className="rounded-lg border border-border bg-surface px-3 py-2">
          <p className="mb-1.5 text-sm font-semibold text-text">
            {f.storeName} <span className="font-normal text-text-muted">→ {f.groupName}</span>
          </p>
          <ul className="space-y-1 text-xs text-text-secondary">
            {f.preview.conflicts.flatMap((c) =>
              c.holders.map((h) => (
                <li key={`c-${c.empid}-${c.incoming.user_id}-${h.user_id}-${h.store_id}`}>
                  <span className="font-mono text-text">#{c.empid}</span> — {c.incoming.name}{" "}
                  (incoming) vs {h.name} ({h.store_name})
                </li>
              )),
            )}
            {f.preview.person_splits.flatMap((p) =>
              p.elsewhere.map((e) => (
                <li key={`s-${p.user_id}-${e.store_id}`}>
                  {p.name} has <span className="font-mono text-text">#{p.incoming_empid}</span> here
                  but <span className="font-mono text-text">#{e.empid}</span> at {e.store_name}
                </li>
              )),
            )}
          </ul>
        </div>
      ))}
      <p className="text-xs text-text-muted">
        Numbers are never changed automatically. You can resolve them afterwards in Users →
        Bulk Edit → EMPID.
      </p>
      <div className="flex justify-end gap-2 pt-2">
        <Button variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="primary" onClick={onConfirm}>
          Assign anyway (keep numbers)
        </Button>
      </div>
    </div>
  );
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
  /** 그룹 코드 raw 입력 ("" = null) — 급여/외부 표기(예: "ODG"), 임포트 매칭 키 / Raw code input, empty = null */
  code: string;
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
          code: g.code ?? "",
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
    data: {
      name?: string;
      code?: string | null;
      numbering_mode?: "group" | "store";
      number_range_start?: number | null;
    };
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
    const code: string | null = d.code.trim() || null;
    if (code !== (server.code ?? null)) data.code = code;
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
  serverGroup,
  isNew,
  isDeleted,
  members,
  candidates,
  effectiveGroupIds,
  groupNamesById,
  storeRanges,
  codeConflict,
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
  /** 서버가 준 그룹 (신규 행은 null) — 커서 스냅샷의 출처 / Server-side group; null for new rows */
  serverGroup: StoreGroup | null;
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
  /** 같은 코드를 쓰는 다른 그룹 이름 (없으면 null) / Other group using the same code */
  codeConflict: string | null;
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
    // 조합 중 Enter 로 blur 하면 확정 전 글자가 잘린 채 저장된다.
    if (isImeComposing(e)) return;
    if (e.key === "Enter") {
      e.preventDefault();
      e.currentTarget.blur();
    }
  };

  /** 매장 추가 패널 열림 여부 / Whether the add-stores panel is open */
  const [adding, setAdding] = useState<boolean>(false);
  const displayName: string = draftGroup.name.trim() || "Untitled group";
  /** Per-store 채번 모드 — 매장 칩마다 번호대 입력 노출 / Per-store numbering shows a range input per chip */
  const perStore: boolean = draftGroup.numbering_mode === "store";
  const groupRangeBad: boolean = !isValidRangeInput(draftGroup.rangeStart);
  /**
   * 채번 모드를 draft 에서 바꿔놓고 아직 저장하지 않았으면 서버의 커서 스냅샷이
   * 다른 스코프를 가리킨다 — 저장 전에는 커서를 손대지 못하게 한다.
   * A not-yet-saved numbering-mode change makes the server snapshot point at a
   * different scope, so cursor editing waits until the change is saved.
   */
  const modeUnsaved: boolean =
    serverGroup !== null && serverGroup.numbering_mode !== draftGroup.numbering_mode;
  /** 커서를 보여줄 수 있는 상태 / Whether a cursor snapshot is available to show */
  const showCursor: boolean = serverGroup !== null && !modeUnsaved;
  /** Per-store 모드에서 자기 커서를 가진 매장 (서버 기준 소속만) / Stores holding their own cursor */
  const cursorStores: Store[] = showCursor && perStore
    ? members.filter(
        (s: Store) => s.group_id === draftGroup.id && s.numbering?.scope === "store",
      )
    : [];

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
        {/* 그룹 코드 — 급여/외부 시스템 표기 (예: ODG). EMPID 임포트가 이 키로도 자연 매칭 */}
        <input
          type="text"
          value={draftGroup.code}
          maxLength={20}
          disabled={disabled}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            onPatch({ code: e.target.value.toUpperCase() })
          }
          onKeyDown={blurOnEnter}
          placeholder="Code"
          aria-label={`Group code for ${displayName}`}
          aria-invalid={!!codeConflict || undefined}
          title={codeConflict ? `Also used by ${codeConflict}` : undefined}
          className={`w-20 shrink-0 rounded-md border bg-transparent px-2 py-1 text-xs font-mono text-text placeholder:text-text-muted focus:bg-surface focus:outline-none focus:ring-2 focus:ring-accent/50 transition-colors disabled:opacity-50 ${codeConflict ? "border-danger" : "border-border focus:border-accent"}`}
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
          {/* Per-store 모드에선 매장 미설정 시 폴백이라 "Default" / Fallback label in per-store mode */}
          {perStore ? "Default first EMPID" : "First EMPID"}
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
            aria-label={`First EMPID for ${displayName}`}
            aria-invalid={groupRangeBad || undefined}
            className={`w-20 rounded-md border bg-surface px-2 py-1 text-xs text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent disabled:opacity-50 ${groupRangeBad ? "border-danger" : "border-border"}`}
          />
        </label>
        {groupRangeBad && (
          <span className="text-xs text-danger">Whole number of 1 or more.</span>
        )}
      </div>
      {(codeConflict || !groupRangeBad) && (
        <div className="mt-1 pl-7 space-y-0.5">
          {codeConflict && (
            <p className="text-xs text-danger">
              Code <span className="font-mono">{draftGroup.code.trim()}</span> is also used by{" "}
              {codeConflict}.
            </p>
          )}
          {!groupRangeBad && (
            <p className="text-xs text-text-muted">
              {rangePreview(draftGroup.rangeStart, draftGroup.numbering_mode)}
            </p>
          )}
        </div>
      )}
      {/* 다음 발급 번호(커서) — draft 와 무관한 즉시 조작이다. 값·권고·불일치는 서버가
          판정해 numbering 으로 내려준 것을 그대로 쓴다 (INV-8). Shared 모드는 그룹이,
          Per-store 모드는 매장이 커서를 보유한다 (§3-1 scope).
          Next-EMPID cursor: an immediate operation, independent of the draft. Every
          number comes from the server's numbering snapshot. */}
      {showCursor && !perStore && serverGroup?.numbering && (
        <div className="mt-2 pl-7">
          <NumberingCursorControl
            label={displayName}
            numbering={serverGroup.numbering}
            disabled={disabled}
          />
        </div>
      )}
      {showCursor && perStore && cursorStores.length > 0 && (
        <div className="mt-2 pl-7 space-y-2">
          {cursorStores.map((store: Store) =>
            store.numbering ? (
              <div key={store.id} className="space-y-0.5">
                <p className="text-xs font-medium text-text-secondary">{store.name}</p>
                <NumberingCursorControl
                  label={store.name}
                  numbering={store.numbering}
                  disabled={disabled}
                />
              </div>
            ) : null,
          )}
        </div>
      )}
      {modeUnsaved && (
        <p className="mt-2 pl-7 text-xs text-text-muted">
          Save this numbering mode change to manage the next EMPID.
        </p>
      )}
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
                  First EMPID
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
                    aria-label={`First EMPID for ${store.name}`}
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
        <button
          type="button"
          onClick={() => setAdding((v: boolean) => !v)}
          disabled={disabled || candidates.length === 0}
          aria-expanded={adding}
          className="rounded-md border border-border bg-surface px-2 py-1 text-xs text-text hover:bg-surface-hover transition-colors disabled:opacity-50"
        >
          {adding ? "Done adding" : "Add stores…"}
        </button>
      </div>
      {/* 다중 추가 — 체크하면 즉시 draft 에 편성된다(칩으로 나타남). 매장이 많으면 검색 */}
      {adding && (
        <div className="mt-2 pl-7">
          <StoreChecklist
            stores={candidates}
            isChecked={() => false}
            onToggle={(store: Store) => onAddStore(store)}
            effectiveGroupIds={effectiveGroupIds}
            groupNamesById={groupNamesById}
            disabled={disabled}
            emptyText="Every store is already in this group."
          />
        </div>
      )}
      {perStore && members.some((s: Store) => !isValidRangeInput(storeRanges[s.id] ?? "")) && (
        <p className="mt-1 pl-7 text-xs text-danger">
          First EMPID must be a whole number of 1 or more.
        </p>
      )}
    </div>
  );
}

/**
 * 매장 체크리스트 — 검색 + 다중 선택. 그룹 생성 폼과 그룹 행의 "매장 추가"가
 * 같은 컴포넌트를 쓴다(매장이 늘어나면 select 하나로는 못 찾는다).
 * 다른 그룹 소속이면 어디서 옮겨오는지 함께 보여준다.
 *
 * Store checklist with search, shared by the new-group form and the row's
 * add-stores panel. Shows where a store would move from.
 */
function StoreChecklist({
  stores,
  isChecked,
  onToggle,
  effectiveGroupIds,
  groupNamesById,
  disabled,
  emptyText,
}: {
  stores: Store[];
  isChecked: (storeId: string) => boolean;
  onToggle: (store: Store) => void;
  effectiveGroupIds: Record<string, string | null>;
  groupNamesById: Record<string, string>;
  disabled: boolean;
  emptyText: string;
}): React.ReactElement {
  const [query, setQuery] = useState<string>("");
  const q: string = query.trim().toLowerCase();
  const shown: Store[] = q
    ? stores.filter(
        (s: Store) =>
          s.name.toLowerCase().includes(q) || (s.code ?? "").toLowerCase().includes(q),
      )
    : stores;

  return (
    <div className="space-y-1.5">
      {stores.length > 6 && (
        <input
          type="text"
          value={query}
          disabled={disabled}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
          placeholder="Search stores..."
          className="w-full rounded-lg border border-border bg-surface px-3 py-1.5 text-xs text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent disabled:opacity-50"
        />
      )}
      <div className="max-h-40 overflow-y-auto rounded-lg border border-border bg-surface p-2 space-y-1">
        {shown.length === 0 && (
          <p className="px-1 py-2 text-xs text-text-muted">
            {stores.length === 0 ? emptyText : "No stores match that search."}
          </p>
        )}
        {shown.map((store: Store) => {
          const currentId: string | null = effectiveGroupIds[store.id] ?? null;
          const currentName: string | null = currentId
            ? groupNamesById[currentId] ?? null
            : null;
          return (
            <label
              key={store.id}
              className="flex items-center gap-2 rounded-md px-1.5 py-1 text-sm text-text hover:bg-surface-hover cursor-pointer"
            >
              <input
                type="checkbox"
                checked={isChecked(store.id)}
                disabled={disabled}
                onChange={() => onToggle(store)}
                className="cursor-pointer accent-accent"
              />
              {store.code && (
                <span className="shrink-0 rounded border border-border bg-surface-2 px-1 py-0.5 text-[10px] font-mono text-text-muted">
                  {store.code}
                </span>
              )}
              <span className="flex-1 min-w-0 truncate">{store.name}</span>
              {currentName && (
                <span className="shrink-0 text-xs text-warning">moves from {currentName}</span>
              )}
            </label>
          );
        })}
      </div>
    </div>
  );
}

/**
 * 번호대 설명 한 줄 — 입력한 시작 번호가 실제로 무슨 뜻인지 미리 보여준다.
 * "1000" 이라고만 적혀 있으면 그게 이 그룹 전체의 시작인지 매장별인지 알 수 없다.
 *
 * One-line preview of what a range start actually means.
 */
function rangePreview(rangeStart: string, mode: "group" | "store"): string {
  const parsed: number | null = parseRangeStart(rangeStart);
  const from: number = parsed ?? 1;
  const seq = `${from}, ${from + 1}, ${from + 2}…`;
  return mode === "group"
    ? `New EMPIDs in this group: ${seq}`
    : `Stores without their own start use: ${seq}`;
}

/**
 * 매장 모달의 번호 프리뷰 — 이 매장에서 다음에 만들어질 번호가 무엇인지.
 * One-line preview for a store's own First EMPID.
 */
function storeRangePreview(rangeStart: string): string {
  const parsed: number | null = parseRangeStart(rangeStart);
  const from: number = parsed ?? 1;
  return `New EMPIDs at this store: ${from}, ${from + 1}, ${from + 2}…`;
}

/**
 * 매장 모달의 Group + First EMPID 한 줄 — 소속 그룹이 Shared 채번이면 이 매장의
 * First EMPID 는 쓰이지 않는다(서버가 ERR_RANGE_IGNORED 로 거절한다). 그래서 칸을
 * 잠그고 무엇을 따르는지 사실대로 적고, 저장 때도 값을 보내지 않는다.
 * 그 외(Per-store 그룹·미그룹)에는 입력 + 프리뷰를 보여준다.
 * 표시되는 다음 발급 번호는 전부 서버가 준 numbering 값이다 (INV-8).
 *
 * Group + First EMPID row of the store modal. When the selected group uses
 * shared numbering, this store's own value is never used (the server rejects
 * it), so the field is locked with a factual explanation and nothing is sent.
 * Otherwise the field is editable with a preview. Every "next EMPID" shown
 * comes from the server.
 */
function StoreNumberingRow({
  groupSelect,
  group,
  storeNumbering,
  value,
  onChange,
}: {
  /** Group select 엘리먼트 (모달마다 상태가 달라 밖에서 넘긴다) / The group select element */
  groupSelect: React.ReactNode;
  /** 폼에서 선택된 그룹 (없으면 Ungrouped) / Group picked in the form; null = ungrouped */
  group: StoreGroup | null;
  /** 이 매장의 채번 스냅샷 (생성 모달엔 없음) / This store's numbering snapshot (absent on create) */
  storeNumbering: EmpidNumbering | undefined;
  value: string;
  onChange: (value: string) => void;
}): React.ReactElement {
  /** 그룹 공유 채번 — 매장 값이 무시되는 문맥 / Shared numbering: the store value is ignored */
  const shared: boolean = group?.numbering_mode === "group";
  const rangeBad: boolean = !isValidRangeInput(value);
  const sharedStart: number | null = group?.number_range_start ?? null;
  /** 이미 자체 커서로 발급을 시작한 매장 / Store that already issues from its own cursor */
  const started: boolean =
    !shared && storeNumbering?.scope === "store" && storeNumbering.next_empid != null;

  return (
    <div>
      <div className="grid grid-cols-2 gap-3">
        {groupSelect}
        <Input
          label="First EMPID"
          type="number"
          min={1}
          placeholder={shared ? "Set in Groups" : "Optional"}
          value={shared ? (sharedStart != null ? String(sharedStart) : "") : value}
          disabled={shared}
          readOnly={shared}
          error={!shared && rangeBad ? "Whole number of 1 or more." : undefined}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
        />
      </div>
      {shared && group ? (
        <p className="mt-1 text-xs text-text-muted">
          This store follows group {group.name}&apos;s shared numbering
          {sharedStart != null ? ` (starts at ${sharedStart})` : ""}. Change it in Groups.
          {group.numbering?.next_empid != null
            ? ` Next EMPID: ${group.numbering.next_empid}.`
            : ""}
        </p>
      ) : (
        <p className="mt-1 text-xs text-text-muted">
          {/* 이미 번호를 발급한 매장은 First EMPID 가 다음 번호를 바꾸지 않는다(커서가 결정).
              그래서 입력값 기반 프리뷰를 앞세우면 거짓말이 된다 — 서버 커서를 그대로 말한다.
              Once a store has issued numbers, First EMPID no longer decides the next one
              (the cursor does), so state the server's cursor instead of an input preview. */}
          {rangeBad
            ? "First EMPID must be a whole number of 1 or more."
            : started
              ? `This store has already started — its next EMPID is ${storeNumbering!.next_empid}. Changing the first EMPID doesn't move it; use Recalculate in Groups.`
              : `${storeRangePreview(value)} Leave blank for the default.`}
        </p>
      )}
    </div>
  );
}

/**
 * 신규 그룹 생성 폼 — 이름만 받고 끝내지 않는다. 그룹을 만들 때 실제로 정해야 하는
 * 것(이름·코드·소속 매장·채번 방식·시작 번호)을 한 화면에서 받아 draft 에 넣는다.
 * 코드를 비우면 이름에서 자동 생성한다(§EMPID 임포트가 코드로도 그룹을 매칭).
 *
 * New-group form. Creating a group means deciding its name, code, member
 * stores, numbering mode and range — all in one place, not just a name.
 * A blank code is auto-derived from the name.
 */
function NewGroupForm({
  stores,
  effectiveGroupIds,
  groupNamesById,
  takenCodes,
  disabled,
  onCancel,
  onCreate,
}: {
  stores: Store[];
  effectiveGroupIds: Record<string, string | null>;
  groupNamesById: Record<string, string>;
  takenCodes: Set<string>;
  disabled: boolean;
  onCancel: () => void;
  onCreate: (draft: {
    name: string;
    code: string;
    numbering_mode: "group" | "store";
    rangeStart: string;
    storeIds: string[];
  }) => void;
}): React.ReactElement {
  const [name, setName] = useState<string>("");
  const [code, setCode] = useState<string>("");
  const [mode, setMode] = useState<"group" | "store">("group");
  const [rangeStart, setRangeStart] = useState<string>("");
  const [picked, setPicked] = useState<string[]>([]);

  const trimmedName: string = name.trim();
  /** 코드 미입력 시 이름에서 파생 — placeholder 로 미리 보여준다 / Preview of the auto code */
  const autoCode: string = useMemo(
    () => (trimmedName ? suggestGroupCode(trimmedName, takenCodes) : ""),
    [trimmedName, takenCodes],
  );
  const rangeBad: boolean = !isValidRangeInput(rangeStart);
  /** 입력한 코드가 이미 다른 그룹에 있는지 — 자동 생성값은 애초에 겹치지 않는다 */
  const codeTaken: boolean = !!code.trim() && takenCodes.has(code.trim().toUpperCase());
  const canCreate: boolean = !!trimmedName && !rangeBad && !codeTaken && !disabled;

  const toggleStore = (storeId: string): void => {
    setPicked((prev: string[]) =>
      prev.includes(storeId) ? prev.filter((id: string) => id !== storeId) : [...prev, storeId],
    );
  };

  return (
    <div className="rounded-lg border border-accent/40 bg-accent-muted/30 p-3 space-y-3">
      <p className="text-sm font-semibold text-text">New group</p>

      <div className="flex flex-wrap gap-2">
        <label className="flex-1 min-w-[180px] space-y-1">
          <span className="text-xs text-text-secondary">Name *</span>
          <input
            type="text"
            value={name}
            disabled={disabled}
            autoFocus
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
            placeholder="e.g. M Korean BBQ"
            className="w-full rounded-lg border border-border bg-surface px-3 py-1.5 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent disabled:opacity-50"
          />
        </label>
        <label className="w-32 space-y-1">
          <span className="text-xs text-text-secondary">Code</span>
          <input
            type="text"
            value={code}
            maxLength={20}
            disabled={disabled}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setCode(e.target.value.toUpperCase())
            }
            placeholder={autoCode || "Auto"}
            className="w-full rounded-lg border border-border bg-surface px-3 py-1.5 text-sm font-mono text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent disabled:opacity-50"
          />
        </label>
      </div>
      {codeTaken ? (
        <p className="text-xs text-danger">
          <span className="font-mono">{code.trim()}</span> is already used by another group. Pick a
          different code.
        </p>
      ) : (
        <p className="text-xs text-text-muted">
          Code is how payroll and other systems name this company (e.g. ODG). Leave it blank and{" "}
          {autoCode ? <span className="font-mono text-text-secondary">{autoCode}</span> : "one"} is
          used. EMPID import matches this code to the group.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-border overflow-hidden">
          {(["group", "store"] as const).map((m) => (
            <button
              key={m}
              type="button"
              disabled={disabled}
              onClick={() => setMode(m)}
              className={`px-2.5 py-1 text-xs transition-colors disabled:opacity-50 ${
                mode === m
                  ? "bg-accent-muted text-accent font-medium"
                  : "text-text-muted hover:text-text hover:bg-surface-hover"
              }`}
            >
              {NUMBERING_MODE_LABEL[m]}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-xs text-text-muted">
          {mode === "store" ? "Default first EMPID" : "First EMPID"}
          <input
            type="number"
            min={1}
            value={rangeStart}
            placeholder="Default"
            disabled={disabled}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setRangeStart(e.target.value)}
            className={`w-20 rounded-md border bg-surface px-2 py-1 text-xs text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent disabled:opacity-50 ${rangeBad ? "border-danger" : "border-border"}`}
          />
        </label>
        {rangeBad && <span className="text-xs text-danger">Whole number of 1 or more.</span>}
      </div>
      {!rangeBad && (
        <p className="text-xs text-text-muted">{rangePreview(rangeStart, mode)}</p>
      )}
      <p className="text-xs text-text-muted">
        {mode === "group"
          ? "Shared numbering — one EMPID per person across every store in this group."
          : "Per-store numbering — each store keeps its own EMPID sequence."}
      </p>

      <div className="space-y-1.5">
        <span className="text-xs text-text-secondary">
          Stores {picked.length > 0 && <span className="text-text-muted">· {picked.length} selected</span>}
        </span>
        <StoreChecklist
          stores={stores}
          isChecked={(id: string) => picked.includes(id)}
          onToggle={(store: Store) => toggleStore(store.id)}
          effectiveGroupIds={effectiveGroupIds}
          groupNamesById={groupNamesById}
          disabled={disabled}
          emptyText="No stores yet."
        />
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={onCancel} disabled={disabled}>
          Cancel
        </Button>
        <Button
          size="sm"
          disabled={!canCreate}
          onClick={() =>
            onCreate({
              name: trimmedName,
              code: code.trim() || autoCode,
              numbering_mode: mode,
              rangeStart,
              storeIds: picked,
            })
          }
        >
          Add group
        </Button>
      </div>
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
  const { toast } = useToast();
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

  /** 신규 그룹 폼 표시 여부 / Whether the new-group form is open */
  const [isAdding, setIsAdding] = useState<boolean>(false);
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
      setIsAdding(false);
    }
    wasOpen.current = isOpen;
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && draft === null && Array.isArray(groups) && Array.isArray(stores)) {
      setDraft(buildGroupsDraft(groupList, storeList));
      // 목록 API 의 duplicate_empids 로 경고 배너 시드 — 재오픈해도 기존 중복이 계속 보이게
      // Seed dup warnings from the list response so reopening keeps existing warnings visible
      setDupWarnings(() => {
        const seeded: Record<string, { groupName: string; count: number }> = {};
        for (const g of groupList) {
          if ((g.duplicate_empids?.length ?? 0) > 0) {
            seeded[g.id] = { groupName: g.name, count: g.duplicate_empids.length };
          }
        }
        return seeded;
      });
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

  /**
   * 같은 코드를 두 그룹이 쓰면 EMPID 임포트가 어느 쪽인지 정하지 못한다 —
   * 행별로 상대 그룹 이름을 붙여 저장 전에 잡는다 (id → 상대 이름).
   * Code collisions between groups (id → the other group's name).
   */
  const codeConflicts: Record<string, string> = useMemo(() => {
    if (!draft) return {};
    const deleted = new Set<string>(draft.deleted);
    const byCode: Record<string, string[]> = {};
    draft.order
      .filter((id: string) => !deleted.has(id))
      .forEach((id: string) => {
        const code: string = (draft.groups[id]?.code ?? "").trim().toUpperCase();
        if (code) (byCode[code] ||= []).push(id);
      });
    const out: Record<string, string> = {};
    Object.values(byCode).forEach((ids: string[]) => {
      if (ids.length < 2) return;
      ids.forEach((id: string) => {
        const other: string | undefined = ids.find((x: string) => x !== id);
        if (other) out[id] = draft.groups[other]?.name.trim() || "Untitled group";
      });
    });
    return out;
  }, [draft]);

  /** 코드 충돌이 하나라도 있으면 저장을 막는다 / Block save while codes collide */
  const hasCodeConflict: boolean = Object.keys(codeConflicts).length > 0;

  /** 이미 쓰는 그룹 코드 — 자동 생성이 겹치지 않게 (삭제 표시 그룹은 제외) / Codes in use */
  const takenCodes: Set<string> = useMemo(() => {
    if (!draft) return new Set<string>();
    const deleted = new Set<string>(draft.deleted);
    return new Set<string>(
      draft.order
        .filter((id: string) => !deleted.has(id))
        .map((id: string) => draft.groups[id]?.code.trim().toUpperCase() ?? "")
        .filter(Boolean),
    );
  }, [draft]);

  /**
   * 그룹에 속하지 않은 매장은 자기 커서를 갖는다 — 그룹 행에 나타나지 않으므로
   * 여기서 따로 보여주지 않으면 고칠 방법이 없다 (서버 소속 기준).
   * Ungrouped stores own their cursor and appear in no group row, so they get
   * their own section (based on server-side membership).
   */
  const ungroupedCursorStores: Store[] = useMemo(
    () =>
      storeList.filter(
        (s: Store) => (s.group_id ?? null) === null && s.numbering?.scope === "store",
      ),
    [storeList],
  );

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

  /**
   * 그룹 추가 — 폼이 넘긴 값(이름·코드·채번·번호대·소속 매장)을 tempId 로 draft 에만
   * 넣는다. POST 와 매장 편성 PUT 은 Save 에서 한꺼번에.
   * Add a group to the draft (POST + store moves happen on Save).
   */
  const handleAdd = useCallback(
    (payload: {
      name: string;
      code: string;
      numbering_mode: "group" | "store";
      rangeStart: string;
      storeIds: string[];
    }): void => {
      if (!payload.name) return;
      tempIdCounter.current += 1;
      const tempId: string = `${TEMP_GROUP_ID_PREFIX}${tempIdCounter.current}`;
      setDraft((prev) =>
        prev
          ? {
              ...prev,
              groups: {
                ...prev.groups,
                [tempId]: {
                  id: tempId,
                  name: payload.name,
                  code: payload.code,
                  numbering_mode: payload.numbering_mode,
                  rangeStart: payload.rangeStart,
                },
              },
              order: [...prev.order, tempId],
              storeAssign: {
                ...prev.storeAssign,
                ...Object.fromEntries(payload.storeIds.map((id: string) => [id, tempId])),
              },
            }
          : prev,
      );
      setIsAdding(false);
    },
    [],
  );

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
    if (!draft || !ops || ops.count === 0 || isSaving || invalidRanges || hasCodeConflict) return;
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
    // ── 편입 미리보기: 실그룹으로의 배정 변경(moves 중 target 이 기존 그룹 id)을 저장 전에
    // 검사해 EMPID 충돌을 확인받는다. 신규 그룹(tempId)은 서버에 없어 검사 불가 — 빈 그룹으로
    // 만들어지므로 생략. 미리보기는 보조 장치: 호출 실패는 저장을 막지 않는다 (경고 토스트만).
    // Pre-save assign preview for moves into existing groups. tempId targets are
    // skipped (not on the server yet; created empty). The preview is best-effort:
    // a failed call warns via toast and never blocks the save.
    const assignMoves = ops.moves.filter(
      (m) => m.target != null && !isTempGroupId(m.target),
    );
    if (assignMoves.length > 0) {
      const findings: EmpidPreviewFinding[] = [];
      let previewFailed = false;
      for (const m of assignMoves) {
        const targetId = m.target as string;
        try {
          const preview = await previewGroupAssign(m.storeId, targetId);
          if (preview.conflicts.length > 0 || preview.person_splits.length > 0) {
            findings.push({
              storeId: m.storeId,
              storeName: storeList.find((s: Store) => s.id === m.storeId)?.name ?? "Store",
              groupName:
                draft.groups[targetId]?.name.trim() ||
                groupList.find((g: StoreGroup) => g.id === targetId)?.name ||
                "Group",
              preview,
            });
          }
        } catch {
          previewFailed = true;
          break;
        }
      }
      if (previewFailed) {
        // 미리보기 실패 — 저장은 계속, 사후 확인 경로만 안내 / Preview failed; save proceeds
        toast({
          type: "info",
          message:
            "Couldn't check EMPID conflicts before saving. Review them afterwards in Users → Bulk Edit → EMPID.",
        });
      } else if (findings.length > 0) {
        const proceed = await modal.open<boolean>(
          ({ close }) => (
            <EmpidConflictDialog
              findings={findings}
              onConfirm={() => close(true)}
              onCancel={() => close(false)}
            />
          ),
          {
            title: "EMPID conflicts in shared numbering",
            size: "lg",
            closeOnBackdrop: false,
          },
        );
        if (proceed !== true) {
          // 저장 전체 중단 — draft 는 그대로 유지 / Abort the whole save, keep the draft
          setIsSaving(false);
          return;
        }
      }
    }
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
          code: g.code.trim() || null,
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
    hasCodeConflict,
    createGroup,
    updateGroup,
    updateStore,
    deleteGroup,
    reorderGroups,
    storeList,
    groupList,
    queryClient,
    modal,
    success,
    toast,
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
                      serverGroup={groupList.find((g: StoreGroup) => g.id === id) ?? null}
                      isNew={isTempGroupId(id)}
                      isDeleted={draft.deleted.includes(id)}
                      members={storeList.filter((s: Store) => effectiveGroupIds[s.id] === id)}
                      candidates={storeList.filter((s: Store) => effectiveGroupIds[s.id] !== id)}
                      effectiveGroupIds={effectiveGroupIds}
                      groupNamesById={groupNamesById}
                      storeRanges={draft.storeRange}
                      codeConflict={codeConflicts[id] ?? null}
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
        {/* 미그룹 매장의 커서 — 매장이 자기 스코프를 갖는 경우만 (§3-1 scope="store") */}
        {ungroupedCursorStores.length > 0 && (
          <div className="rounded-lg border border-border bg-surface px-3 py-2 space-y-2">
            <p className="text-sm font-semibold text-text">Ungrouped stores</p>
            {ungroupedCursorStores.map((store: Store) =>
              store.numbering ? (
                <div key={store.id} className="space-y-0.5">
                  <p className="text-xs font-medium text-text-secondary">{store.name}</p>
                  <NumberingCursorControl
                    label={store.name}
                    numbering={store.numbering}
                    disabled={isSaving}
                  />
                </div>
              ) : null,
            )}
          </div>
        )}
        {isAdding && draft ? (
          <NewGroupForm
            stores={storeList}
            effectiveGroupIds={effectiveGroupIds}
            groupNamesById={groupNamesById}
            takenCodes={takenCodes}
            disabled={isSaving}
            onCancel={() => setIsAdding(false)}
            onCreate={handleAdd}
          />
        ) : (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setIsAdding(true)}
            disabled={isSaving || !draft}
          >
            <Plus className="h-4 w-4 mr-1" />
            New group
          </Button>
        )}
        {/* Footer — draft 폐기(dirty 면 확인) / 일괄 저장 (N = 적용될 서버 연산 수) */}
        <div className="flex items-center justify-end gap-2 pt-2">
          {hasCodeConflict && (
            <span className="mr-auto text-xs text-danger">
              Two groups share the same code — make them unique.
            </span>
          )}
          {invalidRanges && !hasCodeConflict && (
            <span className="mr-auto text-xs text-danger">
              First EMPID values must be whole numbers of 1 or more.
            </span>
          )}
          <Button variant="secondary" onClick={() => void requestClose()} disabled={isSaving}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => void handleSave()}
            isLoading={isSaving}
            disabled={!dirty || isSaving || invalidRanges || hasCodeConflict}
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
  // 입력(즉시) / URL 커밋(디바운스) 분리 — useSearchState 참조.
  const search = useSearchState({
    param: { value: urlParams.search, commit: (v) => setUrlParams({ search: v || null }) },
  });
  const searchQuery = search.committed;
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

  /**
   * 폼에서 선택된 그룹 — First EMPID 칸의 문맥(공유 채번인지)을 정한다. 채번 모드는
   * 서버가 가진 값이고, 콘솔은 그걸 읽어 표시만 한다 (INV-8).
   * The group picked in each form; decides the First EMPID field's context.
   */
  const createFormGroup: StoreGroup | null = useMemo(
    () => groupList.find((g: StoreGroup) => g.id === createForm.groupId) ?? null,
    [groupList, createForm.groupId],
  );
  const editFormGroup: StoreGroup | null = useMemo(
    () => groupList.find((g: StoreGroup) => g.id === editForm.groupId) ?? null,
    [groupList, editForm.groupId],
  );
  /** 수정 중인 매장의 서버 스냅샷 (numbering 표시용) / Server snapshot of the store being edited */
  const editingStore: Store | null = useMemo(
    () =>
      Array.isArray(stores)
        ? stores.find((s: Store) => s.id === editingStoreId) ?? null
        : null,
    [stores, editingStoreId],
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

  /**
   * 그룹 미지정 매장 수 (닫힌 매장 제외) — 검색/필터와 무관하게 전체 기준으로 센다.
   * 급여는 그룹(법인) 단위 산출이라 그룹 없는 매장은 급여에서 빠진다.
   * Count of stores with no group (excluding closed), independent of search/filter.
   */
  const ungroupedActiveCount: number = useMemo(() => {
    if (!Array.isArray(stores)) return 0;
    const knownGroupIds = new Set<string>(groupList.map((g: StoreGroup) => g.id));
    return stores.filter(
      (st: Store) =>
        st.status !== "closed" &&
        (!st.group_id || !knownGroupIds.has(st.group_id)),
    ).length;
  }, [stores, groupList]);

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
        // 공유 채번 그룹에는 매장 First EMPID 를 보내지 않는다 — 서버가 ERR_RANGE_IGNORED
        // 로 거절한다 / Shared-numbering groups reject a per-store first EMPID
        ...(createFormGroup?.numbering_mode === "group"
          ? {}
          : { number_range_start: parseRangeStart(createForm.numberRangeStart) }),
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
  }, [createForm, createFormGroup, createStore, createShift, createPosition, modal, router, queryClient]);

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
        // 공유 채번 그룹에는 매장 First EMPID 를 보내지 않는다 (ERR_RANGE_IGNORED)
        ...(editFormGroup?.numbering_mode === "group"
          ? {}
          : { number_range_start: parseRangeStart(editForm.numberRangeStart) }),
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
  }, [editingStoreId, editForm, editFormGroup, updateStore, queryClient, modal]);

  /**
   * 매장 폐점 핸들러 — DELETE 는 소프트 삭제(status=closed)로 동작한다(§3-7).
   * 데이터도 EMPID 도 남고 되돌릴 수 있으므로, 영구 삭제를 전제한 이름 입력 가드는
   * 두지 않고 문구를 실제 동작에 맞춘다.
   *
   * Close a store. DELETE is a soft delete (status=closed): data and EMPIDs
   * stay and it can be reopened, so the copy matches what actually happens.
   */
  const handleOpenClose = useCallback(
    async (store: Store, e: React.MouseEvent): Promise<void> => {
      e.stopPropagation();
      const ok = await modal.confirm({
        title: "Close store",
        message:
          `This closes "${store.name}". Staff can't be scheduled there or clock in, and it drops out of ` +
          `active lists. Its data — EMPIDs, schedules and attendance history — is kept, and you can ` +
          `reopen it later by setting its status back to Open.`,
        confirmLabel: "Close store",
        variant: "danger",
      });
      if (!ok) return;
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

  /** EMPID 관리 진입점 — Bulk Edit 에 매장 프리셀렉트 / Jump to EMPID bulk edit preselecting this store */
  const handleOpenEmpids = useCallback(
    (store: Store, e: React.MouseEvent): void => {
      e.stopPropagation();
      router.push(`/users/bulk/empid-edit?store=${store.id}`);
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
          <span className="inline-flex items-center gap-2">
            <span className="font-medium text-text">{store.name}</span>
            {/* 매장 단독 스코프의 불일치만 (그룹 스코프는 섹션 헤더가 표시) */}
            {store.numbering?.scope === "store" && store.numbering.mismatch && (
              <span title={mismatchMessage(store.numbering)}>
                <Badge variant="warning">Numbering out of sync</Badge>
              </span>
            )}
          </span>
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
              className: "w-36 text-right",
              render: (store: Store) => (
                <div className="flex items-center justify-end gap-1">
                  <button
                    type="button"
                    onClick={(e: React.MouseEvent) => handleOpenEmpids(store, e)}
                    className="px-1.5 py-1 rounded-md text-xs text-text-muted hover:text-text hover:bg-surface-hover transition-colors"
                    aria-label={`Manage EMPIDs for ${store.name}`}
                  >
                    EMPIDs
                  </button>
                  <button
                    type="button"
                    onClick={(e: React.MouseEvent) => handleOpenEdit(store, e)}
                    className="p-1.5 rounded-md text-text-muted hover:text-text hover:bg-surface-hover transition-colors"
                    aria-label={`Edit ${store.name}`}
                  >
                    <Edit className="h-4 w-4" />
                  </button>
                  {store.status !== "closed" && (
                    <button
                      type="button"
                      onClick={(e: React.MouseEvent) => void handleOpenClose(store, e)}
                      className="p-1.5 rounded-md text-text-muted hover:text-danger hover:bg-danger-muted transition-colors"
                      aria-label={`Close ${store.name}`}
                      title="Close store"
                    >
                      <Archive className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ),
            },
          ]
        : []),
    ],
    [handleOpenEdit, handleOpenClose, handleOpenEmpids, canWrite, tz],
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

      {/* 그룹 미지정 경고 — 급여는 그룹(법인) 단위로 산출되므로 그룹 없는 매장은 급여에서 빠진다.
          설계: docs/99_inbox/2026-08-13-조직계층-재정의.md §25.1 */}
      {ungroupedActiveCount > 0 && (
        <div className="mb-4 flex items-start gap-3 rounded-lg border border-[var(--color-warning)] bg-[var(--color-warning-muted)] px-4 py-3">
          <AlertTriangle className="mt-px h-4 w-4 shrink-0 text-[var(--color-warning)]" />
          <div className="min-w-0 text-[13px] leading-relaxed text-text">
            <span className="font-semibold">
              {ungroupedActiveCount} {ungroupedActiveCount === 1 ? "store is" : "stores are"} not
              assigned to a group.
            </span>{" "}
            Payroll is calculated per group — a store without one is left out, and overtime
            won&apos;t be combined across stores of the same company.
            {canWrite && " Create a group in Manage Groups, then assign each store below."}
          </div>
        </div>
      )}

      {/* Search + Status Filter */}
      <div className="mb-4 flex items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
          <input
            type="text"
            placeholder="Search stores..."
            value={search.value}
            {...search.imeProps}
            onChange={search.onChange}
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
                    First EMPID {section.group.number_range_start}
                  </span>
                )}
                {section.group?.numbering && (
                  <span className="text-xs text-text-muted">
                    Next EMPID {section.group.numbering.next_empid}
                  </span>
                )}
                {/* 불일치만 경고 — 예외 건수(분류)는 경고가 아니다 (RULE-E) */}
                {section.group?.numbering?.mismatch && (
                  <span title={mismatchMessage(section.group.numbering)}>
                    <Badge variant="warning">Numbering out of sync</Badge>
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
          <StoreNumberingRow
            groupSelect={
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
            }
            group={createFormGroup}
            storeNumbering={undefined}
            value={createForm.numberRangeStart}
            onChange={(v: string) =>
              setCreateForm((prev: StoreFormData) => ({ ...prev, numberRangeStart: v }))
            }
          />

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
                  if (isImeComposing(e)) return;
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
                  if (isImeComposing(e)) return;
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
          <StoreNumberingRow
            groupSelect={
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
            }
            group={editFormGroup}
            storeNumbering={editingStore?.numbering}
            value={editForm.numberRangeStart}
            onChange={(v: string) =>
              setEditForm((prev: StoreFormData) => ({ ...prev, numberRangeStart: v }))
            }
          />
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
