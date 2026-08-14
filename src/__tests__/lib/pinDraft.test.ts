/**
 * PIN 입력값 판정 — PIN finder 인라인 편집이 저장 전에 쓰는 순수 로직.
 *
 * 핵심: 서버 lookup 은 "누가 쓰는가" 만 알려주고 본인 제외를 모른다.
 * holders 가 편집 대상 본인뿐이면 충돌이 아니라 "지금 그 번호" 여야 한다 —
 * 여기서 틀리면 자기 PIN 을 다시 저장하려다 막힌다.
 */

import { describe, it, expect } from "vitest";
import { canSavePinDraft, evaluatePinDraft } from "@/lib/pinDraft";
import type { ClockinPinHolder, ClockinPinLookup } from "@/types";

const SELF = "u-self";
const OTHER = "u-other";

function holder(userId: string, fullName: string): ClockinPinHolder {
  return {
    user_id: userId,
    full_name: fullName,
    username: null,
    role_name: "staff",
    is_active: true,
    is_provisional: false,
    clockin_pin: "4885",
    conflict: "exact",
  };
}

function taken(pin: string, ...holders: ClockinPinHolder[]): ClockinPinLookup {
  return { pin, available: false, reason: "exact", holders };
}

function free(pin: string): ClockinPinLookup {
  return { pin, available: true, reason: null, holders: [] };
}

describe("evaluatePinDraft", () => {
  it.each(["", "123", "12a4", "1234567"])(
    "rejects malformed input %j before any lookup",
    (draft) => {
      const v = evaluatePinDraft({
        draft,
        selfUserId: SELF,
        lookup: undefined,
        isChecking: false,
      });
      expect(v.state).toBe("invalid");
      expect(canSavePinDraft(v)).toBe(false);
    },
  );

  it("waits while the lookup is in flight", () => {
    const v = evaluatePinDraft({
      draft: "4885",
      selfUserId: SELF,
      lookup: undefined,
      isChecking: true,
    });
    expect(v.state).toBe("checking");
    expect(canSavePinDraft(v)).toBe(false);
  });

  it("waits when the cached lookup is for a different PIN", () => {
    // 입력이 바뀌었는데 직전 응답이 남아 있으면 그 결과로 판정하면 안 된다.
    const v = evaluatePinDraft({
      draft: "4886",
      selfUserId: SELF,
      lookup: free("4885"),
      isChecking: false,
    });
    expect(v.state).toBe("checking");
  });

  it("allows a free number", () => {
    const v = evaluatePinDraft({
      draft: "4885",
      selfUserId: SELF,
      lookup: free("4885"),
      isChecking: false,
    });
    expect(v.state).toBe("free");
    expect(canSavePinDraft(v)).toBe(true);
  });

  it("treats the editor's own current PIN as savable, not a conflict", () => {
    const v = evaluatePinDraft({
      draft: "4885",
      selfUserId: SELF,
      lookup: taken("4885", holder(SELF, "Me")),
      isChecking: false,
    });
    expect(v.state).toBe("self");
    expect(canSavePinDraft(v)).toBe(true);
  });

  it("refuses a number another employee uses, naming them", () => {
    const v = evaluatePinDraft({
      draft: "4885",
      selfUserId: SELF,
      lookup: taken("4885", holder(OTHER, "Alberto Lopez")),
      isChecking: false,
    });
    expect(v).toEqual({ state: "taken", holderName: "Alberto Lopez" });
    expect(canSavePinDraft(v)).toBe(false);
  });

  it("refuses when someone else holds it even if the editor is also listed", () => {
    const v = evaluatePinDraft({
      draft: "4885",
      selfUserId: SELF,
      lookup: taken("4885", holder(SELF, "Me"), holder(OTHER, "Alberto Lopez")),
      isChecking: false,
    });
    expect(v).toEqual({ state: "taken", holderName: "Alberto Lopez" });
  });
});
