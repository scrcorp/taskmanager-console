"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  ExternalLink,
  ShieldAlert,
  Wallet,
} from "lucide-react";
import { Modal } from "@/components/ui";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { RateChangeDialog } from "@/components/users/RateChangeSection";
import { usePermissions } from "@/hooks/usePermissions";
import { useUsers } from "@/hooks/useUsers";
import { PERMISSIONS } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { payrollShortDate } from "@/lib/payrollFormat";
import {
  buildAttendanceOneShotLink,
  extractDates,
  stripDates,
} from "@/lib/payrollGateLinks";
import {
  PAYROLL_GATE,
  type ConfirmGateFailure,
  type PayPeriod,
  type PeriodPreviewResponse,
} from "@/types/payroll";

/** 항목 1건을 어떤 화면에서 고치는지 — 행 단위 액션 종류. */
type GateFix = "attendance_auto" | "attendance_open" | "rate" | "none";

/** 접기 기준 — 이슈가 많아도 카드가 화면을 삼키지 않게. */
const COLLAPSED_ITEMS = 3;

interface GateItemView {
  key: string;
  name: string | null;
  userId: string | null;
  /** YYYY-MM-DD. 근태 딥링크의 날짜 필터. */
  date: string | null;
  /** 날짜를 떼어낸 사유 문구 (날짜는 행에 따로 표시). */
  detail: string;
}

interface GateView {
  gate: string;
  label: string;
  /** 카운트 0 일 때 표시할 통과 문구 */
  okNote: string;
  /** 행 단위 액션이 없는 게이트의 카드 수준 링크 */
  link: { href: string; label: string } | null;
  fix: GateFix;
  items: GateItemView[];
  /** confirm 409 로 확인된 차단 게이트 */
  blocking: boolean;
  /** 게이트 수준 서버 메시지 (409 시) */
  serverMessage?: string;
  /** 보조 상태 문구 (tip period status 등) */
  note?: string;
}

interface GateDef {
  label: string;
  okNote: string;
  codes: string[];
  fix: GateFix;
  link: { href: string; label: string } | null;
}

/**
 * 마감 게이트 4종 — validation code → 카드 행 정의.
 * 근태/시급 게이트는 카드 수준 링크 대신 행마다 인라인 액션을 쓴다 (항목별로
 * payroll 화면 상태를 잃지 않고 해결).
 */
const GATE_DEFS: GateDef[] = [
  {
    label: "Auto clock-outs confirmed",
    okNote: "Every auto clock-out has been reviewed.",
    codes: [PAYROLL_GATE.UNCONFIRMED_AUTO_CLOCKOUT],
    fix: "attendance_auto",
    link: null,
  },
  {
    label: "No open shifts",
    okNote: "All shifts in this period have a clock-out.",
    codes: [PAYROLL_GATE.OPEN_SHIFT],
    fix: "attendance_open",
    link: null,
  },
  {
    label: "Hourly rates valid",
    okNote: "Every worked day has a rate at or above minimum wage.",
    codes: [PAYROLL_GATE.RATE_MISSING, PAYROLL_GATE.BELOW_MINIMUM_WAGE],
    fix: "rate",
    link: null,
  },
  {
    label: "Tip period confirmed",
    okNote: "Card tips come from a confirmed tip period.",
    codes: [PAYROLL_GATE.TIP_PERIOD_NOT_CONFIRMED],
    fix: "none",
    link: { href: "/pay/tips", label: "Confirm in Tips" },
  },
];

/** 409 전용 게이트 (preview validation 에는 없음). */
const EXTRA_GATE_LABELS: Record<string, { label: string; okNote: string }> = {
  [PAYROLL_GATE.MULTI_STORE_WEEK]: {
    label: "Multi-store weeks consistent",
    okNote: "",
  },
};

function tipStatusNote(period: PayPeriod): string {
  if (period.tip_period_status === "confirmed") {
    return "Matching tip period is confirmed.";
  }
  if (period.tip_period_status === null) {
    return "No matching tip period exists yet.";
  }
  return `Matching tip period is still ${period.tip_period_status}.`;
}

interface ItemSource {
  userId: string | null;
  name: string | null;
  dates: string[];
  message: string;
}

/** 한 이슈를 날짜별 행으로 펼친다 — 행 = (직원, 날짜) 라야 개별 해결이 가능. */
function expandItems(
  gate: string,
  source: ItemSource,
  seq: number,
): GateItemView[] {
  const detail = stripDates(source.message) || source.message;
  const base = `${gate}_${source.userId ?? `i${seq}`}`;
  if (source.dates.length === 0) {
    return [
      {
        key: base,
        name: source.name,
        userId: source.userId,
        date: null,
        detail,
      },
    ];
  }
  return source.dates.map((date) => ({
    key: `${base}_${date}`,
    name: source.name,
    userId: source.userId,
    date,
    detail,
  }));
}

/** preview validations + (있으면) confirm 409 실패를 게이트 행 목록으로 병합. */
function buildGates(
  preview: PeriodPreviewResponse,
  failures: ConfirmGateFailure[] | null,
): GateView[] {
  const failureByCode = new Map<string, ConfirmGateFailure>();
  for (const f of failures ?? []) failureByCode.set(f.gate, f);

  const gates: GateView[] = GATE_DEFS.map((def) => {
    // 409 실패가 있으면 그 게이트는 서버 상세가 우선 (dates 포함, 정확한 차단 원천)
    const failure = def.codes
      .map((c) => failureByCode.get(c))
      .find((f) => f !== undefined);

    let items: GateItemView[];
    let blocking = false;
    let serverMessage: string | undefined;

    if (failure) {
      blocking = true;
      serverMessage = failure.message;
      items = failure.items.flatMap((it, i) =>
        expandItems(
          failure.gate,
          {
            userId: it.user_id,
            name: it.member_name,
            dates: it.dates,
            message: it.message,
          },
          i,
        ),
      );
    } else {
      // preview validation 은 구조화 dates 가 없어 메시지 안의 날짜를 뽑아 쓴다.
      items = preview.rows.flatMap((row) =>
        row.validations
          .filter((v) => def.codes.includes(v.code))
          .flatMap((v, i) =>
            expandItems(
              v.code,
              {
                userId: row.user_id,
                name: row.member_name,
                dates: extractDates(v.message),
                message: v.message,
              },
              i,
            ),
          ),
      );
    }

    const view: GateView = {
      gate: def.codes[0],
      label: def.label,
      okNote: def.okNote,
      link: def.link,
      fix: def.fix,
      items,
      blocking,
      serverMessage,
    };
    if (def.codes.includes(PAYROLL_GATE.TIP_PERIOD_NOT_CONFIRMED)) {
      view.note = tipStatusNote(preview.period);
    }
    return view;
  });

  // 4대 게이트에 매핑되지 않은 409 게이트 (multi_store_week 등)도 표시
  const knownCodes = new Set(GATE_DEFS.flatMap((d) => d.codes));
  for (const f of failures ?? []) {
    if (knownCodes.has(f.gate)) continue;
    const meta = EXTRA_GATE_LABELS[f.gate];
    gates.push({
      gate: f.gate,
      label: meta?.label ?? f.gate.replace(/_/g, " "),
      okNote: meta?.okNote ?? "",
      link: null,
      fix: "none",
      blocking: true,
      serverMessage: f.message,
      items: f.items.flatMap((it, i) =>
        expandItems(
          f.gate,
          {
            userId: it.user_id,
            name: it.member_name,
            dates: it.dates,
            message: it.message,
          },
          i,
        ),
      ),
    });
  }

  return gates;
}

interface RateTarget {
  userId: string;
  name: string | null;
}

interface Props {
  preview: PeriodPreviewResponse;
  /** confirm 시도 후 409 로 받은 구조화 게이트 실패 (없으면 null) */
  failures: ConfirmGateFailure[] | null;
}

/**
 * 마감 게이트 체크리스트 카드 — 게이트별 통과/이슈 카운트 + 항목별 인라인
 * 해결 액션. 근태 이슈는 1회용 필터 딥링크로 새 탭에서 열고(payroll 화면 상태
 * 유지), 시급 이슈는 이 자리에서 시급 변경 다이얼로그를 띄운다.
 * confirm 409 실패는 서버 상세로 승격 렌더.
 */
export function GateChecklist({ preview, failures }: Props) {
  const gates = buildGates(preview, failures);
  const hasBlocking = gates.some((g) => g.blocking);
  const storeId = preview.period.store_id;

  const qc = useQueryClient();
  const { hasPermission, isGMPlus } = usePermissions();
  const canOpenAttendance = hasPermission(PERMISSIONS.SCHEDULES_READ);
  // 시급 변경은 서버가 GM 미만에 403 (cost visibility) — 버튼 자체를 숨긴다.
  const canChangeRate = hasPermission(PERMISSIONS.USERS_UPDATE) && isGMPlus;

  const [rateTarget, setRateTarget] = useState<RateTarget | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggleExpanded = (gate: string): void => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(gate)) next.delete(gate);
      else next.add(gate);
      return next;
    });
  };

  const openAttendance = (item: GateItemView, autoOnly: boolean): void => {
    window.open(
      buildAttendanceOneShotLink({
        storeId,
        date: item.date,
        userId: item.userId,
        unconfirmedAutoOnly: autoOnly,
      }),
      "_blank",
      "noopener,noreferrer",
    );
  };

  const renderItemAction = (
    gate: GateView,
    item: GateItemView,
  ): ReactNode => {
    if (gate.fix === "attendance_auto" || gate.fix === "attendance_open") {
      if (!canOpenAttendance) return null;
      return (
        <button
          type="button"
          onClick={() => openAttendance(item, gate.fix === "attendance_auto")}
          className="flex shrink-0 items-center gap-1 rounded-lg border border-[#E2E4EA] bg-white px-2 py-1 text-[11px] font-semibold text-[#6C5CE7] hover:border-[#CBD2DA] hover:bg-[#F5F6FA]"
        >
          Fix
          <ExternalLink size={11} />
        </button>
      );
    }
    if (gate.fix === "rate") {
      if (!canChangeRate || !item.userId) return null;
      const userId = item.userId;
      return (
        <button
          type="button"
          onClick={() => setRateTarget({ userId, name: item.name })}
          className="flex shrink-0 items-center gap-1 rounded-lg border border-[#E2E4EA] bg-white px-2 py-1 text-[11px] font-semibold text-[#6C5CE7] hover:border-[#CBD2DA] hover:bg-[#F5F6FA]"
        >
          <Wallet size={11} />
          Fix rate
        </button>
      );
    }
    return null;
  };

  return (
    <div className="rounded-xl border border-[#E2E4EA] bg-white">
      <div className="flex items-center justify-between border-b border-[#E2E4EA] px-4 py-2.5">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">
          Close gates
        </p>
        <p className="text-[11px] text-[#94A3B8]">
          All gates must pass before this period can be confirmed
        </p>
      </div>

      {hasBlocking && (
        <div className="mx-4 mt-3 flex items-start gap-2 rounded-lg bg-[rgba(255,107,107,0.08)] px-3 py-2.5 text-[12px] text-[#C0392B]">
          <ShieldAlert size={15} className="mt-0.5 shrink-0" />
          <span>
            Confirm was blocked — resolve every issue below, then confirm again.
          </span>
        </div>
      )}

      <ul className="divide-y divide-[#F0F1F5] px-4 py-1">
        {gates.map((g) => {
          const failed = g.items.length > 0;
          const isExpanded = expanded.has(g.gate);
          const visible =
            isExpanded || g.items.length <= COLLAPSED_ITEMS
              ? g.items
              : g.items.slice(0, COLLAPSED_ITEMS);

          return (
            <li key={g.gate} className="py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-2.5">
                  {failed ? (
                    <AlertTriangle
                      size={16}
                      className={cn(
                        "mt-0.5 shrink-0",
                        g.blocking ? "text-[#FF6B6B]" : "text-[#F0A500]",
                      )}
                    />
                  ) : (
                    <CheckCircle2
                      size={16}
                      className="mt-0.5 shrink-0 text-[#00B894]"
                    />
                  )}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-[13px] font-semibold text-[#1A1D27]">
                        {g.label}
                      </p>
                      {failed && (
                        <span
                          className={cn(
                            "rounded-full px-1.5 py-0.5 text-[10px] font-bold",
                            g.blocking
                              ? "bg-[rgba(255,107,107,0.12)] text-[#FF6B6B]"
                              : "bg-[rgba(240,165,0,0.12)] text-[#B45F06]",
                          )}
                        >
                          {g.items.length}{" "}
                          {g.items.length === 1 ? "issue" : "issues"}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-[11.5px] text-[#94A3B8]">
                      {failed
                        ? (g.serverMessage ??
                          g.note ??
                          "Resolve the items below.")
                        : (g.note ?? g.okNote)}
                    </p>
                  </div>
                </div>
                {g.link && failed && (
                  <Link
                    href={g.link.href}
                    className="flex shrink-0 items-center gap-1 rounded-lg border border-[#E2E4EA] px-2.5 py-1.5 text-[11.5px] font-semibold text-[#6C5CE7] hover:border-[#CBD2DA] hover:bg-[#F5F6FA]"
                  >
                    {g.link.label}
                    <ArrowUpRight size={12} />
                  </Link>
                )}
              </div>

              {failed && (
                <div className="mt-2 rounded-lg bg-[#FAFBFC] px-3 py-2">
                  <ul className="space-y-1">
                    {visible.map((it) => (
                      <li
                        key={it.key}
                        className="flex items-center justify-between gap-2 text-[11.5px] leading-snug"
                      >
                        <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                          <span className="font-semibold text-[#1A1D27]">
                            {it.name ?? "Unknown member"}
                          </span>
                          {it.date && (
                            <span className="tabular-nums text-[#64748B]">
                              {payrollShortDate(it.date)}
                            </span>
                          )}
                          <span className="min-w-0 text-[#94A3B8]">
                            {it.detail}
                          </span>
                        </span>
                        {renderItemAction(g, it)}
                      </li>
                    ))}
                  </ul>

                  {g.items.length > COLLAPSED_ITEMS && (
                    <button
                      type="button"
                      onClick={() => toggleExpanded(g.gate)}
                      aria-expanded={isExpanded}
                      className="mt-1.5 text-[11px] font-semibold text-[#6C5CE7] hover:underline"
                    >
                      {isExpanded
                        ? "Show less"
                        : `Show all (${g.items.length})`}
                    </button>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {rateTarget && (
        <GateRateDialog
          userId={rateTarget.userId}
          memberName={rateTarget.name}
          onClose={() => setRateTarget(null)}
          onSaved={() => {
            void qc.invalidateQueries({ queryKey: ["payroll", "preview"] });
          }}
        />
      )}
    </div>
  );
}

/**
 * 게이트에서 띄우는 시급 변경 다이얼로그 — 현재 시급 표시를 위해 열릴 때만
 * 직원 목록을 읽는다 (payroll 화면 기본 로드에는 users 요청을 추가하지 않음).
 */
function GateRateDialog({
  userId,
  memberName,
  onClose,
  onSaved,
}: {
  userId: string;
  memberName: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const usersQ = useUsers();
  const title = memberName
    ? `Change Hourly Rate — ${memberName}`
    : "Change Hourly Rate";

  if (usersQ.isLoading) {
    return (
      <Modal isOpen onClose={onClose} title={title}>
        <div className="flex items-center justify-center py-6">
          <LoadingSpinner size="sm" />
        </div>
      </Modal>
    );
  }

  const currentRate =
    usersQ.data?.find((u) => u.id === userId)?.hourly_rate ?? null;

  return (
    <RateChangeDialog
      userId={userId}
      currentRate={currentRate}
      onClose={onClose}
      onSaved={onSaved}
      title={title}
    />
  );
}
