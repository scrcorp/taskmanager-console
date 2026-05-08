import { SignupI18nProvider } from "@/components/signup/SignupI18nProvider";

/**
 * Public route group layout — 인증 불필요, 헤더/사이드바 없음.
 *
 * Public routes (currently /join/[code], /direct/[code]) live outside the
 * (dashboard) auth boundary. The signup flow itself is mobile-first; on desktop
 * we frame it to a phone-like column so the layout doesn't stretch awkwardly.
 *
 * i18n: signup flow은 EN/ES 지원. Provider는 localStorage("app_locale")에서
 * 로케일을 읽어오고, 없으면 브라우저 로케일 → en fallback.
 */
export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SignupI18nProvider>
      <div className="min-h-[100dvh] bg-slate-100 text-slate-900">
        <div className="mx-auto min-h-[100dvh] w-full max-w-[480px] bg-white shadow-sm md:my-6 md:min-h-[calc(100dvh-3rem)] md:rounded-3xl md:shadow-lg">
          {children}
        </div>
      </div>
    </SignupI18nProvider>
  );
}
