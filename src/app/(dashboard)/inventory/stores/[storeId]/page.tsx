"use client";

/**
 * 매장 재고 현황 페이지.
 *
 * Store inventory page — status summary cards (clickable filters), inventory table,
 * row-click detail modal, and multi-select add products modal (Step1 + Step2).
 */

import React, { useState, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { useUrlParams } from "@/hooks/useUrlParams";
import { useDebounce } from "@/hooks/useDebounce";
import {
  Plus,
  Star,
  Package,
  ChevronRight,
  History,
  Search,
  Store as StoreIcon,
  ArrowLeft,
  Pencil,
} from "lucide-react";
import {
  useStoreInventory,
  useStoreInventorySummary,
  useBulkAddStoreInventory,
  useUpdateStoreInventoryItem,
  useCategories,
  useAddableProducts,
  useCreateProduct,
  useRemoveStoreInventoryItem,
  useCreateTransaction,
} from "@/hooks/useInventory";
import { useStores } from "@/hooks/useStores";
import { usePermissions } from "@/hooks/usePermissions";
import { PERMISSIONS } from "@/lib/permissions";
import {
  Button,
  Card,
  Table,
  Badge,
  Modal,
  Select,
  Input,
  Pagination,
  ConfirmDialog,
} from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { parseApiError, formatDateTime } from "@/lib/utils";
import { cn } from "@/lib/utils";
import { ProductForm, type ProductFormData } from "@/components/inventory/ProductForm";
import type {
  StoreInventoryItem,
  InventoryProduct,
  InventoryCategory,
  Store,
} from "@/types";

const PER_PAGE = 30;

/** 재고 상태에 따른 Badge 정보 */
function stockBadge(item: StoreInventoryItem): {
  variant: "success" | "warning" | "danger";
  label: string;
} {
  if (item.current_quantity <= 0) return { variant: "danger", label: "Out" };
  if (item.current_quantity <= item.min_quantity) return { variant: "warning", label: "Low" };
  return { variant: "success", label: "OK" };
}

/** 선택된 제품의 설정 (Step 2) */
interface SelectedProductConfig {
  product_id: string;
  product_name: string;
  min_quantity: string;
  initial_quantity: string;
  is_frequent: boolean;
}

export default function StoreInventoryPage(): React.ReactElement {
  const params = useParams<{ storeId: string }>();
  const storeId = params.storeId;
  const router = useRouter();
  const { toast } = useToast();
  const { hasPermission } = usePermissions();
  const canManage = hasPermission(PERMISSIONS.INVENTORY_CREATE);
  const canDelete = hasPermission(PERMISSIONS.INVENTORY_DELETE);

  // -- URL-persisted filters --
  const [urlParams, setUrlParams] = useUrlParams({
    category: "",
    search: "",
    search_field: "all",
    stock: "",
    frequent: "",
    page: "1",
    sort_by: "",
    sort_dir: "asc",
  });
  const filterCategory = urlParams.category;
  const filterSearchField = urlParams.search_field || "all";
  const filterStock = urlParams.stock as "" | "in_stock" | "low_stock" | "out_of_stock";
  const filterFrequent = urlParams.frequent === "1";
  const page = Number(urlParams.page);
  const sortBy = urlParams.sort_by || "";
  const sortDir = (urlParams.sort_dir === "desc" ? "desc" : "asc") as "asc" | "desc";

  /** Sort cycle: not sorted → asc → desc → not sorted. */
  const handleSort = (key: string) => {
    if (sortBy !== key) {
      setUrlParams({ sort_by: key, sort_dir: "asc", page: null });
    } else if (sortDir === "asc") {
      setUrlParams({ sort_dir: "desc" });
    } else {
      setUrlParams({ sort_by: null, sort_dir: null });
    }
  };

  // Local search input state — debounced before passing to API
  const [searchInput, setSearchInput] = useState(urlParams.search);
  const debouncedSearch = useDebounce(searchInput, 300);

  // Sync debounced search to URL params
  React.useEffect(() => {
    if (debouncedSearch !== urlParams.search) {
      setUrlParams({ search: debouncedSearch, page: null });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const filterSearch = urlParams.search;

  // -- Detail modal --
  const [detailItem, setDetailItem] = useState<StoreInventoryItem | null>(null);
  const [removeItemId, setRemoveItemId] = useState<string | null>(null);

  // -- Multi-select state — preserved across page navigation. --
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [bulkRemoveOpen, setBulkRemoveOpen] = useState(false);

  // -- Edit modal state — opened from row's Edit button or detail modal.
  //    The actual form lives inside <EditItemModal> so per-row hooks
  //    (useCreateTransaction needs item id at hook init) work cleanly.
  const [editItem, setEditItem] = useState<StoreInventoryItem | null>(null);
  const openEdit = (item: StoreInventoryItem) => setEditItem(item);
  const toggleItemSelect = (id: string) => {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleSelectAllOnPage = () => {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      const pageIds = items.map((i) => i.id);
      const allOnPageSelected = pageIds.every((id) => next.has(id));
      if (allOnPageSelected) pageIds.forEach((id) => next.delete(id));
      else pageIds.forEach((id) => next.add(id));
      return next;
    });
  };
  const clearItemSelection = () => setSelectedItemIds(new Set());

  // -- Add products modal (Step 1: select, Step 2: configure, Step "create": inline product creation) --
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [addStep, setAddStep] = useState<1 | 2 | "create">(1);
  const [addSearch, setAddSearch] = useState("");
  const debouncedAddSearch = useDebounce(addSearch, 300);
  const [selectedProducts, setSelectedProducts] = useState<SelectedProductConfig[]>([]);
  const [createFormData, setCreateFormData] = useState<ProductFormData | null>(null);

  // -- Data --
  const { data: stores } = useStores();
  const { data: categoriesRaw } = useCategories();
  const { data: summaryData } = useStoreInventorySummary(storeId);
  const { data: inventoryData, isLoading } = useStoreInventory(storeId, {
    category_id: filterCategory || undefined,
    search: filterSearch || undefined,
    search_field: filterSearchField as "all" | "name" | "code",
    stock_status: filterStock || undefined,
    is_frequent: filterFrequent || undefined,
    page,
    per_page: PER_PAGE,
    sort_by: sortBy || undefined,
    sort_dir: sortBy ? sortDir : undefined,
  });

  // 제품 검색 (Step 1 모달) — 무한 스크롤. 서버가 is_in_store 플래그 + 안추가 우선 정렬.
  const addableProductsQuery = useAddableProducts(
    storeId,
    debouncedAddSearch,
    isAddOpen && addStep === 1,
  );
  const isSearchFetching = addableProductsQuery.isFetching;

  const bulkAdd = useBulkAddStoreInventory(storeId);
  const removeItem = useRemoveStoreInventoryItem(storeId);
  const updateItem = useUpdateStoreInventoryItem(storeId);
  const createProduct = useCreateProduct();

  const store: Store | undefined = (stores ?? []).find((s) => s.id === storeId);
  const items: StoreInventoryItem[] = inventoryData?.items ?? [];
  const totalPages = inventoryData ? Math.ceil(inventoryData.total / inventoryData.per_page) : 1;

  const isPageAllSelected =
    items.length > 0 && items.every((it) => selectedItemIds.has(it.id));

  const topLevelCategories: InventoryCategory[] = (categoriesRaw ?? []).filter(
    (c) => !c.parent_id,
  );

  // 현재 페이지의 store inventory product IDs — table row UX용. Add 모달은 서버의
  // is_in_store 플래그를 쓰므로 페이지네이션 영향을 받지 않는다.
  const existingProductIds = useMemo(
    () => new Set(items.map((i) => i.product_id)),
    [items],
  );

  // Step 1 모달용: 무한 스크롤 페이지들을 평탄화
  const addableItems = useMemo(
    () => addableProductsQuery.data?.pages.flatMap((p) => p.items) ?? [],
    [addableProductsQuery.data],
  );

  // IntersectionObserver — 마지막 row 보이면 다음 페이지 로드
  const sentinelRef = React.useRef<HTMLDivElement | null>(null);
  React.useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver((entries) => {
      const entry = entries[0];
      if (
        entry.isIntersecting &&
        addableProductsQuery.hasNextPage &&
        !addableProductsQuery.isFetchingNextPage
      ) {
        addableProductsQuery.fetchNextPage();
      }
    }, { rootMargin: "100px" });
    observer.observe(el);
    return () => observer.disconnect();
  }, [addableProductsQuery, addableItems.length]);

  const categoryFilterOptions = [
    { value: "", label: "All Categories" },
    ...topLevelCategories.map((c) => ({ value: c.id, label: c.name })),
  ];

  const storeOptions = [
    ...(stores ?? []).map((s: Store) => ({ value: s.id, label: s.name })),
  ];

  /** 테이블 컬럼 */
  const columns: {
    key: string;
    header: string | React.ReactNode;
    render?: (item: StoreInventoryItem, index: number) => React.ReactNode;
    className?: string;
    sortable?: boolean;
  }[] = [
    ...(canDelete
      ? [
          {
            key: "select",
            header: (
              <input
                type="checkbox"
                checked={isPageAllSelected}
                onChange={toggleSelectAllOnPage}
                className="w-4 h-4 accent-accent cursor-pointer"
              />
            ),
            className: "w-10",
            render: (item: StoreInventoryItem): React.ReactNode => (
              <div onClick={(e) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={selectedItemIds.has(item.id)}
                  onChange={() => toggleItemSelect(item.id)}
                  className="w-4 h-4 accent-accent cursor-pointer"
                />
              </div>
            ),
          },
        ]
      : []),
    {
      key: "no",
      header: "No",
      className: "w-12 text-text-muted",
      render: (_item, index) => (
        <span className="text-xs text-text-muted">
          {(page - 1) * PER_PAGE + index + 1}
        </span>
      ),
    },
    {
      key: "image",
      header: "",
      render: (item) =>
        item.product_image_url ? (
          <img
            src={item.product_image_url}
            alt={item.product_name ?? ""}
            className="w-9 h-9 object-cover rounded-lg border border-border"
          />
        ) : (
          <div className="w-9 h-9 rounded-lg border border-border bg-surface flex items-center justify-center">
            <Package size={14} className="text-text-muted" />
          </div>
        ),
    },
    {
      key: "name",
      header: "Product",
      className: "min-w-[140px]",
      sortable: true,
      render: (item) => (
        <div>
          <div className="font-medium text-text text-sm">{item.product_name}</div>
          <div className="text-xs text-text-muted font-mono">{item.product_code}</div>
        </div>
      ),
    },
    {
      key: "current_quantity",
      header: "Current Qty",
      sortable: true,
      render: (item) => {
        const subDisplay =
          item.sub_unit && item.sub_unit_ratio
            ? ` (${Math.floor(item.current_quantity / item.sub_unit_ratio)} ${item.sub_unit})`
            : "";
        const isLow = item.current_quantity <= item.min_quantity;
        return (
          <span className={cn("text-sm font-medium", isLow ? "text-danger" : "text-text")}>
            {item.current_quantity} ea{subDisplay}
          </span>
        );
      },
    },
    {
      key: "min_quantity",
      header: "Min Qty",
      sortable: true,
      render: (item) => (
        <span className="text-sm text-text-secondary">{item.min_quantity} ea</span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (item) => {
        const { variant, label } = stockBadge(item);
        return <Badge variant={variant}>{label}</Badge>;
      },
    },
    {
      key: "is_frequent",
      header: "Frequent",
      sortable: true,
      render: (item) => (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            updateItem.mutate({ id: item.id, is_frequent: !item.is_frequent });
          }}
          className={cn(
            "p-1 rounded transition-colors",
            item.is_frequent
              ? "text-warning hover:text-warning/80"
              : "text-text-muted hover:text-warning",
          )}
          title={item.is_frequent ? "Marked as frequent" : "Mark as frequent"}
        >
          <Star size={14} fill={item.is_frequent ? "currentColor" : "none"} />
        </button>
      ),
    },
    {
      key: "last_audited_at",
      header: "Last Audited",
      sortable: true,
      render: (item) => (
        <span className="text-xs text-text-muted">
          {item.last_audited_at ? formatDateTime(item.last_audited_at) : "Never"}
        </span>
      ),
    },
    ...(canManage || canDelete
      ? [
          {
            key: "actions",
            header: "Actions",
            render: (item: StoreInventoryItem): React.ReactNode => (
              <div className="flex gap-1">
                {canManage && (
                  <button
                    type="button"
                    onClick={(e: React.MouseEvent) => {
                      e.stopPropagation();
                      openEdit(item);
                    }}
                    className="px-2 py-1 rounded text-xs text-accent hover:bg-accent-muted transition-colors cursor-pointer inline-flex items-center gap-1"
                    title="Edit"
                  >
                    <Pencil size={12} />
                    Edit
                  </button>
                )}
                {canDelete && (
                  <button
                    type="button"
                    onClick={(e: React.MouseEvent) => {
                      e.stopPropagation();
                      setRemoveItemId(item.id);
                    }}
                    className="px-2 py-1 rounded text-xs text-danger hover:bg-danger-muted transition-colors cursor-pointer"
                  >
                    Remove
                  </button>
                )}
              </div>
            ),
          },
        ]
      : []),
  ];

  const handleRowClick = useCallback((item: StoreInventoryItem) => {
    setDetailItem(item);
  }, []);

  // -- Summary card click handlers --
  const handleSummaryCardClick = useCallback(
    (status: "" | "in_stock" | "low_stock" | "out_of_stock") => {
      setUrlParams({ stock: status, page: null });
    },
    [setUrlParams],
  );

  // -- Add products modal --
  const handleOpenAdd = () => {
    setAddStep(1);
    setAddSearch("");
    setSelectedProducts([]);
    setCreateFormData(null);
    setIsAddOpen(true);
  };

  const handleCreateProductInModal = useCallback(() => {
    if (!createFormData || !createFormData.name.trim()) {
      toast({ type: "error", message: "Product name is required." });
      return;
    }
    const payload = {
      name: createFormData.name.trim(),
      code: !createFormData.auto_code && createFormData.code.trim() ? createFormData.code.trim() : undefined,
      auto_code: createFormData.auto_code,
      category_id: createFormData.category_id || undefined,
      subcategory_id: createFormData.subcategory_id || undefined,
      sub_unit: createFormData.sub_unit || undefined,
      sub_unit_ratio: createFormData.sub_unit && createFormData.sub_unit_ratio
        ? Number(createFormData.sub_unit_ratio)
        : undefined,
      image_url: createFormData.image_url || undefined,
      description: createFormData.description.trim() || undefined,
    };

    createProduct.mutate(payload, {
      onSuccess: (newProduct) => {
        toast({ type: "success", message: "Product created." });
        // Auto-select the newly created product and go back to selection
        setSelectedProducts((prev) => [
          ...prev,
          {
            product_id: newProduct.id,
            product_name: newProduct.name,
            min_quantity: "0",
            initial_quantity: "0",
            is_frequent: false,
          },
        ]);
        setAddStep(1);
        setCreateFormData(null);
      },
      onError: (err) => {
        toast({ type: "error", message: parseApiError(err, "Failed to create product.") });
      },
    });
  }, [createFormData, createProduct, toast]);

  const handleToggleSelect = (product: InventoryProduct) => {
    setSelectedProducts((prev) => {
      const exists = prev.find((p) => p.product_id === product.id);
      if (exists) {
        return prev.filter((p) => p.product_id !== product.id);
      }
      return [
        ...prev,
        {
          product_id: product.id,
          product_name: product.name,
          min_quantity: "0",
          initial_quantity: "0",
          is_frequent: false,
        },
      ];
    });
  };

  const handleProceedToStep2 = () => {
    if (selectedProducts.length === 0) {
      toast({ type: "error", message: "Select at least one product." });
      return;
    }
    setAddStep(2);
  };

  const handleBulkAdd = useCallback(() => {
    const items = selectedProducts.map((p) => ({
      product_id: p.product_id,
      min_quantity: Number(p.min_quantity) || 0,
      initial_quantity: Number(p.initial_quantity) || 0,
      is_frequent: p.is_frequent,
    }));

    bulkAdd.mutate(
      { items },
      {
        onSuccess: () => {
          toast({ type: "success", message: `${items.length} product(s) added to store.` });
          setIsAddOpen(false);
        },
        onError: (err) => {
          toast({ type: "error", message: parseApiError(err, "Failed to add products.") });
        },
      },
    );
  }, [selectedProducts, bulkAdd, toast]);

  // Server returns { total, normal, low, out }
  const rawSummary = summaryData ?? { total: 0, normal: 0, low: 0, out: 0 };
  const summary = {
    total: rawSummary.total ?? 0,
    in_stock: rawSummary.normal ?? (rawSummary as Record<string, number>).in_stock ?? 0,
    low_stock: rawSummary.low ?? (rawSummary as Record<string, number>).low_stock ?? 0,
    out_of_stock: rawSummary.out ?? (rawSummary as Record<string, number>).out_of_stock ?? 0,
  };

  return (
    <div>
      {/* Header row — Add Products button swaps with bulk-action toolbar
          when items are selected. No layout shift on the table below. */}
      <div className="flex items-center gap-4 mb-6 flex-wrap">
        <div className="flex-1 flex items-center gap-3">
          <h1 className="text-2xl font-extrabold text-text whitespace-nowrap">Store Inventory</h1>
          {selectedItemIds.size > 0 && (
            <span className="text-sm text-text-secondary">
              <span className="font-semibold text-accent">{selectedItemIds.size}</span> selected
              <button
                type="button"
                onClick={clearItemSelection}
                className="ml-2 text-xs text-text-muted hover:text-text underline"
              >
                Clear
              </button>
            </span>
          )}
        </div>

        {selectedItemIds.size > 0 ? (
          canDelete && (
            <Button
              variant="danger"
              size="sm"
              onClick={() => setBulkRemoveOpen(true)}
            >
              Remove Selected
            </Button>
          )
        ) : (
          <>
            {/* Store selector */}
            {storeOptions.length > 1 && (
              <div className="flex items-center gap-2">
                <StoreIcon size={16} className="text-text-muted shrink-0" />
                <span className="text-sm font-medium text-text-secondary whitespace-nowrap">Store:</span>
                <div className="w-52">
                  <Select
                    options={storeOptions}
                    value={storeId}
                    onChange={(e) => router.push(`/inventory/stores/${e.target.value}`)}
                  />
                </div>
              </div>
            )}

            {canManage && (
              <Button variant="primary" size="sm" onClick={handleOpenAdd}>
                <Plus size={16} />
                Add Products
              </Button>
            )}
          </>
        )}
      </div>

      {/* Summary cards — clickable to filter */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { key: "" as const, label: "Total", value: summary.total, color: "text-text" },
          { key: "in_stock" as const, label: "In Stock", value: summary.in_stock, color: "text-success" },
          { key: "low_stock" as const, label: "Low Stock", value: summary.low_stock, color: "text-warning" },
          { key: "out_of_stock" as const, label: "Out of Stock", value: summary.out_of_stock, color: "text-danger" },
        ].map((card) => (
          <button
            key={card.key}
            type="button"
            onClick={() => handleSummaryCardClick(card.key)}
            className={cn(
              "text-left rounded-xl border p-4 transition-all",
              filterStock === card.key
                ? "border-accent bg-accent-muted"
                : "border-border bg-card hover:border-accent/40 hover:bg-surface-hover",
            )}
          >
            <div className="text-xs text-text-muted mb-1">{card.label}</div>
            <div className={cn("text-2xl font-bold", card.color)}>{card.value}</div>
          </button>
        ))}
      </div>

      {/* Filter bar */}
      <Card className="mb-4" padding="p-4">
        <div className="flex flex-col md:flex-row md:items-end gap-3 flex-wrap">
          <div className="w-full md:w-44">
            <Select
              label="Category"
              options={categoryFilterOptions}
              value={filterCategory}
              onChange={(e) => setUrlParams({ category: e.target.value, page: null })}
            />
          </div>
          <div className="w-full md:w-28">
            <Select
              label="Search By"
              options={[
                { value: "all", label: "All" },
                { value: "name", label: "Name" },
                { value: "code", label: "Code" },
              ]}
              value={filterSearchField}
              onChange={(e) => setUrlParams({ search_field: e.target.value, page: null })}
            />
          </div>
          <div className="flex-1 min-w-[180px]">
            <Input
              label="Search"
              value={searchInput}
              placeholder={filterSearchField === "code" ? "Search by code..." : filterSearchField === "name" ? "Search by name..." : "Product name or code..."}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
          <div className="flex items-end gap-2">
            <button
              type="button"
              onClick={() =>
                setUrlParams({ frequent: filterFrequent ? "" : "1", page: null })
              }
              className={cn(
                "flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border transition-colors",
                filterFrequent
                  ? "border-warning bg-warning-muted text-warning"
                  : "border-border text-text-secondary hover:text-text",
              )}
            >
              <Star size={14} fill={filterFrequent ? "currentColor" : "none"} />
              Frequent Only
            </button>
          </div>
        </div>
      </Card>

      {/* Inventory table */}
      <Card padding="p-0">
        <Table<StoreInventoryItem>
          columns={columns}
          data={items}
          isLoading={isLoading}
          onRowClick={handleRowClick}
          emptyMessage="No inventory items found."
          rowClassName={(item) => {
            const lowStock = item.current_quantity <= item.min_quantity;
            const selected = selectedItemIds.has(item.id);
            if (selected) return "!bg-accent-muted";
            return lowStock ? "bg-danger-muted/30 hover:bg-danger-muted/50" : "";
          }}
          sortKey={sortBy || undefined}
          sortDirection={sortBy ? sortDir : undefined}
          onSort={handleSort}
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

      {/* ── Detail Modal ── */}
      {detailItem && (
        <Modal
          isOpen={true}
          onClose={() => setDetailItem(null)}
          title={detailItem.product_name ?? "Inventory Detail"}
          size="md"
        >
          <div className="flex flex-col gap-4">
            {/* Product info */}
            <div className="flex gap-4">
              {detailItem.product_image_url ? (
                <img
                  src={detailItem.product_image_url}
                  alt={detailItem.product_name ?? ""}
                  className="w-16 h-16 object-cover rounded-lg border border-border shrink-0"
                />
              ) : (
                <div className="w-16 h-16 rounded-lg border border-border bg-surface flex items-center justify-center shrink-0">
                  <Package size={22} className="text-text-muted" />
                </div>
              )}
              <div className="flex-1 grid grid-cols-2 gap-2 text-sm">
                <div>
                  <div className="text-xs text-text-muted">Code</div>
                  <div className="font-mono text-text">{detailItem.product_code}</div>
                </div>
                <div>
                  <div className="text-xs text-text-muted">Current Qty</div>
                  <div className={cn("font-bold", detailItem.current_quantity <= detailItem.min_quantity ? "text-danger" : "text-success")}>
                    {detailItem.current_quantity} ea
                    {detailItem.sub_unit && detailItem.sub_unit_ratio && (
                      <span className="text-text-muted font-normal ml-1">
                        ({Math.floor(detailItem.current_quantity / detailItem.sub_unit_ratio)} {detailItem.sub_unit})
                      </span>
                    )}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-text-muted">Min Qty</div>
                  <div className="text-text">{detailItem.min_quantity} ea</div>
                </div>
                <div>
                  <div className="text-xs text-text-muted">Last Audited</div>
                  <div className="text-text-secondary text-xs">
                    {detailItem.last_audited_at ? formatDateTime(detailItem.last_audited_at) : "Never"}
                  </div>
                </div>
              </div>
            </div>

            {/* Quick links */}
            <div className="flex gap-2 pt-2 border-t border-border">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setDetailItem(null);
                  router.push(
                    `/inventory/stores/${storeId}/transactions?product_id=${detailItem.product_id}`,
                  );
                }}
              >
                <History size={14} />
                View History
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setDetailItem(null);
                  router.push(`/inventory/${detailItem.product_id}`);
                }}
              >
                <ChevronRight size={14} />
                Product Detail
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* ── Add Products Modal ── */}
      <Modal
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        title={
          addStep === "create"
            ? "Create New Product"
            : addStep === 1
            ? "Add Products — Select"
            : "Add Products — Configure"
        }
        size="lg"
        closeOnBackdrop={false}
      >
        {addStep === "create" ? (
          <div className="flex flex-col gap-4">
            <button
              type="button"
              onClick={() => { setAddStep(1); setCreateFormData(null); }}
              className="flex items-center gap-1.5 text-sm text-text-secondary hover:text-text transition-colors self-start"
            >
              <ArrowLeft size={14} />
              Back to search
            </button>

            <div className="max-h-[60vh] overflow-y-auto pr-1">
              <ProductForm onChange={setCreateFormData} />
            </div>

            <div className="flex justify-end gap-3 pt-2 border-t border-border">
              <Button variant="secondary" size="sm" onClick={() => { setAddStep(1); setCreateFormData(null); }}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleCreateProductInModal}
                isLoading={createProduct.isPending}
              >
                Create & Select
              </Button>
            </div>
          </div>
        ) : addStep === 1 ? (
          <div className="flex flex-col gap-4">
            {/* Search */}
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" />
              <input
                type="text"
                value={addSearch}
                onChange={(e) => setAddSearch(e.target.value)}
                placeholder="Search products..."
                className="w-full rounded-lg border border-border bg-surface pl-9 pr-8 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-accent/50"
              />
              {isSearchFetching && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <div className="w-3.5 h-3.5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                </div>
              )}
            </div>

            {/* Selected count */}
            {selectedProducts.length > 0 && (
              <div className="text-sm text-accent font-medium">
                {selectedProducts.length} product(s) selected
              </div>
            )}

            {/* Product list — infinite scroll. Server returns addable-first, then by name. */}
            <div className="max-h-72 overflow-y-auto divide-y divide-border rounded-lg border border-border">
              {addableItems.length === 0 && !addableProductsQuery.isFetching ? (
                <div className="py-8 text-center text-sm text-text-muted">
                  No products found.
                </div>
              ) : (
                <>
                  {addableItems.map((product) => {
                    const alreadyAdded = product.is_in_store;
                    const isSelected = selectedProducts.some(
                      (p) => p.product_id === product.id,
                    );
                    return (
                      <label
                        key={product.id}
                        className={cn(
                          "flex items-center gap-3 px-3 py-2.5 transition-colors",
                          alreadyAdded
                            ? "opacity-50 cursor-not-allowed"
                            : "cursor-pointer hover:bg-surface-hover",
                        )}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={alreadyAdded}
                          onChange={() => !alreadyAdded && handleToggleSelect(product)}
                          className="rounded border-border bg-surface text-accent focus:ring-accent/50"
                        />
                        {product.image_url ? (
                          <img
                            src={product.image_url}
                            alt={product.name}
                            className="w-8 h-8 object-cover rounded-md border border-border shrink-0"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-md border border-border bg-surface flex items-center justify-center shrink-0">
                            <Package size={12} className="text-text-muted" />
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium text-text truncate">
                            {product.name}
                          </div>
                          <div className="text-xs text-text-muted font-mono">{product.code}</div>
                        </div>
                        {alreadyAdded && (
                          <Badge variant="default">Already Added</Badge>
                        )}
                      </label>
                    );
                  })}
                  <div ref={sentinelRef} className="h-px" />
                  {addableProductsQuery.isFetchingNextPage && (
                    <div className="py-3 text-center text-xs text-text-muted">Loading more...</div>
                  )}
                  {!addableProductsQuery.hasNextPage && addableItems.length > 0 && (
                    <div className="py-3 text-center text-xs text-text-muted">
                      End of list ({addableItems.length} shown)
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Create new product — stay in modal */}
            <p className="text-xs text-text-muted">
              Can&apos;t find the product?{" "}
              <button
                type="button"
                onClick={() => { setAddStep("create"); setCreateFormData(null); }}
                className="text-accent hover:underline"
              >
                Create a new product
              </button>
            </p>

            <div className="flex justify-end gap-3 pt-2 border-t border-border">
              <Button variant="secondary" size="sm" onClick={() => setIsAddOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleProceedToStep2}
                disabled={selectedProducts.length === 0}
              >
                Next ({selectedProducts.length})
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-text-secondary">
              Configure each product before adding to store.
            </p>

            <div className="max-h-80 overflow-y-auto divide-y divide-border rounded-lg border border-border">
              {selectedProducts.map((p, idx) => (
                <div key={p.product_id} className="p-3 flex flex-col gap-2">
                  <div className="font-medium text-sm text-text">{p.product_name}</div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <label className="text-xs text-text-muted block mb-1">Min Qty</label>
                      <input
                        type="number"
                        min="0"
                        value={p.min_quantity}
                        onChange={(e) =>
                          setSelectedProducts((prev) =>
                            prev.map((item, i) =>
                              i === idx ? { ...item, min_quantity: e.target.value } : item,
                            ),
                          )
                        }
                        className="w-full rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-text focus:outline-none focus:ring-2 focus:ring-accent/50"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-text-muted block mb-1">Initial Qty</label>
                      <input
                        type="number"
                        min="0"
                        value={p.initial_quantity}
                        onChange={(e) =>
                          setSelectedProducts((prev) =>
                            prev.map((item, i) =>
                              i === idx
                                ? { ...item, initial_quantity: e.target.value }
                                : item,
                            ),
                          )
                        }
                        className="w-full rounded-lg border border-border bg-surface px-2 py-1.5 text-sm text-text focus:outline-none focus:ring-2 focus:ring-accent/50"
                      />
                    </div>
                    <div className="flex flex-col">
                      <label className="text-xs text-text-muted block mb-1">Frequent</label>
                      <label className="flex items-center gap-2 pt-1.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={p.is_frequent}
                          onChange={(e) =>
                            setSelectedProducts((prev) =>
                              prev.map((item, i) =>
                                i === idx ? { ...item, is_frequent: e.target.checked } : item,
                              ),
                            )
                          }
                          className="rounded border-border bg-surface text-accent focus:ring-accent/50"
                        />
                        <Star
                          size={14}
                          className={p.is_frequent ? "text-warning" : "text-text-muted"}
                          fill={p.is_frequent ? "currentColor" : "none"}
                        />
                      </label>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-between gap-3 pt-2 border-t border-border">
              <Button variant="secondary" size="sm" onClick={() => setAddStep(1)}>
                Back
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleBulkAdd}
                isLoading={bulkAdd.isPending}
              >
                Add {selectedProducts.length} Product(s)
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        isOpen={removeItemId !== null}
        onClose={() => setRemoveItemId(null)}
        onConfirm={() => {
          if (!removeItemId) return;
          removeItem.mutate(removeItemId, {
            onSuccess: () => {
              toast({ type: "success", message: "Product removed from store." });
              setRemoveItemId(null);
            },
            onError: (err) => {
              toast({ type: "error", message: parseApiError(err, "Failed to remove.") });
            },
          });
        }}
        title="Remove Product from Store"
        message="This will remove this product from the store inventory. The product itself will remain in the catalog."
        confirmLabel="Remove"
        isLoading={removeItem.isPending}
      />

      <ConfirmDialog
        isOpen={bulkRemoveOpen}
        onClose={() => setBulkRemoveOpen(false)}
        onConfirm={async () => {
          // Sequentially fire single-item removes — there's no bulk-remove endpoint,
          // and selections are typically small enough that this is fine.
          const ids = Array.from(selectedItemIds);
          let success = 0;
          for (const id of ids) {
            try {
              await removeItem.mutateAsync(id);
              success += 1;
            } catch {
              // continue; final toast reports success/fail counts
            }
          }
          const failed = ids.length - success;
          if (failed === 0) {
            toast({ type: "success", message: `${success} item(s) removed from store.` });
          } else {
            toast({
              type: "error",
              message: `${success} removed, ${failed} failed.`,
            });
          }
          clearItemSelection();
          setBulkRemoveOpen(false);
        }}
        title="Remove Selected Items"
        message={`Remove ${selectedItemIds.size} product(s) from this store's inventory? Products themselves will stay in the catalog.`}
        confirmLabel="Remove"
        isLoading={removeItem.isPending}
      />

      {editItem && (
        <EditItemModal
          item={editItem}
          storeId={storeId}
          onClose={() => setEditItem(null)}
        />
      )}
    </div>
  );
}

/** Edit modal — single item. Edits min_qty/is_frequent via PUT, and writes
 *  any current_qty change as a stock_in/stock_out transaction so audit
 *  history stays accurate. */
function EditItemModal({
  item,
  storeId,
  onClose,
}: {
  item: StoreInventoryItem;
  storeId: string;
  onClose: () => void;
}): React.ReactElement {
  const { toast } = useToast();
  const updateItem = useUpdateStoreInventoryItem(storeId);
  const createTransaction = useCreateTransaction(storeId, item.id);

  const [minQty, setMinQty] = useState(String(item.min_quantity));
  const [currentQty, setCurrentQty] = useState(String(item.current_quantity));
  const [isFrequent, setIsFrequent] = useState(item.is_frequent);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const minQtyNum = parseInt(minQty, 10);
  const currentQtyNum = parseInt(currentQty, 10);
  const qtyDiff = isNaN(currentQtyNum) ? 0 : currentQtyNum - item.current_quantity;
  const minQtyChanged = !isNaN(minQtyNum) && minQtyNum !== item.min_quantity;
  const frequentChanged = isFrequent !== item.is_frequent;
  const hasAnyChange = minQtyChanged || frequentChanged || qtyDiff !== 0;
  const reasonRequired = qtyDiff !== 0;

  const handleSave = async () => {
    if (isNaN(minQtyNum) || minQtyNum < 0) {
      toast({ type: "error", message: "Min Qty must be a non-negative integer." });
      return;
    }
    if (isNaN(currentQtyNum) || currentQtyNum < 0) {
      toast({ type: "error", message: "Current Qty must be a non-negative integer." });
      return;
    }
    if (reasonRequired && !reason.trim()) {
      toast({ type: "error", message: "Please provide a reason for the quantity change." });
      return;
    }
    setSaving(true);
    try {
      // 1) min_qty / is_frequent → PUT update
      if (minQtyChanged || frequentChanged) {
        await updateItem.mutateAsync({
          id: item.id,
          ...(minQtyChanged ? { min_quantity: minQtyNum } : {}),
          ...(frequentChanged ? { is_frequent: isFrequent } : {}),
        });
      }
      // 2) current_qty diff → stock_in or stock_out transaction
      if (qtyDiff !== 0) {
        await createTransaction.mutateAsync({
          type: qtyDiff > 0 ? "stock_in" : "stock_out",
          quantity: Math.abs(qtyDiff),
          reason: reason.trim(),
        });
      }
      toast({ type: "success", message: "Item updated." });
      onClose();
    } catch (err) {
      toast({ type: "error", message: parseApiError(err, "Failed to update.") });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={true} onClose={onClose} title={`Edit — ${item.product_name}`} size="md">
      <div className="flex flex-col gap-4">
        <div className="text-xs text-text-muted font-mono">{item.product_code}</div>

        <div className="grid grid-cols-2 gap-3">
          <Input
            type="number"
            min={0}
            label="Min Qty (ea)"
            value={minQty}
            onChange={(e) => setMinQty(e.target.value)}
          />
          <Input
            type="number"
            min={0}
            label="Current Qty (ea)"
            value={currentQty}
            onChange={(e) => setCurrentQty(e.target.value)}
          />
        </div>

        {qtyDiff !== 0 && (
          <div className="rounded-lg border border-warning/40 bg-warning-muted px-3 py-2 text-xs text-text">
            Current Qty change will be recorded as a{" "}
            <span className="font-semibold">
              {qtyDiff > 0 ? `stock-in of +${qtyDiff}` : `stock-out of ${qtyDiff}`}
            </span>{" "}
            transaction.
          </div>
        )}

        <Input
          label={`Reason${reasonRequired ? " (required for qty change)" : " (optional)"}`}
          placeholder="e.g. On-site recount on 2026-04-27"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />

        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={isFrequent}
            onChange={(e) => setIsFrequent(e.target.checked)}
            className="w-4 h-4 accent-accent"
          />
          <Star
            size={14}
            className={isFrequent ? "text-warning" : "text-text-muted"}
            fill={isFrequent ? "currentColor" : "none"}
          />
          <span className="text-sm text-text">Mark as frequent</span>
        </label>

        <div className="flex justify-end gap-2 pt-2 border-t border-border">
          <Button variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSave}
            disabled={!hasAnyChange || saving}
            isLoading={saving}
          >
            Save
          </Button>
        </div>
      </div>
    </Modal>
  );
}
