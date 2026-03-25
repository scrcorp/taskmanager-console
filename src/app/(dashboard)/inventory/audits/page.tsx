"use client";

/**
 * Audit history page — all stores, with store filter.
 */

import React, { useState, useCallback } from "react";
import { useUrlParams } from "@/hooks/useUrlParams";
import { useStoreAudits, useAuditDetail } from "@/hooks/useInventory";
import { useStores } from "@/hooks/useStores";
import {
  Card,
  Table,
  Badge,
  Modal,
  Select,
  Pagination,
  LoadingSpinner,
} from "@/components/ui";
import { formatDate, formatDateTime, cn } from "@/lib/utils";
import type { InventoryAudit, AuditItem, Store } from "@/types";

const PER_PAGE = 20;

function auditStatusBadge(status: InventoryAudit["status"]): {
  variant: "success" | "warning";
  label: string;
} {
  if (status === "completed") return { variant: "success", label: "Completed" };
  return { variant: "warning", label: "In Progress" };
}

export default function AuditsPage(): React.ReactElement {
  const [urlParams, setUrlParams] = useUrlParams({ store: "", page: "1" });
  const storeId = urlParams.store;
  const page = Number(urlParams.page);
  const [selectedAuditId, setSelectedAuditId] = useState<string | null>(null);

  const { data: stores } = useStores();
  const storeOptions = [
    { value: "", label: "All Stores" },
    ...(stores ?? []).map((s: Store) => ({ value: s.id, label: s.name })),
  ];

  const effectiveStoreId = storeId || stores?.[0]?.id || "";
  const { data: auditsData, isLoading } = useStoreAudits(effectiveStoreId, { page, per_page: PER_PAGE });
  const { data: auditDetail, isLoading: isDetailLoading } = useAuditDetail(
    effectiveStoreId,
    selectedAuditId ?? undefined,
  );

  const audits: InventoryAudit[] = auditsData?.items ?? [];
  const totalPages = auditsData ? Math.ceil(auditsData.total / auditsData.per_page) : 1;
  const auditItems: AuditItem[] = auditDetail?.items ?? [];

  const columns: { key: string; header: string; render?: (item: InventoryAudit) => React.ReactNode }[] = [
    { key: "started_at", header: "Date", render: (item) => <span className="text-sm text-text-secondary">{formatDate(item.started_at)}</span> },
    { key: "auditor", header: "Auditor", render: (item) => <span className="text-sm text-text">{item.audited_by_name ?? "—"}</span> },
    { key: "status", header: "Status", render: (item) => { const b = auditStatusBadge(item.status); return <Badge variant={b.variant}>{b.label}</Badge>; } },
    { key: "items", header: "Items", render: (item) => <span className="text-sm text-text-secondary">{item.items_checked}</span> },
    { key: "disc", header: "Discrepancies", render: (item) => <span className={cn("text-sm font-medium", item.discrepancy_count > 0 ? "text-danger" : "text-success")}>{item.discrepancy_count}</span> },
    { key: "completed", header: "Completed", render: (item) => <span className="text-xs text-text-muted">{item.completed_at ? formatDateTime(item.completed_at) : "—"}</span> },
  ];

  return (
    <div>
      <h1 className="text-2xl font-extrabold text-text mb-6">Audit History</h1>

      <Card className="mb-6" padding="p-4">
        <div className="w-full md:w-48">
          <Select
            label="Store"
            options={storeOptions}
            value={storeId}
            onChange={(e) => setUrlParams({ store: e.target.value, page: "1" })}
          />
        </div>
      </Card>

      <Card padding="p-0">
        <Table<InventoryAudit>
          columns={columns}
          data={audits}
          isLoading={isLoading}
          onRowClick={useCallback((item: InventoryAudit) => setSelectedAuditId(item.id), [])}
          emptyMessage="No audits found."
        />
      </Card>

      <div className="mt-4 flex justify-center">
        <Pagination page={page} totalPages={totalPages} onPageChange={(p) => setUrlParams({ page: String(p) })} />
      </div>

      <Modal isOpen={selectedAuditId !== null} onClose={() => setSelectedAuditId(null)} title="Audit Detail" size="lg">
        {isDetailLoading ? (
          <div className="flex justify-center py-10"><LoadingSpinner /></div>
        ) : auditDetail ? (
          <div className="flex flex-col gap-4">
            <div className="flex gap-4 flex-wrap text-sm">
              <div><span className="text-text-muted">Date: </span><span className="text-text">{formatDate(auditDetail.started_at)}</span></div>
              <div><span className="text-text-muted">Auditor: </span><span className="text-text">{auditDetail.audited_by_name ?? "—"}</span></div>
              <div><span className="text-text-muted">Items: </span><span className="text-text">{auditDetail.items_checked}</span></div>
              <div><span className="text-text-muted">Discrepancies: </span><span className={auditDetail.discrepancy_count > 0 ? "text-danger font-bold" : "text-success"}>{auditDetail.discrepancy_count}</span></div>
            </div>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface">
                    <th className="px-3 py-2 text-left text-xs font-semibold text-text-secondary">Product</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-text-secondary">System</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-text-secondary">Actual</th>
                    <th className="px-3 py-2 text-right text-xs font-semibold text-text-secondary">Diff</th>
                  </tr>
                </thead>
                <tbody>
                  {auditItems.length === 0 ? (
                    <tr><td colSpan={4} className="px-3 py-8 text-center text-text-muted text-xs">No items.</td></tr>
                  ) : auditItems.map((item) => (
                    <tr key={item.id} className={cn("border-b border-border/60 last:border-b-0", item.difference < 0 && "bg-danger-muted/20", item.difference > 0 && "bg-success-muted/20")}>
                      <td className="px-3 py-2"><div className="font-medium text-text">{item.product_name}</div><div className="text-xs text-text-muted font-mono">{item.product_code}</div></td>
                      <td className="px-3 py-2 text-right text-text-secondary">{item.system_quantity}</td>
                      <td className="px-3 py-2 text-right text-text-secondary">{item.actual_quantity}</td>
                      <td className={cn("px-3 py-2 text-right font-semibold", item.difference > 0 ? "text-success" : item.difference < 0 ? "text-danger" : "text-text-muted")}>{item.difference > 0 ? "+" : ""}{item.difference}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
