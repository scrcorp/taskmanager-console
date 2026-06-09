"use client";

import React, { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/authStore";
import { useTimezone } from "@/hooks/useTimezone";
import { todayInTimezone } from "@/lib/utils";
import { useWarning, useUpdateWarning, useWarnableUsers } from "@/hooks/useWarnings";
import { WarningDetailView } from "@/components/warnings/WarningDetailView";
import { WarningEditor, type WarningDraft } from "@/components/warnings/WarningEditor";

export default function WarningDetailPage(): React.ReactElement {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params.id;
  const tz = useTimezone();
  const today = todayInTimezone(tz);
  const user = useAuthStore((s) => s.user);

  const [editing, setEditing] = useState(false);
  const { data: w } = useWarning(id);
  const { data: warnable } = useWarnableUsers();
  const updateMut = useUpdateWarning();

  // Subject's stores (to let the Store picker change store while editing).
  const subjectStores = useMemo(() => {
    if (!w) return [];
    const fromWarnable = (warnable ?? []).find((u) => u.id === w.subject_user_id)?.stores;
    if (fromWarnable && fromWarnable.length) return fromWarnable;
    return w.store_id && w.store_name ? [{ id: w.store_id, name: w.store_name }] : [];
  }, [w, warnable]);

  const editInitial = useMemo<WarningDraft | null>(() => {
    if (!w) return null;
    return {
      subject_user_id: w.subject_user_id,
      subject_name: w.subject_name,
      employee_no: w.employee_no,
      store_id: w.store_id,
      store_name: w.store_name,
      employee_stores: subjectStores,
      title: w.title,
      categories: w.categories,
      details: w.details ?? "",
      corrective_action: w.corrective_action ?? "",
      warning_date: w.warning_date,
    };
  }, [w, subjectStores]);

  async function handleUpdate(d: WarningDraft): Promise<void> {
    if (!d.store_id) return;
    try {
      await updateMut.mutateAsync({
        warningId: id,
        data: {
          store_id: d.store_id,
          title: d.title.trim(),
          categories: d.categories,
          details: d.details.trim() || null,
          corrective_action: d.corrective_action.trim() || null,
          warning_date: d.warning_date,
        },
      });
      setEditing(false);
    } catch {
      /* hook surfaces error */
    }
  }

  if (editing && editInitial && w) {
    return (
      <div className="p-4 sm:p-6">
        <WarningEditor
          companyName={user?.organization_name}
          managerName={w.issued_by_name}
          initial={editInitial}
          today={today}
          lockEmployee
          saving={updateMut.isPending}
          submitLabel="Save changes"
          onBack={() => setEditing(false)}
          onSubmit={handleUpdate}
        />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6">
      <WarningDetailView warningId={id} onBack={() => router.push("/warnings")} onEdit={() => setEditing(true)} />
    </div>
  );
}
