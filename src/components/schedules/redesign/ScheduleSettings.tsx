"use client";

/**
 * ScheduleSettings — server settings_registry를 single source of truth로 사용.
 *
 * 클라이언트 하드코딩 카탈로그 없음. server registry에서 받은 entries를
 * 카테고리별로 그룹핑해서 렌더링. 각 entry는 default_value/value_type/levels를
 * 직접 가지고 있으므로 클라이언트는 single render path만 있으면 됨.
 *
 * Org/Store override 처리:
 * - 활성 탭이 'org' → org_settings에서 lookup → 없으면 default_value
 * - 활성 탭이 store id → store_settings → org_settings → default_value
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
  type OrgSettingEntry,
  type StoreSettingEntry,
} from "@/hooks/useSettings";

interface Props {
  showLabor?: boolean;
  onBack: () => void;
}

export function ScheduleSettings({ onBack }: Props) {
  const storesQ = useStores();
  const stores = storesQ.data ?? [];
  const [activeTab, setActiveTab] = useState<"org" | string>("org");

  const registryQ = useSettingsRegistry();
  const registryEntries: SettingsRegistryEntry[] = registryQ.data ?? [];

  const orgSettingsQ = useOrgSettings();
  const storeSettingsQ = useStoreSettings(activeTab !== "org" ? activeTab : undefined);
  const orgSettings: OrgSettingEntry[] = orgSettingsQ.data ?? [];
  const storeSettings: StoreSettingEntry[] = storeSettingsQ.data ?? [];

  // 카테고리별 그룹핑 (server registry 데이터 그대로)
  const categoryGroups = useMemo(() => {
    const groups = new Map<string, SettingsRegistryEntry[]>();
    registryEntries.forEach((e) => {
      const cat = e.category ?? "Other";
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat)!.push(e);
    });
    return groups;
  }, [registryEntries]);

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
      <div className="flex items-center gap-1 mb-4 border-b border-[var(--color-border)] overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveTab("org")}
          className={`px-4 py-2 text-[13px] font-semibold border-b-2 transition-colors whitespace-nowrap ${activeTab === "org" ? "border-[var(--color-accent)] text-[var(--color-accent)]" : "border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"}`}
        >
          Organization
        </button>
        {stores.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setActiveTab(s.id)}
            className={`px-4 py-2 text-[13px] font-semibold border-b-2 transition-colors whitespace-nowrap ${activeTab === s.id ? "border-[var(--color-accent)] text-[var(--color-accent)]" : "border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"}`}
          >
            {s.name}
          </button>
        ))}
        {storesQ.isLoading && <span className="text-[11px] text-[var(--color-text-muted)] px-2 py-2">Loading stores…</span>}
      </div>

      {/* Loading / empty registry */}
      {registryQ.isLoading && (
        <div className="text-[12px] text-[var(--color-text-muted)] italic py-8 text-center">Loading settings…</div>
      )}
      {!registryQ.isLoading && registryEntries.length === 0 && (
        <div className="bg-[var(--color-warning-muted)] border border-[var(--color-warning)]/30 rounded-xl p-4">
          <div className="text-[13px] font-semibold text-[var(--color-warning)] mb-1">Settings Registry is empty</div>
          <div className="text-[12px] text-[var(--color-text-secondary)]">
            No setting definitions exist on the server. Restart the server — startup hook should auto-seed defaults.
          </div>
        </div>
      )}

      {/* Sections by category */}
      <div className="space-y-4">
        {Array.from(categoryGroups.entries()).map(([category, entries]) => (
          <div key={category} className="bg-white border border-[var(--color-border)] rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-[var(--color-border)] bg-[var(--color-bg)]">
              <h2 className="text-[13px] font-bold text-[var(--color-text)]">{category}</h2>
            </div>
            <div className="divide-y divide-[var(--color-border)]">
              {entries.map((entry) => (
                <SettingRow
                  key={entry.key}
                  registry={entry}
                  scope={activeTab === "org" ? "org" : "store"}
                  storeId={activeTab !== "org" ? activeTab : undefined}
                  orgSettings={orgSettings}
                  storeSettings={storeSettings}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Single setting row ──────────────────────────────────

interface RowProps {
  registry: SettingsRegistryEntry;
  scope: "org" | "store";
  storeId?: string;
  orgSettings: OrgSettingEntry[];
  storeSettings: StoreSettingEntry[];
}

function SettingRow({ registry, scope, storeId, orgSettings, storeSettings }: RowProps) {
  const orgSetting = orgSettings.find((s) => s.key === registry.key);
  const storeSetting = storeSettings.find((s) => s.key === registry.key);

  const upsertOrg = useUpsertOrgSetting();
  const deleteOrg = useDeleteOrgSetting();
  const upsertStore = useUpsertStoreSetting(storeId ?? "");
  const deleteStore = useDeleteStoreSetting(storeId ?? "");

  const currentSetting = scope === "org" ? orgSetting : storeSetting;
  const currentValue = currentSetting?.value;
  const isLocked = scope === "store" && (orgSetting?.force_locked ?? false);
  const isOverridden = currentSetting !== undefined;

  // 표시할 값: override > org > default
  const effectiveValue = useMemo(() => {
    if (currentValue !== undefined && currentValue !== null) return currentValue;
    if (scope === "store" && orgSetting?.value !== undefined && orgSetting.value !== null) return orgSetting.value;
    return registry.default_value;
  }, [currentValue, orgSetting, scope, registry.default_value]);

  const [draft, setDraft] = useState<string>("");
  const [forceLocked, setForceLocked] = useState<boolean>(orgSetting?.force_locked ?? false);

  // currentValue / effectiveValue 동기화
  useEffect(() => {
    const v = effectiveValue;
    if (v === undefined || v === null) {
      setDraft("");
    } else if (typeof v === "boolean") {
      setDraft(v ? "true" : "false");
    } else {
      setDraft(String(v));
    }
  }, [effectiveValue]);

  useEffect(() => {
    setForceLocked(orgSetting?.force_locked ?? false);
  }, [orgSetting]);

  function parseValue(): unknown {
    if (registry.value_type === "number") {
      const n = Number(draft);
      return Number.isNaN(n) ? null : n;
    }
    if (registry.value_type === "boolean") {
      return draft === "true";
    }
    if (registry.value_type === "json") {
      try { return JSON.parse(draft); } catch { return draft; }
    }
    return draft;
  }

  function handleSave() {
    const value = parseValue();
    if (scope === "org") {
      upsertOrg.mutate({ key: registry.key, value, force_locked: forceLocked });
    } else if (storeId) {
      upsertStore.mutate({ key: registry.key, value });
    }
  }

  function handleClear() {
    if (scope === "org") {
      deleteOrg.mutate(registry.key);
    } else if (storeId) {
      deleteStore.mutate(registry.key);
    }
  }

  // levels에 현재 scope가 허용되는지 체크
  const scopeAllowed = registry.levels.includes(scope);

  return (
    <div className="px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13px] font-semibold text-[var(--color-text)]">{registry.label}</span>
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
            {!scopeAllowed && (
              <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-[var(--color-bg)] text-[var(--color-text-muted)]">
                Read-only at this scope
              </span>
            )}
          </div>
          {registry.description && (
            <div className="text-[11px] text-[var(--color-text-muted)] mt-0.5">{registry.description}</div>
          )}
          <div className="text-[10px] text-[var(--color-text-muted)] mt-0.5 font-mono">{registry.key}</div>
          {!isOverridden && (
            <div className="text-[10px] text-[var(--color-text-muted)] mt-0.5 italic">
              Default: <span className="font-mono">{JSON.stringify(registry.default_value)}</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {registry.value_type === "boolean" ? (
            <select
              value={draft || "false"}
              onChange={(e) => setDraft(e.target.value)}
              disabled={isLocked || !scopeAllowed}
              className="px-2 py-1 border border-[var(--color-border)] rounded text-[12px] bg-white disabled:opacity-50"
            >
              <option value="false">Off</option>
              <option value="true">On</option>
            </select>
          ) : (
            <input
              type={registry.value_type === "number" ? "number" : "text"}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              disabled={isLocked || !scopeAllowed}
              placeholder="—"
              className="w-24 px-2 py-1 border border-[var(--color-border)] rounded text-[12px] bg-white disabled:opacity-50"
            />
          )}
          {scope === "org" && scopeAllowed && (
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
            disabled={isLocked || !scopeAllowed || upsertOrg.isPending || upsertStore.isPending}
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
