/**
 * Evaluation criteria helpers (console).
 *
 * The 9 criteria + 1–5 scale are NOT hardcoded in the console — they come from
 * the server (template `config` / evaluation `template_snapshot`). These helpers
 * derive score/average/progress from whatever `TemplateConfig` an evaluation was
 * (or is being) scored against, so they stay correct even if v2 adds custom
 * templates.
 *
 * A `BASIC_TEMPLATE_CONFIG` fallback mirrors the server seed verbatim — used only
 * when authoring a brand-new evaluation before any template is loaded.
 */
import type { TemplateConfig, CriterionConfig, EvaluationScores } from "@/types";

/** The Basic seed (mirrors the server `BASIC_CRITERIA` / `BASIC_SCALE`). Fallback only. */
export const BASIC_TEMPLATE_CONFIG: TemplateConfig = {
  criteria: [
    { code: "communication", label: "Communication of Work", description: "Efficient, precise, in-time communication — not repeated", max_score: 5, sort_order: 1 },
    { code: "work_quality", label: "Work Quality", description: "Work performed according to standards & requirements", max_score: 5, sort_order: 2 },
    { code: "efficiency", label: "Efficiency of Work", description: "Amount completed in relation to standards", max_score: 5, sort_order: 3 },
    { code: "dependability", label: "Dependability", description: "Follow-through; complete work on time; punctual", max_score: 5, sort_order: 4 },
    { code: "teamwork", label: "Attitude and Teamwork", description: "Understanding of job functions and responsibilities", max_score: 5, sort_order: 5 },
    { code: "reliability", label: "Reliability", description: "Record of attendance & tardiness for work", max_score: 5, sort_order: 6 },
    { code: "housekeeping", label: "Housekeeping", description: "Cleanliness, organization & order of work area", max_score: 5, sort_order: 7 },
    { code: "personal_care", label: "Personal Care", description: "Grooming, dress, health, personal cleanliness", max_score: 5, sort_order: 8 },
    { code: "judgment", label: "Judgment", description: "Ability to respond to varying situations & make sound decisions", max_score: 5, sort_order: 9 },
  ],
  scale: [
    { value: 1, label: "Poor" },
    { value: 2, label: "Fair" },
    { value: 3, label: "Satisfactory" },
    { value: 4, label: "Good" },
    { value: 5, label: "Excellent" },
  ],
};

/** Criteria sorted by sort_order (defensive — server already sorts). */
export function sortedCriteria(config: TemplateConfig): CriterionConfig[] {
  return [...config.criteria].sort((a, b) => a.sort_order - b.sort_order);
}

/** Label for a given score value within a config's scale. */
export function scoreLabel(config: TemplateConfig, value: number): string {
  return config.scale.find((s) => s.value === value)?.label ?? "";
}

/** Count of criteria that have a numeric score. */
export function completedCount(config: TemplateConfig, scores: EvaluationScores): number {
  return config.criteria.filter((c) => typeof scores[c.code] === "number").length;
}

/**
 * Mean of the rated criteria, rounded to 1 decimal. null when zero responses.
 * Mirrors the server `average` rule (always computed over rated values).
 */
export function averageScore(config: TemplateConfig, scores: EvaluationScores): number | null {
  const vals = config.criteria
    .map((c) => scores[c.code])
    .filter((v): v is number => typeof v === "number");
  if (vals.length === 0) return null;
  return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
}

/** Initials for an avatar bubble (e.g. "Jane Doe" → "JD"). */
export function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}
