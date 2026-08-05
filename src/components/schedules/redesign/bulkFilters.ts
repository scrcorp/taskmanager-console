/**
 * 벌크 모드 필터링용 순수 헬퍼 — 컴포넌트에서 분리하여 단위 테스트 가능하게 함.
 *
 * 필터는 두 층위로 나뉜다:
 *  - 행(row) 필터 — staff / role / department. 직원 속성 → 행 자체가 사라짐.
 *  - 블록(block) 필터 — status / position / work role. 스케줄 속성 → 행은 남고 블록만 사라짐.
 * 두 층위 모두 "화면에 보이느냐"를 결정하므로 복사/붙여넣기 대상 판정도 동일 기준을 쓴다.
 * (calendar view 의 filteredUsers + getSchedulesForCell 과 같은 규칙)
 */

import type { Schedule, User } from "@/types";
import type { FilterState } from "./FilterBar";
import { ROLE_PRIORITY } from "@/lib/permissions";

/** 벌크 뷰가 행 표시에 반영하는 필터 차원. status/position/work role 은 블록 속성이라 미적용. */
export type BulkRowFilters = Pick<FilterState, "staffIds" | "roles" | "departments">;

/** role priority → FilterBar 의 role 옵션 id (소문자). */
export function rolePriorityToRoleId(p: number): string {
  if (p <= ROLE_PRIORITY.OWNER) return "owner";
  if (p <= ROLE_PRIORITY.GM) return "gm";
  if (p <= ROLE_PRIORITY.SV) return "sv";
  return "staff";
}

/**
 * 벌크 그리드에 행으로 보일 직원 목록.
 * department 는 user 속성 — 미지정(null/undefined)은 "unassigned" 로 매칭 (calendar view 와 동일 규칙).
 * 각 차원은 AND, 차원 내 값은 OR.
 */
export function filterBulkUsers(users: User[], filters: BulkRowFilters): User[] {
  let result = users;
  if (filters.staffIds.length > 0) {
    result = result.filter((u) => filters.staffIds.includes(u.id));
  }
  if (filters.roles.length > 0) {
    result = result.filter((u) => filters.roles.includes(rolePriorityToRoleId(u.role_priority)));
  }
  if (filters.departments.length > 0) {
    result = result.filter((u) => filters.departments.includes(u.department ?? "unassigned"));
  }
  return result;
}

/** 행 표시에 실제 반영되는 필터가 하나라도 걸려 있는지 (안내 문구 분기용). */
export function hasBulkRowFilters(filters: BulkRowFilters): boolean {
  return filters.staffIds.length + filters.roles.length + filters.departments.length > 0;
}

// ── 블록(스케줄) 단위 필터 ───────────────────────────────

/** 블록 표시 여부를 결정하는 필터 차원. 직원이 아니라 스케줄 자체의 속성. */
export type BulkBlockFilters = Pick<FilterState, "statuses" | "positions" | "shifts">;

/**
 * 이 스케줄 블록이 현재 필터에서 보이는지.
 * calendar view 의 getSchedulesForCell 과 동일 규칙 — 각 차원 AND, 차원 내 값은 OR.
 * position/work role 이 비어있는(null) 블록은 해당 필터가 걸리면 숨는다.
 */
export function matchesBlockFilters(s: Schedule, filters: BulkBlockFilters): boolean {
  if (filters.statuses.length > 0 && !filters.statuses.includes(s.status)) return false;
  if (filters.positions.length > 0 && !(s.position_snapshot && filters.positions.includes(s.position_snapshot))) {
    return false;
  }
  if (filters.shifts.length > 0) {
    const name = s.work_role_name_snapshot || s.work_role_name;
    if (!name || !filters.shifts.includes(name)) return false;
  }
  return true;
}

/** 블록을 숨기는 필터가 하나라도 걸려 있는지. */
export function hasBulkBlockFilters(filters: BulkBlockFilters): boolean {
  return filters.statuses.length + filters.positions.length + filters.shifts.length > 0;
}

// ── 복사 대상 선정 ──────────────────────────────────────

/** 주간 복사 대상에서 항상 제외하는 status — 이미 무효한 스케줄. */
const COPY_EXCLUDED_STATUSES = new Set(["cancelled", "deleted", "rejected"]);

/** 복사/붙여넣기 대상 판정에 쓰는 "지금 화면에 보이는 것" 기준. */
export interface VisibilityScope {
  /** 행이 보이는 직원 id */
  visibleUserIds: Set<string>;
  /** 블록 단위 필터 (status/position/work role) */
  blockFilters: BulkBlockFilters;
}

/**
 * 주간 복사(Copy from week) 대상 선정.
 *
 * 필터로 숨겨진 것은 붙여넣어도 그리드에 나타나지 않는다 (행이 없거나 블록이 숨겨짐).
 * 그래서 "보이는 것"과 "그 외"를 나눠서 돌려주고, 어느 쪽을 넣을지는 호출 측이 사용자에게 묻는다.
 *
 * @returns visible 보이는 대상, hidden 필터로 가려진 대상 (무효 status 는 어느 쪽에도 없음)
 */
export function selectCopyTargets(
  sourceSchedules: Schedule[],
  scope: VisibilityScope,
): { visible: Schedule[]; hidden: Schedule[] } {
  const alive = sourceSchedules.filter((s) => !COPY_EXCLUDED_STATUSES.has(s.status));
  const visible: Schedule[] = [];
  const hidden: Schedule[] = [];
  for (const s of alive) {
    const shown = scope.visibleUserIds.has(s.user_id) && matchesBlockFilters(s, scope.blockFilters);
    (shown ? visible : hidden).push(s);
  }
  return { visible, hidden };
}
