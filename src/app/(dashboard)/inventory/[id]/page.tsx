"use client";

/**
 * 제품 상세 페이지 — 제품 정보 카드 + "이 제품을 사용 중인 매장" 테이블.
 *
 * Product detail page with product info card and stores-using-this-product table.
 * Inventory edits must go through store inventory pages (read-only here).
 */

import React, { useState, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { ChevronLeft, Package, Edit, Power } from "lucide-react";
import { useProduct, useUpdateProduct, useDeactivateProduct, useActivateProduct, useDeleteProduct } from "@/hooks/useInventory";
import { usePermissions } from "@/hooks/usePermissions";
import { PERMISSIONS } from "@/lib/permissions";
import {
  Button,
  Card,
  Table,
  Badge,
  Modal,
  ConfirmDialog,
  LoadingSpinner,
} from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { parseApiError, formatDateTime } from "@/lib/utils";
import { ProductForm, type ProductFormData } from "@/components/inventory/ProductForm";
import type { StoreInventoryItem, StoreInventoryBrief } from "@/types";

/** 재고 상태 Badge 매핑 (Stock status badge mapping) */
function stockBadge(item: StoreInventoryBrief): { variant: "success" | "warning" | "danger"; label: string } {
  if (item.current_quantity <= 0) return { variant: "danger", label: "Out of Stock" };
  if (item.current_quantity <= item.min_quantity) return { variant: "warning", label: "Low Stock" };
  return { variant: "success", label: "In Stock" };
}

export default function ProductDetailPage(): React.ReactElement {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const productId = params.id;

  const { toast } = useToast();
  const { hasPermission } = usePermissions();
  const canUpdate = hasPermission(PERMISSIONS.INVENTORY_UPDATE);
  const canDelete = hasPermission(PERMISSIONS.INVENTORY_DELETE);

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeactivateOpen, setIsDeactivateOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [editFormData, setEditFormData] = useState<ProductFormData | null>(null);

  const { data: product, isLoading } = useProduct(productId);
  const updateProduct = useUpdateProduct();
  const deactivateProduct = useDeactivateProduct();
  const activateProduct = useActivateProduct();
  const deleteProduct = useDeleteProduct();

  const storeInventories = product?.stores ?? [];

  /** 매장 사용현황 테이블 컬럼 */
  const columns: {
    key: string;
    header: string;
    render?: (item: StoreInventoryBrief) => React.ReactNode;
  }[] = [
    {
      key: "store_name",
      header: "Store",
      render: (item) => (
        <span className="font-medium text-text">{item.store_name ?? "-"}</span>
      ),
    },
    {
      key: "current_quantity",
      header: "Current Qty",
      render: (item) => {
        const qty = item.current_quantity;
        const subDisplay =
          product?.sub_unit && product?.sub_unit_ratio
            ? ` (${Math.floor(qty / product.sub_unit_ratio)} ${product.sub_unit})`
            : "";
        return (
          <span className="text-sm text-text">
            {qty} ea{subDisplay}
          </span>
        );
      },
    },
    {
      key: "min_quantity",
      header: "Min Qty",
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
  ];

  const handleEditSubmit = useCallback(() => {
    if (!editFormData || !product) return;

    updateProduct.mutate(
      {
        id: product.id,
        name: editFormData.name.trim(),
        code: !editFormData.auto_code && editFormData.code.trim() ? editFormData.code.trim() : undefined,
        category_id: editFormData.category_id || undefined,
        subcategory_id: editFormData.subcategory_id || undefined,
        sub_unit: editFormData.sub_unit || null,
        sub_unit_ratio: editFormData.sub_unit && editFormData.sub_unit_ratio
          ? Number(editFormData.sub_unit_ratio)
          : null,
        image_url: editFormData.image_url || null,
        description: editFormData.description.trim() || null,
      },
      {
        onSuccess: () => {
          toast({ type: "success", message: "Product updated." });
          setIsEditOpen(false);
        },
        onError: (err) => {
          toast({ type: "error", message: parseApiError(err, "Failed to update product.") });
        },
      },
    );
  }, [editFormData, product, updateProduct, toast]);

  const handleDeactivate = useCallback(() => {
    if (!product) return;
    deactivateProduct.mutate(product.id, {
      onSuccess: () => {
        toast({ type: "success", message: "Product deactivated." });
        setIsDeactivateOpen(false);
        router.push("/inventory");
      },
      onError: (err) => {
        toast({ type: "error", message: parseApiError(err, "Failed to deactivate.") });
      },
    });
  }, [product, deactivateProduct, toast, router]);

  const handleActivate = useCallback(() => {
    if (!product) return;
    activateProduct.mutate(product.id, {
      onSuccess: () => {
        toast({ type: "success", message: "Product activated." });
        router.refresh();
      },
      onError: (err) => {
        toast({ type: "error", message: parseApiError(err, "Failed to activate.") });
      },
    });
  }, [product, activateProduct, toast, router]);

  const handleDelete = useCallback(() => {
    if (!product) return;
    deleteProduct.mutate(product.id, {
      onSuccess: () => {
        toast({ type: "success", message: "Product permanently deleted." });
        setIsDeleteOpen(false);
        router.push("/inventory");
      },
      onError: (err) => {
        toast({ type: "error", message: parseApiError(err, "Failed to delete.") });
      },
    });
  }, [product, deleteProduct, toast, router]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner />
      </div>
    );
  }

  if (!product) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <p className="text-text-secondary">Product not found.</p>
        <Button variant="secondary" size="sm" onClick={() => router.push("/inventory")}>
          Back to Products
        </Button>
      </div>
    );
  }

  return (
    <div>
      {/* Back button + header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          type="button"
          onClick={() => router.push("/inventory")}
          className="p-1.5 rounded-lg text-text-secondary hover:text-text hover:bg-surface-hover transition-colors"
        >
          <ChevronLeft size={20} />
        </button>
        <h1 className="text-2xl font-extrabold text-text flex-1">{product.name}</h1>
        {canUpdate && product.is_active && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setIsEditOpen(true)}
          >
            <Edit size={14} />
            Edit
          </Button>
        )}
        {canDelete && product.is_active && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setIsDeactivateOpen(true)}
          >
            <Power size={14} />
            Deactivate
          </Button>
        )}
        {canUpdate && !product.is_active && (
          <Button
            variant="primary"
            size="sm"
            onClick={handleActivate}
            isLoading={activateProduct.isPending}
          >
            Activate
          </Button>
        )}
        {canDelete && (
          <Button
            variant="danger"
            size="sm"
            onClick={() => setIsDeleteOpen(true)}
          >
            Delete
          </Button>
        )}
      </div>

      {/* Product info card */}
      <Card className="mb-6" padding="p-5">
        <div className="flex gap-5">
          {/* 이미지 */}
          <div className="shrink-0">
            {product.image_url ? (
              <img
                src={product.image_url}
                alt={product.name}
                className="w-24 h-24 object-cover rounded-xl border border-border"
              />
            ) : (
              <div className="w-24 h-24 rounded-xl border border-border bg-surface flex items-center justify-center">
                <Package size={32} className="text-text-muted" />
              </div>
            )}
          </div>

          {/* 기본 정보 */}
          <div className="flex-1 min-w-0 grid grid-cols-2 md:grid-cols-3 gap-4">
            <div>
              <div className="text-xs text-text-muted mb-1">Product Code</div>
              <div className="text-sm font-mono text-text">{product.code}</div>
            </div>
            <div>
              <div className="text-xs text-text-muted mb-1">Category</div>
              <div className="text-sm text-text">
                {product.category_name ?? "—"}
                {product.subcategory_name && (
                  <span className="text-text-muted"> / {product.subcategory_name}</span>
                )}
              </div>
            </div>
            <div>
              <div className="text-xs text-text-muted mb-1">Base Unit</div>
              <div className="text-sm text-text">ea (piece)</div>
            </div>
            <div>
              <div className="text-xs text-text-muted mb-1">Sub Unit</div>
              <div className="text-sm text-text">
                {product.sub_unit
                  ? `${product.sub_unit} (1 ${product.sub_unit} = ${product.sub_unit_ratio} ea)`
                  : "—"}
              </div>
            </div>
            <div>
              <div className="text-xs text-text-muted mb-1">Barcode</div>
              <div className="text-sm text-text-muted">{product.barcode ?? "—"}</div>
            </div>
            <div>
              <div className="text-xs text-text-muted mb-1">Status</div>
              <Badge variant={product.is_active ? "success" : "danger"}>
                {product.is_active ? "Active" : "Inactive"}
              </Badge>
            </div>
            {product.description && (
              <div className="col-span-2 md:col-span-3">
                <div className="text-xs text-text-muted mb-1">Description</div>
                <div className="text-sm text-text">{product.description}</div>
              </div>
            )}
          </div>
        </div>
      </Card>

      {/* 매장 사용현황 */}
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-bold text-text">
          Stores Using This Product
          <span className="ml-2 text-sm font-normal text-text-muted">
            ({storeInventories.length})
          </span>
        </h2>
      </div>

      <Card padding="p-0">
        <Table<StoreInventoryBrief>
          columns={columns}
          data={storeInventories}
          isLoading={false}
          emptyMessage="No stores are using this product yet."
        />
      </Card>

      {/* Edit Modal */}
      <Modal
        isOpen={isEditOpen}
        onClose={() => setIsEditOpen(false)}
        title="Edit Product"
        size="lg"
      >
        <div className="flex flex-col gap-4">
          <ProductForm
            initialData={{
              name: product.name,
              code: product.code,
              auto_code: false,
              category_id: product.category_id ?? "",
              subcategory_id: product.subcategory_id ?? "",
              sub_unit: product.sub_unit ?? "",
              sub_unit_ratio: product.sub_unit_ratio ? String(product.sub_unit_ratio) : "",
              image_url: product.image_url ?? "",
              description: product.description ?? "",
            }}
            onChange={setEditFormData}
          />
          <div className="flex justify-end gap-3 pt-2 border-t border-border">
            <Button variant="secondary" size="sm" onClick={() => setIsEditOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleEditSubmit}
              isLoading={updateProduct.isPending}
            >
              Save
            </Button>
          </div>
        </div>
      </Modal>

      {/* Deactivate Confirm */}
      <ConfirmDialog
        isOpen={isDeactivateOpen}
        onClose={() => setIsDeactivateOpen(false)}
        onConfirm={handleDeactivate}
        title="Deactivate Product"
        message="Are you sure you want to deactivate this product? Store inventory records will be preserved."
        confirmLabel="Deactivate"
        isLoading={deactivateProduct.isPending}
      />

      <ConfirmDialog
        isOpen={isDeleteOpen}
        onClose={() => setIsDeleteOpen(false)}
        onConfirm={handleDelete}
        title="Permanently Delete Product"
        message="This will permanently delete this product and ALL related data including store inventory, stock in/out history, and audit records. This action CANNOT be undone."
        confirmLabel="Delete Permanently"
        isLoading={deleteProduct.isPending}
      />
    </div>
  );
}
