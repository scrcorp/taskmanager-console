/**
 * 준비중 페이지 — public host (hermesops.site / stg.hermesops.site)에서
 * /join 외 모든 경로의 응답으로 사용된다.
 *
 * middleware가 비-join path를 rewrite해 이 컴포넌트를 보여준다.
 * URL은 사용자가 친 그대로 유지된다 (rewrite, redirect 아님).
 */
export default function ComingSoonPage() {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-white px-6 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(2rem,env(safe-area-inset-top))] text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
        <svg
          className="h-8 w-8"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      </div>
      <h1 className="mt-5 text-[24px] font-semibold tracking-tight text-slate-900">
        Coming soon
      </h1>
      <p className="mt-2 max-w-[320px] text-[14px] leading-relaxed text-slate-500">
        We&apos;re still putting things together here. If you&apos;re a new
        hire looking for the signup link, ask your manager for the QR code or
        the direct URL.
      </p>
      <p className="mt-6 text-[11px] uppercase tracking-[0.18em] text-slate-400">
        hermesops · TaskManager
      </p>
    </div>
  );
}
