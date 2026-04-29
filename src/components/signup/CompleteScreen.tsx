import type { SignupContext } from "@/types/signup";

interface Props {
  ctx: SignupContext;
  fullName: string;
  onRestart: () => void;
}

export function CompleteScreen({ ctx, fullName, onRestart }: Props) {
  const firstName = fullName.split(" ")[0];
  const primary = ctx.store.cover_photos.find((p) => p.is_primary)?.url
    ?? ctx.store.cover_photos[0]?.url;

  return (
    <div className="flex min-h-[100dvh] flex-col bg-white">
      <div className="flex flex-1 flex-col items-center justify-center px-6 pt-2 text-center">
        <div className="relative mb-5">
          <div className="absolute inset-0 animate-ping rounded-full bg-emerald-400/30" />
          <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-500/30">
            <svg
              className="h-10 w-10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
        </div>

        <h1 className="text-[28px] font-semibold leading-tight tracking-tight text-slate-900">
          {firstName ? `Thanks, ${firstName}!` : "Thanks!"}
        </h1>
        <p className="mt-2 max-w-[300px] text-[14px] leading-relaxed text-slate-500">
          Your application to{" "}
          <span className="font-medium text-slate-700">{ctx.store.name}</span>{" "}
          has been submitted. The hiring manager will review it and reach out to
          you. Once approved, you can log into the staff app with your username
          and password.
        </p>

        <div className="mt-7 w-full">
          <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.16em] text-slate-400">
            Your store
          </p>
          <div className="overflow-hidden rounded-2xl ring-1 ring-slate-200">
            <div className="relative h-28 w-full overflow-hidden bg-slate-100">
              {primary && (
                <img
                  src={primary}
                  alt={ctx.store.name}
                  className="h-full w-full object-cover"
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-slate-900/75 via-slate-900/20 to-slate-900/10" />
              <div className="absolute bottom-3 left-4 right-4 text-left">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/85">
                  {ctx.organization.name}
                </p>
                <p className="text-[15px] font-semibold leading-tight text-white">
                  {ctx.store.name}
                </p>
              </div>
            </div>
            {ctx.store.address && (
              <div className="flex items-center gap-2 border-t border-slate-100 px-4 py-2.5 text-[11.5px] text-slate-500">
                <svg
                  className="h-3.5 w-3.5 flex-shrink-0"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                  <circle cx="12" cy="10" r="3" />
                </svg>
                <span className="truncate">{ctx.store.address}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="border-t border-slate-100 bg-white px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">
        <button
          type="button"
          onClick={onRestart}
          className="w-full rounded-xl bg-blue-600 px-5 py-3.5 text-[14px] font-semibold text-white shadow-sm shadow-blue-500/20 transition-colors hover:bg-blue-700 active:bg-blue-800"
        >
          Done
        </button>
      </div>
    </div>
  );
}
