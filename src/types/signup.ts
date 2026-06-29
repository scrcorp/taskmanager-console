/**
 * Public signup flow types.
 * Used by /join/[code] route group.
 */

export type SignupStep =
  | "welcome"
  | "account"
  | "email"
  | "form"
  | "status";

export type ApplicationStageClient =
  | "pending_form"
  | "new"
  | "screen"
  | "interview"
  | "review"
  | "hired"
  | "rejected"
  | "withdrawn";

/** 확정된 인터뷰 정보 — 지원자 상태화면에 표시 (store-local 라벨). */
export interface InterviewStatusInfo {
  /** "Mon, Jul 6 · 10:00 AM PDT" */
  at_label: string;
  /** "Mina Park (GM)" — 미배정이면 null */
  interviewer: string | null;
}

export interface SignupStore {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  cover_photos: { url: string; is_primary: boolean }[];
}

export interface SignupOrganization {
  name: string;
  company_code: string;
}

export interface SignupContext {
  store: SignupStore;
  organization: SignupOrganization;
}

export type PreferredLanguage = "en" | "es" | "ko";

export interface AccountFormState {
  fullName: string;
  username: string;
  password: string;
  confirmPassword: string;
  email: string;
  showPassword: boolean;
  showConfirmPassword: boolean;
  preferredLanguage: PreferredLanguage;
}

export interface EmailFormState {
  email: string;
  codeSent: boolean;
  code: string;
  verified: boolean;
}

export interface StepDef {
  key: SignupStep;
  label: string;
  number: number;
}

export type LinkErrorCode = "invalid_link" | "store_not_found" | "signups_paused";
