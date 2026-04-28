/**
 * Public route group layout — 인증 불필요, 헤더/사이드바 없음.
 *
 * Public routes (currently /join/[code]) live outside the (dashboard) auth
 * boundary. The signup flow itself is mobile-first; on desktop we frame it
 * to a phone-like column so the layout doesn't stretch awkwardly.
 */
export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-[100dvh] bg-slate-100 text-slate-900">
      <div className="mx-auto min-h-[100dvh] w-full max-w-[480px] bg-white shadow-sm md:my-6 md:min-h-[calc(100dvh-3rem)] md:rounded-3xl md:shadow-lg">
        {children}
      </div>
    </div>
  );
}
