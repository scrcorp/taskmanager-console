"use client";

/**
 * 스케줄 관리 페이지 -- 주간 캘린더 뷰로 매장별 스케줄 초안/승인 상태를 표시합니다.
 *
 * Schedule management page showing a weekly calendar grid per store.
 * Clicking an empty cell navigates to create a new schedule for that date+store.
 * Clicking an existing schedule navigates to its detail page.
 */

import React, { useState, useMemo, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Plus,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useSchedules } from "@/hooks/useSchedules";
import { useStores } from "@/hooks/useStores";
import { Button, Card, Badge } from "@/components/ui";
import type { Schedule, Store } from "@/types";
import { cn, todayInTimezone } from "@/lib/utils";
import { useTimezone } from "@/hooks/useTimezone";

// ─── Date helpers ───────────────────────────────────────

function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function getWeekDays(dateStr: string): string[] {
  const d = new Date(dateStr + "T00:00:00");
  const dayOfWeek = d.getDay();
  const diff = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(monday);
    day.setDate(monday.getDate() + i);
    return toDateStr(day);
  });
}

function shortDayName(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short" });
}

function shortDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function weekRangeLabel(weekDays: string[]): string {
  const start = new Date(weekDays[0] + "T00:00:00");
  const end = new Date(weekDays[6] + "T00:00:00");
  const startStr = start.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const endStr = end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  return `${startStr} - ${endStr}`;
}

// ─── Status config ──────────────────────────────────────

const statusTabs: { key: string; label: string }[] = [
  { key: "all", label: "All" },
  { key: "draft", label: "Draft" },
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "cancelled", label: "Cancelled" },
];

const statusBadgeShort: Record<
  string,
  { label: string; variant: "default" | "warning" | "success" | "danger" }
> = {
  draft: { label: "D", variant: "default" },
  pending: { label: "P", variant: "warning" },
  approved: { label: "A", variant: "success" },
  cancelled: { label: "C", variant: "danger" },
};

const statusBadgeFull: Record<
  string,
  { label: string; variant: "default" | "warning" | "success" | "danger" }
> = {
  draft: { label: "Draft", variant: "default" },
  pending: { label: "Pending", variant: "warning" },
  approved: { label: "Approved", variant: "success" },
  cancelled: { label: "Cancelled", variant: "danger" },
};

// ─── Store Week Calendar ────────────────────────────────

function StoreWeekCalendar({
  store,
  weekDays,
  schedules,
  onScheduleClick,
  onEmptyCellClick,
}: {
  store: Store;
  weekDays: string[];
  schedules: Schedule[];
  onScheduleClick: (scheduleId: string) => void;
  onEmptyCellClick: (storeId: string, date: string) => void;
}): React.ReactElement {
  const tz = useTimezone();
  const today: string = todayInTimezone(tz);

  const byDate: Record<string, Schedule[]> = useMemo(() => {
    const map: Record<string, Schedule[]> = {};
    for (const s of schedules) {
      if (s.store_id !== store.id) continue;
      if (!map[s.work_date]) map[s.work_date] = [];
      map[s.work_date].push(s);
    }
    return map;
  }, [schedules, store.id]);

  return (
    <Card padding="p-0" className="mb-4">
      <div className="px-4 py-3 border-b border-border">
        <p className="text-sm font-bold text-text">{store.name}</p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse min-w-[600px]">
          <thead>
            <tr className="border-b border-border">
              {weekDays.map((day) => (
                <th
                  key={day}
                  className={cn(
                    "text-center text-xs font-semibold uppercase tracking-wider p-2 w-[14.28%]",
                    day === today ? "text-accent bg-accent/5" : "text-text-muted",
                  )}
                >
                  <div>{shortDayName(day)}</div>
                  <div className="text-sm font-bold mt-0.5">{shortDate(day)}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              {weekDays.map((day) => {
                const daySchedules: Schedule[] = byDate[day] ?? [];
                return (
                  <td
                    key={day}
                    className={cn(
                      "p-1.5 align-top border-r border-border last:border-r-0 min-h-[80px] h-20",
                      day === today && "bg-accent/5",
                    )}
                  >
                    <div className="space-y-1 min-h-[64px]">
                      {daySchedules.map((s) => {
                        const badge = statusBadgeShort[s.status] ?? statusBadgeShort.draft;
                        return (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => onScheduleClick(s.id)}
                            className="w-full text-left px-1.5 py-1 rounded-md bg-surface border border-border hover:border-accent/50 transition-colors cursor-pointer"
                          >
                            <div className="flex items-center gap-1">
                              <Badge variant={badge.variant}>{badge.label}</Badge>
                              <span className="text-xs text-text truncate">{s.user_name}</span>
                            </div>
                            {s.shift_name && (
                              <p className="text-[10px] text-text-muted truncate mt-0.5">{s.shift_name}</p>
                            )}
                          </button>
                        );
                      })}
                      {/* 빈 셀 클릭 영역 — Clickable empty area to add schedule */}
                      <button
                        type="button"
                        onClick={() => onEmptyCellClick(store.id, day)}
                        className="w-full flex items-center justify-center gap-1 py-1.5 rounded-md border border-dashed border-transparent hover:border-border text-text-muted/30 hover:text-accent transition-colors cursor-pointer"
                      >
                        <Plus size={12} />
                      </button>
                    </div>
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// ─── Main Page ──────────────────────────────────────────

function ScheduleManageContent(): React.ReactElement {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tz = useTimezone();
  const [activeTab, setActiveTab] = useState<string>("all");
  const [selectedStoreId, setSelectedStoreId] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState<string>(
    () => searchParams.get("week") ?? todayInTimezone(tz),
  );

  const { data: stores } = useStores();

  const activeStores: Store[] = useMemo(
    () => (stores ?? []).filter((s: Store) => s.is_active),
    [stores],
  );

  const weekDays: string[] = useMemo(() => getWeekDays(selectedDate), [selectedDate]);

  const { data: schedulesData, isLoading } = useSchedules({
    store_id: selectedStoreId || undefined,
    date_from: weekDays[0],
    date_to: weekDays[6],
    status: activeTab !== "all" ? activeTab : undefined,
    per_page: 500,
  });

  const schedules: Schedule[] = schedulesData?.items ?? [];

  const handlePrev = useCallback((): void => {
    setSelectedDate((d) => {
      const dt = new Date(d + "T00:00:00");
      dt.setDate(dt.getDate() - 7);
      return toDateStr(dt);
    });
  }, []);

  const handleNext = useCallback((): void => {
    setSelectedDate((d) => {
      const dt = new Date(d + "T00:00:00");
      dt.setDate(dt.getDate() + 7);
      return toDateStr(dt);
    });
  }, []);

  const filteredStores: Store[] = useMemo(() => {
    if (selectedStoreId) return activeStores.filter((s) => s.id === selectedStoreId);
    return activeStores;
  }, [activeStores, selectedStoreId]);

  // 빈 셀 클릭 → 해당 날짜+매장으로 스케줄 생성 — Navigate to new schedule with date+store pre-filled
  const handleEmptyCellClick = useCallback(
    (storeId: string, date: string): void => {
      router.push(`/schedules/manage/new?date=${date}&store_id=${storeId}`);
    },
    [router],
  );

  return (
    <div>
      {/* 헤더 (Header) */}
      <div className="flex items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={() => router.push("/schedules")}
            className="p-2 rounded-lg text-text-muted hover:text-text hover:bg-surface-hover transition-colors shrink-0"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="min-w-0">
            <h1 className="text-xl md:text-2xl font-extrabold text-text">Manage Schedules</h1>
            <p className="text-sm text-text-muted mt-0.5 hidden md:block">
              Manage work schedule drafts and approvals
            </p>
          </div>
        </div>
        <Button
          variant="primary"
          size="sm"
          className="shrink-0"
          onClick={() => router.push("/schedules/manage/new")}
        >
          <Plus size={16} />
          <span className="hidden md:inline">New Schedule</span>
          <span className="md:hidden">New</span>
        </Button>
      </div>

      {/* Store tab bar */}
      <div className="flex items-center gap-1 mb-4 p-1 bg-surface rounded-lg border border-border overflow-x-auto">
        <button
          type="button"
          onClick={() => setSelectedStoreId("")}
          className={cn(
            "px-4 py-1.5 text-sm font-medium rounded-md transition-colors whitespace-nowrap",
            selectedStoreId === ""
              ? "bg-accent text-white"
              : "text-text-secondary hover:text-text hover:bg-surface-hover",
          )}
        >
          All Stores
        </button>
        {activeStores.map((store: Store) => (
          <button
            key={store.id}
            type="button"
            onClick={() => setSelectedStoreId(store.id)}
            className={cn(
              "px-4 py-1.5 text-sm font-medium rounded-md transition-colors whitespace-nowrap",
              selectedStoreId === store.id
                ? "bg-accent text-white"
                : "text-text-secondary hover:text-text hover:bg-surface-hover",
            )}
          >
            {store.name}
          </button>
        ))}
      </div>

      {/* 상태 탭 + 주 이동 (Status tabs + week nav) */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-6">
        {/* Status tabs */}
        <div className="flex items-center gap-1 p-1 bg-surface rounded-lg border border-border">
          {statusTabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
                activeTab === tab.key
                  ? "bg-accent text-white"
                  : "text-text-secondary hover:text-text hover:bg-surface-hover",
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Week nav */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handlePrev}
            className="p-2 rounded-lg text-text-muted hover:text-text hover:bg-surface-hover transition-colors"
          >
            <ChevronLeft size={18} />
          </button>
          <span className="text-sm font-bold text-text min-w-[180px] text-center">
            {weekRangeLabel(weekDays)}
          </span>
          <button
            type="button"
            onClick={handleNext}
            className="p-2 rounded-lg text-text-muted hover:text-text hover:bg-surface-hover transition-colors"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      {/* Calendar grids — one per store */}
      {isLoading ? (
        <Card padding="p-16">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full border-accent border-t-transparent h-6 w-6 border-2" />
          </div>
        </Card>
      ) : (
        filteredStores.map((store: Store) => (
          <StoreWeekCalendar
            key={store.id}
            store={store}
            weekDays={weekDays}
            schedules={schedules}
            onScheduleClick={(id) => router.push(`/schedules/manage/${id}`)}
            onEmptyCellClick={handleEmptyCellClick}
          />
        ))
      )}

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-3 md:gap-4 mt-4 px-2">
        {Object.entries(statusBadgeFull).map(([key, cfg]) => (
          <div key={key} className="flex items-center gap-1.5">
            <Badge variant={cfg.variant}>
              {statusBadgeShort[key]?.label ?? key[0].toUpperCase()}
            </Badge>
            <span className="text-xs text-text-muted">{cfg.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ScheduleManagePage(): React.ReactElement {
  return (
    <Suspense>
      <ScheduleManageContent />
    </Suspense>
  );
}
