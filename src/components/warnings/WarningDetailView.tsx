"use client";

import React, { useState } from "react";
import { ChevronLeft, Pencil, Trash2, Printer, PenLine, MonitorSmartphone, FileSignature } from "lucide-react";
import { Button, Badge, LoadingSpinner } from "@/components/ui";
import { useModal } from "@/components/ui/imperative-modal";
import { usePermissions } from "@/hooks/usePermissions";
import { useAuthStore } from "@/stores/authStore";
import { PERMISSIONS } from "@/lib/permissions";
import type { SignParty } from "@/types";
import {
  useWarning,
  useUpdateWarning,
  useDeleteWarning,
  useSignWarning,
  useMySignature,
  fetchWarningPdfUrl,
} from "@/hooks/useWarnings";
import { useWarningCategories } from "@/hooks/useWarningCategories";
import { WarningFormDoc } from "./WarningFormDoc";
import { SignaturePad, type SignatureResult } from "./SignaturePad";
import { WetUploadControl, SignedPdfCard } from "./WarningWetSign";
import { missingFilenameFields } from "./filename";

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
  const [pdfBusy, setPdfBusy] = useState(false);
  const { isOwner, hasPermission } = usePermissions();
  const userId = useAuthStore((s) => s.user?.id);
  const companyName = useAuthStore((s) => s.user?.organization_name);
  const { data: w, isLoading, isError } = useWarning(warningId);
  const { data: allCategories = [] } = useWarningCategories();
  const categoryOptions = allCategories.filter((c) => !c.is_hidden);
  // Live code→label resolver for the download filename (covers org categories).
  const categoryLabel = (code: string): string | undefined =>
    allCategories.find((c) => c.code === code)?.label;
  const updateMut = useUpdateWarning();
  const deleteMut = useDeleteWarning();
  const signMut = useSignWarning();

  const [signParty, setSignParty] = useState<SignParty | null>(null);
  const isWet = w?.signature_method === "wet";
  // On-device sign: anyone with warnings:sign (GM+/Owner) can capture either
  // signature on this device — the person signs in person. Digital + active only.
  const canSign =
    !isWet && w?.status === "active" && hasPermission(PERMISSIONS.WARNINGS_SIGN);
  const employeeNotSigned = !!w && !w.signatures.employee;
  const managerNotSigned = !!w && !w.signatures.manager;
  const canSignEmployee = !!canSign && employeeNotSigned && !!w?.subject_user_id;
  const canSignManager = !!canSign && managerNotSigned && !!w?.issued_by_id;
  // "Self" = the logged-in account IS the party being signed (manager=issuer,
  // employee=subject). A GM/Owner can be the subject of a warning issued from
  // above, so employee-self is possible in the console too. When self we skip the
  // identity confirm and offer their registered signature; capturing on behalf of
  // someone else is confirm-gated + draw-only.
  const isSelfManager = !!userId && w?.issued_by_id === userId;
  const isSelfEmployee = !!userId && w?.subject_user_id === userId;
  const { data: savedSignature } = useMySignature(
    (canSignManager && isSelfManager) || (canSignEmployee && isSelfEmployee),
  );

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
  // Wet-sign gates:
  //  - upload/replace the scan: the issuing manager (own warning) OR an
  //    owner / `warnings:upload` holder (any warning)
  //  - switch signature method: anyone who can update (warnings:update)
  const canUploadWet =
    warning.issued_by_id === userId || isOwner || hasPermission(PERMISSIONS.WARNINGS_UPLOAD);
  const missingFields = missingFilenameFields(warning);

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

  // Open the server-rendered document PDF in a new tab. The server renders the
  // official paginated document (not the screen form) and streams the bytes
  // behind the auth header, so we fetch (authed) → blob: URL → window.open for an
  // inline view; the browser's PDF viewer handles print/save. Revoke after the
  // tab has had time to load. Replaces the old window.print() of the screen form.
  async function openPdf(): Promise<void> {
    if (pdfBusy) return;
    setPdfBusy(true);
    try {
      const url = await fetchWarningPdfUrl(warning.id);
      window.open(url, "_blank", "noopener");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      void modal.alert({ type: "error", message: "Couldn't open the PDF." });
    } finally {
      setPdfBusy(false);
    }
  }

  // Confirm the in-person identity, then open the pad for that party. The
  // signature is recorded as the party's own (employee=subject, manager=issuer);
  // the logged-in operator is stamped as captured_by server-side.
  async function startSign(party: SignParty): Promise<void> {
    const isSelf = party === "manager" ? isSelfManager : isSelfEmployee;
    // Signing your own line — you're already authenticated as yourself, so no
    // "is this you?" prompt; go straight to the pad (it offers your registered
    // signature). Only confirm identity when capturing for someone else here.
    if (!isSelf) {
      const who =
        party === "manager"
          ? (warning.issued_by_name ?? "the manager")
          : (warning.subject_name ?? "the employee");
      const ok = await modal.confirm({
        title: "Confirm signer",
        message: `This will be recorded as ${who}'s signature (${party}). Make sure ${who} is here and signing in person on this device.`,
        confirmLabel: "Continue to sign",
      });
      if (!ok) return;
    }
    setSignParty(party);
  }

  async function handleSign(result: SignatureResult): Promise<void> {
    if (!signParty) return;
    try {
      await signMut.mutateAsync({
        warningId: warning.id,
        data: {
          strokes: result.strokes,
          aspect: result.aspect,
          method: result.method,
          save_as_default: result.saveAsDefault,
          party: signParty,
        },
      });
      setSignParty(null);
    } catch {
      // hook surfaces the error (incl. a 403 if the gate were somehow bypassed)
    }
  }

  // ── sign-off status strip data ──
  // Sign-off status comes from the server-derived `employee_signed` /
  // `manager_signed` bools (which fold in the wet path), NOT the raw signatures
  // map. The vector `signatures` entries are still used only to surface the
  // signer name + exact date for the digital case.
  const issuedByName = warning.issued_by_name ?? "the manager";
  const empSig = warning.signatures.employee;
  const mgrSig = warning.signatures.manager;
  const empState: "signed" | "read" | "not_opened" = warning.employee_signed
    ? "signed"
    : warning.acknowledged_at
      ? "read"
      : "not_opened";

  return (
    <div className="max-w-[860px] mx-auto pb-10">
      <div className="sticky top-0 z-20 mb-4 bg-card border border-border rounded-lg px-3 sm:px-4 py-2.5 flex items-center gap-2 flex-wrap shadow-sm">
        {/* Left — nav + status info (방식 전환은 Edit 의 토글로 이동) */}
        <Button variant="ghost" onClick={onBack} className="gap-1.5">
          <ChevronLeft className="h-4 w-4" />
          Back
        </Button>
        <span className="mx-1 hidden h-5 w-px bg-border sm:block" />
        <Badge variant={warning.status === "active" ? "warning" : "default"}>
          {warning.status === "active" ? "Active" : "Withdrawn"}
        </Badge>
        <Badge variant="default" className="gap-1">
          {isWet ? <FileSignature className="h-3 w-3" /> : <MonitorSmartphone className="h-3 w-3" />}
          {isWet ? "Wet" : "Digital"}
        </Badge>

        {/* Right — actions, destructive/ownership separated by a divider */}
        <div className="ml-auto flex items-center gap-2">
          <Button variant="secondary" onClick={() => void openPdf()} isLoading={pdfBusy} className="gap-1.5">
            <Printer className="h-4 w-4" />
            Print / PDF
          </Button>
          {canWithdraw && (
            <Button variant="secondary" onClick={() => void toggleWithdraw()} isLoading={updateMut.isPending}>
              {warning.status === "withdrawn" ? "Re-warn" : "Withdraw"}
            </Button>
          )}
          {(canDelete || canEdit) && <span className="mx-0.5 h-5 w-px bg-border" />}
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

      {/* Missing-fields badge — surfaces gaps that downgrade the download filename. */}
      {missingFields.length > 0 && (
        <div className="mb-3 rounded-lg border px-3.5 py-2.5 text-[12.5px] font-semibold"
          style={{ border: "1px solid #F4E0B5", background: "#FEF6E7", color: "#B45309" }}>
          Missing for the file name: {missingFields.join(", ")}. The PDF still downloads,
          but with an &ldquo;NA&rdquo; placeholder for those parts.
        </div>
      )}

      {/* Sign-off status strip — Employee acknowledge/sign + Manager sign */}
      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        {/* Employee */}
        {(() => {
          const tone =
            empState === "signed"
              ? { fg: "#2F9E44", bg: "#EBF8EE", br: "#C3E9CD" }
              : empState === "read"
                ? { fg: "#B45309", bg: "#FEF6E7", br: "#F4E0B5" }
                : { fg: "#7A8090", bg: "#F4F5F7", br: "#E2E5EA" };
          const line =
            empState === "signed"
              ? isWet
                ? "Signed PDF uploaded"
                : `Signed on ${fmtDate(empSig?.signed_at ?? null)}`
              : empState === "read"
                ? `Read on ${fmtDate(warning.acknowledged_at)}${isWet ? "" : " — awaiting signature"}`
                : "Not opened yet";
          return (
            <div className="flex items-center gap-2.5 rounded-lg px-3.5 py-2.5" style={{ border: `1px solid ${tone.br}`, background: tone.bg }}>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-extrabold uppercase tracking-wider" style={{ color: "#9AA0AD" }}>
                  Employee
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: tone.fg }} />
                  <span className="truncate text-sm font-bold" style={{ color: tone.fg }}>{line}</span>
                </div>
              </div>
              {canSignEmployee && (
                <Button variant="primary" onClick={() => void startSign("employee")} className="shrink-0 gap-1.5">
                  <PenLine className="h-4 w-4" />
                  Sign as employee
                </Button>
              )}
            </div>
          );
        })()}
        {/* Manager */}
        {(() => {
          const signed = warning.manager_signed;
          const actionable = canSignManager;
          const tone = signed
            ? { fg: "#2F9E44", bg: "#EBF8EE", br: "#C3E9CD" }
            : actionable
              ? { fg: "#6C5CE7", bg: "#F1EEFE", br: "#D6CCFB" }
              : { fg: "#7A8090", bg: "#F4F5F7", br: "#E2E5EA" };
          // Wet: the uploaded scan stands in for the manager's signature too.
          const line = signed
            ? isWet
              ? "Signed on paper — see PDF"
              : `Signed by ${mgrSig?.signer_name ?? issuedByName} on ${fmtDate(mgrSig?.signed_at ?? null)}`
            : isWet
              ? "Awaiting the signed PDF upload"
              : `Awaiting ${issuedByName}'s signature`;
          return (
            <div className="flex items-center gap-2.5 rounded-lg px-3.5 py-2.5" style={{ border: `1px solid ${tone.br}`, background: tone.bg }}>
              <div className="min-w-0 flex-1">
                <div className="text-[10px] font-extrabold uppercase tracking-wider" style={{ color: "#9AA0AD" }}>
                  Manager
                </div>
                <div className="mt-1 flex items-center gap-2">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: tone.fg }} />
                  <span className="truncate text-sm font-bold" style={{ color: tone.fg }}>{line}</span>
                </div>
                {!signed && isWet && !canUploadWet && (
                  <div className="mt-0.5 text-[11.5px]" style={{ color: "#9AA0AD" }}>
                    {issuedByName} or an authorized manager uploads the signed PDF.
                  </div>
                )}
              </div>
              {/* Digital: in-card sign affordance. Wet: upload handled by the card below. */}
              {canSignManager && (
                <Button variant="primary" onClick={() => void startSign("manager")} className="shrink-0 gap-1.5">
                  <PenLine className="h-4 w-4" />
                  Sign as manager
                </Button>
              )}
            </div>
          );
        })()}
      </div>

      {/* Wet sign — uploaded scan preview, or the upload control when missing. */}
      {isWet && warning.signed_pdf_present && (
        <SignedPdfCard warning={warning} categoryLabel={categoryLabel} canReplace={canUploadWet} />
      )}
      {isWet && !warning.signed_pdf_present && canUploadWet && (
        <div className="mb-4 rounded-xl border border-border bg-card p-4">
          <div className="mb-2 text-sm font-bold text-text">Upload signed PDF</div>
          <p className="mb-3 text-xs text-text-secondary">
            Use <span className="font-semibold">Print / PDF</span> above to print this warning,
            have the employee and {issuedByName} sign on paper, then upload the scan here. This
            stands in for both digital signatures.
          </p>
          <WetUploadControl warningId={warning.id} defaultSignedOn={warning.warning_date} />
        </div>
      )}

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
        employeeSignature={isWet ? null : empSig}
        managerSignature={isWet ? null : mgrSig}
        canSignAsManager={canSignManager}
        canSignAsEmployee={canSignEmployee}
        managerAwaitingNote={isWet || mgrSig || canSignManager ? null : "Awaiting signature"}
        employeeAwaitingNote={isWet || empSig || canSignEmployee ? null : "Awaiting signature"}
        onSignManager={() => void startSign("manager")}
        onSignEmployee={() => void startSign("employee")}
        wetSign={isWet}
        wetSigned={isWet && warning.signed_pdf_present}
      />

      {signParty && (
        <SignaturePad
          party={signParty}
          signerName={signParty === "manager" ? issuedByName : (warning.subject_name ?? "the employee")}
          allowSaved={signParty === "manager" ? isSelfManager : isSelfEmployee}
          savedSignature={(signParty === "manager" ? isSelfManager : isSelfEmployee) ? (savedSignature ?? null) : null}
          isSubmitting={signMut.isPending}
          onCancel={() => setSignParty(null)}
          onConfirm={(r) => void handleSign(r)}
        />
      )}
    </div>
  );
}
