/**
 * Warning reason categories — the 12 from the real paper form (warning_sample.pdf).
 * `label` = full form wording; `short` = abbreviated for tight table cells.
 * Code-fixed in v1 (admin-configurable later). UI labels are English (console).
 */
import type { WarningCategory } from "@/types";

export const CATEGORY_META: Record<
  WarningCategory,
  { label: string; short: string; color: string }
> = {
  tardiness: { label: "Tardiness", short: "Tardiness", color: "#F0A500" },
  damaged_equipment: { label: "Damaged equipment", short: "Damaged equip.", color: "#E8590C" },
  refusal_overtime: { label: "Refusal to work overtime", short: "Refused OT", color: "#D6336C" },
  absenteeism: { label: "Absenteeism", short: "Absenteeism", color: "#FF6B6B" },
  policy_violation: { label: "Policy violation", short: "Policy", color: "#6C5CE7" },
  insubordination: { label: "Insubordination", short: "Insubordination", color: "#7C6DF0" },
  rudeness: { label: "Rudeness", short: "Rudeness", color: "#DB2777" },
  fighting: { label: "Fighting", short: "Fighting", color: "#C92A2A" },
  language: { label: "Language", short: "Language", color: "#22B8CF" },
  failure_procedure: { label: "Failure to follow procedure", short: "Procedure", color: "#4DABF7" },
  failure_performance: { label: "Failure to meet performance standards", short: "Performance", color: "#00B894" },
  other: { label: "Other", short: "Other", color: "#8B8DA3" },
};

/** Form column order (mirrors the paper form, top-to-bottom). */
export const CATEGORY_ORDER: WarningCategory[] = [
  "tardiness",
  "damaged_equipment",
  "refusal_overtime",
  "absenteeism",
  "policy_violation",
  "insubordination",
  "rudeness",
  "fighting",
  "language",
  "failure_procedure",
  "failure_performance",
  "other",
];

/** Options for filter dropdowns (full label). */
export const CATEGORY_OPTIONS = CATEGORY_ORDER.map((value) => ({
  value,
  label: CATEGORY_META[value].label,
}));

export function categoryLabel(code: WarningCategory): string {
  return CATEGORY_META[code]?.label ?? code;
}
