import type { StepDef } from "@/types/signup";

/**
 * Returns the step list for the StepIndicator inside the SIGN-UP phase only.
 * After /start succeeds the user enters the application phase, which has its
 * own stage timeline (StatusScreen) — not this indicator.
 */
export function getSignupSteps(hasForm: boolean): StepDef[] {
  if (hasForm) {
    return [
      { key: "account", label: "Account", number: 1 },
      { key: "email", label: "Verify", number: 2 },
      { key: "form", label: "Application", number: 3 },
    ];
  }
  return [
    { key: "account", label: "Account", number: 1 },
    { key: "email", label: "Verify", number: 2 },
  ];
}
