"use client";

/**
 * 재고조사 히스토리 페이지.
 *
 * Audit history table with row-click detail modal.
 * Detail modal shows per-item discrepancies with color highlights.
 */

import React, { useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { usePersistedFilters } from "@/hooks/usePersistedFilters";
import { useStoreAudits, useAuditDetail } from "@/hooks/useInventory";
import { useStores } from "@/hooks/useStores";
import {
  Card,
  Table,
  Badge,
  Modal,
  Pagination,
  LoadingSpinner,
} from "@/components/ui";
import { formatDate, formatDateTime } from "@/lib/utils";
import { cn } from "@/lib/utils";
import type { InventoryAudit, AuditItem, Store } from "@/types";

const PER_PAGE = 20;

/** 조사 상태 Badge 매핑 (Audit status badge mapping) */
function auditStatusBadge(status: InventoryAudit["status"]): {
  variant: "success" | "warning";
  label: string;
} {
  if (status === "completed") return { variant: "success", label: "Completed" };
  return { variant: "warning", label: "In Progress" };
}

export default function AuditsPage(): React.ReactElement {
  const params = useParams<{ storeId: string }>();
  const storeId = params.storeId;
  const router = useRouter();

  const [urlParams, setUrlParams] = usePersistedFilters("inventory.store.audits", { page: "1" });
  const page = Number(urlParams.page);

  const [selectedAuditId, setSelectedAuditId] = useState<string | null>(null);

  const { data: stores } = useStores();
  const { data: auditsData, isLoading } = useStoreAudits(storeId, {
    page,
    per_page: PER_PAGE,
  });
  const { data: auditDetail, isLoading: isDetailLoading } = useAuditDetail(
    storeId,
    selectedAuditId ?? undefined,
  );

  const store: Store | undefined = (stores ?? []).find((s) => s.id === storeId);
  const audits: InventoryAudit[] = auditsData?.items ?? [];
  const totalPages = auditsData ? Math.ceil(auditsData.total / auditsData.per_page) : 1;

  const auditItems: AuditItem[] = auditDetail?.items ?? [];

  const columns: {
    key: string;
    header: string;
    render?: (item: InventoryAudit) => React.ReactNode;
  }[] = [
    {
      key: "started_at",
      header: "Date",
      render: (item) => (
        <span className="text-sm text-text-secondary">
          {formatDate(item.started_at)}
        </span>
      ),
    },
    {
      key: "created_by_name",
      header: "By",
      render: (item) => (
        <span className="text-sm text-text">{item.created_by_name ?? "—"}</span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (item) => {
        const { variant, label } = auditStatusBadge(item.status);
        return <Badge variant={variant}>{label}</Badge>;
      },
    },
    {
      key: "items_checked",
      header: "Items Checked",
      render: (item) => (
        <span className="text-sm text-text-secondary">{item.items_count ?? item.items_checked ?? 0}</span>
      ),
    },
    {
      key: "discrepancy_count",
      header: "Discrepancies",
      render: (item) => (
        <span
          className={cn(
            "text-sm font-medium",
            item.discrepancies ?? item.discrepancy_count ?? 0 > 0 ? "text-danger" : "text-success",
          )}
        >
          {item.discrepancies ?? item.discrepancy_count ?? 0}
        </span>
      ),
    },
    {
      key: "completed_at",
      header: "Completed At",
      render: (item) => (
        <span className="text-xs text-text-muted">
          {item.completed_at ? formatDateTime(item.completed_at) : "—"}
        </span>
      ),
    },
  ];

  const handleRowClick = useCallback((item: InventoryAudit) => {
    setSelectedAuditId(item.id);
  }, []);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          type="button"
          onClick={() => router.push(`/inventory/stores/${storeId}`)}
          className="p-1.5 rounded-lg text-text-secondary hover:text-text hover:bg-surface-hover transition-colors"
        >
          <ChevronLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-extrabold text-text">Audit History</h1>
          {store && (
            <p className="text-sm text-text-secondary mt-0.5">{store.name}</p>
          )}
        </div>
      </div>

      {/* Table */}
      <Card padding="p-0">
        <Table<InventoryAudit>
          columns={columns}
          data={audits}
          isLoading={isLoading}
          onRowClick={handleRowClick}
          emptyMessage="No audits found."
        />
      </Card>

      {/* Pagination */}
      <div className="mt-4 flex justify-center">
        <Pagination
          page={page}
          totalPages={totalPages}
          onPageChange={(p) => setUrlParams({ page: String(p) })}
        />
      </div>

      {/* Audit Detail Modal */}
      <Modal
        isOpen={selectedAuditId !== null}
        onClose={() => setSelectedAuditId(null)}
        title="Audit Detail"
        size="lg"
      >
        {isDetailLoading ? (
          <div className="flex justify-center py-10">
            <LoadingSpinner />
          </div>
        ) : auditDetail ? (
          <div className="flex flex-col gap-4">
            {/* Summary row */}
            <div className="flex gap-4 flex-wrap text-sm">
              <div>
                <span className="text-text-muted">Date: </span>
                <span className="text-text">{formatDate(auditDetail.started_at)}</span>
              </div>
              <div>
                <span className="text-text-muted">Auditor: </span>
                <span className="text-text">{auditDetail.created_by_name ?? "—"}</span>
              </div>
              <div>
                <span className="text-text-muted">Items: </span>
                <span className="text-text">{auditDetail.items_count ?? auditDetail.items_checked ?? 0}</span>
              </div>
              <div>
                <span className="text-text-muted">Discrepancies: </span>
                <span
                  className={
                    auditDetail.discrepancies ?? auditDetail.discrepancy_count ?? 0 > 0 ? "text-danger font-bold" : "text-success"
                  }
                >
                  {auditDetail.discrepancies ?? auditDetail.discrepancy_count ?? 0}
                </span>
              </div>
            </div>

            {/* Items table */}
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface">
                    <th className="px-3 py-2 text-left text-xs font-semibold text-text-secondary">
                      Product
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-text-secondary">
                      System Qty
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-text-secondary">
                      Actual Qty
                    </th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-text-secondary">
                      Difference
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {auditItems.length === 0 ? (
                    <tr>
                      <td
                        colSpan={4}
                        className="px-3 py-8 text-center text-text-muted text-xs"
                      >
                        No items in this audit.
                      </td>
                    </tr>
                  ) : (
                    auditItems.map((item) => {
                      const hasDiff = item.difference !== 0;
                      return (
                        <tr
                          key={item.id}
                          className={cn(
                            "border-b border-border/60 last:border-b-0",
                            hasDiff && item.difference < 0 && "bg-danger-muted/20",
                            hasDiff && item.difference > 0 && "bg-success-muted/20",
                          )}
                        >
                          <td className="px-3 py-2">
                            <div className="font-medium text-text">
                              {item.product_name ?? "—"}
                            </div>
                            <div className="text-xs text-text-muted font-mono">
                              {item.product_code}
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right text-text-secondary">
                            {item.system_quantity}
                          </td>
                          <td className="px-3 py-2 text-right text-text-secondary">
                            {item.actual_quantity}
                          </td>
                          <td
                            className={cn(
                              "px-3 py-2 text-right font-semibold",
                              item.difference > 0
                                ? "text-success"
                                : item.difference < 0
                                ? "text-danger"
                                : "text-text-muted",
                            )}
                          >
                            {item.difference > 0 ? "+" : ""}
                            {item.difference}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
