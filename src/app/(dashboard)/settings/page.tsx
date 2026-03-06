"use client";

/**
 * 조직 설정 페이지 — 타임존 등 조직 수준 설정을 관리합니다.
 *
 * Organization Settings Page — Manages organization-level settings like timezone.
 */

import React, { useState, useEffect } from "react";
import { Building2 } from "lucide-react";
import { useOrganization, useUpdateOrganization } from "@/hooks";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useToast } from "@/components/ui/Toast";
import { parseApiError } from "@/lib/utils";
import { TIMEZONE_OPTIONS } from "@/lib/timezones";

export default function SettingsPage(): React.ReactElement {
  const { toast } = useToast();
  const { data: org, isLoading } = useOrganization();
  const updateOrg = useUpdateOrganization();

  const [timezone, setTimezone] = useState<string>("");

  useEffect(() => {
    if (org) {
      setTimezone(org.timezone || "");
    }
  }, [org]);

  const handleSave = async (): Promise<void> => {
    if (!timezone) {
      toast({ type: "error", message: "Please select a timezone." });
      return;
    }
    try {
      await updateOrg.mutateAsync({ timezone });
      toast({ type: "success", message: "Organization timezone updated!" });
    } catch (err) {
      toast({ type: "error", message: parseApiError(err, "Failed to update timezone.") });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-extrabold text-text mb-6">Settings</h1>

      <div className="bg-card border border-border rounded-xl p-6 max-w-lg">
        <div className="flex items-center gap-2 mb-4">
          <Building2 className="h-5 w-5 text-accent" />
          <h2 className="text-lg font-bold text-text">Organization</h2>
        </div>

        <div className="space-y-4">
          <div>
            <p className="text-sm text-text-secondary mb-1">Name</p>
            <p className="text-text font-medium">{org?.name || "—"}</p>
          </div>

          <Select
            label="Timezone"
            value={timezone}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
              setTimezone(e.target.value)
            }
            options={TIMEZONE_OPTIONS}
            placeholder="Select timezone"
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
        </div>
      </div>
    </div>
  );
}
