"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { useSignupLocale, type SupportedLocale } from "./SignupI18nProvider";

const FLAG: Record<SupportedLocale, string> = {
  en: "🇺🇸",
  es: "🇪🇸",
};

/**
 * 동그란 국기 아바타 + 클릭 시 드롭다운으로 언어 선택.
 * Position: top-right corner of the signup shell.
 */
export function LanguageSwitcher() {
  const t = useTranslations("signup.languageSwitcher");
  const { locale, setLocale } = useSignupLocale();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const options: { code: SupportedLocale; long: string }[] = [
    { code: "en", long: t("english") },
    { code: "es", long: t("spanish") },
  ];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={t("label")}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-lg shadow-sm transition hover:bg-slate-50"
      >
        {FLAG[locale]}
      </button>
      {open && (
        <div
          role="listbox"
          aria-label={t("label")}
          className="absolute right-0 top-11 z-50 min-w-[150px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg"
        >
          {options.map((opt) => {
            const active = locale === opt.code;
            return (
              <button
                key={opt.code}
                type="button"
                role="option"
                aria-selected={active}
                onClick={() => {
                  setLocale(opt.code);
                  setOpen(false);
                }}
                className={[
                  "flex w-full items-center gap-3 px-3 py-2.5 text-sm transition-colors",
                  active
                    ? "bg-blue-50 font-semibold text-blue-700"
                    : "text-slate-700 hover:bg-slate-50",
                ].join(" ")}
              >
                <span className="text-lg">{FLAG[opt.code]}</span>
                <span className="flex-1 text-left">{opt.long}</span>
                {active && (
                  <span className="text-blue-600" aria-hidden>
                    ✓
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
