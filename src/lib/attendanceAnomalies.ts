/**
 * 근태 anomaly 코드 → 화면 라벨 (순수 모듈, 컴포넌트 import 금지).
 *
 * 서버는 표시 문자열을 내려보내지 않는다 (계약 R0-3) — 코드만 온다. 그 코드를
 * 사람이 읽는 말로 바꾸는 곳이 여기 하나여야 한다. 지금까지는 화면마다
 * `a.replace(/_/g, " ")` 로 각자 풀어서 `overlapping clock in` 같은 반쪽짜리
 * 영어가 새어 나갔다.
 *
 * 모르는 코드는 지우지 않고 언더바만 푼다 — 서버가 새 라벨을 붙였을 때
 * 화면에서 조용히 사라지는 것보다 어색한 문구가 낫다.
 */

/** 서버 `attendance_service.DISPLAY_ANOMALIES` + 저장 라벨. 3-repo 공유 코드. */
export const ATTENDANCE_ANOMALY = {
  LATE: "late",
  NO_SHOW: "no_show",
  EARLY_LEAVE: "early_leave",
  EARLY_CLOCK_OUT: "early_clock_out",
  OVERTIME: "overtime",
  NO_BREAK: "no_break",
  EARLY_CLOCK_IN_OVERRIDE: "early_clock_in_override",
  AUTO_CLOCKED_OUT: "auto_clocked_out",
  /** 같은 사람의 다른 shift 가 아직 열려 있는데 또 출근한 건 (D15). */
  OVERLAPPING_CLOCK_IN: "overlapping_clock_in",
} as const;

export type AttendanceAnomalyCode =
  (typeof ATTENDANCE_ANOMALY)[keyof typeof ATTENDANCE_ANOMALY];

/** 배지·이력에 쓰는 짧은 라벨 (문장 아님 — 좁은 폭에 들어가야 한다). */
const ANOMALY_LABELS: Record<string, string> = {
  [ATTENDANCE_ANOMALY.LATE]: "Late",
  [ATTENDANCE_ANOMALY.NO_SHOW]: "No show",
  [ATTENDANCE_ANOMALY.EARLY_LEAVE]: "Early leave",
  [ATTENDANCE_ANOMALY.EARLY_CLOCK_OUT]: "Early clock-out",
  [ATTENDANCE_ANOMALY.OVERTIME]: "Overtime",
  [ATTENDANCE_ANOMALY.NO_BREAK]: "No break",
  [ATTENDANCE_ANOMALY.EARLY_CLOCK_IN_OVERRIDE]: "Early clock-in",
  [ATTENDANCE_ANOMALY.AUTO_CLOCKED_OUT]: "Auto clock-out",
  [ATTENDANCE_ANOMALY.OVERLAPPING_CLOCK_IN]: "Overlapping shift",
};

/** 코드 한 개 → 라벨. 모르는 코드는 언더바만 풀어서 돌려준다. */
export function anomalyLabel(code: string): string {
  return ANOMALY_LABELS[code] ?? code.replace(/_/g, " ");
}

/**
 * Activity History 의 `anomalies` 행 값 → 라벨 목록.
 * 서버는 정렬된 코드들을 ", " 로 이어 한 문자열로 남긴다
 * (`attendance_lifecycle_service._anomalies_text`). 빈 값은 호출 측이 처리한다.
 */
export function formatAnomalyList(raw: string): string {
  const codes = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (codes.length === 0) return raw;
  return codes.map(anomalyLabel).join(", ");
}

/** 겹쳐 열린 shift 인가 — 두 근무가 같은 시간대를 점유해 급여가 두 번 나갈 수 있는 상태. */
export function hasOverlappingClockIn(
  anomalies: string[] | null | undefined,
): boolean {
  return anomalies?.includes(ATTENDANCE_ANOMALY.OVERLAPPING_CLOCK_IN) ?? false;
}

/**
 * 겹침 안내 문구 — 근태표 배너, 상세 배너, 간소화 콘솔이 같은 말을 해야 한다.
 * 매니저가 화면마다 다른 설명을 읽으면 "다른 문제인가" 로 읽힌다.
 */
export const OVERLAP_TITLE = "Two shifts are open at the same time";

export const OVERLAP_EXPLANATION =
  "This employee clocked in to another shift before the first one was closed. " +
  "The same hours sit on two records, so payroll would pay them twice — " +
  "payroll can't be confirmed until one of them is fixed.";

/**
 * 정리 동선 — 새 엔드포인트를 만들지 않고 기존 정정 액션만 순서대로 쓴다.
 * (원클릭 폐기는 walk-in 행에서 clear times 가 거부되어 막다른 길이 된다.)
 */
export const OVERLAP_FIX_STEPS: readonly string[] = [
  "Decide which record is the real shift — usually the one the employee meant to work.",
  "Open the wrong one and Reopen it if it is already clocked out.",
  "Clear its clock-in / clock-out times, then Cancel that shift.",
  "Correct the remaining record so its times match what was actually worked.",
];
