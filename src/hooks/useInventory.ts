import {
  useQuery,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
  keepPreviousData,
  type UseQueryResult,
  type UseInfiniteQueryResult,
  type InfiniteData,
  type UseMutationResult,
  type QueryClient,
} from "@tanstack/react-query";
import type { AxiosResponse } from "axios";
import api from "@/lib/api";
import { useMutationResult } from "@/lib/mutationResult";
import type {
  InventoryCategory,
  InventoryCategoryCreate,
  InventoryCategoryUpdate,
  InventoryProduct,
  InventoryProductDetail,
  InventoryProductCreate,
  InventoryProductUpdate,
  InventoryProductFilters,
  InventorySubUnit,
  InventorySubUnitCreate,
  InventorySubUnitUpdate,
  StoreInventoryItem,
  StoreInventorySummary,
  StoreInventoryFilters,
  StoreInventoryItemUpdate,
  BulkAddStoreInventoryRequest,
  InventoryTransaction,
  InventoryTransactionCreate,
  InventoryTransactionFilters,
  BulkStockInRequest,
  BulkStockOutRequest,
  InventoryAudit,
  InventoryAuditDetail,
  AuditSetting,
  AuditSettingUpdate,
  PaginatedResponse,
} from "@/types";

// ─── Category Hooks ───────────────────────────────────────────────────────────

/**
 * 카테고리 트리를 평탄화하는 유틸리티.
 * Flatten a nested category tree (server may return children embedded) into a flat list.
 * Ensures parent_id is preserved correctly on child items.
 */
function flattenCategories(categories: InventoryCategory[]): InventoryCategory[] {
  const result: InventoryCategory[] = [];
  for (const cat of categories) {
    result.push(cat);
    if (cat.children?.length) {
      for (const child of cat.children) {
        // Ensure parent_id is set correctly in case server omits it in nested form
        result.push({ ...child, parent_id: child.parent_id ?? cat.id });
      }
    }
  }
  return result;
}

/**
 * 카테고리 목록 조회 훅 — 트리 구조를 평탄화하여 반환.
 * Fetch all inventory categories and flatten the tree so subcategories are
 * accessible as flat items with parent_id set (fixes subcategory filtering by id).
 */
export const useCategories = (): UseQueryResult<InventoryCategory[], Error> => {
  return useQuery<InventoryCategory[], Error>({
    queryKey: ["inventory", "categories"],
    queryFn: async (): Promise<InventoryCategory[]> => {
      const response: AxiosResponse<InventoryCategory[]> = await api.get(
        "/admin/inventory/categories",
      );
      return flattenCategories(response.data);
    },
  });
};

/**
 * 카테고리 생성 훅.
 * Create a new inventory category.
 */
export const useCreateCategory = (): UseMutationResult<
  InventoryCategory,
  Error,
  InventoryCategoryCreate
> => {
  const queryClient: QueryClient = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<InventoryCategory, Error, InventoryCategoryCreate>({
    mutationFn: async (data): Promise<InventoryCategory> => {
      const response: AxiosResponse<InventoryCategory> = await api.post(
        "/admin/inventory/categories",
        data,
      );
      return response.data;
    },
    onSuccess: (): void => {
      queryClient.invalidateQueries({ queryKey: ["inventory", "categories"] });
      success("Category created.");
    },
    onError: error("Couldn't create category"),
  });
};

/**
 * 카테고리 수정 훅.
 * Update an existing inventory category.
 */
export const useUpdateCategory = (): UseMutationResult<
  InventoryCategory,
  Error,
  { id: string } & InventoryCategoryUpdate
> => {
  const queryClient: QueryClient = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<InventoryCategory, Error, { id: string } & InventoryCategoryUpdate>({
    mutationFn: async ({ id, ...data }): Promise<InventoryCategory> => {
      const response: AxiosResponse<InventoryCategory> = await api.put(
        `/admin/inventory/categories/${id}`,
        data,
      );
      return response.data;
    },
    onSuccess: (): void => {
      queryClient.invalidateQueries({ queryKey: ["inventory", "categories"] });
      success("Category updated.");
    },
    onError: error("Couldn't update category"),
  });
};

/**
 * 카테고리 삭제 훅 — 하위 카테고리나 연결 제품 없을 때만 가능.
 * Delete a category (blocked if it has children or linked products).
 */
export const useDeleteCategory = (): UseMutationResult<void, Error, string> => {
  const queryClient: QueryClient = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<void, Error, string>({
    mutationFn: async (id: string): Promise<void> => {
      await api.delete(`/admin/inventory/categories/${id}`);
    },
    onSuccess: (): void => {
      queryClient.invalidateQueries({ queryKey: ["inventory", "categories"] });
      success("Category deleted.");
    },
    onError: error("Couldn't delete category"),
  });
};

// ─── Sub Unit Hooks ───────────────────────────────────────────────────────────

/**
 * 서브유닛 목록 조회 훅.
 * Fetch all sub units for the organization.
 */
export const useSubUnits = (): UseQueryResult<InventorySubUnit[], Error> => {
  return useQuery<InventorySubUnit[], Error>({
    queryKey: ["inventory", "sub-units"],
    queryFn: async (): Promise<InventorySubUnit[]> => {
      const response: AxiosResponse<InventorySubUnit[]> = await api.get(
        "/admin/inventory/sub-units",
      );
      return response.data;
    },
  });
};

/**
 * 서브유닛 생성 훅.
 * Create a new sub unit.
 */
export const useCreateSubUnit = (): UseMutationResult<
  InventorySubUnit,
  Error,
  InventorySubUnitCreate
> => {
  const queryClient: QueryClient = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<InventorySubUnit, Error, InventorySubUnitCreate>({
    mutationFn: async (data): Promise<InventorySubUnit> => {
      const response: AxiosResponse<InventorySubUnit> = await api.post(
        "/admin/inventory/sub-units",
        data,
      );
      return response.data;
    },
    onSuccess: (): void => {
      queryClient.invalidateQueries({ queryKey: ["inventory", "sub-units"] });
      success("Sub unit created.");
    },
    onError: error("Couldn't create sub unit"),
  });
};

/**
 * 서브유닛 수정 훅 — 이름만 변경 가능.
 * Update a sub unit (name only; code stays).
 */
export const useUpdateSubUnit = (): UseMutationResult<
  InventorySubUnit,
  Error,
  { id: string } & InventorySubUnitUpdate
> => {
  const queryClient: QueryClient = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<InventorySubUnit, Error, { id: string } & InventorySubUnitUpdate>({
    mutationFn: async ({ id, ...data }): Promise<InventorySubUnit> => {
      const response: AxiosResponse<InventorySubUnit> = await api.put(
        `/admin/inventory/sub-units/${id}`,
        data,
      );
      return response.data;
    },
    onSuccess: (): void => {
      queryClient.invalidateQueries({ queryKey: ["inventory", "sub-units"] });
      success("Sub unit updated.");
    },
    onError: error("Couldn't update sub unit"),
  });
};

/**
 * 서브유닛 삭제 훅 — 제품에서 사용 중이면 서버에서 403 반환.
 * Delete a sub unit (blocked if products use it — server returns 403).
 */
export const useDeleteSubUnit = (): UseMutationResult<void, Error, string> => {
  const queryClient: QueryClient = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<void, Error, string>({
    mutationFn: async (id: string): Promise<void> => {
      await api.delete(`/admin/inventory/sub-units/${id}`);
    },
    onSuccess: (): void => {
      queryClient.invalidateQueries({ queryKey: ["inventory", "sub-units"] });
      success("Sub unit deleted.");
    },
    onError: error("Couldn't delete sub unit"),
  });
};

// ─── Excel Import / Template ──────────────────────────────────────────────────

/**
 * 제품 Excel 템플릿 다운로드 훅.
 * Download the Excel import template file.
 */
export const useDownloadProductTemplate = (): (() => Promise<void>) => {
  return async (): Promise<void> => {
    const response: AxiosResponse<Blob> = await api.get(
      "/admin/inventory/products/excel-template",
      { responseType: "blob" },
    );
    const url = URL.createObjectURL(response.data);
    const a = document.createElement("a");
    a.href = url;
    a.download = "product_import_template.xlsx";
    a.click();
    URL.revokeObjectURL(url);
  };
};

export interface ProductImportResult {
  created: number;
  linked: number;
  skipped: string[] | number;
  errors: string[];
  error?: string;
  warnings?: string[];
  validation_errors?: string[];
  rows_parsed?: number;
}

/**
 * 제품 Excel 가져오기 훅.
 * Import products from an Excel file.
 */
export const useImportProducts = (): UseMutationResult<
  ProductImportResult,
  Error,
  FormData
> => {
  const queryClient: QueryClient = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<ProductImportResult, Error, FormData>({
    mutationFn: async (formData: FormData): Promise<ProductImportResult> => {
      const response: AxiosResponse<ProductImportResult> = await api.post(
        "/admin/inventory/products/import",
        formData,
        { headers: { "Content-Type": "multipart/form-data" } },
      );
      return response.data;
    },
    onSuccess: (): void => {
      queryClient.invalidateQueries({ queryKey: ["inventory", "products"] });
      success("Import complete.");
    },
    onError: error("Couldn't import products"),
  });
};

/** Preview import item from server */
export interface ImportPreviewItem {
  row: number;
  name: string;
  code: string | null;
  category: string;
  store_codes: string;
  existing_code: string | null;
  duplicate_name: string | null;
  action: "link" | "create";
}

/** Preview import response from server */
export interface ImportPreviewResult {
  items?: ImportPreviewItem[];
  total?: number;
  error?: string;
  /** Per-row parse/coercion errors (e.g. wrong column type). */
  row_errors?: string[];
}

/**
 * Excel import preview — parse and check duplicates without creating.
 */
export const usePreviewImport = (): UseMutationResult<
  ImportPreviewResult,
  Error,
  FormData
> => {
  const { error } = useMutationResult();
  return useMutation<ImportPreviewResult, Error, FormData>({
    mutationFn: async (formData: FormData): Promise<ImportPreviewResult> => {
      const response: AxiosResponse<ImportPreviewResult> = await api.post(
        "/admin/inventory/products/preview-import",
        formData,
        { headers: { "Content-Type": "multipart/form-data" } },
      );
      return response.data;
    },
    onError: error("Couldn't preview import"),
  });
};

// ─── Product Code Generation ───────────────────────────────────────────────────

/**
 * 제품 코드 자동생성 미리보기 훅.
 * Fetch a preview of the auto-generated product code.
 * @param enabled - set false to skip fetching (e.g. when in manual-code mode)
 */
export const useGenerateProductCode = (enabled = true): UseQueryResult<{ code: string }, Error> => {
  return useQuery<{ code: string }, Error>({
    queryKey: ["inventory", "products", "generate-code"],
    queryFn: async (): Promise<{ code: string }> => {
      const response: AxiosResponse<{ code: string }> = await api.get(
        "/admin/inventory/products/generate-code",
      );
      return response.data;
    },
    enabled,
    // Always re-fetch on mount so we get a fresh code each time the modal opens
    staleTime: 0,
  });
};

// ─── Product Hooks ────────────────────────────────────────────────────────────

/**
 * 제품 목록 조회 훅 — 검색/필터/페이지네이션 지원.
 * Fetch paginated product list with optional filters.
 */
export const useProducts = (
  filters?: InventoryProductFilters,
): UseQueryResult<PaginatedResponse<InventoryProduct>, Error> => {
  return useQuery<PaginatedResponse<InventoryProduct>, Error>({
    queryKey: ["inventory", "products", filters],
    queryFn: async (): Promise<PaginatedResponse<InventoryProduct>> => {
      const params: Record<string, string> = {};
      if (filters?.category_id) params.category_id = filters.category_id;
      if (filters?.subcategory_id) params.subcategory_id = filters.subcategory_id;
      if (filters?.is_active !== undefined) params.is_active = String(filters.is_active);
      if (filters?.search) params.keyword = filters.search;
      if (filters?.search_field) params.search_field = filters.search_field;
      if (filters?.page) params.page = String(filters.page);
      if (filters?.per_page) params.per_page = String(filters.per_page);
      if (filters?.sort_by) params.sort_by = filters.sort_by;
      if (filters?.sort_dir) params.sort_dir = filters.sort_dir;

      const response: AxiosResponse<PaginatedResponse<InventoryProduct>> = await api.get(
        "/admin/inventory/products",
        { params },
      );
      return response.data;
    },
    placeholderData: keepPreviousData,
  });
};

/**
 * 제품 상세 조회 훅 — 매장 사용현황 포함.
 * Fetch a single product with store usage details.
 */
export const useProduct = (
  id: string | undefined,
): UseQueryResult<InventoryProductDetail, Error> => {
  return useQuery<InventoryProductDetail, Error>({
    queryKey: ["inventory", "products", id],
    queryFn: async (): Promise<InventoryProductDetail> => {
      const response: AxiosResponse<InventoryProductDetail> = await api.get(
        `/admin/inventory/products/${id}`,
      );
      return response.data;
    },
    enabled: !!id,
  });
};

/**
 * 제품 생성 훅.
 * Create a new product (optionally link to stores immediately).
 */
export const useCreateProduct = (): UseMutationResult<
  InventoryProduct,
  Error,
  InventoryProductCreate
> => {
  const queryClient: QueryClient = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<InventoryProduct, Error, InventoryProductCreate>({
    mutationFn: async (data): Promise<InventoryProduct> => {
      const response: AxiosResponse<InventoryProduct> = await api.post(
        "/admin/inventory/products",
        data,
      );
      return response.data;
    },
    onSuccess: (): void => {
      queryClient.invalidateQueries({ queryKey: ["inventory", "products"] });
      success("Product created.");
    },
    onError: error("Couldn't create product"),
  });
};

/**
 * 제품 수정 훅.
 * Update an existing product.
 */
export const useUpdateProduct = (): UseMutationResult<
  InventoryProduct,
  Error,
  { id: string } & InventoryProductUpdate
> => {
  const queryClient: QueryClient = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<InventoryProduct, Error, { id: string } & InventoryProductUpdate>({
    mutationFn: async ({ id, ...data }): Promise<InventoryProduct> => {
      const response: AxiosResponse<InventoryProduct> = await api.put(
        `/admin/inventory/products/${id}`,
        data,
      );
      return response.data;
    },
    onSuccess: (_: InventoryProduct, variables): void => {
      queryClient.invalidateQueries({ queryKey: ["inventory", "products"] });
      queryClient.invalidateQueries({ queryKey: ["inventory", "products", variables.id] });
      success("Product updated.");
    },
    onError: error("Couldn't update product"),
  });
};

/**
 * 제품 비활성화 훅 — soft delete (is_active=false).
 * Deactivate a product (soft delete — preserves history).
 */
export const useDeactivateProduct = (): UseMutationResult<void, Error, string> => {
  const queryClient: QueryClient = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<void, Error, string>({
    mutationFn: async (id: string): Promise<void> => {
      await api.delete(`/admin/inventory/products/${id}`);
    },
    onSuccess: (): void => {
      queryClient.invalidateQueries({ queryKey: ["inventory", "products"] });
      success("Product deactivated.");
    },
    onError: error("Couldn't deactivate product"),
  });
};

export const useActivateProduct = (): UseMutationResult<InventoryProduct, Error, string> => {
  const queryClient: QueryClient = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<InventoryProduct, Error, string>({
    mutationFn: async (id: string): Promise<InventoryProduct> => {
      const response: AxiosResponse<InventoryProduct> = await api.post(`/admin/inventory/products/${id}/activate`);
      return response.data;
    },
    onSuccess: (): void => {
      queryClient.invalidateQueries({ queryKey: ["inventory", "products"] });
      success("Product activated.");
    },
    onError: error("Couldn't activate product"),
  });
};

export const useDeleteProduct = (): UseMutationResult<void, Error, string> => {
  const queryClient: QueryClient = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<void, Error, string>({
    mutationFn: async (id: string): Promise<void> => {
      await api.post(`/admin/inventory/products/${id}/delete`);
    },
    onSuccess: (): void => {
      queryClient.invalidateQueries({ queryKey: ["inventory", "products"] });
      success("Product deleted.");
    },
    onError: error("Couldn't delete product"),
  });
};

// ─── Store Inventory Hooks ────────────────────────────────────────────────────

/**
 * 매장 재고 목록 조회 훅.
 * Fetch store inventory items with filters.
 */
export const useStoreInventory = (
  storeId: string | undefined,
  filters?: StoreInventoryFilters,
): UseQueryResult<PaginatedResponse<StoreInventoryItem>, Error> => {
  return useQuery<PaginatedResponse<StoreInventoryItem>, Error>({
    queryKey: ["inventory", "stores", storeId, "items", filters],
    queryFn: async (): Promise<PaginatedResponse<StoreInventoryItem>> => {
      const params: Record<string, string> = {};
      if (filters?.category_id) params.category_id = filters.category_id;
      if (filters?.search) params.keyword = filters.search;
      if (filters?.search_field) params.search_field = filters.search_field;
      if (filters?.stock_status) params.status = filters.stock_status;
      if (filters?.is_frequent !== undefined) params.is_frequent = String(filters.is_frequent);
      if (filters?.page) params.page = String(filters.page);
      if (filters?.per_page) params.per_page = String(filters.per_page);
      if (filters?.sort_by) params.sort_by = filters.sort_by;
      if (filters?.sort_dir) params.sort_dir = filters.sort_dir;

      const response: AxiosResponse<PaginatedResponse<StoreInventoryItem>> = await api.get(
        `/admin/stores/${storeId}/inventory`,
        { params },
      );
      return response.data;
    },
    enabled: !!storeId,
    placeholderData: keepPreviousData,
  });
};

/**
 * 매장 재고 요약 통계 훅.
 * Fetch store inventory summary (total, in_stock, low_stock, out_of_stock).
 */
export const useStoreInventorySummary = (
  storeId: string | undefined,
): UseQueryResult<StoreInventorySummary, Error> => {
  return useQuery<StoreInventorySummary, Error>({
    queryKey: ["inventory", "stores", storeId, "summary"],
    queryFn: async (): Promise<StoreInventorySummary> => {
      const response: AxiosResponse<StoreInventorySummary> = await api.get(
        `/admin/stores/${storeId}/inventory/summary`,
      );
      return response.data;
    },
    enabled: !!storeId,
    // Keep previous data visible while refetching — prevents cards from flashing 0
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
};

/** Product item augmented with `is_in_store` flag (Add Products modal). */
export interface AddableProduct extends InventoryProduct {
  is_in_store: boolean;
}

interface AddableProductsPage {
  items: AddableProduct[];
  total: number;
  page: number;
  per_page: number;
}

const ADDABLE_PER_PAGE = 30;

/**
 * Infinite scroll list of products for the "Add Products" modal.
 * Server returns every active org product with `is_in_store` flag,
 * sorted addable-first then by name. Search is server-side.
 */
export const useAddableProducts = (
  storeId: string | undefined,
  search: string,
  enabled: boolean,
): UseInfiniteQueryResult<InfiniteData<AddableProductsPage>, Error> => {
  return useInfiniteQuery<AddableProductsPage, Error>({
    queryKey: ["inventory", "stores", storeId, "addable-products", search],
    queryFn: async ({ pageParam }): Promise<AddableProductsPage> => {
      const params: Record<string, string> = {
        page: String(pageParam ?? 1),
        per_page: String(ADDABLE_PER_PAGE),
      };
      if (search) params.keyword = search;
      const response: AxiosResponse<AddableProductsPage> = await api.get(
        `/admin/stores/${storeId}/inventory/addable-products`,
        { params },
      );
      return response.data;
    },
    initialPageParam: 1,
    getNextPageParam: (last) => {
      const loaded = last.page * last.per_page;
      return loaded < last.total ? last.page + 1 : undefined;
    },
    enabled: !!storeId && enabled,
    staleTime: 0,
  });
};

/**
 * 매장 재고 일괄 추가 훅.
 * Bulk add multiple products to a store's inventory.
 */
export const useBulkAddStoreInventory = (
  storeId: string,
): UseMutationResult<StoreInventoryItem[], Error, BulkAddStoreInventoryRequest> => {
  const queryClient: QueryClient = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<StoreInventoryItem[], Error, BulkAddStoreInventoryRequest>({
    mutationFn: async (data): Promise<StoreInventoryItem[]> => {
      const response: AxiosResponse<StoreInventoryItem[]> = await api.post(
        `/admin/stores/${storeId}/inventory`,
        data,
      );
      return response.data;
    },
    onSuccess: (result): void => {
      queryClient.invalidateQueries({ queryKey: ["inventory", "stores", storeId] });
      const count = result?.length ?? 0;
      success(`${count} item${count === 1 ? "" : "s"} added.`);
    },
    onError: error("Couldn't add inventory items"),
  });
};

/**
 * 매장 재고 항목 수정 훅 — min_quantity, is_frequent 등.
 * Update a store inventory item's settings.
 */
export const useUpdateStoreInventoryItem = (
  storeId: string,
): UseMutationResult<StoreInventoryItem, Error, { id: string } & StoreInventoryItemUpdate> => {
  const queryClient: QueryClient = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<StoreInventoryItem, Error, { id: string } & StoreInventoryItemUpdate>({
    mutationFn: async ({ id, ...data }): Promise<StoreInventoryItem> => {
      const response: AxiosResponse<StoreInventoryItem> = await api.put(
        `/admin/stores/${storeId}/inventory/${id}`,
        data,
      );
      return response.data;
    },
    onSuccess: (): void => {
      queryClient.invalidateQueries({ queryKey: ["inventory", "stores", storeId] });
      success("Inventory item updated.");
    },
    onError: error("Couldn't update inventory item"),
  });
};

export const useRemoveStoreInventoryItem = (
  storeId: string,
): UseMutationResult<void, Error, string> => {
  const queryClient: QueryClient = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<void, Error, string>({
    mutationFn: async (itemId: string): Promise<void> => {
      await api.delete(`/admin/stores/${storeId}/inventory/${itemId}`);
    },
    onSuccess: (): void => {
      queryClient.invalidateQueries({ queryKey: ["inventory", "stores", storeId] });
      success("Inventory item removed.");
    },
    onError: error("Couldn't remove inventory item"),
  });
};

// ─── Transaction Hooks ────────────────────────────────────────────────────────

/**
 * 매장 전체 입출고 히스토리 조회 훅.
 * Fetch all transactions for a store with filters.
 */
export const useStoreTransactions = (
  storeId: string | undefined,
  filters?: InventoryTransactionFilters,
): UseQueryResult<PaginatedResponse<InventoryTransaction>, Error> => {
  return useQuery<PaginatedResponse<InventoryTransaction>, Error>({
    queryKey: ["inventory", "stores", storeId, "transactions", filters],
    queryFn: async (): Promise<PaginatedResponse<InventoryTransaction>> => {
      const params: Record<string, string> = {};
      if (filters?.product_id) params.product_id = filters.product_id;
      if (filters?.type) params.type = filters.type;
      if (filters?.date_from) params.date_from = filters.date_from;
      if (filters?.date_to) params.date_to = filters.date_to;
      if (filters?.page) params.page = String(filters.page);
      if (filters?.per_page) params.per_page = String(filters.per_page);

      const response: AxiosResponse<PaginatedResponse<InventoryTransaction>> = await api.get(
        `/admin/stores/${storeId}/inventory/transactions`,
        { params },
      );
      return response.data;
    },
    enabled: !!storeId,
  });
};

/**
 * 개별 제품 입출고 트랜잭션 생성 훅.
 * Create a single transaction (stock_in / stock_out / adjustment) for a store inventory item.
 */
export const useCreateTransaction = (
  storeId: string,
  inventoryItemId: string,
): UseMutationResult<InventoryTransaction, Error, InventoryTransactionCreate> => {
  const queryClient: QueryClient = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<InventoryTransaction, Error, InventoryTransactionCreate>({
    mutationFn: async (data): Promise<InventoryTransaction> => {
      const response: AxiosResponse<InventoryTransaction> = await api.post(
        `/admin/stores/${storeId}/inventory/${inventoryItemId}/transactions`,
        data,
      );
      return response.data;
    },
    onSuccess: (): void => {
      queryClient.invalidateQueries({ queryKey: ["inventory", "stores", storeId] });
      success("Transaction recorded.");
    },
    onError: error("Couldn't record transaction"),
  });
};

/**
 * 다건 입고 훅.
 * Bulk stock-in for multiple products at once.
 */
export const useBulkStockIn = (
  storeId: string,
): UseMutationResult<InventoryTransaction[], Error, BulkStockInRequest> => {
  const queryClient: QueryClient = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<InventoryTransaction[], Error, BulkStockInRequest>({
    mutationFn: async (data): Promise<InventoryTransaction[]> => {
      const response: AxiosResponse<InventoryTransaction[]> = await api.post(
        `/admin/stores/${storeId}/inventory/bulk-stock-in`,
        data,
      );
      return response.data;
    },
    onSuccess: (result): void => {
      queryClient.invalidateQueries({ queryKey: ["inventory", "stores", storeId] });
      const count = result?.length ?? 0;
      success(`${count} item${count === 1 ? "" : "s"} stocked in.`);
    },
    onError: error("Couldn't bulk stock in"),
  });
};

/**
 * 다건 출고 훅.
 * Bulk stock-out for multiple products at once.
 */
export const useBulkStockOut = (
  storeId: string,
): UseMutationResult<InventoryTransaction[], Error, BulkStockOutRequest> => {
  const queryClient: QueryClient = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<InventoryTransaction[], Error, BulkStockOutRequest>({
    mutationFn: async (data): Promise<InventoryTransaction[]> => {
      const response: AxiosResponse<InventoryTransaction[]> = await api.post(
        `/admin/stores/${storeId}/inventory/bulk-stock-out`,
        data,
      );
      return response.data;
    },
    onSuccess: (result): void => {
      queryClient.invalidateQueries({ queryKey: ["inventory", "stores", storeId] });
      const count = result?.length ?? 0;
      success(`${count} item${count === 1 ? "" : "s"} stocked out.`);
    },
    onError: error("Couldn't bulk stock out"),
  });
};

// ─── Audit Hooks ──────────────────────────────────────────────────────────────

/**
 * 재고조사 히스토리 목록 조회 훅.
 * Fetch audit history list for a store.
 */
export const useStoreAudits = (
  storeId: string | undefined,
  filters?: { page?: number; per_page?: number },
): UseQueryResult<PaginatedResponse<InventoryAudit>, Error> => {
  return useQuery<PaginatedResponse<InventoryAudit>, Error>({
    queryKey: ["inventory", "stores", storeId, "audits", filters],
    queryFn: async (): Promise<PaginatedResponse<InventoryAudit>> => {
      const params: Record<string, string> = {};
      if (filters?.page) params.page = String(filters.page);
      if (filters?.per_page) params.per_page = String(filters.per_page);

      const response: AxiosResponse<PaginatedResponse<InventoryAudit>> = await api.get(
        `/admin/stores/${storeId}/inventory/audits`,
        { params },
      );
      return response.data;
    },
    enabled: !!storeId,
  });
};

/**
 * 재고조사 상세 조회 훅 — 항목별 결과 포함.
 * Fetch a single audit with per-item discrepancy details.
 */
export const useAuditDetail = (
  storeId: string | undefined,
  auditId: string | undefined,
): UseQueryResult<InventoryAuditDetail, Error> => {
  return useQuery<InventoryAuditDetail, Error>({
    queryKey: ["inventory", "stores", storeId, "audits", auditId],
    queryFn: async (): Promise<InventoryAuditDetail> => {
      const response: AxiosResponse<InventoryAuditDetail> = await api.get(
        `/admin/stores/${storeId}/inventory/audits/${auditId}`,
      );
      return response.data;
    },
    enabled: !!storeId && !!auditId,
  });
};

/**
 * 재고조사 설정 조회 훅.
 * Fetch audit settings for a store.
 */
export const useAuditSettings = (
  storeId: string | undefined,
): UseQueryResult<AuditSetting, Error> => {
  return useQuery<AuditSetting, Error>({
    queryKey: ["inventory", "stores", storeId, "audit-settings"],
    queryFn: async (): Promise<AuditSetting> => {
      const response: AxiosResponse<AuditSetting> = await api.get(
        `/admin/stores/${storeId}/inventory/audit-settings`,
      );
      return response.data;
    },
    enabled: !!storeId,
  });
};

/**
 * 재고조사 설정 수정 훅.
 * Update audit settings for a store.
 */
export const useUpdateAuditSettings = (
  storeId: string,
): UseMutationResult<AuditSetting, Error, AuditSettingUpdate> => {
  const queryClient: QueryClient = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<AuditSetting, Error, AuditSettingUpdate>({
    mutationFn: async (data): Promise<AuditSetting> => {
      const response: AxiosResponse<AuditSetting> = await api.put(
        `/admin/stores/${storeId}/inventory/audit-settings`,
        data,
      );
      return response.data;
    },
    onSuccess: (): void => {
      queryClient.invalidateQueries({
        queryKey: ["inventory", "stores", storeId, "audit-settings"],
      });
      success("Audit settings updated.");
    },
    onError: error("Couldn't update audit settings"),
  });
};
