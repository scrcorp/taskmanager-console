"use client";

/**
 * 제품 등록/수정 공용 폼 컴포넌트.
 *
 * Shared product creation/edit form used in both product list modal and store inventory add flow.
 * Field order: Image → Name (similar warning) → Code (auto-toggle) → Category → Subcategory
 *              → Sub Unit → Description → [min_quantity] → [initial_quantity]
 */

import React, { useState, useEffect, useCallback } from "react";
import { RefreshCw, AlertTriangle, Plus, Check, X } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { ImageUpload } from "@/components/ui/ImageUpload";
import { useResultModal } from "@/components/ui/ResultModal";
import { useCategories, useProducts, useCreateCategory, useGenerateProductCode, useSubUnits, useCreateSubUnit } from "@/hooks/useInventory";
import { parseApiError } from "@/lib/utils";
import type { InventoryCategory, InventoryProduct } from "@/types";

export interface ProductFormData {
  name: string;
  code: string;
  auto_code: boolean;
  category_id: string;
  subcategory_id: string;
  sub_unit: string;
  sub_unit_ratio: string;
  image_url: string;
  description: string;
  min_quantity?: string;
  initial_quantity?: string;
}

export interface ProductFormProps {
  /** 수정 모드 초기 값 (Edit mode initial values) */
  initialData?: Partial<ProductFormData>;
  /** min_quantity 필드 표시 여부 */
  showMinQty?: boolean;
  /** initial_quantity 필드 표시 여부 */
  showInitialQty?: boolean;
  onChange: (data: ProductFormData) => void;
}

/** Inline "add new" input for category / subcategory */
function InlineAddInput({
  onAdd,
  onCancel,
  isLoading,
  placeholder,
}: {
  onAdd: (name: string) => void;
  onCancel: () => void;
  isLoading: boolean;
  placeholder: string;
}) {
  const [value, setValue] = useState("");
  return (
    <div className="flex items-center gap-1.5 mt-1.5">
      <input
        type="text"
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && value.trim()) onAdd(value.trim());
          if (e.key === "Escape") onCancel();
        }}
        placeholder={placeholder}
        className="flex-1 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-sm text-text focus:outline-none focus:ring-2 focus:ring-accent/50"
      />
      <button
        type="button"
        disabled={!value.trim() || isLoading}
        onClick={() => value.trim() && onAdd(value.trim())}
        className="p-1.5 rounded-lg bg-accent text-white disabled:opacity-50 hover:bg-accent/80 transition-colors"
        title="Add"
      >
        {isLoading ? (
          <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
        ) : (
          <Check size={13} />
        )}
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-surface-hover transition-colors"
        title="Cancel"
      >
        <X size={13} />
      </button>
    </div>
  );
}

export function ProductForm({
  initialData,
  showMinQty = false,
  showInitialQty = false,
  onChange,
}: ProductFormProps): React.ReactElement {
  const [name, setName] = useState(initialData?.name ?? "");
  const [code, setCode] = useState(initialData?.code ?? "");
  const [autoCode, setAutoCode] = useState(initialData?.auto_code ?? true);
  const [categoryId, setCategoryId] = useState(initialData?.category_id ?? "");
  const [subcategoryId, setSubcategoryId] = useState(initialData?.subcategory_id ?? "");
  const [subUnit, setSubUnit] = useState(initialData?.sub_unit ?? "");
  const [addingSubUnit, setAddingSubUnit] = useState(false);
  const [subUnitRatio, setSubUnitRatio] = useState(initialData?.sub_unit_ratio ?? "");
  const [imageUrl, setImageUrl] = useState(initialData?.image_url ?? "");
  const [description, setDescription] = useState(initialData?.description ?? "");
  const [minQty, setMinQty] = useState(initialData?.min_quantity ?? "");
  const [initialQty, setInitialQty] = useState(initialData?.initial_quantity ?? "");

  // Inline category/subcategory creation state
  const [addingCategory, setAddingCategory] = useState(false);
  const [addingSubcategory, setAddingSubcategory] = useState(false);

  const { showError } = useResultModal();
  const { data: categoriesRaw, refetch: refetchCategories } = useCategories();
  const { data: subUnitsData, refetch: refetchSubUnits } = useSubUnits();
  const createCategory = useCreateCategory();
  const createSubUnit = useCreateSubUnit();
  const { data: generatedCode } = useGenerateProductCode(autoCode);
  const { data: similarProductsData } = useProducts(
    name.length >= 2 ? { search: name, per_page: 5 } : undefined,
  );

  const topLevelCategories: InventoryCategory[] = (categoriesRaw ?? []).filter(
    (c) => !c.parent_id,
  );

  const subcategories: InventoryCategory[] = categoryId
    ? (categoriesRaw ?? []).filter((c) => c.parent_id === categoryId)
    : [];

  const similarProducts: InventoryProduct[] = (similarProductsData?.items ?? []).filter(
    (p) => p.is_active,
  );

  const effectiveSubUnit = subUnit === "__add_new__" ? "" : subUnit;

  const formData: ProductFormData = {
    name,
    code,
    auto_code: autoCode,
    category_id: categoryId,
    subcategory_id: subcategoryId,
    sub_unit: effectiveSubUnit,
    sub_unit_ratio: subUnitRatio,
    image_url: imageUrl,
    description,
    ...(showMinQty && { min_quantity: minQty }),
    ...(showInitialQty && { initial_quantity: initialQty }),
  };

  // 부모 onChange 알림 (Notify parent on change)
  useEffect(() => {
    onChange(formData);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, code, autoCode, categoryId, subcategoryId, effectiveSubUnit, subUnitRatio, imageUrl, description, minQty, initialQty]);

  // 카테고리 변경 시 소분류 초기화 (Reset subcategory on category change)
  useEffect(() => {
    setSubcategoryId("");
  }, [categoryId]);

  const categoryOptions = [
    { value: "", label: "No Category" },
    ...topLevelCategories.map((c) => ({ value: c.id, label: c.name })),
    { value: "__add_new__", label: "＋ Add New Category" },
  ];

  const subcategoryOptions = [
    { value: "", label: "No Subcategory" },
    ...subcategories.map((c) => ({ value: c.id, label: c.name })),
    ...(categoryId ? [{ value: "__add_new__", label: "＋ Add New Subcategory" }] : []),
  ];

  // Sub unit options built from server data
  const subUnitOptions = [
    { value: "", label: "None (ea only)" },
    ...(subUnitsData ?? []).map((u) => ({ value: u.code, label: u.name })),
    { value: "__add_new__", label: "＋ Add New" },
  ];

  const handleAddCategory = useCallback(
    (newName: string) => {
      createCategory.mutate(
        { name: newName, parent_id: null },
        {
          onSuccess: async (created) => {
            await refetchCategories();
            setCategoryId(created.id);
            setAddingCategory(false);
          },
          onError: (err) => {
            const msg = parseApiError(err, "Failed to create category");
            showError(msg);
          },
        },
      );
    },
    [createCategory, refetchCategories, showError],
  );

  const handleAddSubcategory = useCallback(
    (newName: string) => {
      createCategory.mutate(
        { name: newName, parent_id: categoryId || null },
        {
          onSuccess: async (created) => {
            await refetchCategories();
            setSubcategoryId(created.id);
            setAddingSubcategory(false);
          },
          onError: (err) => {
            const msg = parseApiError(err, "Failed to create subcategory");
            showError(msg);
          },
        },
      );
    },
    [createCategory, refetchCategories, categoryId, showError],
  );

  return (
    <div className="flex flex-col gap-4">
      {/* 이미지 업로드 — 맨 위 */}
      <div>
        <label className="text-sm font-medium text-text-secondary block mb-2">
          Product Image
        </label>
        <ImageUpload
          value={imageUrl || null}
          onUpload={(url) => setImageUrl(url)}
          onRemove={() => setImageUrl("")}
        />
      </div>

      {/* 제품명 + 유사 제품 경고 */}
      <div>
        <Input
          label="Product Name"
          value={name}
          placeholder="e.g. Whole Milk (1L)"
          onChange={(e) => setName(e.target.value)}
        />
        {/* 유사 제품 경고 — 2자 이상 입력 시, 기존 제품과 유사하면 표시 */}
        {name.length >= 2 && similarProducts.length > 0 && (
          <div className="mt-2 p-2.5 rounded-lg bg-warning-muted border border-warning/30">
            <div className="flex items-center gap-1.5 mb-1.5">
              <AlertTriangle size={13} className="text-warning shrink-0" />
              <span className="text-xs font-medium text-warning">Similar products exist</span>
            </div>
            <ul className="space-y-1">
              {similarProducts.slice(0, 3).map((p) => (
                <li key={p.id} className="text-xs text-text-secondary flex items-center gap-2">
                  <span className="font-medium">{p.name}</span>
                  <span className="text-text-muted">({p.code})</span>
                  {p.category_name && (
                    <span className="text-text-muted">· {p.category_name}</span>
                  )}
                </li>
              ))}
            </ul>
            <p className="text-xs text-text-muted mt-1">
              You can still register if this is a different product.
            </p>
          </div>
        )}
      </div>

      {/* 제품 코드 — 자동생성 토글 + 미리보기 */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <label className="text-sm font-medium text-text-secondary">Product Code</label>
          <button
            type="button"
            onClick={() => setAutoCode((v) => !v)}
            className={`flex items-center gap-1 text-xs px-2 py-1 rounded transition-colors ${
              autoCode
                ? "bg-accent-muted text-accent"
                : "bg-surface-hover text-text-secondary hover:text-text"
            }`}
          >
            <RefreshCw size={11} />
            {autoCode ? "Auto" : "Manual"}
          </button>
        </div>
        <Input
          value={autoCode ? (generatedCode?.code ?? "generating…") : code}
          placeholder={autoCode ? "generating…" : "Enter product code"}
          disabled={autoCode}
          onChange={(e) => setCode(e.target.value)}
        />
        {autoCode && generatedCode?.code && (
          <p className="text-xs text-text-muted mt-1">
            Preview: the code will be auto-generated as shown above.
          </p>
        )}
        {!autoCode && (
          <p className="text-xs text-text-muted mt-1">
            Code must be unique within your organization.
          </p>
        )}
      </div>

      {/* 카테고리 + 소분류 */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Select
            label="Category"
            options={categoryOptions}
            value={addingCategory ? "__add_new__" : categoryId}
            onChange={(e) => {
              if (e.target.value === "__add_new__") {
                setAddingCategory(true);
              } else {
                setCategoryId(e.target.value);
                setAddingCategory(false);
              }
            }}
          />
          {addingCategory && (
            <InlineAddInput
              placeholder="New category name"
              isLoading={createCategory.isPending}
              onAdd={handleAddCategory}
              onCancel={() => setAddingCategory(false)}
            />
          )}
        </div>
        <div>
          <Select
            label="Subcategory"
            options={subcategoryOptions}
            value={addingSubcategory ? "__add_new__" : subcategoryId}
            disabled={!categoryId}
            onChange={(e) => {
              if (e.target.value === "__add_new__") {
                setAddingSubcategory(true);
              } else {
                setSubcategoryId(e.target.value);
                setAddingSubcategory(false);
              }
            }}
          />
          {addingSubcategory && (
            <InlineAddInput
              placeholder="New subcategory name"
              isLoading={createCategory.isPending}
              onAdd={handleAddSubcategory}
              onCancel={() => setAddingSubcategory(false)}
            />
          )}
        </div>
      </div>

      {/* 기본 단위 (읽기전용) + 서브유닛 */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-sm font-medium text-text-secondary block mb-1.5">
            Base Unit
          </label>
          <div className="w-full rounded-lg border border-border bg-surface/50 px-3 py-2 text-sm text-text-muted">
            ea (piece)
          </div>
          <p className="text-xs text-text-muted mt-1">Always ea — cannot change</p>
        </div>
        <div>
          <Select
            label="Sub Unit"
            options={subUnitOptions}
            value={subUnit}
            onChange={(e) => {
              const val = e.target.value;
              if (val === "__add_new__") {
                setAddingSubUnit(true);
                setSubUnit("");
              } else {
                setSubUnit(val);
                setAddingSubUnit(false);
                if (!val) setSubUnitRatio("");
              }
            }}
          />
          {addingSubUnit && (
            <InlineAddInput
              placeholder="e.g. crate, tray..."
              isLoading={createSubUnit.isPending}
              onAdd={(newName) => {
                const code = newName.toLowerCase().replace(/\s+/g, "_");
                // Check duplicate by code
                if ((subUnitsData ?? []).some((u) => u.code === code)) {
                  showError(`"${newName}" already exists`);
                  return;
                }
                createSubUnit.mutate(
                  { name: newName, code },
                  {
                    onSuccess: async (created) => {
                      await refetchSubUnits();
                      setSubUnit(created.code);
                      setAddingSubUnit(false);
                    },
                    onError: (err) => {
                      showError(parseApiError(err, "Failed to create sub unit."));
                    },
                  },
                );
              }}
              onCancel={() => setAddingSubUnit(false)}
            />
          )}
        </div>
      </div>

      {/* 서브유닛 비율 — 서브유닛 선택 시에만 표시 */}
      {subUnit && subUnit !== "" && (
        <Input
          label={`Sub Unit Ratio (1 ${effectiveSubUnit || "sub unit"} = ? ea)`}
          type="number"
          min="1"
          value={subUnitRatio}
          placeholder="e.g. 10"
          onChange={(e) => setSubUnitRatio(e.target.value)}
        />
      )}

      {!subUnit && (
        <p className="text-xs text-text-muted -mt-2">
          Leave empty if product is only counted in pieces (ea)
        </p>
      )}

      {/* 설명 */}
      <Textarea
        label="Description"
        value={description}
        placeholder="Product notes, specifications, or other details (optional)"
        rows={3}
        onChange={(e) => setDescription(e.target.value)}
      />

      {/* 선택적 필드 — min_quantity */}
      {showMinQty && (
        <Input
          label="Min Quantity (ea)"
          type="number"
          min="0"
          value={minQty}
          placeholder="0"
          onChange={(e) => setMinQty(e.target.value)}
        />
      )}

      {/* 선택적 필드 — initial_quantity */}
      {showInitialQty && (
        <Input
          label="Initial Quantity (ea)"
          type="number"
          min="0"
          value={initialQty}
          placeholder="0"
          onChange={(e) => setInitialQty(e.target.value)}
        />
      )}
    </div>
  );
}
