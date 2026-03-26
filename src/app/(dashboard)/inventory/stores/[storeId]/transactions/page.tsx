"use client";

/**
 * 매장 입출고 히스토리 페이지.
 *
 * Transaction history with filters: Product, Type (All/Stock In/Stock Out/Adjustment), Date range.
 * Table shows: Date, Product, Type Badge, Quantity (+/-), Before, After, Reason, By.
 */

import React from "react";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { useUrlParams } from "@/hooks/useUrlParams";
import { useStoreTransactions } from "@/hooks/useInventory";
import { useStores } from "@/hooks/useStores";
import {
  Button,
  Card,
  Table,
  Badge,
  Select,
  Input,
  Pagination,
} from "@/components/ui";
import { formatDateTime } from "@/lib/utils";
import { cn } from "@/lib/utils";
import type { InventoryTransaction, Store } from "@/types";

const PER_PAGE = 30;

/** 트랜잭션 타입 뱃지 (Transaction type badge) */
function typeBadge(type: InventoryTransaction["type"]): {
  variant: "success" | "warning" | "accent" | "info";
  label: string;
} {
  if (type === "stock_in") return { variant: "success", label: "Stock In" };
  if (type === "stock_out") return { variant: "warning", label: "Stock Out" };
  if (type === "audit") return { variant: "info", label: "Audit" };
  return { variant: "accent", label: "Adjustment" };
}

export default function TransactionsPage(): React.ReactElement {
  const params = useParams<{ storeId: string }>();
  const storeId = params.storeId;
  const router = useRouter();

  const [urlParams, setUrlParams] = useUrlParams({
    product_id: "",
    type: "",
    date_from: "",
    date_to: "",
    page: "1",
  });
  const filterProductId = urlParams.product_id;
  const filterType = urlParams.type as "" | "stock_in" | "stock_out" | "adjustment";
  const filterDateFrom = urlParams.date_from;
  const filterDateTo = urlParams.date_to;
  const page = Number(urlParams.page);

  const { data: stores } = useStores();
  const { data: txData, isLoading } = useStoreTransactions(storeId, {
    product_id: filterProductId || undefined,
    type: filterType || undefined,
    date_from: filterDateFrom || undefined,
    date_to: filterDateTo || undefined,
    page,
    per_page: PER_PAGE,
  });

  const store: Store | undefined = (stores ?? []).find((s) => s.id === storeId);
  const transactions: InventoryTransaction[] = txData?.items ?? [];
  const totalPages = txData ? Math.ceil(txData.total / txData.per_page) : 1;

  const typeOptions = [
    { value: "", label: "All Types" },
    { value: "stock_in", label: "Stock In" },
    { value: "stock_out", label: "Stock Out" },
    { value: "adjustment", label: "Adjustment" },
    { value: "audit", label: "Audit" },
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
        const colorClass = isIn
          ? "text-success"
          : isOut
          ? "text-danger"
          : item.quantity >= 0
          ? "text-success"
          : "text-danger";

        const subDisplay =
          item.sub_unit && item.sub_unit_ratio
            ? ` (${Math.floor(Math.abs(item.quantity) / item.sub_unit_ratio)} ${item.sub_unit})`
            : "";

        return (
          <span className={cn("font-medium text-sm", colorClass)}>
            {sign}{Math.abs(item.quantity)} ea{subDisplay}
          </span>
        );
      },
    },
    {
      key: "before_quantity",
      header: "Before",
      render: (item) => (
        <span className="text-sm text-text-secondary">{item.before_quantity}</span>
      ),
    },
    {
      key: "after_quantity",
      header: "After",
      render: (item) => (
        <span className="text-sm text-text-secondary">{item.after_quantity}</span>
      ),
    },
    {
      key: "reason",
      header: "Reason",
      render: (item) => (
        <span className="text-xs text-text-secondary">{item.reason ?? "—"}</span>
      ),
    },
    {
      key: "created_by_name",
      header: "By",
      render: (item) => (
        <span className="text-xs text-text-secondary">{item.created_by_name ?? "—"}</span>
      ),
    },
  ];

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
          <h1 className="text-2xl font-extrabold text-text">Transaction History</h1>
          {store && (
            <p className="text-sm text-text-secondary mt-0.5">{store.name}</p>
          )}
        </div>
      </div>

      {/* Filter bar */}
      <Card className="mb-6" padding="p-4">
        <div className="flex flex-col md:flex-row md:items-end gap-3 flex-wrap">
          <div className="w-full md:w-44">
            <Select
              label="Type"
              options={typeOptions}
              value={filterType}
              onChange={(e) => setUrlParams({ type: e.target.value, page: null })}
            />
          </div>
          <div>
            <Input
              label="Date From"
              type="date"
              value={filterDateFrom}
              onChange={(e) => setUrlParams({ date_from: e.target.value, page: null })}
            />
          </div>
          <div>
            <Input
              label="Date To"
              type="date"
              value={filterDateTo}
              onChange={(e) => setUrlParams({ date_to: e.target.value, page: null })}
            />
          </div>
        </div>
      </Card>

      {/* Table */}
      <Card padding="p-0">
        <Table<InventoryTransaction>
          columns={columns}
          data={transactions}
          isLoading={isLoading}
          emptyMessage="No transactions found."
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
    </div>
  );
}
