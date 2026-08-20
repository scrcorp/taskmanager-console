"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { DateField } from "@/components/ui/DateField";
import { useCreateRateChange } from "@/hooks/useRateChanges";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** 대상 직원 — payroll 행의 스냅샷 */
  userId: string;
  name: string;
  /** 현재 rate 표시 라벨 ("$16.00 · $17.50" 또는 null=미설정) — 안내용 */
  currentRateLabel: string | null;
  /** 기본 effective date = pay period 시작일 (기간 내 근무일 전체 소급 커버) */
  periodStart: string;
}

/**
 * Payroll 화면 인라인 시급 등록/수정 모달.
 *
 * 기존 rate-changes 경로(POST /console/users/{id}/rate-changes)를 그대로
 * 사용한다 — 이력 + org_members dual-write + 스케줄 갱신은 서버 단일 경로가
 * 책임진다. 저장 후 payroll 쿼리를 무효화해 preview 가 즉시 재계산되게 한다.
 * 메모(reason)는 이력에 남고 기간 export 의 "Rate Changes" 시트로 추출된다.
 */
export function RateQuickEditModal({
  isOpen,
  onClose,
  userId,
  name,
  currentRateLabel,
  periodStart,
}: Props) {
  const [rate, setRate] = useState("");
  const [effectiveDate, setEffectiveDate] = useState(periodStart);
  const [memo, setMemo] = useState("");
  const createMut = useCreateRateChange();
  const queryClient = useQueryClient();

  // 대상/기간이 바뀌거나 다시 열릴 때 폼 초기화
  useEffect(() => {
    if (isOpen) {
      setRate("");
      setEffectiveDate(periodStart);
      setMemo("");
    }
  }, [isOpen, userId, periodStart]);

  const parsed = Number(rate);
  const rateValid = rate.trim() !== "" && Number.isFinite(parsed) && parsed > 0;
  const canSave = rateValid && effectiveDate !== "" && !createMut.isPending;

  const handleSave = async (): Promise<void> => {
    if (!canSave) return;
    try {
      await createMut.mutateAsync({
        userId,
        new_rate: parsed,
        effective_date: effectiveDate,
        reason: memo.trim() || "Set from payroll",
      });
      // preview 재계산 — No rate 배지/금액이 즉시 갱신된다
      queryClient.invalidateQueries({ queryKey: ["payroll"] });
      onClose();
    } catch {
      // 에러 토스트는 useCreateRateChange 가 표시 — 모달은 열어둔다
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`Set hourly rate — ${name}`}
      size="sm"
      closeOnBackdrop={false}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!canSave}>
            {createMut.isPending ? "Saving..." : "Save"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <p className="text-[12px] text-[#64748B]">
          {currentRateLabel
            ? `Current rate in this period: ${currentRateLabel}`
            : "No hourly rate is set for this employee in this period."}
        </p>
        <div>
          <label className="mb-1 block text-[12px] font-semibold text-[#1A1D27]">
            Hourly rate ($)
          </label>
          <Input
            type="number"
            min="0.01"
            step="0.25"
            value={rate}
            onChange={(e) => setRate(e.target.value)}
            placeholder="e.g. 17.50"
            autoFocus
          />
          {rate.trim() !== "" && !rateValid && (
            <p className="mt-1 text-[11px] text-[#FF6B6B]">
              Enter an amount greater than 0.
            </p>
          )}
        </div>
        <div>
          <label className="mb-1 block text-[12px] font-semibold text-[#1A1D27]">
            Effective date
          </label>
          <DateField
            value={effectiveDate}
            onChange={setEffectiveDate}
            clearable={false}
          />
          <p className="mt-1 text-[11px] text-[#94A3B8]">
            Defaults to the period start so every workday in this period is
            covered. Past dates apply retroactively.
          </p>
        </div>
        <div>
          <label className="mb-1 block text-[12px] font-semibold text-[#1A1D27]">
            Memo
          </label>
          <Input
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="Reason for this change (shown in exports)"
          />
          <p className="mt-1 text-[11px] text-[#94A3B8]">
            Saved to the rate history and listed on the payroll export
            (&quot;Rate Changes&quot; sheet).
          </p>
        </div>
      </div>
    </Modal>
  );
}
