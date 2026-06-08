/**
 * Evaluation domain types (v1).
 *
 * Mirrors the server contract at `/api/v1/console/evaluations` exactly —
 * snake_case on the wire, no camelCase aliasing.
 *
 * Data model:
 *  - A single org-wide "Basic Performance Evaluation" template (9 fixed criteria,
 *    1–5 scale). v1 has no template builder (read-only); v2 adds editing.
 *  - An Evaluation captures evaluatee + store + position + period + per-criterion
 *    scores (1–5) + two free-text comment blocks. The template `config` is
 *    deep-copied into `template_snapshot` at write time so historical evals are
 *    immune to later template edits.
 *
 * Direction rule (enforced server-side): an evaluator may only evaluate users of
 * strictly lower authority (higher role priority number). Self / equal blocked.
 */

// ─── Template config (shared by template.config and eval.template_snapshot) ───

/** A single scored criterion within a template config. Response-only. */
export interface CriterionConfig {
  code: string;
  label: string;
  description: string;
  max_score: number;
  sort_order: number;
}

/** A point on the 1–5 rating scale. */
export interface ScalePoint {
  value: number;
  label: string;
}

/** The criteria + scale an evaluation is (or was) scored against. */
export interface TemplateConfig {
  criteria: CriterionConfig[];
  scale: ScalePoint[];
}

// ─── Template ─────────────────────────────────────────────────────────────

/** Evaluation template (v1: exactly one org-wide Basic, read-only). */
export interface EvalTemplate {
  id: string;
  name: string;
  is_default: boolean;
  /** 'published' in v1. */
  status: string;
  version: number;
  config: TemplateConfig;
  created_at: string;
  updated_at: string;
}

// ─── Evaluation ───────────────────────────────────────────────────────────

export type EvaluationStatus = "draft" | "submitted";

/** Per-criterion scores: { criterionCode: 1..5 }. */
export type EvaluationScores = Record<string, number>;

/** Full evaluation record (GET / and GET /{id}). */
export interface Evaluation {
  id: string;
  status: EvaluationStatus;
  evaluatee_id: string | null;
  /** users.full_name resolved at read. */
  evaluatee_name: string | null;
  /** users.employee_no — null → UI shows "—". */
  employee_no: string | null;
  evaluator_id: string | null;
  evaluator_name: string | null;
  store_id: string | null;
  store_name: string | null;
  position_id: string | null;
  /** Live position name (may differ from job_title snapshot). */
  position_name: string | null;
  /** Snapshot of the position name at write time. */
  job_title: string | null;
  /** YYYY-MM-DD. null on a partial draft (period not set yet). */
  period_start: string | null;
  /** YYYY-MM-DD. null on a partial draft (period not set yet). */
  period_end: string | null;
  template_id: string | null;
  /** The 9 criteria + scale this eval was scored against (frozen at write). */
  template_snapshot: TemplateConfig;
  responses: EvaluationScores;
  /**
   * Mean of rated responses, rounded to 1 decimal. null when zero responses.
   * Always computed (both draft and submitted).
   */
  average: number | null;
  improvement: string | null;
  good_examples: string | null;
  created_at: string;
  updated_at: string;
  submitted_at: string | null;
}

/**
 * POST body.
 *
 * Only `evaluatee_id` is always required: a partial draft may omit store /
 * period (the server relaxes draft validation). Submitting requires store +
 * a valid period + all criteria rated (enforced server-side via the submit-gate).
 */
export interface EvaluationCreate {
  evaluatee_id: string;
  store_id?: string;
  position_id?: string | null;
  period_start?: string; // YYYY-MM-DD
  period_end?: string; // YYYY-MM-DD
  responses?: EvaluationScores;
  improvement?: string | null;
  good_examples?: string | null;
  /** 'submitted' triggers the submit-gate (all 9 criteria rated). */
  status?: EvaluationStatus;
}

/** PUT body — all fields optional (partial update). */
export interface EvaluationUpdate {
  evaluatee_id?: string;
  store_id?: string;
  position_id?: string | null;
  period_start?: string; // YYYY-MM-DD
  period_end?: string; // YYYY-MM-DD
  responses?: EvaluationScores;
  improvement?: string | null;
  good_examples?: string | null;
  status?: EvaluationStatus;
}

/** GET / list filters. */
export interface EvaluationFilters {
  store_id?: string;
  status?: EvaluationStatus;
  evaluatee_id?: string;
  page?: number;
  per_page?: number;
}

// ─── Evaluatable users (employee picker) ──────────────────────────────────

/**
 * A candidate the current user may evaluate (strictly-lower priority, active).
 * store/position fields = the candidate's primary store (earliest user_stores
 * row) for form prefill; position_* may be null (no position on user_stores).
 */
export interface EvaluatableUser {
  id: string;
  full_name: string;
  employee_no: string | null;
  role_name: string;
  role_priority: number;
  store_id: string | null;
  store_name: string | null;
  position_id: string | null;
  position_name: string | null;
  /** All stores this user belongs to (org-scoped) — drives the Store dropdown. */
  stores: { id: string; name: string }[];
}

/** One page of the paginated evaluatable-users endpoint. */
export interface EvaluatableUsersPage {
  items: EvaluatableUser[];
  total: number;
  page: number;
  limit: number;
  has_more: boolean;
}
