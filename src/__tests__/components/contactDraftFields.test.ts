/**
 * 연락처 폼 초안 — 이메일/링크 복수화(D7)와 Summary/Notes(D8) 규칙.
 *
 * 특히 **Notes 300 상한은 "값이 바뀐 경우"에만** 걸린다. 예전에 길게 저장된 메모를
 * 손대지 않았는데도 막으면, 그 연락처는 이름 한 글자도 못 고치게 된다(서버와 같은 규칙).
 */

import { describe, expect, it } from "vitest";

import {
  CONTACT_LIMITS,
  draftToPayload,
  emptyContactDraft,
  newEmailRow,
  newLinkRow,
  newPhoneRow,
  validateContactDraft,
  type ContactDraft,
} from "@/components/contacts/contactDraft";

function draft(over: Partial<ContactDraft> = {}): ContactDraft {
  return { ...emptyContactDraft(), name: "Acme", ...over };
}

const OK = { reasonRequired: false };

describe("빈 폼", () => {
  it("아무 칸도 미리 깔지 않는다 (필요한 것만 + 추가로 꺼내 쓴다)", () => {
    const d = emptyContactDraft();
    expect(d.phones).toEqual([]);
    expect(d.emails).toEqual([]);
    expect(d.links).toEqual([]);
  });
});

describe("Summary", () => {
  it("72자까지 통과하고 넘으면 몇 자인지 알려준다", () => {
    expect(validateContactDraft(draft({ summary: "x".repeat(72) }), OK).summary).toBeUndefined();
    const err = validateContactDraft(draft({ summary: "x".repeat(73) }), OK).summary;
    expect(err).toContain("73/72");
  });
});

describe("Notes 상한은 바뀐 값에만", () => {
  it("새로 300자를 넘기면 막는다", () => {
    const d = draft({ notes: "y".repeat(301), notesBaseline: "" });
    expect(validateContactDraft(d, OK).notes).toContain("301/300");
  });

  it("기존 긴 값을 손대지 않았으면 통과시킨다", () => {
    const legacy = "y".repeat(800);
    const d = draft({ notes: legacy, notesBaseline: legacy });
    expect(validateContactDraft(d, OK).notes).toBeUndefined();
  });

  it("기존 긴 값을 더 늘리면 막는다", () => {
    const legacy = "y".repeat(800);
    const d = draft({ notes: legacy + "more", notesBaseline: legacy });
    expect(validateContactDraft(d, OK).notes).toBeDefined();
  });

  it("줄이는 방향은 언제나 통과한다", () => {
    const d = draft({ notes: "y".repeat(200), notesBaseline: "y".repeat(800) });
    expect(validateContactDraft(d, OK).notes).toBeUndefined();
  });
});

describe("이메일", () => {
  it("@ 가 없으면 막는다", () => {
    const d = draft({ emails: [newEmailRow({ address: "nope" })] });
    expect(validateContactDraft(d, OK).emails).toContain("@");
  });

  it("상한을 넘기면 막는다", () => {
    const rows = Array.from({ length: CONTACT_LIMITS.emails + 1 }, (_, i) =>
      newEmailRow({ address: `a${i}@acme.com` }),
    );
    expect(validateContactDraft(draft({ emails: rows }), OK).emails).toBeDefined();
  });

  it("대표가 없으면 payload 로 나갈 때 첫 줄이 대표가 된다", () => {
    const d = draft({
      emails: [
        newEmailRow({ address: "a@acme.com" }),
        newEmailRow({ address: "b@acme.com" }),
      ],
    });
    const payload = draftToPayload(d);
    expect(payload.emails?.map((e) => e.is_primary)).toEqual([true, false]);
  });

  it("빈 줄은 저장되지 않는다", () => {
    const d = draft({ emails: [newEmailRow({ address: "  " })] });
    expect(draftToPayload(d).emails).toEqual([]);
  });
});

describe("링크", () => {
  it("URL 을 원문 그대로 보낸다 — https:// 를 붙이지 않는다", () => {
    const d = draft({ links: [newLinkRow({ label: "Portal", url: " order.acme.com " })] });
    expect(draftToPayload(d).links).toEqual([
      // 유일한 연락수단이라 메인으로 올라간다 (메인은 채널을 통틀어 하나)
      { label: "Portal", url: "order.acme.com", is_primary: true },
    ]);
  });

  it("공백이 든 링크는 막는다", () => {
    const d = draft({ links: [newLinkRow({ url: "acme.com/order portal" })] });
    expect(validateContactDraft(d, OK).links).toContain("space");
  });
});

describe("전화번호", () => {
  it("빈 줄만 있으면 아무것도 저장하지 않는다", () => {
    const d = draft({ phones: [newPhoneRow({ is_primary: true })] });
    expect(draftToPayload(d).phones).toEqual([]);
  });
});

describe("Main contact 는 채널을 통틀어 하나", () => {
  it("아무도 안 골랐으면 첫 전화가 메인이 된다", () => {
    const d = draft({
      phones: [newPhoneRow({ number: "213-555-0142" })],
      emails: [newEmailRow({ address: "a@acme.com" })],
      links: [newLinkRow({ url: "acme.com" })],
    });
    const payload = draftToPayload(d);
    expect(payload.phones?.[0].is_primary).toBe(true);
    expect(payload.emails?.[0].is_primary).toBe(false);
    expect(payload.links?.[0].is_primary).toBe(false);
  });

  it("전화가 없으면 이메일이, 이메일도 없으면 링크가 메인이 된다", () => {
    const noPhone = draftToPayload(
      draft({
        emails: [newEmailRow({ address: "a@acme.com" })],
        links: [newLinkRow({ url: "acme.com" })],
      }),
    );
    expect(noPhone.emails?.[0].is_primary).toBe(true);
    expect(noPhone.links?.[0].is_primary).toBe(false);

    const linkOnly = draftToPayload(draft({ links: [newLinkRow({ url: "acme.com" })] }));
    expect(linkOnly.links?.[0].is_primary).toBe(true);
  });

  it("링크를 메인으로 고르면 전화가 있어도 링크가 메인이다", () => {
    const payload = draftToPayload(
      draft({
        phones: [newPhoneRow({ number: "213-555-0142" })],
        links: [newLinkRow({ url: "portal.acme.com", is_primary: true })],
      }),
    );
    expect(payload.links?.[0].is_primary).toBe(true);
    expect(payload.phones?.[0].is_primary).toBe(false);
  });
});
