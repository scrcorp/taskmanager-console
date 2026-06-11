"use client";

import React from "react";
import { ChevronLeft, Pencil, Trash2, Printer } from "lucide-react";
import { Button, Badge, LoadingSpinner } from "@/components/ui";
import { useModal } from "@/components/ui/imperative-modal";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuthStore } from "@/stores/authStore";
import { PERMISSIONS } from "@/lib/permissions";
import { useWarning, useUpdateWarning, useDeleteWarning } from "@/hooks/useWarnings";
import { useWarningCategories } from "@/hooks/useWarningCategories";
import { WarningFormDoc } from "./WarningFormDoc";

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso.length <= 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

interface Props {
  warningId: string;
  onBack: () => void;
  onEdit: (id: string) => void;
}

export function WarningDetailView({ warningId, onBack, onEdit }: Props): React.ReactElement {
  const modal = useModal();
  const { isOwner, hasPermission } = usePermissions();
  const userId = useAuthStore((s) => s.user?.id);
  const companyName = useAuthStore((s) => s.user?.organization_name);
  const { data: w, isLoading, isError } = useWarning(warningId);
  const { data: allCategories = [] } = useWarningCategories();
  const categoryOptions = allCategories.filter((c) => !c.is_hidden);
  const updateMut = useUpdateWarning();
  const deleteMut = useDeleteWarning();

  if (isLoading) {
    return (
      <div className="py-16 flex justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (isError || !w) {
    return (
      <div className="max-w-[860px] mx-auto">
        <Button variant="ghost" onClick={onBack} className="gap-1.5 mb-4">
          <ChevronLeft className="h-4 w-4" />
          Back
        </Button>
        <div className="bg-card border border-border rounded-xl p-12 text-center text-text-muted">
          This warning could not be loaded. It may have been deleted.
        </div>
      </div>
    );
  }

  const warning = w;
  const canWithdraw =
    (isOwner || warning.issued_by_id === userId) && hasPermission(PERMISSIONS.WARNINGS_UPDATE);
  const canEdit = canWithdraw;
  const canDelete = isOwner;

  async function toggleWithdraw(): Promise<void> {
    const toWithdrawn = warning.status !== "withdrawn";
    const ok = await modal.confirm({
      title: toWithdrawn ? "Withdraw this warning?" : "Re-activate this warning?",
      message: toWithdrawn
        ? `${warning.ref_no} will be marked withdrawn. It stays on record for audit, but won't count as an active warning.`
        : `${warning.ref_no} will be active again and counted as a valid warning.`,
      confirmLabel: toWithdrawn ? "Withdraw" : "Re-warn",
    });
    if (!ok) return;
    try {
      await updateMut.mutateAsync({
        warningId: warning.id,
        data: { status: toWithdrawn ? "withdrawn" : "active" },
      });
    } catch {
      /* hook surfaces error */
    }
  }

  async function handleDelete(): Promise<void> {
    const ok = await modal.confirm({
      title: "Delete this warning?",
      message: `This will permanently remove ${warning.ref_no} for ${warning.subject_name ?? "this employee"}. This can't be undone.`,
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return;
    try {
      await deleteMut.mutateAsync(warning.id);
      onBack();
    } catch {
      /* hook surfaces error */
    }
  }

  // Client-side print → the browser's "Save as PDF". `@media print` (in
  // WarningFormDoc) hides the app chrome + the web-only Subject, so the printed
  // page is just the official form — no server PDF, always matches the screen.
  function printPdf(): void {
    window.print();
  }

  return (
    <div className="max-w-[860px] mx-auto pb-10">
      <div className="sticky top-0 z-20 mb-4 bg-card border border-border rounded-lg px-3 sm:px-4 py-2.5 flex items-center gap-2 flex-wrap shadow-sm">
        <Button variant="ghost" onClick={onBack} className="gap-1.5">
          <ChevronLeft className="h-4 w-4" />
          Back
        </Button>
        <Badge variant={warning.status === "active" ? "warning" : "default"}>
          {warning.status === "active" ? "Active" : "Withdrawn"}
        </Badge>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="secondary" onClick={printPdf} className="gap-1.5">
            <Printer className="h-4 w-4" />
            Print / PDF
          </Button>
          {canWithdraw && (
            <Button variant="secondary" onClick={() => void toggleWithdraw()} isLoading={updateMut.isPending}>
              {warning.status === "withdrawn" ? "Re-warn" : "Withdraw"}
            </Button>
          )}
          {canDelete && (
            <Button variant="danger" onClick={() => void handleDelete()} isLoading={deleteMut.isPending} className="gap-1.5">
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
          )}
          {canEdit && (
            <Button variant="primary" onClick={() => onEdit(warning.id)} className="gap-1.5">
              <Pencil className="h-4 w-4" />
              Edit
            </Button>
          )}
        </div>
      </div>

      <WarningFormDoc
        mode="view"
        companyName={companyName}
        refNo={warning.ref_no}
        employeeName={warning.subject_name}
        employeeNo={warning.employee_no}
        managerName={warning.issued_by_name}
        storeName={warning.store_name}
        dateLabel={fmtDate(warning.warning_date)}
        ordinal={warning.ordinal}
        title={warning.title}
        categoryOptions={categoryOptions}
        categories={warning.categories}
        categoryLabels={warning.category_labels}
        details={warning.details ?? ""}
        correctiveAction={warning.corrective_action ?? ""}
        otherText={warning.other_text ?? ""}
        deadline={warning.deadline ?? ""}
        followUpDate={warning.follow_up_date ?? ""}
        followUpTime={warning.follow_up_time ?? ""}
      />
    </div>
  );
}
