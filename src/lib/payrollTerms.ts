/**
 * Payroll 용어 병기 — 콘솔의 "penalty" 는 급여명세서(pay stub)에 법정 용어인
 * "meal/rest period premium" 으로 찍힌다 (app/utils/pay_stub_pdf.py 의
 * "Meal period premium" / "Rest break premium" / "Meal and rest period premiums").
 *
 * 두 표기가 같은 항목이라는 걸 화면에서 연결해 주기 위한 문구 모음.
 * 라벨은 섹션 제목 수준에서만 병기하고, 좁은 자리(컬럼 헤더·배지)는 툴팁으로.
 */

/** 섹션 제목용 병기 라벨. */
export const PENALTY_SECTION_LABEL = "Penalties (premium pay)";

/** 컬럼 헤더·요약 타일 등 좁은 자리의 툴팁. */
export const PENALTY_TERM_HINT =
  "Meal and rest period penalties. Pay stubs show these as meal/rest period premiums.";

/** payroll_events.kind → 명세서 표기 (배지 툴팁). */
export const PENALTY_KIND_HINTS: Record<string, string> = {
  meal_penalty: "Shown on pay stubs as “Meal period premium”",
  rest_penalty: "Shown on pay stubs as “Rest break premium”",
};
