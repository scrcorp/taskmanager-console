/**
 * Tip 관련 TypeScript 타입.
 *
 * 서버 schemas/tip.py 와 동기화. snake_case JSON 그대로.
 */

export type TipDistributionStatus = "pending" | "accepted" | "auto_accepted";

export interface TipDistribution {
  id: string;
  entry_id: string;
  receiver_id: string | null;
  receiver_name: string | null;
  amount: string; // Decimal → string
  reason: string | null;
  status: TipDistributionStatus;
  pending_until: string;
  accepted_at: string | null;
  created_at: string;
}

export interface TipEntry {
  id: string;
  schedule_id: string | null;
  store_id: string;
  store_name: string | null;
  employee_id: string;
  work_role_id: string | null;
  work_role_name: string | null;
  date: string; // YYYY-MM-DD
  card_tips: string;
  cash_tips_kept: string;
  source: "attendance" | "staff_app" | "manager";
  last_modified_by_id: string | null;
  last_modified_at: string | null;
  created_at: string;
  updated_at: string;
  distributions: TipDistribution[];
  distributed_total: string;
  reportable_card: string;
  reported_on_4070: string;
}

export interface StoreDistribution {
  id: string;
  entry_id: string;
  sender_id: string;
  sender_name: string;
  receiver_id: string | null;
  receiver_name: string | null;
  work_role_name: string | null;
  work_date: string;
  amount: string;
  reason: string | null;
  status: TipDistributionStatus;
  pending_until: string;
  accepted_at: string | null;
  created_at: string;
}

export interface TipEntryDistributionInput {
  receiver_id: string;
  amount: string;
  reason?: string | null;
}

export interface ManagerTipEntryCreate {
  employee_id: string;
  /** schedule 기반이면 schedule_id, freeform 이면 null. */
  schedule_id: string | null;
  /** schedule_id 가 null 일 때만 사용. */
  store_id: string | null;
  /** schedule_id 가 null 일 때 사용. */
  work_role_id?: string | null;
  /** schedule_id 가 null 일 때 사용 (YYYY-MM-DD). */
  date: string | null;
  card_tips: string;
  cash_tips_kept: string;
  comment: string;
  distributions: TipEntryDistributionInput[];
}

export interface ManagerTipEntryUpdate {
  card_tips?: string;
  cash_tips_kept?: string;
  comment: string;
  distributions?: TipEntryDistributionInput[];
}
