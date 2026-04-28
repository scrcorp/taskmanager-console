import type { SignupStep, StepDef } from "@/types/signup";

interface Props {
  steps: StepDef[];
  current: SignupStep;
}

/** Compact 4-bar progress indicator with "Step N of M · Label" header. */
export function StepIndicator({ steps, current }: Props) {
  const currentIdx = steps.findIndex((s) => s.key === current);
  const total = steps.length;
  const activeStep = steps[currentIdx];

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-[11px]">
        <span className="font-medium text-slate-700">
          Step {currentIdx + 1} of {total}
        </span>
        <span className="font-medium text-slate-500">{activeStep?.label}</span>
      </div>
      <div className="flex items-center gap-1.5">
        {steps.map((step, idx) => {
          const status =
            idx < currentIdx ? "done" : idx === currentIdx ? "active" : "todo";
          return (
            <div
              key={step.key}
              className={[
                "h-1.5 flex-1 rounded-full transition-all",
                status === "done" && "bg-blue-600",
                status === "active" && "bg-blue-600 ring-2 ring-blue-200",
                status === "todo" && "bg-slate-200",
              ]
                .filter(Boolean)
                .join(" ")}
            />
          );
        })}
      </div>
    </div>
  );
}
