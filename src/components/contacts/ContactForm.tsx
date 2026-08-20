"use client";

/**
 * 연락처 폼 — 생성/수정 공용, 직접 저장과 "신청" 공용.
 *
 * 권한이 없는 사람도 **같은 폼**을 쓰고, 제출 버튼의 뜻만 "신청"으로 바뀐다(설계 D4).
 * 그래서 이 컴포넌트는 어떤 API 를 부를지 모른다 — 호출 측이 draft 를 받아서 결정한다.
 *
 * 배치 규칙:
 *  - **섹션은 항상 제자리에 있다.** 제목 줄만 있고, 옆의 `+ Add` 를 누르면 그 자리에서
 *    입력칸이 열린다 (D17). 폼 맨 아래 칩으로 모아두면 항목을 추가할 때마다 아래로
 *    내려갔다 다시 올라와야 한다.
 *  - Name / Summary / Tags 는 입력칸이 처음부터 열려 있다 (D14) — 목록에서 연락처를
 *    알아보는 축이라 숨기면 아무도 채우지 않는다.
 *  - **Visibility 와 Reason 은 접지 않는다.** 가시성을 접으면 기본값이 뭔지 모른 채
 *    저장돼 공개 범위 사고가 나고, 사유를 접으면 이력이 비어버린다.
 *  - 전화·이메일·링크 줄은 **드래그로 순서를 바꾼다** (D18). 화살표 연타는 줄이 많아지면
 *    따라가기 어렵다.
 *  - 메인 연락수단(별)은 **세 채널을 통틀어 하나**다 (D13).
 *
 * 모달 안에서 쓰도록 만들어졌다(`modal.open`). 자체 헤더는 없다.
 */

import React, { useEffect, useState } from "react";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { AlertTriangle, GripVertical, Plus, Star, Trash2 } from "lucide-react";

import { Button, Input, Textarea } from "@/components/ui";
import { DUPLICATE_MIN_DIGITS, DuplicatePhoneNotice } from "./DuplicatePhoneNotice";
import { ContactTagInput } from "./ContactTagInput";
import { VisibilityPicker } from "./VisibilityPicker";
import {
  CONTACT_LIMITS,
  newEmailRow,
  newLinkRow,
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

type ChannelKey = "phones" | "emails" | "links";

const ROW_INPUT =
  "min-w-0 flex-1 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/50";
const LABEL_INPUT =
  "w-28 shrink-0 rounded-lg border border-border bg-surface px-2 py-2 text-sm text-text placeholder:text-text-muted focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/50";

/**
 * 섹션 껍데기 — **제목 줄은 항상 보인다.**
 *
 * 내용이 없으면 제목 + `Add` 만 있고, 누르면 그 자리에서 입력칸이 열린다.
 * 어떤 항목을 담을 수 있는지가 폼을 훑기만 해도 보이고, 추가하러 이동할 필요가 없다.
 */
function Section({
  label,
  hint,
  addLabel,
  onAdd,
  addDisabled,
  addHint,
  children,
  isEmpty,
}: {
  label: string;
  hint: string;
  addLabel: string;
  onAdd: () => void;
  addDisabled?: boolean;
  addHint?: string;
  children?: React.ReactNode;
  isEmpty: boolean;
}): React.ReactElement {
  return (
    <div className="rounded-xl border border-border bg-surface/60 p-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">
          {label}
        </span>
        <button
          type="button"
          onClick={onAdd}
          disabled={addDisabled}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-accent transition-colors hover:bg-accent-muted disabled:cursor-not-allowed disabled:text-text-muted disabled:hover:bg-transparent"
        >
          <Plus size={13} /> {addLabel}
        </button>
      </div>
      {!isEmpty && <div className="mt-2">{children}</div>}
      {addHint && <p className="mt-1.5 text-xs text-warning">{addHint}</p>}
      <p className="mt-1.5 text-xs text-text-muted">{hint}</p>
    </div>
  );
}

/** 드래그로 옮길 수 있는 한 줄. 손잡이를 잡고 끌면 순서가 바뀐다. */
function SortableRow({
  id,
  children,
}: {
  id: string;
  children: React.ReactNode;
}): React.ReactElement {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-start gap-2 rounded-lg ${isDragging ? "bg-surface opacity-60 shadow-lg" : ""}`}
    >
      <button
        type="button"
        aria-label="Drag to reorder"
        title="Drag to reorder"
        className="mt-2 shrink-0 cursor-grab touch-none text-text-muted transition-colors hover:text-text active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVertical size={16} />
      </button>
      {children}
    </div>
  );
}

/** 줄 오른쪽 조작 — 메인 지정 / 삭제. 순서는 드래그로 바꾼다. */
function RowActions({
  isMain,
  onMain,
  onRemove,
  what,
}: {
  isMain: boolean;
  onMain: () => void;
  onRemove: () => void;
  what: string;
}): React.ReactElement {
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <button
        type="button"
        onClick={onMain}
        aria-pressed={isMain}
        title={isMain ? "This is the Main contact" : "Make this the Main contact"}
        className={
          isMain
            ? "rounded-lg border border-accent bg-accent-muted p-2 text-accent"
            : "rounded-lg border border-border bg-surface p-2 text-text-muted transition-colors hover:text-text"
        }
      >
        <Star size={15} fill={isMain ? "currentColor" : "none"} />
      </button>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove this ${what}`}
        title="Remove"
        className="rounded-lg border border-border bg-surface p-2 text-text-muted transition-colors hover:border-danger/50 hover:text-danger"
      >
        <Trash2 size={15} />
      </button>
    </div>
  );
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
  /** "앞줄부터 채우라"는 안내 — 줄을 더 만들지 않은 이유를 그 자리에서 알려준다. */
  const [addHint, setAddHint] = useState<Record<string, string>>({});
  /** Company / Notes 는 값이 없어도 한 번 열면 입력칸을 유지한다. */
  const [openText, setOpenText] = useState<{ company: boolean; notes: boolean }>({
    company: initial.company.trim().length > 0,
    notes: initial.notes.trim().length > 0,
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    if (!submitAttempted) return;
    setErrors(validateContactDraft(draft, { reasonRequired }));
  }, [draft, reasonRequired, submitAttempted]);

  function patch(changes: Partial<ContactDraft>): void {
    setDraft((prev) => ({ ...prev, ...changes }));
  }

  /**
   * 메인 연락수단 지정 — **전화/이메일/링크를 통틀어 하나**다.
   * 다른 채널의 별까지 함께 끈다. 그래야 목록의 Main contact 가 무엇이 될지 헷갈리지 않는다.
   */
  function setMain(kind: "phone" | "email" | "link", key: string): void {
    setDraft((prev) => ({
      ...prev,
      phones: prev.phones.map((p) => ({ ...p, is_primary: kind === "phone" && p.key === key })),
      emails: prev.emails.map((e) => ({ ...e, is_primary: kind === "email" && e.key === key })),
      links: prev.links.map((l) => ({ ...l, is_primary: kind === "link" && l.key === key })),
    }));
  }

  /** 드래그 종료 — 배열 순서가 곧 표시 순서(sort_order)다. */
  function handleDragEnd(kind: ChannelKey, event: DragEndEvent): void {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    setDraft((prev) => {
      // 세 채널의 행 타입이 달라 유니온으로 잡히므로, 키만 보고 옮긴 뒤 원래 타입으로 돌린다.
      const rows: { key: string }[] = prev[kind];
      const from = rows.findIndex((r) => r.key === active.id);
      const to = rows.findIndex((r) => r.key === over.id);
      if (from < 0 || to < 0) return prev;
      if (kind === "phones") return { ...prev, phones: arrayMove(prev.phones, from, to) };
      if (kind === "emails") return { ...prev, emails: arrayMove(prev.emails, from, to) };
      return { ...prev, links: arrayMove(prev.links, from, to) };
    });
  }

  /**
   * 줄 추가 — **앞줄이 비어 있으면 먼저 채우라고 말한다.**
   * 빈 줄을 쌓게 두면 저장할 때 조용히 버려져서, 적었다고 생각한 값이 사라진 것처럼 보인다.
   */
  function addRow(kind: ChannelKey): void {
    const rows = draft[kind];
    const last = rows[rows.length - 1];
    const lastEmpty =
      last !== undefined &&
      (kind === "phones"
        ? draft.phones[rows.length - 1].number.trim().length === 0
        : kind === "emails"
          ? draft.emails[rows.length - 1].address.trim().length === 0
          : draft.links[rows.length - 1].url.trim().length === 0);
    if (lastEmpty) {
      setAddHint((prev) => ({
        ...prev,
        [kind]: "Fill in the empty row first, then add another.",
      }));
      return;
    }
    setAddHint((prev) => ({ ...prev, [kind]: "" }));
    if (kind === "phones") patch({ phones: [...draft.phones, newPhoneRow()] });
    if (kind === "emails") patch({ emails: [...draft.emails, newEmailRow()] });
    if (kind === "links") patch({ links: [...draft.links, newLinkRow()] });
  }

  function handleSubmit(e: React.FormEvent): void {
    e.preventDefault();
    setSubmitAttempted(true);
    const found = validateContactDraft(draft, { reasonRequired });
    setErrors(found);
    if (Object.keys(found).length > 0) return;
    onSubmit(draft);
  }

  const addLabel = (n: number): string => (n === 0 ? "Add" : "Add another");

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {notice}

      <Input
        label="Name *"
        value={draft.name}
        onChange={(e) => patch({ name: e.target.value })}
        error={errors.name}
        maxLength={CONTACT_LIMITS.name}
        placeholder="Who or what this contact is"
        autoFocus
      />

      {/* Summary 와 Tags 는 항상 열려 있다 — 목록에서 연락처를 알아보는 두 축이다 (D14) */}
      <div>
        <label
          className="mb-1.5 block text-sm font-medium text-text-secondary"
          htmlFor="contact-summary"
        >
          Summary
        </label>
        <input
          id="contact-summary"
          value={draft.summary}
          onChange={(e) => patch({ summary: e.target.value })}
          maxLength={CONTACT_LIMITS.summary}
          placeholder="One line shown in the list"
          className={`${ROW_INPUT} w-full`}
        />
        <div className="mt-1 flex items-start justify-between gap-2">
          <p className="text-xs text-text-muted">
            Shown in the list next to the name — keep it to one line.
          </p>
          <span className="shrink-0 text-[11px] text-text-muted">
            {draft.summary.length}/{CONTACT_LIMITS.summary}
          </span>
        </div>
        {errors.summary && <p className="mt-1 text-xs text-danger">{errors.summary}</p>}
      </div>

      <ContactTagInput
        value={draft.tags}
        onChange={(tags) => patch({ tags })}
        error={errors.tags}
      />

      {/* Phone */}
      <Section
        label="Phone"
        hint="Star one row to make it the Main contact shown in the list. Drag to reorder."
        addLabel={addLabel(draft.phones.length)}
        addDisabled={draft.phones.length >= CONTACT_LIMITS.phones}
        addHint={addHint.phones}
        onAdd={() => addRow("phones")}
        isEmpty={draft.phones.length === 0}
      >
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={(e) => handleDragEnd("phones", e)}
        >
          <SortableContext
            items={draft.phones.map((p) => p.key)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2">
              {draft.phones.map((phone) => {
                const digits = normalizePhone(phone.number);
                return (
                  <div key={phone.key}>
                    <SortableRow id={phone.key}>
                      <input
                        value={phone.label}
                        onChange={(e) =>
                          patch({
                            phones: draft.phones.map((p) =>
                              p.key === phone.key ? { ...p, label: e.target.value } : p,
                            ),
                          })
                        }
                        maxLength={CONTACT_LIMITS.phoneLabel}
                        placeholder="Label"
                        aria-label="Phone label"
                        className={LABEL_INPUT}
                      />
                      <input
                        value={phone.number}
                        onChange={(e) =>
                          patch({
                            phones: draft.phones.map((p) =>
                              p.key === phone.key ? { ...p, number: e.target.value } : p,
                            ),
                          })
                        }
                        maxLength={CONTACT_LIMITS.phoneNumber}
                        placeholder="(213) 555-0134"
                        aria-label="Phone number"
                        inputMode="tel"
                        className={ROW_INPUT}
                      />
                      <RowActions
                        isMain={phone.is_primary}
                        onMain={() => setMain("phone", phone.key)}
                        onRemove={() =>
                          patch({ phones: draft.phones.filter((p) => p.key !== phone.key) })
                        }
                        what="number"
                      />
                    </SortableRow>
                    {digits.length >= DUPLICATE_MIN_DIGITS && (
                      <DuplicatePhoneNotice digits={digits} excludeContactId={contactId} />
                    )}
                  </div>
                );
              })}
            </div>
          </SortableContext>
        </DndContext>
        {errors.phones && <p className="mt-1 text-xs text-danger">{errors.phones}</p>}
      </Section>

      {/* Email */}
      <Section
        label="Email"
        hint="Star one row to make it the Main contact shown in the list. Drag to reorder."
        addLabel={addLabel(draft.emails.length)}
        addDisabled={draft.emails.length >= CONTACT_LIMITS.emails}
        addHint={addHint.emails}
        onAdd={() => addRow("emails")}
        isEmpty={draft.emails.length === 0}
      >
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={(e) => handleDragEnd("emails", e)}
        >
          <SortableContext
            items={draft.emails.map((e) => e.key)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2">
              {draft.emails.map((email) => (
                <SortableRow key={email.key} id={email.key}>
                  <input
                    value={email.label}
                    onChange={(e) =>
                      patch({
                        emails: draft.emails.map((x) =>
                          x.key === email.key ? { ...x, label: e.target.value } : x,
                        ),
                      })
                    }
                    maxLength={CONTACT_LIMITS.emailLabel}
                    placeholder="Label"
                    aria-label="Email label"
                    className={LABEL_INPUT}
                  />
                  <input
                    value={email.address}
                    onChange={(e) =>
                      patch({
                        emails: draft.emails.map((x) =>
                          x.key === email.key ? { ...x, address: e.target.value } : x,
                        ),
                      })
                    }
                    maxLength={CONTACT_LIMITS.emailAddress}
                    placeholder="name@company.com"
                    aria-label="Email address"
                    inputMode="email"
                    className={ROW_INPUT}
                  />
                  <RowActions
                    isMain={email.is_primary}
                    onMain={() => setMain("email", email.key)}
                    onRemove={() =>
                      patch({ emails: draft.emails.filter((x) => x.key !== email.key) })
                    }
                    what="email"
                  />
                </SortableRow>
              ))}
            </div>
          </SortableContext>
        </DndContext>
        {errors.emails && <p className="mt-1 text-xs text-danger">{errors.emails}</p>}
      </Section>

      {/* Link */}
      <Section
        label="Link"
        hint="Websites, order portals, shared folders. Drag to reorder."
        addLabel={addLabel(draft.links.length)}
        addDisabled={draft.links.length >= CONTACT_LIMITS.links}
        addHint={addHint.links}
        onAdd={() => addRow("links")}
        isEmpty={draft.links.length === 0}
      >
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={(e) => handleDragEnd("links", e)}
        >
          <SortableContext
            items={draft.links.map((l) => l.key)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2">
              {draft.links.map((link) => (
                <SortableRow key={link.key} id={link.key}>
                  <input
                    value={link.label}
                    onChange={(e) =>
                      patch({
                        links: draft.links.map((x) =>
                          x.key === link.key ? { ...x, label: e.target.value } : x,
                        ),
                      })
                    }
                    maxLength={CONTACT_LIMITS.linkLabel}
                    placeholder="Label"
                    aria-label="Link label"
                    className={LABEL_INPUT}
                  />
                  <input
                    value={link.url}
                    onChange={(e) =>
                      patch({
                        links: draft.links.map((x) =>
                          x.key === link.key ? { ...x, url: e.target.value } : x,
                        ),
                      })
                    }
                    maxLength={CONTACT_LIMITS.linkUrl}
                    placeholder="order.company.com"
                    aria-label="Link URL"
                    inputMode="url"
                    className={ROW_INPUT}
                  />
                  <RowActions
                    isMain={link.is_primary}
                    onMain={() => setMain("link", link.key)}
                    onRemove={() =>
                      patch({ links: draft.links.filter((x) => x.key !== link.key) })
                    }
                    what="link"
                  />
                </SortableRow>
              ))}
            </div>
          </SortableContext>
        </DndContext>
        {errors.links && <p className="mt-1 text-xs text-danger">{errors.links}</p>}
      </Section>

      {/* Company */}
      <Section
        label="Company"
        hint="Shown under the name in the list."
        addLabel="Add"
        addDisabled={openText.company}
        onAdd={() => setOpenText((p) => ({ ...p, company: true }))}
        isEmpty={!openText.company}
      >
        <div className="flex items-start gap-2">
          <input
            value={draft.company}
            onChange={(e) => patch({ company: e.target.value })}
            maxLength={CONTACT_LIMITS.company}
            placeholder="Vendor or partner name"
            aria-label="Company"
            className={`${ROW_INPUT} w-full`}
          />
          <button
            type="button"
            onClick={() => {
              patch({ company: "" });
              setOpenText((p) => ({ ...p, company: false }));
            }}
            aria-label="Remove company"
            title="Remove"
            className="shrink-0 rounded-lg border border-border bg-surface p-2 text-text-muted transition-colors hover:border-danger/50 hover:text-danger"
          >
            <Trash2 size={15} />
          </button>
        </div>
        {errors.company && <p className="mt-1 text-xs text-danger">{errors.company}</p>}
      </Section>

      {/* Notes */}
      <Section
        label="Notes"
        hint={`Only in the expanded row and the detail. Up to ${CONTACT_LIMITS.notes} characters.`}
        addLabel="Add"
        addDisabled={openText.notes}
        onAdd={() => setOpenText((p) => ({ ...p, notes: true }))}
        isEmpty={!openText.notes}
      >
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <Textarea
              value={draft.notes}
              onChange={(e) => patch({ notes: e.target.value })}
              error={errors.notes}
              rows={3}
              placeholder="Hours, who to ask for, account number"
              aria-label="Notes"
            />
            <p className="mt-1 text-right text-[11px] text-text-muted">
              {draft.notes.trim().length}/{CONTACT_LIMITS.notes}
            </p>
          </div>
          <button
            type="button"
            onClick={() => {
              patch({ notes: "" });
              setOpenText((p) => ({ ...p, notes: false }));
            }}
            aria-label="Remove notes"
            title="Remove"
            className="shrink-0 rounded-lg border border-border bg-surface p-2 text-text-muted transition-colors hover:border-danger/50 hover:text-danger"
          >
            <Trash2 size={15} />
          </button>
        </div>
      </Section>

      {/* 가시성 — 전체 공유는 **고르는 것**이지 "아무것도 안 고른 상태"가 아니다 (V1).
          접지 않는다 — 기본값을 모른 채 저장되면 공개 범위 사고가 난다. */}
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
