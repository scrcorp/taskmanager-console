"use client";

/**
 * 재고 제품 목록 페이지.
 *
 * Product master list with category filter, search, status filter, and pagination.
 * Add Product modal uses shared ProductForm component.
 */

import React, { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Plus, Package, Upload } from "lucide-react";
import { useUrlParams } from "@/hooks/useUrlParams";
import { useDebounce } from "@/hooks/useDebounce";
import {
  useCategories,
  useProducts,
  useCreateProduct,
  useDeactivateProduct,
  useActivateProduct,
  useDeleteProduct,
} from "@/hooks/useInventory";
import { usePermissions } from "@/hooks/usePermissions";
import { PERMISSIONS } from "@/lib/permissions";
import {
  Button,
  Input,
  Select,
  Card,
  Table,
  Modal,
  Badge,
  Pagination,
  ConfirmDialog,
} from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { parseApiError } from "@/lib/utils";
import { ProductForm, type ProductFormData } from "@/components/inventory/ProductForm";
import { ImportProductsModal } from "@/components/inventory/ImportProductsModal";
import type { InventoryProduct, InventoryCategory } from "@/types";

const PER_PAGE = 20;

/** 재고 상태 뱃지 (Stock status badge variant mapping) */
function stockStatusBadge(product: InventoryProduct): { variant: "success" | "default" | "danger"; label: string } {
  if (!product.is_active) return { variant: "danger", label: "Inactive" };
  return { variant: "success", label: "Active" };
}

/** 설명 텍스트 truncation (Description truncation) */
function truncate(text: string | null, max: number): string {
  if (!text) return "-";
  return text.length > max ? text.slice(0, max) + "…" : text;
}

export default function InventoryPage(): React.ReactElement {
  const router = useRouter();
  const { toast } = useToast();
  const { hasPermission } = usePermissions();
  const canCreate = hasPermission(PERMISSIONS.INVENTORY_CREATE);
  const canDelete = hasPermission(PERMISSIONS.INVENTORY_DELETE);

  // -- URL-persisted filter state --
  const [urlParams, setUrlParams] = useUrlParams({
    category: "",
    search: "",
    search_field: "all",
    status: "active",
    page: "1",
  });
  const filterCategory = urlParams.category;
  const filterSearchField = urlParams.search_field || "all";
  const filterStatus = urlParams.status;
  const page = Number(urlParams.page);

  // Local search input — debounced before URL update
  const [searchInput, setSearchInput] = useState(urlParams.search);
  const debouncedSearch = useDebounce(searchInput, 300);

  useEffect(() => {
    if (debouncedSearch !== urlParams.search) {
      setUrlParams({ search: debouncedSearch, page: null });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const filterSearch = urlParams.search;

  // -- Selection state --
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<"delete" | "deactivate" | "activate" | null>(null);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleSelectAll = () => {
    if (selectedIds.size === products.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(products.map((p) => p.id)));
  };
  const clearSelection = () => setSelectedIds(new Set());

  // -- Modal state --
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [deactivateId, setDeactivateId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [formData, setFormData] = useState<ProductFormData | null>(null);

  // -- Data --
  const { data: categoriesRaw } = useCategories();
  const { data: productsData, isLoading } = useProducts({
    category_id: filterCategory || undefined,
    search: filterSearch || undefined,
    search_field: filterSearchField as "all" | "name" | "code",
    is_active: filterStatus === "all" ? undefined : filterStatus === "inactive" ? false : true,
    page,
    per_page: PER_PAGE,
  });
  const createProduct = useCreateProduct();
  const deactivateProduct = useDeactivateProduct();
  const activateProduct = useActivateProduct();
  const deleteProduct = useDeleteProduct();

  const products: InventoryProduct[] = productsData?.items ?? [];
  const totalPages = productsData ? Math.ceil(productsData.total / productsData.per_page) : 1;

  const topLevelCategories: InventoryCategory[] = (categoriesRaw ?? []).filter(
    (c) => !c.parent_id,
  );

  const categoryFilterOptions = [
    { value: "", label: "All Categories" },
    ...topLevelCategories.map((c) => ({ value: c.id, label: c.name })),
  ];

  const statusOptions = [
    { value: "all", label: "All Status" },
    { value: "active", label: "Active" },
    { value: "inactive", label: "Inactive" },
  ];

  /** 테이블 컬럼 정의 */
  const columns: {
    key: string;
    header: string | React.ReactNode;
    render?: (item: InventoryProduct) => React.ReactNode;
    className?: string;
  }[] = [
    {
      key: "select",
      header: (
        <input
          type="checkbox"
          checked={products.length > 0 && selectedIds.size === products.length}
          onChange={toggleSelectAll}
          className="w-4 h-4 accent-accent cursor-pointer"
        />
      ),
      className: "w-10",
      render: (item) => (
        <div onClick={(e) => e.stopPropagation()}>
          <input
            type="checkbox"
            checked={selectedIds.has(item.id)}
            onChange={() => toggleSelect(item.id)}
            className="w-4 h-4 accent-accent cursor-pointer"
          />
        </div>
      ),
    },
    {
      key: "image",
      header: "Image",
      render: (item) =>
        item.image_url ? (
          <img
            src={item.image_url}
            alt={item.name}
            className="w-10 h-10 object-cover rounded-lg border border-border"
          />
        ) : (
          <div className="w-10 h-10 rounded-lg border border-border bg-surface flex items-center justify-center">
            <Package size={16} className="text-text-muted" />
          </div>
        ),
    },
    {
      key: "name",
      header: "Name",
      className: "min-w-[160px]",
      render: (item) => (
        <span className="font-medium text-text">{item.name}</span>
      ),
    },
    {
      key: "code",
      header: "Code",
      render: (item) => (
        <span className="text-xs text-text-muted font-mono">{item.code}</span>
      ),
    },
    {
      key: "category",
      header: "Category",
      render: (item) => (
        <span className="text-sm text-text-secondary">
          {item.category_name ?? "-"}
          {item.subcategory_name && (
            <span className="text-text-muted"> / {item.subcategory_name}</span>
          )}
        </span>
      ),
    },
    {
      key: "sub_unit",
      header: "Sub Unit",
      render: (item) =>
        item.sub_unit ? (
          <span className="text-xs text-text-secondary">
            {item.sub_unit} ({item.sub_unit_ratio} ea)
          </span>
        ) : (
          <span className="text-xs text-text-muted">ea only</span>
        ),
    },
    {
      key: "description",
      header: "Description",
      className: "max-w-[200px]",
      render: (item) => (
        <span className="text-xs text-text-secondary" title={item.description ?? ""}>
          {truncate(item.description, 50)}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (item) => {
        const { variant, label } = stockStatusBadge(item);
        return <Badge variant={variant}>{label}</Badge>;
      },
    },
    {
      key: "store_count",
      header: "Stores Using",
      render: (item) => (
        <span className="text-sm text-text-secondary">{item.store_count ?? 0}</span>
      ),
    },
    ...(canDelete
      ? [
          {
            key: "actions",
            header: "Actions",
            render: (item: InventoryProduct): React.ReactNode => (
              <div className="flex gap-1">
                {item.is_active ? (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setDeactivateId(item.id); }}
                    className="px-2 py-1 rounded text-xs text-warning hover:bg-warning-muted transition-colors cursor-pointer"
                  >
                    Deactivate
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleActivate(item.id); }}
                    className="px-2 py-1 rounded text-xs text-success hover:bg-success-muted transition-colors cursor-pointer"
                  >
                    Activate
                  </button>
                )}
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setDeleteId(item.id); }}
                  className="px-2 py-1 rounded text-xs text-danger hover:bg-danger-muted transition-colors cursor-pointer"
                >
                  Delete
                </button>
              </div>
            ),
          },
        ]
      : []),
  ];

  const handleRowClick = useCallback(
    (item: InventoryProduct) => {
      router.push(`/inventory/${item.id}`);
    },
    [router],
  );

  const handleOpenCreate = useCallback(() => {
    setFormData(null);
    setIsCreateOpen(true);
  }, []);

  const handleCreateSubmit = useCallback(() => {
    if (!formData || !formData.name.trim()) {
      toast({ type: "error", message: "Product name is required." });
      return;
    }

    const payload = {
      name: formData.name.trim(),
      code: !formData.auto_code && formData.code.trim() ? formData.code.trim() : undefined,
      auto_code: formData.auto_code,
      category_id: formData.category_id || undefined,
      subcategory_id: formData.subcategory_id || undefined,
      sub_unit: formData.sub_unit || undefined,
      sub_unit_ratio: formData.sub_unit && formData.sub_unit_ratio
        ? Number(formData.sub_unit_ratio)
        : undefined,
      image_url: formData.image_url || undefined,
      description: formData.description.trim() || undefined,
    };

    createProduct.mutate(payload, {
      onSuccess: () => {
        toast({ type: "success", message: "Product created successfully." });
        setIsCreateOpen(false);
      },
      onError: (err) => {
        toast({ type: "error", message: parseApiError(err, "Failed to create product.") });
      },
    });
  }, [formData, createProduct, toast]);

  const handleDeactivate = useCallback(() => {
    if (!deactivateId) return;
    deactivateProduct.mutate(deactivateId, {
      onSuccess: () => {
        toast({ type: "success", message: "Product deactivated." });
        setDeactivateId(null);
      },
      onError: (err) => {
        toast({ type: "error", message: parseApiError(err, "Failed to deactivate product.") });
      },
    });
  }, [deactivateId, deactivateProduct, toast]);

  const handleActivate = useCallback((id: string) => {
    activateProduct.mutate(id, {
      onSuccess: () => toast({ type: "success", message: "Product activated." }),
      onError: (err) => toast({ type: "error", message: parseApiError(err, "Failed to activate.") }),
    });
  }, [activateProduct, toast]);

  const handleDelete = useCallback(() => {
    if (!deleteId) return;
    deleteProduct.mutate(deleteId, {
      onSuccess: () => {
        toast({ type: "success", message: "Product permanently deleted." });
        setDeleteId(null);
      },
      onError: (err) => {
        toast({ type: "error", message: parseApiError(err, "Failed to delete product.") });
      },
    });
  }, [deleteId, deleteProduct, toast]);

  const [bulkLoading, setBulkLoading] = useState(false);
  const handleBulkAction = useCallback(async () => {
    if (!bulkAction || selectedIds.size === 0) return;
    setBulkLoading(true);
    let successCount = 0;
    let errorCount = 0;
    for (const id of selectedIds) {
      try {
        if (bulkAction === "delete") {
          await deleteProduct.mutateAsync(id);
        } else if (bulkAction === "deactivate") {
          await deactivateProduct.mutateAsync(id);
        } else if (bulkAction === "activate") {
          await activateProduct.mutateAsync(id);
        }
        successCount++;
      } catch {
        errorCount++;
      }
    }
    setBulkLoading(false);
    setBulkAction(null);
    clearSelection();
    const actionLabel = bulkAction === "delete" ? "deleted" : bulkAction === "deactivate" ? "deactivated" : "activated";
    if (errorCount === 0) {
      toast({ type: "success", message: `${successCount} product(s) ${actionLabel}.` });
    } else {
      toast({ type: "error", message: `${successCount} succeeded, ${errorCount} failed.` });
    }
  }, [bulkAction, selectedIds, deleteProduct, deactivateProduct, activateProduct, toast]);

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-extrabold text-text">Products</h1>
        {canCreate && (
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="md" onClick={() => setIsImportOpen(true)}>
              <Upload size={16} />
              Import
            </Button>
            <Button variant="primary" size="md" onClick={handleOpenCreate}>
              <Plus size={16} />
              Add Product
            </Button>
          </div>
        )}
      </div>

      {/* Filter bar */}
      <Card className="mb-6" padding="p-4">
        <div className="flex flex-col md:flex-row md:items-end gap-3 flex-wrap">
          <div className="w-full md:w-48">
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
          <div className="flex-1 min-w-[200px]">
            <Input
              label="Search"
              value={searchInput}
              placeholder={filterSearchField === "code" ? "Search by code..." : filterSearchField === "name" ? "Search by name..." : "Search by name or code..."}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
          <div className="w-full md:w-40">
            <Select
              label="Status"
              options={statusOptions}
              value={filterStatus}
              onChange={(e) => setUrlParams({ status: e.target.value, page: null })}
            />
          </div>
        </div>
      </Card>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-lg bg-accent-muted border border-accent/20 mb-3">
          <span className="text-sm font-medium text-text">{selectedIds.size} selected</span>
          <div className="flex-1" />
          <button onClick={() => setBulkAction("activate")} className="px-3 py-1.5 rounded-lg text-xs font-medium text-success bg-success-muted hover:bg-success/20 transition-colors">Activate</button>
          <button onClick={() => setBulkAction("deactivate")} className="px-3 py-1.5 rounded-lg text-xs font-medium text-warning bg-warning-muted hover:bg-warning/20 transition-colors">Deactivate</button>
          <button onClick={() => setBulkAction("delete")} className="px-3 py-1.5 rounded-lg text-xs font-medium text-danger bg-danger-muted hover:bg-danger/20 transition-colors">Delete</button>
        </div>
      )}

      {/* Table */}
      <Card padding="p-0">
        <Table<InventoryProduct>
          columns={columns}
          data={products}
          isLoading={isLoading}
          onRowClick={handleRowClick}
          rowClassName={(item) => selectedIds.has(item.id) ? "!bg-accent-muted" : ""}
          emptyMessage="No products found."
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

      {/* Add Product Modal */}
      <Modal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        title="Add Product"
        size="lg"
        closeOnBackdrop={false}
      >
        <div className="flex flex-col gap-4">
          <ProductForm onChange={setFormData} />

          <div className="flex justify-end gap-3 pt-2 border-t border-border">
            <Button variant="secondary" size="sm" onClick={() => setIsCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleCreateSubmit}
              isLoading={createProduct.isPending}
            >
              Create
            </Button>
          </div>
        </div>
      </Modal>

      {/* Import Products Modal */}
      <ImportProductsModal
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
      />

      {/* Deactivate Confirm Dialog */}
      <ConfirmDialog
        isOpen={deactivateId !== null}
        onClose={() => setDeactivateId(null)}
        onConfirm={handleDeactivate}
        title="Deactivate Product"
        message="Are you sure you want to deactivate this product? It will be hidden from active lists but history is preserved."
        confirmLabel="Deactivate"
        isLoading={deactivateProduct.isPending}
      />

      <ConfirmDialog
        isOpen={deleteId !== null}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDelete}
        title="Permanently Delete Product"
        message="This will permanently delete this product and ALL related data including store inventory, stock in/out history, and audit records. This action CANNOT be undone."
        confirmLabel="Delete Permanently"
        isLoading={deleteProduct.isPending}
      />

      <ConfirmDialog
        isOpen={bulkAction !== null}
        onClose={() => setBulkAction(null)}
        onConfirm={handleBulkAction}
        title={`Bulk ${bulkAction === "delete" ? "Delete" : bulkAction === "deactivate" ? "Deactivate" : "Activate"} — ${selectedIds.size} product(s)`}
        message={
          bulkAction === "delete"
            ? `This will permanently delete ${selectedIds.size} product(s) and ALL related data. This action CANNOT be undone.`
            : bulkAction === "deactivate"
            ? `${selectedIds.size} product(s) will be deactivated.`
            : `${selectedIds.size} product(s) will be activated.`
        }
        confirmLabel={bulkAction === "delete" ? "Delete All" : bulkAction === "deactivate" ? "Deactivate All" : "Activate All"}
        isLoading={bulkLoading}
      />
    </div>
  );
}
