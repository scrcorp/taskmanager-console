import type { StepDef } from "@/types/signup";

export const SIGNUP_STEPS: StepDef[] = [
  { key: "welcome", label: "Welcome", number: 1 },
  { key: "account", label: "Account", number: 2 },
  { key: "email", label: "Verify", number: 3 },
  { key: "complete", label: "Done", number: 4 },
];
