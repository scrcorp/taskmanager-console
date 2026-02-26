"use client";

/**
 * Checklist Audit Log page — displays audit trail of checklist actions.
 * Filterable by date range. Owner/GM only.
 */

import React, { useState } from "react";
import { FileSearch } from "lucide-react";
import { useAuditLog } from "@/hooks/useAuditLog";
import type { AuditLogEntry } from "@/hooks/useAuditLog";
import { usePermissions } from "@/hooks/usePermissions";
import { PERMISSIONS } from "@/lib/permissions";
import {
  Card,
  Table,
  Pagination,
  EmptyState,
  LoadingSpinner,
} from "@/components/ui";
import { formatDate } from "@/lib/utils";

export default function AuditLogPage(): React.ReactElement {
  const { hasPermission } = usePermissions();
  const [page, setPage] = useState<number>(1);
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const perPage: number = 20;

  const { data, isLoading } = useAuditLog({
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
    page,
    per_page: perPage,
  });

  const items: (AuditLogEntry & { id: string })[] = data?.items ?? [];
  const total: number = data?.total ?? 0;
  const totalPages: number = Math.max(1, Math.ceil(total / perPage));

  if (!hasPermission(PERMISSIONS.AUDIT_LOG_READ)) {
    return (
      <div className="text-center py-12">
        <p className="text-text-secondary">
          You do not have permission to view this page.
        </p>
      </div>
    );
  }

  const columns = [
    {
      key: "completed_at",
      header: "완료 시각",
      render: (item: AuditLogEntry) => (
        <span className="text-xs text-text-secondary whitespace-nowrap">
          {item.completed_at ? formatDate(item.completed_at) : "-"}
        </span>
      ),
    },
    {
      key: "work_date",
      header: "근무일",
      render: (item: AuditLogEntry) => (
        <span className="text-xs text-text-secondary whitespace-nowrap">
          {item.work_date}
        </span>
      ),
    },
    {
      key: "store_name",
      header: "매장",
      render: (item: AuditLogEntry) => (
        <span className="text-sm">{item.store_name}</span>
      ),
    },
    {
      key: "user_name",
      header: "수행자",
      render: (item: AuditLogEntry) => (
        <span className="text-sm font-medium">{item.user_name}</span>
      ),
    },
    {
      key: "item_title",
      header: "체크 항목",
      render: (item: AuditLogEntry) => (
        <span className="text-sm">{item.item_title}</span>
      ),
    },
    {
      key: "note",
      header: "메모",
      render: (item: AuditLogEntry) => (
        <span className="text-xs text-text-muted">{item.note || "-"}</span>
      ),
    },
  ];

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-extrabold text-text">체크리스트 감사 로그</h1>
      </div>

      {/* Date Filters */}
      <div className="flex items-center gap-4 mb-6">
        <div>
          <label
            htmlFor="date-from"
            className="block text-xs font-medium text-text-muted mb-1"
          >
            From
          </label>
          <input
            id="date-from"
            type="date"
            value={dateFrom}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              setDateFrom(e.target.value);
              setPage(1);
            }}
            className="px-3 py-1.5 text-sm bg-surface border border-border rounded-lg text-text focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>
        <div>
          <label
            htmlFor="date-to"
            className="block text-xs font-medium text-text-muted mb-1"
          >
            To
          </label>
          <input
            id="date-to"
            type="date"
            value={dateTo}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
              setDateTo(e.target.value);
              setPage(1);
            }}
            className="px-3 py-1.5 text-sm bg-surface border border-border rounded-lg text-text focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>
        {(dateFrom || dateTo) && (
          <button
            type="button"
            onClick={() => {
              setDateFrom("");
              setDateTo("");
              setPage(1);
            }}
            className="mt-5 text-xs text-accent hover:text-accent-light transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {/* Table */}
      <Card padding="p-0">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <LoadingSpinner size="lg" />
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={<FileSearch className="h-10 w-10" />}
            message="No audit log entries found"
          />
        ) : (
          <Table
            columns={columns}
            data={items}
            emptyMessage="No audit log entries found"
          />
        )}
      </Card>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-6">
          <Pagination
            page={page}
            totalPages={totalPages}
            onPageChange={setPage}
          />
        </div>
      )}
    </div>
  );
}
