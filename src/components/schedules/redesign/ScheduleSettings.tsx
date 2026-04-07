"use client";

/**
 * ScheduleSettings — server Settings Registry 직접 사용.
 *
 * 클라이언트에서 KNOWN_SETTING_KEYS 목록을 정의 (admin 측 합의된 항목).
 * 각 키에 대해:
 * - useResolveSetting 으로 현재 값 표시
 * - 변경 시 useUpsertOrgSetting / useUpsertStoreSetting
 * - 매장 탭은 useStores로 실 매장 목록
 *
 * Settings Registry 테이블이 비어있으면 "Add definition" empty state.
 */

import { useState, useEffect, useMemo } from "react";
import { useStores } from "@/hooks/useStores";
import {
  useSettingsRegistry,
  useOrgSettings,
  useStoreSettings,
  useUpsertOrgSetting,
  useUpsertStoreSetting,
  useDeleteOrgSetting,
  useDeleteStoreSetting,
  type SettingsRegistryEntry,
} from "@/hooks/useSettings";

interface Props {
  showLabor?: boolean;
  onBack: () => void;
}

/**
 * 클라이언트가 관리하고 싶은 setting key 카탈로그.
 * 실제 server Settings Registry에 row가 있어야 사용 가능.
 * 없으면 "Add definition" 안내.
 */
const KNOWN_SETTING_KEYS: Array<{ key: string; label: string; description: string; type: "number" | "boolean" | "string"; category: string }> = [
  { key: "schedule.work_hour_alert.normal_max", label: "Normal hours per day", description: "Hours considered normal for a single shift", type: "number", category: "Work Hour Alerts" },
  { key: "schedule.work_hour_alert.caution_max", label: "Caution threshold", description: "Hours after which a shift is flagged as caution", type: "number", category: "Work Hour Alerts" },
  { key: "schedule.weekly_limit", label: "Weekly hour limit", description: "Max scheduled hours per user per week", type: "number", category: "Weekly Limits" },
  { key: "schedule.approval_required", label: "Require GM approval", description: "All requested schedules need GM confirmation", type: "boolean", category: "Approval Workflow" },
  { key: "break.max_continuous_minutes", label: "Max continuous work (min)", description: "Continuous work without break before warning", type: "number", category: "Break Rules" },
  { key: "break.duration_minutes", label: "Default break duration (min)", description: "Default unpaid break length", type: "number", category: "Break Rules" },
];

export function ScheduleSettings({ onBack }: Props) {
  const storesQ = useStores();
  const stores = storesQ.data ?? [];
  const [activeTab, setActiveTab] = useState<"org" | string>("org");

  // 첫 store 자동 선택 안 함 — org가 default

  const registryQ = useSettingsRegistry();
  const registryEntries: SettingsRegistryEntry[] = registryQ.data ?? [];
  const registryByKey = useMemo(() => {
    const m = new Map<string, SettingsRegistryEntry>();
    registryEntries.forEach((e) => m.set(e.key, e));
    return m;
  }, [registryEntries]);

  const orgSettingsQ = useOrgSettings();
  const storeSettingsQ = useStoreSettings(activeTab !== "org" ? activeTab : undefined);

  // 카테고리별 그룹핑
  const categoryGroups = useMemo(() => {
    const groups: Record<string, typeof KNOWN_SETTING_KEYS> = {};
    KNOWN_SETTING_KEYS.forEach((s) => {
      const c = s.category;
      if (!groups[c]) groups[c] = [];
      groups[c].push(s);
    });
    return groups;
  }, []);

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
          <p className="text-[12px] text-[var(--color-text-muted)]">Manage scheduling rules and policies</p>
        </div>
      </div>

      {/* Scope tabs (Org + each Store) */}
      <div className="flex items-center gap-1 mb-4 border-b border-[var(--color-border)]">
        <button
          type="button"
          onClick={() => setActiveTab("org")}
          className={`px-4 py-2 text-[13px] font-semibold border-b-2 transition-colors ${activeTab === "org" ? "border-[var(--color-accent)] text-[var(--color-accent)]" : "border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"}`}
        >
          Organization
        </button>
        {stores.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setActiveTab(s.id)}
            className={`px-4 py-2 text-[13px] font-semibold border-b-2 transition-colors ${activeTab === s.id ? "border-[var(--color-accent)] text-[var(--color-accent)]" : "border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"}`}
          >
            {s.name}
          </button>
        ))}
        {storesQ.isLoading && <span className="text-[11px] text-[var(--color-text-muted)] px-2">Loading stores…</span>}
      </div>

      {/* Empty Registry warning */}
      {registryEntries.length === 0 && !registryQ.isLoading && (
        <div className="bg-[var(--color-warning-muted)] border border-[var(--color-warning)]/30 rounded-xl p-4 mb-4">
          <div className="text-[13px] font-semibold text-[var(--color-warning)] mb-1">Settings Registry is empty</div>
          <div className="text-[12px] text-[var(--color-text-secondary)]">
            No setting definitions exist on the server yet. Settings below will show as "Not registered" until a registry entry is created (via API or seed). Use <code className="bg-white px-1 rounded text-[11px]">PUT /api/v1/admin/settings/registry</code> to add a definition.
          </div>
        </div>
      )}

      {/* Sections by category */}
      <div className="space-y-4">
        {Object.entries(categoryGroups).map(([category, keys]) => (
          <div key={category} className="bg-white border border-[var(--color-border)] rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-[var(--color-border)] bg-[var(--color-bg)]">
              <h2 className="text-[13px] font-bold text-[var(--color-text)]">{category}</h2>
            </div>
            <div className="divide-y divide-[var(--color-border)]">
              {keys.map((known) => {
                const registry = registryByKey.get(known.key);
                return (
                  <SettingRow
                    key={known.key}
                    knownKey={known.key}
                    label={known.label}
                    description={known.description}
                    valueType={known.type}
                    registry={registry}
                    scope={activeTab === "org" ? "org" : "store"}
                    storeId={activeTab !== "org" ? activeTab : undefined}
                    orgSettings={orgSettingsQ.data ?? []}
                    storeSettings={storeSettingsQ.data ?? []}
                  />
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Single setting row ──────────────────────────────────

interface RowProps {
  knownKey: string;
  label: string;
  description: string;
  valueType: "number" | "boolean" | "string";
  registry: SettingsRegistryEntry | undefined;
  scope: "org" | "store";
  storeId?: string;
  orgSettings: { id: string; key: string; value: unknown; force_locked: boolean }[];
  storeSettings: { id: string; key: string; value: unknown }[];
}

function SettingRow({ knownKey, label, description, valueType, registry, scope, storeId, orgSettings, storeSettings }: RowProps) {
  const orgSetting = orgSettings.find((s) => s.key === knownKey);
  const storeSetting = storeSettings.find((s) => s.key === knownKey);

  const upsertOrg = useUpsertOrgSetting();
  const deleteOrg = useDeleteOrgSetting();
  const upsertStore = useUpsertStoreSetting(storeId ?? "");
  const deleteStore = useDeleteStoreSetting(storeId ?? "");

  const currentSetting = scope === "org" ? orgSetting : storeSetting;
  const currentValue = currentSetting?.value;
  const isLocked = scope === "store" && (orgSetting?.force_locked ?? false);

  const [draft, setDraft] = useState<string>("");
  const [forceLocked, setForceLocked] = useState<boolean>(orgSetting?.force_locked ?? false);

  // current value를 draft에 반영
  useEffect(() => {
    if (currentValue === undefined || currentValue === null) {
      setDraft("");
    } else if (typeof currentValue === "boolean") {
      setDraft(currentValue ? "true" : "false");
    } else {
      setDraft(String(currentValue));
    }
  }, [currentValue]);

  useEffect(() => {
    setForceLocked(orgSetting?.force_locked ?? false);
  }, [orgSetting]);

  const isOverridden = currentSetting !== undefined;
  const notRegistered = !registry;

  function parseValue(): unknown {
    if (valueType === "number") {
      const n = Number(draft);
      return Number.isNaN(n) ? null : n;
    }
    if (valueType === "boolean") {
      return draft === "true";
    }
    return draft;
  }

  function handleSave() {
    if (!registry) {
      window.alert(`Setting "${knownKey}" is not registered on the server. Add it via Settings Registry first.`);
      return;
    }
    const value = parseValue();
    if (scope === "org") {
      upsertOrg.mutate({ key: knownKey, value, force_locked: forceLocked });
    } else if (storeId) {
      upsertStore.mutate({ key: knownKey, value });
    }
  }

  function handleClear() {
    if (scope === "org") {
      deleteOrg.mutate(knownKey);
    } else if (storeId) {
      deleteStore.mutate(knownKey);
    }
  }

  return (
    <div className="px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold text-[var(--color-text)]">{label}</span>
            {notRegistered && (
              <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-[var(--color-warning-muted)] text-[var(--color-warning)]">
                Not Registered
              </span>
            )}
            {isLocked && (
              <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-[var(--color-danger-muted)] text-[var(--color-danger)]">
                Locked by Org
              </span>
            )}
            {isOverridden && (
              <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-[var(--color-accent-muted)] text-[var(--color-accent)]">
                {scope === "org" ? "Org override" : "Store override"}
              </span>
            )}
          </div>
          <div className="text-[11px] text-[var(--color-text-muted)] mt-0.5">{description}</div>
          <div className="text-[10px] text-[var(--color-text-muted)] mt-0.5 font-mono">{knownKey}</div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {valueType === "boolean" ? (
            <select
              value={draft || "false"}
              onChange={(e) => setDraft(e.target.value)}
              disabled={isLocked}
              className="px-2 py-1 border border-[var(--color-border)] rounded text-[12px] bg-white disabled:opacity-50"
            >
              <option value="false">Off</option>
              <option value="true">On</option>
            </select>
          ) : (
            <input
              type={valueType === "number" ? "number" : "text"}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              disabled={isLocked}
              placeholder="—"
              className="w-24 px-2 py-1 border border-[var(--color-border)] rounded text-[12px] bg-white disabled:opacity-50"
            />
          )}
          {scope === "org" && (
            <label className="flex items-center gap-1 text-[10px] text-[var(--color-text-muted)] whitespace-nowrap" title="Lock to prevent store-level override">
              <input
                type="checkbox"
                checked={forceLocked}
                onChange={(e) => setForceLocked(e.target.checked)}
                className="w-3 h-3"
              />
              Lock
            </label>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={isLocked || notRegistered || upsertOrg.isPending || upsertStore.isPending}
            className="px-2.5 py-1 rounded text-[11px] font-semibold bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Save
          </button>
          {isOverridden && (
            <button
              type="button"
              onClick={handleClear}
              disabled={isLocked}
              className="px-2.5 py-1 rounded text-[11px] font-semibold border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)] disabled:opacity-50"
              title="Remove override (use parent default)"
            >
              Clear
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
