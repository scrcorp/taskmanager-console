"use client";

/**
 * 카테고리 & 서브유닛 관리 페이지.
 *
 * Two tabs:
 *  - Categories: 2-level accordion tree (existing)
 *  - Sub Units: flat list with add/edit/delete
 */

import React, { useState, useCallback } from "react";
import { Plus, ChevronRight, ChevronDown, Edit2, Trash2, FolderOpen, Folder } from "lucide-react";
import {
  useCategories,
  useCreateCategory,
  useUpdateCategory,
  useDeleteCategory,
  useSubUnits,
  useCreateSubUnit,
  useUpdateSubUnit,
  useDeleteSubUnit,
} from "@/hooks/useInventory";
import { usePermissions } from "@/hooks/usePermissions";
import { PERMISSIONS } from "@/lib/permissions";
import { Button, Card, Modal, Input, ConfirmDialog } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { parseApiError } from "@/lib/utils";
import type { InventoryCategory, InventorySubUnit } from "@/types";

// ─── Tab types ────────────────────────────────────────────────────────────────

type ActiveTab = "categories" | "sub_units";

// ─── Category section ─────────────────────────────────────────────────────────

interface EditingCategory {
  id: string;
  name: string;
  parent_id: string | null;
}

function CategoriesTab({ canManage }: { canManage: boolean }): React.ReactElement {
  const { toast } = useToast();
  const { data: categoriesRaw, isLoading } = useCategories();
  const createCategory = useCreateCategory();
  const updateCategory = useUpdateCategory();
  const deleteCategory = useDeleteCategory();

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [addParentId, setAddParentId] = useState<string | null>(null);
  const [addName, setAddName] = useState("");
  const [editTarget, setEditTarget] = useState<EditingCategory | null>(null);
  const [editName, setEditName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<InventoryCategory | null>(null);

  const topLevel: InventoryCategory[] = (categoriesRaw ?? []).filter((c) => !c.parent_id);
  const allCategories: InventoryCategory[] = categoriesRaw ?? [];

  function getChildren(parentId: string): InventoryCategory[] {
    return allCategories.filter((c) => c.parent_id === parentId);
  }

  function canDelete(category: InventoryCategory): boolean {
    const hasChildren = allCategories.some((c) => c.parent_id === category.id);
    const hasProducts = (category.product_count ?? 0) > 0;
    return !hasChildren && !hasProducts;
  }

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleOpenAdd = (parentId: string | null = null) => {
    setAddParentId(parentId);
    setAddName("");
    setIsAddOpen(true);
  };

  const handleAddSubmit = useCallback(() => {
    if (!addName.trim()) {
      toast({ type: "error", message: "Category name is required." });
      return;
    }
    createCategory.mutate(
      { name: addName.trim(), parent_id: addParentId },
      {
        onSuccess: () => {
          toast({ type: "success", message: "Category created." });
          setIsAddOpen(false);
          if (addParentId) setExpanded((prev) => new Set([...prev, addParentId]));
        },
        onError: (err) => {
          toast({ type: "error", message: parseApiError(err, "Failed to create category.") });
        },
      },
    );
  }, [addName, addParentId, createCategory, toast]);

  const handleOpenEdit = (category: InventoryCategory) => {
    setEditTarget({ id: category.id, name: category.name, parent_id: category.parent_id });
    setEditName(category.name);
  };

  const handleEditSubmit = useCallback(() => {
    if (!editTarget || !editName.trim()) return;
    updateCategory.mutate(
      { id: editTarget.id, name: editName.trim() },
      {
        onSuccess: () => {
          toast({ type: "success", message: "Category updated." });
          setEditTarget(null);
        },
        onError: (err) => {
          toast({ type: "error", message: parseApiError(err, "Failed to update category.") });
        },
      },
    );
  }, [editTarget, editName, updateCategory, toast]);

  const handleDeleteConfirm = useCallback(() => {
    if (!deleteTarget) return;
    deleteCategory.mutate(deleteTarget.id, {
      onSuccess: () => {
        toast({ type: "success", message: "Category deleted." });
        setDeleteTarget(null);
      },
      onError: (err) => {
        toast({ type: "error", message: parseApiError(err, "Failed to delete category.") });
      },
    });
  }, [deleteTarget, deleteCategory, toast]);

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        {canManage && (
          <Button variant="primary" size="md" onClick={() => handleOpenAdd(null)}>
            <Plus size={16} />
            Add Category
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : topLevel.length === 0 ? (
        <Card padding="p-8">
          <div className="text-center text-text-secondary">
            No categories yet. Add one to get started.
          </div>
        </Card>
      ) : (
        <div className="space-y-2">
          {topLevel.map((parent) => {
            const children = getChildren(parent.id);
            const isExpanded = expanded.has(parent.id);

            return (
              <Card key={parent.id} padding="p-0" className="overflow-hidden">
                <div
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-surface-hover transition-colors"
                  onClick={() => toggleExpand(parent.id)}
                >
                  <button
                    type="button"
                    className="p-0.5 text-text-muted"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleExpand(parent.id);
                    }}
                  >
                    {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                  </button>

                  {isExpanded ? (
                    <FolderOpen size={16} className="text-accent shrink-0" />
                  ) : (
                    <Folder size={16} className="text-text-muted shrink-0" />
                  )}

                  <span className="font-semibold text-text flex-1">{parent.name}</span>

                  <span className="text-xs text-text-muted mr-2">
                    {children.length > 0 && `${children.length} subcategories · `}
                    {parent.product_count ?? 0} products
                  </span>

                  {canManage && (
                    <div
                      className="flex items-center gap-1"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={() => handleOpenAdd(parent.id)}
                        className="p-1.5 rounded text-text-muted hover:text-accent hover:bg-accent-muted transition-colors"
                        title="Add subcategory"
                      >
                        <Plus size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(parent)}
                        className="p-1.5 rounded text-text-muted hover:text-text hover:bg-surface-hover transition-colors"
                        title="Edit"
                      >
                        <Edit2 size={13} />
                      </button>
                      <button
                        type="button"
                        disabled={!canDelete(parent)}
                        onClick={() => canDelete(parent) && setDeleteTarget(parent)}
                        className={`p-1.5 rounded transition-colors ${
                          canDelete(parent)
                            ? "text-text-muted hover:text-danger hover:bg-danger-muted cursor-pointer"
                            : "text-text-muted/30 cursor-not-allowed"
                        }`}
                        title={canDelete(parent) ? "Delete" : "Cannot delete — has subcategories or products"}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  )}
                </div>

                {isExpanded && (
                  <div className="border-t border-border">
                    {children.length === 0 ? (
                      <div className="px-10 py-3 text-sm text-text-muted">
                        No subcategories.
                        {canManage && (
                          <button
                            type="button"
                            onClick={() => handleOpenAdd(parent.id)}
                            className="ml-2 text-accent hover:underline"
                          >
                            Add one
                          </button>
                        )}
                      </div>
                    ) : (
                      children.map((child) => (
                        <div
                          key={child.id}
                          className="flex items-center gap-3 px-10 py-2.5 hover:bg-surface-hover transition-colors border-b border-border/50 last:border-b-0"
                        >
                          <span className="w-1 h-1 rounded-full bg-border shrink-0" />
                          <span className="flex-1 text-sm text-text">{child.name}</span>
                          <span className="text-xs text-text-muted mr-2">
                            {child.product_count ?? 0} products
                          </span>

                          {canManage && (
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleOpenEdit(child)}
                                className="p-1.5 rounded text-text-muted hover:text-text hover:bg-surface-hover transition-colors"
                                title="Edit"
                              >
                                <Edit2 size={12} />
                              </button>
                              <button
                                type="button"
                                disabled={!canDelete(child)}
                                onClick={() => canDelete(child) && setDeleteTarget(child)}
                                className={`p-1.5 rounded transition-colors ${
                                  canDelete(child)
                                    ? "text-text-muted hover:text-danger hover:bg-danger-muted cursor-pointer"
                                    : "text-text-muted/30 cursor-not-allowed"
                                }`}
                                title={canDelete(child) ? "Delete" : "Cannot delete — has products"}
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Add Category Modal */}
      <Modal
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        title={addParentId ? "Add Subcategory" : "Add Category"}
        size="sm"
      >
        <div className="flex flex-col gap-4">
          {addParentId && (
            <p className="text-sm text-text-secondary">
              Adding subcategory under:{" "}
              <span className="font-medium text-text">
                {allCategories.find((c) => c.id === addParentId)?.name}
              </span>
            </p>
          )}
          <Input
            label="Category Name"
            value={addName}
            placeholder="e.g. Beverages"
            onChange={(e) => setAddName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleAddSubmit(); }}
          />
          <div className="flex justify-end gap-3">
            <Button variant="secondary" size="sm" onClick={() => setIsAddOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleAddSubmit}
              isLoading={createCategory.isPending}
            >
              Create
            </Button>
          </div>
        </div>
      </Modal>

      {/* Edit Category Modal */}
      <Modal
        isOpen={editTarget !== null}
        onClose={() => setEditTarget(null)}
        title="Edit Category"
        size="sm"
      >
        <div className="flex flex-col gap-4">
          <Input
            label="Category Name"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleEditSubmit(); }}
          />
          <div className="flex justify-end gap-3">
            <Button variant="secondary" size="sm" onClick={() => setEditTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleEditSubmit}
              isLoading={updateCategory.isPending}
            >
              Save
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirm */}
      <ConfirmDialog
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteConfirm}
        title="Delete Category"
        message={`Are you sure you want to delete "${deleteTarget?.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        isLoading={deleteCategory.isPending}
      />
    </>
  );
}

// ─── Sub Units section ────────────────────────────────────────────────────────

function SubUnitsTab({ canManage }: { canManage: boolean }): React.ReactElement {
  const { toast } = useToast();
  const { data: subUnits, isLoading } = useSubUnits();
  const createSubUnit = useCreateSubUnit();
  const updateSubUnit = useUpdateSubUnit();
  const deleteSubUnit = useDeleteSubUnit();

  const [isAddOpen, setIsAddOpen] = useState(false);
  const [addName, setAddName] = useState("");
  const [editTarget, setEditTarget] = useState<InventorySubUnit | null>(null);
  const [editName, setEditName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<InventorySubUnit | null>(null);

  const handleAddSubmit = useCallback(() => {
    if (!addName.trim()) {
      toast({ type: "error", message: "Sub unit name is required." });
      return;
    }
    createSubUnit.mutate(
      { name: addName.trim(), code: addName.trim().toLowerCase().replace(/\s+/g, "_") },
      {
        onSuccess: () => {
          toast({ type: "success", message: "Sub unit created." });
          setIsAddOpen(false);
          setAddName("");
        },
        onError: (err) => {
          toast({ type: "error", message: parseApiError(err, "Failed to create sub unit.") });
        },
      },
    );
  }, [addName, createSubUnit, toast]);

  const handleOpenEdit = (unit: InventorySubUnit) => {
    setEditTarget(unit);
    setEditName(unit.name);
  };

  const handleEditSubmit = useCallback(() => {
    if (!editTarget || !editName.trim()) return;
    updateSubUnit.mutate(
      { id: editTarget.id, name: editName.trim() },
      {
        onSuccess: () => {
          toast({ type: "success", message: "Sub unit updated." });
          setEditTarget(null);
        },
        onError: (err) => {
          toast({ type: "error", message: parseApiError(err, "Failed to update sub unit.") });
        },
      },
    );
  }, [editTarget, editName, updateSubUnit, toast]);

  const handleDeleteConfirm = useCallback(() => {
    if (!deleteTarget) return;
    deleteSubUnit.mutate(deleteTarget.id, {
      onSuccess: () => {
        toast({ type: "success", message: "Sub unit deleted." });
        setDeleteTarget(null);
      },
      onError: (err) => {
        toast({ type: "error", message: parseApiError(err, "Failed to delete sub unit. It may still be in use by products.") });
      },
    });
  }, [deleteTarget, deleteSubUnit, toast]);

  const items: InventorySubUnit[] = subUnits ?? [];

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        {canManage && (
          <Button variant="primary" size="md" onClick={() => { setAddName(""); setIsAddOpen(true); }}>
            <Plus size={16} />
            Add Sub Unit
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-16">
          <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <Card padding="p-8">
          <div className="text-center text-text-secondary">
            No sub units yet. Add one to get started.
          </div>
        </Card>
      ) : (
        <Card padding="p-0" className="overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-[1fr_160px_120px_100px] gap-4 px-4 py-2.5 border-b border-border bg-surface-hover text-xs font-medium text-text-muted uppercase tracking-wide">
            <span>Name</span>
            <span>Code</span>
            <span>Products Using</span>
            <span className="text-right">Actions</span>
          </div>
          {items.map((unit) => (
            <div
              key={unit.id}
              className="grid grid-cols-[1fr_160px_120px_100px] gap-4 px-4 py-3 border-b border-border/50 last:border-b-0 hover:bg-surface-hover transition-colors items-center"
            >
              <span className="text-sm font-medium text-text">{unit.name}</span>
              <span className="text-sm text-text-muted font-mono">{unit.code}</span>
              <span className="text-sm text-text-secondary">{unit.product_count}</span>
              <div className="flex items-center justify-end gap-1">
                {canManage && (
                  <>
                    <button
                      type="button"
                      onClick={() => handleOpenEdit(unit)}
                      className="p-1.5 rounded text-text-muted hover:text-text hover:bg-surface-hover transition-colors"
                      title="Edit"
                    >
                      <Edit2 size={13} />
                    </button>
                    <button
                      type="button"
                      disabled={unit.product_count > 0}
                      onClick={() => unit.product_count === 0 && setDeleteTarget(unit)}
                      className={`p-1.5 rounded transition-colors ${
                        unit.product_count === 0
                          ? "text-text-muted hover:text-danger hover:bg-danger-muted cursor-pointer"
                          : "text-text-muted/30 cursor-not-allowed"
                      }`}
                      title={unit.product_count === 0 ? "Delete" : "Cannot delete — used by products"}
                    >
                      <Trash2 size={13} />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </Card>
      )}

      {/* Add Sub Unit Modal */}
      <Modal
        isOpen={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        title="Add Sub Unit"
        size="sm"
      >
        <div className="flex flex-col gap-4">
          <Input
            label="Name"
            value={addName}
            placeholder="e.g. Box, Pack, Case"
            onChange={(e) => setAddName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleAddSubmit(); }}
          />
          {addName.trim() && (
            <p className="text-xs text-text-muted -mt-2">
              Code will be set to: <span className="font-mono text-text-secondary">{addName.trim().toLowerCase().replace(/\s+/g, "_")}</span>
            </p>
          )}
          <div className="flex justify-end gap-3">
            <Button variant="secondary" size="sm" onClick={() => setIsAddOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleAddSubmit}
              isLoading={createSubUnit.isPending}
            >
              Create
            </Button>
          </div>
        </div>
      </Modal>

      {/* Edit Sub Unit Modal */}
      <Modal
        isOpen={editTarget !== null}
        onClose={() => setEditTarget(null)}
        title="Edit Sub Unit"
        size="sm"
      >
        <div className="flex flex-col gap-4">
          <Input
            label="Name"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleEditSubmit(); }}
          />
          <p className="text-xs text-text-muted -mt-2">
            Code <span className="font-mono text-text-secondary">{editTarget?.code}</span> cannot be changed.
          </p>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" size="sm" onClick={() => setEditTarget(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleEditSubmit}
              isLoading={updateSubUnit.isPending}
            >
              Save
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete Confirm */}
      <ConfirmDialog
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteConfirm}
        title="Delete Sub Unit"
        message={`Are you sure you want to delete "${deleteTarget?.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        isLoading={deleteSubUnit.isPending}
      />
    </>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CategoriesPage(): React.ReactElement {
  const { hasPermission } = usePermissions();
  const canManage = hasPermission(PERMISSIONS.INVENTORY_CREATE);

  const [activeTab, setActiveTab] = useState<ActiveTab>("categories");

  const tabs: { id: ActiveTab; label: string }[] = [
    { id: "categories", label: "Categories" },
    { id: "sub_units", label: "Sub Units" },
  ];

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-extrabold text-text">Categories & Units</h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-border">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === tab.id
                ? "border-accent text-accent"
                : "border-transparent text-text-muted hover:text-text"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "categories" ? (
        <CategoriesTab canManage={canManage} />
      ) : (
        <SubUnitsTab canManage={canManage} />
      )}
    </div>
  );
}
