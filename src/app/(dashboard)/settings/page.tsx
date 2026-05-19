"use client";

/**
 * 조직 설정 페이지 — 타임존 등 조직 수준 설정을 관리합니다.
 *
 * Organization Settings Page — Manages organization-level settings like timezone.
 * Also includes Account Security section for password management.
 */

import React, { useState, useEffect } from "react";
import { Building2, Lock, Languages, ShieldCheck } from "lucide-react";
import { useOrganization, useUpdateOrganization } from "@/hooks";
import {
  useSuperOwnerStatus,
  useTransferSuperOwner,
} from "@/hooks/useSuperOwner";
import {
  TransferSuperOwnerForm,
  type TransferSuperOwnerResult,
} from "@/components/settings/TransferSuperOwnerForm";
import { parseApiError } from "@/lib/utils";
import { useAuthStore } from "@/stores/authStore";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useModal } from "@/components/ui/imperative-modal";
import { formatDate } from "@/lib/utils";
import { TIMEZONE_OPTIONS } from "@/lib/timezones";
import { ChangePasswordModal } from "@/components/auth/ChangePasswordModal";
import { AlertPreferencesSection } from "@/components/settings/AlertPreferencesSection";
import { useTimezone } from "@/hooks";
import { usePermissions } from "@/hooks/usePermissions";
import { PERMISSIONS } from "@/lib/permissions";
import { useUpdatePreferredLanguage } from "@/hooks/useProfile";
import type { PreferredLanguage } from "@/types";

const LANGUAGE_OPTIONS = [
  { value: "en", label: "English" },
  { value: "es", label: "Español" },
  { value: "ko", label: "한국어" },
];

export default function SettingsPage(): React.ReactElement {
  const modal = useModal();
  const { data: org, isLoading } = useOrganization();
  const updateOrg = useUpdateOrganization();
  const user = useAuthStore((s) => s.user);
  const tz = useTimezone();
  const { hasPermission, isOwner } = usePermissions();
  const canEdit = hasPermission(PERMISSIONS.ORG_UPDATE);
  const canTransferSuperOwner = hasPermission(PERMISSIONS.SUPER_OWNER_TRANSFER);
  const logout = useAuthStore((s) => s.logout);
  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);

  const { data: superOwnerStatus } = useSuperOwnerStatus();
  const transferSuperOwner = useTransferSuperOwner();

  const handleTransferSuperOwner = async (): Promise<void> => {
    const result = await modal.open<TransferSuperOwnerResult | null>(
      ({ close }) => <TransferSuperOwnerForm close={close} />,
      { title: "Transfer Super Owner", size: "md", closeOnBackdrop: false },
    );
    if (!result) return;
    try {
      const data = await transferSuperOwner.mutateAsync(result);
      await modal.alert({
        type: "success",
        title: "Transfer Complete",
        message: `${data.message} You will be logged out now.`,
      });
      logout();
    } catch (err) {
      void modal.alert({
        type: "error",
        message: parseApiError(err, "Failed to transfer Super Owner"),
      });
    }
  };


  const [timezone, setTimezone] = useState<string>("");
  const [defaultHourlyRate, setDefaultHourlyRate] = useState<string>("");
  const updateLanguage = useUpdatePreferredLanguage();
  const [language, setLanguage] = useState<PreferredLanguage>(user?.preferred_language ?? "en");
  useEffect(() => {
    if (user?.preferred_language) setLanguage(user.preferred_language);
  }, [user?.preferred_language]);

  useEffect(() => {
    if (org) {
      setTimezone(org.timezone || "");
      setDefaultHourlyRate(org.default_hourly_rate > 0 ? String(org.default_hourly_rate) : "");
    }
  }, [org]);

  const handleSave = async (): Promise<void> => {
    if (!timezone) {
      void modal.alert({ type: "error", message: "Please select a timezone." });
      return;
    }
    const rateStr = defaultHourlyRate.trim();
    const rateVal = rateStr === "" ? null : Number(rateStr);
    if (rateVal !== null && (isNaN(rateVal) || rateVal < 0)) {
      void modal.alert({ type: "error", message: "Default hourly rate must be a positive number." });
      return;
    }
    try {
      await updateOrg.mutateAsync({ timezone, default_hourly_rate: rateVal });
    } catch {
      // hook 자동 모달
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  const lastChangedLabel = user?.password_changed_at
    ? `Last changed: ${formatDate(user.password_changed_at, tz)}`
    : "Last changed: Never";

  return (
    <div>
      <h1 className="text-2xl font-extrabold text-text mb-6">Settings</h1>

      {/* Organization 섹션 */}
      <div className="bg-card border border-border rounded-xl p-6 max-w-lg mb-4">
        <div className="flex items-center gap-2 mb-4">
          <Building2 className="h-5 w-5 text-accent" />
          <h2 className="text-lg font-bold text-text">Organization</h2>
        </div>

        <div className="space-y-4">
          <div>
            <p className="text-sm text-text-secondary mb-1">Name</p>
            <p className="text-text font-medium">{org?.name || "—"}</p>
          </div>

          {canEdit ? (
            <>
              <Select
                label="Timezone"
                value={timezone}
                onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                  setTimezone(e.target.value)
                }
                options={TIMEZONE_OPTIONS}
                placeholder="Select timezone"
              />

              <Input
                label="Default Hourly Rate (optional)"
                type="number"
                min="0"
                step="0.01"
                placeholder="e.g. 15.00"
                value={defaultHourlyRate}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setDefaultHourlyRate(e.target.value)
                }
              />

              <div className="flex justify-end pt-2">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleSave}
                  isLoading={updateOrg.isPending}
                  disabled={!timezone}
                >
                  Save
                </Button>
              </div>
            </>
          ) : (
            <>
              <div>
                <p className="text-sm text-text-secondary mb-1">Timezone</p>
                <p className="text-text font-medium">
                  {TIMEZONE_OPTIONS.find((t) => t.value === timezone)?.label || timezone || "—"}
                </p>
              </div>

              <div>
                <p className="text-sm text-text-secondary mb-1">Default Hourly Rate</p>
                <p className="text-text font-medium">
                  {defaultHourlyRate ? `$${defaultHourlyRate}/hr` : "—"}
                </p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Personal Preferences 섹션 */}
      <div className="bg-card border border-border rounded-xl p-6 max-w-lg mb-4">
        <div className="flex items-center gap-2 mb-1">
          <Languages className="h-5 w-5 text-accent" />
          <h2 className="text-lg font-bold text-text">Personal Preferences</h2>
        </div>
        <p className="text-sm text-text-secondary mb-5">
          We use this to personalize content. UI translation is coming later.
        </p>
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <Select
              label="Preferred Language"
              value={language}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
                setLanguage(e.target.value as PreferredLanguage)
              }
              options={LANGUAGE_OPTIONS}
            />
          </div>
          <Button
            variant="primary"
            size="sm"
            isLoading={updateLanguage.isPending}
            disabled={!user || language === user.preferred_language}
            onClick={async () => {
              try {
                await updateLanguage.mutateAsync(language);
              } catch {
                // hook 자동 모달
              }
            }}
          >
            Save
          </Button>
        </div>
      </div>

      {/* Alert Preferences 섹션 */}
      <AlertPreferencesSection />

      {/* Super Owner 섹션 — Owner 이상에게 정보 표시, Super Owner 본인은 Transfer 가능 */}
      {isOwner && (
        <div className="bg-card border border-border rounded-xl p-6 max-w-lg mb-4">
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck className="h-5 w-5 text-accent" />
            <h2 className="text-lg font-bold text-text">Super Owner</h2>
          </div>
          <p className="text-sm text-text-secondary mb-5">
            Organization-level admin account, auto-created at setup (separate from store operations). One per organization. Only the Super Owner can transfer ownership or delete the organization.
          </p>

          <div className="flex items-center justify-between px-4 py-3 bg-surface rounded-lg">
            <div>
              <p className="text-sm font-semibold text-text">
                {superOwnerStatus?.username ?? "—"}
              </p>
              <p className="text-xs text-text-muted mt-0.5">
                {canTransferSuperOwner
                  ? "You are the Super Owner."
                  : "Auto-created at organization setup."}
              </p>
            </div>
            {canTransferSuperOwner && (
              <Button
                variant="primary"
                size="sm"
                isLoading={transferSuperOwner.isPending}
                onClick={handleTransferSuperOwner}
              >
                Transfer
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Account Security 섹션 */}
      <div className="bg-card border border-border rounded-xl p-6 max-w-lg">
        <div className="flex items-center gap-2 mb-1">
          <Lock className="h-5 w-5 text-accent" />
          <h2 className="text-lg font-bold text-text">Account Security</h2>
        </div>
        <p className="text-sm text-text-secondary mb-5">
          Manage your password and login security.
        </p>

        <div className="flex items-center justify-between px-4 py-3 bg-surface rounded-lg">
          <div>
            <p className="text-sm font-semibold text-text">Password</p>
            <p className="text-xs text-text-muted mt-0.5">{lastChangedLabel}</p>
          </div>
          <Button
            variant="primary"
            size="sm"
            onClick={() => setIsChangePasswordOpen(true)}
          >
            Change Password
          </Button>
        </div>
      </div>

      <ChangePasswordModal
        isOpen={isChangePasswordOpen}
        onClose={() => setIsChangePasswordOpen(false)}
      />
    </div>
  );
}
