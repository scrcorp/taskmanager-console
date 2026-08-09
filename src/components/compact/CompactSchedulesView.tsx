"use client";

/**
 * 간소화 콘솔 — 스케줄 (일별 리스트 + 상단 주간 스트립).
 *
 * 데스크탑 주간 그리드는 이식하지 않는다. 셀이 손가락보다 작아 터치 편집이 부정확해지기 때문.
 * 한 주치를 한 번에 받아 스트립 인원수와 일별 리스트를 함께 만든다 (요청 1회).
 */

import { useMemo } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useSchedules } from "@/hooks/useSchedules";
import { usePersistedFilters } from "@/hooks/usePersistedFilters";
import { usePermissions } from "@/hooks/usePermissions";
import { useTimezone } from "@/hooks/useTimezone";
import { useModal } from "@/components/ui/imperative-modal";
import { PERMISSIONS } from "@/lib/permissions";
import { COMPACT_FILTER_KEY } from "@/lib/compact";
import { addDay } from "@/lib/scheduleTime";
import { formatDayLabel, WEEKDAY_LABELS, weekDays } from "@/lib/compactWeek";
import { cn, todayInTimezone } from "@/lib/utils";
import type { Schedule } from "@/types";
import { CompactScheduleForm } from "./CompactScheduleForm";
import { CompactScheduleCard } from "./CompactScheduleCard";

export function CompactSchedulesView() {
  const tz = useTimezone();
  const today = todayInTimezone(tz);
  const modal = useModal();
  const { hasPermission } = usePermissions();

  const [storeParams] = usePersistedFilters(COMPACT_FILTER_KEY, { store: "" });
  const [params, setParams] = usePersistedFilters(`${COMPACT_FILTER_KEY}.schedules`, {
    date: today,
  });
  const selectedDate = params.date || today;
  const storeId = storeParams.store;

  const days = useMemo(() => weekDays(selectedDate), [selectedDate]);

  const { data, isLoading, isError } = useSchedules({
    store_id: storeId || undefined,
    date_from: days[0],
    date_to: days[6],
    per_page: 500,
  });

  // 취소/삭제된 건은 운영 화면에서 노이즈라 제외한다.
  const visible = useMemo(
    () => (data?.items ?? []).filter((s) => s.status !== "cancelled" && s.status !== "deleted"),
    [data],
  );

  const countByDay = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const s of visible) {
      const key = s.operating_day ?? s.work_date;
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
  }, [visible]);

  const dayItems = useMemo(
    () =>
      visible
        .filter((s) => (s.operating_day ?? s.work_date) === selectedDate)
        .sort((a, b) => (a.start_at ?? "").localeCompare(b.start_at ?? "")),
    [visible, selectedDate],
  );

  const openForm = async (schedule?: Schedule) => {
    await modal.open(
      ({ close }) => (
        <CompactScheduleForm
          storeId={storeId}
          date={selectedDate}
          schedule={schedule}
          onDone={close}
        />
      ),
      { title: schedule ? "Edit shift" : "Add shift", size: "md", closeOnBackdrop: false },
    );
  };

  if (!storeId) {
    return (
      <p className="px-4 py-10 text-center text-sm text-text-secondary">
        Select a store to see its schedule.
      </p>
    );
  }

  return (
    // relative: FAB 의 기준 박스. 이게 없으면 absolute 가 초기 컨테이닝 블록(=툴바 포함 큰 뷰포트)에
    // 붙어서, 모바일 브라우저 하단바 뒤로 FAB 이 내려간다.
    <div className="relative flex h-full flex-col">
      {/* 주간 스트립 — 날짜 이동 + 요일별 인원수 */}
      <div className="shrink-0 border-b border-border bg-surface/60 px-2 py-2">
        <div className="flex items-center justify-between px-1 pb-2">
          <button
            type="button"
            onClick={() => setParams({ date: addDay(selectedDate, -7) })}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-text-secondary hover:bg-surface-hover"
            aria-label="Previous week"
          >
            <ChevronLeft size={18} />
          </button>
          <span className="text-sm font-semibold text-text">{formatDayLabel(selectedDate)}</span>
          <button
            type="button"
            onClick={() => setParams({ date: addDay(selectedDate, 7) })}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-text-secondary hover:bg-surface-hover"
            aria-label="Next week"
          >
            <ChevronRight size={18} />
          </button>
        </div>

        <div className="flex gap-1">
          {days.map((day, i) => {
            const active = day === selectedDate;
            const count = countByDay[day] ?? 0;
            return (
              <button
                key={day}
                type="button"
                onClick={() => setParams({ date: day })}
                aria-current={active ? "date" : undefined}
                className={cn(
                  "flex flex-1 flex-col items-center gap-0.5 rounded-lg py-1.5 transition-colors",
                  active ? "bg-accent-muted text-accent" : "text-text-secondary",
                )}
              >
                <span className="text-[10px] font-medium">{WEEKDAY_LABELS[i]}</span>
                <span
                  className={cn(
                    "text-sm font-bold",
                    day === today && !active && "text-text",
                  )}
                >
                  {Number(day.slice(8, 10))}
                </span>
                <span className="text-[10px] tabular-nums">{count > 0 ? count : "·"}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 일별 리스트 */}
      {/* pb-24: FAB(56px) + 여백만큼 아래를 비워둔다. 없으면 마지막 카드가 FAB 에 영구히 가린다 */}
      <div className="flex-1 overflow-auto overscroll-contain px-3 pt-3 pb-24">
        {isLoading && (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl bg-surface-hover" />
            ))}
          </div>
        )}

        {isError && (
          <p className="px-2 py-8 text-center text-sm text-danger">
            Couldn&apos;t load the schedule. Pull down to retry, or check your connection.
          </p>
        )}

        {!isLoading && !isError && dayItems.length === 0 && (
          <p className="px-2 py-10 text-center text-sm text-text-secondary">
            No shifts on this day.
          </p>
        )}

        <div className="space-y-2">
          {dayItems.map((schedule) => (
            <CompactScheduleCard
              key={schedule.id}
              schedule={schedule}
              onClick={() => openForm(schedule)}
            />
          ))}
        </div>
      </div>

      {hasPermission(PERMISSIONS.SCHEDULES_CREATE) && (
        <button
          type="button"
          onClick={() => openForm()}
          className="absolute bottom-4 right-4 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-white shadow-lg transition-colors hover:bg-accent-light"
          aria-label="Add shift"
        >
          <Plus size={24} />
        </button>
      )}
    </div>
  );
}
