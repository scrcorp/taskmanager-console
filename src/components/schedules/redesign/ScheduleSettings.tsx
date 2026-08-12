"use client";

/**
 * ScheduleSettings — 목업 스타일 카드 sections + parent-managed draft (Cancel/Save 일괄).
 *
 * Draft 패턴:
 * - 모든 input 변경은 즉시 server에 저장 X. parent의 draft state에 큐잉.
 * - "Save Changes" 클릭 시 draft를 mutation 호출로 일괄 flush.
 * - "Cancel" 클릭 시 draft 폐기 → server 값으로 복원.
 * - Inherit/Custom 토글은 batch와 별개로 즉시 적용 (구조 변경이라 draft에 안 어울림).
 *
 * 섹션 (목업 매칭):
 * 1. Work Hour Alerts (registry, both)
 * 2. Weekly Limits (registry, both)
 * 3. Approval Workflow (registry, both)
 * 4. Break Rules (registry, both)
 * 5. Attendance (registry, both)
 * 6. Operating Hours (registry key: store.operating_hours, both) — 매장 영업시간 + 휴무일
 * 7. Schedule Range (registry key: schedule.range, both) — 직원 근무 가능 시간대(D2-4)
 * 7. Work Roles (store only — WorkRolesPanel reuse)
 */

import { useState, useMemo, useRef, useEffect } from "react";
import { useStores } from "@/hooks/useStores";
import { useModal } from "@/components/ui/imperative-modal";
import {
  useSettingsRegistry,
  useOrgSettings,
  useStoreSettings,
  useUpsertOrgSetting,
  useUpsertStoreSetting,
  useDeleteStoreSetting,
  type SettingsRegistryEntry,
  type OrgSettingEntry,
  type StoreSettingEntry,
} from "@/hooks/useSettings";
import { WorkRolesPanel } from "@/components/schedules/WorkRolesPanel";
import { parseApiError } from "@/lib/utils";
import { SCHEDULE_STEP_MINUTES } from "@/lib/scheduleTime";

interface Props {
  showCost?: boolean;
  onBack: () => void;
}

// ─── Draft state ───────────────────────────────────────

interface DraftState {
  /** 현재 scope 기준 변경된 키-값 */
  values: Record<string, unknown>;
  /** store-level: keys to delete (revert to org/default) */
  deletedKeys: string[];
}

const EMPTY_DRAFT: DraftState = { values: {}, deletedKeys: [] };

// ─── Main component ────────────────────────────────────

export function ScheduleSettings({ onBack }: Props) {
  const storesQ = useStores();
  const stores = storesQ.data ?? [];
  const [activeTab, setActiveTab] = useState<"org" | string>("org");
  const [draft, setDraft] = useState<DraftState>(EMPTY_DRAFT);
  const modal = useModal();

  // 탭 변경 시 draft 폐기 (혼동 방지)
  async function handleTabChange(tab: "org" | string): Promise<void> {
    if (Object.keys(draft.values).length > 0 || draft.deletedKeys.length > 0) {
      const ok = await modal.confirm({
        title: "Discard unsaved changes?",
        message: "You have unsaved changes in this tab. Switching will discard them.",
        confirmLabel: "Discard",
        variant: "danger",
      });
      if (!ok) return;
    }
    setDraft(EMPTY_DRAFT);
    setActiveTab(tab);
  }

  const registryQ = useSettingsRegistry();
  const registry: SettingsRegistryEntry[] = registryQ.data ?? [];
  const registryByKey = useMemo(() => {
    const m = new Map<string, SettingsRegistryEntry>();
    registry.forEach((e) => m.set(e.key, e));
    return m;
  }, [registry]);

  const orgSettingsQ = useOrgSettings();
  const storeSettingsQ = useStoreSettings(activeTab !== "org" ? activeTab : undefined);
  const orgSettings: OrgSettingEntry[] = orgSettingsQ.data ?? [];
  const storeSettings: StoreSettingEntry[] = storeSettingsQ.data ?? [];

  const isStoreScope = activeTab !== "org";
  const activeStore = isStoreScope ? stores.find((s) => s.id === activeTab) : undefined;

  /** server effective value (store override > org override > registry default) */
  function getEffectiveValue(key: string): unknown {
    const reg = registryByKey.get(key);
    if (!reg) return undefined;
    const storeOverride = storeSettings.find((s) => s.key === key)?.value;
    const orgOverride = orgSettings.find((s) => s.key === key);
    if (isStoreScope && storeOverride !== undefined && storeOverride !== null) return storeOverride;
    if (orgOverride && orgOverride.value !== undefined && orgOverride.value !== null) return orgOverride.value;
    return reg.default_value;
  }

  /** draft 우선, 없으면 effective */
  function getDraftOrEffective(key: string): unknown {
    if (key in draft.values) return draft.values[key];
    return getEffectiveValue(key);
  }

  /** 값 동등 비교 — key 순서 무관한 깊은 비교 */
  function valueEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (a == null || b == null) return a == b;
    if (typeof a !== typeof b) return false;
    if (typeof a !== "object") return a === b;
    // 정렬된 JSON 비교 (키 순서 무관)
    return JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));
  }
  function sortKeys(obj: unknown): unknown {
    if (obj === null || typeof obj !== "object") return obj;
    if (Array.isArray(obj)) return obj.map(sortKeys);
    return Object.keys(obj as Record<string, unknown>).sort().reduce((acc, k) => {
      (acc as Record<string, unknown>)[k] = sortKeys((obj as Record<string, unknown>)[k]);
      return acc;
    }, {} as Record<string, unknown>);
  }

  function queueChange(key: string, value: unknown) {
    setDraft((prev) => {
      const effective = getEffectiveValue(key);
      // schedule.range는 normalizeRange로 정규화 후 비교 (레거시 ↔ 새 포맷)
      const norm = (v: unknown) => key === "schedule.range" ? normalizeRange(v) : v;
      // 새 값이 effective와 같으면 draft에서 제거 (= 변경 없음으로 처리)
      if (valueEqual(norm(value), norm(effective))) {
        if (!(key in prev.values)) return prev; // 이미 없음
        const next = { ...prev.values };
        delete next[key];
        return { ...prev, values: next };
      }
      // 다르면 draft에 set (이미 같은 값이면 no-op)
      if (valueEqual(prev.values[key], value)) return prev;
      return { ...prev, values: { ...prev.values, [key]: value } };
    });
  }

  /** Force-queue a value even if it matches effective (for creating store overrides) */
  function forceQueueChange(key: string, value: unknown) {
    setDraft((prev) => {
      if (valueEqual(prev.values[key], value)) return prev;
      return { ...prev, values: { ...prev.values, [key]: value } };
    });
  }

  /** Queue a store-level key for deletion (revert to inherit) */
  function queueDeleteKey(key: string) {
    setDraft((prev) => {
      // Remove from values if queued there
      const nextValues = { ...prev.values };
      delete nextValues[key];
      // Only queue delete if store actually has an override on server
      const hasOverride = isOverridden(key);
      if (!hasOverride) {
        // No server override → just clean up draft, no delete needed
        return { ...prev, values: nextValues };
      }
      const nextDeleted = prev.deletedKeys.includes(key) ? prev.deletedKeys : [...prev.deletedKeys, key];
      return { ...prev, values: nextValues, deletedKeys: nextDeleted };
    });
  }

  /** Cancel a pending deletion (when switching back to custom) */
  function unqueueDeleteKey(key: string) {
    setDraft((prev) => {
      if (!prev.deletedKeys.includes(key)) return prev;
      return { ...prev, deletedKeys: prev.deletedKeys.filter((k) => k !== key) };
    });
  }

  function isOverridden(key: string): boolean {
    if (isStoreScope) return storeSettings.some((s) => s.key === key);
    return orgSettings.some((s) => s.key === key);
  }

  /** store scope 에서 org 레벨에 override 가 존재하는지 (3-state 배지 계산용) */
  function isOrgOverridden(key: string): boolean {
    return orgSettings.some((s) => s.key === key);
  }

  /** key가 draft 에서 delete 예약되었는지 (per-key inherit 배지/토글용) */
  function isPendingDelete(key: string): boolean {
    return draft.deletedKeys.includes(key);
  }

  function isLockedAtOrg(key: string): boolean {
    return orgSettings.find((s) => s.key === key)?.force_locked ?? false;
  }

  // ─── Save / Cancel ────────────────────────────────────
  // N개 설정을 한 번에 저장하므로 각 mutation 모달은 silent, 호출 측에서 통합 1번만 띄움
  const upsertOrg = useUpsertOrgSetting({ silent: true });
  const upsertStore = useUpsertStoreSetting(isStoreScope ? activeTab : "", { silent: true });
  const deleteStoreSetting = useDeleteStoreSetting(isStoreScope ? activeTab : "", { silent: true });

  const isDirty = Object.keys(draft.values).length > 0 || draft.deletedKeys.length > 0;

  // beforeunload: 탭/브라우저 종료, 뒤로가기, 새로고침 등으로 페이지를 떠날 때 경고
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [isDirty]);

  /** 해당 key가 draft에서 변경되었는지 */
  function isChanged(key: string): boolean {
    return key in draft.values || draft.deletedKeys.includes(key);
  }
  const isSaving = upsertOrg.isPending || upsertStore.isPending || deleteStoreSetting.isPending;

  function toMinutes(hhmm: string): number {
    const [h, m] = hhmm.split(":").map(Number);
    return (h || 0) * 60 + (m || 0);
  }

  async function handleSave() {
    // schedule.range start >= end validation
    const rangeValue = draft.values["schedule.range"] as Record<string, { start: string; end: string }> | undefined;
    if (rangeValue) {
      for (const [key, entry] of Object.entries(rangeValue)) {
        if (entry && typeof entry === "object" && "start" in entry && "end" in entry) {
          if (toMinutes(entry.start) >= toMinutes(entry.end)) {
            void modal.alert({
              type: "error",
              title: "Couldn't save settings",
              message: `Schedule Range: Start must be before End (${key === "all" ? "all days" : key}).`,
            });
            return;
          }
        }
      }
    }
    try {
      // values flush
      for (const [key, value] of Object.entries(draft.values)) {
        if (isStoreScope && activeTab) {
          await upsertStore.mutateAsync({ key, value });
        } else {
          await upsertOrg.mutateAsync({ key, value });
        }
      }

      // delete store-level settings (revert to inherit)
      if (isStoreScope) {
        for (const key of draft.deletedKeys) {
          await deleteStoreSetting.mutateAsync(key);
        }
      }

      setDraft(EMPTY_DRAFT);
      void modal.alert({ type: "success", message: "Settings saved." });
    } catch (err) {
      void modal.alert({ type: "error", message: parseApiError(err, "Couldn't save settings") });
    }
  }

  function handleCancel() {
    setDraft(EMPTY_DRAFT);
  }

  return (
    <div className="pb-24">
      {/* Header */}
      <div className="flex items-center gap-3 py-4">
        <button
          type="button"
          onClick={onBack}
          className="w-8 h-8 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] flex items-center justify-center text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]"
          aria-label="Back to schedules"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="9 11 5 7 9 3" /></svg>
        </button>
        <div className="flex-1">
          <h1 className="text-[22px] font-semibold text-[var(--color-text)]">Schedule Settings</h1>
          <p className="text-[12px] text-[var(--color-text-muted)]">Configure scheduling rules and store-level resources</p>
        </div>
      </div>

      {/* Settings Registry hint */}
      <div className="flex items-start gap-2 px-4 py-3 mb-4 bg-[var(--color-info-muted)] rounded-xl text-[12px] text-[var(--color-info)]">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="mt-0.5 shrink-0"><circle cx="8" cy="8" r="6" /><line x1="8" y1="6" x2="8" y2="8" /><circle cx="8" cy="10.5" r="0.5" fill="currentColor" /></svg>
        <div>
          <div className="font-semibold mb-0.5">Org → Store override</div>
          <div className="leading-relaxed">
            Each setting inherits from Organization unless overridden at Store level. Org may <strong>force-lock</strong> a setting to prevent any Store-level override.
          </div>
        </div>
      </div>

      {/* Level tabs — scrollable with truncated names */}
      <div className="relative mb-5 max-w-full">
        <div className="flex gap-1 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-0.5 overflow-x-auto scrollbar-thin scrollbar-thumb-[var(--color-border)] scrollbar-track-transparent">
          <button
            type="button"
            onClick={() => handleTabChange("org")}
            className={`px-3.5 py-1.5 rounded-md text-[13px] font-medium transition-all whitespace-nowrap shrink-0 ${activeTab === "org" ? "bg-[var(--color-accent)] text-white" : "text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"}`}
          >
            Organization
          </button>
          {stores.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => handleTabChange(s.id)}
              title={s.name}
              className={`px-3.5 py-1.5 rounded-md text-[13px] font-medium transition-all whitespace-nowrap shrink-0 max-w-[160px] truncate ${activeTab === s.id ? "bg-[var(--color-accent)] text-white" : "text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"}`}
            >
              {s.name}
            </button>
          ))}
        </div>
      </div>

      {registryQ.isLoading && (
        <div className="text-[12px] text-[var(--color-text-muted)] italic py-8 text-center">Loading…</div>
      )}

      {/* Sections */}
      <div className="space-y-3">
        <WorkHourAlertsSection
          getValue={getDraftOrEffective}
          queueChange={queueChange}
          forceQueueChange={forceQueueChange}
          queueDeleteKey={queueDeleteKey}
          unqueueDeleteKey={unqueueDeleteKey}
          isOverridden={isOverridden}
          isOrgOverridden={isOrgOverridden}
          isPendingDelete={isPendingDelete}
          isLocked={isLockedAtOrg}
          isChanged={isChanged}
          scope={isStoreScope ? "store" : "org"}
          storeId={isStoreScope ? activeTab : undefined}
        />

        <WeeklyLimitsSection
          getValue={getDraftOrEffective}
          queueChange={queueChange}
          forceQueueChange={forceQueueChange}
          queueDeleteKey={queueDeleteKey}
          unqueueDeleteKey={unqueueDeleteKey}
          isOverridden={isOverridden}
          isOrgOverridden={isOrgOverridden}
          isPendingDelete={isPendingDelete}
          isLocked={isLockedAtOrg}
          isChanged={isChanged}
          scope={isStoreScope ? "store" : "org"}
          storeId={isStoreScope ? activeTab : undefined}
        />

        <ApprovalSection
          getValue={getDraftOrEffective}
          queueChange={queueChange}
          forceQueueChange={forceQueueChange}
          queueDeleteKey={queueDeleteKey}
          unqueueDeleteKey={unqueueDeleteKey}
          isOverridden={isOverridden}
          isOrgOverridden={isOrgOverridden}
          isPendingDelete={isPendingDelete}
          isLocked={isLockedAtOrg}
          isChanged={isChanged}
          scope={isStoreScope ? "store" : "org"}
          storeId={isStoreScope ? activeTab : undefined}
        />

        <WorkRulesSection
          getValue={getDraftOrEffective}
          queueChange={queueChange}
          forceQueueChange={forceQueueChange}
          queueDeleteKey={queueDeleteKey}
          unqueueDeleteKey={unqueueDeleteKey}
          isOverridden={isOverridden}
          isOrgOverridden={isOrgOverridden}
          isPendingDelete={isPendingDelete}
          isLocked={isLockedAtOrg}
          isChanged={isChanged}
          scope={isStoreScope ? "store" : "org"}
          storeId={isStoreScope ? activeTab : undefined}
        />

        <AttendanceSettingsSection
          getValue={getDraftOrEffective}
          queueChange={queueChange}
          forceQueueChange={forceQueueChange}
          queueDeleteKey={queueDeleteKey}
          unqueueDeleteKey={unqueueDeleteKey}
          isOverridden={isOverridden}
          isOrgOverridden={isOrgOverridden}
          isPendingDelete={isPendingDelete}
          isLocked={isLockedAtOrg}
          isChanged={isChanged}
          scope={isStoreScope ? "store" : "org"}
          storeId={isStoreScope ? activeTab : undefined}
        />

        {/* Operating Hours — 매장 영업시간(요일별 + 휴무일). registry 에 키가 있을 때만 그린다. */}
        <OperatingHoursSection
          available={registryByKey.has(OPERATING_HOURS_KEY)}
          getValue={getDraftOrEffective}
          queueChange={queueChange}
          forceQueueChange={forceQueueChange}
          queueDeleteKey={queueDeleteKey}
          unqueueDeleteKey={unqueueDeleteKey}
          isOverridden={isOverridden}
          isOrgOverridden={isOrgOverridden}
          isPendingDelete={isPendingDelete}
          isLocked={isLockedAtOrg}
          isChanged={isChanged}
          scope={isStoreScope ? "store" : "org"}
          storeId={isStoreScope ? activeTab : undefined}
        />

        <ScheduleRangeSection
          getValue={getDraftOrEffective}
          queueChange={queueChange}
          isOverridden={isOverridden}
          isOrgOverridden={isOrgOverridden}
          isPendingDelete={isPendingDelete}
          isLocked={isLockedAtOrg}
          isChanged={isChanged}
          scope={isStoreScope ? "store" : "org"}
          storeId={isStoreScope ? activeTab : undefined}
          forceQueueChange={forceQueueChange}
          queueDeleteKey={queueDeleteKey}
          unqueueDeleteKey={unqueueDeleteKey}
        />

        {/* Work Roles — store level */}
        {isStoreScope && activeStore && (
          <Card title="Work Roles" subtitle="Shift × Position combinations with required headcount per day">
            <WorkRolesPanel storeId={activeTab} />
          </Card>
        )}
      </div>

      {/* Sticky save bar */}
      {isDirty && (
        <div className="fixed bottom-0 left-0 right-0 xl:left-[220px] z-40 bg-[var(--color-surface)] border-t border-[var(--color-border)] shadow-[0_-4px_16px_rgba(0,0,0,0.06)]">
          <div className="px-4 sm:px-6 xl:px-8 py-3 flex items-center justify-between gap-3">
            <span className="text-[12px] text-[var(--color-text-secondary)]">
              <strong className="text-[var(--color-warning)]">{Object.keys(draft.values).length + draft.deletedKeys.length}</strong> unsaved change{(Object.keys(draft.values).length + draft.deletedKeys.length) === 1 ? "" : "s"}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCancel}
                disabled={isSaving}
                className="px-4 py-2 rounded-lg text-[13px] font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={isSaving}
                className="px-5 py-2 rounded-lg text-[13px] font-semibold bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

// ─── Reusable Card wrapper ───────────────────────────────

interface CardProps {
  title: string;
  subtitle?: string;
  locked?: boolean;
  /** 섹션 내 모든 커스텀 key를 한 번에 inherit으로 되돌리는 벌크 액션 (개별 key 토글과 별개) */
  onResetSection?: () => void;
  children: React.ReactNode;
}

function Card({ title, subtitle, locked, onResetSection, children }: CardProps) {
  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-[var(--color-border)] bg-[var(--color-bg)]/50 flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-[13px] font-bold text-[var(--color-text)]">{title}</h2>
            {locked && (
              <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-[var(--color-danger-muted)] text-[var(--color-danger)]">
                Locked by Org
              </span>
            )}
          </div>
          {subtitle && <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">{subtitle}</p>}
        </div>
        {onResetSection && !locked && (
          <button
            type="button"
            onClick={onResetSection}
            className="shrink-0 text-[11px] font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-accent)] transition-colors"
            title="Reset every setting in this section back to inherited"
          >
            Reset section to inherited
          </button>
        )}
      </div>
      <div className="px-5 py-4">{children}</div>
    </div>
  );
}

// ─── Section base ────────────────────────────────────────

interface SectionCommonProps {
  getValue: (key: string) => unknown;
  queueChange: (key: string, value: unknown) => void;
  forceQueueChange: (key: string, value: unknown) => void;
  queueDeleteKey: (key: string) => void;
  unqueueDeleteKey: (key: string) => void;
  isOverridden: (key: string) => boolean;
  /** store scope에서만 의미 있음: org 레벨에 override가 있는지 (3-state 배지) */
  isOrgOverridden: (key: string) => boolean;
  /** key가 draft에서 delete 예약(= inherit로 되돌리기 대기) 상태인지 */
  isPendingDelete: (key: string) => boolean;
  isLocked: (key: string) => boolean;
  isChanged: (key: string) => boolean;
  scope: "org" | "store";
  storeId?: string;
}

/** 변경된 input 필드: 왼쪽 accent bar 표시 */
function ChangedMark({ changed, children }: { changed: boolean; children: React.ReactNode }) {
  if (!changed) return <>{children}</>;
  return (
    <div className="relative">
      <div className="absolute -left-2 top-1 bottom-1 w-[3px] rounded-full bg-[var(--color-accent)]" />
      {children}
    </div>
  );
}

/** localStorage key for preserving custom values when switching to Inherit. scopeId: storeId 또는 "org" */
function customCacheKey(scopeId: string, settingKey: string): string {
  return `schedSettings:${scopeId}:${settingKey}`;
}

function scopeCacheId(props: SectionCommonProps): string | undefined {
  return props.scope === "store" ? props.storeId : "org";
}

/** 값 존재 여부(row presence) 기준 — value 동등성과 무관하게 custom 여부를 판단.
 * draft에 pending delete가 있으면 저장 시 inherit으로 전환될 예정 → 즉시 inherited로 표시.
 * draft에 pending value(server override 없이)가 있으면 저장 시 custom row가 생길 예정 → 즉시 custom으로 표시.
 */
function isEffectivelyCustom(props: SectionCommonProps, key: string): boolean {
  if (props.isPendingDelete(key)) return false;
  if (props.isOverridden(key)) return true;
  return props.isChanged(key);
}

/** Per-key: custom → inherit. 되돌릴 수 있도록 현재 값을 localStorage에 보존 후 delete 큐잉 */
function makeKeyInherited(props: SectionCommonProps, key: string, currentValue: unknown) {
  const scopeId = scopeCacheId(props);
  if (scopeId && currentValue !== undefined && currentValue !== null) {
    localStorage.setItem(customCacheKey(scopeId, key), JSON.stringify(currentValue));
  }
  props.queueDeleteKey(key);
}

/** Per-key: inherit → custom. localStorage에 보존된 값이 있으면 복원, 없으면 현재 effective 값을 그대로 사용 */
function makeKeyCustom(props: SectionCommonProps, key: string, currentValue: unknown) {
  props.unqueueDeleteKey(key);
  const scopeId = scopeCacheId(props);
  const cached = scopeId ? localStorage.getItem(customCacheKey(scopeId, key)) : null;
  const value = cached ? JSON.parse(cached) : currentValue;
  if (value !== undefined && value !== null) {
    props.forceQueueChange(key, value);
  }
}

/** 섹션 전체를 한 번에 inherit으로 되돌리는 벌크 액션 — Card 헤더의 "Reset section" 버튼용 */
function resetSectionToInherited(props: SectionCommonProps, keys: string[]) {
  keys.forEach((key) => {
    if (isEffectivelyCustom(props, key)) {
      makeKeyInherited(props, key, props.getValue(key));
    }
  });
}

/** Per-key source badge + inherit/customize 토글. Locked 상태에선 토글 숨김(읽기 전용) */
function SourceBadge({ props, fieldKey }: { props: SectionCommonProps; fieldKey: string }) {
  // Inherit/Custom 은 store 전용 개념 — org 는 최상위(위에서 상속받을 값이 없고,
  // "inherited" = registry default 일 뿐)라 배지/토글을 표시하지 않는다.
  if (props.scope !== "store") return null;

  const custom = isEffectivelyCustom(props, fieldKey);
  const locked = props.isLocked(fieldKey);
  // 회사(org) 입장에선 org 세팅값이 곧 "기본값"이다. 상속 출처(org 행이냐 registry
  // default냐)는 매장 관점에서 무의미 — "커스텀했나 / 회사 기본을 따르나" 2가지로 충분.
  const label = custom ? "Custom" : "Inherited";

  return (
    <span className="inline-flex items-center gap-1.5 shrink-0">
      <span
        className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded whitespace-nowrap ${
          custom ? "bg-[var(--color-accent-muted)] text-[var(--color-accent)]" : "bg-[var(--color-bg)] text-[var(--color-text-muted)]"
        }`}
      >
        {label}
      </span>
      {!locked && (
        <button
          type="button"
          onClick={() => (custom ? makeKeyInherited(props, fieldKey, props.getValue(fieldKey)) : makeKeyCustom(props, fieldKey, props.getValue(fieldKey)))}
          className="text-[9px] font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-accent)] underline underline-offset-2 whitespace-nowrap"
          title={custom ? "Revert to inherited value" : "Override at this level"}
        >
          {custom ? "Inherit" : "Customize"}
        </button>
      )}
    </span>
  );
}

// ─── 1. Work Hour Alerts ─────────────────────────────────

function WorkHourAlertsSection(props: SectionCommonProps) {
  const NORMAL_KEY = "schedule.work_hour_alert.normal_max";
  const CAUTION_KEY = "schedule.work_hour_alert.caution_max";
  const MAX_SHIFT_KEY = "schedule.max_shift_hours";

  const normalMax = Number(props.getValue(NORMAL_KEY) ?? 5.5);
  const cautionMax = Number(props.getValue(CAUTION_KEY) ?? 7.5);
  const maxShiftHours = Number(props.getValue(MAX_SHIFT_KEY) ?? 16);

  const SECTION_KEYS = [NORMAL_KEY, CAUTION_KEY, MAX_SHIFT_KEY];
  const locked = props.isLocked(NORMAL_KEY) || props.isLocked(CAUTION_KEY) || props.isLocked(MAX_SHIFT_KEY);
  const hasAnyCustom = SECTION_KEYS.some((k) => isEffectivelyCustom(props, k));

  const normalPct = Math.min(100, (normalMax / 12) * 100);
  const cautionPct = Math.min(100 - normalPct, Math.max(0, (cautionMax - normalMax) / 12) * 100);

  // 양방향 0.5h GAP
  const GAP = 0.5;
  function handleNormalChange(value: number) {
    const v = Math.max(0, Math.min(12 - GAP, value));
    props.queueChange(NORMAL_KEY, v);
    if (cautionMax < v + GAP) props.queueChange(CAUTION_KEY, v + GAP);
  }
  function handleCautionChange(value: number) {
    const v = Math.max(GAP, Math.min(12, value));
    props.queueChange(CAUTION_KEY, v);
    if (normalMax > v - GAP) props.queueChange(NORMAL_KEY, v - GAP);
  }

  return (
    <Card
      title="Work Hour Alerts"
      subtitle="Color thresholds for daily work hours"
      locked={locked}
      onResetSection={props.scope === "store" && hasAnyCustom ? () => resetSectionToInherited(props, SECTION_KEYS) : undefined}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-4">
          <ChangedMark changed={props.isChanged(NORMAL_KEY)}>
            <div>
              <label className="text-[12px] font-medium text-[var(--color-success)] mb-1.5 flex items-center justify-between gap-1.5">
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-[var(--color-success)]" />
                  Normal (Green)
                </span>
                <SourceBadge props={props} fieldKey={NORMAL_KEY} />
              </label>
              <div className="flex items-center gap-2">
                <span className="text-[13px] text-[var(--color-text-secondary)]">Up to</span>
                <input
                  type="number"
                  value={normalMax}
                  step="0.5"
                  min="0"
                  max="11.5"
                  disabled={locked}
                  onChange={(e) => handleNormalChange(Number(e.target.value))}
                  className="w-20 px-3 py-1.5 border border-[var(--color-border)] rounded-lg text-[13px] text-center disabled:opacity-50"
                />
                <span className="text-[13px] text-[var(--color-text-secondary)]">hours</span>
              </div>
            </div>
          </ChangedMark>
          <ChangedMark changed={props.isChanged(CAUTION_KEY)}>
            <div>
              <label className="text-[12px] font-medium text-[var(--color-warning)] mb-1.5 flex items-center justify-between gap-1.5">
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-[var(--color-warning)]" />
                  Caution (Orange)
                </span>
                <SourceBadge props={props} fieldKey={CAUTION_KEY} />
              </label>
              <div className="flex items-center gap-2">
                <span className="text-[13px] text-[var(--color-text-secondary)]">Up to</span>
                <input
                  type="number"
                  value={cautionMax}
                  step="0.5"
                  min="0.5"
                  max="12"
                  disabled={locked}
                  onChange={(e) => handleCautionChange(Number(e.target.value))}
                  className="w-20 px-3 py-1.5 border border-[var(--color-border)] rounded-lg text-[13px] text-center disabled:opacity-50"
                />
                <span className="text-[13px] text-[var(--color-text-secondary)]">hours</span>
              </div>
            </div>
          </ChangedMark>
          <div>
            <label className="text-[12px] font-medium text-[var(--color-danger)] mb-1.5 flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-[var(--color-danger)]" />
              Overtime (Red)
            </label>
            <div className="text-[13px] text-[var(--color-text-muted)] pt-2">Above {cautionMax} hours</div>
          </div>
        </div>
        <div>
          <div className="text-[11px] font-medium text-[var(--color-text-muted)] mb-2">Preview</div>
          <div className="flex h-3 rounded-full overflow-hidden">
            <div className="bg-[var(--color-success)] transition-[width] duration-150" style={{ width: `${normalPct}%` }} />
            <div className="bg-[var(--color-warning)] transition-[width] duration-150" style={{ width: `${cautionPct}%` }} />
            <div className="bg-[var(--color-danger)] flex-1" />
          </div>
          <div className="relative h-4 mt-1">
            <span className="absolute left-0 text-[10px] text-[var(--color-text-muted)]">0h</span>
            <span className="absolute text-[10px] text-[var(--color-text-muted)]" style={{ left: `${normalPct}%`, transform: "translateX(-50%)" }}>{normalMax}h</span>
            <span className="absolute text-[10px] text-[var(--color-text-muted)]" style={{ left: `${normalPct + cautionPct}%`, transform: "translateX(-50%)" }}>{cautionMax}h</span>
            <span className="absolute right-0 text-[10px] text-[var(--color-text-muted)]">12h+</span>
          </div>
        </div>
        <ChangedMark changed={props.isChanged(MAX_SHIFT_KEY)}>
          <div className="pt-2 border-t border-[var(--color-border)]">
            <label className="text-[12px] font-medium text-[var(--color-text)] mb-1.5 flex items-center justify-between gap-1.5">
              Max shift duration warning
              <SourceBadge props={props} fieldKey={MAX_SHIFT_KEY} />
            </label>
            <div className="flex items-center gap-2">
              <span className="text-[13px] text-[var(--color-text-secondary)]">Shifts longer than</span>
              <input
                type="number"
                value={maxShiftHours}
                step="0.5"
                min="0"
                max="24"
                disabled={locked}
                onChange={(e) => props.queueChange(MAX_SHIFT_KEY, Number(e.target.value))}
                className="w-20 px-3 py-1.5 border border-[var(--color-border)] rounded-lg text-[13px] text-center disabled:opacity-50"
              />
              <span className="text-[13px] text-[var(--color-text-secondary)]">hours require confirmation before saving</span>
            </div>
          </div>
        </ChangedMark>
      </div>
    </Card>
  );
}

// ─── 2. Weekly Limits ────────────────────────────────────

function WeeklyLimitsSection(props: SectionCommonProps) {
  const LIMIT_KEY = "schedule.weekly_hour_limit";
  const WARN_KEY = "schedule.weekly_hour_warning";

  const limit = Number(props.getValue(LIMIT_KEY) ?? 40);
  const warn = Number(props.getValue(WARN_KEY) ?? 35);

  const SECTION_KEYS = [LIMIT_KEY, WARN_KEY];
  const locked = props.isLocked(LIMIT_KEY) || props.isLocked(WARN_KEY);
  const hasAnyCustom = SECTION_KEYS.some((k) => isEffectivelyCustom(props, k));

  // 양방향 1h GAP
  const GAP = 1;
  function handleLimitChange(value: number) {
    const v = Math.max(1 + GAP, Math.min(168, value));
    props.queueChange(LIMIT_KEY, v);
    if (warn > v - GAP) props.queueChange(WARN_KEY, v - GAP);
  }
  function handleWarnChange(value: number) {
    const v = Math.max(0, Math.min(168 - GAP, value));
    props.queueChange(WARN_KEY, v);
    if (limit < v + GAP) props.queueChange(LIMIT_KEY, v + GAP);
  }

  return (
    <Card
      title="Weekly Hour Limits"
      subtitle="Maximum hours and overtime thresholds"
      locked={locked}
      onResetSection={props.scope === "store" && hasAnyCustom ? () => resetSectionToInherited(props, SECTION_KEYS) : undefined}
    >
      <div className="space-y-4">
        <ChangedMark changed={props.isChanged(LIMIT_KEY)}>
          <div>
            <label className="text-[12px] font-medium text-[var(--color-text-secondary)] mb-1.5 flex items-center justify-between gap-1.5">
              Max weekly hours
              <SourceBadge props={props} fieldKey={LIMIT_KEY} />
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={limit}
                min="2"
                max="168"
                disabled={locked}
                onChange={(e) => handleLimitChange(Number(e.target.value))}
                className="w-20 px-3 py-1.5 border border-[var(--color-border)] rounded-lg text-[13px] text-center disabled:opacity-50"
              />
              <span className="text-[13px] text-[var(--color-text-muted)]">hours</span>
            </div>
          </div>
        </ChangedMark>
        <ChangedMark changed={props.isChanged(WARN_KEY)}>
          <div>
            <label className="text-[12px] font-medium text-[var(--color-text-secondary)] mb-1.5 flex items-center justify-between gap-1.5">
              Warning threshold
              <SourceBadge props={props} fieldKey={WARN_KEY} />
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={warn}
                min="0"
                max="167"
                disabled={locked}
                onChange={(e) => handleWarnChange(Number(e.target.value))}
                className="w-20 px-3 py-1.5 border border-[var(--color-border)] rounded-lg text-[13px] text-center disabled:opacity-50"
              />
              <span className="text-[13px] text-[var(--color-text-muted)]">hours</span>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-[var(--color-warning-muted)] text-[var(--color-warning)]">Warning only</span>
            </div>
          </div>
        </ChangedMark>
      </div>
    </Card>
  );
}

// ─── 3. Approval Workflow ────────────────────────────────

function ApprovalSection(props: SectionCommonProps) {
  const REQ_KEY = "schedule.approval_required";
  const AUTO_KEY = "schedule.auto_confirm_drafts";

  const required = Boolean(props.getValue(REQ_KEY));
  const autoConfirm = Boolean(props.getValue(AUTO_KEY));

  const SECTION_KEYS = [REQ_KEY, AUTO_KEY];
  const locked = props.isLocked(REQ_KEY) || props.isLocked(AUTO_KEY);
  const hasAnyCustom = SECTION_KEYS.some((k) => isEffectivelyCustom(props, k));

  return (
    <Card
      title="Approval Workflow"
      subtitle="Schedule approval requirements"
      locked={locked}
      onResetSection={props.scope === "store" && hasAnyCustom ? () => resetSectionToInherited(props, SECTION_KEYS) : undefined}
    >
      <div className="divide-y divide-[var(--color-border)]">
        <ChangedMark changed={props.isChanged(REQ_KEY)}>
          <ToggleRow
            label="Require GM approval"
            description="All requested schedules need GM confirmation before activating"
            value={required}
            locked={locked}
            onChange={(v) => props.queueChange(REQ_KEY, v)}
            badge={<SourceBadge props={props} fieldKey={REQ_KEY} />}
          />
        </ChangedMark>
        <ChangedMark changed={props.isChanged(AUTO_KEY)}>
          <ToggleRow
            label="Auto-confirm SV drafts"
            description="Automatically confirm schedules created in draft mode by SV+ users"
            value={autoConfirm}
            locked={locked}
            onChange={(v) => props.queueChange(AUTO_KEY, v)}
            badge={<SourceBadge props={props} fieldKey={AUTO_KEY} />}
          />
        </ChangedMark>
      </div>
    </Card>
  );
}

function ToggleRow({ label, description, value, locked, onChange, badge }: { label: string; description: string; value: boolean; locked?: boolean; onChange: (v: boolean) => void; badge?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-3 gap-3">
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <div className="text-[13px] font-medium text-[var(--color-text)]">{label}</div>
          {badge}
        </div>
        <div className="text-[11px] text-[var(--color-text-muted)] mt-0.5">{description}</div>
      </div>
      <button
        type="button"
        disabled={locked}
        onClick={() => onChange(!value)}
        className={`relative w-10 h-[22px] rounded-full transition-colors duration-150 shrink-0 ${value ? "bg-[var(--color-accent)]" : "bg-[var(--color-border)]"} ${locked ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
      >
        <span className={`absolute top-[3px] w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-150 ${value ? "left-[22px]" : "left-[3px]"}`} />
      </button>
    </div>
  );
}

// ─── 4. Break Rules ──────────────────────────────────────

function WorkRulesSection(props: SectionCommonProps) {
  const SHIFT_DURATION_KEY = "work.default_schedule_duration_minutes";
  const BREAK_DURATION_KEY = "break.duration_minutes";

  const shiftDuration = Number(props.getValue(SHIFT_DURATION_KEY) ?? 330);
  const breakDuration = Number(props.getValue(BREAK_DURATION_KEY) ?? 30);

  const SECTION_KEYS = [SHIFT_DURATION_KEY, BREAK_DURATION_KEY];
  const locked = props.isLocked(SHIFT_DURATION_KEY) || props.isLocked(BREAK_DURATION_KEY);
  const hasAnyCustom = SECTION_KEYS.some((k) => isEffectivelyCustom(props, k));

  function handleShiftDurationChange(value: number) {
    // 입력 단위는 5분 하나(D6-1) — 여기서만 30분으로 남겨두면 설정에서 만든 기본 길이가
    // 등록 폼의 grid 검증에 걸린다.
    props.queueChange(SHIFT_DURATION_KEY, Math.max(SCHEDULE_STEP_MINUTES, Math.min(1440, value)));
  }
  function handleBreakDurationChange(value: number) {
    props.queueChange(BREAK_DURATION_KEY, Math.max(1, Math.min(480, value)));
  }

  return (
    <Card
      title="Default Shift Length"
      subtitle="Default shift duration used for walk-in clock-ins (walk-in start = actual clock-in time) and quick add"
      locked={locked}
      onResetSection={props.scope === "store" && hasAnyCustom ? () => resetSectionToInherited(props, SECTION_KEYS) : undefined}
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ChangedMark changed={props.isChanged(SHIFT_DURATION_KEY)}>
          <div>
            <label className="text-[12px] font-medium text-[var(--color-text-secondary)] mb-1.5 flex items-center justify-between gap-1.5">
              Default schedule duration
              <SourceBadge props={props} fieldKey={SHIFT_DURATION_KEY} />
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={shiftDuration}
                min={SCHEDULE_STEP_MINUTES}
                max="1440"
                step={SCHEDULE_STEP_MINUTES}
                disabled={locked}
                onChange={(e) => handleShiftDurationChange(Number(e.target.value))}
                className="w-20 px-3 py-1.5 border border-[var(--color-border)] rounded-lg text-[13px] text-center disabled:opacity-50"
              />
              <span className="text-[13px] text-[var(--color-text-muted)]">min</span>
              {shiftDuration >= 60 && <span className="text-[11px] text-[var(--color-text-muted)]">= {Math.floor(shiftDuration / 60)}h {shiftDuration % 60 > 0 ? `${shiftDuration % 60}m` : ""}</span>}
            </div>
          </div>
        </ChangedMark>
        <ChangedMark changed={props.isChanged(BREAK_DURATION_KEY)}>
          <div>
            <label className="text-[12px] font-medium text-[var(--color-text-secondary)] mb-1.5 flex items-center justify-between gap-1.5">
              Default break
              <SourceBadge props={props} fieldKey={BREAK_DURATION_KEY} />
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={breakDuration}
                min="1"
                max="480"
                disabled={locked}
                onChange={(e) => handleBreakDurationChange(Number(e.target.value))}
                className="w-20 px-3 py-1.5 border border-[var(--color-border)] rounded-lg text-[13px] text-center disabled:opacity-50"
              />
              <span className="text-[13px] text-[var(--color-text-muted)]">min</span>
              {breakDuration >= 60 && <span className="text-[11px] text-[var(--color-text-muted)]">= {Math.floor(breakDuration / 60)}h {breakDuration % 60 > 0 ? `${breakDuration % 60}m` : ""}</span>}
            </div>
          </div>
        </ChangedMark>
      </div>
    </Card>
  );
}

// ─── 5. Attendance ───────────────────────────────────────

function AttendanceSettingsSection(props: SectionCommonProps) {
  const LATE_KEY = "attendance.late_buffer_minutes";
  const EARLY_LEAVE_KEY = "attendance.early_leave_threshold_minutes";
  const EARLY_IN_KEY = "attendance.early_clock_in_threshold_minutes";
  const AUTO_OUT_ENABLED_KEY = "attendance.auto_clock_out_enabled";
  const AUTO_OUT_KEY = "attendance.auto_clock_out_after_minutes";
  const ALERT_INT_KEY = "attendance.alert_interval_minutes";
  const WALK_IN_ALLOWED_KEY = "attendance.walk_in_allowed";
  const TIP_ENTRY_KEY = "attendance.tip_entry_enabled";

  const lateBuffer = Number(props.getValue(LATE_KEY) ?? 5);
  const earlyLeave = Number(props.getValue(EARLY_LEAVE_KEY) ?? 5);
  const earlyClockIn = Number(props.getValue(EARLY_IN_KEY) ?? 5);
  const autoClockOutEnabled = props.getValue(AUTO_OUT_ENABLED_KEY);
  // default true: registry default가 true (undefined면 ON으로 간주)
  const autoOutOn = autoClockOutEnabled === undefined || autoClockOutEnabled === null ? true : Boolean(autoClockOutEnabled);
  const autoClockOut = Number(props.getValue(AUTO_OUT_KEY) ?? 30);
  const alertInterval = Number(props.getValue(ALERT_INT_KEY) ?? 10);
  const walkInAllowed = Boolean(props.getValue(WALK_IN_ALLOWED_KEY));
  // registry default가 false — undefined면 OFF로 간주.
  const tipEntryEnabled = Boolean(props.getValue(TIP_ENTRY_KEY));

  const allKeys = [LATE_KEY, EARLY_LEAVE_KEY, EARLY_IN_KEY, AUTO_OUT_ENABLED_KEY, AUTO_OUT_KEY, ALERT_INT_KEY, WALK_IN_ALLOWED_KEY, TIP_ENTRY_KEY];
  const locked = allKeys.some((k) => props.isLocked(k));
  const hasAnyCustom = allKeys.some((k) => isEffectivelyCustom(props, k));

  const renderField = (
    key: string,
    label: string,
    value: number,
    suffix: string,
    max: number,
    hint?: string,
  ) => (
    <ChangedMark changed={props.isChanged(key)}>
      <div>
        <label className="text-[12px] font-medium text-[var(--color-text-secondary)] mb-1.5 flex items-center justify-between gap-1.5">
          {label}
          <SourceBadge props={props} fieldKey={key} />
        </label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            value={value}
            min="0"
            max={max}
            disabled={locked}
            onChange={(e) =>
              props.queueChange(key, Math.max(0, Math.min(max, Number(e.target.value))))
            }
            className="w-20 px-3 py-1.5 border border-[var(--color-border)] rounded-lg text-[13px] text-center disabled:opacity-50"
          />
          <span className="text-[13px] text-[var(--color-text-muted)]">{suffix}</span>
        </div>
        {hint && (
          <p className="text-[11px] text-[var(--color-text-muted)] mt-1">{hint}</p>
        )}
      </div>
    </ChangedMark>
  );

  const subheader = (text: string) => (
    <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-text-muted)] mt-1 mb-2">
      {text}
    </div>
  );

  return (
    <Card
      title="Attendance"
      subtitle="Clock-in/out tolerances, auto-completion, and overdue alerts"
      locked={locked}
      onResetSection={props.scope === "store" && hasAnyCustom ? () => resetSectionToInherited(props, allKeys) : undefined}
    >
      <div className="space-y-5">
        <div>
          {subheader("Clock-in")}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {renderField(EARLY_IN_KEY, "Early clock-in window", earlyClockIn, "min before start", 120,
              "How early staff are allowed to clock in. Earlier attempts are rejected.")}
            {renderField(LATE_KEY, "Late buffer", lateBuffer, "min after start", 120,
              "Grace period before clock-in is marked late.")}
          </div>
        </div>
        <div>
          {subheader("Clock-out")}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-1">
            {renderField(EARLY_LEAVE_KEY, "Early clock-out threshold", earlyLeave, "min before end", 120,
              "Clock-out earlier than this requires a reason and is flagged as early.")}
          </div>
          {subheader("Auto Clock-out")}
          <div className="border-t border-[var(--color-border)] pt-1">
            <ChangedMark changed={props.isChanged(AUTO_OUT_ENABLED_KEY)}>
              <ToggleRow
                label="Auto clock-out"
                description="Close shifts left open after the scheduled end. Turn off to leave them for manual review."
                value={autoOutOn}
                locked={locked}
                onChange={(v) => props.queueChange(AUTO_OUT_ENABLED_KEY, v)}
                badge={<SourceBadge props={props} fieldKey={AUTO_OUT_ENABLED_KEY} />}
              />
            </ChangedMark>
            <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 mt-2 ${autoOutOn ? "" : "opacity-50 pointer-events-none"}`}>
              {renderField(AUTO_OUT_KEY, "Auto clock-out delay", autoClockOut, "min after end", 1440,
                "Forgot-to-clock-out → auto closed at scheduled end + this delay.")}
            </div>
          </div>
        </div>
        <div>
          {subheader("Walk-in")}
          <div className="border-t border-[var(--color-border)] pt-1">
            <ChangedMark changed={props.isChanged(WALK_IN_ALLOWED_KEY)}>
              <ToggleRow
                label="Allow walk-in clock-in"
                description="When off, staff without a schedule for today are blocked at the kiosk (current behavior)."
                value={walkInAllowed}
                locked={locked}
                onChange={(v) => props.queueChange(WALK_IN_ALLOWED_KEY, v)}
                badge={<SourceBadge props={props} fieldKey={WALK_IN_ALLOWED_KEY} />}
              />
            </ChangedMark>
            <p className="text-[11px] text-[var(--color-text-muted)] mt-1">
              Walk-in start = actual clock-in time; end = clock-in + default shift duration.
            </p>
          </div>
        </div>
        <div>
          {subheader("Tips")}
          <div className="border-t border-[var(--color-border)] pt-1">
            <ChangedMark changed={props.isChanged(TIP_ENTRY_KEY)}>
              <ToggleRow
                label="Tip entry on clock-out"
                description="Ask staff to record tips when they clock out at the kiosk. When off, clock-out finishes without the tip screen."
                value={tipEntryEnabled}
                locked={locked}
                onChange={(v) => props.queueChange(TIP_ENTRY_KEY, v)}
                badge={<SourceBadge props={props} fieldKey={TIP_ENTRY_KEY} />}
              />
            </ChangedMark>
            <p className="text-[11px] text-[var(--color-text-muted)] mt-1">
              Applies to every kiosk device in the store. Managers can also change this from the kiosk (Manage → Store Settings).
            </p>
          </div>
        </div>
        <div>
          {subheader("Alerts")}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {renderField(ALERT_INT_KEY, "Manager alert interval", alertInterval, "min", 1440,
              "How often managers are alerted when a shift is overdue without clock-out. 0 disables.")}
          </div>
        </div>
      </div>
    </Card>
  );
}

// ─── HourMinuteSelect (HH : MM 분리 셀렉트) ─────────

function hourLabel(h: number): string {
  if (h < 24) return String(h);
  return `${h - 24} (+1d)`;
}

const MINUTE_OPTIONS = Array.from({ length: 60 }, (_, i) => i);

function HourMinuteSelect({ value, onChange, maxHour = 23, className }: {
  value: string;
  onChange: (v: string) => void;
  maxHour?: number;
  className?: string;
}) {
  const [hh, mm] = (value || "00:00").split(":").map(Number);
  const hours = Array.from({ length: maxHour + 1 }, (_, i) => i);
  const base = className ?? "px-2 py-1.5 border border-[var(--color-border)] rounded-lg text-[13px] bg-[var(--color-bg)] text-[var(--color-text)]";

  return (
    <div className="inline-flex items-center gap-1">
      <select
        value={hh ?? 0}
        onChange={(e) => onChange(`${String(Number(e.target.value)).padStart(2, "0")}:${String(mm ?? 0).padStart(2, "0")}`)}
        className={base}
      >
        {hours.map((h) => (
          <option key={h} value={h}>{hourLabel(h)}</option>
        ))}
      </select>
      <span className="text-[var(--color-text-muted)] text-[13px] font-medium">:</span>
      <select
        value={mm ?? 0}
        onChange={(e) => onChange(`${String(hh ?? 0).padStart(2, "0")}:${String(Number(e.target.value)).padStart(2, "0")}`)}
        className={base}
      >
        {MINUTE_OPTIONS.map((m) => (
          <option key={m} value={m}>{String(m).padStart(2, "0")}</option>
        ))}
      </select>
    </div>
  );
}

// ─── 6. Operating Hours (org + store) ─────────────────
//
// **`schedule.range`(Staff Working Hours)와 다른 개념이다.** 이쪽은 "매장이 열려 있는 시간"
// 이고, `schedule.range` 는 "직원 근무 가능 시간대"(D2-4). 이름이 비슷해 섞기 쉽다.
//
// 값 형태 (C5):
//   { mode: "all"|"per_day",
//     all:     {start, end, end_offset_days},
//     per_day: {sun:{start,end,end_offset_days}, ...},
//     closed:  ["sun", ...] }        ← 휴무일 (D2-6: 스케줄 생성은 허용하되 경고)
//
// 자정 넘김은 `end_offset_days` 로 **명시**한다. `26:00` 같은 24 초과 표기를 쓰지 않는다(D2-8).

const OPERATING_HOURS_KEY = "store.operating_hours";
const DEFAULT_HOURS: HoursEntry = { start: "09:00", end: "22:00", end_offset_days: 0 };

interface HoursEntry {
  start: string;
  end: string;
  /** 종료가 며칠 뒤인지. 0 또는 1. */
  end_offset_days: number;
}

interface OperatingHoursData {
  mode: "all" | "per_day";
  all: HoursEntry;
  /** `all` 이 실제로 저장돼 있었는지. false 면 화면 표시용 기본값일 뿐이라
   *  저장 시 빈 값으로 나간다 — "미설정 = 제한 없음" 을 보존하기 위함. */
  allSet: boolean;
  per_day: Record<string, HoursEntry>;
  /** `per_day` 에서 실제로 저장돼 있던(또는 사용자가 건드린) 요일 키만. */
  perDaySet: string[];
  closed: string[];
}

function asHoursEntry(raw: unknown): HoursEntry {
  const d = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    start: typeof d.start === "string" ? d.start : DEFAULT_HOURS.start,
    end: typeof d.end === "string" ? d.end : DEFAULT_HOURS.end,
    end_offset_days: Number(d.end_offset_days) === 1 ? 1 : 0,
  };
}

/** 저장값 → 화면 구조.
 *
 * ⚠️ **"미설정"을 반드시 보존한다.** 서버 기본값은 비어 있고, 그 의미는
 * "영업시간 제한 없음 = 리포트가 전 시간대를 검사"다. 09:00–22:00 같은 값을
 * 넣어버리면 야간 시프트가 인원 부족 검사에서 통째로 빠진다(시드 주석 참조).
 *
 * 화면 입력칸은 값이 있어야 그려지므로 표시용으로만 기본값을 쓰고,
 * **사용자가 실제로 시각을 건드리기 전까지는 저장 payload 에 싣지 않는다.**
 * 예전엔 휴무일 체크 하나만 눌러도 09:00–22:00 이 함께 저장됐다.
 */
function readOperatingHours(raw: unknown): OperatingHoursData {
  const d = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const perDayRaw = (d.per_day && typeof d.per_day === "object" ? d.per_day : {}) as Record<string, unknown>;
  const allRaw = d.all;
  const hasAll = !!allRaw && typeof allRaw === "object"
    && typeof (allRaw as Record<string, unknown>).start === "string";
  const daysSet = DAYS.filter((k) => {
    const v = perDayRaw[k];
    return !!v && typeof v === "object" && typeof (v as Record<string, unknown>).start === "string";
  });
  return {
    mode: d.mode === "per_day" ? "per_day" : "all",
    all: asHoursEntry(allRaw),
    allSet: hasAll,
    per_day: Object.fromEntries(DAYS.map((k) => [k, asHoursEntry(perDayRaw[k])])),
    perDaySet: daysSet,
    closed: Array.isArray(d.closed) ? d.closed.filter((x): x is string => typeof x === "string") : [],
  };
}

/** 화면 구조 → 저장값. **건드리지 않은 칸은 싣지 않는다**(위 주석).
 *
 * `per_day` 도 같은 이유로 걸러낸다. 예전엔 화면 표시용 기본값 7일치가 통째로
 * 저장돼서, `mode` 를 per_day 로 바꾸는 순간 아무도 입력한 적 없는
 * 09:00–22:00 이 실제 영업시간이 됐다. mode 가 all 인 동안 서버가 per_day 를
 * 보지 않아 드러나지 않을 뿐, 한 번의 클릭으로 되살아나는 값이다.
 */
function writeOperatingHours(h: OperatingHoursData): Record<string, unknown> {
  return {
    mode: h.mode,
    all: h.allSet ? h.all : {},
    per_day: Object.fromEntries(h.perDaySet.map((k) => [k, h.per_day[k]])),
    closed: h.closed,
  };
}

function OperatingHoursSection(props: SectionCommonProps & { available: boolean }) {
  const isStore = props.scope === "store";
  const locked = props.isLocked(OPERATING_HOURS_KEY);
  const isInherited = isStore && !isEffectivelyCustom(props, OPERATING_HOURS_KEY);
  const hours = readOperatingHours(props.getValue(OPERATING_HOURS_KEY));

  // registry 에 키가 없으면 저장이 서버에서 거부된다 — 아예 그리지 않는다.
  // (서버 1-C 가 이 키를 시드하기 전까지 콘솔만 앞서 배포돼도 깨진 카드가 보이지 않게)
  if (!props.available) return null;

  function save(next: OperatingHoursData) {
    props.queueChange(OPERATING_HOURS_KEY, writeOperatingHours(next));
  }
  function setEntry(day: string | "all", patch: Partial<HoursEntry>) {
    // 시각을 실제로 건드린 순간부터 "설정됨"이 된다.
    if (day === "all") { save({ ...hours, allSet: true, all: { ...hours.all, ...patch } }); return; }
    save({
      ...hours,
      perDaySet: hours.perDaySet.includes(day) ? hours.perDaySet : [...hours.perDaySet, day],
      per_day: { ...hours.per_day, [day]: { ...(hours.per_day[day] ?? DEFAULT_HOURS), ...patch } },
    });
  }
  function toggleClosed(day: string) {
    const next = hours.closed.includes(day) ? hours.closed.filter((d) => d !== day) : [...hours.closed, day];
    save({ ...hours, closed: next });
  }

  const entryRow = (entry: HoursEntry, day: string | "all") => (
    <div className="flex items-center gap-2 flex-wrap">
      <HourMinuteSelect
        value={entry.start}
        maxHour={23}
        onChange={(v) => setEntry(day, { start: v })}
        className="px-1.5 py-1 border border-[var(--color-border)] rounded text-[12px] bg-[var(--color-bg)] text-[var(--color-text)]"
      />
      <span className="text-[var(--color-text-muted)] text-[12px]">–</span>
      <HourMinuteSelect
        value={entry.end}
        maxHour={23}
        onChange={(v) => setEntry(day, { end: v })}
        className="px-1.5 py-1 border border-[var(--color-border)] rounded text-[12px] bg-[var(--color-bg)] text-[var(--color-text)]"
      />
      {/* 자정 넘김은 오프셋으로 명시 — "종료 < 시작이면 다음날" 같은 추론을 두지 않는다. */}
      <label className="inline-flex items-center gap-1 text-[11px] text-[var(--color-text-secondary)] select-none cursor-pointer">
        <input
          type="checkbox"
          checked={entry.end_offset_days === 1}
          disabled={locked}
          onChange={(e) => setEntry(day, { end_offset_days: e.target.checked ? 1 : 0 })}
          className="w-3 h-3 accent-[var(--color-accent)]"
        />
        next day (+1)
      </label>
    </div>
  );

  return (
    <Card
      title="Operating Hours"
      subtitle="When the store is open. Closed days still allow schedules, but the console warns before saving."
      locked={locked}
    >
      {isStore && (
        <div className="flex justify-end mb-2">
          <SourceBadge props={props} fieldKey={OPERATING_HOURS_KEY} />
        </div>
      )}
      <div className={isInherited ? "opacity-50 pointer-events-none" : ""}>
        {isInherited && (
          <p className="text-[12px] text-[var(--color-text-muted)] italic mb-2">Using organization default</p>
        )}
        <ChangedMark changed={props.isChanged(OPERATING_HOURS_KEY)}>
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => hours.mode !== "all" && save({ ...hours, mode: "all" })}
                className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-colors ${hours.mode === "all" ? "bg-[var(--color-accent)] text-white" : "bg-[var(--color-bg)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]"}`}>
                Same every day
              </button>
              <button type="button" onClick={() => hours.mode !== "per_day" && save({ ...hours, mode: "per_day" })}
                className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-colors ${hours.mode === "per_day" ? "bg-[var(--color-accent)] text-white" : "bg-[var(--color-bg)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]"}`}>
                Per day
              </button>
            </div>

            {hours.mode === "all" ? (
              <div className="space-y-3">
                {entryRow(hours.all, "all")}
                <div>
                  <div className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-text-muted)] mb-1.5">Closed days</div>
                  <div className="flex flex-wrap gap-1.5">
                    {DAYS.map((d) => (
                      <button key={d} type="button" onClick={() => toggleClosed(d)} disabled={locked}
                        className={`px-2 py-1 rounded text-[11px] font-semibold uppercase tracking-wider transition-colors ${hours.closed.includes(d) ? "bg-[var(--color-danger-muted)] text-[var(--color-danger)]" : "bg-[var(--color-bg)] text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)]"}`}>
                        {d}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {DAYS.map((d) => {
                  const closed = hours.closed.includes(d);
                  return (
                    <div key={d} className="flex items-center gap-3 flex-wrap">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-text-muted)] w-10 shrink-0">{d}</span>
                      {closed
                        ? <span className="text-[12px] text-[var(--color-danger)]">Closed</span>
                        : entryRow(hours.per_day[d] ?? DEFAULT_HOURS, d)}
                      <button type="button" onClick={() => toggleClosed(d)} disabled={locked}
                        className="text-[11px] font-semibold text-[var(--color-text-muted)] hover:text-[var(--color-accent)]">
                        {closed ? "Set hours" : "Mark closed"}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </ChangedMark>
      </div>
    </Card>
  );
}

// ─── 7. Schedule Range (org + store) ──────────────────

const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
const DEFAULT_RANGE: RangeEntry = { start: "06:00", end: "23:00", end_offset_days: 0 };

/** "26:00" 같은 24 초과 표기를 {"02:00", +1d} 로 흡수한다.
 *
 * 저장 형식은 `00:00~23:59` + `end_offset_days` 로 통일됐다(D2-8 개정).
 * 서버 파서는 24 초과 표기를 **거부하고 미설정으로 떨어뜨리는데**, 그러면
 * SV 공백 검사가 그 매장에서 조용히 멈춘다(경고도 로그도 없다).
 * 마이그레이션이 기존 데이터를 정리했지만, 옛 값을 아직 들고 있는 화면이
 * 그대로 다시 저장하는 경로를 막기 위해 **읽을 때 변환**한다. */
function absorbLegacyOverflow(e: { start?: unknown; end?: unknown; end_offset_days?: unknown }): RangeEntry {
  const start = typeof e?.start === "string" ? e.start : DEFAULT_RANGE.start;
  let end = typeof e?.end === "string" ? e.end : DEFAULT_RANGE.end;
  let offset = Number(e?.end_offset_days) === 1 ? 1 : 0;
  const m = /^(\d{1,2}):(\d{2})$/.exec(end);
  if (m && Number(m[1]) >= 24) {
    end = `${String(Number(m[1]) - 24).padStart(2, "0")}:${m[2]}`;
    offset = 1;
  }
  return { start, end, end_offset_days: offset };
}

/** Format a schedule_range object into a readable summary string */
function formatRangeSummary(range: Record<string, { start: string; end: string }> | undefined | null): string {
  if (!range) return "6:00 – 23:00";
  if (range.all) return `${range.all.start} – ${range.all.end}`;
  const entries = DAYS.map((d) => range[d]).filter(Boolean);
  if (entries.length === 0) return "6:00 – 23:00";
  const allSame = entries.every((e) => e.start === entries[0].start && e.end === entries[0].end);
  if (allSame) return `${entries[0].start} – ${entries[0].end}`;
  return "Per-day custom";
}

/** schedule.range 데이터 구조:
 * { mode: "all"|"per_day", all: {start,end}, per_day: {sun:{start,end}, mon:...} }
 * all과 per_day는 항상 별도 저장. mode가 어느 쪽이 활성인지 결정.
 */
interface RangeEntry {
  start: string;
  end: string;
  /** 종료가 며칠 뒤인지. 0 또는 1. 24 초과 표기(26:00)를 쓰지 않는 이유는 D2-8 참조. */
  end_offset_days: number;
}

interface RangeData {
  mode: "all" | "per_day";
  all: RangeEntry;
  per_day: Record<string, RangeEntry>;
}

function normalizeRange(raw: unknown): RangeData {
  const d = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const defaultAll = DEFAULT_RANGE;
  const defaultPerDay = Object.fromEntries(DAYS.map((k) => [k, DEFAULT_RANGE]));

  // 새 포맷 (mode 필드 존재)
  if ("mode" in d) {
    const all = (d.all && typeof d.all === "object" && "start" in (d.all as Record<string, unknown>))
      ? absorbLegacyOverflow(d.all as Record<string, unknown>) : defaultAll;
    const pdRaw = d.per_day && typeof d.per_day === "object" ? d.per_day as Record<string, Record<string, unknown>> : {};
    const pd = { ...defaultPerDay, ...Object.fromEntries(
      Object.entries(pdRaw).map(([k, v]) => [k, absorbLegacyOverflow(v ?? {})]),
    ) };
    return { mode: d.mode === "per_day" ? "per_day" : "all", all, per_day: pd };
  }

  // 레거시 포맷 호환: {"all":{...}} or {"sun":{...},"mon":{...}}
  if ("all" in d && typeof d.all === "object") {
    const all = absorbLegacyOverflow(d.all as Record<string, unknown>);
    return { mode: "all", all, per_day: Object.fromEntries(DAYS.map((k) => [k, all])) };
  }
  // per-day 레거시
  const hasDay = DAYS.some((k) => k in d);
  if (hasDay) {
    const pd = { ...defaultPerDay };
    for (const k of DAYS) if (k in d && typeof d[k] === "object") pd[k] = absorbLegacyOverflow(d[k] as Record<string, unknown>);
    const starts = Object.values(pd).map((v) => v.start);
    const ends = Object.values(pd).map((v) => v.end);
    // all 요약값은 per_day 의 최소 시작 / 최대 종료. 오프셋이 하나라도 있으면 +1d 로 본다.
    return {
      mode: "per_day",
      all: {
        start: starts.sort()[0]!,
        end: ends.sort().reverse()[0]!,
        end_offset_days: Object.values(pd).some((v) => v.end_offset_days === 1) ? 1 : 0,
      },
      per_day: pd,
    };
  }
  return { mode: "all", all: defaultAll, per_day: defaultPerDay };
}

function ScheduleRangeSection(props: SectionCommonProps) {
  const RANGE_KEY = "schedule.range";
  const isStore = props.scope === "store";

  const hasDraftValue = props.isChanged(RANGE_KEY) && !props.isPendingDelete(RANGE_KEY);
  const isInherited = isStore && !isEffectivelyCustom(props, RANGE_KEY);
  const locked = props.isLocked(RANGE_KEY);

  const currentValue = props.getValue(RANGE_KEY);
  const range = normalizeRange(currentValue);

  // 서버 저장값 (draft 미포함) — 되돌리기 비교용. ref로 저장해서 draft 변경에 영향 안 받음.
  const serverRef = useRef<RangeData>(range);
  useEffect(() => {
    if (!hasDraftValue) serverRef.current = range;
  }, [hasDraftValue, range]);
  const server = serverRef.current;

  function save(next: RangeData) {
    // 서버 저장값과 동일하면 draft에서 제거 (= 변경 없음)
    props.queueChange(RANGE_KEY, next);
  }

  /** mode만 전환하고 데이터는 건드리지 않음. 원래 mode로 돌아오면 dirty 아님 */
  function switchMode(newMode: "all" | "per_day") {
    if (range.mode === newMode) return;
    save({ ...range, mode: newMode });
  }

  // Per day에서 "Fill from Same" — all 값으로 모든 요일 채우기
  function fillPerDayFromAll() {
    save({ ...range, per_day: Object.fromEntries(DAYS.map((d) => [d, range.all])) });
  }

  function resetDay(day: string) {
    save({ ...range, per_day: { ...range.per_day, [day]: server.per_day[day] ?? DEFAULT_RANGE } });
  }

  const inheritedRange = isInherited ? range : null;

  return (
    <Card title="Schedule Range" locked={locked}>
      {isStore && (
        <div className="flex justify-end mb-2">
          <SourceBadge props={props} fieldKey={RANGE_KEY} />
        </div>
      )}
      {/* Inherited mode */}
      {isInherited ? (
        <div className="opacity-50">
          <p className="text-[12px] text-[var(--color-text-muted)] italic mb-2">
            Using organization default
          </p>
          {inheritedRange && inheritedRange.mode === "per_day" ? (
            <div className="space-y-1.5 pointer-events-none">
              {DAYS.map((d) => (
                <div key={d} className="flex items-center gap-3">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-text-muted)] w-10 shrink-0">{d}</span>
                  <span className="text-[12px] text-[var(--color-text-secondary)]">{inheritedRange.per_day[d]?.start ?? "06:00"} – {inheritedRange.per_day[d]?.end ?? "23:00"}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[12px] text-[var(--color-text-secondary)]">{inheritedRange?.all.start ?? "06:00"} – {inheritedRange?.all.end ?? "23:00"} (every day)</p>
          )}
        </div>
      ) : (
        <ChangedMark changed={props.isChanged(RANGE_KEY)}>
          <div className="space-y-4">
            {/* Mode toggle */}
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => switchMode("all")}
                className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-colors ${range.mode === "all" ? "bg-[var(--color-accent)] text-white" : "bg-[var(--color-bg)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]"}`}>
                Same every day
              </button>
              <button type="button" onClick={() => switchMode("per_day")}
                className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-colors ${range.mode === "per_day" ? "bg-[var(--color-accent)] text-white" : "bg-[var(--color-bg)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]"}`}>
                Per day
              </button>
            </div>

            {range.mode === "all" ? (
              <div className="flex items-center gap-3">
                <div>
                  <label className="text-[12px] font-medium text-[var(--color-text-secondary)] mb-1.5 block">Start</label>
                  <HourMinuteSelect value={range.all.start} maxHour={23} onChange={(v) => save({ ...range, all: { ...range.all, start: v } })} />
                </div>
                <span className="text-[var(--color-text-muted)] mt-5">–</span>
                <div>
                  <label className="text-[12px] font-medium text-[var(--color-text-secondary)] mb-1.5 block">End</label>
                  <div className="flex items-center gap-2">
                    <HourMinuteSelect value={range.all.end} maxHour={23} onChange={(v) => save({ ...range, all: { ...range.all, end: v } })} />
                    <label className="flex items-center gap-1 text-[11px] text-[var(--color-text-secondary)] select-none">
                      <input type="checkbox" checked={range.all.end_offset_days === 1}
                        onChange={(e) => save({ ...range, all: { ...range.all, end_offset_days: e.target.checked ? 1 : 0 } })} />
                      +1d
                    </label>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {/* Fill from "Same" button */}
                <button type="button" onClick={fillPerDayFromAll}
                  className="text-[11px] text-[var(--color-accent)] hover:text-[var(--color-accent-light)] transition-colors font-medium">
                  ↻ Fill all days with "{range.all.start} – {range.all.end}"
                </button>
                {DAYS.map((d) => {
                  const dayVal = range.per_day[d] ?? DEFAULT_RANGE;
                  const serverDay = server.per_day[d] ?? DEFAULT_RANGE;
                  const isDayChanged = hasDraftValue && (dayVal.start !== serverDay.start || dayVal.end !== serverDay.end);
                  return (
                    <div key={d} className="flex items-center gap-3">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-[var(--color-text-muted)] w-10 shrink-0">{d}</span>
                      <HourMinuteSelect value={dayVal.start} maxHour={23}
                        onChange={(v) => save({ ...range, mode: "per_day", per_day: { ...range.per_day, [d]: { ...dayVal, start: v } } })}
                        className="px-1.5 py-1 border border-[var(--color-border)] rounded text-[12px] bg-[var(--color-bg)] text-[var(--color-text)]" />
                      <span className="text-[var(--color-text-muted)] text-[12px]">–</span>
                      <HourMinuteSelect value={dayVal.end} maxHour={23}
                        onChange={(v) => save({ ...range, mode: "per_day", per_day: { ...range.per_day, [d]: { ...dayVal, end: v } } })}
                        className="px-1.5 py-1 border border-[var(--color-border)] rounded text-[12px] bg-[var(--color-bg)] text-[var(--color-text)]" />
                      <label className="flex items-center gap-1 text-[11px] text-[var(--color-text-secondary)] select-none shrink-0">
                        <input type="checkbox" checked={dayVal.end_offset_days === 1}
                          onChange={(e) => save({ ...range, mode: "per_day", per_day: { ...range.per_day, [d]: { ...dayVal, end_offset_days: e.target.checked ? 1 : 0 } } })} />
                        +1d
                      </label>
                      {isDayChanged && (
                        <button type="button" onClick={() => resetDay(d)} title={`Reset ${d}`}
                          className="text-[var(--color-text-muted)] hover:text-[var(--color-accent)] transition-colors shrink-0">
                          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                            <path d="M2.5 2.5v3.5h3.5" /><path d="M2.5 6A5 5 0 1 1 3.5 9.5" />
                          </svg>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </ChangedMark>
      )}
    </Card>
  );
}
