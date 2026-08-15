"use client";

/**
 * 연락처 등록/수정/삭제 흐름 한 벌.
 *
 * 같은 버튼이 권한에 따라 두 갈래로 갈린다(설계 D4):
 *   - 쓰기 권한 있음 → 바로 반영 (수정·삭제는 사유 필수)
 *   - 쓰기 권한 없음 → 같은 폼/같은 확인 단계를 거쳐 "신청" 으로 제출
 *
 * 결과 모달은 mutation hook 이 자동으로 띄운다 — 여기서 다시 띄우지 않는다(콘솔 규약).
 */

import React from "react";

import { useModal } from "@/components/ui/imperative-modal";
import { usePermissions } from "@/hooks/usePermissions";
import { PERMISSIONS } from "@/lib/permissions";
import {
  useCreateContact,
  useCreateContactRequest,
  useDeleteContact,
  useUpdateContact,
} from "@/hooks/useContacts";
import type { Contact } from "@/types";
import { ContactForm } from "./ContactForm";
import {
  draftFromContact,
  draftToPayload,
  emptyContactDraft,
  type ContactDraft,
} from "./contactDraft";

/** 신청 흐름에서 폼 맨 위에 붙는 고지 — 제출이 곧 반영이 아님을 먼저 알린다. */
function RequestNotice({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <div className="rounded-lg border border-accent/40 bg-accent-muted px-3 py-2 text-xs text-text-secondary">
      {children}
    </div>
  );
}

export interface ContactActions {
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
  /** 저장/신청 요청이 날아가는 중. 진입 버튼을 잠그는 데 쓴다. */
  busy: boolean;
  startCreate: () => Promise<void>;
  startEdit: (contact: Contact) => Promise<void>;
  startDelete: (contact: Contact) => Promise<void>;
}

export function useContactActions(): ContactActions {
  const modal = useModal();
  const { hasPermission } = usePermissions();
  const canCreate = hasPermission(PERMISSIONS.CONTACTS_CREATE);
  const canUpdate = hasPermission(PERMISSIONS.CONTACTS_UPDATE);
  const canDelete = hasPermission(PERMISSIONS.CONTACTS_DELETE);

  const createMut = useCreateContact();
  const updateMut = useUpdateContact();
  const deleteMut = useDeleteContact();
  const requestMut = useCreateContactRequest();

  const busy =
    createMut.isPending || updateMut.isPending || deleteMut.isPending || requestMut.isPending;

  async function collectDraft(options: {
    title: string;
    initial: ContactDraft;
    submitLabel: string;
    reasonRequired: boolean;
    reasonLabel: string;
    reasonHint?: string;
    notice?: React.ReactNode;
    contactId?: string;
  }): Promise<ContactDraft | undefined> {
    return modal.open<ContactDraft>(
      ({ close }) => (
        <ContactForm
          initial={options.initial}
          submitLabel={options.submitLabel}
          reasonRequired={options.reasonRequired}
          reasonLabel={options.reasonLabel}
          reasonHint={options.reasonHint}
          notice={options.notice}
          contactId={options.contactId}
          onSubmit={(draft) => close(draft)}
          onCancel={() => close()}
        />
      ),
      { title: options.title, size: "lg", closeOnBackdrop: false },
    );
  }

  async function startCreate(): Promise<void> {
    const draft = await collectDraft({
      title: canCreate ? "Add contact" : "Request a new contact",
      initial: emptyContactDraft(),
      submitLabel: canCreate ? "Add contact" : "Submit request",
      reasonRequired: false,
      reasonLabel: canCreate ? "Reason (optional)" : "Why is this contact needed? (optional)",
      notice: canCreate ? undefined : (
        <RequestNotice>
          You do not have permission to add contacts, so this is submitted as a request. It stays
          pending until someone with edit access reviews it — track it under
          {" "}<strong className="text-text">My requests</strong>.
        </RequestNotice>
      ),
    });
    if (!draft) return;

    const payload = draftToPayload(draft);
    const reason = draft.reason.trim() || null;
    try {
      if (canCreate) {
        await createMut.mutateAsync({ ...payload, reason });
      } else {
        await requestMut.mutateAsync({ request_type: "create", payload, reason });
      }
    } catch {
      /* mutation hook 이 에러 모달을 띄운다 */
    }
  }

  async function startEdit(contact: Contact): Promise<void> {
    const draft = await collectDraft({
      title: canUpdate ? `Edit ${contact.name}` : `Request a change to ${contact.name}`,
      initial: draftFromContact(contact),
      submitLabel: canUpdate ? "Save changes" : "Submit request",
      reasonRequired: true,
      reasonLabel: canUpdate ? "Reason for this change" : "Why should this change?",
      contactId: contact.id,
      notice: canUpdate ? undefined : (
        <RequestNotice>
          You do not have permission to edit contacts, so this is submitted as a request. Nothing
          changes until someone with edit access approves it.
        </RequestNotice>
      ),
    });
    if (!draft) return;

    const payload = draftToPayload(draft);
    const reason = draft.reason.trim();
    try {
      if (canUpdate) {
        await updateMut.mutateAsync({ id: contact.id, data: { ...payload, reason } });
      } else {
        await requestMut.mutateAsync({
          request_type: "update",
          contact_id: contact.id,
          payload,
          reason,
        });
      }
    } catch {
      /* mutation hook 이 에러 모달을 띄운다 */
    }
  }

  async function startDelete(contact: Contact): Promise<void> {
    // 브라우저 confirm() 은 쓰지 않는다 — 사유를 받아야 하고, 톤도 화면과 맞춰야 한다.
    const reason = await modal.confirm({
      requiresReason: true,
      reasonMandatory: true,
      variant: "danger",
      title: canDelete ? "Delete this contact?" : "Request deletion?",
      message: canDelete
        ? `"${contact.name}" will be removed from the directory. Any pending requests for it are closed at the same time. The change history keeps a record.`
        : `You do not have permission to delete contacts. "${contact.name}" stays in the directory until someone with delete access approves your request.`,
      confirmLabel: canDelete ? "Delete contact" : "Submit request",
      reasonLabel: canDelete ? "Reason for deleting" : "Why should this be deleted?",
    });
    if (reason === undefined) return;

    try {
      if (canDelete) {
        await deleteMut.mutateAsync({ id: contact.id, reason });
      } else {
        await requestMut.mutateAsync({
          request_type: "delete",
          contact_id: contact.id,
          payload: null,
          reason,
        });
      }
    } catch {
      /* mutation hook 이 에러 모달을 띄운다 */
    }
  }

  return { canCreate, canUpdate, canDelete, busy, startCreate, startEdit, startDelete };
}
