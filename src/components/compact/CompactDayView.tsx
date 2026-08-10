"use client";

/**
 * 간소화 콘솔 메인 — 스케줄(계획) + 근태(실제) 통합 Day 화면.
 *
 * 탭을 나눴던 초기판에서 두 가지가 계속 걸렸다: 탭을 옮기면 매장/날짜 선택이 풀렸고,
 * 계획과 실제를 맞춰보려면 화면을 오가야 했다. 화면을 하나로 합치면 둘 다 사라진다 —
 * 선택기가 하나뿐이라 풀릴 자리가 없고, 한 행에 두 값이 같이 있다.
 *
 * 한 주치를 한 번에 받아 스트립 숫자와 그날 목록을 함께 만든다 (요청 2회: 스케줄/근태).
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Search, X } from "lucide-react";
import { useSchedules } from "@/hooks/useSchedules";
import { useAttendances } from "@/hooks/useAttendances";
import { usePersistedFilters } from "@/hooks/usePersistedFilters";
import { usePermissions } from "@/hooks/usePermissions";
import { useStoreTimezone } from "@/hooks/useTimezone";
import { useModal } from "@/components/ui/imperative-modal";
import { PERMISSIONS } from "@/lib/permissions";
import { COMPACT_DAY_KEY, COMPACT_FILTER_KEY } from "@/lib/compact";
import { addDay } from "@/lib/scheduleTime";
import { formatDayLabel, WEEKDAY_LABELS, weekDays } from "@/lib/compactWeek";
import {
  availableRoles,
  buildDayRows,
  EMPTY_DAY_FILTERS,
  filterRows,
  sectionsFor,
  type DayFilters,
  type DayRow,
  type DaySort,
} from "@/lib/compactDay";
import { cn, isoToLocalInputInTz, todayInTimezone } from "@/lib/utils";
import { CompactDayCard } from "./CompactDayCard";
import { CompactDayFilterBar } from "./CompactDayFilterBar";
import { CompactEntryDetail } from "./CompactEntryDetail";
import { CompactScheduleForm } from "./CompactScheduleForm";

export function CompactDayView() {
  const modal = useModal();
  const { hasPermission } = usePermissions();

  const [storeParams] = usePersistedFilters(COMPACT_FILTER_KEY, { store: "" });
  // 시간대는 조직이 아니라 선택한 매장 것을 쓴다 — 서버가 매장 시간대로 표시하므로
  // 조직 것을 쓰면 시간대가 다른 매장에서 오늘 날짜와 시각이 통째로 어긋난다.
  const tz = useStoreTimezone(storeParams.store);
  const today = todayInTimezone(tz);
  // 날짜는 스케줄/근태로 나누지 않고 하나만 둔다 — 화면이 하나이므로 나눌 이유가 없고,
  // 나눠 두면 탭 시절처럼 "옮겼더니 날짜가 다르다" 가 재발한다.
  const [params, setParams] = usePersistedFilters(
    COMPACT_DAY_KEY,
    { date: today },
    // 날짜는 세션 안에서만 유지한다 (URL). 다음에 새로 열면 오늘부터 —
    // 어제 보던 날짜로 앱이 열리면 오늘 현황을 놓친다.
    { transient: ["date"] },
  );
  const selectedDate = params.date || today;
  const storeId = storeParams.store;

  // URL 에 남은 날짜는 화면을 새로 열 때 오늘로 되돌린다.
  //
  // 날짜를 URL 에만 둔 건 "다음에 열면 오늘부터" 를 노린 것이었는데, 어제 보던 URL 을 다시
  // 열거나 탭을 켜둔 채 새로고침하면 어제가 그대로 떠서 오늘 매장이 텅 빈 것처럼 보였다.
  // 화면 안에서 직접 고른 날짜는 그대로 둔다 — 그건 방금 사람이 한 선택이다.
  const datePicked = useRef(false);
  const pickDate = (date: string) => {
    datePicked.current = true;
    setParams({ date });
  };
  useEffect(() => {
    if (datePicked.current) return;
    // 매장 시간대는 stores 응답 뒤에야 확정되므로 today 가 바뀔 때마다 다시 본다.
    if (params.date && params.date !== today) setParams({ date: today });
  }, [today, params.date]);

  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<DaySort>("default");
  const [filters, setFilters] = useState<DayFilters>(EMPTY_DAY_FILTERS);

  const days = useMemo(() => weekDays(selectedDate), [selectedDate]);

  const schedulesQ = useSchedules({
    store_id: storeId || undefined,
    date_from: days[0],
    date_to: days[6],
    per_page: 500,
  });
  const attendancesQ = useAttendances({
    store_id: storeId || undefined,
    date_from: days[0],
    date_to: days[6],
    per_page: 500,
  });

  const isLoading = schedulesQ.isLoading || attendancesQ.isLoading;
  const isError = schedulesQ.isError || attendancesQ.isError;

  /** 주 전체 행 — 스트립 숫자용. */
  // 지금 시각은 매장 벽시계로 넘긴다 (근무 종료 판정용). 데이터가 새로 올 때마다 다시 잰다 —
  // 초 단위로 갱신할 이유는 없고, 새로고침/refetch 가 곧 갱신 시점이다.
  const weekRows = useMemo(
    () =>
      buildDayRows(
        schedulesQ.data?.items ?? [],
        attendancesQ.data?.items ?? [],
        isoToLocalInputInTz(new Date().toISOString(), tz),
      ),
    [schedulesQ.data, attendancesQ.data, tz],
  );

  const rowDate = (row: DayRow): string =>
    row.schedule?.operating_day
    ?? row.schedule?.work_date
    ?? row.attendance?.work_date
    ?? "";

  /** 날짜별 [인원수, 이슈수] — cancelled 는 세지 않는다 (조치할 게 없다). */
  const countsByDay = useMemo(() => {
    const counts: Record<string, [number, number]> = {};
    for (const row of weekRows) {
      if (row.group === "cancelled") continue;
      const key = rowDate(row);
      if (!key) continue;
      const cur = counts[key] ?? [0, 0];
      counts[key] = [cur[0] + 1, cur[1] + (row.issues.length > 0 ? 1 : 0)];
    }
    return counts;
  }, [weekRows]);

  const dayRows = useMemo(
    () => weekRows.filter((row) => rowDate(row) === selectedDate),
    [weekRows, selectedDate],
  );

  const visibleRows = useMemo(
    () => filterRows(dayRows, { ...filters, query }),
    [dayRows, filters, query],
  );
  const sections = useMemo(() => sectionsFor(visibleRows, sort), [visibleRows, sort]);
  const roles = useMemo(() => availableRoles(dayRows), [dayRows]);
  const attentionCount = useMemo(
    () => dayRows.filter((r) => r.issues.length > 0 && r.group !== "cancelled").length,
    [dayRows],
  );
  // 빈 화면 문구를 고르는 데만 쓴다 — 목록을 좁히는 선택만 센다.
  // 정렬과 "Cancelled"(오히려 넓힌다)는 빼야 "필터를 지워보라" 는 헛된 안내가 안 나간다.
  const narrowed = filters.issuesOnly || filters.roles.length > 0;

  const openDetail = async (row: DayRow) => {
    await modal.open(
      ({ close }) => (
        <CompactEntryDetail
          row={row}
          storeId={storeId}
          daySchedules={dayRows.map((r) => r.schedule).filter((s): s is NonNullable<typeof s> => !!s)}
          onDone={close}
        />
      ),
      { title: row.userName, size: "md", closeOnBackdrop: false },
    );
  };

  const openCreate = async () => {
    await modal.open(
      ({ close }) => (
        <CompactScheduleForm storeId={storeId} date={selectedDate} onDone={close} />
      ),
      { title: "Add shift", size: "md", closeOnBackdrop: false },
    );
  };

  if (!storeId) {
    return (
      <p className="px-4 py-10 text-center text-sm text-text-secondary">
        Select a store to see the day.
      </p>
    );
  }

  return (
    // relative: FAB 의 기준 박스. 없으면 absolute 가 큰 뷰포트에 붙어 모바일 하단바 뒤로 내려간다.
    <div className="relative flex h-full flex-col">
      {/* 주간 스트립 */}
      <div className="shrink-0 border-b border-border bg-surface/60 px-2 py-2">
        {/* 화살표는 주 단위로 움직인다 — 하루씩 옮기는 건 바로 아래 스트립을 탭하면 되고,
            화살표까지 하루씩이면 다음 주를 보려면 일곱 번 눌러야 했다. 요일은 그대로 유지된다. */}
        <div className="flex items-center justify-between px-1 pb-2">
          <button
            type="button"
            onClick={() => pickDate(addDay(selectedDate, -7))}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-text-secondary active:bg-surface-hover"
            aria-label="Previous week"
          >
            <ChevronLeft size={18} />
          </button>
          {/* 오늘이 아닐 땐 "오늘로 가기" 버튼, 오늘일 땐 오늘이라는 표시.
              예전엔 둘 다 그냥 "Today" 라 날짜 옆에 붙은 배지가 "이 날이 오늘" 로 읽혔다 —
              실제로는 다른 날을 보는 중이었는데 오늘로 착각하게 만들었다. */}
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-text">{formatDayLabel(selectedDate)}</span>
            {selectedDate === today ? (
              <span className="rounded-full bg-surface-hover px-2 py-0.5 text-[11px] font-bold text-text-secondary">
                Today
              </span>
            ) : (
              <button
                type="button"
                onClick={() => pickDate(today)}
                className="flex items-center gap-0.5 rounded-full bg-accent-muted px-2 py-0.5 text-[11px] font-bold text-accent"
              >
                Go to today
                <ChevronRight size={11} />
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => pickDate(addDay(selectedDate, 7))}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-text-secondary active:bg-surface-hover"
            aria-label="Next week"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        <div className="flex gap-1">
          {days.map((day, i) => {
            const active = day === selectedDate;
            const [people, issues] = countsByDay[day] ?? [0, 0];
            return (
              <button
                key={day}
                type="button"
                onClick={() => pickDate(day)}
                aria-current={active ? "date" : undefined}
                className={cn(
                  "flex flex-1 flex-col items-center gap-0.5 rounded-lg py-1.5 transition-colors",
                  active ? "bg-accent-muted text-accent" : "text-text-secondary",
                )}
              >
                <span className="text-[10px] font-medium">{WEEKDAY_LABELS[i]}</span>
                <span className={cn("text-sm font-bold", day === today && !active && "text-text")}>
                  {Number(day.slice(8, 10))}
                </span>
                <span className="text-[10px] tabular-nums">
                  {people > 0 ? people : "·"}
                  {issues > 0 && <span className="font-bold text-danger">·{issues}</span>}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 검색 + 정렬/필터 칩 */}
      <div className="shrink-0 space-y-2 border-b border-border bg-surface px-3 py-2">
        <div className="relative">
          <Search size={14} className="pointer-events-none absolute left-3 top-3 text-text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name or role"
            aria-label="Search this day"
            className="h-10 w-full rounded-lg border border-border bg-bg pl-9 pr-9 text-sm text-text focus:outline-none focus:ring-2 focus:ring-accent"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear search"
              className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-surface-hover text-text-secondary"
            >
              <X size={12} />
            </button>
          )}
        </div>
        <CompactDayFilterBar
          sort={sort}
          filters={filters}
          roles={roles}
          attentionCount={attentionCount}
          onSort={setSort}
          onFilters={setFilters}
        />
      </div>

      {/* 목록 */}
      {/* pb-24: FAB(56px) + 여백. 없으면 마지막 카드가 FAB 에 영구히 가린다 */}
      <div className="flex-1 overflow-auto overscroll-contain pb-24">
        {isLoading && (
          <div className="space-y-2 px-3 pt-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl bg-surface-hover" />
            ))}
          </div>
        )}

        {isError && (
          <p className="px-4 py-8 text-center text-sm text-danger">
            Couldn&apos;t load this day. Check your connection and try again.
          </p>
        )}

        {!isLoading && !isError && sections.length === 0 && (
          <p className="px-4 py-10 text-center text-sm text-text-secondary">
            {query || narrowed
              ? "Nothing matches. Try a different name, or clear the filters."
              : "Nothing scheduled or recorded on this day."}
          </p>
        )}

        {sections.map((section) => (
          <div key={section.group}>
            <div className="sticky top-0 z-[1] flex items-center gap-1.5 bg-bg px-4 pb-1 pt-3 text-[11px] font-extrabold uppercase tracking-wide text-text-muted">
              <span
                className={cn(
                  "h-1.5 w-1.5 rounded-full",
                  section.group === "now" && "bg-success",
                  section.group === "attention" && "bg-danger",
                  section.group === "upcoming" && "bg-accent",
                  (section.group === "done" || section.group === "cancelled") && "bg-text-muted",
                )}
              />
              {section.label}
              <span className="ml-auto font-bold normal-case tracking-normal">
                {section.rows.length}
              </span>
            </div>
            <div className="space-y-2 px-3">
              {section.rows.map((row) => (
                <CompactDayCard
                  key={row.key}
                  row={row}
                  query={query}
                  onClick={() => openDetail(row)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {hasPermission(PERMISSIONS.SCHEDULES_CREATE) && (
        <button
          type="button"
          onClick={openCreate}
          className="absolute bottom-4 right-4 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-white shadow-lg transition-colors active:bg-accent-light"
          aria-label="Add shift"
        >
          <Plus size={24} />
        </button>
      )}
    </div>
  );
}
