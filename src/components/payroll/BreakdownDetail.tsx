"use client";

import { useMemo, useState } from "react";
import { CalendarDays, ExternalLink, List } from "lucide-react";
import { usePermissions } from "@/hooks/usePermissions";
import { PERMISSIONS } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import {
  WEEKDAY_SHORT,
  dayAmountLine,
  minutesToHours,
  money,
  parseYmd,
  payrollDayLabel,
  workedTimesLine,
} from "@/lib/payrollFormat";
import {
  dayAmountParts,
  penaltyTotalsByDate,
  sumDayAmounts,
} from "@/lib/payrollTotals";
import {
  addDays,
  buildPayrollWeeks,
  type CalendarDay,
  type CalendarWeek,
  type PeriodRange,
} from "@/lib/payrollCalendar";
import { buildAttendanceOneShotLink } from "@/lib/payrollGateLinks";
import {
  PENALTY_KIND_HINTS,
  PENALTY_SECTION_LABEL,
  PENALTY_TERM_HINT,
} from "@/lib/payrollTerms";
import type { ContextDay, EntryBreakdown } from "@/types/payroll";

const PENALTY_LABELS: Record<string, string> = {
  meal_penalty: "Meal penalty",
  rest_penalty: "Rest penalty",
};

/** 접기 기준 — 반월 기간이면 일별이 16행까지 나와 카드가 길어진다. */
const COLLAPSED_DAYS = 5;
const COLLAPSED_PENALTIES = 3;

/**
 * 펼친 목록은 카드를 늘리지 않고 내부에서 스크롤한다 (표 8~9행 분량 —
 * 날짜 아래 근무시각 서브라인이 붙어 행이 두 줄 높이다).
 * 테이블 행 클릭으로 연 상세라, 펼침이 페이지 높이를 바꾸면 원래 행이
 * 화면 밖으로 밀려난다.
 */
const EXPANDED_LIST_MAX_H = "max-h-80";

type DetailView = "table" | "calendar";

function SectionTitle({
  children,
  title,
}: {
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <p
      title={title}
      className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-[#94A3B8]"
    >
      {children}
    </p>
  );
}

function MiniTh({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      // 목록을 펼쳐 세로 스크롤될 때 컬럼명이 남아 있도록 sticky (bg 는 카드색)
      className={cn(
        "sticky top-0 z-10 border-b border-[#E2E4EA] bg-[#FAFBFC] px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-[#94A3B8]",
        align === "right" ? "text-right" : "text-left",
      )}
    >
      {children}
    </th>
  );
}

function MiniTd({
  children,
  align = "left",
  className,
  colSpan,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  className?: string;
  colSpan?: number;
}) {
  return (
    <td
      colSpan={colSpan}
      className={cn(
        "border-b border-[#F0F1F5] px-2 py-1 text-[11.5px] text-[#1A1D27]",
        align === "right" && "text-right",
        className,
      )}
    >
      {children}
    </td>
  );
}

/**
 * 합계 행 셀 — 세로 스크롤 시에도 남도록 sticky bottom (헤더와 짝).
 * 배경은 카드색이라 행이 비쳐 보이지 않는다.
 */
function FootTd({
  children,
  align = "right",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <td
      className={cn(
        "sticky bottom-0 z-10 border-t border-[#E2E4EA] bg-[#FAFBFC] px-2 py-1 text-[11.5px] font-bold text-[#1A1D27]",
        align === "right" ? "text-right" : "text-left",
      )}
    >
      {children}
    </td>
  );
}

/** 접기/펼치기 토글 — 일별·penalty 공용. */
function MoreToggle({
  expanded,
  moreLabel,
  onToggle,
}: {
  expanded: boolean;
  moreLabel: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      className="mt-1 text-[11px] font-semibold text-[#6C5CE7] hover:underline"
    >
      {expanded ? "Show less" : moreLabel}
    </button>
  );
}

/** 컨텍스트 날짜 문구 — 지급이 이전 기간에 끝났는지에 따라. */
function contextNote(c: ContextDay): string {
  return c.paid_in_prior
    ? "Prev period — counted for weekly OT, paid in prior period"
    : "Prev period — counted for weekly OT";
}

interface Props {
  breakdown: EntryBreakdown;
  /** 근태 딥링크용 — 이 payroll 기간의 매장 */
  storeId: string;
  /** 근태 딥링크의 staff 필터. null 이면 그 날 매장 전체로 열린다. */
  userId: string | null;
  /** 캘린더가 덮어야 할 기간 (YYYY-MM-DD, end 포함) */
  periodStart: string;
  periodEnd: string;
}

/**
 * 행 확장 상세 — rate 구간 / 일별 분류 / penalty 사유.
 * calc_version=1 breakdown 계약 렌더 (preview / frozen entry 공용).
 *
 * 일별은 표(Table)와 주 단위 캘린더(Calendar) 두 가지로 본다. 캘린더는 기간
 * 경계에 걸친 주에서 "기간 시작 전에 이미 그 주 시간을 채워 OT 가 났다" 를
 * 보이게 하는 용도라, 서버가 주는 직전 기간 컨텍스트 날짜도 함께 배치한다.
 *
 * 날짜는 근태 화면 1회용 딥링크 — 그날 뭐가 문제였는지 바로 확인하고 돌아올 수
 * 있게 새 탭으로 열고, `_ext=1` 마커로 사용자가 저장해둔 근태 필터는 건드리지
 * 않는다 (payrollGateLinks).
 */
export function BreakdownDetail({
  breakdown,
  storeId,
  userId,
  periodStart,
  periodEnd,
}: Props) {
  const { hasPermission } = usePermissions();
  const canOpenAttendance = hasPermission(PERMISSIONS.SCHEDULES_READ);

  const [view, setView] = useState<DetailView>("table");
  const [showAllDays, setShowAllDays] = useState(false);
  const [showAllPenalties, setShowAllPenalties] = useState(false);

  // 서버 additive 필드 — 없으면 직전 기간 표시를 통째로 생략
  const contextDays = useMemo(
    () => breakdown.context_days ?? [],
    [breakdown.context_days],
  );
  // 근무가 없는 주도 나오도록 기간 전체를 격자에 깐다
  const weeks = useMemo(
    () =>
      buildPayrollWeeks(breakdown.days, contextDays, {
        start: periodStart,
        end: periodEnd,
      }),
    [breakdown.days, contextDays, periodStart, periodEnd],
  );

  // 그날 premium(penalty) 합 — penalties[] 를 날짜로 묶은 파생값 (서버 필드 아님)
  const penaltyByDate = useMemo(
    () => penaltyTotalsByDate(breakdown.penalties),
    [breakdown.penalties],
  );
  const dayTotals = useMemo(
    () => sumDayAmounts(breakdown.days, breakdown.penalties),
    [breakdown.days, breakdown.penalties],
  );

  const visibleDays = showAllDays
    ? breakdown.days
    : breakdown.days.slice(0, COLLAPSED_DAYS);
  const visiblePenalties = showAllPenalties
    ? breakdown.penalties
    : breakdown.penalties.slice(0, COLLAPSED_PENALTIES);

  const openAttendance = (date: string): void => {
    window.open(
      buildAttendanceOneShotLink({ storeId, date, userId }),
      "_blank",
      "noopener,noreferrer",
    );
  };

  /** 날짜 텍스트 — 권한이 있으면 근태로 여는 링크, 없으면 평문. */
  const dateCell = (date: string, className?: string) =>
    canOpenAttendance ? (
      <button
        type="button"
        onClick={() => openAttendance(date)}
        title="Open this day in Attendance"
        className={cn(
          "group/date inline-flex items-center gap-1 whitespace-nowrap hover:underline",
          className,
        )}
      >
        {payrollDayLabel(date)}
        <ExternalLink
          size={10}
          className="opacity-0 transition-opacity group-hover/date:opacity-100"
        />
      </button>
    ) : (
      <span className={cn("whitespace-nowrap", className)}>
        {payrollDayLabel(date)}
      </span>
    );

  return (
    <div className="grid gap-4 rounded-lg bg-[#FAFBFC] p-3 md:grid-cols-2 xl:grid-cols-3">
      {/* Rate segments */}
      <div>
        <SectionTitle>Rate segments</SectionTitle>
        {breakdown.segments.length === 0 ? (
          <p className="text-[11.5px] text-[#94A3B8]">No paid time.</p>
        ) : (
          // sticky 헤더가 페이지 스크롤에 붙지 않도록 자체 스크롤 박스 안에 둔다
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <MiniTh>Rate</MiniTh>
                  <MiniTh align="right">Regular</MiniTh>
                  <MiniTh align="right">OT</MiniTh>
                  <MiniTh align="right">DT</MiniTh>
                  <MiniTh align="right">Amount</MiniTh>
                </tr>
              </thead>
              <tbody>
                {breakdown.segments.map((s, i) => (
                  <tr key={`${s.rate}_${i}`}>
                    <MiniTd>
                      {Number(s.rate) > 0 ? `${money(s.rate)}/h` : "No rate"}
                    </MiniTd>
                    <MiniTd align="right">
                      {minutesToHours(s.regular_minutes)}
                    </MiniTd>
                    <MiniTd align="right">
                      {minutesToHours(s.ot_minutes)}
                    </MiniTd>
                    <MiniTd align="right">
                      {minutesToHours(s.dt_minutes)}
                    </MiniTd>
                    <MiniTd align="right" className="font-semibold">
                      {money(s.amount)}
                    </MiniTd>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Day detail — 금액/캘린더 때문에 넓은 화면에서 2칸 차지 */}
      <div className="xl:col-span-2">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[#94A3B8]">
            Day detail
          </p>
          {breakdown.days.length > 0 && (
            <div className="flex items-center gap-0.5 rounded-lg border border-[#E2E4EA] bg-white p-0.5">
              <ViewTab
                active={view === "table"}
                label="Table"
                Icon={List}
                onClick={() => setView("table")}
              />
              <ViewTab
                active={view === "calendar"}
                label="Calendar"
                Icon={CalendarDays}
                onClick={() => setView("calendar")}
              />
            </div>
          )}
        </div>

        {breakdown.days.length === 0 ? (
          <p className="text-[11.5px] text-[#94A3B8]">
            No worked days in this period.
          </p>
        ) : view === "table" ? (
          <>
            <div
              className={cn(
                "overflow-x-auto",
                showAllDays && `${EXPANDED_LIST_MAX_H} overflow-y-auto`,
              )}
            >
              <table className="w-full">
                <thead>
                  <tr>
                    <MiniTh>Date</MiniTh>
                    <MiniTh align="right">Regular</MiniTh>
                    <MiniTh align="right">OT</MiniTh>
                    <MiniTh align="right">DT</MiniTh>
                    <MiniTh align="right">Rate</MiniTh>
                    <MiniTh align="right">Day total</MiniTh>
                  </tr>
                </thead>
                <tbody>
                  {/* 직전 기간 컨텍스트 — 주간 OT 산정용, 지급은 이전 기간 */}
                  {contextDays.map((c) => (
                    <tr key={`ctx_${c.work_date}`} className="bg-[#F5F6FA]">
                      <MiniTd>{dateCell(c.work_date, "text-[#94A3B8]")}</MiniTd>
                      <MiniTd align="right" className="text-[#94A3B8]">
                        {minutesToHours(c.net_minutes)}
                      </MiniTd>
                      <MiniTd colSpan={3}>
                        <span className="rounded-full bg-white px-1.5 py-0.5 text-[10px] font-medium text-[#8B8DA3]">
                          {contextNote(c)}
                        </span>
                      </MiniTd>
                      <MiniTd align="right" className="text-[#CBD2DA]">
                        —
                      </MiniTd>
                    </tr>
                  ))}

                  {visibleDays.map((d, i) => {
                    // 그날 실제 근무/휴게 시각 — 기록이 없으면 빈 문자열이라 줄을 생략
                    const times = workedTimesLine(d);
                    // 금액 구성 — premium 은 penalties[] 에서 유도한 파생값
                    const amounts = dayAmountParts(
                      d,
                      penaltyByDate.get(d.work_date) ?? 0,
                    );
                    const amountLine = dayAmountLine(amounts);
                    return (
                      <tr
                        key={d.work_date}
                        className={cn(i % 2 === 1 && "bg-[#F2F3F7]")}
                      >
                        <MiniTd>
                          {dateCell(d.work_date, "hover:text-[#6C5CE7]")}
                          {times && (
                            <span className="mt-0.5 block whitespace-nowrap text-[10px] leading-tight text-[#94A3B8]">
                              {times}
                            </span>
                          )}
                        </MiniTd>
                        <MiniTd align="right">
                          {minutesToHours(d.regular_minutes)}
                        </MiniTd>
                        <MiniTd
                          align="right"
                          className={cn(
                            d.ot_minutes > 0 && "font-semibold text-[#B45F06]",
                          )}
                        >
                          {minutesToHours(d.ot_minutes)}
                        </MiniTd>
                        <MiniTd
                          align="right"
                          className={cn(
                            d.dt_minutes > 0 && "font-semibold text-[#FF6B6B]",
                          )}
                        >
                          {minutesToHours(d.dt_minutes)}
                        </MiniTd>
                        <MiniTd align="right">
                          {d.applied_rate !== null ? (
                            `${money(d.applied_rate)}/h`
                          ) : (
                            <span className="font-semibold text-[#FF6B6B]">
                              Missing
                            </span>
                          )}
                        </MiniTd>
                        {/*
                          Day total = 그날 근무 금액 + premium.
                          일별 금액은 서버 additive 필드라 옛 동결 entry 는 "—".
                        */}
                        <MiniTd align="right" className="font-semibold">
                          {amounts.total != null ? (
                            <>
                              {money(amounts.total)}
                              {amountLine && (
                                <span className="mt-0.5 block whitespace-nowrap text-[10px] font-normal leading-tight text-[#94A3B8]">
                                  {amountLine}
                                </span>
                              )}
                            </>
                          ) : (
                            <span className="text-[#94A3B8]">—</span>
                          )}
                        </MiniTd>
                      </tr>
                    );
                  })}
                </tbody>

                {/* 합계 — 접혀 있어도 기간 전체 기준 (visibleDays 아님) */}
                <tfoot>
                  <tr>
                    <FootTd align="left">Total</FootTd>
                    <FootTd>{minutesToHours(dayTotals.regular_minutes)}</FootTd>
                    <FootTd>
                      {dayTotals.ot_minutes > 0
                        ? minutesToHours(dayTotals.ot_minutes)
                        : "—"}
                    </FootTd>
                    <FootTd>
                      {dayTotals.dt_minutes > 0
                        ? minutesToHours(dayTotals.dt_minutes)
                        : "—"}
                    </FootTd>
                    <FootTd>—</FootTd>
                    <FootTd>
                      {dayTotals.total != null ? (
                        money(dayTotals.total)
                      ) : (
                        <span className="text-[#94A3B8]">—</span>
                      )}
                    </FootTd>
                  </tr>
                </tfoot>
              </table>
            </div>
            {breakdown.days.length > COLLAPSED_DAYS && (
              <MoreToggle
                expanded={showAllDays}
                moreLabel={`See all (${breakdown.days.length} days)`}
                onToggle={() => setShowAllDays((v) => !v)}
              />
            )}
          </>
        ) : (
          <CalendarView
            weeks={weeks}
            range={{ start: periodStart, end: periodEnd }}
            canOpen={canOpenAttendance}
            onOpenDay={openAttendance}
          />
        )}
      </div>

      {/* Penalties */}
      <div>
        <SectionTitle title={PENALTY_TERM_HINT}>
          {PENALTY_SECTION_LABEL}
        </SectionTitle>
        {breakdown.penalties.length === 0 ? (
          <p className="text-[11.5px] text-[#94A3B8]">
            No meal or rest penalties.
          </p>
        ) : (
          <>
            <ul
              className={cn(
                "space-y-1.5",
                showAllPenalties &&
                  `${EXPANDED_LIST_MAX_H} overflow-y-auto pr-1`,
              )}
            >
              {visiblePenalties.map((p, i) => (
                <li
                  key={`${p.work_date}_${p.kind}_${i}`}
                  className="rounded-lg border border-[#F0E4C8] bg-[#FFF9EC] px-2.5 py-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1 text-[11px] font-semibold text-[#B45F06]">
                      <span title={PENALTY_KIND_HINTS[p.kind]}>
                        {PENALTY_LABELS[p.kind] ?? p.kind}
                      </span>
                      ·{dateCell(p.work_date)}
                    </span>
                    <span className="text-[11.5px] font-bold text-[#B45F06]">
                      {money(p.amount)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] leading-snug text-[#8A6D3B]">
                    {p.reason}
                  </p>
                </li>
              ))}
            </ul>
            {breakdown.penalties.length > COLLAPSED_PENALTIES && (
              <MoreToggle
                expanded={showAllPenalties}
                moreLabel={`Show all (${breakdown.penalties.length})`}
                onToggle={() => setShowAllPenalties((v) => !v)}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ViewTab({
  active,
  label,
  Icon,
  onClick,
}: {
  active: boolean;
  label: string;
  Icon: typeof List;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex items-center gap-1 rounded-md px-2 py-0.5 text-[10.5px] font-semibold transition-colors",
        active
          ? "bg-[rgba(108,92,231,0.1)] text-[#6C5CE7]"
          : "text-[#64748B] hover:bg-[#F5F6FA]",
      )}
    >
      <Icon size={11} />
      {label}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/*  Calendar view                                                             */
/* -------------------------------------------------------------------------- */

/** 셀 hover 문구 — 그날 분류/금액 요약. */
function dayTooltip(day: CalendarDay): string {
  const parts = [payrollDayLabel(day.date)];
  if (day.inPeriod) {
    if (day.regular_minutes > 0) {
      parts.push(`Regular ${minutesToHours(day.regular_minutes)}`);
    }
    if (day.ot_minutes > 0) parts.push(`OT ${minutesToHours(day.ot_minutes)}`);
    if (day.dt_minutes > 0) parts.push(`DT ${minutesToHours(day.dt_minutes)}`);
    if (day.total_amount != null) parts.push(money(day.total_amount));
  } else {
    parts.push(minutesToHours(day.total_minutes));
    parts.push("Prev period — counted for weekly OT");
  }
  return parts.join(" · ");
}

/** 7일 + 주간 합계 열. */
const GRID_COLS = "grid grid-cols-[repeat(7,minmax(0,1fr))_52px] gap-1";

function CalendarView({
  weeks,
  range,
  canOpen,
  onOpenDay,
}: {
  weeks: CalendarWeek[];
  /** 이 기간 밖(첫/마지막 주의 여백일)을 구분하기 위한 범위 */
  range: PeriodRange;
  canOpen: boolean;
  onOpenDay: (date: string) => void;
}) {
  if (weeks.length === 0) {
    return (
      <p className="text-[11.5px] text-[#94A3B8]">No worked days to chart.</p>
    );
  }

  return (
    <div className="space-y-1">
      <div className={GRID_COLS}>
        {WEEKDAY_SHORT.map((w) => (
          <div
            key={w}
            className="text-center text-[9.5px] font-semibold uppercase tracking-wider text-[#94A3B8]"
          >
            {w}
          </div>
        ))}
        <div className="text-right text-[9.5px] font-semibold uppercase tracking-wider text-[#94A3B8]">
          Week
        </div>
      </div>

      {weeks.map((week) => (
        <div key={week.start} className={GRID_COLS}>
          {week.days.map((day, i) => {
            const date = day?.date ?? addDays(week.start, i);
            const dayNumber = parseYmd(date).getDate();

            if (!day) {
              // 기간 밖 여백일은 컨텍스트 날짜와 같은 점선 처리로 경계를 보이게
              const outside = date < range.start || date > range.end;
              return (
                <div
                  key={date}
                  title={outside ? "Outside this pay period" : undefined}
                  className={cn(
                    "rounded-md border px-1 py-1 text-center text-[9px]",
                    outside
                      ? "border-dashed border-[#E2E4EA] bg-transparent text-[#CBD2DA]"
                      : "border-transparent bg-[#F5F6FA] text-[#CBD2DA]",
                  )}
                >
                  {dayNumber}
                </div>
              );
            }

            const tone = !day.inPeriod
              ? "border-dashed border-[#D8DBE3] bg-[#F5F6FA] text-[#94A3B8]"
              : day.dt_minutes > 0
                ? "border-[#F3C5C5] bg-[rgba(255,107,107,0.10)] text-[#C0392B]"
                : day.ot_minutes > 0
                  ? "border-[#F0E0B8] bg-[rgba(240,165,0,0.12)] text-[#B45F06]"
                  : "border-[#E2E4EA] bg-white text-[#1A1D27]";

            const cellClass = cn(
              "flex flex-col items-center rounded-md border px-1 py-1",
              tone,
            );
            const content = (
              <>
                <span className="text-[9px] opacity-70">{dayNumber}</span>
                <span className="text-[10.5px] font-bold leading-tight">
                  {minutesToHours(day.total_minutes)}
                </span>
              </>
            );

            return canOpen ? (
              <button
                key={date}
                type="button"
                onClick={() => onOpenDay(date)}
                title={`${dayTooltip(day)} — open in Attendance`}
                className={cn(cellClass, "transition-shadow hover:shadow-sm")}
              >
                {content}
              </button>
            ) : (
              <div key={date} title={dayTooltip(day)} className={cellClass}>
                {content}
              </div>
            );
          })}

          {/* 주간 합계 (straight 누적 — 직전 기간 날짜 포함) */}
          <div className="flex items-center justify-end">
            <span
              className={cn(
                "text-[10.5px] font-bold tabular-nums",
                week.hasPremium ? "text-[#B45F06]" : "text-[#64748B]",
              )}
            >
              {minutesToHours(week.total_minutes)}
            </span>
          </div>
        </div>
      ))}

      <p className="pt-0.5 text-[10px] leading-snug text-[#94A3B8]">
        Sun–Sat weeks covering the whole pay period. Dashed cells fall outside
        it — days from the previous period still count toward weekly overtime
        (and toward the week totals here) but were paid earlier.
      </p>
    </div>
  );
}
