"use client";

import { Bell, CheckCircle2, Clock, Download, Eye, X } from "lucide-react";
import { useState } from "react";
import { useStoreForms, useRemindUnsigned, type Form4070 } from "@/hooks/useTips";
import { Modal } from "@/components/ui/Modal";
import { cn } from "@/lib/utils";
import type { TipPeriod } from "@/lib/tipPeriod";

interface Props {
  storeId: string;
  period: TipPeriod;
}

function fmt$(value: string): string {
  const n = Number(value);
  return `$${(Number.isFinite(n) ? n : 0).toFixed(2)}`;
}

export function FormsPanel({ storeId, period }: Props) {
  const { data: forms = [], isLoading } = useStoreForms(storeId, period.start);
  const remindMut = useRemindUnsigned();
  const [previewForm, setPreviewForm] = useState<Form4070 | null>(null);

  if (isLoading) {
    return (
      <div className="flex h-32 items-center justify-center text-[13px] text-[#94A3B8]">
        Loading forms...
      </div>
    );
  }

  if (forms.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[#E2E4EA] bg-white p-10 text-center text-[13px] text-[#94A3B8]">
        No 4070 forms yet for {period.label}. Confirm the cycle from Period tab
        to generate forms.
      </div>
    );
  }

  const signed = forms.filter((f) => f.status === "signed").length;
  const total = forms.length;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between rounded-xl border border-[#E2E4EA] bg-white px-4 py-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">
            {period.label}
          </p>
          <p className="mt-0.5 text-[15px] font-semibold text-[#1A1D27]">
            {signed} / {total} signed
          </p>
        </div>
        <div className="w-48 rounded-full bg-[#F0F1F5] h-2 overflow-hidden">
          <div
            className="h-full bg-[#00B894]"
            style={{ width: `${(signed / total) * 100}%` }}
          />
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-[#E2E4EA] bg-white">
        <table className="w-full text-[12px]">
          <thead className="bg-[#F5F6FA]">
            <tr>
              <Th>Staff</Th>
              <Th align="right">Cash</Th>
              <Th align="right">Card</Th>
              <Th align="right">Paid out</Th>
              <Th align="right">Net</Th>
              <Th>Status</Th>
              <Th align="right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {forms.map((f) => (
              <FormRow
                key={f.id}
                form={f}
                onRemind={() => remindMut.mutate(f.id)}
                onPreview={() => setPreviewForm(f)}
                remindBusy={remindMut.isPending}
              />
            ))}
          </tbody>
        </table>
      </div>

      <Modal
        isOpen={previewForm !== null}
        onClose={() => setPreviewForm(null)}
        title={
          previewForm
            ? `4070 — ${previewForm.employee_name ?? "(employee)"}`
            : ""
        }
        size="lg"
      >
        {previewForm && previewForm.pdf_url ? (
          <iframe
            src={previewForm.pdf_url}
            className="h-[70vh] w-full rounded border border-[#E2E4EA]"
            title="4070 PDF preview"
          />
        ) : (
          <p className="py-8 text-center text-[13px] text-[#94A3B8]">
            PDF not available yet.
          </p>
        )}
      </Modal>
    </div>
  );
}

function Th({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      className={cn(
        "border-b border-[#E2E4EA] px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-[#64748B]",
        align === "right" ? "text-right" : "text-left",
      )}
    >
      {children}
    </th>
  );
}

function FormRow({
  form,
  onRemind,
  onPreview,
  remindBusy,
}: {
  form: Form4070;
  onRemind: () => void;
  onPreview: () => void;
  remindBusy: boolean;
}) {
  const isSigned = form.status === "signed";
  return (
    <tr className="hover:bg-[#FAFBFC]">
      <td className="border-b border-[#E2E4EA] px-3 py-1.5 font-medium text-[#1A1D27]">
        {form.employee_name || form.employee_id.slice(0, 8)}
      </td>
      <td className="border-b border-[#E2E4EA] px-3 py-1.5 text-right">
        {fmt$(form.reported_cash)}
      </td>
      <td className="border-b border-[#E2E4EA] px-3 py-1.5 text-right">
        {fmt$(form.reported_card)}
      </td>
      <td className="border-b border-[#E2E4EA] px-3 py-1.5 text-right">
        {fmt$(form.paid_out)}
      </td>
      <td className="border-b border-[#E2E4EA] px-3 py-1.5 text-right font-bold">
        {fmt$(form.net_tips)}
      </td>
      <td className="border-b border-[#E2E4EA] px-3 py-1.5">
        <StatusBadge status={form.status} />
      </td>
      <td className="border-b border-[#E2E4EA] px-3 py-1.5 text-right">
        <div className="inline-flex gap-1">
          {form.pdf_url && (
            <button
              type="button"
              onClick={onPreview}
              className="flex items-center gap-1 rounded-md border border-[#E2E4EA] px-2 py-1 text-[11px] text-[#64748B] hover:border-[#6C5CE7] hover:text-[#6C5CE7]"
            >
              <Eye size={11} /> Preview
            </button>
          )}
          {!isSigned && (
            <button
              type="button"
              onClick={onRemind}
              disabled={remindBusy}
              className="flex items-center gap-1 rounded-md border border-[#E2E4EA] px-2 py-1 text-[11px] text-[#64748B] hover:border-[#6C5CE7] hover:text-[#6C5CE7] disabled:opacity-50"
            >
              <Bell size={11} /> Remind
            </button>
          )}
          {form.pdf_url && (
            <a
              href={form.pdf_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 rounded-md border border-[#E2E4EA] px-2 py-1 text-[11px] text-[#64748B] hover:border-[#6C5CE7] hover:text-[#6C5CE7]"
            >
              <Download size={11} /> PDF
            </a>
          )}
        </div>
      </td>
    </tr>
  );
}

function StatusBadge({ status }: { status: Form4070["status"] }) {
  const styles: Record<string, { bg: string; text: string; icon: React.ReactNode; label: string }> = {
    signed: {
      bg: "bg-[rgba(0,184,148,0.12)]",
      text: "text-[#00B894]",
      icon: <CheckCircle2 size={11} />,
      label: "Signed",
    },
    downloaded: {
      bg: "bg-[rgba(108,92,231,0.12)]",
      text: "text-[#6C5CE7]",
      icon: <Download size={11} />,
      label: "Downloaded",
    },
    generated: {
      bg: "bg-[rgba(240,165,0,0.12)]",
      text: "text-[#F0A500]",
      icon: <Clock size={11} />,
      label: "Awaiting",
    },
    unsigned: {
      bg: "bg-[rgba(255,107,107,0.12)]",
      text: "text-[#FF6B6B]",
      icon: <X size={11} />,
      label: "Unsigned",
    },
  };
  const s = styles[status] ?? styles.generated;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold",
        s.bg,
        s.text,
      )}
    >
      {s.icon} {s.label}
    </span>
  );
}
