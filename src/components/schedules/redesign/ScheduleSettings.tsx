"use client";

/**
 * ScheduleSettings — 목업 스타일 카드 sections + 실 server data.
 *
 * 구조:
 * - 탭: Organization / 각 매장
 * - 카드 sections (no accordion):
 *   1. Work Hour Alerts (registry, both)
 *   2. Weekly Limits (registry, both)
 *   3. Approval Workflow (registry, both)
 *   4. Break Rules (registry, both — break.* keys)
 *   5. Attendance (registry, both)
 *   6. Operating Hours (store only — store.day_start_time)
 *   7. Work Roles (store only — WorkRolesPanel reuse)
 */

import { useState, useEffect, useMemo } from "react";
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
  showLabor?: boolean;
  onBack: () => void;
}

export function ScheduleSettings({ onBack }: Props) {
  const storesQ = useStores();
  const stores = storesQ.data ?? [];
  const [activeTab, setActiveTab] = useState<"org" | string>("org");

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

  /** 현재 scope에 적용되는 effective value (store override > org override > registry default) */
  function getEffectiveValue(key: string): unknown {
    const reg = registryByKey.get(key);
    if (!reg) return undefined;
    const storeOverride = storeSettings.find((s) => s.key === key)?.value;
    const orgOverride = orgSettings.find((s) => s.key === key);
    if (isStoreScope && storeOverride !== undefined && storeOverride !== null) return storeOverride;
    if (orgOverride && orgOverride.value !== undefined && orgOverride.value !== null) return orgOverride.value;
    return reg.default_value;
  }

  function isOverridden(key: string): boolean {
    if (isStoreScope) return storeSettings.some((s) => s.key === key);
    return orgSettings.some((s) => s.key === key);
  }

  function isLockedAtOrg(key: string): boolean {
    return orgSettings.find((s) => s.key === key)?.force_locked ?? false;
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 py-4">
        <button
          type="button"
          onClick={onBack}
          className="w-8 h-8 rounded-lg border border-[var(--color-border)] bg-white flex items-center justify-center text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]"
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
          onClick={() => setActiveTab("org")}
          className={`px-3.5 py-1.5 rounded-md text-[13px] font-medium transition-all whitespace-nowrap ${activeTab === "org" ? "bg-[var(--color-accent)] text-white" : "text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"}`}
        >
          Organization
        </button>
        {stores.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setActiveTab(s.id)}
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
        {/* 1. Work Hour Alerts */}
        <WorkHourAlertsSection
          getEffective={getEffectiveValue}
          isOverridden={isOverridden}
          isLocked={isLockedAtOrg}
          registry={registryByKey}
          scope={isStoreScope ? "store" : "org"}
          storeId={isStoreScope ? activeTab : undefined}
        />

        {/* 2. Weekly Limits */}
        <WeeklyLimitsSection
          getEffective={getEffectiveValue}
          isOverridden={isOverridden}
          isLocked={isLockedAtOrg}
          registry={registryByKey}
          scope={isStoreScope ? "store" : "org"}
          storeId={isStoreScope ? activeTab : undefined}
        />

        {/* 3. Approval Workflow */}
        <ApprovalSection
          getEffective={getEffectiveValue}
          isOverridden={isOverridden}
          isLocked={isLockedAtOrg}
          registry={registryByKey}
          scope={isStoreScope ? "store" : "org"}
          storeId={isStoreScope ? activeTab : undefined}
        />

        {/* 4. Break Rules */}
        <BreakRulesSection
          getEffective={getEffectiveValue}
          isOverridden={isOverridden}
          isLocked={isLockedAtOrg}
          registry={registryByKey}
          scope={isStoreScope ? "store" : "org"}
          storeId={isStoreScope ? activeTab : undefined}
        />

        {/* 5. Attendance */}
        <AttendanceSettingsSection
          getEffective={getEffectiveValue}
          isOverridden={isOverridden}
          isLocked={isLockedAtOrg}
          registry={registryByKey}
          scope={isStoreScope ? "store" : "org"}
          storeId={isStoreScope ? activeTab : undefined}
        />

        {/* Store-only sections */}
        {isStoreScope && activeStore && (
          <>
            {/* 6. Operating Hours */}
            <OperatingHoursSection store={activeStore} />

            {/* 7. Work Roles */}
            <Card title="Work Roles" subtitle="Shift × Position combinations with required headcount per day">
              <WorkRolesPanel storeId={activeTab} />
            </Card>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Reusable Card wrapper ───────────────────────────────

function Card({ title, subtitle, locked, children }: { title: string; subtitle?: string; locked?: boolean; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-[var(--color-border)] rounded-xl overflow-hidden">
      <div className="px-5 py-3 border-b border-[var(--color-border)] bg-[var(--color-bg)]/50">
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
      <div className="px-5 py-4">{children}</div>
    </div>
  );
}

// ─── Section base interface ──────────────────────────────

interface SectionCommonProps {
  getEffective: (key: string) => unknown;
  isOverridden: (key: string) => boolean;
  isLocked: (key: string) => boolean;
  registry: Map<string, SettingsRegistryEntry>;
  scope: "org" | "store";
  storeId?: string;
}

// ─── 1. Work Hour Alerts ─────────────────────────────────

function WorkHourAlertsSection(props: SectionCommonProps) {
  const NORMAL_KEY = "schedule.work_hour_alert.normal_max";
  const CAUTION_KEY = "schedule.work_hour_alert.caution_max";

  const upsertOrg = useUpsertOrgSetting();
  const upsertStore = useUpsertStoreSetting(props.storeId ?? "");

  const initialNormal = Number(props.getEffective(NORMAL_KEY) ?? 5.5);
  const initialCaution = Number(props.getEffective(CAUTION_KEY) ?? 7.5);

  const [normalMax, setNormalMax] = useState(initialNormal);
  const [cautionMax, setCautionMax] = useState(initialCaution);

  useEffect(() => {
    setNormalMax(Number(props.getEffective(NORMAL_KEY) ?? 5.5));
    setCautionMax(Number(props.getEffective(CAUTION_KEY) ?? 7.5));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.scope, props.storeId]);

  const locked = props.isLocked(NORMAL_KEY) || props.isLocked(CAUTION_KEY);
  const normalPct = Math.min(100, (normalMax / 12) * 100);
  const cautionPct = Math.min(100 - normalPct, ((cautionMax - normalMax) / 12) * 100);

  function save(key: string, value: number) {
    if (props.scope === "org") {
      upsertOrg.mutate({ key, value });
    } else if (props.storeId) {
      upsertStore.mutate({ key, value });
    }
  }

  return (
    <Card title="Work Hour Alerts" subtitle="Color thresholds for daily work hours" locked={locked}>
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
                disabled={locked}
                onChange={(e) => setNormalMax(Number(e.target.value))}
                onBlur={() => save(NORMAL_KEY, normalMax)}
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
                disabled={locked}
                onChange={(e) => setCautionMax(Number(e.target.value))}
                onBlur={() => save(CAUTION_KEY, cautionMax)}
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

  const upsertOrg = useUpsertOrgSetting();
  const upsertStore = useUpsertStoreSetting(props.storeId ?? "");

  const [limit, setLimit] = useState(Number(props.getEffective(LIMIT_KEY) ?? 40));
  const [warn, setWarn] = useState(Number(props.getEffective(WARN_KEY) ?? 35));

  useEffect(() => {
    setLimit(Number(props.getEffective(LIMIT_KEY) ?? 40));
    setWarn(Number(props.getEffective(WARN_KEY) ?? 35));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.scope, props.storeId]);

  const locked = props.isLocked(LIMIT_KEY) || props.isLocked(WARN_KEY);

  function save(key: string, value: number) {
    if (props.scope === "org") upsertOrg.mutate({ key, value });
    else if (props.storeId) upsertStore.mutate({ key, value });
  }

  return (
    <Card title="Weekly Hour Limits" subtitle="Maximum hours and overtime thresholds" locked={locked}>
      <div className="space-y-4">
        <div>
          <label className="text-[12px] font-medium text-[var(--color-text-secondary)] mb-1.5 block">Max weekly hours</label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={limit}
              disabled={locked}
              onChange={(e) => setLimit(Number(e.target.value))}
              onBlur={() => save(LIMIT_KEY, limit)}
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
              disabled={locked}
              onChange={(e) => setWarn(Number(e.target.value))}
              onBlur={() => save(WARN_KEY, warn)}
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

  const upsertOrg = useUpsertOrgSetting();
  const upsertStore = useUpsertStoreSetting(props.storeId ?? "");

  const required = Boolean(props.getEffective(REQ_KEY));
  const autoConfirm = Boolean(props.getEffective(AUTO_KEY));

  const locked = props.isLocked(REQ_KEY) || props.isLocked(AUTO_KEY);

  function toggle(key: string, value: boolean) {
    if (props.scope === "org") upsertOrg.mutate({ key, value });
    else if (props.storeId) upsertStore.mutate({ key, value });
  }

  return (
    <Card title="Approval Workflow" subtitle="Schedule approval requirements" locked={locked}>
      <div className="divide-y divide-[var(--color-border)]">
        <ToggleRow
          label="Require GM approval"
          description="All requested schedules need GM confirmation before activating"
          value={required}
          locked={locked}
          onChange={(v) => toggle(REQ_KEY, v)}
        />
        <ToggleRow
          label="Auto-confirm SV drafts"
          description="Automatically confirm schedules created in draft mode by SV+ users"
          value={autoConfirm}
          locked={locked}
          onChange={(v) => toggle(AUTO_KEY, v)}
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

function BreakRulesSection(props: SectionCommonProps) {
  const CONTINUOUS_KEY = "break.max_continuous_minutes";
  const DURATION_KEY = "break.duration_minutes";
  const DAILY_KEY = "break.max_daily_work_minutes";

  const upsertOrg = useUpsertOrgSetting();
  const upsertStore = useUpsertStoreSetting(props.storeId ?? "");

  const [maxContinuous, setMaxContinuous] = useState(Number(props.getEffective(CONTINUOUS_KEY) ?? 240));
  const [duration, setDuration] = useState(Number(props.getEffective(DURATION_KEY) ?? 30));
  const [maxDaily, setMaxDaily] = useState(Number(props.getEffective(DAILY_KEY) ?? 480));

  useEffect(() => {
    setMaxContinuous(Number(props.getEffective(CONTINUOUS_KEY) ?? 240));
    setDuration(Number(props.getEffective(DURATION_KEY) ?? 30));
    setMaxDaily(Number(props.getEffective(DAILY_KEY) ?? 480));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.scope, props.storeId]);

  const locked = props.isLocked(CONTINUOUS_KEY) || props.isLocked(DURATION_KEY) || props.isLocked(DAILY_KEY);

  function save(key: string, value: number) {
    if (props.scope === "org") upsertOrg.mutate({ key, value });
    else if (props.storeId) upsertStore.mutate({ key, value });
  }

  return (
    <Card title="Break Rules" subtitle="Continuous work limits and break duration" locked={locked}>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label className="text-[12px] font-medium text-[var(--color-text-secondary)] mb-1.5 block">Max continuous work</label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={maxContinuous}
              disabled={locked}
              onChange={(e) => setMaxContinuous(Number(e.target.value))}
              onBlur={() => save(CONTINUOUS_KEY, maxContinuous)}
              className="w-20 px-3 py-1.5 border border-[var(--color-border)] rounded-lg text-[13px] text-center disabled:opacity-50"
            />
            <span className="text-[13px] text-[var(--color-text-muted)]">min</span>
          </div>
        </div>
        <div>
          <label className="text-[12px] font-medium text-[var(--color-text-secondary)] mb-1.5 block">Default break</label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={duration}
              disabled={locked}
              onChange={(e) => setDuration(Number(e.target.value))}
              onBlur={() => save(DURATION_KEY, duration)}
              className="w-20 px-3 py-1.5 border border-[var(--color-border)] rounded-lg text-[13px] text-center disabled:opacity-50"
            />
            <span className="text-[13px] text-[var(--color-text-muted)]">min</span>
          </div>
        </div>
        <div>
          <label className="text-[12px] font-medium text-[var(--color-text-secondary)] mb-1.5 block">Max daily work</label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={maxDaily}
              disabled={locked}
              onChange={(e) => setMaxDaily(Number(e.target.value))}
              onBlur={() => save(DAILY_KEY, maxDaily)}
              className="w-20 px-3 py-1.5 border border-[var(--color-border)] rounded-lg text-[13px] text-center disabled:opacity-50"
            />
            <span className="text-[13px] text-[var(--color-text-muted)]">min</span>
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

  const upsertOrg = useUpsertOrgSetting();
  const upsertStore = useUpsertStoreSetting(props.storeId ?? "");

  const [lateBuffer, setLateBuffer] = useState(Number(props.getEffective(LATE_KEY) ?? 5));
  const [earlyThresh, setEarlyThresh] = useState(Number(props.getEffective(EARLY_KEY) ?? 5));

  useEffect(() => {
    setLateBuffer(Number(props.getEffective(LATE_KEY) ?? 5));
    setEarlyThresh(Number(props.getEffective(EARLY_KEY) ?? 5));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.scope, props.storeId]);

  const locked = props.isLocked(LATE_KEY) || props.isLocked(EARLY_KEY);

  function save(key: string, value: number) {
    if (props.scope === "org") upsertOrg.mutate({ key, value });
    else if (props.storeId) upsertStore.mutate({ key, value });
  }

  return (
    <Card title="Attendance" subtitle="Late and early-leave detection thresholds" locked={locked}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="text-[12px] font-medium text-[var(--color-text-secondary)] mb-1.5 block">Late buffer</label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={lateBuffer}
              disabled={locked}
              onChange={(e) => setLateBuffer(Number(e.target.value))}
              onBlur={() => save(LATE_KEY, lateBuffer)}
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
              disabled={locked}
              onChange={(e) => setEarlyThresh(Number(e.target.value))}
              onBlur={() => save(EARLY_KEY, earlyThresh)}
              className="w-20 px-3 py-1.5 border border-[var(--color-border)] rounded-lg text-[13px] text-center disabled:opacity-50"
            />
            <span className="text-[13px] text-[var(--color-text-muted)]">min before end</span>
          </div>
        </div>
      </div>
    </Card>
  );
}

// ─── 6. Operating Hours (store only) ─────────────────────

function OperatingHoursSection({ store }: { store: Store }) {
  const updateStore = useUpdateStore();

  // store.day_start_time는 영업일 경계 시각 (예: 06:00). per-day 또는 all 모드.
  const dst = (store.day_start_time as Record<string, string> | null) ?? null;
  const [mode, setMode] = useState<"all" | "per_day">(() => {
    if (!dst) return "all";
    if (dst.all && Object.keys(dst).length === 1) return "all";
    return "per_day";
  });
  const [allTime, setAllTime] = useState<string>(dst?.all ?? "06:00");
  const [perDay, setPerDay] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = { sun: "06:00", mon: "06:00", tue: "06:00", wed: "06:00", thu: "06:00", fri: "06:00", sat: "06:00" };
    if (dst) {
      for (const k of Object.keys(init)) {
        if (dst[k]) init[k] = dst[k];
      }
    }
    return init;
  });

  useEffect(() => {
    const fresh = (store.day_start_time as Record<string, string> | null) ?? null;
    if (!fresh) return;
    if (fresh.all && Object.keys(fresh).length === 1) {
      setMode("all");
      setAllTime(fresh.all);
    } else {
      setMode("per_day");
      const merged: Record<string, string> = { sun: "06:00", mon: "06:00", tue: "06:00", wed: "06:00", thu: "06:00", fri: "06:00", sat: "06:00" };
      for (const k of Object.keys(merged)) {
        if (fresh[k]) merged[k] = fresh[k];
      }
      setPerDay(merged);
    }
  }, [store.day_start_time]);

  function handleSave() {
    const payload = mode === "all" ? { all: allTime } : perDay;
    updateStore.mutate({ id: store.id, day_start_time: payload });
  }

  return (
    <Card title="Operating Hours" subtitle="Business day start time (영업일 경계 시각). Affects daily view and attendance day boundary.">
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setMode("all")}
            className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-colors ${mode === "all" ? "bg-[var(--color-accent)] text-white" : "bg-[var(--color-bg)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]"}`}
          >
            Same time every day
          </button>
          <button
            type="button"
            onClick={() => setMode("per_day")}
            className={`px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-colors ${mode === "per_day" ? "bg-[var(--color-accent)] text-white" : "bg-[var(--color-bg)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]"}`}
          >
            Per day
          </button>
        </div>

        {mode === "all" ? (
          <div>
            <label className="text-[12px] font-medium text-[var(--color-text-secondary)] mb-1.5 block">Day start time</label>
            <input
              type="time"
              value={allTime}
              onChange={(e) => setAllTime(e.target.value)}
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
                  onChange={(e) => setPerDay((prev) => ({ ...prev, [d]: e.target.value }))}
                  className="w-full px-2 py-1 border border-[var(--color-border)] rounded text-[12px]"
                />
              </div>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={handleSave}
          disabled={updateStore.isPending}
          className="px-4 py-2 rounded-lg text-[12px] font-semibold bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
        >
          {updateStore.isPending ? "Saving…" : "Save Operating Hours"}
        </button>
      </div>
    </Card>
  );
}
