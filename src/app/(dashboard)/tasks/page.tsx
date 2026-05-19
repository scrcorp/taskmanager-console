"use client";

/**
 * Tasks (work items) 목록 페이지 — additional_tasks 후신.
 *
 * Task list page with store/status filters.
 */

import React, { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Zap, Plus, MapPin, User, Calendar, FileText } from "lucide-react";

import { useTasks } from "@/hooks/useTasks";
import { useStores } from "@/hooks/useStores";
import { useLookupReportTemplate } from "@/hooks/useReports";
import { usePermissions } from "@/hooks/usePermissions";
import { Badge, Button, Card, ClearButton, LoadingSpinner, Pagination } from "@/components/ui";
import { formatFixedDate } from "@/lib/utils";
import { PERMISSIONS } from "@/lib/permissions";
import type { Task, Store } from "@/types";

const PER_PAGE = 50;

const statusBadge: Record<
  string,
  { label: string; variant: "warning" | "accent" | "success" | "default" }
> = {
  pending: { label: "Pending", variant: "warning" },
  in_progress: { label: "In Progress", variant: "accent" },
  under_review: { label: "Under review", variant: "warning" },
  completed: { label: "Completed", variant: "success" },
};

const severityBadge: Record<
  string,
  { label: string; variant: "default" | "warning" | "danger" | "accent" }
> = {
  low: { label: "Low", variant: "default" },
  medium: { label: "Medium", variant: "accent" },
  high: { label: "High", variant: "warning" },
  critical: { label: "Critical", variant: "danger" },
};

const priorityBadge: Record<string, { label: string; variant: "danger" | "default" }> = {
  urgent: { label: "Urgent", variant: "danger" },
  normal: { label: "Normal", variant: "default" },
};

export default function TasksPage(): React.ReactElement {
  const router = useRouter();
  const { hasPermission } = usePermissions();
  const [storeId, setStoreId] = useState<string>("");
  const [status, setStatus] = useState<string>("");
  const [category, setCategory] = useState<string>("");
  const [page, setPage] = useState<number>(1);

  const { data: stores } = useStores();
  const { data, isLoading } = useTasks({
    store_id: storeId || undefined,
    status: status || undefined,
    category: category || undefined,
    page,
    per_page: PER_PAGE,
  });

  // Store 선택 시 그 매장 template categories 가져와서 필터 옵션으로.
  // 매장 안 골랐으면 org default template 의 categories.
  const { data: issueTemplate } = useLookupReportTemplate(
    "issue",
    storeId || undefined,
  );
  const categoryOptions = useMemo<{ code: string; label: string }[]>(() => {
    const cats =
      (issueTemplate?.payload as
        | { categories?: { code: string; label: string; is_active?: boolean }[] }
        | undefined)?.categories ?? [];
    return cats
      .filter((c) => c.is_active !== false)
      .map((c) => ({ code: c.code, label: c.label }));
  }, [issueTemplate]);
  // store 변경 시 category 리셋 (옵션 셋이 달라질 수 있음)
  React.useEffect(() => {
    setCategory("");
  }, [storeId]);

  const tasks: Task[] = data?.items ?? [];
  const total: number = data?.total ?? 0;
  const totalPages: number = Math.max(1, Math.ceil(total / PER_PAGE));

  const activeStores: Store[] = useMemo(
    () => (stores ?? []).filter((s: Store) => s.is_active !== false),
    [stores],
  );

  const canCreate = hasPermission(PERMISSIONS.TASKS_CREATE);

  const clearFilters = () => {
    setStoreId("");
    setStatus("");
    setCategory("");
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text">Tasks</h1>
          <p className="text-textSecondary text-sm mt-1">
            Operational work items. Track progress, assign owners, and complete.
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => router.push("/tasks/new")} className="gap-2">
            <Plus className="w-4 h-4" />
            New Task
          </Button>
        )}
      </div>

      <Card className="p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <select
            value={storeId}
            onChange={(e) => {
              setStoreId(e.target.value);
              setPage(1);
            }}
            className="bg-surface border border-border rounded-md px-3 py-2 text-sm text-text"
          >
            <option value="">All stores</option>
            {activeStores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            className="bg-surface border border-border rounded-md px-3 py-2 text-sm text-text"
          >
            <option value="">All statuses</option>
            <option value="pending">Pending</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
          </select>
          <select
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setPage(1);
            }}
            className="bg-surface border border-border rounded-md px-3 py-2 text-sm text-text"
          >
            <option value="">All categories</option>
            {categoryOptions.map((c) => (
              <option key={c.code} value={c.code}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex justify-end">
          <ClearButton onClick={clearFilters} label="Clear filters" />
        </div>
      </Card>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <LoadingSpinner />
        </div>
      ) : tasks.length === 0 ? (
        <Card className="p-12 text-center text-textSecondary">
          <Zap className="w-10 h-10 mx-auto mb-3 opacity-50" />
          <p>No tasks match your filters.</p>
        </Card>
      ) : (
        <div className="space-y-2">
          {tasks.map((i) => {
            const sb = statusBadge[i.status] ?? { label: i.status, variant: "default" as const };
            const pb = priorityBadge[i.priority] ?? { label: i.priority, variant: "default" as const };
            const sv = i.severity ? severityBadge[i.severity] : null;
            return (
              <Card
                key={i.id}
                onClick={() => router.push(`/tasks/${i.id}`)}
                className="p-4 hover:bg-surfaceHover cursor-pointer transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant={sb.variant}>{sb.label}</Badge>
                      {i.priority === "urgent" && <Badge variant={pb.variant}>{pb.label}</Badge>}
                      {sv && <Badge variant={sv.variant}>{sv.label}</Badge>}
                      {i.category && (
                        <Badge variant="default">
                          {categoryOptions.find((c) => c.code === i.category)?.label ??
                            i.category}
                        </Badge>
                      )}
                      {i.source_report_id && (
                        <Badge variant="accent">
                          <FileText className="w-3 h-3 inline mr-1" />
                          From report
                        </Badge>
                      )}
                    </div>
                    <h3 className="text-text font-semibold truncate">{i.title}</h3>
                    {i.description && (
                      <p className="text-textSecondary text-sm mt-1 line-clamp-2">
                        {i.description}
                      </p>
                    )}
                    <div className="flex items-center gap-4 mt-2 text-xs text-textMuted flex-wrap">
                      {i.store_name && (
                        <span className="flex items-center gap-1">
                          <MapPin className="w-3 h-3" />
                          {i.store_name}
                        </span>
                      )}
                      {i.assignees.length > 0 && (
                        <span className="flex items-center gap-1">
                          <User className="w-3 h-3" />
                          {i.assignees.map((a) => a.user_name).filter(Boolean).join(", ")}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {formatFixedDate(i.created_at)}
                      </span>
                      {i.due_date && (
                        <span className="flex items-center gap-1 text-warning">
                          Due {formatFixedDate(i.due_date)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
      )}
    </div>
  );
}
