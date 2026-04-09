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
 * 6. Business Day Start (store only — store.day_start_time)
 * 7. Work Roles (store only — WorkRolesPanel reuse)
 */

import { useState, useMemo } from "react";
import { useStores, useUpdateStore } from "@/hooks/useStores";
import {
  useSettingsRegistry,
  useOrgSettings,
  useStoreSettings,
  useUpsertOrgSetting,
  useUpsertStoreSetting,
  useDeleteOrgSetting,
  useDeleteStoreSetting,
  type SettingsRegistryEntry,
  type OrgSettingEntry,
  type StoreSettingEntry,
} from "@/hooks/useSettings";
import { WorkRolesPanel } from "@/components/schedules/WorkRolesPanel";
import type { Store } from "@/types";

interface Props {
  showCost?: boolean;
  onBack: () => void;
}

// ─── Draft state ───────────────────────────────────────

interface DraftState {
  /** 현재 scope 기준 변경된 키-값 */
  values: Record<string, unknown>;
  /** day_start_time draft (store scope only) */
  dayStart: Record<string, string> | null;
}

const EMPTY_DRAFT: DraftState = { values: {}, dayStart: null };

// ─── Main component ────────────────────────────────────

export function ScheduleSettings({ onBack }: Props) {
  const storesQ = useStores();
  const stores = storesQ.data ?? [];
  const [activeTab, setActiveTab] = useState<"org" | string>("org");
  const [draft, setDraft] = useState<DraftState>(EMPTY_DRAFT);

  // 탭 변경 시 draft 폐기 (혼동 방지)
  function handleTabChange(tab: "org" | string) {
    if (Object.keys(draft.values).length > 0 || draft.dayStart) {
      if (!window.confirm("You have unsaved changes. Discard them and switch?")) return;
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

  /** 값 동등 비교 (primitive + JSON-serializable object) */
  function valueEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (a == null || b == null) return false;
    if (typeof a !== typeof b) return false;
    return JSON.stringify(a) === JSON.stringify(b);
  }

  function queueChange(key: string, value: unknown) {
    setDraft((prev) => {
      const effective = getEffectiveValue(key);
      // 새 값이 effective와 같으면 draft에서 제거 (= 변경 없음으로 처리)
      if (valueEqual(value, effective)) {
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

  function queueDayStart(value: Record<string, string>) {
    setDraft((prev) => {
      const serverValue = activeStore?.day_start_time as Record<string, string> | null;
      if (serverValue && valueEqual(value, serverValue)) {
        if (prev.dayStart === null) return prev;
        return { ...prev, dayStart: null };
      }
      if (valueEqual(prev.dayStart, value)) return prev;
      return { ...prev, dayStart: value };
    });
  }

  function getDayStartDraft(): Record<string, string> | null {
    return draft.dayStart;
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
  const updateStore = useUpdateStore();

  const isDirty = Object.keys(draft.values).length > 0 || draft.dayStart !== null;
  const isSaving = upsertOrg.isPending || upsertStore.isPending || updateStore.isPending;

  async function handleSave() {
    try {
      // values flush
      for (const [key, value] of Object.entries(draft.values)) {
        if (isStoreScope && activeTab) {
          await upsertStore.mutateAsync({ key, value });
        } else {
          await upsertOrg.mutateAsync({ key, value });
        }
      }
      // day_start_time flush
      if (draft.dayStart && isStoreScope && activeTab) {
        await updateStore.mutateAsync({ id: activeTab, day_start_time: draft.dayStart });
      }
      setDraft(EMPTY_DRAFT);
    } catch (e) {
      window.alert("Save failed: " + (e instanceof Error ? e.message : String(e)));
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

      {/* Level tabs */}
      <div className="flex gap-1 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-0.5 w-fit mb-5 overflow-x-auto">
        <button
          type="button"
          onClick={() => handleTabChange("org")}
          className={`px-3.5 py-1.5 rounded-md text-[13px] font-medium transition-all whitespace-nowrap ${activeTab === "org" ? "bg-[var(--color-accent)] text-white" : "text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"}`}
        >
          Organization
        </button>
        {stores.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => handleTabChange(s.id)}
            className={`px-3.5 py-1.5 rounded-md text-[13px] font-medium transition-all whitespace-nowrap ${activeTab === s.id ? "bg-[var(--color-accent)] text-white" : "text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"}`}
          >
            {s.name}
          </button>
        ))}
      </div>

      {registryQ.isLoading && (
        <div className="text-[12px] text-[var(--color-text-muted)] italic py-8 text-center">Loading…</div>
      )}

      {/* Sections */}
      <div className="space-y-3">
        <WorkHourAlertsSection
          getValue={getDraftOrEffective}
          queueChange={queueChange}
          isOverridden={isOverridden}
          isLocked={isLockedAtOrg}
          scope={isStoreScope ? "store" : "org"}
          storeId={isStoreScope ? activeTab : undefined}
        />

        <WeeklyLimitsSection
          getValue={getDraftOrEffective}
          queueChange={queueChange}
          isOverridden={isOverridden}
          isLocked={isLockedAtOrg}
          scope={isStoreScope ? "store" : "org"}
          storeId={isStoreScope ? activeTab : undefined}
        />

        <ApprovalSection
          getValue={getDraftOrEffective}
          queueChange={queueChange}
          isOverridden={isOverridden}
          isLocked={isLockedAtOrg}
          scope={isStoreScope ? "store" : "org"}
          storeId={isStoreScope ? activeTab : undefined}
        />

        <WorkRulesSection
          getValue={getDraftOrEffective}
          queueChange={queueChange}
          isOverridden={isOverridden}
          isLocked={isLockedAtOrg}
          scope={isStoreScope ? "store" : "org"}
          storeId={isStoreScope ? activeTab : undefined}
        />

        <AttendanceSettingsSection
          getValue={getDraftOrEffective}
          queueChange={queueChange}
          isOverridden={isOverridden}
          isLocked={isLockedAtOrg}
          scope={isStoreScope ? "store" : "org"}
          storeId={isStoreScope ? activeTab : undefined}
        />

        {isStoreScope && activeStore && (
          <>
            <BusinessDayStartSection
              store={activeStore}
              draft={getDayStartDraft()}
              onChange={queueDayStart}
            />
            <Card title="Work Roles" subtitle="Shift × Position combinations with required headcount per day">
              <WorkRolesPanel storeId={activeTab} />
            </Card>
          </>
        )}
      </div>

      {/* Sticky save bar */}
      {isDirty && (
        <div className="fixed bottom-0 left-0 right-0 xl:left-[220px] z-40 bg-[var(--color-surface)] border-t border-[var(--color-border)] shadow-[0_-4px_16px_rgba(0,0,0,0.06)]">
          <div className="px-4 sm:px-6 xl:px-8 py-3 flex items-center justify-between gap-3">
            <span className="text-[12px] text-[var(--color-text-secondary)]">
              <strong className="text-[var(--color-warning)]">{Object.keys(draft.values).length + (draft.dayStart ? 1 : 0)}</strong> unsaved change{(Object.keys(draft.values).length + (draft.dayStart ? 1 : 0)) === 1 ? "" : "s"}
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
  isOverridden: (key: string) => boolean;
  isLocked: (key: string) => boolean;
  scope: "org" | "store";
  storeId?: string;
}

/**
 * Section의 inherit toggle. 기존 store overrides를 모두 삭제 / effective values를 모두 upsert.
 * 이 토글은 draft와 별개로 즉시 server에 적용 (구조 변경이라).
 */
function useSectionInherit(props: SectionCommonProps, keys: string[]) {
  const upsertStore = useUpsertStoreSetting(props.storeId ?? "");
  const deleteStore = useDeleteStoreSetting(props.storeId ?? "");

  if (props.scope !== "store" || !props.storeId) return null;

  const isInherited = !keys.some((k) => props.isOverridden(k));

  const toggleInherit = () => {
    if (isInherited) {
      keys.forEach((key) => {
        const value = props.getValue(key);
        if (value !== undefined && value !== null) {
          upsertStore.mutate({ key, value });
        }
      });
    } else {
      keys.forEach((key) => {
        if (props.isOverridden(key)) deleteStore.mutate(key);
      });
    }
  };

  return { isInherited, onToggle: toggleInherit };
}

// ─── 1. Work Hour Alerts ─────────────────────────────────

function WorkHourAlertsSection(props: SectionCommonProps) {
  const NORMAL_KEY = "schedule.work_hour_alert.normal_max";
  const CAUTION_KEY = "schedule.work_hour_alert.caution_max";

  const normalMax = Number(props.getValue(NORMAL_KEY) ?? 5.5);
  const cautionMax = Number(props.getValue(CAUTION_KEY) ?? 7.5);

  const locked = props.isLocked(NORMAL_KEY) || props.isLocked(CAUTION_KEY);
  const inheritState = useSectionInherit(props, [NORMAL_KEY, CAUTION_KEY]);

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
        <ToggleRow
          label="Require GM approval"
          description="All requested schedules need GM confirmation before activating"
          value={required}
          locked={locked}
          onChange={(v) => props.queueChange(REQ_KEY, v)}
        />
        <ToggleRow
          label="Auto-confirm SV drafts"
          description="Automatically confirm schedules created in draft mode by SV+ users"
          value={autoConfirm}
          locked={locked}
          onChange={(v) => props.queueChange(AUTO_KEY, v)}
        />
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
      </div>
    </Card>
  );
}

// ─── 6. Business Day Start (store only) ──────────────────

function BusinessDayStartSection({ store, draft, onChange }: { store: Store; draft: Record<string, string> | null; onChange: (v: Record<string, string>) => void }) {
  // draft 우선, 없으면 store 값
  const current = draft ?? (store.day_start_time as Record<string, string> | null) ?? { all: "06:00" };
  const isAllMode = current.all !== undefined && Object.keys(current).length === 1;
  const allTime = current.all ?? "06:00";
  const perDay: Record<string, string> = isAllMode
    ? { sun: allTime, mon: allTime, tue: allTime, wed: allTime, thu: allTime, fri: allTime, sat: allTime }
    : { sun: "06:00", mon: "06:00", tue: "06:00", wed: "06:00", thu: "06:00", fri: "06:00", sat: "06:00", ...current };

  function setAllMode(time: string) {
    onChange({ all: time });
  }
  function setPerDayMode() {
    onChange({ ...perDay });
  }
  function updatePerDay(day: string, time: string) {
    onChange({ ...perDay, [day]: time });
  }

  return (
    <Card title="Business Day Start" subtitle="When does a new business day begin? Schedules and attendance crossing this time are anchored to the previous day. Pick a quiet time when no staff is on shift (e.g. 04:00 for morning store, or staff handover time for 24-hour stores).">
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setAllMode(allTime)}
            className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-colors ${isAllMode ? "bg-[var(--color-accent)] text-white" : "bg-[var(--color-bg)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]"}`}
          >
            Same time every day
          </button>
          <button
            type="button"
            onClick={setPerDayMode}
            className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-colors ${!isAllMode ? "bg-[var(--color-accent)] text-white" : "bg-[var(--color-bg)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]"}`}
          >
            Per day
          </button>
        </div>

        {isAllMode ? (
          <div>
            <label className="text-[12px] font-medium text-[var(--color-text-secondary)] mb-1.5 block">Day start time</label>
            <input
              type="time"
              value={allTime}
              onChange={(e) => setAllMode(e.target.value)}
              className="px-3 py-1.5 border border-[var(--color-border)] rounded-lg text-[13px]"
            />
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
            {(["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const).map((d) => (
              <div key={d}>
                <label className="text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)] mb-1 block">{d}</label>
                <input
                  type="time"
                  value={perDay[d] ?? "06:00"}
                  onChange={(e) => updatePerDay(d, e.target.value)}
                  className="w-full px-2 py-1 border border-[var(--color-border)] rounded text-[12px]"
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
