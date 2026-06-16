"use client";

import React, { useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuthStore } from "@/stores/authStore";
import { useTimezone } from "@/hooks/useTimezone";
import { todayInTimezone } from "@/lib/utils";
import { useCreateWarning, useWarnableUsers } from "@/hooks/useWarnings";
import { usePermissions } from "@/hooks/usePermissions";
import { PERMISSIONS } from "@/lib/permissions";
import { LoadingSpinner } from "@/components/ui";
import { WarningEditor, emptyDraft, type WarningDraft } from "@/components/warnings/WarningEditor";

export default function NewWarningPage(): React.ReactElement | null {
  const router = useRouter();
  const searchParams = useSearchParams();
  const subjectParam = searchParams.get("subject");
  const tz = useTimezone();
  const today = todayInTimezone(tz);
  const user = useAuthStore((s) => s.user);
  const { hasPermission } = usePermissions();
  const createMut = useCreateWarning();
  const { data: warnable } = useWarnableUsers();

  const canCreate = hasPermission(PERMISSIONS.WARNINGS_CREATE);
  useEffect(() => {
    if (!canCreate) router.replace("/warnings");
  }, [canCreate, router]);

  // Prefill + lock the subject when arriving from a staff page (?subject=<id>).
  const lockedSubject = useMemo(
    () => (subjectParam ? (warnable ?? []).find((u) => u.id === subjectParam) ?? null : null),
    [warnable, subjectParam],
  );
  const initial = useMemo<WarningDraft>(() => {
    // Default issuer = the author (current user); an Owner may change it via the picker.
    const base: WarningDraft = { ...emptyDraft(today), issued_by_name: user?.full_name ?? "" };
    if (!lockedSubject) return base;
    return {
      ...base,
      subject_user_id: lockedSubject.id,
      subject_name: lockedSubject.full_name,
      employee_no: lockedSubject.employee_no,
      employee_stores: lockedSubject.stores,
      store_id: lockedSubject.store_id,
      store_name: lockedSubject.store_name,
    };
  }, [today, lockedSubject, user?.full_name]);

  async function handleSubmit(d: WarningDraft): Promise<void> {
    if (!d.subject_user_id || !d.store_id) return;
    try {
      const created = await createMut.mutateAsync({
        subject_user_id: d.subject_user_id,
        store_id: d.store_id,
        title: d.title.trim(),
        categories: d.categories,
        details: d.details.trim() || null,
        corrective_action: d.corrective_action.trim() || null,
        other_text: d.categories.includes("other") ? d.other_text.trim() || null : null,
        deadline: d.deadline || null,
        follow_up_date: d.follow_up_date || null,
        follow_up_time: d.follow_up_time || null,
        issued_by_id: d.issued_by_id ?? undefined,
        warning_date: d.warning_date,
        signature_method: d.signature_method,
      });
      router.replace(`/warnings/${created.id}`);
    } catch {
      /* hook surfaces error */
    }
  }

  if (!canCreate) return null;

  // When locking a subject, wait for the warnable list so the prefill is ready
  // before the editor captures its initial draft.
  if (subjectParam && warnable === undefined) {
    return (
      <div className="p-6 flex justify-center py-16">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6">
      <WarningEditor
        companyName={user?.organization_name}
        managerName={user?.full_name}
        initial={initial}
        today={today}
        lockEmployee={!!lockedSubject}
        saving={createMut.isPending}
        submitLabel="Save"
        onBack={() => router.push("/warnings")}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
