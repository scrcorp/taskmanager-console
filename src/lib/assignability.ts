/**
 * 배정 가능 여부 — "이 사람에게 이 날짜로 근무를 꽂아도 되는가".
 *
 * 판정 규칙은 **서버가 소유한다** (`staff_assignment_service`). 화면은 서버가 내려준
 * `assignable` / `assignable_until` 을 읽기만 한다 — 여기서 is_active 같은 원본 필드로
 * 자체 판정을 만들면 저장 검증과 갈려서 "눌리는데 저장이 안 되는" 상태가 된다.
 *
 * 규칙 요약 (D1 · 2026-08-19):
 *   assignable=false      → 어떤 날짜도 불가
 *   assignable_until=null → 제한 없음
 *   assignable_until="D"  → D 까지(당일 포함) 가능, 다음날부터 불가
 */

export interface AssignabilityFields {
  assignable?: boolean;
  assignable_until?: string | null;
}

/** 날짜 문자열은 "YYYY-MM-DD" — 사전순 비교가 곧 날짜 비교다. */
export function canAssignOn(
  who: AssignabilityFields | undefined | null,
  date: string,
): boolean {
  if (!who) return false;
  // 필드가 없는 응답(구 캐시/목업)은 막지 않는다 — 서버 검증이 최종 방어선이다.
  if (who.assignable === false) return false;
  if (!who.assignable_until) return true;
  return date <= who.assignable_until;
}

/** 아무 날짜로도 배정할 수 없는 사람인지 (후보 목록에서 빼는 기준). */
export function isNeverAssignable(who: AssignabilityFields | undefined | null): boolean {
  return !!who && who.assignable === false;
}

/** 잠긴 칸/후보에 붙일 사유 문구. 배정 가능하면 null. */
export function assignBlockReason(
  who: AssignabilityFields | undefined | null,
  date: string,
): string | null {
  if (canAssignOn(who, date)) return null;
  if (who?.assignable_until) return `Last working day was ${who.assignable_until}`;
  return "No longer active";
}

/** 표시용 재직기간 필드 — 판정(assignable*)과 별개 축이다. */
export interface EmploymentPeriodFields {
  employed_from?: string | null;
  employed_to?: string | null;
}

/**
 * 모르는 날짜 자리. 기호(—)가 아니라 **말**로 적는다 — 기호는 "값이 없음" 인지
 * "구분선" 인지 읽는 사람마다 다르게 해석한다.
 */
export const UNKNOWN_DATE = "No date";

/**
 * 재직기간 문구 — 항상 무언가를 돌려준다.
 *
 * ⚠️ **[보류 2026-08-19] 현재 어느 화면에서도 렌더하지 않는다.** 퇴사는 매장 단위 개념인데
 * 지금 서버가 주는 날짜는 org 단위라, 그대로 띄우면 "다른 매장에서는 재직 중"인 사람을
 * 잘못 말한다. 매장별 입·퇴사일이 생기면 이 함수를 그대로 다시 쓰면 된다 —
 * 그래서 테스트와 함께 남겨 둔다. 설계: docs/99_inbox/2026-08-19-퇴사-매장별-재정의.md
 *
 *   2026.03.30 ~              재직 중 (끝이 없는 게 정보다)
 *   No date ~                 재직 중인데 입사일 미입력 (hire_date 가 아직 대부분 빈 상태)
 *   2026.03.30 ~ 2026.08.19   퇴사
 *   No date ~ 2026.08.19      퇴사인데 입사일 미입력
 *
 * 없는 날짜는 **지어내지 않고** 자리만 표시한다. 아예 렌더를 생략하면 "이 사람만 왜 없지?"
 * 로 읽히므로, 모르는 것은 모른다고 보이게 둔다.
 */
export function formatEmploymentPeriod(
  who: EmploymentPeriodFields | undefined | null,
): string {
  const dot = (d: string) => d.replace(/-/g, ".");
  const from = who?.employed_from ? dot(who.employed_from) : UNKNOWN_DATE;
  const to = who?.employed_to ? dot(who.employed_to) : null;
  return to ? `${from} ~ ${to}` : `${from} ~`;
}
