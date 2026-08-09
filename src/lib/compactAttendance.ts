import type { Attendance } from "@/types";
import { NOT_SET } from "./compactWeek";

/**
 * 이상 건 판정 — anomalies 배열 또는 결번/지각 상태.
 * 취소된 기록은 제외한다. 조치할 게 없는데 이상 건으로 세면 배지가 신뢰를 잃는다.
 */
export function hasIssue(a: Attendance): boolean {
  if (a.status === "cancelled") return false;
  if (a.anomalies && a.anomalies.length > 0) return true;
  return a.status === "no_show" || a.status === "late";
}

/** 아직 진행 중이라 퇴근 시각을 제안하면 안 되는 상태. */
const IN_PROGRESS: ReadonlySet<string> = new Set(["working", "on_break", "upcoming", "soon"]);

/**
 * 카드에 보여줄 시각 — 실제 기록이 없으면 예정 시각으로 대신한다.
 * `--:--` 만 나열하면 아무 정보가 없어서, 매니저가 "몇 시 근무였지" 를 다시 찾아봐야 한다.
 */
export function displayTimes(a: Attendance): {
  inText: string;
  outText: string;
  inIsScheduled: boolean;
  outIsScheduled: boolean;
} {
  const inText = a.clock_in_display ?? a.scheduled_start_display ?? NOT_SET;
  const outText = a.clock_out_display ?? a.scheduled_end_display ?? NOT_SET;
  return {
    inText,
    outText,
    inIsScheduled: !a.clock_in_display && !!a.scheduled_start_display,
    outIsScheduled: !a.clock_out_display && !!a.scheduled_end_display,
  };
}

/**
 * 정정 폼의 초기값 — 실제 기록이 있으면 그것, 없으면 예정 시각을 미리 채운다.
 * 폰에서 datetime 을 처음부터 입력하는 건 고통스럽고, 대부분의 정정은
 * "예정대로 일했는데 안 찍었다" 라서 예정값이 정답에 가깝다.
 *
 * 단, 아직 근무 중(working/on_break)이거나 시작 전(upcoming/soon)인 건에는 **퇴근 시각을 제안하지 않는다** —
 * 아직 안 끝난 근무에 퇴근 시각을 밀어 넣으면 없는 사실을 만들어내는 셈이다.
 *
 * @param toInput ISO → datetime-local 입력값 변환기 (호출 측이 매장 tz 를 물려서 넘긴다)
 */
export function suggestedClockInputs(
  a: Attendance,
  toInput: (iso: string | null) => string,
): { clockIn: string; clockOut: string; inPrefilled: boolean; outPrefilled: boolean } {
  const actualIn = toInput(a.clock_in);
  const actualOut = toInput(a.clock_out);

  const suggestedIn = actualIn || toInput(a.scheduled_start);
  const suggestedOut =
    actualOut || (IN_PROGRESS.has(a.status) ? "" : toInput(a.scheduled_end));

  return {
    clockIn: suggestedIn,
    clockOut: suggestedOut,
    inPrefilled: !actualIn && !!suggestedIn,
    outPrefilled: !actualOut && !!suggestedOut,
  };
}

/**
 * 상태 배지와 같은 말을 하는 anomaly 는 버린다.
 * `no_show` 상태에 "no show" anomaly 를 나란히 쓰면 좁은 폭만 잡아먹고 정보는 하나도 안 는다.
 */
export function extraAnomalies(a: Attendance): string[] {
  return (a.anomalies ?? []).filter((x) => x !== a.status);
}
