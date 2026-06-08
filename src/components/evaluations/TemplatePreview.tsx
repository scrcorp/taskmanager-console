"use client";

import React from "react";
import { ChevronLeft, FileText } from "lucide-react";
import type { TemplateConfig } from "@/types";
import { Button } from "@/components/ui";
import { EvaluationFormDoc } from "./EvaluationFormDoc";

interface TemplatePreviewProps {
  config: TemplateConfig;
  onBack: () => void;
}

/**
 * Blank, PDF-style preview of the Basic evaluation form — same document the editor
 * and detail render, with no values. Doubles as the reference for the v2 PDF export.
 */
export function TemplatePreview({ config, onBack }: TemplatePreviewProps): React.ReactElement {
  return (
    <div className="max-w-[840px] mx-auto pb-10">
      {/* Always-visible toolbar */}
      <div className="sticky top-0 z-20 mb-4 bg-card border border-border rounded-lg px-3 sm:px-4 py-2.5 flex items-center gap-2 flex-wrap shadow-sm">
        <Button variant="ghost" onClick={onBack} className="gap-1.5">
          <ChevronLeft className="h-4 w-4" />
          Back
        </Button>
        <div className="ml-auto flex items-center gap-2">
          <span className="hidden sm:flex items-center gap-1.5 text-[12.5px] text-text-muted">
            <FileText className="h-3.5 w-3.5" />
            Preview of the printable form
          </span>
        </div>
      </div>

      <div>
        <EvaluationFormDoc mode="blank" config={config} scores={{}} improvement="" goodExamples="" showSignatures />
        <p className="text-center text-xs text-text-muted mt-3">
          This is the form everyone is evaluated against.
        </p>
      </div>
    </div>
  );
}
