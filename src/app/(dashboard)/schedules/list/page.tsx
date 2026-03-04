"use client";

/**
 * 근무 배정 목록 페이지 — 스케줄 > 배정 리스트.
 *
 * 기능:
 * - 매장/직원/기간/상태별 필터링
 * - 배정 테이블 (직원, 매장, 교대, 직책, 날짜, 상태, 진행률)
 * - 초과근무 경고 패널 (매장 선택 시 표시)
 * - 완료 로그 페이지 이동 (날짜 필터 유지)
 * - 페이지네이션 (20건/페이지)
 */

import React, { useState, useCallback, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, AlertTriangle, FileSearch } from "lucide-react";
import { useAssignments } from "@/hooks/useAssignments";
import { useStores } from "@/hooks/useStores";
import { useUsers } from "@/hooks/useUsers";
import { Button, Input, Select, Card, Table, Badge, Pagination } from "@/components/ui";
import { useOvertimeAlerts } from "@/hooks/useOvertimeAlerts";
import type { OvertimeAlert } from "@/hooks/useOvertimeAlerts";
import { formatFixedDate } from "@/lib/utils";
import type { Assignment, Store, User } from "@/types";

/** 상태별 뱃지 색상 매핑 */
const statusBadgeVariant: Record<string, "default" | "warning" | "success"> = {
  assigned: "default",
  in_progress: "warning",
  completed: "success",
};

/** 상태별 표시 라벨 */
const statusLabel: Record<string, string> = {
  assigned: "Assigned",
  in_progress: "In Progress",
  completed: "Completed",
};

const PER_PAGE: number = 20;

/** 배정 목록 컨텐츠 — Suspense 내부에서 useSearchParams 사용 */
function AssignmentsListContent(): React.ReactElement {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [filterStoreId, setFilterStoreId] = useState<string>("");
  const [filterUserId, setFilterUserId] = useState<string>("");
  const [filterDateFrom, setFilterDateFrom] = useState<string>(
    () => searchParams.get("from") ?? "",
  );
  const [filterDateTo, setFilterDateTo] = useState<string>(
    () => searchParams.get("to") ?? "",
  );
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [page, setPage] = useState<number>(1);

  useEffect(() => {
    setFilterDateFrom(searchParams.get("from") ?? "");
    setFilterDateTo(searchParams.get("to") ?? "");
    setPage(1);
  }, [searchParams]);

  const { data: assignmentsData, isLoading } = useAssignments({
    store_id: filterStoreId || undefined,
    user_id: filterUserId || undefined,
    date_from: filterDateFrom || undefined,
    date_to: filterDateTo || undefined,
    status: (filterStatus || undefined) as "assigned" | "in_progress" | "completed" | undefined,
    page,
    per_page: PER_PAGE,
  });
  const { data: stores } = useStores();
  const { data: users } = useUsers();

  // 선택된 매장의 초과근무 경고 조회 (초과시간 > 0인 것만)
  const { data: overtimeAlerts } = useOvertimeAlerts(filterStoreId);
  const activeAlerts: OvertimeAlert[] = (overtimeAlerts ?? []).filter(
    (a: OvertimeAlert) => a.over_hours > 0,
  );

  const assignments: Assignment[] = assignmentsData?.items ?? [];
  const totalPages: number = assignmentsData
    ? Math.ceil(assignmentsData.total / assignmentsData.per_page)
    : 1;

  const storeOptions: { value: string; label: string }[] = [
    { value: "", label: "All Stores" },
    ...(stores ?? []).map((s: Store) => ({ value: s.id, label: s.name })),
  ];

  const userOptions: { value: string; label: string }[] = [
    { value: "", label: "All Workers" },
    ...(users ?? []).map((u: User) => ({ value: u.id, label: u.full_name })),
  ];

  const statusOptions: { value: string; label: string }[] = [
    { value: "", label: "All Status" },
    { value: "assigned", label: "Assigned" },
    { value: "in_progress", label: "In Progress" },
    { value: "completed", label: "Completed" },
  ];

  const columns: {
    key: string;
    header: string;
    render?: (item: Assignment) => React.ReactNode;
    className?: string;
    hideOnMobile?: boolean;
  }[] = [
    { key: "user_name", header: "Worker" },
    { key: "store_name", header: "Store" },
    { key: "shift_name", header: "Shift", hideOnMobile: true },
    { key: "position_name", header: "Position", hideOnMobile: true },
    {
      key: "work_date",
      header: "Date",
      render: (item: Assignment): React.ReactNode => formatFixedDate(item.work_date),
    },
    {
      key: "status",
      header: "Status",
      render: (item: Assignment): React.ReactNode => (
        <Badge variant={statusBadgeVariant[item.status] ?? "default"}>
          {statusLabel[item.status] ?? item.status}
        </Badge>
      ),
    },
    {
      key: "progress",
      header: "Progress",
      render: (item: Assignment): React.ReactNode => {
        const percentage: number =
          item.total_items > 0
            ? Math.round((item.completed_items / item.total_items) * 100)
            : 0;
        return (
          <div className="flex items-center gap-2">
            <div className="w-16 h-1.5 bg-surface rounded-full overflow-hidden">
              <div
                className="h-full bg-accent rounded-full transition-all"
                style={{ width: `${percentage}%` }}
              />
            </div>
            <span className="text-xs text-text-secondary">
              {item.completed_items}/{item.total_items}
            </span>
          </div>
        );
      },
    },
  ];

  const handleRowClick: (item: Assignment) => void = useCallback(
    (item: Assignment): void => {
      router.push(`/schedules/${item.id}`);
    },
    [router],
  );

  /** 완료 로그 페이지로 이동 — 현재 날짜 필터를 쿼리 파라미터로 전달 */
  const handleLogsClick = useCallback((): void => {
    const params = new URLSearchParams();
    if (filterDateFrom) params.set("from", filterDateFrom);
    if (filterDateTo) params.set("to", filterDateTo);
    const query = params.toString();
    router.push(`/schedules/completion-log${query ? `?${query}` : ""}`);
  }, [router, filterDateFrom, filterDateTo]);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          type="button"
          onClick={() => router.push("/schedules")}
          className="p-2 rounded-lg text-text-muted hover:text-text hover:bg-surface-hover transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-2xl font-extrabold text-text flex-1">Schedules</h1>
        <Button variant="secondary" size="sm" onClick={handleLogsClick}>
          <FileSearch size={14} />
          Logs
        </Button>
      </div>

      {/* Filter bar */}
      <Card className="mb-6" padding="p-4">
        <div className="flex flex-col md:flex-row md:items-end gap-3 flex-wrap">
          <div className="w-full md:w-44">
            <Select
              label="Store"
              options={storeOptions}
              value={filterStoreId}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                setFilterStoreId(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <div className="w-full md:w-44">
            <Select
              label="Worker"
              options={userOptions}
              value={filterUserId}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                setFilterUserId(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <div className="grid grid-cols-2 gap-3 md:contents">
            <div className="w-full md:w-40">
              <Input
                label="From"
                type="date"
                value={filterDateFrom}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  setFilterDateFrom(e.target.value);
                  setPage(1);
                }}
              />
            </div>
            <div className="w-full md:w-40">
              <Input
                label="To"
                type="date"
                value={filterDateTo}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  setFilterDateTo(e.target.value);
                  setPage(1);
                }}
              />
            </div>
          </div>
          <div className="w-full md:w-44">
            <Select
              label="Status"
              options={statusOptions}
              value={filterStatus}
              onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
                setFilterStatus(e.target.value);
                setPage(1);
              }}
            />
          </div>
        </div>
      </Card>

      {/* Overtime Alerts Panel */}
      {filterStoreId && activeAlerts.length > 0 && (
        <Card className="mb-6" padding="p-4">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={16} className="text-danger" />
            <h3 className="text-sm font-bold text-text">Overtime Alerts</h3>
            <Badge variant="danger">{activeAlerts.length}</Badge>
          </div>
          <div className="space-y-2">
            {activeAlerts.map((alert: OvertimeAlert) => (
              <div
                key={alert.user_id}
                className="flex items-center justify-between py-2 px-3 rounded-lg bg-surface"
              >
                <span className="text-sm text-text">{alert.user_name}</span>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-text-muted">
                    {alert.total_hours.toFixed(1)}h / {alert.max_weekly}h
                  </span>
                  <Badge variant="danger">+{alert.over_hours.toFixed(1)}h</Badge>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Table */}
      <Card padding="p-0">
        <Table<Assignment>
          columns={columns}
          data={assignments}
          isLoading={isLoading}
          onRowClick={handleRowClick}
          emptyMessage="No assignments found."
        />
      </Card>

      {/* Pagination */}
      <div className="mt-4 flex justify-center">
        <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
      </div>
    </div>
  );
}

export default function AssignmentsListPage(): React.ReactElement {
  return (
    <Suspense>
      <AssignmentsListContent />
    </Suspense>
  );
}
