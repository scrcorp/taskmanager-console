/**
 * 간소화 콘솔 통합 Day 화면의 행 모델.
 *
 * 스케줄(계획)과 근태(실제)를 한 행으로 합친다. 탭을 나눠 놓으면 매니저가
 * "예정은 9시인데 실제로 몇 시에 왔지" 를 두 화면을 오가며 맞춰봐야 하는데,
 * 그게 폰에서 제일 불편한 동작이었다.
 *
 * 여기 있는 것은 전부 순수 함수다 — 그룹 판정/정렬/검색은 화면 없이 검증할 수 있어야 한다.
 */

import { hasIssue } from "./compactAttendance";
import type { Attendance, Schedule } from "@/types";

/** 행이 속하는 묶음. 배열 순서가 곧 화면 표시 순서다. */
export const DAY_GROUPS = ["now", "attention", "upcoming", "done", "cancelled"] as const;
export type DayGroup = (typeof DAY_GROUPS)[number];

export const DAY_GROUP_LABEL: Record<DayGroup, string> = {
  now: "Now — working",
  attention: "Needs attention",
  upcoming: "Upcoming",
  done: "Done",
  cancelled: "Cancelled",
};

export type DaySort = "default" | "time" | "name";

export interface DayRow {
  /** React key. 스케줄이 있으면 스케줄 id, 워크인이면 근태 id. */
  key: string;
  schedule: Schedule | null;
  attendance: Attendance | null;
  userName: string;
  roleName: string;
  group: DayGroup;
  /** 그룹 안 정렬 기준 (분). 값이 없으면 맨 뒤로. */
  sortMinutes: number;
  /** 카드에 한 줄로 띄울 경고. 첫 항목만 표시한다. */
  issues: string[];
}

const NO_TIME = 99_999;

/** "HH:MM" → 분. 형식이 아니면 NO_TIME. */
function toMinutes(hhmm: string | null | undefined): number {
  if (!hhmm || !/^\d{2}:\d{2}/.test(hhmm)) return NO_TIME;
  return Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
}

/** 벽시계 datetime "YYYY-MM-DDTHH:MM" 에서 "HH:MM" 만. */
export function wallClock(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const hhmm = iso.slice(11, 16);
  return /^\d{2}:\d{2}$/.test(hhmm) ? hhmm : null;
}

/** 지금 근무 중인 상태. `late` 도 출근해서 일하는 중이라 여기 포함된다. */
function isOnTheClock(status: string): boolean {
  return status === "working" || status === "on_break" || status === "late";
}

/**
 * 근무가 이미 끝났어야 하는 시점인가.
 *
 * `now` 는 매장 시간대의 벽시계 "YYYY-MM-DDTHH:MM" — 스케줄 start_at/end_at 과 같은 축이라
 * 문자열 비교로 그대로 잰다 (Date 로 파싱하면 브라우저 tz 가 끼어든다).
 *
 * 스케줄이 없는 워크인은 잴 종료 시각이 없으므로 영업일이 지났는지로 본다.
 */
function shiftEnded(schedule: Schedule | null, attendance: Attendance | null, now: string): boolean {
  if (schedule) {
    const end = schedule.end_at
      ?? (schedule.end_time
        ? `${endDateOf(schedule)}T${schedule.end_time.slice(0, 5)}`
        : null);
    if (end) return end.slice(0, 16) <= now;
  }
  const day = schedule?.operating_day ?? schedule?.work_date ?? attendance?.work_date;
  return !!day && day < now.slice(0, 10);
}

/** end_at 이 없는 레거시 행의 종료 날짜 — 자정을 넘는 근무는 다음 날로 넘긴다. */
function endDateOf(schedule: Schedule): string {
  const base = schedule.work_date ?? schedule.operating_day ?? "";
  const start = (schedule.start_time ?? "").slice(0, 5);
  const end = (schedule.end_time ?? "").slice(0, 5);
  if (!base || !start || !end || end > start) return base;
  const [y, m, d] = base.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10);
}

/** 스케줄이 살아있지 않은 상태 (취소/거절/삭제). */
function isDeadSchedule(schedule: Schedule | null): boolean {
  if (!schedule) return false;
  return (
    schedule.status === "cancelled"
    || schedule.status === "rejected"
    || schedule.status === "deleted"
  );
}

/**
 * 카드에 띄울 경고 문구들.
 *
 * 상태 배지와 같은 말을 반복하지 않는다 — 좁은 폭에서 정보량이 늘지 않으면서 자리만 먹는다.
 */
export function rowIssues(
  schedule: Schedule | null,
  attendance: Attendance | null,
  now: string,
): string[] {
  if (!attendance) return [];
  if (attendance.status === "cancelled") return [];

  const issues: string[] = [];

  if (attendance.status === "no_show") {
    issues.push("no clock-in");
  }
  // 근무가 끝난 뒤에도 퇴근 기록이 없는 경우 — 자동퇴근이 돌기 전까지 방치되기 쉽다.
  // 아직 근무 중(late 포함)인 건은 정상이므로 세지 않는다.
  //
  // 종료 시각 전이면 세지 않는다: 매니저가 Edit 으로 출근 시각만 보정하면 서버 상태는
  // upcoming 그대로라(상태 불변 보정) 근무가 시작도 안 한 건에 "no clock-out" 이 붙는다.
  if (
    attendance.clock_in
    && !attendance.clock_out
    && !isOnTheClock(attendance.status)
    && shiftEnded(schedule, attendance, now)
  ) {
    issues.push("no clock-out");
  }
  if (
    (attendance.anomalies ?? []).includes("early_clock_in_override")
    && !attendance.early_clock_in_confirmed_at
  ) {
    issues.push("early clock-in not confirmed");
  }
  if (
    (attendance.anomalies ?? []).includes("auto_clocked_out")
    && !attendance.auto_clock_out_confirmed_at
  ) {
    issues.push("auto clock-out not confirmed");
  }

  for (const a of attendance.anomalies ?? []) {
    if (a === attendance.status) continue; // 배지와 중복
    // 확인 여부로 갈리는 두 가지는 위에서 이미 문장으로 처리했다. 여기서 다시 넣으면
    // 확인을 마친 기록이 영원히 경고를 달고 있게 된다.
    if (a === "early_clock_in_override" || a === "auto_clocked_out") continue;
    issues.push(a.replace(/_/g, " "));
  }

  return issues;
}

/**
 * 그룹 판정. 순서가 곧 우선순위다.
 *
 * 근무 중인 사람은 지각이었더라도 "Now" 에 둔다 — 지금 매장에 있는 사람 목록이
 * 먼저 보여야 하고, 지각 사실은 카드의 경고 줄이 이미 말해준다.
 */
export function rowGroup(
  schedule: Schedule | null,
  attendance: Attendance | null,
  issues: string[],
): DayGroup {
  if (isDeadSchedule(schedule) || attendance?.status === "cancelled") return "cancelled";
  if (attendance && isOnTheClock(attendance.status)) return "now";
  if (issues.length > 0) return "attention";
  if (attendance?.status === "clocked_out") return "done";
  return "upcoming";
}

/**
 * 스케줄 목록 + 근태 목록 → 한 화면용 행 목록.
 *
 * 짝은 `attendance.schedule_id` 로 맞춘다. 스케줄 없는 근태(워크인)도 행으로 남긴다 —
 * 목록에서 빠지면 그날 매장에 있던 사람이 통째로 안 보인다.
 */
export function buildDayRows(
  schedules: Schedule[],
  attendances: Attendance[],
  /** 매장 시간대의 지금 — 벽시계 "YYYY-MM-DDTHH:MM". 근무 종료 판정에 쓴다. */
  now: string,
): DayRow[] {
  const byScheduleId = new Map<string, Attendance>();
  const orphans: Attendance[] = [];
  for (const a of attendances) {
    if (a.schedule_id) byScheduleId.set(a.schedule_id, a);
    else orphans.push(a);
  }

  const rows: DayRow[] = schedules.map((schedule) => {
    const attendance = byScheduleId.get(schedule.id) ?? null;
    const issues = rowIssues(schedule, attendance, now);
    return {
      key: schedule.id,
      schedule,
      attendance,
      userName: schedule.user_name ?? attendance?.user_name ?? "Unassigned",
      roleName: schedule.work_role_name_snapshot ?? schedule.work_role_name ?? "",
      group: rowGroup(schedule, attendance, issues),
      sortMinutes: toMinutes(wallClock(schedule.start_at) ?? schedule.start_time),
      issues,
    };
  });

  for (const attendance of orphans) {
    const issues = rowIssues(null, attendance, now);
    rows.push({
      key: attendance.id,
      schedule: null,
      attendance,
      userName: attendance.user_name ?? "Unknown",
      roleName: "",
      group: rowGroup(null, attendance, issues),
      sortMinutes: toMinutes(attendance.clock_in_display),
      issues,
    });
  }

  return rows;
}

/** 이름·역할 부분일치 (대소문자 무시). 빈 질의는 전체 통과. */
export function matchesQuery(row: DayRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return `${row.userName} ${row.roleName}`.toLowerCase().includes(q);
}

export interface DayFilters {
  query: string;
  issuesOnly: boolean;
  showCancelled: boolean;
  roles: string[];
}

export const EMPTY_DAY_FILTERS: DayFilters = {
  query: "",
  issuesOnly: false,
  showCancelled: false,
  roles: [],
};

export function filterRows(rows: DayRow[], filters: DayFilters): DayRow[] {
  return rows.filter((row) => {
    if (!filters.showCancelled && row.group === "cancelled") return false;
    if (filters.issuesOnly && row.issues.length === 0) return false;
    if (filters.roles.length > 0 && !filters.roles.includes(row.roleName)) return false;
    return matchesQuery(row, filters.query);
  });
}

function byTimeThenName(a: DayRow, b: DayRow): number {
  if (a.sortMinutes !== b.sortMinutes) return a.sortMinutes - b.sortMinutes;
  return a.userName.localeCompare(b.userName);
}

export interface DaySection {
  group: DayGroup;
  label: string;
  rows: DayRow[];
}

/**
 * 화면에 그릴 섹션 목록.
 *
 * 기본 정렬은 그룹 순서(근무중 → 확인필요 → 예정 → 종료 → 취소). 끝난 근무가 위에
 * 쌓여서 지금 매장에 누가 있는지 스크롤해야 알던 게 원래 불만이었다.
 */
export function sectionsFor(rows: DayRow[], sort: DaySort): DaySection[] {
  if (sort !== "default") {
    const sorted = [...rows].sort(
      sort === "name" ? (a, b) => a.userName.localeCompare(b.userName) : byTimeThenName,
    );
    return sorted.length
      ? [{ group: "now", label: sort === "name" ? "By name" : "By start time", rows: sorted }]
      : [];
  }
  return DAY_GROUPS.map((group) => ({
    group,
    label: DAY_GROUP_LABEL[group],
    rows: rows.filter((r) => r.group === group).sort(byTimeThenName),
  })).filter((s) => s.rows.length > 0);
}

/** 필터 칩으로 띄울 역할 목록 (중복 제거 + 사전순). */
export function availableRoles(rows: DayRow[]): string[] {
  return [...new Set(rows.map((r) => r.roleName).filter(Boolean))].sort();
}
