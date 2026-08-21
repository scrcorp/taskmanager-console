/**
 * 고정 근무(Fixed Schedule) 패턴 API 타입 — 서버 `app/schemas/schedule_pattern.py` 와 1:1.
 *
 * 계약: docs/99_inbox/2026-08-20-고정근무-구현계약.md §4 (`/schedules/patterns`).
 *
 * 용어 — UI 는 `Fixed` ↔ `One-time`. 코드/DB 는 `pattern`. "flexible" 금지.
 * 요일 — `byday` 는 0=Sun .. 6=Sat (일요일 시작).
 * 시각 — "HH:MM" 문자열(store tz 벽시계), 5분 단위. 날짜 — "YYYY-MM-DD".
 */

import type { Schedule, ScheduleUpdate } from "./index";

/** 0=Sun .. 6=Sat */
export type Byday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

/** 설정창의 블록 1개 → `staff_work_patterns` 행 1개. start/until 은 그룹 공통값 override 일 때만. */
export interface PatternBlockIn {
  start_time: string;
  /** overnight(end < start) 허용 */
  end_time: string;
  break_start_time?: string | null;
  break_end_time?: string | null;
  work_role_id?: string | null;
  byday: number[];
  /** "Different period" 토글 — 없으면 PatternGroupIn 의 공통값 */
  start_date?: string | null;
  until_date?: string | null;
}

/** 저장된 블록 1개. `id` 가 곧 `pattern_id` (Schedule.pattern_id 와 같은 값). */
export interface PatternBlockOut {
  id: string;
  work_role_id: string | null;
  work_role_name: string | null;
  /** RFC 5545, v1 은 WEEKLY 만 */
  rrule: string;
  byday: number[];
  start_time: string;
  end_time: string;
  break_start_time: string | null;
  break_end_time: string | null;
  start_date: string;
  /** null = 무기한 */
  until_date: string | null;
}

/** ② 기존 그룹과 겹칠 때의 처리. 미지정이면 409 PATTERN_OVERLAP_EXISTING(후보 동봉). */
export type PatternOverlapGate = "move" | "replace";

/** 한 설정창 저장 = 그룹 1개. 생성(POST)과 전체 교체(PATCH) 모두 이 모양. */
export interface PatternGroupIn {
  user_id: string;
  store_id: string;
  start_date: string;
  /** null/생략 = 무기한 */
  until_date?: string | null;
  blocks: PatternBlockIn[];
  gate?: PatternOverlapGate | null;
}

/** 그룹 단위 응답. start/until 은 블록 전체의 min/max(무기한 블록이 있으면 null). */
export interface PatternGroupOut {
  group_id: string;
  user_id: string;
  user_name: string | null;
  store_id: string;
  store_name: string | null;
  start_date: string;
  until_date: string | null;
  blocks: PatternBlockOut[];
  created_at: string;
}

// ─── 에러 코드 (서버 error_codes 와 동일 문자열) ────────────
export const PATTERN_BLOCK_OVERLAP = "PATTERN_BLOCK_OVERLAP";
export const PATTERN_OVERLAP_EXISTING = "PATTERN_OVERLAP_EXISTING";
export const PATTERN_OUTSIDE_AVAILABILITY = "PATTERN_OUTSIDE_AVAILABILITY";
export const PATTERN_MOVE_INTO_PAST = "PATTERN_MOVE_INTO_PAST";
export const PATTERN_GROUP_STARTED = "PATTERN_GROUP_STARTED";
export const PATTERN_REVERT_NOT_OVERRIDDEN = "PATTERN_REVERT_NOT_OVERRIDDEN";

export type PatternErrorCode =
  | typeof PATTERN_BLOCK_OVERLAP
  | typeof PATTERN_OVERLAP_EXISTING
  | typeof PATTERN_OUTSIDE_AVAILABILITY
  | typeof PATTERN_MOVE_INTO_PAST
  | typeof PATTERN_GROUP_STARTED
  | typeof PATTERN_REVERT_NOT_OVERRIDDEN;

/**
 * 검증 항목 하나 — 문구는 클라가 code 로 구성한다.
 *  PATTERN_BLOCK_OVERLAP        params: { blocks: number[] (index), dow: number }
 *  PATTERN_OUTSIDE_AVAILABILITY params: { dow: number, block: number }
 */
export interface PatternIssue {
  code: string;
  params: Record<string, unknown>;
}

/** `POST /schedules/patterns/validate` — ①④ 는 errors, ② 는 overlaps(기존 그룹 후보). */
export interface PatternValidateOut {
  errors: PatternIssue[];
  overlaps: PatternGroupOut[];
}

/**
 * virtual 한 칸을 실 행으로 만든다 (`POST /schedules/patterns/{pattern_id}/occurrences/{date}`).
 *  edit   — 실체화 후 `patch` 적용(필수), `pattern_overridden=true`
 *  delete — 실체화 후 soft delete(`status='deleted'`), 슬롯 점유 유지(패턴이 다시 만들지 않음)
 */
export type OccurrenceActionIn =
  | { action: "edit"; patch: ScheduleUpdate }
  | { action: "delete"; patch?: null };

/** 그룹 전체 기간을 `delta_days` 만큼 옮긴다(음수 = 앞당김). 시작 전 그룹만. */
export interface MoveGroupIn {
  delta_days: number;
}

/** GET /schedules/patterns 쿼리 */
export interface PatternListFilters {
  user_id?: string;
  store_id?: string;
  /** 종료된 그룹 포함 */
  include_ended?: boolean;
}

// ─── virtual id 헬퍼 ────────────────────────────────────
export const VIRTUAL_ID_PREFIX = "virtual:";

/** 응답 전용 virtual 행인가 (`id` 가 `virtual:` 접두어). */
export function isVirtualSchedule(s: Pick<Schedule, "id"> | null | undefined): boolean {
  return !!s && s.id.startsWith(VIRTUAL_ID_PREFIX);
}

/**
 * `virtual:<pattern_id>:<date>` → { patternId, date }. virtual 이 아니면 null.
 * pattern_id 는 UUID(콜론 없음)라 마지막 콜론으로 자른다.
 */
export function parseVirtualId(id: string): { patternId: string; date: string } | null {
  if (!id.startsWith(VIRTUAL_ID_PREFIX)) return null;
  const rest = id.slice(VIRTUAL_ID_PREFIX.length);
  const cut = rest.lastIndexOf(":");
  if (cut <= 0) return null;
  const patternId = rest.slice(0, cut);
  const date = rest.slice(cut + 1);
  if (!patternId || !date) return null;
  return { patternId, date };
}
