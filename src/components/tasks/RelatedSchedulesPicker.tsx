"use client";

/**
 * Task related-schedules picker — schedule + 1:1 매핑된 checklist instance 통합.
 *
 * 옵션 입력 — task 가 어떤 근무/체크리스트 컨텍스트와 관련된 작업인지 표시.
 * 데이터 schema: { schedule_ids, checklist_instance_ids } — schedule 토글 시
 * 매핑된 checklist 도 자동 같이 토글. issue report links 와 호환되어 prefill 흐름
 * 그대로 동작.
 */

import React, { useMemo, useState } from "react";
import { CalendarClock, Search, X } from "lucide-react";

import {
  useStoreSchedulesForLink,
  useStoreChecklistInstancesForLink,
} from "@/hooks/useReports";
import { LoadingSpinner } from "@/components/ui";
import { DateField } from "@/components/ui/DateField";
import { formatFixedDate } from "@/lib/utils";

export interface RelatedSchedulesValue {
  schedule_ids: string[];
  checklist_instance_ids: string[];
}

const formatHm = (t: string | null | undefined): string | null => {
  if (!t) return null;
  const m = /^(\d{2}:\d{2})/.exec(t);
  return m ? m[1] : t;
};

const joinDot = (parts: Array<string | null | undefined>): string =>
  parts.filter((p): p is string => !!p && p.trim() !== "").join(" · ");

export function RelatedSchedulesPicker({
  storeIds,
  orgWide,
  value,
  onChange,
}: {
  storeIds: string[];
  orgWide: boolean;
  value: RelatedSchedulesValue;
  onChange: (next: RelatedSchedulesValue) => void;
}): React.ReactElement | null {
  // Single store 일 때만 schedule 연결 의미 있음. multi/org-wide 면 hide.
  const singleStoreId =
    !orgWide && storeIds.length === 1 ? storeIds[0] : null;
  const { data: scheduleData, isLoading } = useStoreSchedulesForLink(singleStoreId);
  const { data: checklistData } = useStoreChecklistInstancesForLink(singleStoreId);

  const [schedDate, setSchedDate] = useState<string>("");
  const [schedQuery, setSchedQuery] = useState<string>("");

  const checklistByScheduleId = useMemo(() => {
    const map = new Map<string, { id: string; total: number; completed: number }>();
    (checklistData?.items ?? []).forEach((c) => {
      if (c.schedule_id) {
        map.set(c.schedule_id, {
          id: c.id,
          total: c.total_items,
          completed: c.completed_items,
        });
      }
    });
    return map;
  }, [checklistData]);

  const schedules = useMemo(() => {
    const items = [...(scheduleData?.items ?? [])].sort((a, b) =>
      (b.work_date ?? "").localeCompare(a.work_date ?? ""),
    );
    const dateFiltered = schedDate
      ? items.filter((s) => s.work_date === schedDate)
      : items;
    const q = schedQuery.trim().toLowerCase();
    if (!q) return dateFiltered;
    return dateFiltered.filter((s) => {
      const fields = [
        s.work_date,
        s.user_name,
        s.work_role_name,
        s.work_role_name_snapshot,
        s.position_snapshot,
      ];
      return fields.some(
        (v) => typeof v === "string" && v.toLowerCase().includes(q),
      );
    });
  }, [scheduleData, schedDate, schedQuery]);

  if (!singleStoreId) {
    // org-wide / multi-store 이면 schedule 연결은 의미가 옅으므로 섹션 자체 숨김.
    return null;
  }

  const toggleSchedule = (s: { id: string }) => {
    const sid = s.id;
    const cl = checklistByScheduleId.get(sid);
    const scheduleSelected = value.schedule_ids.includes(sid);
    const nextSchedule = scheduleSelected
      ? value.schedule_ids.filter((x) => x !== sid)
      : [...value.schedule_ids, sid];
    let nextChecklist = value.checklist_instance_ids;
    if (cl) {
      if (scheduleSelected) {
        nextChecklist = nextChecklist.filter((x) => x !== cl.id);
      } else if (!nextChecklist.includes(cl.id)) {
        nextChecklist = [...nextChecklist, cl.id];
      }
    }
    onChange({
      schedule_ids: nextSchedule,
      checklist_instance_ids: nextChecklist,
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="text-sm font-semibold text-text flex items-center gap-1.5">
          <CalendarClock className="w-4 h-4 text-accent" />
          Related schedules
          <span className="text-textMuted text-xs font-normal">
            · optional context
          </span>
          {schedDate && (
            <span className="text-textMuted text-xs font-normal">
              · {formatFixedDate(schedDate)}
            </span>
          )}
        </h3>
        <span className="text-xs text-textMuted">
          {value.schedule_ids.length} selected
        </span>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-textMuted"
          />
          <input
            type="text"
            value={schedQuery}
            onChange={(e) => setSchedQuery(e.target.value)}
            placeholder="Search name / date / role"
            className="w-full text-sm pl-8 pr-3 py-2 bg-surface border border-border rounded-md text-text placeholder:text-textMuted focus:outline-none focus:border-accent"
          />
        </div>
        <DateField
          value={schedDate}
          onChange={setSchedDate}
          placeholder="Filter by date"
        />
        {schedDate && (
          <button
            type="button"
            onClick={() => setSchedDate("")}
            className="text-textMuted hover:text-text"
            aria-label="Clear date"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {isLoading ? (
        <LoadingSpinner size="sm" />
      ) : schedules.length === 0 ? (
        <p className="text-xs text-textMuted italic py-2">
          {schedDate
            ? "No schedules on this date."
            : schedQuery
            ? "No schedules match your search."
            : "No schedules available for this store."}
        </p>
      ) : (
        <div className="border border-border rounded-md p-2 max-h-64 overflow-auto space-y-1 bg-surface">
          {schedules.map((s) => {
            const start = formatHm(s.start_time);
            const end = formatHm(s.end_time);
            const timeRange = start && end ? `${start}–${end}` : start ?? end;
            const role =
              s.work_role_name ??
              s.work_role_name_snapshot ??
              s.position_snapshot ??
              null;
            const cl = checklistByScheduleId.get(s.id);
            const progress = cl ? `${cl.completed}/${cl.total} checklist` : null;
            const meta = joinDot([role, timeRange, s.user_name, progress]);
            const checked = value.schedule_ids.includes(s.id);
            return (
              <label
                key={s.id}
                className="flex items-center gap-2 text-sm cursor-pointer hover:bg-surfaceHover px-2 py-1.5 rounded"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleSchedule(s)}
                  className="accent-accent"
                />
                <CalendarClock className="w-3.5 h-3.5 text-textMuted shrink-0" />
                <span className="text-text font-medium">
                  {formatFixedDate(s.work_date)}
                </span>
                {meta && <span className="text-textMuted">· {meta}</span>}
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
