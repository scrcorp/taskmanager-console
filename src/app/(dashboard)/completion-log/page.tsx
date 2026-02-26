"use client";

import React, { useState, useMemo, useEffect, Suspense } from "react";
import { FileSearch, ChevronUp, ChevronDown } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useCompletionLog } from "@/hooks/useCompletionLog";
import type { CompletionLogEntry } from "@/hooks/useCompletionLog";
import { usePermissions } from "@/hooks/usePermissions";
import { useStores } from "@/hooks/useStores";
import { useUsers } from "@/hooks/useUsers";
import { PERMISSIONS } from "@/lib/permissions";
import {
  Card,
  Pagination,
  EmptyState,
  LoadingSpinner,
} from "@/components/ui";
import { formatFixedDate, formatDateTime } from "@/lib/utils";

type SortDir = "asc" | "desc" | null;
type SortEntry = { key: string; dir: "asc" | "desc" };

function SortArrows({ active, dir }: { active: boolean; dir: SortDir }) {
  return (
    <span className="inline-flex flex-col ml-1 -space-y-1">
      <ChevronUp
        className={`h-3 w-3 ${active && dir === "asc" ? "text-accent" : "text-text-muted/40"}`}
      />
      <ChevronDown
        className={`h-3 w-3 ${active && dir === "desc" ? "text-accent" : "text-text-muted/40"}`}
      />
    </span>
  );
}

function CompletionLogContent(): React.ReactElement {
  const { hasPermission } = usePermissions();
  const searchParams = useSearchParams();

  const [page, setPage] = useState<number>(1);
  const [dateFrom, setDateFrom] = useState<string>(
    () => searchParams.get("from") ?? "",
  );
  const [dateTo, setDateTo] = useState<string>(
    () => searchParams.get("to") ?? "",
  );
  const [storeId, setStoreId] = useState<string>("");
  const [userId, setUserId] = useState<string>("");
  const [sort, setSort] = useState<SortEntry[]>([]);
  const perPage: number = 20;

  // Sync when query params change
  useEffect(() => {
    setDateFrom(searchParams.get("from") ?? "");
    setDateTo(searchParams.get("to") ?? "");
    setPage(1);
  }, [searchParams]);

  const { data: stores } = useStores();
  const { data: users } = useUsers();

  const { data, isLoading } = useCompletionLog({
    store_id: storeId || undefined,
    user_id: userId || undefined,
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
    page,
    per_page: perPage,
  });

  const items: (CompletionLogEntry & { id: string })[] = data?.items ?? [];
  const total: number = data?.total ?? 0;
  const totalPages: number = Math.max(1, Math.ceil(total / perPage));

  const handleSort = (key: string) => {
    setSort((prev) => {
      const existing = prev.find((s) => s.key === key);
      if (!existing) return [...prev, { key, dir: "asc" }];
      if (existing.dir === "asc") return prev.map((s) => s.key === key ? { key, dir: "desc" } : s);
      return prev.filter((s) => s.key !== key);
    });
  };

  const sortedItems = useMemo(() => {
    if (sort.length === 0) return items;
    return [...items].sort((a, b) => {
      for (const { key, dir } of sort) {
        const aVal = (a as unknown as Record<string, unknown>)[key];
        const bVal = (b as unknown as Record<string, unknown>)[key];
        const aStr = aVal == null ? "" : String(aVal);
        const bStr = bVal == null ? "" : String(bVal);
        const cmp = aStr.localeCompare(bStr);
        if (cmp !== 0) return dir === "asc" ? cmp : -cmp;
      }
      return 0;
    });
  }, [items, sort]);

  const hasFilters = dateFrom || dateTo || storeId || userId;

  const clearFilters = () => {
    setDateFrom("");
    setDateTo("");
    setStoreId("");
    setUserId("");
    setPage(1);
  };

  if (!hasPermission(PERMISSIONS.AUDIT_LOG_READ)) {
    return (
      <div className="text-center py-12">
        <p className="text-text-secondary">
          You do not have permission to view this page.
        </p>
      </div>
    );
  }

  type ColDef = {
    key: string;
    header: string;
    sortable: boolean;
    render: (item: CompletionLogEntry) => React.ReactNode;
    className?: string;
  };

  const columns: ColDef[] = [
    {
      key: "work_date",
      header: "Work Date",
      sortable: true,
      render: (item) => (
        <span className="text-xs text-text-secondary whitespace-nowrap">
          {formatFixedDate(item.work_date)}
        </span>
      ),
    },
    {
      key: "store_name",
      header: "Store",
      sortable: true,
      render: (item) => <span className="text-sm">{item.store_name}</span>,
    },
    {
      key: "user_name",
      header: "Completed By",
      sortable: true,
      render: (item) => (
        <span className="text-sm font-medium">{item.user_name}</span>
      ),
    },
    {
      key: "item_title",
      header: "Checklist Item",
      sortable: true,
      render: (item) => <span className="text-sm">{item.item_title}</span>,
      className: "min-w-[200px]",
    },
    {
      key: "note",
      header: "Note",
      sortable: false,
      render: (item) => (
        <span className="text-xs text-text-muted">{item.note || "-"}</span>
      ),
    },
    {
      key: "completed_at",
      header: "Completed At",
      sortable: true,
      render: (item) => (
        <span className="text-xs text-text-secondary whitespace-nowrap">
          {item.completed_at ? formatDateTime(item.completed_at) : "-"}
        </span>
      ),
    },
  ];

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-extrabold text-text">Completion Log</h1>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-4 mb-6">
        <div>
          <label
            htmlFor="filter-store"
            className="block text-xs font-medium text-text-muted mb-1"
          >
            Store
          </label>
          <select
            id="filter-store"
            value={storeId}
            onChange={(e) => { setStoreId(e.target.value); setPage(1); }}
            className="px-3 py-1.5 text-sm bg-surface border border-border rounded-lg text-text focus:outline-none focus:ring-1 focus:ring-accent min-w-[140px]"
          >
            <option value="">All Stores</option>
            {stores?.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="filter-user"
            className="block text-xs font-medium text-text-muted mb-1"
          >
            User
          </label>
          <select
            id="filter-user"
            value={userId}
            onChange={(e) => { setUserId(e.target.value); setPage(1); }}
            className="px-3 py-1.5 text-sm bg-surface border border-border rounded-lg text-text focus:outline-none focus:ring-1 focus:ring-accent min-w-[140px]"
          >
            <option value="">All Users</option>
            {users?.map((u) => (
              <option key={u.id} value={u.id}>{u.full_name}</option>
            ))}
          </select>
        </div>

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
            onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
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
            onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
            className="px-3 py-1.5 text-sm bg-surface border border-border rounded-lg text-text focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>

        {hasFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="text-xs text-accent hover:text-accent-light transition-colors pb-1"
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
        ) : sortedItems.length === 0 ? (
          <EmptyState
            icon={<FileSearch className="h-10 w-10" />}
            message="No completion log entries found"
          />
        ) : (
          <div className="w-full overflow-x-auto">
            <table className="w-full text-sm table-fixed">
              <thead>
                <tr className="border-b border-border">
                  {columns.map((col) => (
                    <th
                      key={col.key}
                      className={`px-4 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider ${col.sortable ? "cursor-pointer select-none hover:text-text-secondary" : ""} ${col.className ?? ""}`}
                      onClick={col.sortable ? () => handleSort(col.key) : undefined}
                    >
                      <span className="inline-flex items-center">
                        {col.header}
                        {col.sortable && (
                          <SortArrows
                            active={sort.some((s) => s.key === col.key)}
                            dir={sort.find((s) => s.key === col.key)?.dir ?? null}
                          />
                        )}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedItems.map((item) => (
                  <tr
                    key={item.id}
                    className="border-b border-border transition-colors duration-150"
                  >
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        className={`px-4 py-3 text-text ${col.className ?? ""}`}
                      >
                        {col.render(item)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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

export default function CompletionLogPage(): React.ReactElement {
  return (
    <Suspense>
      <CompletionLogContent />
    </Suspense>
  );
}
