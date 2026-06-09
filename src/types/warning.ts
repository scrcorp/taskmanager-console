/**
 * Staff Warning (v1) types — mirror of the server `warnings` schemas.
 *
 * Console-only register + view. Categories are the 12 reasons from the real
 * paper form (multi-select). Level/severity is intentionally not modeled yet.
 */

export type WarningStatus = "active" | "withdrawn";

export type WarningCategory =
  | "tardiness"
  | "damaged_equipment"
  | "refusal_overtime"
  | "absenteeism"
  | "policy_violation"
  | "insubordination"
  | "rudeness"
  | "fighting"
  | "language"
  | "failure_procedure"
  | "failure_performance"
  | "other";

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
  details: string | null;
  corrective_action: string | null;
  warning_date: string; // YYYY-MM-DD
  ordinal: number | null; // 1=First, 2=Second, ≥3=Other (detail only)
  withdrawn_at: string | null;
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
  warning_date: string;
}

export interface WarningUpdate {
  store_id?: string;
  title?: string;
  categories?: WarningCategory[];
  details?: string | null;
  corrective_action?: string | null;
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
