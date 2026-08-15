/**
 * 마감 게이트 정의 — 서버가 보낼 수 있는 코드를 콘솔이 전부 알고 있는가.
 *
 * 코드가 빠지면 카드가 아예 안 그려진다 = 매니저 눈에는 "통과" 로 보인다.
 * 그러다 확정 버튼을 누르면 정체불명의 409 만 뜬다 — 겹침(D15)처럼 새로 생긴
 * 게이트에서 제일 나기 쉬운 실수라 여기서 못박는다.
 */

import { describe, it, expect } from "vitest";
import {
  ATTENDANCE_FIXES,
  EXTRA_GATE_LABELS,
  GATE_DEFS,
} from "@/lib/payrollGateDefs";
import { PAYROLL_GATE } from "@/types/payroll";

const coveredCodes = new Set([
  ...GATE_DEFS.flatMap((d) => d.codes),
  ...Object.keys(EXTRA_GATE_LABELS),
]);

describe("GATE_DEFS 코드 커버리지", () => {
  it("PAYROLL_GATE 의 모든 코드가 카드 하나에 매핑돼 있다", () => {
    const missing = Object.values(PAYROLL_GATE).filter(
      (code) => !coveredCodes.has(code),
    );
    expect(missing).toEqual([]);
  });

  it("겹침 게이트가 존재하고 근태 화면에서 고치게 되어 있다", () => {
    const overlap = GATE_DEFS.find((d) =>
      d.codes.includes(PAYROLL_GATE.OVERLAPPING_ATTENDANCE),
    );
    expect(overlap).toBeDefined();
    expect(overlap!.fix).toBe("attendance_overlap");
    expect(ATTENDANCE_FIXES.has(overlap!.fix)).toBe(true);
  });

  it("겹침 게이트는 preview 단계에서도 설명을 갖는다", () => {
    // 서버 문구가 없는 preview 에서 'Resolve the items below.' 만 남으면
    // 왜 확정이 막히는지 아무도 모른다.
    const overlap = GATE_DEFS.find((d) =>
      d.codes.includes(PAYROLL_GATE.OVERLAPPING_ATTENDANCE),
    );
    expect(overlap!.failNote).toBeTruthy();
    expect(overlap!.failNote!.length).toBeGreaterThan(40);
  });

  it("같은 코드가 두 카드에 중복 매핑되지 않는다", () => {
    const all = GATE_DEFS.flatMap((d) => d.codes);
    expect(all.length).toBe(new Set(all).size);
  });

  it("카드 문구는 영어다 (UI 텍스트 규칙)", () => {
    const text = GATE_DEFS.flatMap((d) => [
      d.label,
      d.okNote,
      d.failNote ?? "",
      d.link?.label ?? "",
    ]).join(" ");
    expect(/[가-힣]/.test(text)).toBe(false);
  });
});
