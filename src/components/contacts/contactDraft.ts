/**
 * Contacts — 폼 초안(draft) 모델과 payload 변환/검증.
 *
 * 폼은 생성/수정, 직접 저장/신청, 승인 시 수정반영까지 **한 벌**을 쓴다(요구사항 3).
 * 그래서 화면 상태(draft)와 서버 payload 를 분리해 두고, 변환·검증을 여기에 모았다.
 *
 * 계약: docs/99_inbox/2026-08-14-연락처-API계약.md
 */

import type {
  Contact,
  ContactRequestPayload,
  ContactTargetInput,
  ContactVisibility,
} from "@/types";

/** 계약상 상한 — 서버 422 를 맞기 전에 폼에서 먼저 잡는다. */
export const CONTACT_LIMITS = {
  name: 200,
  company: 200,
  summary: 72,
  /** 새로 쓰는 메모 상한 (D8-2). */
  notes: 300,
  /**
   * 구 memo 시절 상한. **기존 값을 손대지 않은 경우**에만 여기까지 통과한다 —
   * 서버도 같은 규칙이다. 안 그러면 예전에 길게 적힌 연락처는 이름 한 글자도 못 고친다.
   */
  notesLegacy: 4000,
  reason: 500,
  phoneNumber: 50,
  phoneLabel: 30,
  phones: 10,
  emailAddress: 255,
  emailLabel: 30,
  emails: 10,
  linkUrl: 500,
  linkLabel: 40,
  links: 10,
  tags: 20,
  tagLength: 40,
} as const;

/** 폼 안에서만 쓰는 전화번호 행. `key` 는 React 리스트 키(서버로 안 감). */
export interface ContactPhoneDraft {
  key: string;
  label: string;
  number: string;
  is_primary: boolean;
}

/** 폼 안에서만 쓰는 이메일 행. */
export interface ContactEmailDraft {
  key: string;
  label: string;
  address: string;
  is_primary: boolean;
}

/** 폼 안에서만 쓰는 링크 행. */
export interface ContactLinkDraft {
  key: string;
  label: string;
  url: string;
  is_primary: boolean;
}

/** 폼 상태. 빈 값은 `""` 로 두고 payload 변환 시 null 로 바꾼다. */
export interface ContactDraft {
  name: string;
  company: string;
  summary: string;
  notes: string;
  /**
   * 폼을 열 때의 notes 값. 300 상한을 **바뀐 값에만** 걸기 위한 기준선이다
   * (서버 규칙과 동일). 서버로는 보내지 않는다.
   */
  notesBaseline: string;
  /** 가시성 모드 — 명시 값이다. 대상이 비었다고 전체 공유가 되지 않는다 (V1). */
  visibility: ContactVisibility;
  /** visibility === "restricted" 일 때 고른 대상들(매장/직급/개인). OR 로 합쳐진다 (V4). */
  targets: ContactTargetInput[];
  /** 후보 명단에서 개인 단위로 뺀 사람들 (V4). Owner 는 뺄 수 없다. */
  excluded_user_ids: string[];
  phones: ContactPhoneDraft[];
  emails: ContactEmailDraft[];
  links: ContactLinkDraft[];
  tags: string[];
  /** 사유. 필수 여부는 화면(모드)이 정한다. */
  reason: string;
}

let rowKeySeq = 0;

/** 전화번호 행 키 생성 — 값이 같아도 행은 구분되어야 한다. */
export function newPhoneRow(overrides: Partial<ContactPhoneDraft> = {}): ContactPhoneDraft {
  rowKeySeq += 1;
  return {
    key: `phone-${rowKeySeq}`,
    label: "",
    number: "",
    is_primary: false,
    ...overrides,
  };
}

/** 이메일 행 키 생성. */
export function newEmailRow(overrides: Partial<ContactEmailDraft> = {}): ContactEmailDraft {
  rowKeySeq += 1;
  return {
    key: `email-${rowKeySeq}`,
    label: "",
    address: "",
    is_primary: false,
    ...overrides,
  };
}

/** 링크 행 키 생성. */
export function newLinkRow(overrides: Partial<ContactLinkDraft> = {}): ContactLinkDraft {
  rowKeySeq += 1;
  return { key: `link-${rowKeySeq}`, label: "", url: "", is_primary: false, ...overrides };
}

/**
 * 빈 폼 — **아무 칸도 미리 깔지 않는다** (D6).
 *
 * 이름 말고는 전부 선택 항목이라, 빈 칸을 늘어놓으면 "채워야 하는 것"처럼 보이고
 * 폼만 길어진다. 필요한 항목은 사용자가 `+ 추가` 로 꺼내 쓴다.
 */
export function emptyContactDraft(): ContactDraft {
  return {
    name: "",
    company: "",
    summary: "",
    notes: "",
    notesBaseline: "",
    visibility: "organization",
    targets: [],
    excluded_user_ids: [],
    phones: [],
    emails: [],
    links: [],
    tags: [],
    reason: "",
  };
}

function phoneRowsFrom(
  phones: { label?: string | null; number: string; is_primary?: boolean }[] | undefined,
): ContactPhoneDraft[] {
  const rows = (phones ?? []).map((p) =>
    newPhoneRow({
      label: p.label ?? "",
      number: p.number,
      is_primary: Boolean(p.is_primary),
    }),
  );
  // 값이 없으면 **빈 줄도 만들지 않는다** — 안 쓰는 항목은 폼에 나타나지 않는다 (D6).
  // 대표 승격은 여기서 하지 않는다 — 메인은 전화/이메일/링크를 통틀어 하나라서
  // 채널 하나만 보고 정할 수 없다 (draftToPayload 가 마지막에 정한다).
  return rows;
}

function emailRowsFrom(
  emails: { label?: string | null; address: string; is_primary?: boolean }[] | undefined,
): ContactEmailDraft[] {
  return (emails ?? []).map((e) =>
    newEmailRow({
      label: e.label ?? "",
      address: e.address,
      is_primary: Boolean(e.is_primary),
    }),
  );
}

function linkRowsFrom(
  links: { label?: string | null; url: string; is_primary?: boolean }[] | undefined,
): ContactLinkDraft[] {
  return (links ?? []).map((l) =>
    newLinkRow({ label: l.label ?? "", url: l.url, is_primary: Boolean(l.is_primary) }),
  );
}

/** 기존 연락처 → 폼 초안 (수정/수정신청). */
export function draftFromContact(contact: Contact): ContactDraft {
  const ordered = [...contact.phones].sort((a, b) => a.sort_order - b.sort_order);
  return {
    name: contact.name,
    company: contact.company ?? "",
    summary: contact.summary ?? "",
    notes: contact.notes ?? "",
    notesBaseline: contact.notes ?? "",
    visibility: contact.visibility,
    targets: contact.targets.map((t) => ({ type: t.type, id: t.id })),
    excluded_user_ids: contact.excluded_users.map((t) => t.id),
    phones: phoneRowsFrom(ordered),
    emails: emailRowsFrom(
      [...contact.emails].sort((a, b) => a.sort_order - b.sort_order),
    ),
    links: linkRowsFrom([...contact.links].sort((a, b) => a.sort_order - b.sort_order)),
    tags: contact.tags.map((t) => t.name),
    reason: "",
  };
}

/** 신청 payload → 폼 초안 (승인자가 "내용을 고쳐서 반영"할 때). */
export function draftFromPayload(payload: ContactRequestPayload): ContactDraft {
  return {
    name: payload.name,
    company: payload.company ?? "",
    summary: payload.summary ?? "",
    notes: payload.notes ?? "",
    notesBaseline: payload.notes ?? "",
    visibility: payload.visibility ?? "organization",
    targets: payload.targets ?? [],
    excluded_user_ids: payload.excluded_user_ids ?? [],
    phones: phoneRowsFrom(payload.phones),
    emails: emailRowsFrom(payload.emails),
    links: linkRowsFrom(payload.links),
    tags: payload.tags ?? [],
    reason: "",
  };
}

function orNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/** 숫자만 남긴 검색/중복비교용 값 — 서버 `normalize_phone` 과 같은 규칙. */
export function normalizePhone(value: string): string {
  return value.replace(/\D/g, "");
}

/**
 * 폼 초안 → 서버 payload.
 *
 * - 빈 번호 행은 버린다 (사용자가 추가만 하고 안 채운 줄).
 * - 대표번호가 하나도 없으면 첫 줄을 대표로 올린다(서버도 같은 규칙이지만 화면 표시를 맞춘다).
 * - 배열 순서가 곧 `sort_order` 다.
 */
export function draftToPayload(draft: ContactDraft): ContactRequestPayload {
  const phones = draft.phones
    .filter((p) => p.number.trim().length > 0)
    .map((p) => ({
      label: orNull(p.label),
      number: p.number.trim(),
      is_primary: p.is_primary,
    }));
  // 빈 줄은 버린다 — 추가만 하고 안 채운 줄이 저장되면 안 된다
  const emails = draft.emails
    .filter((e) => e.address.trim().length > 0)
    .map((e) => ({
      label: orNull(e.label),
      address: e.address.trim(),
      is_primary: e.is_primary,
    }));
  const links = draft.links
    .filter((l) => l.url.trim().length > 0)
    // URL 은 **원문 그대로** 보낸다. https:// 를 붙이는 건 여는 시점의 일이다.
    .map((l) => ({ label: orNull(l.label), url: l.url.trim(), is_primary: l.is_primary }));

  // 메인은 **셋을 통틀어 하나**다. 아무도 안 골랐으면 첫 전화 → 이메일 → 링크를 올린다
  // (서버도 같은 규칙이지만, 화면에 보이는 별과 저장 결과가 어긋나면 안 된다).
  const mainCount =
    phones.filter((p) => p.is_primary).length +
    emails.filter((e) => e.is_primary).length +
    links.filter((l) => l.is_primary).length;
  if (mainCount === 0) {
    const first = phones[0] ?? emails[0] ?? links[0];
    if (first) first.is_primary = true;
  }

  return {
    name: draft.name.trim(),
    company: orNull(draft.company),
    summary: orNull(draft.summary),
    notes: orNull(draft.notes),
    visibility: draft.visibility,
    // 전체 공유면 대상을 딸려 보내지 않는다 — 서버가 모순 상태로 거부한다.
    targets: draft.visibility === "restricted" ? draft.targets : [],
    excluded_user_ids:
      draft.visibility === "restricted" ? draft.excluded_user_ids : [],
    phones,
    emails,
    links,
    tags: draft.tags,
  };
}

/** 필드별 폼 에러. 비어 있으면 통과. */
export type ContactDraftErrors = Partial<
  Record<
    | "name"
    | "summary"
    | "notes"
    | "company"
    | "phones"
    | "emails"
    | "links"
    | "tags"
    | "reason"
    | "visibility",
    string
  >
>;

/**
 * 폼 검증 — 서버가 거절할 것을 미리, 고칠 곳을 짚어서 알려준다.
 * (에러 UX 표준: 원인 + 다음 행동을 필드 옆에)
 */
export function validateContactDraft(
  draft: ContactDraft,
  options: { reasonRequired: boolean },
): ContactDraftErrors {
  const errors: ContactDraftErrors = {};

  const name = draft.name.trim();
  if (name.length === 0) {
    errors.name = "Name is required. Enter who or what this number belongs to.";
  } else if (name.length > CONTACT_LIMITS.name) {
    errors.name = `Name is too long (${name.length}/${CONTACT_LIMITS.name}). Shorten it.`;
  }

  if (draft.company.trim().length > CONTACT_LIMITS.company) {
    errors.company = `Company is too long (max ${CONTACT_LIMITS.company} characters).`;
  }

  const summary = draft.summary.trim();
  if (summary.length > CONTACT_LIMITS.summary) {
    errors.summary =
      `Summary is ${summary.length}/${CONTACT_LIMITS.summary} characters. ` +
      "Keep it to one line — the long version goes in Notes.";
  }

  // Notes 상한은 **바뀐 값에만** 건다 (서버와 같은 규칙).
  // 예전에 길게 적힌 메모를 손대지 않았다면 그대로 통과시킨다 — 안 그러면
  // 그 연락처는 이름 한 글자도 못 고친다.
  const notes = draft.notes.trim();
  const notesChanged = notes !== draft.notesBaseline.trim();
  if (notesChanged && notes.length > CONTACT_LIMITS.notes) {
    errors.notes =
      `Notes is ${notes.length}/${CONTACT_LIMITS.notes} characters. ` +
      "Shorten it, or move the details to a document.";
  } else if (!notesChanged && notes.length > CONTACT_LIMITS.notesLegacy) {
    errors.notes = `Notes is too long (max ${CONTACT_LIMITS.notesLegacy} characters).`;
  }

  const filledEmails = draft.emails.filter((e) => e.address.trim().length > 0);
  if (filledEmails.length > CONTACT_LIMITS.emails) {
    errors.emails = `Up to ${CONTACT_LIMITS.emails} email addresses. Remove a few.`;
  } else if (filledEmails.some((e) => !e.address.includes("@"))) {
    errors.emails = "An email is missing @. Fix it or remove the row.";
  } else if (
    filledEmails.some((e) => e.address.trim().length > CONTACT_LIMITS.emailAddress)
  ) {
    errors.emails = `An email is too long (max ${CONTACT_LIMITS.emailAddress} characters).`;
  } else if (filledEmails.some((e) => e.label.trim().length > CONTACT_LIMITS.emailLabel)) {
    errors.emails = `A label is too long (max ${CONTACT_LIMITS.emailLabel} characters).`;
  }

  const filledLinks = draft.links.filter((l) => l.url.trim().length > 0);
  if (filledLinks.length > CONTACT_LIMITS.links) {
    errors.links = `Up to ${CONTACT_LIMITS.links} links. Remove a few.`;
  } else if (filledLinks.some((l) => /\s/.test(l.url.trim()))) {
    errors.links = "A link contains a space. Links cannot have spaces.";
  } else if (filledLinks.some((l) => l.url.trim().length > CONTACT_LIMITS.linkUrl)) {
    errors.links = `A link is too long (max ${CONTACT_LIMITS.linkUrl} characters).`;
  } else if (filledLinks.some((l) => l.label.trim().length > CONTACT_LIMITS.linkLabel)) {
    errors.links = `A label is too long (max ${CONTACT_LIMITS.linkLabel} characters).`;
  }

  const filledPhones = draft.phones.filter((p) => p.number.trim().length > 0);
  if (filledPhones.length > CONTACT_LIMITS.phones) {
    errors.phones = `Up to ${CONTACT_LIMITS.phones} numbers per contact. Remove a few.`;
  } else if (filledPhones.some((p) => p.number.trim().length > CONTACT_LIMITS.phoneNumber)) {
    errors.phones = `A number is too long (max ${CONTACT_LIMITS.phoneNumber} characters).`;
  } else if (filledPhones.some((p) => p.label.trim().length > CONTACT_LIMITS.phoneLabel)) {
    errors.phones = `A label is too long (max ${CONTACT_LIMITS.phoneLabel} characters).`;
  }

  if (draft.tags.length > CONTACT_LIMITS.tags) {
    errors.tags = `Up to ${CONTACT_LIMITS.tags} tags per contact. Remove a few.`;
  } else if (draft.tags.some((t) => t.length > CONTACT_LIMITS.tagLength)) {
    errors.tags = `A tag is too long (max ${CONTACT_LIMITS.tagLength} characters).`;
  }

  // 가시성 — 서버와 같은 규칙을 폼에서 먼저 잡는다 (V1).
  // 대상 0개를 조용히 전체 공유로 떨어뜨리지 않는다.
  if (draft.visibility === "restricted" && draft.targets.length === 0) {
    errors.visibility =
      "Pick at least one store, role or person, or share this contact with the whole organization.";
  }

  const reason = draft.reason.trim();
  if (options.reasonRequired && reason.length === 0) {
    errors.reason = "A reason is required — it is kept in the change history.";
  } else if (reason.length > CONTACT_LIMITS.reason) {
    errors.reason = `Reason is too long (max ${CONTACT_LIMITS.reason} characters).`;
  }

  return errors;
}
