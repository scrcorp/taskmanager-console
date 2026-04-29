import type { SignupContext } from "@/types/signup";

interface Props {
  ctx: SignupContext;
  onContinue: () => void;
}

const FALLBACK_HERO_BG = "bg-gradient-to-br from-slate-700 via-slate-800 to-slate-900";

export function WelcomeScreen({ ctx, onContinue }: Props) {
  const photos = ctx.store.cover_photos;
  const primaryPhoto = photos.find((p) => p.is_primary) ?? photos[0];
  const primary = primaryPhoto?.url;
  const galleryPhotos = primary
    ? photos.filter((p) => p.url !== primary)
    : [];

  return (
    <div className="flex min-h-[100dvh] flex-col bg-white">
      <div className={`relative h-[300px] w-full flex-shrink-0 overflow-hidden ${primary ? "" : FALLBACK_HERO_BG}`}>
        {primary && (
          <img
            src={primary}
            alt={ctx.store.name}
            className="h-full w-full object-cover"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/40 to-slate-900/30" />
        <div className="absolute left-5 right-5 top-12">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
            New hire signup
          </span>
        </div>
        <div className="absolute bottom-5 left-5 right-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/85">
            {ctx.organization.name}
          </p>
          <h1 className="mt-1 text-[26px] font-semibold leading-tight tracking-tight text-white">
            {ctx.store.name}
          </h1>
          {ctx.store.address && (
            <div className="mt-2 flex items-center gap-1.5 text-[12px] text-white/80">
              <svg
                className="h-3.5 w-3.5"
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

      <div className="flex flex-1 flex-col px-5 pt-5">
        <h2 className="text-[22px] font-semibold leading-tight tracking-tight text-slate-900">
          Welcome aboard
        </h2>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-slate-500">
          Set up your account to clock in, view shifts, and complete daily
          tasks.
        </p>

        {galleryPhotos.length > 0 && (
          <div className="mt-5">
            <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-slate-400">
              More from this store
            </p>
            <div className="-mx-5 overflow-x-auto px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <div className="flex gap-2">
                {galleryPhotos.map((photo) => (
                  <div
                    key={photo.url}
                    className="aspect-[4/3] h-24 flex-shrink-0 overflow-hidden rounded-xl bg-slate-100 ring-1 ring-slate-200"
                  >
                    <img
                      src={photo.url}
                      alt=""
                      className="h-full w-full object-cover"
                      loading="lazy"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="mt-5">
          <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-slate-400">
            What's next · ~2 min
          </p>
          <ol className="space-y-1.5">
            {[
              { label: "Account setup", sub: "Name, email, password" },
              { label: "Email verification", sub: "6-digit code" },
              { label: "Open the app", sub: "Start your first shift" },
            ].map((item, idx) => (
              <li
                key={item.label}
                className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white px-3 py-2"
              >
                <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-blue-50 text-[12px] font-semibold text-blue-600">
                  {idx + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[12.5px] font-medium leading-snug text-slate-900">
                    {item.label}
                  </p>
                  <p className="text-[11px] leading-snug text-slate-500">
                    {item.sub}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>

      <div className="border-t border-slate-100 bg-white px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
        <button
          type="button"
          onClick={onContinue}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3.5 text-[14px] font-semibold text-white shadow-sm shadow-blue-500/20 transition-colors hover:bg-blue-700 active:bg-blue-800"
        >
          Continue with sign up
          <svg
            className="h-4 w-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="5" y1="12" x2="19" y2="12" />
            <polyline points="12 5 19 12 12 19" />
          </svg>
        </button>
        <p className="mt-2.5 text-center text-[10.5px] leading-relaxed text-slate-400">
          By continuing, you agree to our{" "}
          <span className="text-slate-600 underline-offset-2 hover:underline">
            Terms
          </span>{" "}
          and{" "}
          <span className="text-slate-600 underline-offset-2 hover:underline">
            Privacy Policy
          </span>
          .
        </p>
      </div>
    </div>
  );
}
