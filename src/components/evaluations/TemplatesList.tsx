"use client";

import React from "react";
import { Eye, FileText, Lock } from "lucide-react";
import { useEvalTemplates } from "@/hooks/useEvaluations";
import { Badge, LoadingSpinner } from "@/components/ui";
import type { EvalTemplate } from "@/types";

interface TemplatesListProps {
  onPreview: (template: EvalTemplate) => void;
}

export function TemplatesList({ onPreview }: TemplatesListProps): React.ReactElement {
  const { data: templates, isLoading } = useEvalTemplates();
  const basic = templates?.find((t) => t.is_default) ?? templates?.[0];

  if (isLoading) {
    return (
      <div className="py-16 flex justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  if (!basic) {
    return (
      <div className="max-w-[840px] text-sm text-text-muted">
        No evaluation template found for this organization yet.
      </div>
    );
  }

  return (
    <div className="max-w-[840px]">
      <p className="text-sm text-text-secondary mb-5 max-w-[680px]">
        Templates define what every evaluation asks. The{" "}
        <b className="text-text">Basic</b> template is the root form — it applies to
        every store and role and can only be changed by the Owner.
      </p>

      {/* Basic template card */}
      <div className="bg-card border border-border rounded-xl p-5 sm:p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <div className="w-11 h-11 rounded-xl bg-accent-muted text-accent flex items-center justify-center shrink-0">
            <FileText className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-semibold text-text">{basic.name}</h2>
              {basic.is_default && <Badge variant="accent">Default</Badge>}
            </div>
            <p className="text-xs text-text-muted mt-1">
              {basic.config.criteria.length} criteria · {basic.config.scale.length}-point scale · 2 comment sections
            </p>

            <div className="flex flex-wrap items-center gap-2 mt-3">
              <Badge variant="default">All stores</Badge>
              <Badge variant="default">All roles</Badge>
              <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-text-secondary bg-surface-hover rounded-full px-3 py-1">
                <Lock className="h-3 w-3" />
                Editable by Owner only
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 mt-5 pt-4 border-t border-border">
          <button
            type="button"
            onClick={() => onPreview(basic)}
            className="inline-flex items-center gap-1.5 text-sm font-medium rounded-lg px-4 h-10 bg-accent text-white hover:bg-accent-light transition-colors cursor-pointer"
          >
            <Eye className="h-4 w-4" />
            Preview form
          </button>
        </div>
      </div>
    </div>
  );
}
