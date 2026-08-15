/**
 * 급여 마감 게이트 정의 — validation code → 체크리스트 카드 (순수 모듈).
 *
 * 컴포넌트 안에 두면 "서버가 보내는 코드를 전부 알고 있는가" 를 테스트할 수 없다.
 * 코드가 빠지면 카드가 통째로 안 뜨고(= 통과한 것처럼 보이고), 확정 시도에서야
 * 정체불명의 409 로 튀어나온다. 그래서 정의는 화면과 떼어 놓는다.
 */

import { PAYROLL_GATE } from "@/types/payroll";

/** 항목 1건을 어떤 화면에서 고치는지 — 행 단위 액션 종류. */
export type GateFix =
  | "attendance_auto"
  | "attendance_open"
  | "attendance_early"
  | "attendance_overlap"
  | "rate"
  | "none";

/** 근태 화면에서 고치는 게이트 — Fix 버튼이 근태 딥링크를 연다. */
export const ATTENDANCE_FIXES: ReadonlySet<GateFix> = new Set<GateFix>([
  "attendance_auto",
  "attendance_open",
  "attendance_early",
  "attendance_overlap",
]);

export interface GateDef {
  label: string;
  okNote: string;
  codes: string[];
  fix: GateFix;
  link: { href: string; label: string } | null;
  /**
   * preview 단계 설명 — 왜 막히는지 + 무엇을 해야 하는지.
   * 없으면 "Resolve the items below." 라는 빈 말만 남는다.
   */
  failNote?: string;
}

/**
 * 마감 게이트 — validation code → 카드 행 정의.
 * 근태/시급 게이트는 카드 수준 링크 대신 행마다 인라인 액션을 쓴다 (항목별로
 * payroll 화면 상태를 잃지 않고 해결).
 */
export const GATE_DEFS: GateDef[] = [
  {
    label: "Auto clock-outs confirmed",
    okNote: "Every auto clock-out has been reviewed.",
    codes: [PAYROLL_GATE.UNCONFIRMED_AUTO_CLOCKOUT],
    fix: "attendance_auto",
    link: null,
  },
  {
    label: "Early clock-ins reviewed",
    okNote: "Every early clock-in has been reviewed.",
    codes: [PAYROLL_GATE.UNCONFIRMED_EARLY_CLOCK_IN],
    fix: "attendance_early",
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
    label: "No overlapping shifts",
    okNote: "Nobody worked two shifts that overlap in time.",
    codes: [PAYROLL_GATE.OVERLAPPING_ATTENDANCE],
    fix: "attendance_overlap",
    link: null,
    // 겹침은 확인 도장으로 넘길 수 없다 — 승인된 겹침은 정의상 이중 지급이다.
    failNote:
      "Two shifts cover the same hours for one person, so those hours would be " +
      "paid twice. Open the wrong record and cancel or correct it — there is no " +
      "way to approve an overlap.",
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
export const EXTRA_GATE_LABELS: Record<
  string,
  { label: string; okNote: string }
> = {
  [PAYROLL_GATE.MULTI_STORE_WEEK]: {
    label: "Multi-store weeks consistent",
    okNote: "",
  },
};
