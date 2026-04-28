/**
 * Public signup flow types.
 * Used by /join/[code] route group.
 */

export type SignupStep = "welcome" | "account" | "email" | "complete";

export interface SignupStore {
  id: string;
  name: string;
  address: string | null;
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

export interface AccountFormState {
  fullName: string;
  username: string;
  password: string;
  confirmPassword: string;
  email: string;
  showPassword: boolean;
  showConfirmPassword: boolean;
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
