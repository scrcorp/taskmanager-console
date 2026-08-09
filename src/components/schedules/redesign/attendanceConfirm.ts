/**
 * 근태 "확인 필요" 판정 헬퍼 — 순수 함수만 (컴포넌트 import 금지).
 *
 * 근태표 칩, 상세 배너, payroll 게이트 링크가 모두 같은 규칙을 봐야 하므로
 * 한 곳에 둔다. 컴포넌트 파일에 두면 테스트가 모달/React 트리까지 끌고 온다.
 */

/** 조기 출근 강행 미확인 — override anomaly 이면서 확인 시각이 비어 있는 record.
 *  매니저 대행 건은 서버가 생성 시점에 확인 처리하므로 여기 걸리지 않는다.
 *  Unconfirmed early clock-in: override anomaly present AND confirmation null. */
export function isUnconfirmedEarlyClockIn(
  anomalies: string[] | null | undefined,
  confirmedAt: string | null | undefined,
): boolean {
  return (anomalies?.includes("early_clock_in_override") ?? false) && !confirmedAt;
}
