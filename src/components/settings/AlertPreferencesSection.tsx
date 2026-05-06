"use client";

/**
 * 알림 선호 설정 섹션 — 카테고리×채널(in-app/email) 격자 토글.
 *
 * 서버가 카테고리 메타와 현재 prefs 를 함께 내려준다. local state 로 편집한 뒤
 * Save 시 한 번에 PUT. Reset 으로 모든 카테고리 default(=on)로 복귀.
 */
import React, { useEffect, useMemo, useState } from "react";
import { Bell, RotateCcw } from "lucide-react";
import {
  useAlertPreferences,
  useUpdateAlertPreferences,
  type AlertCategoryChannel,
} from "@/hooks/useAlertPreferences";
import { Button } from "@/components/ui/Button";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

type LocalPrefs = Record<string, AlertCategoryChannel>;

/** prefs 가 비어있거나 명시 없을 때 default = true */
function readChannel(
  prefs: LocalPrefs,
  code: string,
  channel: "in_app" | "email",
): boolean {
  const v = prefs[code]?.[channel];
  return v === undefined || v === null ? true : Boolean(v);
}

function isDirty(local: LocalPrefs, server: LocalPrefs): boolean {
  return JSON.stringify(local) !== JSON.stringify(server);
}

export function AlertPreferencesSection(): React.ReactElement {
  const { data, isLoading, error } = useAlertPreferences();
  const update = useUpdateAlertPreferences();
  const [local, setLocal] = useState<LocalPrefs>({});

  const serverPrefs: LocalPrefs = useMemo(() => data?.preferences ?? {}, [data]);
  useEffect(() => {
    setLocal(serverPrefs);
  }, [serverPrefs]);

  const dirty = isDirty(local, serverPrefs);

  const setChannel = (code: string, channel: "in_app" | "email", value: boolean) => {
    setLocal((prev) => {
      const next: LocalPrefs = { ...prev, [code]: { ...prev[code], [channel]: value } };
      return next;
    });
  };

  const handleSave = async (): Promise<void> => {
    await update.mutateAsync({ preferences: local });
  };

  const handleReset = (): void => {
    setLocal({});
  };

  if (isLoading) {
    return (
      <div className="bg-card border border-border rounded-xl p-6 max-w-lg mb-4">
        <div className="flex items-center gap-2 mb-4">
          <Bell className="h-5 w-5 text-accent" />
          <h2 className="text-lg font-bold text-text">Alerts</h2>
        </div>
        <LoadingSpinner size="md" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-card border border-border rounded-xl p-6 max-w-lg mb-4">
        <div className="flex items-center gap-2 mb-4">
          <Bell className="h-5 w-5 text-accent" />
          <h2 className="text-lg font-bold text-text">Alerts</h2>
        </div>
        <p className="text-sm text-danger">Couldn&apos;t load alert preferences.</p>
      </div>
    );
  }

  return (
    <div className="bg-card border border-border rounded-xl p-6 max-w-lg mb-4">
      <div className="flex items-start justify-between mb-1 gap-2">
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-accent" />
          <h2 className="text-lg font-bold text-text">Alerts</h2>
        </div>
        <button
          type="button"
          onClick={handleReset}
          disabled={Object.keys(local).length === 0}
          className="flex items-center gap-1 text-xs text-text-muted hover:text-text disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          title="Reset all categories to default (everything on)"
        >
          <RotateCcw className="h-3 w-3" />
          Reset to default
        </button>
      </div>
      <p className="text-sm text-text-secondary mb-5">
        Choose which categories you receive in-app and via email. A dash (—) means
        email isn&apos;t available for that category.
      </p>

      {/* 격자 헤더 */}
      <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 gap-y-1 items-center">
        <div />
        <div className="text-[10px] font-bold uppercase tracking-wider text-text-muted text-center w-12">In-app</div>
        <div className="text-[10px] font-bold uppercase tracking-wider text-text-muted text-center w-12">Email</div>

        {data.categories.map((cat) => {
          const inApp = readChannel(local, cat.code, "in_app");
          const email = readChannel(local, cat.code, "email");
          return (
            <React.Fragment key={cat.code}>
              <div className="py-3 border-t border-border first:border-t-0 col-span-3 grid grid-cols-subgrid">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-text">{cat.label}</div>
                  <div className="text-xs text-text-muted mt-0.5 leading-snug">{cat.description}</div>
                </div>
                <div className="flex items-center justify-center">
                  <Toggle
                    checked={inApp}
                    onChange={(v) => setChannel(cat.code, "in_app", v)}
                  />
                </div>
                <div className="flex items-center justify-center">
                  {cat.email_available ? (
                    <Toggle
                      checked={email}
                      onChange={(v) => setChannel(cat.code, "email", v)}
                    />
                  ) : (
                    <span
                      className="text-text-muted text-sm select-none"
                      title="Email not available for this category"
                    >
                      —
                    </span>
                  )}
                </div>
              </div>
            </React.Fragment>
          );
        })}
      </div>

      <div className="flex justify-end pt-4 mt-2 border-t border-border">
        <Button
          variant="primary"
          size="sm"
          onClick={handleSave}
          isLoading={update.isPending}
          disabled={!dirty}
        >
          Save
        </Button>
      </div>
    </div>
  );
}

interface ToggleProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}

function Toggle({ checked, onChange, disabled }: ToggleProps): React.ReactElement {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
        disabled
          ? "bg-border cursor-not-allowed opacity-40"
          : checked
            ? "bg-accent cursor-pointer"
            : "bg-border cursor-pointer hover:bg-text-muted"
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
          checked ? "translate-x-5" : "translate-x-1"
        }`}
      />
    </button>
  );
}
