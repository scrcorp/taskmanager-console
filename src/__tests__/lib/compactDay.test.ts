import { describe, it, expect } from "vitest";
import {
  availableRoles,
  buildDayRows as buildDayRowsAt,
  EMPTY_DAY_FILTERS,
  filterRows,
  matchesQuery,
  rowGroup,
  rowIssues as rowIssuesAt,
  sectionsFor,
  wallClock,
  type DayRow,
} from "@/lib/compactDay";
import type { Attendance, Schedule } from "@/types";

/** 기본 "지금" 은 근무가 다 끝난 그날 밤. 종료 전 판정이 쟁점인 테스트만 직접 넘긴다. */
const AFTER_SHIFT = "2026-08-09T23:59";

const buildDayRows = (
  schedules: Schedule[],
  attendances: Attendance[],
  now: string = AFTER_SHIFT,
): DayRow[] => buildDayRowsAt(schedules, attendances, now);

const rowIssues = (
  schedule: Schedule | null,
  attendance: Attendance | null,
  now: string = AFTER_SHIFT,
): string[] => rowIssuesAt(schedule, attendance, now);

function sched(overrides: Partial<Schedule>): Schedule {
  return {
    id: "s1",
    user_id: "u1",
    user_name: "Maria Gonzalez",
    work_date: "2026-08-09",
    operating_day: "2026-08-09",
    start_at: "2026-08-09T09:00",
    end_at: "2026-08-09T17:00",
    start_time: "09:00",
    end_time: "17:00",
    work_role_name: "Server",
    work_role_name_snapshot: null,
    status: "confirmed",
    ...overrides,
  } as Schedule;
}

function att(overrides: Partial<Attendance>): Attendance {
  return {
    id: "a1",
    user_id: "u1",
    user_name: "Maria Gonzalez",
    schedule_id: "s1",
    work_date: "2026-08-09",
    clock_in: null,
    clock_out: null,
    status: "upcoming",
    anomalies: null,
    breaks: [],
    ...overrides,
  } as Attendance;
}

describe("wallClock", () => {
  it("reads HH:MM straight off the wall-clock string", () => {
    expect(wallClock("2026-08-09T17:30")).toBe("17:30");
  });

  it("returns null rather than guessing when the shape is wrong", () => {
    expect(wallClock(null)).toBeNull();
    expect(wallClock("2026-08-09")).toBeNull();
  });
});

describe("buildDayRows", () => {
  it("pairs an attendance with its schedule", () => {
    const rows = buildDayRows([sched({})], [att({ status: "working", clock_in: "x" })]);
    expect(rows).toHaveLength(1);
    expect(rows[0].schedule?.id).toBe("s1");
    expect(rows[0].attendance?.id).toBe("a1");
  });

  it("keeps attendance without a schedule as its own row", () => {
    // 워크인이 목록에서 빠지면 그날 매장에 있던 사람이 통째로 안 보인다.
    const rows = buildDayRows([], [att({ id: "a2", schedule_id: null, status: "working" })]);
    expect(rows).toHaveLength(1);
    expect(rows[0].schedule).toBeNull();
    expect(rows[0].key).toBe("a2");
  });

  it("keeps a schedule with no attendance row", () => {
    const rows = buildDayRows([sched({})], []);
    expect(rows[0].attendance).toBeNull();
    expect(rows[0].group).toBe("upcoming");
  });

  it("sorts by scheduled start, falling back to the clock-in for walk-ins", () => {
    const rows = buildDayRows(
      [sched({ id: "s2", start_at: "2026-08-09T14:00" })],
      [att({ id: "a3", schedule_id: null, clock_in_display: "07:15" })],
    );
    const walkIn = rows.find((r) => r.key === "a3");
    const scheduled = rows.find((r) => r.key === "s2");
    expect(walkIn!.sortMinutes).toBeLessThan(scheduled!.sortMinutes);
  });
});

describe("rowIssues", () => {
  it("flags a missing clock-in", () => {
    expect(rowIssues(sched({}), att({ status: "no_show" }))).toContain("no clock-in");
  });

  it("flags a clock-in with no clock-out once the shift is no longer active", () => {
    const issues = rowIssues(sched({}), att({ clock_in: "x", status: "clocked_out", clock_out: null }));
    expect(issues).toContain("no clock-out");
  });

  it("does not call an in-progress shift a missing clock-out", () => {
    const issues = rowIssues(sched({}), att({ clock_in: "x", status: "working" }));
    expect(issues).not.toContain("no clock-out");
  });

  it("stays quiet before the shift ends, even with a clock-in and no clock-out", () => {
    // Edit 으로 출근 시각만 보정하면 서버 상태는 upcoming 그대로다 (상태 불변 보정).
    // 근무가 시작도 안 한 건에 "no clock-out" 이 붙던 게 실제 오류였다.
    const issues = rowIssues(
      sched({ start_at: "2026-08-09T21:00", end_at: "2026-08-09T23:00" }),
      att({ clock_in: "x", status: "upcoming" }),
      "2026-08-09T20:55",
    );
    expect(issues).toEqual([]);
  });

  it("flags it once the scheduled end has passed", () => {
    const issues = rowIssues(
      sched({ start_at: "2026-08-09T21:00", end_at: "2026-08-09T23:00" }),
      att({ clock_in: "x", status: "upcoming" }),
      "2026-08-09T23:30",
    );
    expect(issues).toContain("no clock-out");
  });

  it("carries the end past midnight for an overnight shift", () => {
    const overnight = sched({
      start_at: "2026-08-09T21:00",
      end_at: "2026-08-10T02:00",
      start_time: "21:00",
      end_time: "02:00",
    });
    expect(rowIssues(overnight, att({ clock_in: "x", status: "upcoming" }), "2026-08-10T01:00"))
      .toEqual([]);
    expect(rowIssues(overnight, att({ clock_in: "x", status: "upcoming" }), "2026-08-10T02:30"))
      .toContain("no clock-out");
  });

  it("falls back to the operating day for a walk-in with no schedule", () => {
    const walkIn = att({ schedule_id: null, clock_in: "x", status: "upcoming" });
    expect(rowIssues(null, walkIn, "2026-08-09T22:00")).toEqual([]);
    expect(rowIssues(null, walkIn, "2026-08-10T09:00")).toContain("no clock-out");
  });

  it("flags unconfirmed early clock-in but not a confirmed one", () => {
    const unconfirmed = rowIssues(
      sched({}),
      att({ clock_in: "x", status: "working", anomalies: ["early_clock_in_override"] }),
    );
    expect(unconfirmed).toContain("early clock-in not confirmed");

    const confirmed = rowIssues(
      sched({}),
      att({
        clock_in: "x",
        status: "working",
        anomalies: ["early_clock_in_override"],
        early_clock_in_confirmed_at: "2026-08-09T10:00:00Z",
      }),
    );
    expect(confirmed).toHaveLength(0);
  });

  it("stays silent on cancelled records — there is nothing to act on", () => {
    expect(rowIssues(sched({}), att({ status: "cancelled", anomalies: ["late"] }))).toEqual([]);
  });

  it("spells out an overlapping clock-in instead of dumping the raw code", () => {
    // 폰 카드에서 `overlapping clock in` 은 무슨 뜻인지 안 통한다 — 사실을 쓴다.
    const issues = rowIssues(
      sched({}),
      att({ clock_in: "x", status: "working", anomalies: ["overlapping_clock_in"] }),
    );
    expect(issues).toContain("two shifts open at once");
    expect(issues).not.toContain("overlapping clock in");
  });

  it("routes an overlapping record to attention even while it is on the clock", () => {
    // 겹침은 급여 이중 지급 직전이라 "지금 근무 중" 보다 먼저 눈에 띄어야 하지만,
    // 근무 중인 사람은 Now 에 남는다는 기존 규칙은 유지된다 — 경고 줄이 그 일을 한다.
    const a = att({ clock_in: "x", status: "working", anomalies: ["overlapping_clock_in"] });
    const issues = rowIssues(sched({}), a);
    expect(rowGroup(sched({}), a, issues)).toBe("now");
    expect(issues.length).toBeGreaterThan(0);
  });
});

describe("rowGroup", () => {
  it("puts someone who is on the clock in Now even if they were late", () => {
    // 지금 매장에 누가 있는지가 먼저 보여야 한다. 지각 사실은 카드 경고 줄이 말해준다.
    expect(rowGroup(sched({}), att({ status: "working" }), ["late"])).toBe("now");
    expect(rowGroup(sched({}), att({ status: "on_break" }), [])).toBe("now");
  });

  it("routes records with issues to attention", () => {
    expect(rowGroup(sched({}), att({ status: "no_show" }), ["no clock-in"])).toBe("attention");
  });

  it("treats a dead schedule as cancelled regardless of the attendance", () => {
    expect(rowGroup(sched({ status: "cancelled" }), att({ status: "working" }), [])).toBe("cancelled");
    expect(rowGroup(sched({ status: "rejected" }), null, [])).toBe("cancelled");
  });

  it("separates finished from upcoming", () => {
    expect(rowGroup(sched({}), att({ status: "clocked_out" }), [])).toBe("done");
    expect(rowGroup(sched({}), att({ status: "upcoming" }), [])).toBe("upcoming");
  });
});

describe("filterRows", () => {
  const rows = buildDayRows(
    [
      sched({ id: "s1", user_name: "Maria Gonzalez", work_role_name: "Server" }),
      sched({ id: "s2", user_name: "James Park", work_role_name: "Kitchen" }),
      sched({ id: "s3", user_name: "Ethan Cole", work_role_name: "Kitchen", status: "cancelled" }),
    ],
    [att({ id: "a2", schedule_id: "s2", status: "no_show" })],
  );

  it("hides cancelled records by default", () => {
    const visible = filterRows(rows, EMPTY_DAY_FILTERS);
    expect(visible.map((r) => r.key)).not.toContain("s3");
  });

  it("shows cancelled when asked", () => {
    const visible = filterRows(rows, { ...EMPTY_DAY_FILTERS, showCancelled: true });
    expect(visible.map((r) => r.key)).toContain("s3");
  });

  it("narrows to records that need attention", () => {
    const visible = filterRows(rows, { ...EMPTY_DAY_FILTERS, issuesOnly: true });
    expect(visible.map((r) => r.key)).toEqual(["s2"]);
  });

  it("narrows by role", () => {
    const visible = filterRows(rows, { ...EMPTY_DAY_FILTERS, roles: ["Server"] });
    expect(visible.map((r) => r.key)).toEqual(["s1"]);
  });

  it("searches name and role, ignoring case", () => {
    expect(filterRows(rows, { ...EMPTY_DAY_FILTERS, query: "gonz" }).map((r) => r.key)).toEqual(["s1"]);
    expect(filterRows(rows, { ...EMPTY_DAY_FILTERS, query: "KITCHEN" }).map((r) => r.key)).toEqual(["s2"]);
  });
});

describe("matchesQuery", () => {
  const row = { userName: "Sofia Martinez", roleName: "Host" } as DayRow;

  it("passes everything on an empty query", () => {
    expect(matchesQuery(row, "   ")).toBe(true);
  });

  it("matches on a partial role", () => {
    expect(matchesQuery(row, "hos")).toBe(true);
    expect(matchesQuery(row, "bartender")).toBe(false);
  });
});

describe("sectionsFor", () => {
  const rows = buildDayRows(
    [
      sched({ id: "s1", start_at: "2026-08-09T09:00" }),
      sched({ id: "s2", user_name: "Aaron Blake", start_at: "2026-08-09T07:00" }),
    ],
    [att({ id: "a1", schedule_id: "s1", status: "working" })],
  );

  it("groups by state with working first", () => {
    const sections = sectionsFor(rows, "default");
    expect(sections[0].group).toBe("now");
    expect(sections[0].rows.map((r) => r.key)).toEqual(["s1"]);
    expect(sections[1].group).toBe("upcoming");
  });

  it("drops empty groups", () => {
    const sections = sectionsFor(rows, "default");
    expect(sections.map((s) => s.group)).not.toContain("cancelled");
  });

  it("collapses to a single flat section for time and name sorts", () => {
    const byTime = sectionsFor(rows, "time");
    expect(byTime).toHaveLength(1);
    expect(byTime[0].rows.map((r) => r.key)).toEqual(["s2", "s1"]);

    const byName = sectionsFor(rows, "name");
    expect(byName[0].rows.map((r) => r.userName)).toEqual(["Aaron Blake", "Maria Gonzalez"]);
  });

  it("returns nothing when there are no rows", () => {
    expect(sectionsFor([], "time")).toEqual([]);
  });
});

describe("availableRoles", () => {
  it("lists each role once, sorted, skipping blanks", () => {
    const rows = buildDayRows(
      [
        sched({ id: "s1", work_role_name: "Server" }),
        sched({ id: "s2", work_role_name: "Kitchen" }),
        sched({ id: "s3", work_role_name: "Server" }),
        sched({ id: "s4", work_role_name: null }),
      ],
      [],
    );
    expect(availableRoles(rows)).toEqual(["Kitchen", "Server"]);
  });
});
