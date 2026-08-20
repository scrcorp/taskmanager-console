/**
 * Contacts — organization phone directory types.
 *
 * 서버 계약: docs/99_inbox/2026-08-14-연락처-API계약.md
 * 설계 SoT:  docs/99_inbox/2026-08-14-연락처(Contacts)-기능-설계.md
 *
 * 원칙 몇 가지 (계약에서 그대로 옮김):
 *  - `number_normalized` 는 서버 계산값. 클라이언트가 보내도 무시된다 → 입력 타입에 없음.
 *  - `sort_order` 는 배열 순서로 결정된다 → 입력 타입에 없음.
 *  - 태그는 **문자열 배열**로 보낸다 (ID 아님). 서버가 org 단위로 upsert.
 *  - 가시성은 **명시 모드**다: `visibility="organization"`(전 조직) | `"stores"`(지정 매장).
 *    매장 목록이 비었다고 전체 공유가 되지 않는다 — 서버가 거부한다 (확장 D1).
 *    목록 필터에서 "전체 공유만"은 리터럴 `"none"` 을 쓴다 (파라미터 이름은 store_id 유지).
 */

// ─── 연락처 ──────────────────────────────────────────────────────────────────

/** 연락처에 달린 전화번호 한 건 (응답). */
export interface ContactPhone {
  id: string;
  /** mobile / office / home / fax / other 등 자유 문자열. 없을 수 있다. */
  label: string | null;
  /** 사용자가 입력한 원본 표기. 화면에는 이걸 그대로 보여준다. */
  number: string;
  /** 숫자만 남긴 검색용 값. 숫자가 하나도 없으면 null. */
  number_normalized: string | null;
  is_primary: boolean;
  sort_order: number;
}

/** 전화번호 입력 (생성/수정 요청). 배열 순서가 곧 sort_order. */
export interface ContactPhoneInput {
  label?: string | null;
  number: string;
  is_primary?: boolean;
}

/** 연락처에 달린 이메일 한 건 (응답). 전화번호와 같은 모양 (D7). */
export interface ContactEmail {
  id: string;
  /** orders / billing / support 등 자유 문자열. 없을 수 있다. */
  label: string | null;
  address: string;
  is_primary: boolean;
  sort_order: number;
}

/** 이메일 입력. 배열 순서가 곧 sort_order. */
export interface ContactEmailInput {
  label?: string | null;
  address: string;
  is_primary?: boolean;
}

/** 연락처에 달린 링크 한 건 (응답). */
export interface ContactLink {
  id: string;
  /** website / order portal / catalog 등 자유 문자열. */
  label: string | null;
  /** **입력 원문 그대로**. 스킴이 없을 수 있다 — 여는 시점에 https:// 를 붙인다. */
  url: string;
  /** 메인 연락수단 — 전화/이메일/링크를 **통틀어** 연락처당 하나만 true. */
  is_primary: boolean;
  sort_order: number;
}

/** 링크 입력. 배열 순서가 곧 sort_order. */
export interface ContactLinkInput {
  label?: string | null;
  url: string;
  is_primary?: boolean;
}

/** 연락처 가시성 모드. `restricted` = 아래 대상들에게만. */
export type ContactVisibility = "organization" | "restricted";

/** 공개 대상 축 (V4). position 은 이 프로젝트에 "사용자의 직책"이 없어 제외. */
export type ContactTargetType = "store" | "role" | "user";

/** 공개 대상 한 건 (응답) — 타입 + id + 표시명. */
export interface ContactTargetRef {
  type: ContactTargetType;
  id: string;
  name: string;
}

/** 공개 대상 한 건 (요청). */
export interface ContactTargetInput {
  type: ContactTargetType;
  id: string;
}

/** 가시성 미리보기 응답 — "지금 누가 보는가" (V4/V5). */
export interface ContactViewer {
  id: string;
  name: string;
  /** Owner / Everyone / Store / Role / Named */
  reason: string;
  /** Owner 는 뺄 수 없다 (V1). */
  can_exclude: boolean;
}

export interface ContactVisibilityPreview {
  viewers: ContactViewer[];
  total: number;
}

/** org 단위 태그 마스터 항목 (응답). */
export interface ContactTag {
  id: string;
  /** 표시명 — 최초 등록 시 표기가 유지된다. */
  name: string;
  /** 정규화 키 = lower(trim(name)). 필터 비교는 이 값으로. */
  key: string;
}

/** 태그 자동완성 응답 항목. */
export interface ContactTagSuggestion extends ContactTag {
  /** caller 가 볼 수 있는 연락처 기준 사용 횟수. */
  usage_count: number;
}

/** 연락처 (응답). */
export interface Contact {
  id: string;
  name: string;
  company: string | null;
  /** 한 줄 요약 (72자) — 목록에 그대로 실린다. */
  summary: string | null;
  /** 상세 메모 (신규 입력 300자) — 상세·펼침에서만 보인다. */
  notes: string | null;
  visibility: ContactVisibility;
  /** visibility === "restricted" 일 때만 채워진다. (타입, 이름) 순. */
  targets: ContactTargetRef[];
  /** 명시적으로 제외된 사람들 (V4). */
  excluded_users: ContactTargetRef[];
  phones: ContactPhone[];
  emails: ContactEmail[];
  links: ContactLink[];
  tags: ContactTag[];
  /** **요청자 기준** 즐겨찾기 여부. 남의 별은 오지 않는다 (D3). */
  is_favorite: boolean;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
  /** 상세 응답에만 채워진다. 목록에서는 항상 0. */
  pending_request_count: number;
}

/** 연락처 생성 요청. */
export interface ContactCreate {
  name: string;
  company?: string | null;
  summary?: string | null;
  notes?: string | null;
  visibility?: ContactVisibility;
  /** visibility === "restricted" 이면 1개 이상 필수. */
  targets?: ContactTargetInput[];
  excluded_user_ids?: string[];
  phones?: ContactPhoneInput[];
  emails?: ContactEmailInput[];
  links?: ContactLinkInput[];
  tags?: string[];
  /** 등록 사유 — 선택 (이력에 남는다). */
  reason?: string | null;
}

/**
 * 연락처 수정 요청 — PUT 전체 치환.
 *
 * 키를 아예 보내지 않으면 "변경 없음", `null` 을 보내면 "값을 비움"이다 (name 은 null 불가).
 * `phones` / `tags` 는 생략하면 변경 없음, `[]` 를 보내면 전부 삭제.
 */
export interface ContactUpdate {
  name?: string;
  company?: string | null;
  summary?: string | null;
  notes?: string | null;
  visibility?: ContactVisibility;
  targets?: ContactTargetInput[];
  excluded_user_ids?: string[];
  phones?: ContactPhoneInput[];
  emails?: ContactEmailInput[];
  links?: ContactLinkInput[];
  tags?: string[];
  /** 수정 사유 — **필수**. */
  reason: string;
}

/** 삭제 요청 본문 — soft delete, 사유 필수. */
export interface ContactDeleteRequest {
  reason: string;
}

/** 삭제 응답. */
export interface ContactDeleteResult {
  message: string;
  /** 이 삭제로 무효화(superseded)된 pending 신청 수. */
  superseded_request_count: number;
}

/** 목록 정렬 옵션. 기본은 이름순(N9). */
export type ContactSort = "name" | "name_desc" | "created_at" | "updated_at";

/** 목록/검색 필터. */
export interface ContactFilters {
  /** 통합 검색어 — name/company/summary/notes/tag/phone/email/link 를 OR 부분일치. */
  q?: string;
  /** 태그 필터 (정규화 키로 비교). */
  tag?: string;
  /** UUID | "none"(전체 공유만) | 미지정(전부). */
  store_id?: string;
  /** 공개 범위로 좁히기 — "전 조직 공유로 잘못 열린 건 없나"를 눈으로 확인하는 용도. */
  visibility?: ContactVisibility;
  /** 내가 별을 단 것만 (D4). 꺼져 있어도 즐겨찾기는 목록 맨 위로 온다. */
  favorites_only?: boolean;
  sort?: ContactSort;
  page?: number;
  per_page?: number;
}

/** store 필터에서 "전체 공유만" 을 뜻하는 리터럴. */
export const CONTACT_STORE_SHARED = "none";

// ─── 변경 신청 (D4) ──────────────────────────────────────────────────────────

export type ContactRequestType = "create" | "update" | "delete";

export type ContactRequestStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "cancelled"
  | "superseded";

/** 신청 payload — 생성/수정 신청 모두 "전체 치환 형태"의 연락처 내용. */
export interface ContactRequestPayload {
  name: string;
  company?: string | null;
  summary?: string | null;
  notes?: string | null;
  visibility?: ContactVisibility;
  targets?: ContactTargetInput[];
  excluded_user_ids?: string[];
  phones?: ContactPhoneInput[];
  emails?: ContactEmailInput[];
  links?: ContactLinkInput[];
  tags?: string[];
}

/** 신청 생성 요청. */
export interface ContactRequestCreate {
  request_type: ContactRequestType;
  /** create 신청이면 null, update/delete 신청이면 필수. */
  contact_id?: string | null;
  /** create/update 신청이면 필수, delete 신청이면 null. */
  payload?: ContactRequestPayload | null;
  /** update/delete 신청은 필수, create 신청은 선택. */
  reason?: string | null;
}

/** 신청 (응답). */
export interface ContactChangeRequest {
  id: string;
  request_type: ContactRequestType;
  status: ContactRequestStatus;
  contact_id: string | null;
  /** 신청 시점 이름 스냅샷 — 대상이 지워져도 남는다. */
  contact_name: string | null;
  payload: ContactRequestPayload | null;
  reason: string | null;
  requested_by: string;
  requested_by_name: string | null;
  requested_at: string;
  resolved_by: string | null;
  resolved_by_name: string | null;
  resolved_at: string | null;
  /** 승인 메모 또는 반려 사유. */
  resolution_note: string | null;
  base_updated_at: string | null;
  /** 신청 이후 원본이 변경됨 (차단 아님 — 경고만, N5). */
  is_stale: boolean;
  /** 처리 대기 목록/상세에만 채워진다. `mine` 목록에서는 null. */
  current_contact: Contact | null;
}

/** 처리 대기 목록 필터 (승인자용). */
export interface ContactRequestFilters {
  status?: ContactRequestStatus | "all";
  request_type?: ContactRequestType;
  page?: number;
  per_page?: number;
}

/** 승인 요청 본문 — 둘 다 선택. payload 를 주면 "수정 후 반영". */
export interface ContactRequestApprove {
  payload?: ContactRequestPayload;
  note?: string;
}

/** 반려 요청 본문 — 사유 필수. */
export interface ContactRequestReject {
  reason: string;
}

/** 승인 응답. */
export interface ContactRequestApproveResult {
  request: ContactChangeRequest;
  contact: Contact;
}
