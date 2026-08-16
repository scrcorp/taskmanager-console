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
  email: 255,
  memo: 4000,
  reason: 500,
  phoneNumber: 50,
  phoneLabel: 30,
  phones: 10,
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

/** 폼 상태. 빈 값은 `""` 로 두고 payload 변환 시 null 로 바꾼다. */
export interface ContactDraft {
  name: string;
  company: string;
  email: string;
  memo: string;
  /** 가시성 모드 — 명시 값이다. 대상이 비었다고 전체 공유가 되지 않는다 (V1). */
  visibility: ContactVisibility;
  /** visibility === "restricted" 일 때 고른 대상들(매장/직급/개인). OR 로 합쳐진다 (V4). */
  targets: ContactTargetInput[];
  /** 후보 명단에서 개인 단위로 뺀 사람들 (V4). Owner 는 뺄 수 없다. */
  excluded_user_ids: string[];
  phones: ContactPhoneDraft[];
  tags: string[];
  /** 사유. 필수 여부는 화면(모드)이 정한다. */
  reason: string;
}

let phoneKeySeq = 0;

/** 전화번호 행 키 생성 — 값이 같아도 행은 구분되어야 한다. */
export function newPhoneRow(overrides: Partial<ContactPhoneDraft> = {}): ContactPhoneDraft {
  phoneKeySeq += 1;
  return {
    key: `phone-${phoneKeySeq}`,
    label: "",
    number: "",
    is_primary: false,
    ...overrides,
  };
}

/** 빈 폼 — 전화번호 한 줄을 대표번호로 미리 깔아 둔다. */
export function emptyContactDraft(): ContactDraft {
  return {
    name: "",
    company: "",
    email: "",
    memo: "",
    visibility: "organization",
    targets: [],
    excluded_user_ids: [],
    phones: [newPhoneRow({ is_primary: true })],
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
  if (rows.length === 0) return [newPhoneRow({ is_primary: true })];
  if (!rows.some((r) => r.is_primary)) rows[0].is_primary = true;
  return rows;
}

/** 기존 연락처 → 폼 초안 (수정/수정신청). */
export function draftFromContact(contact: Contact): ContactDraft {
  const ordered = [...contact.phones].sort((a, b) => a.sort_order - b.sort_order);
  return {
    name: contact.name,
    company: contact.company ?? "",
    email: contact.email ?? "",
    memo: contact.memo ?? "",
    visibility: contact.visibility,
    targets: contact.targets.map((t) => ({ type: t.type, id: t.id })),
    excluded_user_ids: contact.excluded_users.map((t) => t.id),
    phones: phoneRowsFrom(ordered),
    tags: contact.tags.map((t) => t.name),
    reason: "",
  };
}

/** 신청 payload → 폼 초안 (승인자가 "내용을 고쳐서 반영"할 때). */
export function draftFromPayload(payload: ContactRequestPayload): ContactDraft {
  return {
    name: payload.name,
    company: payload.company ?? "",
    email: payload.email ?? "",
    memo: payload.memo ?? "",
    visibility: payload.visibility ?? "organization",
    targets: payload.targets ?? [],
    excluded_user_ids: payload.excluded_user_ids ?? [],
    phones: phoneRowsFrom(payload.phones),
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
  if (phones.length > 0 && !phones.some((p) => p.is_primary)) {
    phones[0].is_primary = true;
  }
  return {
    name: draft.name.trim(),
    company: orNull(draft.company),
    email: orNull(draft.email),
    memo: orNull(draft.memo),
    visibility: draft.visibility,
    // 전체 공유면 대상을 딸려 보내지 않는다 — 서버가 모순 상태로 거부한다.
    targets: draft.visibility === "restricted" ? draft.targets : [],
    excluded_user_ids:
      draft.visibility === "restricted" ? draft.excluded_user_ids : [],
    phones,
    tags: draft.tags,
  };
}

/** 필드별 폼 에러. 비어 있으면 통과. */
export type ContactDraftErrors = Partial<
  Record<
    | "name"
    | "email"
    | "memo"
    | "company"
    | "phones"
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

  const email = draft.email.trim();
  if (email.length > 0) {
    if (!email.includes("@")) {
      errors.email = "Email must contain @. Fix it or leave the field empty.";
    } else if (email.length > CONTACT_LIMITS.email) {
      errors.email = `Email is too long (max ${CONTACT_LIMITS.email} characters).`;
    }
  }

  if (draft.memo.trim().length > CONTACT_LIMITS.memo) {
    errors.memo = `Memo is too long (max ${CONTACT_LIMITS.memo} characters). Trim it down.`;
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
