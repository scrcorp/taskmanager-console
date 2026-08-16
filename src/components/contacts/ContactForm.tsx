"use client";

/**
 * 연락처 폼 — 생성/수정 공용, 직접 저장과 "신청" 공용.
 *
 * 권한이 없는 사람도 **같은 폼**을 쓰고, 제출 버튼의 뜻만 "신청"으로 바뀐다(설계 D4).
 * 그래서 이 컴포넌트는 어떤 API 를 부를지 모른다 — 호출 측이 draft 를 받아서 결정한다.
 *
 * 모달 안에서 쓰도록 만들어졌다(`modal.open`). 자체 헤더는 없다.
 */

import React, { useEffect, useState } from "react";
import { AlertTriangle, Plus, Star, Trash2 } from "lucide-react";

import { Button, Input, Textarea } from "@/components/ui";
import { DUPLICATE_MIN_DIGITS, DuplicatePhoneNotice } from "./DuplicatePhoneNotice";
import { ContactTagInput } from "./ContactTagInput";
import { VisibilityPicker } from "./VisibilityPicker";
import {
  CONTACT_LIMITS,
  newPhoneRow,
  normalizePhone,
  validateContactDraft,
  type ContactDraft,
  type ContactDraftErrors,
} from "./contactDraft";

interface ContactFormProps {
  initial: ContactDraft;
  /** 제출 버튼 라벨 — "Add contact" / "Submit request" / "Approve with these changes" 등. */
  submitLabel: string;
  /** 사유 필수 여부. 수정·삭제는 필수, 등록은 선택(설계 D9). */
  reasonRequired: boolean;
  reasonLabel: string;
  /** 사유 입력칸 아래 안내 한 줄. */
  reasonHint?: string;
  /** 제출 전에 한 번 더 짚어줄 안내(신청 흐름의 "검토 대기" 고지 등). */
  notice?: React.ReactNode;
  /** 수정 중인 연락처 — 중복 번호 경고에서 자기 자신을 제외하는 데 쓴다. */
  contactId?: string;
  saving?: boolean;
  onSubmit: (draft: ContactDraft) => void;
  onCancel: () => void;
}

export function ContactForm({
  initial,
  submitLabel,
  reasonRequired,
  reasonLabel,
  reasonHint,
  notice,
  contactId,
  saving = false,
  onSubmit,
  onCancel,
}: ContactFormProps): React.ReactElement {
  const [draft, setDraft] = useState<ContactDraft>(initial);
  const [errors, setErrors] = useState<ContactDraftErrors>({});
  // 첫 제출 전에는 아무것도 지적하지 않는다. 한 번 실패한 뒤부터는 고치는 즉시
  // 해당 문구가 사라져야 한다 — 안 그러면 사유를 채우고도 빨간 글씨가 남아
  // 아직 안 된 것처럼 읽힌다.
  const [submitAttempted, setSubmitAttempted] = useState(false);

  useEffect(() => {
    if (!submitAttempted) return;
    setErrors(validateContactDraft(draft, { reasonRequired }));
  }, [draft, reasonRequired, submitAttempted]);

  function patch(changes: Partial<ContactDraft>): void {
    setDraft((prev) => ({ ...prev, ...changes }));
  }

  function patchPhone(key: string, changes: Partial<ContactDraft["phones"][number]>): void {
    setDraft((prev) => ({
      ...prev,
      phones: prev.phones.map((p) => (p.key === key ? { ...p, ...changes } : p)),
    }));
  }

  function setPrimary(key: string): void {
    setDraft((prev) => ({
      ...prev,
      phones: prev.phones.map((p) => ({ ...p, is_primary: p.key === key })),
    }));
  }

  function addPhone(): void {
    setDraft((prev) => ({
      ...prev,
      phones: [...prev.phones, newPhoneRow({ is_primary: prev.phones.length === 0 })],
    }));
  }

  function removePhone(key: string): void {
    setDraft((prev) => {
      const remaining = prev.phones.filter((p) => p.key !== key);
      const rows = remaining.length > 0 ? remaining : [newPhoneRow({ is_primary: true })];
      // 대표번호를 지웠으면 첫 줄이 대표를 이어받는다 (대표 없는 상태로 두지 않는다).
      if (!rows.some((p) => p.is_primary)) rows[0] = { ...rows[0], is_primary: true };
      return { ...prev, phones: rows };
    });
  }

  function handleSubmit(e: React.FormEvent): void {
    e.preventDefault();
    setSubmitAttempted(true);
    const found = validateContactDraft(draft, { reasonRequired });
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    onSubmit(draft);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {notice}

      <Input
        label="Name *"
        value={draft.name}
        onChange={(e) => patch({ name: e.target.value })}
        error={errors.name}
        maxLength={CONTACT_LIMITS.name}
        placeholder="Who or what this number belongs to"
        autoFocus
      />

      <Input
        label="Company"
        value={draft.company}
        onChange={(e) => patch({ company: e.target.value })}
        error={errors.company}
        maxLength={CONTACT_LIMITS.company}
        placeholder="Vendor or partner name"
      />

      {/* Phones */}
      <div className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-text-secondary">Phone numbers</span>
        <div className="space-y-2">
          {draft.phones.map((phone) => {
            const digits = normalizePhone(phone.number);
            return (
              <div key={phone.key} className="rounded-lg border border-border bg-surface/50 p-2">
                <div className="flex items-start gap-2">
                  <input
                    value={phone.label}
                    onChange={(e) => patchPhone(phone.key, { label: e.target.value })}
                    maxLength={CONTACT_LIMITS.phoneLabel}
                    placeholder="Label"
                    aria-label="Phone label"
                    className="w-24 shrink-0 rounded-lg border border-border bg-surface px-2 py-2 text-sm text-text placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/50"
                  />
                  <input
                    value={phone.number}
                    onChange={(e) => patchPhone(phone.key, { number: e.target.value })}
                    maxLength={CONTACT_LIMITS.phoneNumber}
                    placeholder="(213) 555-0134"
                    aria-label="Phone number"
                    inputMode="tel"
                    className="min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/50"
                  />
                  <button
                    type="button"
                    onClick={() => setPrimary(phone.key)}
                    aria-pressed={phone.is_primary}
                    title={phone.is_primary ? "Primary number" : "Make this the primary number"}
                    className={
                      phone.is_primary
                        ? "shrink-0 rounded-lg border border-accent bg-accent-muted p-2 text-accent"
                        : "shrink-0 rounded-lg border border-border bg-surface p-2 text-text-muted transition-colors hover:text-text"
                    }
                  >
                    <Star size={15} fill={phone.is_primary ? "currentColor" : "none"} />
                  </button>
                  <button
                    type="button"
                    onClick={() => removePhone(phone.key)}
                    aria-label="Remove this number"
                    className="shrink-0 rounded-lg border border-border bg-surface p-2 text-text-muted transition-colors hover:border-danger/50 hover:text-danger"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
                {/* 짧은 입력에는 아예 조회하지 않도록 마운트 자체를 늦춘다. */}
                {digits.length >= DUPLICATE_MIN_DIGITS && (
                  <DuplicatePhoneNotice digits={digits} excludeContactId={contactId} />
                )}
              </div>
            );
          })}
        </div>

        {errors.phones && <p className="text-xs text-danger">{errors.phones}</p>}

        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={addPhone}
            disabled={draft.phones.length >= CONTACT_LIMITS.phones}
            className="inline-flex items-center gap-1 text-xs font-semibold text-accent transition-colors hover:text-accent-light disabled:cursor-not-allowed disabled:text-text-muted"
          >
            <Plus size={13} /> Add another number
          </button>
          <span className="text-xs text-text-muted">
            The starred number is shown first in the list.
          </span>
        </div>
      </div>

      <Input
        label="Email"
        value={draft.email}
        onChange={(e) => patch({ email: e.target.value })}
        error={errors.email}
        maxLength={CONTACT_LIMITS.email}
        placeholder="name@company.com"
      />

      <ContactTagInput
        value={draft.tags}
        onChange={(tags) => patch({ tags })}
        error={errors.tags}
      />

      <Textarea
        label="Memo"
        value={draft.memo}
        onChange={(e) => patch({ memo: e.target.value })}
        error={errors.memo}
        rows={3}
        placeholder="Anything worth remembering — hours, who to ask for, account number"
      />

      {/* 가시성 — 전체 공유는 **고르는 것**이지 "아무것도 안 고른 상태"가 아니다 (V1).
          대상은 매장/직급/개인 3축이 OR 로 합쳐지고, 그 결과 명단에서 개인을 뺄 수 있다 (V4). */}
      <VisibilityPicker
        visibility={draft.visibility}
        targets={draft.targets}
        excludedUserIds={draft.excluded_user_ids}
        error={errors.visibility}
        onChange={(next) => patch(next)}
      />

      <Textarea
        label={reasonLabel}
        value={draft.reason}
        onChange={(e) => patch({ reason: e.target.value })}
        error={errors.reason}
        rows={2}
        maxLength={CONTACT_LIMITS.reason}
        placeholder={reasonRequired ? "Required" : "Optional"}
      />
      {!errors.reason && (
        <p className="-mt-3 text-xs text-text-muted">
          {reasonHint ?? "Kept in the change history so anyone can see why this happened."}
        </p>
      )}

      {Object.keys(errors).length > 0 && (
        <p className="flex items-center gap-1.5 text-xs text-danger">
          <AlertTriangle size={13} /> Fix the highlighted fields, then submit again.
        </p>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="secondary" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" isLoading={saving} disabled={saving}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
