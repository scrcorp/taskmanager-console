"use client";

import React from "react";
import { cn } from "@/lib/utils";

/**
 * 제네릭 테이블 컴포넌트 -- 타입 안전한 데이터 테이블입니다.
 *
 * Generic typed data table component with loading skeleton and empty state support.
 *
 * @param columns - 테이블 컬럼 정의 배열 (Array of column definitions)
 * @param data - 테이블 데이터 배열 (Array of data items)
 * @param isLoading - 로딩 상태 (Loading state for skeleton display)
 * @param onRowClick - 행 클릭 핸들러 (Row click handler)
 * @param emptyMessage - 데이터 없을 때 메시지 (Message when data is empty)
 */

interface Column<T> {
  key: string;
  header: string | React.ReactNode;
  render?: (item: T) => React.ReactNode;
  className?: string;
  hideOnMobile?: boolean;
}

interface TableProps<T> {
  columns: Column<T>[];
  data: T[];
  isLoading?: boolean;
  onRowClick?: (item: T) => void;
  emptyMessage?: string;
  rowClassName?: (item: T) => string;
}

function SkeletonRow({ columnCount }: { columnCount: number }): React.ReactElement {
  return (
    <tr className="border-b border-border">
      {Array.from({ length: columnCount }).map((_: unknown, i: number) => (
        <td key={i} className="px-2 md:px-4 py-3">
          <div className="h-4 bg-surface-hover rounded animate-pulse" />
        </td>
      ))}
    </tr>
  );
}

export function Table<T extends { id?: string }>({
  columns,
  data,
  isLoading = false,
  onRowClick,
  emptyMessage = "No data available.",
  rowClassName,
}: TableProps<T>): React.ReactElement {
  const skeletonRowCount: number = 5;

  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            {columns.map((column: Column<T>) => (
              <th
                key={column.key}
                className={cn(
                  "px-2 md:px-4 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider",
                  column.hideOnMobile && "hidden md:table-cell",
                  column.className,
                )}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            Array.from({ length: skeletonRowCount }).map((_: unknown, i: number) => (
              <SkeletonRow key={i} columnCount={columns.length} />
            ))
          ) : data.length === 0 ? (
            <tr>
              <td
                colSpan={columns.length}
                className="px-4 py-12 text-center text-text-muted"
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map((item: T, index: number) => (
              <tr
                key={(item as Record<string, unknown>).id as string || index}
                onClick={onRowClick ? () => onRowClick(item) : undefined}
                className={cn(
                  "border-b border-border transition-colors duration-150",
                  onRowClick && "cursor-pointer hover:bg-surface-hover",
                  rowClassName?.(item),
                )}
              >
                {columns.map((column: Column<T>) => (
                  <td
                    key={column.key}
                    className={cn(
                      "px-2 md:px-4 py-3 text-text",
                      column.hideOnMobile && "hidden md:table-cell",
                      column.className,
                    )}
                  >
                    {column.render
                      ? column.render(item)
                      : (() => {
                          const val = (item as Record<string, unknown>)[column.key];
                          if (val == null) return "";
                          if (typeof val === "object") return val as React.ReactNode;
                          return String(val);
                        })()}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
