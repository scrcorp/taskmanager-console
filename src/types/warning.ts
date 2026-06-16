/**
 * Staff Warning (v1) types — mirror of the server `warnings` schemas.
 *
 * Console-only register + view. Categories are the 12 reasons from the real
 * paper form (multi-select). Level/severity is intentionally not modeled yet.
 */

export type WarningStatus = "active" | "withdrawn";

// How a warning is signed off:
//   - "digital": captured vector strokes in-app/console (warning_signatures)
//   - "wet": printed → physically signed on paper → scanned PDF uploaded
export type WarningSignatureMethod = "digital" | "wet";

// ── Signatures ─────────────────────────────────────────────
// A signature is captured as VECTOR strokes (arrays of [x,y] points), not an
// image — identical to the staff app so app + console render the same ink.
// `strokes` are normalized; `aspect` (= width/height of the capture pad) lets
// the renderer build a consistent viewBox. Mirrors the server contract.
export type SignatureStrokes = {
  strokes: number[][][]; // [[[x,y]..]..]
  aspect: number | null;
};

// How the manager applied the signature: freshly "drawn" or their "saved" one.
export type SignatureMethod = "drawn" | "saved";

// Per-side signature info (employee or manager) returned by the server.
export interface SigInfo {
  signer_user_id: string;
  signer_name: string;
  signed_at: string; // ISO datetime
  method: SignatureMethod;
  signature_strokes: SignatureStrokes;
}

// Both sign-off slots on a warning. `null` until that party signs.
export interface WarningSignatures {
  employee: SigInfo | null;
  manager: SigInfo | null;
}

// POST /console/warnings/{id}/sign body — the manager applies their signature.
export interface WarningSignRequest {
  strokes: number[][][];
  aspect: number | null;
  method: SignatureMethod;
  save_as_default: boolean;
}

// GET/PUT /console/warnings/my-signature — the manager's reusable signature.
export interface MySignatureResponse {
  signature: SignatureStrokes | null;
}

// v1.1: categories are org-managed (DB). Code is a free slug now, not a fixed union.
export type WarningCategory = string;

// org별 사유 카테고리 (warning_categories) — 관리 + 폼 picker.
export interface WarningCategoryItem {
  id: string;
  code: string;
  label: string;
  sort_order: number;
  is_hidden: boolean;
  is_system: boolean; // 'other' — 숨김/삭제 불가, 항상 맨 끝
}

export interface WarningCategoryCreate {
  label: string;
}

export interface WarningCategoryUpdate {
  label?: string;
  is_hidden?: boolean;
}

export interface Warning {
  id: string;
  ref_no: string; // "W-00046"
  status: WarningStatus;
  subject_user_id: string | null;
  subject_name: string | null;
  employee_no: string | null;
  issued_by_id: string | null;
  issued_by_name: string | null;
  store_id: string | null;
  store_name: string | null;
  title: string;
  categories: WarningCategory[];
  category_labels: Record<string, string>; // code→label (live, includes removed legacy)
  details: string | null;
  corrective_action: string | null;
  other_text: string | null; // 'other' free-text
  deadline: string | null; // YYYY-MM-DD
  follow_up_date: string | null; // YYYY-MM-DD
  follow_up_time: string | null; // HH:MM:SS, null = TBD
  warning_date: string; // YYYY-MM-DD
  ordinal: number | null; // 1=First, 2=Second, ≥3=Other (detail only)
  withdrawn_at: string | null;
  // Employee acknowledge is AUTOMATIC: opening the warning in the staff app sets
  // this ("Read" = acknowledged). The explicit employee sign sits in signatures.
  acknowledged_at: string | null; // ISO datetime
  // Vector sign-off slots — employee (set in the app) + manager (set here).
  signatures: WarningSignatures;
  // ── Wet-sign (physical paper) fields ──
  // The signature method for this warning (digital default | wet).
  signature_method: WarningSignatureMethod;
  // Store code (stores.code) — used to build the download filename.
  store_code: string | null;
  // True once a wet-signed scan has been uploaded.
  signed_pdf_present: boolean;
  // The date the document was physically signed (YYYY-MM-DD). Filename date source.
  wet_signed_on: string | null;
  // When the scan was uploaded (ISO datetime).
  wet_uploaded_at: string | null;
  // Derived sign-off status — consume THESE for sign-off display, not the
  // signatures map (they fold in the wet path: a wet PDF satisfies both sides).
  employee_signed: boolean;
  manager_signed: boolean;
  created_at: string;
  updated_at: string;
}

export interface WarningCreate {
  subject_user_id: string;
  store_id: string;
  title: string;
  categories: WarningCategory[];
  details?: string | null;
  corrective_action?: string | null;
  other_text?: string | null;
  deadline?: string | null;
  follow_up_date?: string | null;
  follow_up_time?: string | null;
  issued_by_id?: string | null; // Owner only — issue on behalf of another manager
  warning_date: string;
  signature_method?: WarningSignatureMethod; // defaults to "digital" server-side
}

export interface WarningUpdate {
  store_id?: string;
  title?: string;
  categories?: WarningCategory[];
  details?: string | null;
  corrective_action?: string | null;
  other_text?: string | null;
  deadline?: string | null;
  follow_up_date?: string | null;
  follow_up_time?: string | null;
  issued_by_id?: string | null;
  status?: WarningStatus;
  warning_date?: string;
}

export interface WarningFilters {
  store_id?: string;
  status?: string;
  category?: string;
  subject_user_id?: string;
  page?: number;
  per_page?: number;
}

export interface WarnableUserStore {
  id: string;
  name: string;
}

export interface WarnableUser {
  id: string;
  full_name: string;
  employee_no: string | null;
  role_name: string;
  role_priority: number;
  store_id: string | null; // primary store (prefill)
  store_name: string | null;
  stores: WarnableUserStore[]; // all stores the candidate works at
}

export interface WarnableUsersPage {
  items: WarnableUser[];
  total: number;
  page: number;
  limit: number;
  has_more: boolean;
}

export interface WarningCount {
  user_id: string;
  total: number;
  active: number;
}
