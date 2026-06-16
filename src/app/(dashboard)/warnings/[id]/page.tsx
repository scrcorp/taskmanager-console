"use client";

import React, { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/authStore";
import { useTimezone } from "@/hooks/useTimezone";
import { todayInTimezone } from "@/lib/utils";
import { useWarning, useUpdateWarning, useWarnableUsers, useSwitchWarningMethod } from "@/hooks/useWarnings";
import { useModal } from "@/components/ui/imperative-modal";
import type { WarningSignatureMethod } from "@/types";
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
  const modal = useModal();
  const { data: w } = useWarning(id);
  const { data: warnable } = useWarnableUsers();
  const updateMut = useUpdateWarning();
  const switchMut = useSwitchWarningMethod();

  // Signature-method switch lives in Edit now (the toggle), not the detail action bar.
  // It's destructive (resets sign-off / invalidates signatures), so it confirms first.
  async function handleSwitchMethod(target: WarningSignatureMethod): Promise<void> {
    if (!w) return;
    const isWet = w.signature_method === "wet";
    const hasSignatures = w.employee_signed || w.manager_signed;
    const issuedByName = w.issued_by_name ?? "the manager";
    const ok = await modal.confirm({
      title: isWet ? "Switch to digital signature?" : "Switch to wet signature?",
      message: hasSignatures
        ? isWet
          ? `${w.ref_no} has signatures on file. Switching to digital will permanently remove the uploaded signed PDF and reset sign-off, and the employee will be asked to re-sign in the app. This can't be undone.`
          : `${w.ref_no} has signatures on file. Switching to wet will permanently remove the captured digital signatures and reset sign-off. You'll need to print the form, sign on paper, and upload the scan. This can't be undone.`
        : isWet
          ? `${w.ref_no} will switch to digital signing — the employee signs in the app and ${issuedByName} signs here.`
          : `${w.ref_no} will switch to wet signing — print the form, sign on paper, then upload the scanned PDF.`,
      confirmLabel: isWet ? "Switch to digital" : "Switch to wet",
      variant: hasSignatures ? "danger" : "primary",
    });
    if (!ok) return;
    try {
      await switchMut.mutateAsync({ warningId: id, method: target });
    } catch {
      /* hook surfaces error */
    }
  }

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
      other_text: w.other_text ?? "",
      deadline: w.deadline ?? "",
      follow_up_date: w.follow_up_date ?? "",
      follow_up_time: w.follow_up_time ? w.follow_up_time.slice(0, 5) : "",
      issued_by_id: w.issued_by_id,
      issued_by_name: w.issued_by_name ?? "",
      warning_date: w.warning_date,
      // Method is switched via the editor's Digital/Wet toggle here (onSwitchMethod →
      // the dedicated switch endpoint, not the draft Save). Seed it so the draft is well-formed.
      signature_method: w.signature_method,
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
          other_text: d.categories.includes("other") ? d.other_text.trim() || null : null,
          deadline: d.deadline || null,
          follow_up_date: d.follow_up_date || null,
          follow_up_time: d.follow_up_time || null,
          issued_by_id: d.issued_by_id ?? undefined,
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
          methodValue={w.signature_method}
          onSwitchMethod={(t) => void handleSwitchMethod(t)}
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
