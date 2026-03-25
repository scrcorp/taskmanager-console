"use client";

/**
 * Transaction history page — all stores, with store filter.
 */

import React from "react";
import { useUrlParams } from "@/hooks/useUrlParams";
import { useStoreTransactions } from "@/hooks/useInventory";
import { useStores } from "@/hooks/useStores";
import {
  Card,
  Table,
  Badge,
  Select,
  Input,
  Pagination,
} from "@/components/ui";
import { formatDateTime, cn } from "@/lib/utils";
import type { InventoryTransaction, Store } from "@/types";

const PER_PAGE = 30;

function typeBadge(type: InventoryTransaction["type"]): {
  variant: "success" | "warning" | "accent";
  label: string;
} {
  if (type === "stock_in") return { variant: "success", label: "Stock In" };
  if (type === "stock_out") return { variant: "warning", label: "Stock Out" };
  return { variant: "accent", label: "Adjustment" };
}

export default function TransactionsPage(): React.ReactElement {
  const [urlParams, setUrlParams] = useUrlParams({
    store: "",
    type: "",
    page: "1",
  });
  const storeId = urlParams.store;
  const filterType = urlParams.type as "" | "stock_in" | "stock_out" | "adjustment";
  const page = Number(urlParams.page);

  const { data: stores } = useStores();
  const storeOptions = [
    { value: "", label: "All Stores" },
    ...(stores ?? []).map((s: Store) => ({ value: s.id, label: s.name })),
  ];

  const { data: txData, isLoading } = useStoreTransactions(
    storeId || (stores?.[0]?.id ?? ""),
    {
      type: filterType || undefined,
      page,
      per_page: PER_PAGE,
    },
  );

  const transactions: InventoryTransaction[] = txData?.items ?? [];
  const totalPages = txData ? Math.ceil(txData.total / txData.per_page) : 1;

  const typeOptions = [
    { value: "", label: "All Types" },
    { value: "stock_in", label: "Stock In" },
    { value: "stock_out", label: "Stock Out" },
    { value: "adjustment", label: "Adjustment" },
  ];

  const columns: {
    key: string;
    header: string;
    render?: (item: InventoryTransaction) => React.ReactNode;
    className?: string;
  }[] = [
    {
      key: "created_at",
      header: "Date",
      render: (item) => (
        <span className="text-xs text-text-secondary whitespace-nowrap">
          {formatDateTime(item.created_at)}
        </span>
      ),
    },
    {
      key: "product_name",
      header: "Product",
      className: "min-w-[140px]",
      render: (item) => (
        <div>
          <div className="text-sm font-medium text-text">{item.product_name ?? "—"}</div>
          <div className="text-xs text-text-muted font-mono">{item.product_code}</div>
        </div>
      ),
    },
    {
      key: "type",
      header: "Type",
      render: (item) => {
        const { variant, label } = typeBadge(item.type);
        return <Badge variant={variant}>{label}</Badge>;
      },
    },
    {
      key: "quantity",
      header: "Qty",
      render: (item) => {
        const isIn = item.type === "stock_in";
        const isOut = item.type === "stock_out";
        const sign = isIn ? "+" : isOut ? "-" : item.quantity >= 0 ? "+" : "";
        const colorClass = isIn ? "text-success" : isOut ? "text-danger" : item.quantity >= 0 ? "text-success" : "text-danger";
        return (
          <span className={cn("font-medium text-sm", colorClass)}>
            {sign}{Math.abs(item.quantity)} ea
          </span>
        );
      },
    },
    {
      key: "before_quantity",
      header: "Before",
      render: (item) => <span className="text-sm text-text-secondary">{item.before_quantity}</span>,
    },
    {
      key: "after_quantity",
      header: "After",
      render: (item) => <span className="text-sm text-text-secondary">{item.after_quantity}</span>,
    },
    {
      key: "reason",
      header: "Reason",
      render: (item) => <span className="text-xs text-text-secondary">{item.reason ?? "—"}</span>,
    },
    {
      key: "created_by_name",
      header: "By",
      render: (item) => <span className="text-xs text-text-secondary">{item.created_by_name ?? "—"}</span>,
    },
  ];

  return (
    <div>
      <h1 className="text-2xl font-extrabold text-text mb-6">Transaction History</h1>

      <Card className="mb-6" padding="p-4">
        <div className="flex flex-col md:flex-row md:items-end gap-3 flex-wrap">
          <div className="w-full md:w-48">
            <Select
              label="Store"
              options={storeOptions}
              value={storeId}
              onChange={(e) => setUrlParams({ store: e.target.value, page: "1" })}
            />
          </div>
          <div className="w-full md:w-44">
            <Select
              label="Type"
              options={typeOptions}
              value={filterType}
              onChange={(e) => setUrlParams({ type: e.target.value, page: "1" })}
            />
          </div>
        </div>
      </Card>

      <Card padding="p-0">
        <Table<InventoryTransaction>
          columns={columns}
          data={transactions}
          isLoading={isLoading}
          emptyMessage="No transactions found."
        />
      </Card>

      <div className="mt-4 flex justify-center">
        <Pagination
          page={page}
          totalPages={totalPages}
          onPageChange={(p) => setUrlParams({ page: String(p) })}
        />
      </div>
    </div>
  );
}
