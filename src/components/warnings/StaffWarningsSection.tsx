"use client";

/**
 * Staff detail — Warnings section (bottom of the staff profile page).
 *
 * Lists this staff member's warnings as a record; a row opens the warning
 * detail page. "New Warning" goes to the full-page form locked to this person.
 * Only mounted for viewers with warnings:read (the parent gates).
 */
import React from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button, Table, Badge, EmptyState } from "@/components/ui";
import type { Column } from "@/components/ui/Table";
import { usePermissions } from "@/hooks/usePermissions";
import { PERMISSIONS } from "@/lib/permissions";
import { useWarnings } from "@/hooks/useWarnings";
import type { Warning } from "@/types";
import { CategoryChips } from "./CategoryChips";

function fmtDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

interface Props {
  userId: string;
  userName?: string;
}

export function StaffWarningsSection({ userId }: Props): React.ReactElement {
  const router = useRouter();
  const { hasPermission } = usePermissions();
  const canCreate = hasPermission(PERMISSIONS.WARNINGS_CREATE);

  const { data, isLoading } = useWarnings({ subject_user_id: userId, per_page: 50 });
  const items = data?.items ?? [];
  const active = items.filter((w) => w.status === "active").length;

  const columns: Column<Warning>[] = [
    {
      key: "ref",
      header: "Ref",
      className: "w-20",
      render: (w) => <span className="text-xs font-semibold text-text-secondary tabular-nums">{w.ref_no}</span>,
    },
    {
      key: "warning",
      header: "Warning",
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
    <div className="bg-card border border-border rounded-xl p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-bold text-text">Warnings</h2>
          <span className="inline-flex h-5 min-w-[22px] items-center justify-center rounded-full bg-surface-hover px-1.5 text-xs font-bold text-text-secondary tabular-nums">
            {items.length}
          </span>
          {active > 0 && <span className="text-xs text-text-muted">· {active} active</span>}
        </div>
        {canCreate && (
          <Button variant="secondary" size="sm" onClick={() => router.push(`/warnings/new?subject=${userId}`)} className="gap-1.5">
            <Plus className="h-4 w-4" />
            New Warning
          </Button>
        )}
      </div>

      {!isLoading && items.length === 0 ? (
        <EmptyState message="No warnings on record for this staff member." />
      ) : (
        <Table
          columns={columns}
          data={items}
          isLoading={isLoading}
          onRowClick={(w) => router.push(`/warnings/${w.id}`)}
          emptyMessage="No warnings on record."
        />
      )}
    </div>
  );
}
