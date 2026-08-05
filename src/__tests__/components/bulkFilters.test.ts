import { describe, it, expect } from "vitest";
import {
  rolePriorityToRoleId,
  filterBulkUsers,
  hasBulkRowFilters,
  hasBulkBlockFilters,
  matchesBlockFilters,
  selectCopyTargets,
  type BulkBlockFilters,
  type BulkRowFilters,
} from "@/components/schedules/redesign/bulkFilters";
import { ROLE_PRIORITY } from "@/lib/permissions";
import type { Schedule, User } from "@/types";

// ── fixtures ────────────────────────────────────────────
// 대상 함수가 읽는 필드만 채운 최소 객체.

function user(
  id: string,
  opts: { priority?: number; department?: "FOH" | "BOH" | null } = {},
): User {
  return {
    id,
    username: id,
    full_name: id.toUpperCase(),
    role_priority: opts.priority ?? ROLE_PRIORITY.STAFF,
    department: opts.department,
  } as User;
}

function sched(
  id: string,
  userId: string,
  status: string = "confirmed",
  opts: { position?: string | null; workRole?: string | null } = {},
): Schedule {
  return {
    id,
    user_id: userId,
    status,
    position_snapshot: opts.position ?? null,
    work_role_name_snapshot: opts.workRole ?? null,
    work_role_name: opts.workRole ?? null,
  } as Schedule;
}

const NO_FILTERS: BulkRowFilters = { staffIds: [], roles: [], departments: [] };
const NO_BLOCK_FILTERS: BulkBlockFilters = { statuses: [], positions: [], shifts: [] };

/** 행 필터만 검사할 때 쓰는 scope */
function scopeOf(userIds: string[], blockFilters: BulkBlockFilters = NO_BLOCK_FILTERS) {
  return { visibleUserIds: new Set(userIds), blockFilters };
}

// ── rolePriorityToRoleId ────────────────────────────────

describe("rolePriorityToRoleId — priority → FilterBar role id", () => {
  it("각 구간을 소문자 id 로 매핑", () => {
    expect(rolePriorityToRoleId(ROLE_PRIORITY.OWNER)).toBe("owner");
    expect(rolePriorityToRoleId(ROLE_PRIORITY.GM)).toBe("gm");
    expect(rolePriorityToRoleId(ROLE_PRIORITY.SV)).toBe("sv");
    expect(rolePriorityToRoleId(ROLE_PRIORITY.STAFF)).toBe("staff");
  });

  it("SUPER_OWNER(10 미만)도 owner 로 흡수", () => {
    expect(rolePriorityToRoleId(ROLE_PRIORITY.SUPER_OWNER)).toBe("owner");
  });

  it("구간 사이 값은 상위 경계로 올림 (11~20 → gm)", () => {
    expect(rolePriorityToRoleId(11)).toBe("gm");
    expect(rolePriorityToRoleId(21)).toBe("sv");
    expect(rolePriorityToRoleId(31)).toBe("staff");
    expect(rolePriorityToRoleId(99)).toBe("staff");
  });
});

// ── filterBulkUsers ─────────────────────────────────────

describe("filterBulkUsers — 그리드 행 필터", () => {
  const foh = user("foh1", { department: "FOH" });
  const boh = user("boh1", { department: "BOH" });
  const none = user("none1", { department: null });
  const undef = user("undef1"); // department 필드 자체가 없음
  const gm = user("gm1", { priority: ROLE_PRIORITY.GM, department: "FOH" });
  const all = [foh, boh, none, undef, gm];

  it("필터가 비어있으면 전원 통과", () => {
    expect(filterBulkUsers(all, NO_FILTERS)).toEqual(all);
  });

  it("department 단일 선택", () => {
    const result = filterBulkUsers(all, { ...NO_FILTERS, departments: ["FOH"] });
    expect(result.map((u) => u.id)).toEqual(["foh1", "gm1"]);
  });

  it("department 복수 선택은 OR", () => {
    const result = filterBulkUsers(all, { ...NO_FILTERS, departments: ["FOH", "BOH"] });
    expect(result.map((u) => u.id)).toEqual(["foh1", "boh1", "gm1"]);
  });

  it("unassigned 는 department null 과 undefined 를 모두 매칭", () => {
    const result = filterBulkUsers(all, { ...NO_FILTERS, departments: ["unassigned"] });
    expect(result.map((u) => u.id)).toEqual(["none1", "undef1"]);
  });

  it("unassigned + FOH 동시 선택", () => {
    const result = filterBulkUsers(all, { ...NO_FILTERS, departments: ["unassigned", "FOH"] });
    expect(result.map((u) => u.id)).toEqual(["foh1", "none1", "undef1", "gm1"]);
  });

  it("role 필터", () => {
    const result = filterBulkUsers(all, { ...NO_FILTERS, roles: ["gm"] });
    expect(result.map((u) => u.id)).toEqual(["gm1"]);
  });

  it("staffIds 필터", () => {
    const result = filterBulkUsers(all, { ...NO_FILTERS, staffIds: ["boh1", "none1"] });
    expect(result.map((u) => u.id)).toEqual(["boh1", "none1"]);
  });

  it("서로 다른 차원은 AND — FOH 이면서 staff 인 사람만", () => {
    const result = filterBulkUsers(all, { ...NO_FILTERS, departments: ["FOH"], roles: ["staff"] });
    expect(result.map((u) => u.id)).toEqual(["foh1"]); // gm1 은 FOH 지만 role 이 gm
  });

  it("교집합이 없으면 빈 배열", () => {
    const result = filterBulkUsers(all, { ...NO_FILTERS, departments: ["BOH"], roles: ["gm"] });
    expect(result).toEqual([]);
  });

  it("원본 배열을 변형하지 않음", () => {
    const input = [...all];
    filterBulkUsers(input, { ...NO_FILTERS, departments: ["FOH"] });
    expect(input).toEqual(all);
  });
});

// ── hasBulkRowFilters ───────────────────────────────────

describe("hasBulkRowFilters — 안내 문구 분기", () => {
  it("아무것도 없으면 false", () => {
    expect(hasBulkRowFilters(NO_FILTERS)).toBe(false);
  });

  it("행에 반영되는 차원이 하나라도 있으면 true", () => {
    expect(hasBulkRowFilters({ ...NO_FILTERS, departments: ["FOH"] })).toBe(true);
    expect(hasBulkRowFilters({ ...NO_FILTERS, roles: ["gm"] })).toBe(true);
    expect(hasBulkRowFilters({ ...NO_FILTERS, staffIds: ["u1"] })).toBe(true);
  });
});

// ── matchesBlockFilters ─────────────────────────────────

describe("matchesBlockFilters — 블록 단위 표시 여부", () => {
  const block = sched("s1", "u1", "confirmed", { position: "Cashier", workRole: "Morning" });

  it("필터가 비어있으면 통과", () => {
    expect(matchesBlockFilters(block, NO_BLOCK_FILTERS)).toBe(true);
  });

  it("status 매칭", () => {
    expect(matchesBlockFilters(block, { ...NO_BLOCK_FILTERS, statuses: ["confirmed"] })).toBe(true);
    expect(matchesBlockFilters(block, { ...NO_BLOCK_FILTERS, statuses: ["draft"] })).toBe(false);
    expect(matchesBlockFilters(block, { ...NO_BLOCK_FILTERS, statuses: ["draft", "confirmed"] })).toBe(true);
  });

  it("position 매칭", () => {
    expect(matchesBlockFilters(block, { ...NO_BLOCK_FILTERS, positions: ["Cashier"] })).toBe(true);
    expect(matchesBlockFilters(block, { ...NO_BLOCK_FILTERS, positions: ["Kitchen"] })).toBe(false);
  });

  it("work role 매칭", () => {
    expect(matchesBlockFilters(block, { ...NO_BLOCK_FILTERS, shifts: ["Morning"] })).toBe(true);
    expect(matchesBlockFilters(block, { ...NO_BLOCK_FILTERS, shifts: ["Night"] })).toBe(false);
  });

  it("차원이 여러 개면 AND", () => {
    expect(matchesBlockFilters(block, {
      statuses: ["confirmed"], positions: ["Cashier"], shifts: ["Morning"],
    })).toBe(true);
    expect(matchesBlockFilters(block, {
      statuses: ["confirmed"], positions: ["Cashier"], shifts: ["Night"],
    })).toBe(false);
  });

  it("position 이 없는 블록은 position 필터가 걸리면 숨는다", () => {
    const noPos = sched("s2", "u1", "confirmed", { position: null, workRole: "Morning" });
    expect(matchesBlockFilters(noPos, { ...NO_BLOCK_FILTERS, positions: ["Cashier"] })).toBe(false);
    expect(matchesBlockFilters(noPos, NO_BLOCK_FILTERS)).toBe(true);
  });

  it("work role 이 없는 블록은 work role 필터가 걸리면 숨는다", () => {
    const noRole = sched("s3", "u1", "confirmed", { position: "Cashier", workRole: null });
    expect(matchesBlockFilters(noRole, { ...NO_BLOCK_FILTERS, shifts: ["Morning"] })).toBe(false);
  });

  it("snapshot 이 우선, 없으면 현재 이름으로 fallback", () => {
    const snapshotOnly = { id: "s4", user_id: "u1", status: "confirmed",
      position_snapshot: null, work_role_name_snapshot: "Old Name", work_role_name: "New Name" } as Schedule;
    expect(matchesBlockFilters(snapshotOnly, { ...NO_BLOCK_FILTERS, shifts: ["Old Name"] })).toBe(true);
    expect(matchesBlockFilters(snapshotOnly, { ...NO_BLOCK_FILTERS, shifts: ["New Name"] })).toBe(false);

    const currentOnly = { id: "s5", user_id: "u1", status: "confirmed",
      position_snapshot: null, work_role_name_snapshot: null, work_role_name: "New Name" } as Schedule;
    expect(matchesBlockFilters(currentOnly, { ...NO_BLOCK_FILTERS, shifts: ["New Name"] })).toBe(true);
  });
});

describe("hasBulkBlockFilters", () => {
  it("비어있으면 false, 하나라도 있으면 true", () => {
    expect(hasBulkBlockFilters(NO_BLOCK_FILTERS)).toBe(false);
    expect(hasBulkBlockFilters({ ...NO_BLOCK_FILTERS, statuses: ["draft"] })).toBe(true);
    expect(hasBulkBlockFilters({ ...NO_BLOCK_FILTERS, positions: ["Cashier"] })).toBe(true);
    expect(hasBulkBlockFilters({ ...NO_BLOCK_FILTERS, shifts: ["Morning"] })).toBe(true);
  });
});

// ── selectCopyTargets ───────────────────────────────────

describe("selectCopyTargets — 주간 복사 대상 (보이는 것 / 가려진 것)", () => {
  it("보이는 직원 것과 가려진 직원 것을 나눠서 돌려준다", () => {
    const source = [
      sched("s1", "visible1"),
      sched("s2", "hidden1"),
      sched("s3", "visible2"),
      sched("s4", "hidden2"),
    ];
    const { visible, hidden } = selectCopyTargets(source, scopeOf(["visible1", "visible2"]));
    expect(visible.map((s) => s.id)).toEqual(["s1", "s3"]);
    expect(hidden.map((s) => s.id)).toEqual(["s2", "s4"]);
  });

  it("한 직원의 복수 스케줄을 모두 가져옴", () => {
    const source = [sched("s1", "u1"), sched("s2", "u1"), sched("s3", "u2")];
    const { visible, hidden } = selectCopyTargets(source, scopeOf(["u1"]));
    expect(visible.map((s) => s.id)).toEqual(["s1", "s2"]);
    expect(hidden.map((s) => s.id)).toEqual(["s3"]);
  });

  it("cancelled/deleted/rejected 는 어느 쪽에도 포함하지 않음", () => {
    const source = [
      sched("s1", "u1", "confirmed"),
      sched("s2", "u1", "cancelled"),
      sched("s3", "u1", "deleted"),
      sched("s4", "u1", "rejected"),
    ];
    const { visible, hidden } = selectCopyTargets(source, scopeOf(["u1"]));
    expect(visible.map((s) => s.id)).toEqual(["s1"]);
    expect(hidden).toEqual([]);
  });

  it("draft/requested 는 복사 대상", () => {
    const source = [sched("s1", "u1", "draft"), sched("s2", "u1", "requested")];
    const { visible } = selectCopyTargets(source, scopeOf(["u1"]));
    expect(visible.map((s) => s.id)).toEqual(["s1", "s2"]);
  });

  it("행은 보이지만 블록 필터에 걸리면 hidden 으로 간다", () => {
    const source = [
      sched("s1", "u1", "confirmed", { workRole: "Morning" }),
      sched("s2", "u1", "confirmed", { workRole: "Night" }),
    ];
    const { visible, hidden } = selectCopyTargets(
      source,
      scopeOf(["u1"], { ...NO_BLOCK_FILTERS, shifts: ["Morning"] }),
    );
    expect(visible.map((s) => s.id)).toEqual(["s1"]);
    expect(hidden.map((s) => s.id)).toEqual(["s2"]);
  });

  it("status 필터도 블록 단위로 적용된다", () => {
    const source = [sched("s1", "u1", "draft"), sched("s2", "u1", "confirmed")];
    const { visible, hidden } = selectCopyTargets(
      source,
      scopeOf(["u1"], { ...NO_BLOCK_FILTERS, statuses: ["confirmed"] }),
    );
    expect(visible.map((s) => s.id)).toEqual(["s2"]);
    expect(hidden.map((s) => s.id)).toEqual(["s1"]);
  });

  it("행 필터와 블록 필터 중 하나라도 걸리면 hidden", () => {
    const source = [
      sched("s1", "u1", "confirmed", { position: "Cashier" }), // 둘 다 통과
      sched("s2", "u1", "confirmed", { position: "Kitchen" }), // 블록에서 탈락
      sched("s3", "u2", "confirmed", { position: "Cashier" }), // 행에서 탈락
    ];
    const { visible, hidden } = selectCopyTargets(
      source,
      scopeOf(["u1"], { ...NO_BLOCK_FILTERS, positions: ["Cashier"] }),
    );
    expect(visible.map((s) => s.id)).toEqual(["s1"]);
    expect(hidden.map((s) => s.id)).toEqual(["s2", "s3"]);
  });

  it("전원이 가려지면 visible 빈 배열", () => {
    const source = [sched("s1", "u1"), sched("s2", "u2")];
    const { visible, hidden } = selectCopyTargets(source, scopeOf(["other"]));
    expect(visible).toEqual([]);
    expect(hidden).toHaveLength(2);
  });

  it("무효 status 만 있으면 양쪽 다 빈 배열 — '가려짐' 과 '없음' 을 구분", () => {
    const source = [sched("s1", "u1", "cancelled"), sched("s2", "u2", "deleted")];
    const { visible, hidden } = selectCopyTargets(source, scopeOf(["other"]));
    expect(visible).toEqual([]);
    expect(hidden).toEqual([]);
  });

  it("소스 주가 비어있으면 양쪽 다 빈 배열", () => {
    const { visible, hidden } = selectCopyTargets([], scopeOf(["u1"]));
    expect(visible).toEqual([]);
    expect(hidden).toEqual([]);
  });

  it("필터가 없으면 전부 visible", () => {
    const source = [sched("s1", "u1"), sched("s2", "u2")];
    const { visible, hidden } = selectCopyTargets(source, scopeOf(["u1", "u2"]));
    expect(visible).toHaveLength(2);
    expect(hidden).toEqual([]);
  });
});

// ── 통합: 필터 → 복사 대상 ──────────────────────────────

describe("filterBulkUsers → selectCopyTargets 연결", () => {
  it("BOH 필터를 걸면 BOH 직원 스케줄만 복사된다", () => {
    const users = [
      user("a", { department: "FOH" }),
      user("b", { department: "BOH" }),
      user("c", { department: null }),
    ];
    const shownUsers = filterBulkUsers(users, { ...NO_FILTERS, departments: ["BOH"] });
    const source = [sched("s1", "a"), sched("s2", "b"), sched("s3", "c"), sched("s4", "b")];

    const { visible, hidden } = selectCopyTargets(source, scopeOf(shownUsers.map((u) => u.id)));
    expect(visible.map((s) => s.id)).toEqual(["s2", "s4"]);
    expect(hidden.map((s) => s.id)).toEqual(["s1", "s3"]);
  });

  it("department + work role 을 같이 걸면 두 조건을 모두 만족하는 것만 남는다", () => {
    const users = [user("a", { department: "FOH" }), user("b", { department: "BOH" })];
    const shownUsers = filterBulkUsers(users, { ...NO_FILTERS, departments: ["FOH"] });
    const source = [
      sched("s1", "a", "confirmed", { workRole: "Morning" }), // FOH + Morning → 통과
      sched("s2", "a", "confirmed", { workRole: "Night" }),   // work role 탈락
      sched("s3", "b", "confirmed", { workRole: "Morning" }), // department 탈락
    ];

    const { visible, hidden } = selectCopyTargets(
      source,
      scopeOf(shownUsers.map((u) => u.id), { ...NO_BLOCK_FILTERS, shifts: ["Morning"] }),
    );
    expect(visible.map((s) => s.id)).toEqual(["s1"]);
    expect(hidden.map((s) => s.id)).toEqual(["s2", "s3"]);
  });
});
