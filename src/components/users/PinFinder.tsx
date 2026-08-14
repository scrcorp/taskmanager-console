"use client";

/**
 * PIN finder — Staff 페이지 툴바의 "PIN" 버튼이 여는 도구.
 *
 * 두 방향의 흐름을 다 지원한다:
 *   A. 번호부터 — PIN 검색 → 비어 있으면 "Assign" → 사람 선택 → 그 사람에게 배정.
 *   B. 사람부터 — 이름 검색 → 그 행에서 PIN 편집 → 입력한 번호가 쓰이는지 즉시 판정 →
 *      비었으면 변경, 남이 쓰면 거부.
 *
 * 곁들여: 안 쓰이는 PIN 추천(값만), PIN 제거(번호 회수).
 * 수정·제거·배정은 clockin_pin:update 권한자만.
 * 응답에 남의 PIN 값·이름이 실리므로 `clockin_pin:read` 권한자에게만 노출한다
 * (서버도 같은 권한으로 막는다 — 여기 게이트는 UI 정리용).
 *
 * `modal.open` 안에서 렌더된다.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, Loader2, Pencil, Search, Trash2, X as XIcon } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useModal } from "@/components/ui/imperative-modal";
import { useToast } from "@/components/ui/Toast";
import {
  useClearClockinPin,
  useClockinPinDirectory,
  useClockinPinLookup,
  useSuggestClockinPin,
  useUpdateClockinPin,
} from "@/hooks/useClockinPin";
import { usePermissions } from "@/hooks/usePermissions";
import { PERMISSIONS } from "@/lib/permissions";
import {
  PIN_PATTERN,
  canSavePinDraft,
  evaluatePinDraft,
  type PinDraftVerdict,
} from "@/lib/pinDraft";
import type { ClockinPinHolder } from "@/types";

/** 추천 PIN 자릿수 선택지. 짧을수록 키오스크에서 누르기 편하다. */
const SUGGEST_LENGTHS: number[] = [4, 5, 6];

export function PinFinder(): React.ReactElement {
  const { hasPermission } = usePermissions();
  const canEdit: boolean = hasPermission(PERMISSIONS.CLOCKIN_PIN_UPDATE);
  const modal = useModal();
  const { toast } = useToast();

  const [query, setQuery] = useState<string>("");
  const [debounced, setDebounced] = useState<string>("");
  const [includeInactive, setIncludeInactive] = useState<boolean>(false);
  const [suggestLength, setSuggestLength] = useState<number>(4);
  /** 배정 대기 중인 PIN — 값이 있으면 목록이 "사람 고르기" 모드가 된다. */
  const [assigning, setAssigning] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // 모드가 바뀌면 검색창으로 포커스를 되돌린다 — 배정 모드로 넘어간 직후
  // 바로 이름을 칠 수 있어야 한다 (버튼에 포커스가 남으면 입력이 사라진다).
  useEffect(() => {
    searchRef.current?.focus();
  }, [assigning]);

  // 타이핑마다 서버를 때리지 않도록 250ms 지연 — 목록 검색에만 적용.
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);

  const trimmed: string = query.trim();
  const isPinQuery: boolean = PIN_PATTERN.test(trimmed);

  const lookup = useClockinPinLookup(isPinQuery ? trimmed : "");
  const directory = useClockinPinDirectory(debounced, includeInactive);
  const suggest = useSuggestClockinPin(suggestLength);

  const blockers: ClockinPinHolder[] = useMemo(
    () => (isPinQuery ? (lookup.data?.holders ?? []) : []),
    [isPinQuery, lookup.data],
  );
  const blockerIds: Set<string> = useMemo(
    () => new Set(blockers.map((h) => h.user_id)),
    [blockers],
  );
  const others: ClockinPinHolder[] = (directory.data?.items ?? []).filter(
    (h) => !blockerIds.has(h.user_id),
  );

  /** 추천 결과 — 없으면 빈 문자열 (버튼은 pin 이 있을 때만 렌더). */
  const suggestedPin: string = suggest.data?.pin ?? "";

  /** 번호부터 흐름 시작 — 검색어를 비워 이름으로 사람을 찾게 한다. */
  const startAssign = (pin: string): void => {
    setAssigning(pin);
    setQuery("");
  };

  /** 배정 완료/취소 — 방금 배정한 번호를 다시 조회해 결과를 보여준다. */
  const endAssign = (assignedPin?: string): void => {
    setAssigning(null);
    if (assignedPin) setQuery(assignedPin);
  };

  const copyPin = (pin: string): void => {
    void navigator.clipboard.writeText(pin);
    toast({ type: "success", message: "Copied to clipboard" });
  };

  return (
    <div className="space-y-4">
      {/* 검색 — PIN(숫자 4~6자리)이면 가용성 판정까지, 아니면 이름 검색 */}
      <div>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-text-muted" />
          <input
            ref={searchRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              assigning !== null
                ? "Search staff by name"
                : "Search by PIN (4-6 digits) or name"
            }
            autoFocus
            className="w-full rounded-lg border border-border bg-bg pl-9 pr-8 py-2 text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-text-muted hover:text-text transition-colors"
              aria-label="Clear search"
            >
              <XIcon className="h-4 w-4" />
            </button>
          )}
        </div>
        {trimmed !== "" && /^\d+$/.test(trimmed) && !isPinQuery && (
          <p className="mt-1.5 text-xs text-text-muted">
            A PIN is 4 to 6 digits — keep typing to check whether it is free.
          </p>
        )}
      </div>

      {/* 배정 모드 — 번호를 정해두고 사람을 고르는 중 */}
      {assigning !== null && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-accent/40 bg-accent-muted px-3 py-2.5 text-sm text-text">
          <span>
            Assigning{" "}
            <span className="font-semibold tabular-nums tracking-[0.15em]">
              {assigning}
            </span>{" "}
            — pick a staff member below.
          </span>
          <button
            type="button"
            onClick={() => endAssign()}
            className="ml-auto text-xs font-semibold text-text-secondary hover:text-text transition-colors"
          >
            Cancel
          </button>
        </div>
      )}

      {/* 가용성 배너 */}
      {assigning === null && isPinQuery && (
        <div>
          {lookup.isPending ? (
            <div className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2.5 text-sm text-text-secondary">
              <Loader2 className="h-4 w-4 animate-spin" />
              Checking {trimmed}...
            </div>
          ) : lookup.data?.available ? (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-success/40 bg-success-muted px-3 py-2.5 text-sm text-text">
              <span>
                <span className="font-semibold tabular-nums tracking-[0.15em]">
                  {trimmed}
                </span>{" "}
                is free — nobody is using it.
              </span>
              {canEdit && (
                <Button
                  variant="primary"
                  size="sm"
                  className="ml-auto"
                  onClick={() => startAssign(trimmed)}
                >
                  Assign this PIN
                </Button>
              )}
            </div>
          ) : lookup.data ? (
            <div className="rounded-lg border border-danger/40 bg-danger-muted px-3 py-2.5 text-sm text-text">
              <span className="font-semibold tabular-nums tracking-[0.15em]">
                {trimmed}
              </span>{" "}
              can&apos;t be used — someone already has this PIN.
            </div>
          ) : null}
        </div>
      )}

      {/* 안 쓰이는 PIN 추천 */}
      <div hidden={assigning !== null} className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2.5">
        <span className="text-sm text-text-secondary">Find a free PIN:</span>
        <div className="flex items-center gap-1">
          {SUGGEST_LENGTHS.map((len) => (
            <button
              key={len}
              type="button"
              onClick={() => setSuggestLength(len)}
              className={`px-2 py-1 rounded text-xs font-semibold transition-colors ${
                suggestLength === len
                  ? "bg-accent text-white"
                  : "bg-bg text-text-secondary hover:bg-surface-hover"
              }`}
            >
              {len}-digit
            </button>
          ))}
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => void suggest.refetch()}
          isLoading={suggest.isFetching}
        >
          Suggest
        </Button>
        {!suggest.isFetching && suggest.data && (
          suggest.data.pin ? (
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-text tabular-nums tracking-[0.15em]">
                {suggest.data.pin}
              </span>
              <button
                type="button"
                onClick={() => copyPin(suggestedPin)}
                className="text-text-muted hover:text-accent transition-colors"
                title="Copy"
                aria-label="Copy suggested PIN"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
              {canEdit && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => startAssign(suggestedPin)}
                >
                  Assign
                </Button>
              )}
            </div>
          ) : (
            <span className="text-sm text-danger">
              No {suggest.data.length}-digit PIN left — try a longer one.
            </span>
          )
        )}
      </div>

      {/* 이 PIN 을 막고 있는 사람들 — 여기서 바로 고치거나 지울 수 있다 */}
      {assigning === null && blockers.length > 0 && (
        <section>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted mb-1.5">
            Using {trimmed}
          </h3>
          <ul className="divide-y divide-border rounded-lg border border-border overflow-hidden">
            {blockers.map((holder) => (
              <PinRow
                key={holder.user_id}
                holder={holder}
                canEdit={canEdit}
                onCopy={copyPin}
                modal={modal}
                assigning={null}
                onAssigned={endAssign}
              />
            ))}
          </ul>
        </section>
      )}

      {/* 이름/PIN 검색 결과 */}
      <section>
        <div className="flex items-center justify-between mb-1.5">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
            {assigning !== null
              ? "Assign to"
              : blockers.length > 0
                ? "Other staff"
                : "Staff"}
          </h3>
          <label className="flex items-center gap-1.5 text-xs text-text-secondary cursor-pointer">
            <input
              type="checkbox"
              checked={includeInactive}
              onChange={(e) => setIncludeInactive(e.target.checked)}
              className="accent-accent"
            />
            Include inactive
          </label>
        </div>
        {directory.isPending ? (
          <div className="flex items-center justify-center py-6 text-text-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
          </div>
        ) : others.length === 0 ? (
          <p className="py-6 text-center text-sm text-text-muted">
            {blockers.length > 0
              ? "No other matches."
              : "No staff match this search."}
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border overflow-hidden max-h-[320px] overflow-y-auto">
            {others.map((holder) => (
              <PinRow
                key={holder.user_id}
                holder={holder}
                canEdit={canEdit}
                onCopy={copyPin}
                modal={modal}
                assigning={assigning}
                onAssigned={endAssign}
              />
            ))}
          </ul>
        )}
        {directory.data?.truncated && (
          <p className="mt-1.5 text-xs text-text-muted">
            Showing the first {directory.data.items.length} matches — narrow the
            search to see the rest.
          </p>
        )}
      </section>
    </div>
  );
}

// ─── Row ────────────────────────────────────────────────────────────────────

interface PinRowProps {
  holder: ClockinPinHolder;
  canEdit: boolean;
  onCopy: (pin: string) => void;
  modal: ReturnType<typeof useModal>;
  /** 배정 대기 중인 PIN. null 이 아니면 이 행은 "이 사람에게 배정" 버튼만 보인다. */
  assigning: string | null;
  /** 배정 완료 콜백 — 부모가 모드를 풀고 결과를 조회한다. */
  onAssigned: (assignedPin: string) => void;
}

/**
 * 직원 한 줄 — 이름/역할/현재 PIN + 인라인 수정·제거, 또는 배정 대상.
 *
 * 수정은 Staff detail 의 PIN 행과 같은 mutation 을 쓴다(409 안내 문구도 동일).
 * 편집 중에는 입력값을 서버에 조회해 **남이 쓰는 번호면 저장을 막는다** —
 * 서버 409 가 최종 방어지만, 누르기 전에 알려주는 편이 낫다.
 */
function PinRow({
  holder,
  canEdit,
  onCopy,
  modal,
  assigning,
  onAssigned,
}: PinRowProps): React.ReactElement {
  const updatePin = useUpdateClockinPin();
  const clearPin = useClearClockinPin();
  const [editing, setEditing] = useState<boolean>(false);
  const [draft, setDraft] = useState<string>("");

  const pin: string = holder.clockin_pin ?? "";
  const busy: boolean = updatePin.isPending || clearPin.isPending;

  // 편집 중일 때만 입력값을 조회한다 (형식이 맞아야 훅이 실제로 요청).
  const draftLookup = useClockinPinLookup(editing ? draft : "");
  const verdict: PinDraftVerdict = evaluatePinDraft({
    draft,
    selfUserId: holder.user_id,
    lookup: draftLookup.data,
    isChecking: draftLookup.isFetching,
  });
  const canSave: boolean = canSavePinDraft(verdict) && !busy;

  const startEdit = (): void => {
    setDraft(pin);
    setEditing(true);
  };

  const save = (): void => {
    if (!canSave) return;
    updatePin.mutate(
      { userId: holder.user_id, clockinPin: draft },
      { onSuccess: () => setEditing(false) },
    );
  };

  /** 번호부터 흐름 — 이 사람에게 배정. 이미 PIN 이 있으면 교체 확인. */
  const assign = async (): Promise<void> => {
    if (assigning === null || busy) return;
    if (pin) {
      const ok: boolean = await modal.confirm({
        title: "Replace this PIN?",
        message: `${holder.full_name} currently uses ${pin}. Assigning ${assigning} replaces it — the old number becomes free.`,
        confirmLabel: "Replace",
      });
      if (!ok) return;
    }
    updatePin.mutate(
      { userId: holder.user_id, clockinPin: assigning },
      { onSuccess: () => onAssigned(assigning) },
    );
  };

  const remove = async (): Promise<void> => {
    const ok: boolean = await modal.confirm({
      title: "Remove PIN?",
      message: `${holder.full_name} won't be able to clock in with a PIN until a new one is set. The number becomes available for someone else.`,
      confirmLabel: "Remove",
      variant: "danger",
    });
    if (!ok) return;
    clearPin.mutate(holder.user_id);
  };

  return (
    <li className="flex items-center gap-3 bg-surface px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-medium text-text truncate">
            {holder.full_name}
          </span>
          {!holder.is_active && !holder.is_provisional && (
            <span className="text-[10px] font-semibold uppercase text-text-muted border border-border rounded px-1 py-0.5">
              Inactive
            </span>
          )}
          {holder.is_provisional && (
            <span className="text-[10px] font-semibold uppercase text-warning border border-warning/40 rounded px-1 py-0.5">
              Not signed up
            </span>
          )}
        </div>
        <span className="text-xs text-text-muted">
          {holder.role_name ?? "—"}
          {holder.username ? ` · ${holder.username}` : ""}
        </span>
      </div>

      {editing ? (
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-right min-w-[9rem]">
            {verdict.state === "taken" ? (
              <span className="text-danger">
                In use{verdict.holderName ? ` — ${verdict.holderName}` : ""}
              </span>
            ) : verdict.state === "free" ? (
              <span className="text-success">Free</span>
            ) : verdict.state === "self" ? (
              <span className="text-text-muted">Current PIN</span>
            ) : verdict.state === "checking" ? (
              <span className="text-text-muted">Checking...</span>
            ) : (
              <span className="text-text-muted">4-6 digits</span>
            )}
          </span>
          <input
            type="text"
            inputMode="numeric"
            maxLength={6}
            value={draft}
            onChange={(e) => setDraft(e.target.value.replace(/\D/g, "").slice(0, 6))}
            onKeyDown={(e) => {
              if (e.key === "Enter") save();
              if (e.key === "Escape") setEditing(false);
            }}
            autoFocus
            className={`w-24 px-2 py-1 rounded bg-bg border text-sm text-text tabular-nums tracking-[0.15em] focus:outline-none ${
              verdict.state === "taken"
                ? "border-danger focus:border-danger"
                : "border-border focus:border-accent"
            }`}
          />
          <button
            type="button"
            onClick={save}
            disabled={!canSave}
            className="text-success hover:opacity-80 disabled:opacity-30 transition"
            title={verdict.state === "taken" ? "Already in use" : "Save"}
            aria-label="Save PIN"
          >
            <Check className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setEditing(false)}
            disabled={busy}
            className="text-text-muted hover:text-text transition"
            title="Cancel"
            aria-label="Cancel"
          >
            <XIcon className="h-4 w-4" />
          </button>
        </div>
      ) : assigning !== null ? (
        <div className="flex items-center gap-2">
          {pin ? (
            <span className="text-xs text-text-muted tabular-nums tracking-[0.15em]">
              {pin}
            </span>
          ) : (
            <span className="text-xs text-text-muted">No PIN</span>
          )}
          <Button
            variant="primary"
            size="sm"
            onClick={() => void assign()}
            isLoading={updatePin.isPending}
          >
            {pin ? "Replace" : "Assign"}
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          {pin ? (
            <button
              type="button"
              onClick={() => onCopy(pin)}
              className="text-sm text-text tabular-nums tracking-[0.15em] hover:text-accent transition-colors"
              title="Copy PIN"
            >
              {pin}
            </button>
          ) : (
            <span className="text-sm text-text-muted">No PIN</span>
          )}
          {canEdit && (
            <>
              <button
                type="button"
                onClick={startEdit}
                className="text-text-muted hover:text-accent transition-colors"
                title="Edit PIN"
                aria-label={`Edit PIN for ${holder.full_name}`}
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
              {pin && (
                <button
                  type="button"
                  onClick={() => void remove()}
                  disabled={busy}
                  className="text-text-muted hover:text-danger disabled:opacity-30 transition-colors"
                  title="Remove PIN"
                  aria-label={`Remove PIN for ${holder.full_name}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </>
          )}
        </div>
      )}
    </li>
  );
}
