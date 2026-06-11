"use client";

import React, { useMemo, useState } from "react";
import { ChevronLeft } from "lucide-react";
import type { WarningCategory, WarnableUserStore } from "@/types";
import { Button } from "@/components/ui";
import { useModal } from "@/components/ui/imperative-modal";
import { usePermissions } from "@/hooks/usePermissions";
import { useWarningCategories } from "@/hooks/useWarningCategories";
import { WarningFormDoc } from "./WarningFormDoc";
import { EmployeePickerModal, StorePickerModal, ManagerPickerModal } from "./WarningPickers";

/** The mutable shape the editor edits; field names mirror the API. */
export interface WarningDraft {
  subject_user_id: string | null;
  subject_name: string | null;
  employee_no: string | null;
  store_id: string | null;
  store_name: string | null;
  /** Stores the selected employee belongs to (drives the Store picker). */
  employee_stores: WarnableUserStore[];
  title: string;
  categories: WarningCategory[];
  details: string;
  corrective_action: string;
  other_text: string;
  deadline: string; // YYYY-MM-DD or ""
  follow_up_date: string; // YYYY-MM-DD or ""
  follow_up_time: string; // HH:MM or "" (TBD)
  /** Issuing manager override (Owner only). null = the author (current user). */
  issued_by_id: string | null;
  issued_by_name: string; // display
  warning_date: string;
}

export function emptyDraft(today: string): WarningDraft {
  return {
    subject_user_id: null,
    subject_name: null,
    employee_no: null,
    store_id: null,
    store_name: null,
    employee_stores: [],
    title: "",
    categories: [],
    details: "",
    corrective_action: "",
    other_text: "",
    deadline: "",
    follow_up_date: "",
    follow_up_time: "",
    issued_by_id: null,
    issued_by_name: "",
    warning_date: today,
  };
}

interface Props {
  companyName?: string | null;
  managerName?: string | null;
  initial: WarningDraft;
  today: string;
  /** Subject is fixed (editing an existing warning, or issuing from a staff page). */
  lockEmployee?: boolean;
  saving: boolean;
  submitLabel?: string;
  onBack: () => void;
  onSubmit: (d: WarningDraft) => void;
}

export function WarningEditor({
  companyName,
  managerName,
  initial,
  today,
  lockEmployee,
  saving,
  submitLabel,
  onBack,
  onSubmit,
}: Props): React.ReactElement {
  const modal = useModal();
  const { isOwner } = usePermissions();
  const { data: allCategories = [] } = useWarningCategories();
  const categoryOptions = allCategories.filter((c) => !c.is_hidden);
  const [draft, setDraft] = useState<WarningDraft>(initial);
  const [activeModal, setActiveModal] = useState<null | "employee" | "store" | "manager">(null);

  const dirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(initial), [draft, initial]);

  const valid = !!(
    draft.subject_user_id &&
    draft.store_id &&
    draft.title.trim().length > 0 &&
    draft.categories.length > 0 &&
    draft.warning_date &&
    draft.warning_date <= today
  );

  function patch(p: Partial<WarningDraft>): void {
    setDraft((prev) => ({ ...prev, ...p }));
  }

  function toggleCategory(c: WarningCategory): void {
    setDraft((prev) => ({
      ...prev,
      categories: prev.categories.includes(c)
        ? prev.categories.filter((x) => x !== c)
        : [...prev.categories, c],
    }));
  }

  async function handleBack(): Promise<void> {
    if (dirty) {
      const ok = await modal.confirm({
        title: "Discard changes?",
        message: "This warning hasn't been saved.",
        confirmLabel: "Discard",
        cancelLabel: "Keep editing",
        variant: "danger",
      });
      if (!ok) return;
    }
    onBack();
  }

  return (
    <div className="max-w-[860px] mx-auto pb-10">
      <div className="sticky top-0 z-20 mb-4 bg-card border border-border rounded-lg px-3 sm:px-4 py-2.5 flex items-center gap-3 shadow-sm">
        <Button variant="ghost" onClick={() => void handleBack()} className="gap-1.5">
          <ChevronLeft className="h-4 w-4" />
          Back
        </Button>
        <div className="ml-auto flex items-center gap-2.5">
          {!valid && (
            <span className="text-xs text-text-muted hidden lg:inline whitespace-nowrap">
              pick employee, store, subject &amp; a reason
            </span>
          )}
          <Button variant="primary" disabled={!valid || saving} isLoading={saving} onClick={() => onSubmit(draft)}>
            {submitLabel ?? "Save"}
          </Button>
        </div>
      </div>

      <WarningFormDoc
        mode="edit"
        companyName={companyName}
        managerName={draft.issued_by_name || managerName}
        canEditManager={isOwner}
        employeeName={draft.subject_name}
        employeeNo={draft.employee_no}
        storeName={draft.store_name}
        dateValue={draft.warning_date}
        maxDate={today}
        title={draft.title}
        categoryOptions={categoryOptions}
        categories={draft.categories}
        details={draft.details}
        correctiveAction={draft.corrective_action}
        otherText={draft.other_text}
        deadline={draft.deadline}
        followUpDate={draft.follow_up_date}
        followUpTime={draft.follow_up_time}
        lockEmployee={lockEmployee}
        onPickEmployee={() => setActiveModal("employee")}
        onPickStore={() => setActiveModal("store")}
        onPickManager={() => setActiveModal("manager")}
        onTitle={(s) => patch({ title: s })}
        onDate={(s) => patch({ warning_date: s })}
        onToggleCategory={toggleCategory}
        onDetails={(s) => patch({ details: s })}
        onCorrectiveAction={(s) => patch({ corrective_action: s })}
        onOtherText={(s) => patch({ other_text: s })}
        onDeadline={(s) => patch({ deadline: s })}
        onFollowUp={(d, t) => patch({ follow_up_date: d, follow_up_time: t })}
      />

      {activeModal === "employee" && (
        <EmployeePickerModal
          current={draft.subject_user_id}
          onClose={() => setActiveModal(null)}
          onSelect={(u) =>
            patch({
              subject_user_id: u.id,
              subject_name: u.full_name,
              employee_no: u.employee_no,
              employee_stores: u.stores,
              store_id: u.store_id,
              store_name: u.store_name,
            })
          }
        />
      )}
      {activeModal === "store" && (
        <StorePickerModal
          stores={draft.employee_stores}
          current={draft.store_id}
          onClose={() => setActiveModal(null)}
          onSelect={(id, name) => patch({ store_id: id, store_name: name })}
        />
      )}
      {activeModal === "manager" && (
        <ManagerPickerModal
          current={draft.issued_by_id}
          onClose={() => setActiveModal(null)}
          onSelect={(id, name) => patch({ issued_by_id: id, issued_by_name: name })}
        />
      )}
    </div>
  );
}
