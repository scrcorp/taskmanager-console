"use client";

/**
 * 시급 변경 섹션 — Payroll v1 R4.
 *
 * Staff Detail의 Hourly Rate 카드 내용부. 기존 인라인 rate 수정 대신
 * "Change rate" 다이얼로그(새 시급 + 적용일 + 사유)로 이력 기반 변경을 등록한다.
 *
 * - 미래 예약 변경은 현재 시급 옆 pending 뱃지("$18.00 from Aug 16")로 표시
 * - 접이식 Rate history: old→new, 적용일, 변경자, 사유, Applied/Pending
 * - Cost visibility: 이력/변경 UI는 GM+ 에서만 렌더 (서버 403 게이트와 일치)
 */

import React, { useMemo, useState } from "react";
import { ChevronDown, ChevronRight, History } from "lucide-react";
import { Badge, Modal } from "@/components/ui";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { usePermissions } from "@/hooks/usePermissions";
import {
  useRateChanges,
  useCreateRateChange,
  nextPayPeriodStart,
  type RateChangeEntry,
} from "@/hooks/useRateChanges";

/* -------------------------------------------------------------------------- */
/*  Date helpers                                                              */
/* -------------------------------------------------------------------------- */

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
] as const;

/** "2026-08-16" → "Aug 16" (올해가 아니면 "Aug 16, 2027"). TZ 안전 문자열 파싱 */
function formatShortDate(ymd: string): string {
  const [y, m, d] = ymd.split("-").map((v) => parseInt(v, 10));
  if (!y || !m || !d) return ymd;
  const label = `${MONTH_NAMES[m - 1]} ${d}`;
  return y === new Date().getFullYear() ? label : `${label}, ${y}`;
}

/** 금액 표시 — $ + 2dp */
function formatMoney(value: number): string {
  return `$${value.toFixed(2)}`;
}

/* -------------------------------------------------------------------------- */
/*  Main component                                                            */
/* -------------------------------------------------------------------------- */

interface RateChangeSectionProps {
  userId: string;
  /** 현재 개인 시급 (null = 미설정/상속) */
  currentRate: number | null;
  /** users:update 보유 여부 — 기존 카드의 편집 게이트와 동일 */
  canEdit: boolean;
}

export function RateChangeSection({
  userId,
  currentRate,
  canEdit,
}: RateChangeSectionProps): React.ReactElement {
  const { isGMPlus } = usePermissions();
  // Cost visibility: 서버가 GM 미만에게 403 — GM 미만은 호출/렌더 자체를 막는다
  const historyQuery = useRateChanges(userId, isGMPlus);
  const [isHistoryOpen, setIsHistoryOpen] = useState<boolean>(false);
  const [isDialogOpen, setIsDialogOpen] = useState<boolean>(false);

  const history: RateChangeEntry[] = useMemo(
    () => (Array.isArray(historyQuery.data) ? historyQuery.data : []),
    [historyQuery.data],
  );

  /** 다가오는 pending 변경 — effective_date가 가장 이른 미적용 건 */
  const nextPending: RateChangeEntry | null = useMemo(() => {
    const pending = history.filter((e) => !e.applied);
    if (pending.length === 0) return null;
    return [...pending].sort((a, b) =>
      a.effective_date.localeCompare(b.effective_date),
    )[0];
  }, [history]);

  const displayRate =
    currentRate != null ? `${formatMoney(currentRate)}/hr` : "Not set";

  return (
    <div>
      {/* Current rate + pending badge + change action */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-lg font-bold text-text">{displayRate}</span>
        {nextPending && (
          <Badge variant="warning">
            {formatMoney(nextPending.new_rate)} from{" "}
            {formatShortDate(nextPending.effective_date)}
          </Badge>
        )}
        {canEdit && isGMPlus && (
          <button
            type="button"
            onClick={() => setIsDialogOpen(true)}
            className="text-xs text-accent hover:text-accent-light font-medium transition-colors"
          >
            Change rate
          </button>
        )}
      </div>

      {/* Collapsible rate history — GM+ only (matches server cost gate) */}
      {isGMPlus && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setIsHistoryOpen((v) => !v)}
            className="flex items-center gap-1 text-xs text-text-secondary hover:text-text font-medium transition-colors"
            aria-expanded={isHistoryOpen}
          >
            {isHistoryOpen ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
            <History className="h-3.5 w-3.5" />
            Rate history
            {history.length > 0 && (
              <span className="text-text-muted">({history.length})</span>
            )}
          </button>

          {isHistoryOpen && (
            <div className="mt-2">
              <RateHistoryList
                query={{
                  isLoading: historyQuery.isLoading,
                  isError: historyQuery.isError,
                  refetch: () => void historyQuery.refetch(),
                }}
                entries={history}
              />
            </div>
          )}
        </div>
      )}

      {/* Change rate dialog */}
      {isDialogOpen && (
        <RateChangeDialog
          userId={userId}
          currentRate={currentRate}
          onClose={() => setIsDialogOpen(false)}
        />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  History list                                                              */
/* -------------------------------------------------------------------------- */

interface RateHistoryListProps {
  query: { isLoading: boolean; isError: boolean; refetch: () => void };
  entries: RateChangeEntry[];
}

function RateHistoryList({
  query,
  entries,
}: RateHistoryListProps): React.ReactElement {
  if (query.isLoading) {
    return (
      <div className="flex items-center justify-center py-4">
        <LoadingSpinner size="sm" />
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="text-xs text-text-secondary py-2">
        <p className="text-danger mb-1">
          Couldn&apos;t load rate history. Check your connection and try again.
        </p>
        <button
          type="button"
          onClick={query.refetch}
          className="text-accent hover:text-accent-light font-medium transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <p className="text-xs text-text-muted py-2">
        No rate changes recorded yet.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-border border border-border rounded-lg bg-surface/50">
      {entries.map((entry) => (
        <li key={entry.id} className="px-3 py-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-sm font-semibold text-text tabular-nums">
              {entry.old_rate != null ? (
                <>
                  {formatMoney(entry.old_rate)}
                  <span className="text-text-muted font-normal mx-1">→</span>
                  {formatMoney(entry.new_rate)}
                </>
              ) : (
                formatMoney(entry.new_rate)
              )}
            </span>
            <Badge variant={entry.applied ? "success" : "warning"}>
              {entry.applied ? "Applied" : "Pending"}
            </Badge>
          </div>
          <div className="mt-0.5 text-xs text-text-secondary">
            Effective {formatShortDate(entry.effective_date)}
            {entry.changed_by_name && (
              <span className="text-text-muted">
                {" "}
                · by {entry.changed_by_name}
              </span>
            )}
          </div>
          {entry.reason && (
            <p className="mt-0.5 text-xs text-text-muted italic break-words">
              {entry.reason}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}

/* -------------------------------------------------------------------------- */
/*  Change rate dialog                                                        */
/* -------------------------------------------------------------------------- */

interface RateChangeDialogProps {
  userId: string;
  currentRate: number | null;
  onClose: () => void;
  /** 저장 성공 시 (닫기 직전) — 호출 측 캐시 무효화용. 취소에는 호출 안 됨. */
  onSaved?: () => void;
  /** 다이얼로그 제목 — 대상이 화면 밖 직원일 때 이름을 붙이는 용도. */
  title?: string;
}

/**
 * 시급 변경 다이얼로그. Staff Detail 뿐 아니라 Payroll 마감 게이트에서도
 * 대상 직원을 지정해 그대로 띄운다 (동선 유지 — 페이지 이탈 없이 해결).
 */
export function RateChangeDialog({
  userId,
  currentRate,
  onClose,
  onSaved,
  title,
}: RateChangeDialogProps): React.ReactElement {
  const createRateChange = useCreateRateChange();
  const [rateInput, setRateInput] = useState<string>("");
  const [effectiveDate, setEffectiveDate] = useState<string>(() =>
    nextPayPeriodStart(),
  );
  const [reason, setReason] = useState<string>("");
  const [rateError, setRateError] = useState<string>("");
  const [dateError, setDateError] = useState<string>("");

  const validate = (): { rate: number } | null => {
    let ok = true;
    const num = Number(rateInput.trim());
    if (rateInput.trim() === "" || isNaN(num)) {
      setRateError("Enter the new hourly rate as a number.");
      ok = false;
    } else if (num <= 0) {
      setRateError("Rate must be greater than 0.");
      ok = false;
    } else {
      setRateError("");
    }
    if (!effectiveDate) {
      setDateError("Pick the date the new rate takes effect.");
      ok = false;
    } else {
      setDateError("");
    }
    return ok ? { rate: num } : null;
  };

  const handleSubmit = async (): Promise<void> => {
    const parsed = validate();
    if (!parsed) return;
    try {
      await createRateChange.mutateAsync({
        userId,
        new_rate: parsed.rate,
        effective_date: effectiveDate,
        reason: reason.trim() || undefined,
      });
      onSaved?.();
      onClose();
    } catch {
      // hook 자동 에러 모달 — 다이얼로그는 열어둬서 재시도 가능
    }
  };

  return (
    <Modal
      isOpen={true}
      onClose={onClose}
      title={title ?? "Change Hourly Rate"}
      closeOnBackdrop={false}
    >
      <div className="space-y-4">
        <p className="text-sm text-text-secondary">
          Current rate:{" "}
          <span className="font-semibold text-text">
            {currentRate != null ? `${formatMoney(currentRate)}/hr` : "Not set"}
          </span>
        </p>

        {/* New rate */}
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="rate-change-new-rate"
            className="text-sm font-medium text-text-secondary"
          >
            New rate
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted text-sm select-none">
              $
            </span>
            <input
              id="rate-change-new-rate"
              type="number"
              min="0.01"
              step="0.01"
              placeholder="0.00"
              value={rateInput}
              onChange={(e) => setRateInput(e.target.value)}
              className={`w-full rounded-lg border bg-surface pl-7 pr-3 py-2 text-sm text-text placeholder:text-text-muted transition-colors duration-150 focus:outline-none focus:ring-2 ${
                rateError
                  ? "border-danger focus:ring-danger/50 focus:border-danger"
                  : "border-border focus:ring-accent/50 focus:border-accent"
              }`}
              autoFocus
            />
          </div>
          {rateError && <p className="text-xs text-danger">{rateError}</p>}
        </div>

        {/* Effective date */}
        <div>
          <Input
            label="Effective date"
            type="date"
            value={effectiveDate}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
              setEffectiveDate(e.target.value)
            }
            error={dateError || undefined}
          />
          <p className="mt-1 text-xs text-text-muted">
            Defaults to the next pay period start (1st or 16th). Future dates
            apply automatically on that day.
          </p>
        </div>

        {/* Reason */}
        <Input
          label="Reason (optional)"
          placeholder="e.g. Annual raise, promotion"
          value={reason}
          maxLength={1000}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            setReason(e.target.value)
          }
        />

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={() => void handleSubmit()}
            isLoading={createRateChange.isPending}
          >
            Save Rate Change
          </Button>
        </div>
      </div>
    </Modal>
  );
}
