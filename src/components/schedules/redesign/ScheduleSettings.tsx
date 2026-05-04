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
 * 6. Operating Hours / Schedule Range (registry key: schedule.range, both)
 * 7. Work Roles (store only — WorkRolesPanel reuse)
 */

import { useState, useMemo, useRef, useEffect } from "react";
import { useStores } from "@/hooks/useStores";
import { useResultModal } from "@/components/ui/ResultModal";
import { ConfirmDialog } from "@/components/schedules/redesign/ConfirmDialog";
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
  const [pendingTab, setPendingTab] = useState<"org" | string | null>(null);
  const { showSuccess, showError } = useResultModal();

  // 탭 변경 시 draft 폐기 (혼동 방지)
  function handleTabChange(tab: "org" | string) {
    if (Object.keys(draft.values).length > 0 || draft.deletedKeys.length > 0) {
      setPendingTab(tab);
      return;
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

  function isLockedAtOrg(key: string): boolean {
    return orgSettings.find((s) => s.key === key)?.force_locked ?? false;
  }

  // ─── Save / Cancel ────────────────────────────────────
  const upsertOrg = useUpsertOrgSetting();
  const upsertStore = useUpsertStoreSetting(isStoreScope ? activeTab : "");
  const deleteStoreSetting = useDeleteStoreSetting(isStoreScope ? activeTab : "");

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
            showError(
              `Schedule Range: Start must be before End (${key === "all" ? "all days" : key}).`,
            );
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
      showSuccess("Settings saved");
    } catch (e) {
      showError(
        "Save failed: " + (e instanceof Error ? e.message : String(e)),
        { title: "Couldn't save settings" },
      );
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
          isLocked={isLockedAtOrg}
          isChanged={isChanged}
          scope={isStoreScope ? "store" : "org"}
          storeId={isStoreScope ? activeTab : undefined}
        />

        <ScheduleRangeSection
          getValue={getDraftOrEffective}
          queueChange={queueChange}
          isOverridden={isOverridden}
          isLocked={isLockedAtOrg}
          isChanged={isChanged}
          scope={isStoreScope ? "store" : "org"}
          storeId={isStoreScope ? activeTab : undefined}
          forceQueueChange={forceQueueChange}
          queueDeleteKey={queueDeleteKey}
          unqueueDeleteKey={unqueueDeleteKey}
          deletedKeys={draft.deletedKeys}
          draftKeys={Object.keys(draft.values)}
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

      <ConfirmDialog
        open={pendingTab !== null}
        title="Discard unsaved changes?"
        message="You have unsaved changes in this tab. Switching will discard them."
        confirmLabel="Discard"
        confirmVariant="danger"
        onConfirm={() => {
          setDraft(EMPTY_DRAFT);
          if (pendingTab !== null) setActiveTab(pendingTab);
          setPendingTab(null);
        }}
        onCancel={() => setPendingTab(null)}
      />
    </div>
  );
}

// ─── Reusable Card wrapper ───────────────────────────────

interface CardProps {
  title: string;
  subtitle?: string;
  locked?: boolean;
  inheritState?: {
    isInherited: boolean;
    onToggle: () => void;
  };
  children: React.ReactNode;
}

function Card({ title, subtitle, locked, inheritState, children }: CardProps) {
  const showInheritToggle = inheritState !== undefined && !locked;
  const isCustom = inheritState && !inheritState.isInherited;
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
        {showInheritToggle && (
          <button
            type="button"
            onClick={inheritState!.onToggle}
            className="flex items-center gap-1.5 shrink-0 group"
            title={isCustom ? "Click to inherit from Organization" : "Click to override at store level"}
          >
            <span className={`text-[10px] font-bold uppercase tracking-wider transition-colors ${isCustom ? "text-[var(--color-accent)]" : "text-[var(--color-text-muted)] group-hover:text-[var(--color-text-secondary)]"}`}>
              {isCustom ? "Custom" : "Inherited"}
            </span>
            <span className={`relative w-8 h-[18px] rounded-full transition-colors duration-150 ${isCustom ? "bg-[var(--color-accent)]" : "bg-[var(--color-border)]"}`}>
              <span className={`absolute top-[2px] w-3.5 h-3.5 rounded-full bg-white shadow-sm transition-transform duration-150 ${isCustom ? "left-[16px]" : "left-[2px]"}`} />
            </span>
          </button>
        )}
      </div>
      <div className={`px-5 py-4 ${inheritState?.isInherited ? "opacity-50 pointer-events-none" : ""}`}>{children}</div>
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

/** localStorage key for preserving custom values when switching to Inherit */
function customCacheKey(storeId: string, settingKey: string): string {
  return `schedSettings:${storeId}:${settingKey}`;
}

/**
 * Section의 inherit toggle — draft 기반.
 * Inherit 전환 시 custom 값을 localStorage에 보존.
 * Custom 복귀 시 localStorage에서 복원.
 */
function useSectionInherit(props: SectionCommonProps, keys: string[]) {
  if (props.scope !== "store" || !props.storeId) return null;
  const storeId = props.storeId;

  const hasServerOverride = keys.some((k) => props.isOverridden(k));
  // draft에 custom 값이 추가됨 (force-queued, 아직 서버에 없음)
  const hasDraftCustom = keys.some((k) => props.isChanged(k) && !props.isOverridden(k));
  // 서버에 override 있는데 delete 예정
  const allServerDeletePending = hasServerOverride && keys.every((k) => props.isChanged(k));

  const isInherited = allServerDeletePending || (!hasServerOverride && !hasDraftCustom);

  const toggleInherit = () => {
    if (isInherited) {
      // → Custom: localStorage에서 복원, 없으면 현재 effective 사용
      keys.forEach((key) => {
        // delete 예약 취소
        props.unqueueDeleteKey(key);
        const cached = localStorage.getItem(customCacheKey(storeId, key));
        const value = cached ? JSON.parse(cached) : props.getValue(key);
        if (value !== undefined && value !== null) {
          props.forceQueueChange(key, value);
        }
      });
    } else {
      // → Inherit: custom 값을 localStorage에 보존 후 delete 예약
      keys.forEach((key) => {
        const currentVal = props.getValue(key);
        if (currentVal !== undefined && currentVal !== null) {
          localStorage.setItem(customCacheKey(storeId, key), JSON.stringify(currentVal));
        }
        props.queueDeleteKey(key);
      });
    }
  };

  return { isInherited, onToggle: toggleInherit };
}

// ─── 1. Work Hour Alerts ─────────────────────────────────

function WorkHourAlertsSection(props: SectionCommonProps) {
  const NORMAL_KEY = "schedule.work_hour_alert.normal_max";
  const CAUTION_KEY = "schedule.work_hour_alert.caution_max";
  const MAX_SHIFT_KEY = "schedule.max_shift_hours";

  const normalMax = Number(props.getValue(NORMAL_KEY) ?? 5.5);
  const cautionMax = Number(props.getValue(CAUTION_KEY) ?? 7.5);
  const maxShiftHours = Number(props.getValue(MAX_SHIFT_KEY) ?? 16);

  const locked = props.isLocked(NORMAL_KEY) || props.isLocked(CAUTION_KEY) || props.isLocked(MAX_SHIFT_KEY);
  const inheritState = useSectionInherit(props, [NORMAL_KEY, CAUTION_KEY, MAX_SHIFT_KEY]);

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
    <Card title="Work Hour Alerts" subtitle="Color thresholds for daily work hours" locked={locked} inheritState={inheritState ?? undefined}>
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-4">
          <ChangedMark changed={props.isChanged(NORMAL_KEY)}>
            <div>
              <label className="text-[12px] font-medium text-[var(--color-success)] mb-1.5 flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-[var(--color-success)]" />
                Normal (Green)
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
              <label className="text-[12px] font-medium text-[var(--color-warning)] mb-1.5 flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-[var(--color-warning)]" />
                Caution (Orange)
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
            <label className="text-[12px] font-medium text-[var(--color-text)] mb-1.5 block">
              Max shift duration warning
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

  const locked = props.isLocked(LIMIT_KEY) || props.isLocked(WARN_KEY);
  const inheritState = useSectionInherit(props, [LIMIT_KEY, WARN_KEY]);

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
    <Card title="Weekly Hour Limits" subtitle="Maximum hours and overtime thresholds" locked={locked} inheritState={inheritState ?? undefined}>
      <div className="space-y-4">
        <ChangedMark changed={props.isChanged(LIMIT_KEY)}>
          <div>
            <label className="text-[12px] font-medium text-[var(--color-text-secondary)] mb-1.5 block">Max weekly hours</label>
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
            <label className="text-[12px] font-medium text-[var(--color-text-secondary)] mb-1.5 block">Warning threshold</label>
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

  const locked = props.isLocked(REQ_KEY) || props.isLocked(AUTO_KEY);
  const inheritState = useSectionInherit(props, [REQ_KEY, AUTO_KEY]);

  return (
    <Card title="Approval Workflow" subtitle="Schedule approval requirements" locked={locked} inheritState={inheritState ?? undefined}>
      <div className="divide-y divide-[var(--color-border)]">
        <ChangedMark changed={props.isChanged(REQ_KEY)}>
          <ToggleRow
            label="Require GM approval"
            description="All requested schedules need GM confirmation before activating"
            value={required}
            locked={locked}
            onChange={(v) => props.queueChange(REQ_KEY, v)}
          />
        </ChangedMark>
        <ChangedMark changed={props.isChanged(AUTO_KEY)}>
          <ToggleRow
            label="Auto-confirm SV drafts"
            description="Automatically confirm schedules created in draft mode by SV+ users"
            value={autoConfirm}
            locked={locked}
            onChange={(v) => props.queueChange(AUTO_KEY, v)}
          />
        </ChangedMark>
      </div>
    </Card>
  );
}

function ToggleRow({ label, description, value, locked, onChange }: { label: string; description: string; value: boolean; locked?: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between py-3">
      <div>
        <div className="text-[13px] font-medium text-[var(--color-text)]">{label}</div>
        <div className="text-[11px] text-[var(--color-text-muted)] mt-0.5">{description}</div>
      </div>
      <button
        type="button"
        disabled={locked}
        onClick={() => onChange(!value)}
        className={`relative w-10 h-[22px] rounded-full transition-colors duration-150 ${value ? "bg-[var(--color-accent)]" : "bg-[var(--color-border)]"} ${locked ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
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

  const locked = props.isLocked(SHIFT_DURATION_KEY) || props.isLocked(BREAK_DURATION_KEY);
  const inheritState = useSectionInherit(props, [SHIFT_DURATION_KEY, BREAK_DURATION_KEY]);

  function handleShiftDurationChange(value: number) {
    props.queueChange(SHIFT_DURATION_KEY, Math.max(30, Math.min(1440, value)));
  }
  function handleBreakDurationChange(value: number) {
    props.queueChange(BREAK_DURATION_KEY, Math.max(1, Math.min(480, value)));
  }

  return (
    <Card title="Work Rules" subtitle="Default schedule and break duration" locked={locked} inheritState={inheritState ?? undefined}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ChangedMark changed={props.isChanged(SHIFT_DURATION_KEY)}>
          <div>
            <label className="text-[12px] font-medium text-[var(--color-text-secondary)] mb-1.5 block">Default schedule duration</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={shiftDuration}
                min="30"
                max="1440"
                step="30"
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
            <label className="text-[12px] font-medium text-[var(--color-text-secondary)] mb-1.5 block">Default break</label>
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
  const EARLY_KEY = "attendance.early_leave_threshold_minutes";

  const lateBuffer = Number(props.getValue(LATE_KEY) ?? 5);
  const earlyThresh = Number(props.getValue(EARLY_KEY) ?? 5);

  const locked = props.isLocked(LATE_KEY) || props.isLocked(EARLY_KEY);
  const inheritState = useSectionInherit(props, [LATE_KEY, EARLY_KEY]);

  return (
    <Card title="Attendance" subtitle="Late and early-leave detection thresholds" locked={locked} inheritState={inheritState ?? undefined}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ChangedMark changed={props.isChanged(LATE_KEY)}>
          <div>
            <label className="text-[12px] font-medium text-[var(--color-text-secondary)] mb-1.5 block">Late buffer</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={lateBuffer}
                min="0"
                max="120"
                disabled={locked}
                onChange={(e) => props.queueChange(LATE_KEY, Math.max(0, Math.min(120, Number(e.target.value))))}
                className="w-20 px-3 py-1.5 border border-[var(--color-border)] rounded-lg text-[13px] text-center disabled:opacity-50"
              />
              <span className="text-[13px] text-[var(--color-text-muted)]">min after start</span>
            </div>
          </div>
        </ChangedMark>
        <ChangedMark changed={props.isChanged(EARLY_KEY)}>
          <div>
            <label className="text-[12px] font-medium text-[var(--color-text-secondary)] mb-1.5 block">Early-leave threshold</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={earlyThresh}
                min="0"
                max="120"
                disabled={locked}
                onChange={(e) => props.queueChange(EARLY_KEY, Math.max(0, Math.min(120, Number(e.target.value))))}
                className="w-20 px-3 py-1.5 border border-[var(--color-border)] rounded-lg text-[13px] text-center disabled:opacity-50"
              />
              <span className="text-[13px] text-[var(--color-text-muted)]">min before end</span>
            </div>
          </div>
        </ChangedMark>
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

// ─── 6. Schedule Range (org + store) ──────────────────

const DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
const DEFAULT_RANGE = { start: "06:00", end: "23:00" };

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

interface ScheduleRangeSectionProps extends SectionCommonProps {
  deletedKeys: string[];
  draftKeys: string[];
}

/** schedule.range 데이터 구조:
 * { mode: "all"|"per_day", all: {start,end}, per_day: {sun:{start,end}, mon:...} }
 * all과 per_day는 항상 별도 저장. mode가 어느 쪽이 활성인지 결정.
 */
interface RangeData {
  mode: "all" | "per_day";
  all: { start: string; end: string };
  per_day: Record<string, { start: string; end: string }>;
}

function normalizeRange(raw: unknown): RangeData {
  const d = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const defaultAll = DEFAULT_RANGE;
  const defaultPerDay = Object.fromEntries(DAYS.map((k) => [k, DEFAULT_RANGE]));

  // 새 포맷 (mode 필드 존재)
  if ("mode" in d) {
    const all = (d.all && typeof d.all === "object" && "start" in (d.all as Record<string, unknown>)) ? d.all as { start: string; end: string } : defaultAll;
    const pd = d.per_day && typeof d.per_day === "object" ? { ...defaultPerDay, ...(d.per_day as Record<string, { start: string; end: string }>) } : defaultPerDay;
    return { mode: d.mode === "per_day" ? "per_day" : "all", all, per_day: pd };
  }

  // 레거시 포맷 호환: {"all":{...}} or {"sun":{...},"mon":{...}}
  if ("all" in d && typeof d.all === "object") {
    const all = d.all as { start: string; end: string };
    return { mode: "all", all, per_day: Object.fromEntries(DAYS.map((k) => [k, all])) };
  }
  // per-day 레거시
  const hasDay = DAYS.some((k) => k in d);
  if (hasDay) {
    const pd = { ...defaultPerDay };
    for (const k of DAYS) if (k in d && typeof d[k] === "object") pd[k] = d[k] as { start: string; end: string };
    const starts = Object.values(pd).map((v) => v.start);
    const ends = Object.values(pd).map((v) => v.end);
    return { mode: "per_day", all: { start: starts.sort()[0]!, end: ends.sort().reverse()[0]! }, per_day: pd };
  }
  return { mode: "all", all: defaultAll, per_day: defaultPerDay };
}

function ScheduleRangeSection(props: ScheduleRangeSectionProps) {
  const RANGE_KEY = "schedule.range";
  const isStore = props.scope === "store";

  const isPendingDelete = props.deletedKeys.includes(RANGE_KEY);
  const hasStoreOverride = props.isOverridden(RANGE_KEY);
  const hasDraftValue = props.draftKeys.includes(RANGE_KEY);
  const isInherited = isStore && (isPendingDelete || (!hasStoreOverride && !hasDraftValue));
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

  function handleInheritToggle(inherit: boolean) {
    if (inherit) {
      // custom 값을 localStorage에 보존
      if (props.storeId) {
        localStorage.setItem(customCacheKey(props.storeId, RANGE_KEY), JSON.stringify(range));
      }
      props.queueDeleteKey(RANGE_KEY);
    } else {
      props.unqueueDeleteKey(RANGE_KEY);
      // localStorage에서 복원, 없으면 현재 effective
      const cached = props.storeId ? localStorage.getItem(customCacheKey(props.storeId, RANGE_KEY)) : null;
      const restored = cached ? JSON.parse(cached) : range;
      props.forceQueueChange(RANGE_KEY, restored);
    }
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
    <Card
      title="Schedule Range"
      locked={locked}
      inheritState={isStore ? {
        isInherited,
        onToggle: () => handleInheritToggle(!isInherited),
      } : undefined}
    >
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
                  <HourMinuteSelect value={range.all.end} maxHour={48} onChange={(v) => save({ ...range, all: { ...range.all, end: v } })} />
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
                      <HourMinuteSelect value={dayVal.end} maxHour={48}
                        onChange={(v) => save({ ...range, mode: "per_day", per_day: { ...range.per_day, [d]: { ...dayVal, end: v } } })}
                        className="px-1.5 py-1 border border-[var(--color-border)] rounded text-[12px] bg-[var(--color-bg)] text-[var(--color-text)]" />
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
