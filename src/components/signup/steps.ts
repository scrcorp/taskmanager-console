import type { StepDef } from "@/types/signup";

/**
 * Static step list for the StepIndicator. Includes the optional "form" step
 * — it is hidden by the SignupFlow when the store has no questions/attachments
 * configured (it just goes account → email → complete).
 */
export const SIGNUP_STEPS: StepDef[] = [
  { key: "welcome", label: "Welcome", number: 1 },
  { key: "account", label: "Account", number: 2 },
  { key: "form", label: "Form", number: 3 },
  { key: "email", label: "Verify", number: 4 },
  { key: "complete", label: "Done", number: 5 },
];
