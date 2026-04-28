import type { ReactNode } from "react";
import { Phase2Banner } from "./Phase2Banner";

interface Props {
  title: string;
  body: string;
  children?: ReactNode;
}

/** Phase 2 sub-tab의 공통 placeholder 컨테이너. */
export function Phase2Placeholder({ title, body, children }: Props) {
  return (
    <div className="space-y-5">
      <Phase2Banner title={title} body={body} />
      {children ?? (
        <div className="rounded-2xl border border-dashed border-[#E2E4EA] bg-white p-12 text-center">
          <p className="text-[13px] font-medium text-[#1A1D27]">
            Coming soon
          </p>
          <p className="mt-1 text-[11.5px] text-[#94A3B8]">
            This section will ship with the next release.
          </p>
        </div>
      )}
    </div>
  );
}
