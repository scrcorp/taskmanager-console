"use client";

/**
 * FixedScheduleForm — 고정 근무(Fixed) 설정 폼 컨테이너.
 *
 * ScheduleEditModal 의 본문·푸터 자리에 그대로 들어간다(같은 모달, 본문 스왑 — 설계 D-i(1)).
 * 한 창에서 저장한 블록 N개 = 하나의 `group`(D-i(1-b)). 기간은 공통값 + 블록별 "Different period" override.
 *
 * 책임:
 *   - 공통 기간 입력 + 블록 리스트(FixedBlockEditor) + 기존 목록(ExistingPatternsList)
 *   - ① 창 안 블록 겹침을 **클라에서 선계산**해 요일 버튼을 빨갛게 + 저장 비활성 (서버 400 도 같은 자리에 매핑)
 *   - ② 기존 그룹 겹침(validate `overlaps` / 409 PATTERN_OVERLAP_EXISTING) → OverlapGate 3지선다 → `gate` 로 재전송
 *   - ④ availability(400 PATTERN_OUTSIDE_AVAILABILITY) → 해당 블록·요일 빨갛게 + 메시지
 *   - 편집 모드(기존 그룹): 진행 중 그룹이면 "Changes apply from today; past days are kept" 안내
 *
 * 상태는 부모(모달)가 들고 있다 — "← Back to one-time" 으로 나갔다 와도 입력이 보존돼야 하기 때문.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useModal } from "@/components/ui/imperative-modal";
import { useWorkRoles } from "@/hooks/useWorkRoles";
import {
  useSchedulePatterns,
  useCreatePatternGroup,
  useUpdatePatternGroup,
  useDeletePatternGroup,
  useValidatePatternGroup,
} from "@/hooks/useSchedulePatterns";
import {
  PATTERN_BLOCK_OVERLAP, PATTERN_OVERLAP_EXISTING, PATTERN_OUTSIDE_AVAILABILITY, PATTERN_GROUP_STARTED,
  type PatternGroupIn, type PatternGroupOut, type PatternIssue,
} from "@/types/schedulePattern";
import type { Store, User } from "@/types";
import { parseApiErrorEnvelope } from "@/lib/apiError";
import { timeToMin, isOnScheduleGrid, SCHEDULE_STEP_MINUTES } from "@/lib/scheduleTime";
import { FixedBlockEditor, blockDurationMin, DOW_LABELS, type FixedBlockDraft } from "./FixedBlockEditor";
import { ExistingPatternsList, fmtShortDate } from "./ExistingPatternsList";
import { OverlapGate, type OverlapGateChoice } from "./OverlapGate";

// ─── 폼 상태 ──────────────────────────────────────────────

export interface FixedScheduleDraft {
  startDate: string;   // "YYYY-MM-DD" 공통 시작일
  untilDate: string;   // "" = 무기한
  blocks: FixedBlockDraft[];
}

/** 모달이 들고 있는 고정 모드 전체 상태. 모드를 오가도 이 객체가 살아 있으면 입력이 보존된다. */
export interface FixedFormState {
  draft: FixedScheduleDraft;
  /** 편집 중인 기존 그룹. null = 신규 작성. */
  editingGroupId: string | null;
  /** 기존 그룹 [Edit] 로 들어오기 전의 신규 입력 — 편집을 나가면 여기로 돌아간다(D-i(1-c)). */
  stashedNewDraft: FixedScheduleDraft | null;
  /** 편집 대상 그룹의 저장 시점 스냅샷 (dirty 비교용). */
  loadedSnapshot: string | null;
  /** `initialPatternId` 로 그룹을 찾아 편집 모드로 올린 적이 있는가 (한 번만). */
  resolvedInitialPattern: boolean;
}

let blockSeq = 0;
export function newBlockKey(): string {
  blockSeq += 1;
  return `b${Date.now().toString(36)}${blockSeq}`;
}

/** 한 블록의 기본값. 일반 모달에서 넘어온 값(이월)을 덮어쓴다. */
export function makeBlockDraft(init: Partial<FixedBlockDraft> = {}): FixedBlockDraft {
  return {
    key: newBlockKey(),
    startTime: "09:00",
    endTime: "17:00",
    breakEnabled: false,
    breakStart: "",
    breakEnd: "",
    workRoleId: "",
    byday: [],
    differentPeriod: false,
    startDate: "",
    untilDate: "",
    ...init,
  };
}

export function makeInitialFixedState(draft: FixedScheduleDraft): FixedFormState {
  return { draft, editingGroupId: null, stashedNewDraft: null, loadedSnapshot: null, resolvedInitialPattern: false };
}

/** "YYYY-MM-DD" → 0=Sun..6=Sat (UTC 순수 날짜 산술 — 로컬 tz 무관). */
export function dowOf(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1)).getUTCDay();
}

/** 서버 그룹 → 폼 draft. 블록별 기간이 그룹 공통과 다르면 "Different period" 로 올린다. */
export function draftFromGroup(g: PatternGroupOut): FixedScheduleDraft {
  const until = g.until_date ?? "";
  return {
    startDate: g.start_date,
    untilDate: until,
    blocks: g.blocks.map((b) => {
      const bUntil = b.until_date ?? "";
      const differs = b.start_date !== g.start_date || bUntil !== until;
      return makeBlockDraft({
        startTime: b.start_time.slice(0, 5),
        endTime: b.end_time.slice(0, 5),
        breakEnabled: !!(b.break_start_time && b.break_end_time),
        breakStart: b.break_start_time?.slice(0, 5) ?? "",
        breakEnd: b.break_end_time?.slice(0, 5) ?? "",
        workRoleId: b.work_role_id ?? "",
        byday: [...b.byday].sort((x, y) => x - y),
        differentPeriod: differs,
        startDate: differs ? b.start_date : "",
        untilDate: differs ? bUntil : "",
      });
    }),
  };
}

/** draft → 서버 `PatternGroupIn`. 블록별 기간은 토글이 켜진 블록만 실어 보낸다(공통값 override). */
function toPatternGroupIn(
  draft: FixedScheduleDraft, userId: string, storeId: string, gate: "move" | "replace" | undefined,
): PatternGroupIn {
  return {
    user_id: userId,
    store_id: storeId,
    start_date: draft.startDate,
    until_date: draft.untilDate || null,
    blocks: draft.blocks.map((b) => ({
      start_time: b.startTime,
      end_time: b.endTime,
      break_start_time: b.breakEnabled && b.breakStart ? b.breakStart : null,
      break_end_time: b.breakEnabled && b.breakEnd ? b.breakEnd : null,
      work_role_id: b.workRoleId || null,
      byday: [...b.byday].sort((x, y) => x - y),
      ...(b.differentPeriod ? { start_date: b.startDate, until_date: b.untilDate || null } : {}),
    })),
    ...(gate ? { gate } : {}),
  };
}

// ─── ① 창 안 블록 겹침 (클라 선계산) ──────────────────────

/** [start, end) 분 구간. overnight 은 end+1440. */
function intervalOf(b: Pick<FixedBlockDraft, "startTime" | "endTime">): [number, number] {
  const s = timeToMin(b.startTime);
  let e = timeToMin(b.endTime);
  if (e <= s) e += 1440;
  return [s, e];
}

/** 블록 index → 겹치는 요일 집합. 같은 요일 ∧ 시간 겹침일 때만(2교대 허용). */
export function computeBlockConflicts(blocks: FixedBlockDraft[]): Map<number, Set<number>> {
  const out = new Map<number, Set<number>>();
  const add = (i: number, d: number) => {
    if (!out.has(i)) out.set(i, new Set());
    out.get(i)!.add(d);
  };
  for (let i = 0; i < blocks.length; i++) {
    for (let j = i + 1; j < blocks.length; j++) {
      const a = blocks[i]!, b = blocks[j]!;
      const [as, ae] = intervalOf(a);
      const [bs, be] = intervalOf(b);
      if (!(as < be && bs < ae)) continue;
      for (const d of a.byday) {
        if (b.byday.includes(d)) { add(i, d); add(j, d); }
      }
    }
  }
  return out;
}

/** 서버 issue 목록 → (블록 index → 요일 집합) 두 종류로 분해. */
function mapServerIssues(issues: PatternIssue[]): { conflicts: Map<number, Set<number>>; availability: Map<number, Set<number>>; other: string[] } {
  const conflicts = new Map<number, Set<number>>();
  const availability = new Map<number, Set<number>>();
  const other: string[] = [];
  const add = (m: Map<number, Set<number>>, i: unknown, d: unknown) => {
    const idx = Number(i), dow = Number(d);
    if (!Number.isInteger(idx) || !Number.isInteger(dow)) return;
    if (!m.has(idx)) m.set(idx, new Set());
    m.get(idx)!.add(dow);
  };
  for (const it of issues) {
    const p = it.params ?? {};
    if (it.code === PATTERN_BLOCK_OVERLAP) {
      const blocks = Array.isArray(p.blocks) ? p.blocks : [];
      for (const b of blocks) add(conflicts, b, p.dow);
    } else if (it.code === PATTERN_OUTSIDE_AVAILABILITY) {
      add(availability, p.block, p.dow);
    } else {
      other.push(it.code);
    }
  }
  return { conflicts, availability, other };
}

function mergeDowMaps(a: Map<number, Set<number>>, b: Map<number, Set<number>>): Map<number, Set<number>> {
  const out = new Map<number, Set<number>>();
  for (const m of [a, b]) for (const [i, s] of m) {
    if (!out.has(i)) out.set(i, new Set());
    for (const d of s) out.get(i)!.add(d);
  }
  return out;
}

// ─── 컴포넌트 ─────────────────────────────────────────────

interface Props {
  userId: string;
  storeId: string;
  users: User[];
  stores?: Store[];
  /** 매장 tz 기준 오늘 — 진행 중 그룹 판정용. */
  today: string;
  state: FixedFormState;
  onStateChange: (next: FixedFormState) => void;
  /**
   * 편집으로 진입할 때의 pattern_id (기존 행의 `pattern_id` 또는 virtual 의 pattern_id).
   * 목록에서 이 id 를 가진 그룹을 찾아 편집 모드로 올린다(한 번만).
   */
  initialPatternId?: string | null;
  /** "← Back to one-time" — 없으면 버튼을 숨긴다. 입력은 보존된다(부모가 state 를 유지). */
  onBackToOneTime?: () => void;
  onCancel: () => void;
  /** 저장/삭제 성공 후. 캐시 무효화는 훅이 하고, 부모는 닫기만 한다. */
  onSaved: () => void;
  /** 입력이 바뀌었는지 — 부모의 닫기 확인(discard) 판단용. */
  onDirtyChange?: (dirty: boolean) => void;
}

export function FixedScheduleForm({
  userId, storeId, users, stores, today, state, onStateChange,
  initialPatternId, onBackToOneTime, onCancel, onSaved, onDirtyChange,
}: Props) {
  const modal = useModal();
  const { draft, editingGroupId } = state;
  const setState = (patch: Partial<FixedFormState>) => onStateChange({ ...state, ...patch });
  const setDraft = (next: FixedScheduleDraft) => {
    // 입력이 바뀌면 서버가 짚어준 자리는 더 이상 유효하지 않다 — 지우고 다시 받는다.
    setServerIssues(null);
    setOverlaps(null);
    setBanner(null);
    onStateChange({ ...state, draft: next });
  };

  const workRolesQ = useWorkRoles(storeId || undefined);
  const workRoles = workRolesQ.data ?? [];
  const patternsQ = useSchedulePatterns({ user_id: userId, store_id: storeId });
  const groups: PatternGroupOut[] = useMemo(() => patternsQ.data ?? [], [patternsQ.data]);

  // silent — 계약 에러(①②④)는 이 폼이 필드 자리에 그린다. 성공/그 밖의 실패도 여기서 표시한다(조용한 실패 금지).
  const createMut = useCreatePatternGroup({ silent: true });
  const updateMut = useUpdatePatternGroup({ silent: true });
  const deleteMut = useDeletePatternGroup({ silent: true });
  const validateMut = useValidatePatternGroup();
  const busy = createMut.isPending || updateMut.isPending || deleteMut.isPending || validateMut.isPending;

  // 서버가 짚어준 문제(①④)와 ② 후보. draft 가 바뀌면 비운다.
  const [serverIssues, setServerIssues] = useState<ReturnType<typeof mapServerIssues> | null>(null);
  const [overlaps, setOverlaps] = useState<PatternGroupOut[] | null>(null);
  const [gateChoice, setGateChoice] = useState<OverlapGateChoice>("move");
  /** 그 밖의 실패 — 원인 + 다음 행동 한 줄 배너. */
  const [banner, setBanner] = useState<{ message: string; hint: string | null } | null>(null);

  // ── 편집 진입: initialPatternId → 그룹 찾기 (목록이 온 뒤 한 번만) ──
  useEffect(() => {
    if (!initialPatternId || state.resolvedInitialPattern || !patternsQ.isSuccess) return;
    const g = groups.find((x) => x.blocks.some((b) => b.id === initialPatternId));
    if (g) {
      const d = draftFromGroup(g);
      onStateChange({
        ...state,
        draft: d,
        editingGroupId: g.group_id,
        stashedNewDraft: null,
        loadedSnapshot: JSON.stringify(d),
        resolvedInitialPattern: true,
      });
    } else {
      onStateChange({ ...state, resolvedInitialPattern: true });
      setBanner({
        message: "This fixed schedule no longer exists — it may have been deleted or ended.",
        hint: "You can set up a new one below, or close this dialog.",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPatternId, patternsQ.isSuccess, groups, state.resolvedInitialPattern]);

  // ── dirty ──
  const initialNewRef = useRef<string>(JSON.stringify(draft));
  const isDirty = editingGroupId
    ? state.loadedSnapshot !== null && JSON.stringify(draft) !== state.loadedSnapshot
    : JSON.stringify(draft) !== initialNewRef.current;
  useEffect(() => { onDirtyChange?.(isDirty); }, [isDirty, onDirtyChange]);

  // ── 검증 (클라 선계산) ──
  const clientConflicts = useMemo(() => computeBlockConflicts(draft.blocks), [draft.blocks]);
  const conflictMap = useMemo(
    () => mergeDowMaps(clientConflicts, serverIssues?.conflicts ?? new Map()),
    [clientConflicts, serverIssues],
  );
  const availabilityMap = serverIssues?.availability ?? new Map<number, Set<number>>();
  const gridText = `${SCHEDULE_STEP_MINUTES}-minute increments`;

  const localError: string | null = (() => {
    if (!draft.startDate) return "Set a start date for this fixed schedule.";
    if (draft.untilDate && draft.untilDate < draft.startDate) return "The end date must be on or after the start date.";
    if (draft.blocks.length === 0) return "Add at least one block.";
    for (let i = 0; i < draft.blocks.length; i++) {
      const b = draft.blocks[i]!;
      const n = `Block ${i + 1}`;
      if (blockDurationMin(b) === 0) return `${n}: end time must be different from start time.`;
      if (!isOnScheduleGrid(b.startTime) || !isOnScheduleGrid(b.endTime)) return `${n}: times must be in ${gridText}.`;
      if (b.byday.length === 0) return `${n}: select at least one day.`;
      if (b.breakEnabled) {
        if (!b.breakStart || !b.breakEnd) return `${n}: set both break start and end, or turn the break off.`;
        if (b.breakStart === b.breakEnd) return `${n}: break start and end cannot be the same.`;
        if (!isOnScheduleGrid(b.breakStart) || !isOnScheduleGrid(b.breakEnd)) return `${n}: break times must be in ${gridText}.`;
      }
      if (b.differentPeriod) {
        if (!b.startDate) return `${n}: set a start date, or turn off "Different period".`;
        if (b.untilDate && b.untilDate < b.startDate) return `${n}: the end date must be on or after the start date.`;
      }
    }
    if (clientConflicts.size > 0) {
      return "Two blocks overlap on the same day at the same time (highlighted in red). Change the times or uncheck the day.";
    }
    return null;
  })();
  const canSave = !busy && !localError && !!userId && !!storeId;

  // ── 편집 대상 그룹 / 진행 중 여부 ──
  const editingGroup = editingGroupId ? groups.find((g) => g.group_id === editingGroupId) ?? null : null;
  const editingStarted = !!editingGroup && editingGroup.start_date <= today;

  const selectedUser = users.find((u) => u.id === userId);
  const selectedStore = stores?.find((s) => s.id === storeId);
  const allDows = useMemo(() => new Set(draft.blocks.flatMap((b) => b.byday)), [draft.blocks]);

  // ── 블록 조작 ──
  function updateBlock(i: number, next: FixedBlockDraft) {
    setDraft({ ...draft, blocks: draft.blocks.map((b, k) => (k === i ? next : b)) });
  }
  function removeBlock(i: number) {
    setDraft({ ...draft, blocks: draft.blocks.filter((_, k) => k !== i) });
  }
  function addBlock() {
    const last = draft.blocks[draft.blocks.length - 1];
    setDraft({
      ...draft,
      blocks: [...draft.blocks, makeBlockDraft({ startTime: "12:00", endTime: "20:00", workRoleId: last?.workRoleId ?? "" })],
    });
  }

  // ── 기존 목록 [Edit] → 그 그룹 편집 모드 ──
  async function startEditingGroup(g: PatternGroupOut) {
    if (!editingGroupId && isDirty) {
      const ok = await modal.confirm({
        title: "Edit the existing fixed schedule?",
        message: "You've started a new fixed schedule. Your input will be kept and restored when you come back from editing.",
        confirmLabel: "Edit existing",
      });
      if (!ok) return;
    }
    const d = draftFromGroup(g);
    setServerIssues(null); setOverlaps(null); setBanner(null);
    onStateChange({
      ...state,
      draft: d,
      editingGroupId: g.group_id,
      stashedNewDraft: editingGroupId ? state.stashedNewDraft : draft,
      loadedSnapshot: JSON.stringify(d),
    });
  }
  /** 편집을 나가 신규 입력으로 복귀 (D-i(1-c) "돌아오면 원 상태 복귀"). */
  function leaveEditing() {
    const restore = state.stashedNewDraft ?? {
      startDate: draft.startDate, untilDate: "", blocks: [makeBlockDraft({ byday: [] })],
    };
    setServerIssues(null); setOverlaps(null); setBanner(null);
    onStateChange({ ...state, draft: restore, editingGroupId: null, stashedNewDraft: null, loadedSnapshot: null });
  }

  // ── 실패 처리 — 코드로만 분기, 문자열 매칭 금지 ──
  function applyFailure(err: unknown): void {
    const parsed = parseApiErrorEnvelope(err);
    const code = parsed.code;
    if (code === PATTERN_OVERLAP_EXISTING) {
      const raw = parsed.params.overlaps;
      const list = Array.isArray(raw) ? (raw as PatternGroupOut[]) : [];
      setOverlaps(list);
      setGateChoice("move");
      return;
    }
    if (code === PATTERN_BLOCK_OVERLAP || code === PATTERN_OUTSIDE_AVAILABILITY) {
      setServerIssues(mapServerIssues([{ code, params: parsed.params }]));
      return;
    }
    if (code === PATTERN_GROUP_STARTED) {
      setBanner({
        message: parsed.message || "This fixed schedule has already started.",
        hint: parsed.hint ?? "Edit the schedule instead — changes apply from today onward.",
      });
      return;
    }
    // 422 등 필드 검증: errors 배열이 있으면 그걸, 없으면 메시지.
    if (parsed.errors.length > 0) {
      const mapped = mapServerIssues(parsed.errors);
      if (mapped.conflicts.size > 0 || mapped.availability.size > 0) { setServerIssues(mapped); return; }
    }
    setBanner({
      message: parsed.message || "Couldn't save this fixed schedule.",
      hint: parsed.hint ?? "Check the inputs and try again. If it keeps failing, reload the page.",
    });
  }

  // ── 저장 ──
  async function handleSave(): Promise<void> {
    if (!canSave) return;
    setBanner(null);
    const gate: "move" | "replace" | undefined =
      overlaps && overlaps.length > 0 && gateChoice !== "add" ? gateChoice : undefined;
    const body = toPatternGroupIn(draft, userId, storeId, gate);

    // 1) 저장 없이 ①②④ 선검사 — 겹침 후보는 게이트로, 필드 문제는 그 자리로.
    if (!gate) {
      try {
        const res = await validateMut.mutateAsync(body);
        const errors = res.errors ?? [];
        if (errors.length > 0) {
          const mapped = mapServerIssues(errors);
          setServerIssues(mapped);
          if (mapped.other.length > 0) {
            setBanner({ message: `The server rejected this fixed schedule (${mapped.other.join(", ")}).`, hint: "Check the highlighted fields and try again." });
          }
          return;
        }
        const ov = (res.overlaps ?? []).filter((g) => g.group_id !== editingGroupId);
        if (ov.length > 0 && !(overlaps && gateChoice === "add")) {
          setOverlaps(ov);
          setGateChoice("move");
          return;   // 사용자가 3지선다를 고른 뒤 다시 Save
        }
      } catch (err) {
        // validate 자체의 실패(권한/네트워크)는 저장 경로의 판정에 맡긴다 — 아래 create/update 가 최종.
        const parsed = parseApiErrorEnvelope(err);
        if (parsed.status !== null && parsed.status >= 500) { applyFailure(err); return; }
      }
    }

    // 2) 저장
    try {
      if (editingGroupId) {
        await updateMut.mutateAsync({ group_id: editingGroupId, data: body });
        void modal.alert({ type: "success", message: "Fixed schedule updated." });
      } else {
        await createMut.mutateAsync(body);
        void modal.alert({
          type: "success",
          message: gate === "move"
            ? "The existing fixed schedule now starts earlier. Nothing new was created."
            : gate === "replace"
              ? "The existing fixed schedule was replaced."
              : "Fixed schedule saved.",
        });
      }
      onSaved();
    } catch (err) {
      applyFailure(err);
    }
  }

  async function handleDeleteGroup(): Promise<void> {
    if (!editingGroupId) return;
    const ok = await modal.confirm({
      title: "Delete this fixed schedule?",
      message: editingStarted
        ? "Upcoming days that haven't been edited will be removed. Past days and days you edited stay as one-time schedules."
        : "This fixed schedule hasn't started yet. Any days already created from it will be removed.",
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;
    try {
      await deleteMut.mutateAsync(editingGroupId);
      void modal.alert({ type: "success", message: "Fixed schedule removed. Past and edited days are kept as one-time schedules." });
      onSaved();
    } catch (err) {
      applyFailure(err);
    }
  }

  const saveLabel = busy
    ? "Saving…"
    : editingGroupId
      ? "Save changes"
      : overlaps && overlaps.length > 0
        ? gateChoice === "move" ? "Move existing earlier" : gateChoice === "replace" ? "Replace existing" : "Add separately"
        : "Save fixed schedule";

  return (
    <>
      {/* ── Body ── */}
      <div className="flex-1 overflow-y-auto" data-testid="fixed-schedule-form">
        <div className="px-5 py-4 space-y-3.5">
          {/* 누구·어디 — 일반 모달에서 고른 값. 여기서 바꾸지 않는다(모드 전환으로 돌아가 바꾼다). */}
          <div className="flex items-center gap-2 text-[12px] text-[var(--color-text-secondary)]">
            <span className="font-semibold text-[var(--color-text)]">{selectedUser?.full_name ?? "Staff"}</span>
            {selectedStore && <span>· {selectedStore.name}</span>}
            <span className="ml-auto text-[10px] text-[var(--color-text-muted)]">Repeats weekly</span>
          </div>

          {banner && (
            <div className="px-3 py-2.5 rounded-lg border border-[var(--color-danger)] bg-[var(--color-danger-muted)] text-[12px] text-[var(--color-danger)] leading-relaxed" role="alert">
              <div>{banner.message}</div>
              {banner.hint && <div className="mt-0.5 opacity-90">{banner.hint}</div>}
            </div>
          )}

          {editingGroupId && (
            <div className="rounded-lg border border-[var(--color-accent)] bg-[var(--color-accent-muted)] px-3 py-2 text-[12px] text-[var(--color-text-secondary)] flex items-start gap-2">
              <span className="flex-1">
                <strong className="text-[var(--color-text)]">Editing an existing fixed schedule</strong>
                {editingGroup && <> — {editingGroup.until_date ? `${fmtShortDate(editingGroup.start_date)} to ${fmtShortDate(editingGroup.until_date)}` : `from ${fmtShortDate(editingGroup.start_date)}`}.</>}
                {editingStarted && <span className="block mt-0.5">Changes apply from today; past days are kept.</span>}
              </span>
              <button type="button" onClick={leaveEditing} className="shrink-0 text-[11px] font-bold underline underline-offset-2 text-[var(--color-accent)]">
                {state.stashedNewDraft ? "Back to new" : "New instead"}
              </button>
            </div>
          )}

          {/* 공통 기간 */}
          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-1.5">
              Period <span className="normal-case tracking-normal font-normal">· applies to every block unless a block sets its own</span>
            </label>
            <div className="flex items-center gap-2 flex-wrap">
              <input
                type="date"
                value={draft.startDate}
                onChange={(e) => e.target.value && setDraft({ ...draft, startDate: e.target.value })}
                className="px-2 py-2 border rounded-lg text-[13px] tabular-nums font-semibold bg-[var(--color-surface)] border-[var(--color-border)]"
                aria-label="Start date"
              />
              <span className="text-[12px] text-[var(--color-text-muted)]">to</span>
              <input
                type="date"
                value={draft.untilDate}
                min={draft.startDate || undefined}
                onChange={(e) => setDraft({ ...draft, untilDate: e.target.value })}
                className="px-2 py-2 border rounded-lg text-[13px] tabular-nums bg-[var(--color-surface)] border-[var(--color-border)]"
                aria-label="End date (optional)"
              />
              <span className="text-[11px] text-[var(--color-text-muted)]">
                {draft.untilDate ? (
                  <button type="button" onClick={() => setDraft({ ...draft, untilDate: "" })} className="underline underline-offset-2">Clear · make it ongoing</button>
                ) : "No end date = ongoing"}
              </span>
            </div>
            {editingStarted && draft.startDate > today && (
              <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
                Already-started schedule: days before {fmtShortDate(draft.startDate)} stay as they are.
              </p>
            )}
          </div>

          {/* 블록 N개 */}
          <div className="space-y-2">
            {draft.blocks.map((b, i) => (
              <FixedBlockEditor
                key={b.key}
                index={i}
                block={b}
                workRoles={workRoles}
                workRolesLoading={workRolesQ.isLoading}
                commonStartDate={draft.startDate}
                commonUntilDate={draft.untilDate}
                conflictDows={conflictMap.get(i) ?? new Set()}
                availabilityDows={availabilityMap.get(i) ?? new Set()}
                canRemove={draft.blocks.length > 1}
                disabled={busy}
                onChange={(next) => updateBlock(i, next)}
                onRemove={() => removeBlock(i)}
              />
            ))}
            <button
              type="button"
              onClick={addBlock}
              disabled={busy}
              className="w-full py-2 rounded-xl border border-dashed border-[var(--color-border)] text-[12px] font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] disabled:opacity-50"
            >
              + Add block <span className="font-normal text-[var(--color-text-muted)]">· different time or role on other days</span>
            </button>
          </div>

          {/* 요약 한 줄 */}
          {allDows.size > 0 && (
            <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 py-2 text-[12px] text-[var(--color-text-secondary)]">
              Repeats every <strong className="text-[var(--color-text)]">{[...allDows].sort((a, b) => a - b).map((d) => DOW_LABELS[d]).join(", ")}</strong>
              {draft.startDate && <> from <strong className="text-[var(--color-text)]">{fmtShortDate(draft.startDate)}</strong></>}
              {draft.untilDate ? <> to <strong className="text-[var(--color-text)]">{fmtShortDate(draft.untilDate)}</strong></> : <>, ongoing</>}.
              {" "}Days in the next weeks are created right away; later weeks appear automatically.
            </div>
          )}

          {localError && (
            <div className="text-[11px] text-[var(--color-danger)] bg-[var(--color-danger-muted)] px-2.5 py-1.5 rounded-md" role="alert">
              {localError}
            </div>
          )}

          {/* ② 기존 그룹 겹침 게이트 */}
          {overlaps && overlaps.length > 0 && (
            <OverlapGate
              overlaps={overlaps}
              newStartDate={draft.startDate}
              newDows={allDows}
              value={gateChoice}
              onChange={setGateChoice}
              disabled={busy}
            />
          )}

          {/* 기존 고정근무 (읽기 전용·접기) */}
          <ExistingPatternsList
            groups={groups}
            isLoading={patternsQ.isLoading}
            isError={patternsQ.isError}
            onRetry={() => void patternsQ.refetch()}
            editingGroupId={editingGroupId}
            defaultOpen={!editingGroupId}
            onEdit={(g) => void startEditingGroup(g)}
          />
        </div>
      </div>

      {/* ── Footer ── */}
      <div className="shrink-0 px-5 py-4 border-t border-[var(--color-border)] flex items-center gap-2 bg-[var(--color-surface)]">
        {onBackToOneTime && (
          <button
            type="button"
            onClick={onBackToOneTime}
            disabled={busy}
            className="px-2 py-2 rounded-lg text-[12px] font-semibold text-[var(--color-accent)] hover:bg-[var(--color-accent-muted)] disabled:opacity-50"
            title="Your fixed schedule input is kept"
          >
            ← Back to one-time
          </button>
        )}
        {editingGroupId && (
          <button
            type="button"
            onClick={() => void handleDeleteGroup()}
            disabled={busy}
            className="px-3.5 py-2 rounded-lg text-[12px] font-semibold text-[var(--color-danger)] hover:bg-[var(--color-danger-muted)] disabled:opacity-50"
          >
            Delete fixed schedule
          </button>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="px-4 py-2 rounded-lg text-[13px] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={!canSave}
            data-testid="fixed-save"
            className="px-4 py-2 rounded-lg text-[13px] font-semibold bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saveLabel}
          </button>
        </div>
      </div>
    </>
  );
}
