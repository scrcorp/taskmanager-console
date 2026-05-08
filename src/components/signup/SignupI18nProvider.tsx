"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { NextIntlClientProvider } from "next-intl";
import enMessages from "../../../messages/en.json";
import esMessages from "../../../messages/es.json";

export type SupportedLocale = "en" | "es";

const STORAGE_KEY = "app_locale";
const DEFAULT_LOCALE: SupportedLocale = "en";

const MESSAGES: Record<SupportedLocale, Record<string, unknown>> = {
  en: enMessages as Record<string, unknown>,
  es: esMessages as Record<string, unknown>,
};

function detectInitialLocale(): SupportedLocale {
  if (typeof window === "undefined") return DEFAULT_LOCALE;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "en" || stored === "es") return stored;
  } catch {
    // ignore storage errors (private mode, etc.)
  }
  const nav = window.navigator?.language?.toLowerCase() ?? "";
  if (nav.startsWith("es")) return "es";
  return DEFAULT_LOCALE;
}

interface LocaleContextValue {
  locale: SupportedLocale;
  setLocale: (next: SupportedLocale) => void;
}

const LocaleContext = createContext<LocaleContextValue | null>(null);

export function useSignupLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) {
    throw new Error("useSignupLocale must be used inside SignupI18nProvider");
  }
  return ctx;
}

interface Props {
  children: React.ReactNode;
}

/**
 * Client-side i18n provider for the signup flow.
 * - Loads messages bundle for "en" and "es" up front (small JSON, no code split needed)
 * - Reads/persists locale to localStorage under "app_locale" (matches staff app convention)
 * - Falls back to browser locale, then "en"
 */
export function SignupI18nProvider({ children }: Props) {
  // Hydration: render with default first, switch to detected locale post-mount.
  // This avoids SSR/CSR mismatch when localStorage differs from default.
  const [locale, setLocaleState] = useState<SupportedLocale>(DEFAULT_LOCALE);

  useEffect(() => {
    setLocaleState(detectInitialLocale());
  }, []);

  const setLocale = useCallback((next: SupportedLocale) => {
    setLocaleState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // ignore
    }
  }, []);

  const value = useMemo(() => ({ locale, setLocale }), [locale, setLocale]);
  const messages = MESSAGES[locale];

  return (
    <LocaleContext.Provider value={value}>
      <NextIntlClientProvider locale={locale} messages={messages}>
        {children}
      </NextIntlClientProvider>
    </LocaleContext.Provider>
  );
}
