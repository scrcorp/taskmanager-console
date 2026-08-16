/**
 * 연락처 가시성 — 폼 검증과 표시 문구의 순수 로직.
 *
 * 핵심: **매장 0개가 조용히 "전 조직 공개"로 읽히면 안 된다.** 이 도메인이 존재하는
 * 이유가 "특정 소속 인원이 보면 안 되는 연락처"라서, 실수는 가시성 축소 방향으로만
 * 나야 한다. 폼과 서버가 같은 규칙을 들고 있는지 여기서 못 박는다.
 */

import { describe, it, expect } from "vitest";

import {
  draftToPayload,
  emptyContactDraft,
  validateContactDraft,
  type ContactDraft,
} from "@/components/contacts/contactDraft";
import {
  visibilityLabel,
  visibilitySentence,
} from "@/components/contacts/visibilityLabel";
import type { Contact } from "@/types";

const NO_REASON = { reasonRequired: false };

function draft(over: Partial<ContactDraft> = {}): ContactDraft {
  return { ...emptyContactDraft(), name: "Acme", ...over };
}

describe("가시성 폼 검증", () => {
  it("기본값은 전 조직 공유이며 통과한다", () => {
    const d = draft();
    expect(d.visibility).toBe("organization");
    expect(validateContactDraft(d, NO_REASON).visibility).toBeUndefined();
  });

  it("대상 모드인데 아무것도 안 고르면 막는다", () => {
    const errors = validateContactDraft(
      draft({ visibility: "restricted", targets: [] }),
      NO_REASON,
    );
    expect(errors.visibility).toBeTruthy();
  });

  it("대상 모드 + 대상 하나면 통과한다", () => {
    const errors = validateContactDraft(
      draft({ visibility: "restricted", targets: [{ type: "store", id: "s1" }] }),
      NO_REASON,
    );
    expect(errors.visibility).toBeUndefined();
  });
});

describe("draft → payload 변환", () => {
  it("대상 모드면 고른 대상을 그대로 보낸다 (3축 섞여도)", () => {
    const payload = draftToPayload(
      draft({
        visibility: "restricted",
        targets: [
          { type: "store", id: "s1" },
          { type: "role", id: "r1" },
          { type: "user", id: "u1" },
        ],
        excluded_user_ids: ["u9"],
      }),
    );
    expect(payload.visibility).toBe("restricted");
    expect(payload.targets).toHaveLength(3);
    expect(payload.excluded_user_ids).toEqual(["u9"]);
  });

  it("전 조직 공유면 대상·제외를 딸려 보내지 않는다", () => {
    // 대상을 골랐다가 전체 공유로 바꾼 상태. 그대로 보내면 서버가 모순으로 거부한다.
    const payload = draftToPayload(
      draft({
        visibility: "organization",
        targets: [{ type: "store", id: "s1" }],
        excluded_user_ids: ["u9"],
      }),
    );
    expect(payload.visibility).toBe("organization");
    expect(payload.targets).toEqual([]);
    expect(payload.excluded_user_ids).toEqual([]);
  });
});

describe("표시 문구", () => {
  const base = {
    targets: [
      { type: "store" as const, id: "s1", name: "MBQ" },
      { type: "store" as const, id: "s2", name: "MSK" },
      { type: "role" as const, id: "r1", name: "Supervisor" },
    ],
  };

  it("전 조직 공유는 All stores", () => {
    expect(visibilityLabel({ visibility: "organization", targets: [] })).toBe("All stores");
  });

  it("대상 하나면 이름 그대로", () => {
    expect(
      visibilityLabel({ visibility: "restricted", targets: [base.targets[0]] }),
    ).toBe("MBQ");
  });

  it("여러 개면 대표 하나 + 나머지 개수", () => {
    expect(visibilityLabel({ visibility: "restricted", targets: base.targets })).toBe(
      "MBQ +2",
    );
  });

  it("대상이 전부 사라져도 전체 공유로 보이지 않는다", () => {
    // 대상이 삭제되면 링크가 CASCADE 로 사라진다. 여기서 "All stores" 로 읽히면
    // 화면이 실제 가시성과 반대로 보인다.
    expect(visibilityLabel({ visibility: "restricted", targets: [] })).toBe(
      "No one (owners only)",
    );
  });

  it("상세 문장은 축별로 묶어 전부 적는다", () => {
    const contact = {
      visibility: "restricted",
      targets: base.targets,
      excluded_users: [],
    } as unknown as Contact;
    expect(visibilitySentence(contact)).toBe(
      "Visible to stores MBQ, MSK; role Supervisor (plus owners and the creator)",
    );
  });

  it("제외된 사람은 문장에 드러난다", () => {
    // 안 보이면 "왜 저 사람만 못 보지"를 아무도 설명하지 못한다.
    const contact = {
      visibility: "restricted",
      targets: [base.targets[0]],
      excluded_users: [{ type: "user", id: "u9", name: "Jane" }],
    } as unknown as Contact;
    expect(visibilitySentence(contact)).toContain("except Jane");
  });
});
