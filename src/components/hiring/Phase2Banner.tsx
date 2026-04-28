interface Props {
  title: string;
  body: string;
}

export function Phase2Banner({ title, body }: Props) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-dashed border-[rgba(240,165,0,0.4)] bg-[rgba(240,165,0,0.06)] p-4">
      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-[rgba(240,165,0,0.15)] text-[#C28100]">
        <svg
          className="h-4 w-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
        </svg>
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h3 className="text-[13px] font-semibold text-[#1A1D27]">{title}</h3>
          <span className="rounded-full bg-[rgba(240,165,0,0.15)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#C28100]">
            Phase 2 preview
          </span>
        </div>
        <p className="mt-1 text-[12px] leading-relaxed text-[#64748B]">
          {body}
        </p>
      </div>
    </div>
  );
}
