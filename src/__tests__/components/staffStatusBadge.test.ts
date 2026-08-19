/**
 * 직원 상태 판정 — 목록·선택 UI 가 공유하는 단일 표시 규칙.
 *
 * 화면마다 is_active 조합으로 각자 라벨을 만들면 같은 사람이 어디선 "Terminated",
 * 어디선 무표시가 된다. 그 재발을 막는 테스트다.
 */
import { describe, it, expect } from "vitest";
import { staffStatusOf } from "@/components/ui/StaffStatusBadge";

describe("staffStatusOf", () => {
  it("shows nothing for an active staff", () => {
    expect(staffStatusOf({ is_active: true })).toBeNull();
  });

  it("calls a provisional account Not signed up", () => {
    // 유령은 is_active=false 지만 '앞으로 일할 사람' 이라 퇴사자와 섞이면 안 된다.
    const s = staffStatusOf({ is_active: false, is_provisional: true });
    expect(s?.label).toBe("Not signed up");
    expect(s?.tone).toBe("warning");
  });

  it("calls an inactive account with a last working day Terminated", () => {
    const s = staffStatusOf({ is_active: false, assignable_until: "2026-08-19" });
    expect(s?.label).toBe("Terminated");
    expect(s?.title).toContain("2026-08-19");
  });

  it("calls an inactive account without a date Deactivated", () => {
    // 계정 비활성과 퇴사는 별개 축 — 중복 가입 정리·오등록도 여기 들어온다.
    expect(staffStatusOf({ is_active: false })?.label).toBe("Deactivated");
  });

  it("shows nothing when the server sent no flags (old cache)", () => {
    expect(staffStatusOf({})).toBeNull();
    expect(staffStatusOf(undefined)).toBeNull();
  });
});
