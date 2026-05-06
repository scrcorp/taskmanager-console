"use client";

/**
 * 대시보드 페이지 -- 관리자 대시보드 메인 페이지입니다.
 * 통계 카드, 체크리스트 완료율, 근태 요약, 초과근무 알림, 평가 요약을 표시합니다.
 *
 * Dashboard Page -- Main admin dashboard page.
 * Displays stat cards, checklist completion, attendance summary,
 * overtime alerts, evaluation summary, and recent notices.
 * Connected to 4 dashboard APIs with date/store filters.
 */

import React, { useState, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Store as StoreIcon,
  Users,
  ClipboardCheck,
  Bell,
  ChevronRight,
  Calendar,
  Clock,
  CheckSquare,
  AlertTriangle,
  FileText,
  Download,
} from "lucide-react";
import { useAuthStore } from "@/stores/authStore";
import {
  useStores,
  useUsers,
  useNotices,
  useSchedules,
  useUnreadCount,
  useChecklistCompletion,
  useAttendanceSummary,
  useOvertimeSummary,
  useEvaluationSummary,
} from "@/hooks";
import { Card, Select, Badge, LoadingSpinner, Button } from "@/components/ui";
import { useResultModal } from "@/components/ui/ResultModal";
import api from "@/lib/api";
import { cn, formatDate, parseApiError, todayInTimezone } from "@/lib/utils";
import { useTimezone } from "@/hooks/useTimezone";
import type { Notice, Store } from "@/types";

// ─── Date Range Helpers ──────────────────────────────────

type DateRange = "today" | "week" | "month";

function getDateRange(range: DateRange): { dateFrom: string; dateTo: string } {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const today = `${yyyy}-${mm}-${dd}`;

  switch (range) {
    case "today":
      return { dateFrom: today, dateTo: today };
    case "week": {
      const day = now.getDay();
      const sunday = new Date(now);
      sunday.setDate(now.getDate() - day);
      const saturday = new Date(sunday);
      saturday.setDate(sunday.getDate() + 6);
      return {
        dateFrom: sunday.toISOString().split("T")[0],
        dateTo: saturday.toISOString().split("T")[0],
      };
    }
    case "month": {
      const firstDay = `${yyyy}-${mm}-01`;
      const lastDate = new Date(yyyy, now.getMonth() + 1, 0);
      const lastDay = lastDate.toISOString().split("T")[0];
      return { dateFrom: firstDay, dateTo: lastDay };
    }
  }
}

// ─── Helpers ────────────────────────────────────────────

/** 통계 카드 데이터 인터페이스 / Stat card data interface */
interface StatCardData {
  label: string;
  value: number;
  icon: React.ReactNode;
  colorClass: string;
  bgClass: string;
  href: string;
}

// ─── Progress Ring ──────────────────────────────────────

function ProgressRing({
  percent,
  size = 80,
  strokeWidth = 6,
  label,
}: {
  percent: number;
  size?: number;
  strokeWidth?: number;
  label: string;
}): React.ReactElement {
  const radius: number = (size - strokeWidth) / 2;
  const circumference: number = 2 * Math.PI * radius;
  const offset: number = circumference - (percent / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-2">
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-border"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="text-accent transition-all duration-500"
        />
      </svg>
      <div className="text-center -mt-[calc(50%+12px)] mb-4">
        <div className="text-lg font-extrabold text-text">{percent}%</div>
      </div>
      <span className="text-xs text-text-muted font-medium">{label}</span>
    </div>
  );
}

// ─── Status Dot Row ─────────────────────────────────────

function StatusRow({
  label,
  count,
  color,
  onClick,
}: {
  label: string;
  count: number | string;
  color: string;
  onClick?: () => void;
}): React.ReactElement {
  const Wrapper = onClick ? "button" : "div";
  return (
    <Wrapper
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "flex items-center justify-between py-2",
        onClick && "hover:bg-surface-hover -mx-2 px-2 rounded-lg transition-colors cursor-pointer",
      )}
    >
      <div className="flex items-center gap-2">
        <div className={cn("w-2.5 h-2.5 rounded-full", color)} />
        <span className="text-sm text-text">{label}</span>
      </div>
      <span className="text-sm font-bold text-text">{count}</span>
    </Wrapper>
  );
}

// ─── Main Page ──────────────────────────────────────────

export default function DashboardPage(): React.ReactElement {
  const router = useRouter();
  useAuthStore();
  const { showSuccess, showError } = useResultModal();
  const tz = useTimezone();
  const today: string = todayInTimezone(tz);

  // ─── Export state ──────────────────────────────────
  const [isExporting, setIsExporting] = useState<boolean>(false);

  // ─── Date / Store filters ──────────────────────────
  const [dateRange, setDateRange] = useState<DateRange>("today");
  const [selectedStoreId, setSelectedStoreId] = useState<string>("");

  const { dateFrom, dateTo } = useMemo(() => getDateRange(dateRange), [dateRange]);
  const storeIdParam = selectedStoreId || undefined;

  // ─── Data hooks (top stat cards) ───────────────────
  const { data: stores, isLoading: storesLoading } = useStores();
  const { data: users, isLoading: usersLoading } = useUsers();
  const { data: noticesData, isLoading: noticesLoading } =
    useNotices();
  const { data: schedulesData, isLoading: schedulesLoading } =
    useSchedules({ date_from: today, date_to: today, per_page: 200 });
  const { data: unreadCount, isLoading: unreadLoading } = useUnreadCount();

  // ─── Dashboard API hooks ──────────────────────────
  const {
    data: checklistCompletion,
    isLoading: checklistLoading,
  } = useChecklistCompletion(dateFrom, dateTo, storeIdParam);

  const {
    data: attendanceSummary,
    isLoading: attendanceLoading,
  } = useAttendanceSummary(dateFrom, dateTo, storeIdParam);

  const {
    data: overtimeSummary,
    isLoading: overtimeLoading,
  } = useOvertimeSummary(dateFrom, storeIdParam);

  const {
    data: evaluationSummary,
    isLoading: evaluationLoading,
  } = useEvaluationSummary();

  const isTopLoading: boolean =
    storesLoading || usersLoading || noticesLoading || schedulesLoading || unreadLoading;

  // ─── Store options for filter ─────────────────────
  const storeOptions = useMemo(() => {
    const base = [{ value: "", label: "All Stores" }];
    if (!Array.isArray(stores)) return base;
    return [
      ...base,
      ...stores.map((s: Store) => ({ value: s.id, label: s.name })),
    ];
  }, [stores]);

  // ─── Stat cards ───────────────────────────────────
  const statCards: StatCardData[] = useMemo(() => {
    const storeCount: number = Array.isArray(stores) ? stores.length : 0;
    const userCount: number = Array.isArray(users) ? users.length : 0;
    const scheduleCount: number = schedulesData?.total ?? 0;
    const notifCount: number =
      typeof unreadCount === "number" ? unreadCount : 0;

    const checklistCompleted: number = checklistCompletion?.completed ?? 0;

    return [
      {
        label: "Total Stores",
        value: storeCount,
        icon: <StoreIcon className="h-5 w-5" />,
        colorClass: "text-accent",
        bgClass: "bg-accent-muted",
        href: "/stores",
      },
      {
        label: "Total Staff",
        value: userCount,
        icon: <Users className="h-5 w-5" />,
        colorClass: "text-success",
        bgClass: "bg-success-muted",
        href: "/users",
      },
      {
        label: "Today's Schedules",
        value: scheduleCount,
        icon: <ClipboardCheck className="h-5 w-5" />,
        colorClass: "text-warning",
        bgClass: "bg-warning-muted",
        href: "/schedules",
      },
      {
        label: "Checklist Completed",
        value: checklistCompleted,
        icon: <CheckSquare className="h-5 w-5" />,
        colorClass: "text-emerald-400",
        bgClass: "bg-emerald-400/10",
        href: `/checklists/instances?work_date=${today}&status=completed`,
      },
      {
        label: "Unread Alerts",
        value: notifCount,
        icon: <Bell className="h-5 w-5" />,
        colorClass: "text-danger",
        bgClass: "bg-danger-muted",
        href: "/alerts",
      },
    ];
  }, [stores, users, schedulesData, unreadCount, checklistCompletion]);

  // ─── Overtime alert count ─────────────────────────
  const overtimeAlertUsers = useMemo(() => {
    if (!overtimeSummary?.users) return [];
    return overtimeSummary.users.filter((u) => u.over_hours > 0);
  }, [overtimeSummary]);

  // ─── Recent notices ─────────────────────────
  const recentNotices: Notice[] = useMemo(() => {
    const items = noticesData?.items;
    if (!Array.isArray(items)) return [];
    return items.slice(0, 5);
  }, [noticesData]);

  // ─── Export handler ─────────────────────────────────
  const handleExport = useCallback(async (): Promise<void> => {
    setIsExporting(true);
    try {
      const response = await api.get("/admin/dashboard/export", {
        responseType: "blob",
      });
      const exportDate = todayInTimezone(tz);
      const url = window.URL.createObjectURL(response.data);
      const link = document.createElement("a");
      link.href = url;
      link.download = `dashboard_${exportDate}.xlsx`;
      link.click();
      window.URL.revokeObjectURL(url);
      showSuccess("Dashboard exported.");
    } catch (err) {
      showError(parseApiError(err, "Failed to export dashboard."));
    } finally {
      setIsExporting(false);
    }
  }, [showSuccess, showError, tz]);

  // ─── Date range button handler ────────────────────
  const handleDateRange = useCallback((range: DateRange) => {
    setDateRange(range);
  }, []);

  if (isTopLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between gap-4 mb-6 md:mb-8">
        <div>
          <h1 className="text-xl md:text-2xl font-extrabold text-text">Dashboard</h1>
          <p className="text-sm text-text-secondary mt-1 hidden md:block">
            Here is an overview of your organization.
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          onClick={handleExport}
          isLoading={isExporting}
        >
          <Download size={14} className="mr-1" />
          Export
        </Button>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
        {statCards.map((card: StatCardData) => (
          <button
            key={card.label}
            type="button"
            onClick={() => router.push(card.href)}
            className="bg-card border border-border rounded-xl p-5 text-left hover:bg-surface-hover transition-colors cursor-pointer"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-text-secondary text-xs font-semibold uppercase tracking-wide">
                {card.label}
              </span>
              <div
                className={cn(
                  "flex items-center justify-center h-8 w-8 rounded-lg",
                  card.bgClass,
                  card.colorClass,
                )}
              >
                {card.icon}
              </div>
            </div>
            <div className={cn("text-3xl font-extrabold", card.colorClass)}>
              {card.value}
            </div>
          </button>
        ))}
      </div>

      {/* ─── Filters ─────────────────────────────────── */}
      <div className="flex flex-col md:flex-row flex-wrap md:items-center gap-3 md:gap-4 mb-6">
        {/* Date range buttons */}
        <div className="flex items-center gap-1 bg-surface rounded-lg p-1">
          {([
            { key: "today", label: "Today" },
            { key: "week", label: "This Week" },
            { key: "month", label: "This Month" },
          ] as const).map((btn) => (
            <button
              key={btn.key}
              type="button"
              onClick={() => handleDateRange(btn.key)}
              className={cn(
                "px-3 py-1.5 text-xs font-semibold rounded-md transition-colors",
                dateRange === btn.key
                  ? "bg-accent text-white"
                  : "text-text-secondary hover:text-text hover:bg-surface-hover",
              )}
            >
              {btn.label}
            </button>
          ))}
        </div>

        {/* Store filter */}
        <div className="w-full md:w-48">
          <Select
            options={storeOptions}
            value={selectedStoreId}
            onChange={(e) => setSelectedStoreId(e.target.value)}
            placeholder="Select Store"
          />
        </div>

        {/* Active filter indicator */}
        <span className="text-xs text-text-muted">
          {dateFrom} ~ {dateTo}
          {selectedStoreId && ` | ${storeOptions.find((o) => o.value === selectedStoreId)?.label}`}
        </span>
      </div>

      {/* ─── 2x2 Grid: Dashboard API Widgets ─────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Checklist Completion */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <CheckSquare className="h-4 w-4 text-accent" />
              <h2 className="text-base font-bold text-text">Checklist Completion</h2>
            </div>
            <button
              type="button"
              onClick={() => router.push(`/checklists/instances?work_date=${dateFrom}`)}
              className="text-xs text-accent hover:text-accent-light font-medium flex items-center gap-1 transition-colors"
            >
              View All
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
          {checklistLoading ? (
            <div className="flex items-center justify-center py-8">
              <LoadingSpinner size="sm" />
            </div>
          ) : !checklistCompletion ? (
            <p className="text-sm text-text-muted py-4">No checklist data available.</p>
          ) : (
            <div className="flex items-center gap-6">
              <ProgressRing
                percent={Math.round(checklistCompletion.completion_rate)}
                label="Completion Rate"
              />
              <div className="flex-1 space-y-3">
                <div>
                  <div className="text-xs text-text-muted">Total Schedules</div>
                  <div className="text-lg font-bold text-text">
                    {checklistCompletion.total_assignments}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-text-muted">Completed</div>
                  <div className="text-lg font-bold text-success">
                    {checklistCompletion.completed}
                    <span className="text-text-muted font-normal">
                      {" "}/ {checklistCompletion.total_assignments}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
          {checklistCompletion && checklistCompletion.total_assignments > 0 && (
            <div className="mt-4 pt-3 border-t border-border">
              <div className="flex items-center justify-between text-xs text-text-muted mb-1.5">
                <span>Progress</span>
                <span className="font-bold text-text">
                  {Math.round(checklistCompletion.completion_rate)}%
                </span>
              </div>
              <div className="w-full h-2 bg-surface rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent rounded-full transition-all duration-500"
                  style={{ width: `${Math.round(checklistCompletion.completion_rate)}%` }}
                />
              </div>
            </div>
          )}
        </Card>

        {/* Attendance Summary */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-success" />
              <h2 className="text-base font-bold text-text">Attendance Summary</h2>
            </div>
            <button
              type="button"
              onClick={() => router.push("/attendances")}
              className="text-xs text-accent hover:text-accent-light font-medium flex items-center gap-1 transition-colors"
            >
              View All
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
          {attendanceLoading ? (
            <div className="flex items-center justify-center py-8">
              <LoadingSpinner size="sm" />
            </div>
          ) : !attendanceSummary ? (
            <p className="text-sm text-text-muted py-4">No attendance data available.</p>
          ) : (
            <>
              <div className="space-y-0.5">
                <StatusRow label="Total" count={attendanceSummary.total} color="bg-text-secondary" />
                <StatusRow label="Completed" count={attendanceSummary.completed} color="bg-success" />
                <StatusRow label="Clocked In" count={attendanceSummary.clocked_in} color="bg-warning" />
              </div>
              <div className="mt-4 pt-3 border-t border-border flex items-center justify-between">
                <span className="text-xs text-text-muted">Avg Work Time</span>
                <span className="text-sm font-bold text-text">
                  {attendanceSummary.avg_work_minutes > 0
                    ? `${Math.floor(attendanceSummary.avg_work_minutes / 60)}h ${Math.round(attendanceSummary.avg_work_minutes % 60)}m`
                    : "-- h -- m"}
                </span>
              </div>
            </>
          )}
        </Card>

        {/* Overtime Alerts */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-danger" />
              <h2 className="text-base font-bold text-text">Overtime Alerts</h2>
            </div>
            {overtimeAlertUsers.length > 0 && (
              <Badge variant="danger">{overtimeAlertUsers.length} alert{overtimeAlertUsers.length !== 1 ? "s" : ""}</Badge>
            )}
          </div>
          {overtimeLoading ? (
            <div className="flex items-center justify-center py-8">
              <LoadingSpinner size="sm" />
            </div>
          ) : overtimeAlertUsers.length === 0 ? (
            <div className="py-4 text-center">
              <div className="text-2xl mb-1">&#10003;</div>
              <p className="text-sm text-text-muted">No overtime alerts this period.</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {overtimeAlertUsers.map((u) => (
                <div
                  key={u.user_id}
                  className="flex items-center justify-between py-2 px-2 rounded-lg bg-surface"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-2.5 h-2.5 rounded-full bg-danger" />
                    <span className="text-sm text-text truncate">{u.user_name ?? "-"}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs text-text-muted">
                      {u.total_hours.toFixed(1)}h / {u.max_weekly}h
                    </span>
                    <Badge variant="danger">+{u.over_hours.toFixed(1)}h</Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
          {!overtimeLoading && overtimeSummary?.users && overtimeSummary.users.length > 0 && (
            <div className="mt-4 pt-3 border-t border-border flex items-center justify-between">
              <span className="text-xs text-text-muted">Total Tracked</span>
              <span className="text-sm font-bold text-text">{overtimeSummary.users.length} staff</span>
            </div>
          )}
        </Card>

        {/* Evaluation Summary */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-warning" />
              <h2 className="text-base font-bold text-text">Evaluation Summary</h2>
            </div>
            <button
              type="button"
              onClick={() => router.push("/evaluations")}
              className="text-xs text-accent hover:text-accent-light font-medium flex items-center gap-1 transition-colors"
            >
              View All
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
          {evaluationLoading ? (
            <div className="flex items-center justify-center py-8">
              <LoadingSpinner size="sm" />
            </div>
          ) : !evaluationSummary ? (
            <p className="text-sm text-text-muted py-4">No evaluation data available.</p>
          ) : (
            <>
              <div className="text-center py-2 mb-3">
                <div className="text-4xl font-extrabold text-text">{evaluationSummary.total}</div>
                <p className="text-sm text-text-muted mt-1">total evaluations</p>
              </div>
              <div className="space-y-0.5">
                <StatusRow label="Draft" count={evaluationSummary.draft} color="bg-warning" />
                <StatusRow label="Submitted" count={evaluationSummary.submitted} color="bg-success" />
              </div>
              {evaluationSummary.total > 0 && (
                <div className="mt-4 pt-3 border-t border-border">
                  <div className="flex items-center justify-between text-xs text-text-muted mb-1.5">
                    <span>Submission Rate</span>
                    <span className="font-bold text-text">
                      {Math.round((evaluationSummary.submitted / evaluationSummary.total) * 100)}%
                    </span>
                  </div>
                  <div className="w-full h-2 bg-surface rounded-full overflow-hidden">
                    <div
                      className="h-full bg-success rounded-full transition-all duration-500"
                      style={{
                        width: `${Math.round((evaluationSummary.submitted / evaluationSummary.total) * 100)}%`,
                      }}
                    />
                  </div>
                </div>
              )}
            </>
          )}
        </Card>
      </div>

      {/* Recent Notices */}
      <div className="bg-card border border-border rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-text">Recent Notices</h2>
          <button
            type="button"
            onClick={() => router.push("/notices")}
            className="text-xs text-accent hover:text-accent-light font-medium flex items-center gap-1 transition-colors"
          >
            View All
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
        {recentNotices.length === 0 ? (
          <p className="text-sm text-text-muted py-4">No notices yet.</p>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {recentNotices.map((ann: Notice) => (
              <div
                key={ann.id}
                className="bg-surface border border-border rounded-lg p-4 hover:bg-surface-hover transition-colors cursor-pointer"
                onClick={() => router.push(`/notices/${ann.id}`)}
                role="button"
                tabIndex={0}
                onKeyDown={(e: React.KeyboardEvent) => {
                  if (e.key === "Enter" || e.key === " ") {
                    router.push(`/notices/${ann.id}`);
                  }
                }}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-text truncate">{ann.title}</p>
                    <p className="text-xs text-text-muted mt-1 line-clamp-2">{ann.content}</p>
                  </div>
                  <div className="flex-shrink-0 flex items-center gap-1 text-text-muted">
                    <Calendar className="h-3 w-3" />
                    <span className="text-xs whitespace-nowrap">{formatDate(ann.created_at, tz)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  {ann.store_name && <Badge variant="accent">{ann.store_name}</Badge>}
                  <span className="text-xs text-text-muted">by {ann.created_by_name ?? "Unknown"}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
