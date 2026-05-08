import { useTranslations } from "next-intl";
import type { StepDef } from "@/types/signup";

/**
 * Returns the step list for the StepIndicator inside the SIGN-UP phase only.
 * After /start succeeds the user enters the application phase, which has its
 * own stage timeline (StatusScreen) — not this indicator.
 *
 * i18n: useSignupSteps hook으로 호출해야 useTranslations 동작.
 */
export function useSignupSteps(hasForm: boolean): StepDef[] {
  const t = useTranslations("signup");
  if (hasForm) {
    return [
      { key: "account", label: t("stepAccount"), number: 1 },
      { key: "email", label: t("stepVerify"), number: 2 },
      { key: "form", label: t("stepApplication"), number: 3 },
    ];
  }
  return [
    { key: "account", label: t("stepAccount"), number: 1 },
    { key: "email", label: t("stepVerify"), number: 2 },
  ];
}
