"use client";

/**
 * Warnings — staff disciplinary records across stores (the warnings hub).
 *
 * List + filters + table; "New Warning" goes to the full-page form; a row opens
 * the form-document detail page. Data comes from `useWarnings.ts`.
 */
import React from "react";
import { useRouter } from "next/navigation";
import { Plus, SlidersHorizontal } from "lucide-react";

import { usePermissions } from "@/hooks/usePermissions";
import { usePersistedFilters } from "@/hooks/usePersistedFilters";
import { useStores } from "@/hooks/useStores";
import { useWarnings } from "@/hooks/useWarnings";
import { useWarningCategories } from "@/hooks/useWarningCategories";
import { useModal } from "@/components/ui/imperative-modal";
import { Button, Table, Select, Badge, Pagination } from "@/components/ui";
import type { Column } from "@/components/ui/Table";
import { PERMISSIONS } from "@/lib/permissions";
import type { Warning, WarningFilters } from "@/types";

import { CategoryChips } from "@/components/warnings/CategoryChips";
import { WarningCategoryManager } from "@/components/warnings/WarningCategoryManager";

function fmtDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function StatCard({ label, value, accent }: { label: string; value: number; accent?: string }): React.ReactElement {
  return (
    <div className="flex-1 min-w-[140px] rounded-xl border border-border bg-card px-5 py-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-text-muted">{label}</div>
      <div className="mt-1.5 text-3xl font-extrabold leading-none" style={accent ? { color: accent } : undefined}>
        {value}
      </div>
    </div>
  );
}

export default function WarningsPage(): React.ReactElement {
  const router = useRouter();
  const modal = useModal();
  const { hasPermission, isOwner } = usePermissions();
  const canCreate = hasPermission(PERMISSIONS.WARNINGS_CREATE);

  const { data: stores } = useStores();
  const { data: categories } = useWarningCategories();
  // Filter dropdown offers the visible (non-hidden) categories, by sort order.
  const categoryOptions = (categories ?? [])
    .filter((c) => !c.is_hidden)
    .map((c) => ({ value: c.code, label: c.label }));

  function openCategoryManager() {
    void modal.open(() => <WarningCategoryManager />, {
      title: "Warning categories",
      size: "md",
    });
  }

  const [filters, setFilters] = usePersistedFilters("warnings", {
    store: "",
    status: "",
    category: "",
    page: "1",
  });
  const page = Number(filters.page) || 1;

  const listFilters: WarningFilters = {
    store_id: filters.store || undefined,
    status: filters.status || undefined,
    category: filters.category || undefined,
    page,
    per_page: 20,
  };
  const { data, isLoading } = useWarnings(listFilters);

  // Lightweight stats (scoped to the brand filter).
  const allQ = useWarnings({ store_id: filters.store || undefined, per_page: 1 });
  const activeQ = useWarnings({ store_id: filters.store || undefined, status: "active", per_page: 1 });
  const total = allQ.data?.total ?? 0;
  const active = activeQ.data?.total ?? 0;

  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / 20));

  const columns: Column<Warning>[] = [
    {
      key: "employee",
      header: "Employee",
      render: (w) => (
        <div className="min-w-0">
          <div className="truncate font-semibold text-text">{w.subject_name ?? "Unknown"}</div>
          <div className="truncate text-xs text-text-muted">by {w.issued_by_name ?? "—"}</div>
        </div>
      ),
    },
    {
      key: "store",
      header: "Brand",
      hideOnMobile: true,
      render: (w) => <span className="text-sm text-text-secondary">{w.store_name ?? "—"}</span>,
    },
    {
      key: "warning",
      header: "Subject",
      render: (w) => (
        <div className="min-w-0">
          <div className="truncate font-medium text-text">{w.title}</div>
          {w.details && <div className="truncate text-xs text-text-muted">{w.details}</div>}
        </div>
      ),
    },
    {
      key: "categories",
      header: "Categories",
      hideOnMobile: true,
      render: (w) => <CategoryChips categories={w.categories} max={2} short />,
    },
    {
      key: "date",
      header: "Date",
      hideOnMobile: true,
      render: (w) => <span className="whitespace-nowrap text-sm text-text-secondary">{fmtDate(w.warning_date)}</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (w) => (
        <Badge variant={w.status === "active" ? "warning" : "default"}>
          {w.status === "active" ? "Active" : "Withdrawn"}
        </Badge>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text">Warnings</h1>
          <p className="mt-1 text-sm text-text-secondary">Disciplinary records across your brands</p>
        </div>
        <div className="flex items-center gap-2">
          {isOwner && (
            <Button variant="secondary" size="lg" onClick={openCategoryManager} className="gap-1.5">
              <SlidersHorizontal className="h-4 w-4" />
              Manage categories
            </Button>
          )}
          {canCreate && (
            <Button variant="primary" size="lg" onClick={() => router.push("/warnings/new")} className="gap-1.5">
              <Plus className="h-4 w-4" />
              New Warning
            </Button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="flex flex-wrap gap-4">
        <StatCard label="Total" value={total} />
        <StatCard label="Active" value={active} accent="var(--color-warning, #FDCB6E)" />
        <StatCard label="Withdrawn" value={Math.max(0, total - active)} accent="var(--color-text-muted, #5A5C6F)" />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-48">
          <Select
            options={[{ value: "", label: "All brands" }, ...(stores ?? []).map((s) => ({ value: s.id, label: s.name }))]}
            value={filters.store}
            onChange={(e) => setFilters({ store: e.target.value || null, page: "1" })}
          />
        </div>
        <div className="w-48">
          <Select
            options={[{ value: "", label: "All categories" }, ...categoryOptions]}
            value={filters.category}
            onChange={(e) => setFilters({ category: e.target.value || null, page: "1" })}
          />
        </div>
        <div className="w-40">
          <Select
            options={[
              { value: "", label: "All status" },
              { value: "active", label: "Active" },
              { value: "withdrawn", label: "Withdrawn" },
            ]}
            value={filters.status}
            onChange={(e) => setFilters({ status: e.target.value || null, page: "1" })}
          />
        </div>
      </div>

      {/* Table */}
      <Table
        columns={columns}
        data={data?.items ?? []}
        isLoading={isLoading}
        onRowClick={(w) => router.push(`/warnings/${w.id}`)}
        emptyMessage="No warnings match these filters."
      />

      {totalPages > 1 && (
        <Pagination
          page={page}
          totalPages={totalPages}
          onPageChange={(p) => setFilters({ page: String(p) })}
        />
      )}
    </div>
  );
}
