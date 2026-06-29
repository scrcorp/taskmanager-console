"use client";

import React from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
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

export interface Column<T> {
  key: string;
  header: string | React.ReactNode;
  render?: (item: T, index: number) => React.ReactNode;
  className?: string;
  hideOnMobile?: boolean;
  sortable?: boolean;
}

interface TableProps<T> {
  columns: Column<T>[];
  data: T[];
  isLoading?: boolean;
  onRowClick?: (item: T) => void;
  emptyMessage?: string;
  rowClassName?: (item: T) => string;
  sortKey?: string;
  sortDirection?: "asc" | "desc";
  onSort?: (key: string) => void;
  /**
   * 행 드래그 정렬 핸들러. 제공 시 각 행 앞에 드래그 핸들이 생기고,
   * 드롭하면 새 id 순서가 콜백으로 전달된다. 미제공 시 기존 동작과 동일.
   * (Opt-in row reorder. When set, rows get a drag handle and dropping emits the new id order.)
   */
  onReorder?: (orderedIds: string[]) => void;
}

/** 드래그 가능한 테이블 행 / Sortable table row (used only when onReorder is set) */
function SortableTableRow<T extends { id?: string }>({
  item,
  rowId,
  columns,
  onRowClick,
  rowClassName,
}: {
  item: T;
  rowId: string;
  columns: Column<T>[];
  onRowClick?: (item: T) => void;
  rowClassName?: (item: T) => string;
}): React.ReactElement {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: rowId });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  return (
    <tr
      ref={setNodeRef}
      style={style}
      onClick={onRowClick ? () => onRowClick(item) : undefined}
      className={cn(
        "border-b border-border transition-colors duration-150",
        onRowClick && "cursor-pointer hover:bg-surface-hover",
        isDragging && "opacity-50 bg-surface shadow-lg",
        rowClassName?.(item),
      )}
    >
      <td className="w-8 px-1 py-3 text-center" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          className="cursor-grab active:cursor-grabbing text-text-muted hover:text-text transition-colors touch-none"
          aria-label="Drag to reorder"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
      </td>
      {columns.map((column: Column<T>, index: number) => (
        <td
          key={column.key}
          className={cn(
            "px-2 md:px-4 py-3 text-text",
            column.hideOnMobile && "hidden md:table-cell",
            column.className,
          )}
        >
          {column.render
            ? column.render(item, index)
            : (() => {
                const val = (item as Record<string, unknown>)[column.key];
                if (val == null) return "";
                if (typeof val === "object") return val as React.ReactNode;
                return String(val);
              })()}
        </td>
      ))}
    </tr>
  );
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
  sortKey,
  sortDirection,
  onSort,
  onReorder,
}: TableProps<T>): React.ReactElement {
  const skeletonRowCount: number = 5;
  const reorderEnabled: boolean = !!onReorder && !isLoading && data.length > 0;
  const totalColSpan: number = columns.length + (reorderEnabled ? 1 : 0);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const rowIds: string[] = data.map(
    (item, i) => ((item as Record<string, unknown>).id as string) || String(i),
  );

  const handleDragEnd = (event: DragEndEvent): void => {
    const { active, over } = event;
    if (!over || active.id === over.id || !onReorder) return;
    const oldIndex = rowIds.indexOf(String(active.id));
    const newIndex = rowIds.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;
    const next = [...rowIds];
    const [moved] = next.splice(oldIndex, 1);
    next.splice(newIndex, 0, moved);
    onReorder(next);
  };

  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            {reorderEnabled && <th className="w-8" aria-hidden />}
            {columns.map((column: Column<T>) => (
              <th
                key={column.key}
                onClick={column.sortable && onSort ? () => onSort(column.key) : undefined}
                className={cn(
                  "px-2 md:px-4 py-3 text-left text-xs font-medium text-text-muted uppercase tracking-wider",
                  column.hideOnMobile && "hidden md:table-cell",
                  column.sortable && onSort && "cursor-pointer select-none hover:text-text transition-colors",
                  column.className,
                )}
              >
                <span className="inline-flex items-center gap-1">
                  {column.header}
                  {column.sortable && onSort && (
                    sortKey === column.key ? (
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className={cn("transition-transform", sortDirection === "desc" && "rotate-180")}>
                        <polyline points="2.5 6 5 3.5 7.5 6" />
                      </svg>
                    ) : (
                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="opacity-30">
                        <polyline points="3 4 5 2 7 4" />
                        <polyline points="3 6 5 8 7 6" />
                      </svg>
                    )
                  )}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        {reorderEnabled ? (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={rowIds} strategy={verticalListSortingStrategy}>
              <tbody>
                {data.map((item: T, index: number) => (
                  <SortableTableRow<T>
                    key={rowIds[index]}
                    item={item}
                    rowId={rowIds[index]}
                    columns={columns}
                    onRowClick={onRowClick}
                    rowClassName={rowClassName}
                  />
                ))}
              </tbody>
            </SortableContext>
          </DndContext>
        ) : (
          <tbody>
            {isLoading ? (
              Array.from({ length: skeletonRowCount }).map((_: unknown, i: number) => (
                <SkeletonRow key={i} columnCount={totalColSpan} />
              ))
            ) : data.length === 0 ? (
              <tr>
                <td
                  colSpan={totalColSpan}
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
                        ? column.render(item, index)
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
        )}
      </table>
    </div>
  );
}
