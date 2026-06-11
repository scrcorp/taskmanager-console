/**
 * Warning category React Query hooks (v1.1).
 *
 * Backs `/api/v1/console/warning-categories`:
 *  - list (GET): all non-deleted (hidden included). Form picker filters is_hidden.
 *  - create / update(rename·hide) / delete(soft): Owner only (server-enforced).
 *
 * Re-adding the same code revives a soft-deleted row server-side.
 * Mutation result modals fire from `useMutationResult`; callers must NOT re-show.
 */
import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
  type UseMutationResult,
} from "@tanstack/react-query";
import type { AxiosResponse } from "axios";
import api from "@/lib/api";
import { useMutationResult } from "@/lib/mutationResult";
import type {
  WarningCategoryItem,
  WarningCategoryCreate,
  WarningCategoryUpdate,
} from "@/types";

const KEY = ["warning-categories"] as const;
const BASE = "/console/warning-categories";

/** All org warning categories (non-deleted, hidden included), sort_order order. */
export const useWarningCategories = (): UseQueryResult<WarningCategoryItem[], Error> => {
  return useQuery({
    queryKey: KEY,
    queryFn: async () => {
      const res: AxiosResponse<WarningCategoryItem[]> = await api.get(BASE);
      return res.data;
    },
  });
};

/** Add a category (Owner only). Same code as a deleted one → revived server-side. */
export const useCreateWarningCategory = (): UseMutationResult<
  WarningCategoryItem,
  Error,
  WarningCategoryCreate
> => {
  const qc = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<WarningCategoryItem, Error, WarningCategoryCreate>({
    mutationFn: async (data) => {
      const res: AxiosResponse<WarningCategoryItem> = await api.post(BASE, data);
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      success("Category added.");
    },
    onError: error("Couldn't add category"),
  });
};

/** Rename / hide-toggle a category (Owner only). */
export const useUpdateWarningCategory = (): UseMutationResult<
  WarningCategoryItem,
  Error,
  { id: string; data: WarningCategoryUpdate }
> => {
  const qc = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<WarningCategoryItem, Error, { id: string; data: WarningCategoryUpdate }>({
    mutationFn: async ({ id, data }) => {
      const res: AxiosResponse<WarningCategoryItem> = await api.patch(`${BASE}/${id}`, data);
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      success("Category updated.");
    },
    onError: error("Couldn't update category"),
  });
};

/** Soft-delete a category (Owner only). Re-add the same name to revive it. */
export const useDeleteWarningCategory = (): UseMutationResult<void, Error, string> => {
  const qc = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<void, Error, string>({
    mutationFn: async (id) => {
      await api.delete(`${BASE}/${id}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      success("Category deleted.");
    },
    onError: error("Couldn't delete category"),
  });
};
