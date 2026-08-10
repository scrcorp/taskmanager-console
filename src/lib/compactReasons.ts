/**
 * 수정 사유 preset.
 *
 * 근태와 스케줄은 "왜 고쳤나" 의 성격이 다르다. 근태는 기록 오류를 바로잡는 쪽
 * (안 찍음/잘못 찍힘)이고, 스케줄은 운영 판단으로 계획을 바꾸는 쪽이다. 한 목록으로
 * 합치면 어느 쪽에서도 맞는 항목이 없어서 전부 "Other" 로 흘러간다.
 *
 * 근태 preset 은 데스크탑과 같은 목록을 그대로 쓴다 — 두 화면이 다른 문구를 저장하면
 * 리포팅에서 같은 사유가 갈린다.
 */

export { CORRECTION_REASON_PRESETS, OTHER_REASON_LABEL } from
  "@/components/attendances/correctionPresets";

/** 스케줄(계획) 변경 사유. */
export const SHIFT_REASON_PRESETS: readonly string[] = [
  "Staffing change",
  "Business hours change",
  "Employee request",
  "Coverage for an absence",
  "Overtime control",
  "Entered by mistake",
] as const;
