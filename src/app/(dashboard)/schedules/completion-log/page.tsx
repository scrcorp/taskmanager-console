"use client";

/**
 * 체크리스트 완료 로그 페이지 — 스케줄 > 완료 이력 조회.
 *
 * 기능:
 * - 매장/기간별 필터링 + 사용자 이름 검색
 * - 정렬 가능한 테이블 (날짜, 매장, 완료자, 체크리스트 항목, 메모, 완료시각)
 * - 권한 체크: AUDIT_LOG_READ 권한 필요
 * - 페이지네이션 (20건/페이지)
 */

import React, { useState, useMemo, useEffect, Suspense } from "react";
import { FileSearch, ChevronUp, ChevronDown, ArrowLeft, Search } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCompletionLog } from "@/hooks/useCompletionLog";
import type { CompletionLogEntry } from "@/hooks/useCompletionLog";
import { usePermissions } from "@/hooks/usePermissions";
import { useStores } from "@/hooks/useStores";
import { PERMISSIONS } from "@/lib/permissions";
import {
  Card,
  Pagination,
  EmptyState,
  LoadingSpinner,
  ClearButton,
} from "@/components/ui";
import { formatFixedDate, formatDateTime } from "@/lib/utils";

/** 정렬 방향 타입 */
type SortDir = "asc" | "desc" | null;

/** 현재 정렬 상태 — 컬럼 키 + 방향 */
interface SortState {
  key: string;
  dir: SortDir;
}

/** 정렬 화살표 아이콘 — 활성 컬럼은 accent 색상으로 표시 */
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

/** 완료 로그 컨텐츠 — Suspense 내부에서 useSearchParams 사용 */
function CompletionLogContent(): React.ReactElement {
  const router = useRouter();
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
  const [userSearch, setUserSearch] = useState<string>("");
  const [sort, setSort] = useState<SortState>({ key: "", dir: null });
  const perPage: number = 20;

  // Sync when query params change
  useEffect(() => {
    setDateFrom(searchParams.get("from") ?? "");
    setDateTo(searchParams.get("to") ?? "");
    setPage(1);
  }, [searchParams]);

  const { data: stores } = useStores();

  const { data, isLoading } = useCompletionLog({
    store_id: storeId || undefined,
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
    page,
    per_page: perPage,
  });

  const items: (CompletionLogEntry & { id: string })[] = data?.items ?? [];
  const total: number = data?.total ?? 0;
  const totalPages: number = Math.max(1, Math.ceil(total / perPage));

  /** 정렬 토글 — asc → desc → 해제 순환 */
  const handleSort = (key: string) => {
    setSort((prev) => {
      if (prev.key !== key) return { key, dir: "asc" };
      if (prev.dir === "asc") return { key, dir: "desc" };
      return { key: "", dir: null };
    });
  };

  // 정렬 + 사용자 이름 검색 적용된 아이템 목록
  const sortedItems = useMemo(() => {
    let result = items;
    if (sort.key && sort.dir) {
      result = [...result].sort((a, b) => {
        const aVal = (a as unknown as Record<string, unknown>)[sort.key];
        const bVal = (b as unknown as Record<string, unknown>)[sort.key];
        const aStr = aVal == null ? "" : String(aVal);
        const bStr = bVal == null ? "" : String(bVal);
        const cmp = aStr.localeCompare(bStr);
        return sort.dir === "asc" ? cmp : -cmp;
      });
    }
    if (userSearch.trim()) {
      const q = userSearch.trim().toLowerCase();
      result = result.filter((item) => item.user_name.toLowerCase().includes(q));
    }
    return result;
  }, [items, sort, userSearch]);

  const hasFilters = dateFrom || dateTo || storeId;

  const clearFilters = () => {
    setDateFrom("");
    setDateTo("");
    setStoreId("");
    setUserSearch("");
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
      <div className="flex items-center gap-3 mb-6">
        <button
          type="button"
          onClick={() => router.push("/schedules/list")}
          className="p-2 rounded-lg text-text-muted hover:text-text hover:bg-surface-hover transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <h1 className="text-2xl font-extrabold text-text">Completion Log</h1>
      </div>

      {/* Filters */}
      <div className="flex items-end justify-between gap-4 mb-6">
        <div className="flex flex-wrap items-end gap-4">
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

          {hasFilters && <ClearButton onClick={clearFilters} />}
        </div>

        {/* User search */}
        <div>
          <label
            htmlFor="user-search"
            className="block text-xs font-medium text-text-muted mb-1"
          >
            User
          </label>
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
            <input
              id="user-search"
              type="text"
              placeholder="Search user..."
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              className="pl-8 pr-3 py-1.5 text-sm bg-surface border border-border rounded-lg text-text focus:outline-none focus:ring-1 focus:ring-accent w-44"
            />
          </div>
        </div>
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
                            active={sort.key === col.key}
                            dir={sort.key === col.key ? sort.dir : null}
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
