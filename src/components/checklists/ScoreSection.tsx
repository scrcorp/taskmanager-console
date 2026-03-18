"use client";

/**
 * 점수 섹션 컴포넌트 -- 0-100 점수 입력, 메모, 저장 및 리포트 전송 버튼.
 *
 * Score input (0-100), score_note textarea, save + send report buttons.
 */

import React, { useState, useEffect } from "react";
import { AlertTriangle, Send } from "lucide-react";
import { Card, Button } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { useUpdateScore, useSendReport } from "@/hooks/useChecklistInstances";
import { parseApiError } from "@/lib/utils";
import type { ChecklistInstance } from "@/types";

interface ScoreSectionProps {
  instance: ChecklistInstance;
}

export function ScoreSection({ instance }: ScoreSectionProps): React.ReactElement {
  const { toast } = useToast();
  const updateScore = useUpdateScore();
  const sendReport = useSendReport();

  const [scoreInput, setScoreInput] = useState<string>(
    instance.score != null ? String(instance.score) : "",
  );
  const [noteInput, setNoteInput] = useState<string>(instance.score_note ?? "");

  // Sync when instance updates from refetch
  useEffect(() => {
    setScoreInput(instance.score != null ? String(instance.score) : "");
    setNoteInput(instance.score_note ?? "");
  }, [instance.score, instance.score_note]);

  const parsedScore = scoreInput === "" ? null : Number(scoreInput);
  const isValidScore = parsedScore === null || (parsedScore >= 0 && parsedScore <= 100 && Number.isInteger(parsedScore));

  const handleSaveScore = async () => {
    if (!isValidScore) {
      toast({ type: "error", message: "Score must be between 0 and 100." });
      return;
    }
    try {
      await updateScore.mutateAsync({
        instanceId: instance.id,
        score: parsedScore,
        score_note: noteInput || undefined,
      });
      toast({ type: "success", message: "Score saved." });
    } catch (err) {
      toast({ type: "error", message: parseApiError(err, "Failed to save score.") });
    }
  };

  const handleSendReport = async () => {
    try {
      await sendReport.mutateAsync({ instanceId: instance.id });
      toast({ type: "success", message: "Report sent." });
    } catch (err) {
      toast({ type: "error", message: parseApiError(err, "Failed to send report.") });
    }
  };

  const isSaving = updateScore.isPending;
  const isSending = sendReport.isPending;

  return (
    <Card className="mt-4">
      <h2 className="text-base font-semibold text-text mb-4">Score &amp; Report</h2>

      {/* Score input */}
      <div className="flex items-center gap-3 mb-3">
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            max={100}
            step={1}
            value={scoreInput}
            onChange={(e) => setScoreInput(e.target.value)}
            placeholder="—"
            className="w-20 px-2 py-1.5 text-center text-lg font-bold bg-surface-hover border border-border rounded-lg text-text focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent"
          />
          <span className="text-sm text-text-muted">/ 100</span>
        </div>
        {!isValidScore && (
          <span className="flex items-center gap-1.5 text-xs text-warning">
            <AlertTriangle size={12} />
            0–100 only
          </span>
        )}
      </div>

      {/* Note textarea */}
      <textarea
        value={noteInput}
        onChange={(e) => setNoteInput(e.target.value)}
        placeholder="Score note (optional)..."
        rows={3}
        className="w-full px-3 py-2 text-sm bg-surface-hover border border-border rounded-lg text-text placeholder:text-text-muted resize-y focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent mb-4"
      />

      {/* Actions */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Button
          variant="secondary"
          size="sm"
          onClick={handleSaveScore}
          isLoading={isSaving}
          disabled={!isValidScore || isSending}
        >
          Save Score
        </Button>
        <Button
          variant="primary"
          size="sm"
          onClick={handleSendReport}
          isLoading={isSending}
          disabled={isSaving}
        >
          <Send size={14} />
          Send Report
        </Button>
      </div>
    </Card>
  );
}
