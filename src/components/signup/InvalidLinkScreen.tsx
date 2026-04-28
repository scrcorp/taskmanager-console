import type { LinkErrorCode } from "@/types/signup";

const COPY: Record<LinkErrorCode, { title: string; body: string }> = {
  invalid_link: {
    title: "This link doesn't look right",
    body: "It might be malformed or outdated. Ask your manager to share a fresh one.",
  },
  store_not_found: {
    title: "Store not found",
    body: "The store this link points to is no longer available. Reach out to your manager.",
  },
  signups_paused: {
    title: "Signups are paused",
    body: "This store isn't accepting new sign-ups right now. Reach out to your manager.",
  },
};

interface Props {
  reason: LinkErrorCode;
}

export function InvalidLinkScreen({ reason }: Props) {
  const { title, body } = COPY[reason];
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-white px-8 pb-10 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-red-50 text-red-500">
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
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>
      <div>
        <h1 className="text-[20px] font-semibold tracking-tight text-slate-900">
          {title}
        </h1>
        <p className="mt-2 text-[14px] leading-relaxed text-slate-500">
          {body}
        </p>
      </div>
      <button
        type="button"
        className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-5 py-2.5 text-[13px] font-medium text-white transition-colors hover:bg-slate-700"
      >
        Contact support
        <svg
          className="h-3.5 w-3.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="5" y1="12" x2="19" y2="12" />
          <polyline points="12 5 19 12 12 19" />
        </svg>
      </button>
    </div>
  );
}
