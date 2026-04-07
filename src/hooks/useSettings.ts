/**
 * useSettings — Settings Registry / Org / Store / Resolve hooks.
 * server endpoints: /api/v1/admin/settings/...
 */

import { useQuery, useMutation, useQueryClient, type UseQueryResult, type UseMutationResult } from "@tanstack/react-query";
import type { AxiosResponse } from "axios";
import api from "@/lib/api";

// ─── Types ─────────────────────────────────────────────────

export interface SettingsRegistryEntry {
  key: string;
  label: string;
  description: string | null;
  value_type: string; // number | boolean | string | json
  levels: string[];
  default_priority: string;
  default_value: unknown;
  validation_schema: Record<string, unknown> | null;
  category: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrgSettingEntry {
  id: string;
  organization_id: string;
  key: string;
  value: unknown;
  force_locked: boolean;
  updated_by: string | null;
  updated_at: string;
}

export interface StoreSettingEntry {
  id: string;
  store_id: string;
  key: string;
  value: unknown;
  updated_by: string | null;
  updated_at: string;
}

export interface ResolvedSetting {
  key: string;
  value: unknown;
  source: string;
}

// ─── Registry ──────────────────────────────────────────────

export const useSettingsRegistry = (
  category?: string,
): UseQueryResult<SettingsRegistryEntry[], Error> => {
  return useQuery<SettingsRegistryEntry[], Error>({
    queryKey: ["settings", "registry", category ?? null],
    queryFn: async () => {
      const res: AxiosResponse<SettingsRegistryEntry[]> = await api.get(
        "/admin/settings/registry",
        { params: category ? { category } : undefined },
      );
      return res.data;
    },
  });
};

export const useUpsertRegistryEntry = (): UseMutationResult<SettingsRegistryEntry, Error, Omit<SettingsRegistryEntry, "created_at" | "updated_at">> => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data) => {
      const res: AxiosResponse<SettingsRegistryEntry> = await api.put("/admin/settings/registry", data);
      return res.data;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["settings", "registry"] }); },
  });
};

// ─── Org Settings ──────────────────────────────────────────

export const useOrgSettings = (): UseQueryResult<OrgSettingEntry[], Error> => {
  return useQuery<OrgSettingEntry[], Error>({
    queryKey: ["settings", "org"],
    queryFn: async () => {
      const res: AxiosResponse<OrgSettingEntry[]> = await api.get("/admin/settings/org");
      return res.data;
    },
  });
};

export const useUpsertOrgSetting = (): UseMutationResult<OrgSettingEntry, Error, { key: string; value: unknown; force_locked?: boolean }> => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data) => {
      const res: AxiosResponse<OrgSettingEntry> = await api.put("/admin/settings/org", {
        key: data.key,
        value: data.value,
        force_locked: data.force_locked ?? false,
      });
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings", "org"] });
      qc.invalidateQueries({ queryKey: ["settings", "resolve"] });
    },
  });
};

export const useDeleteOrgSetting = (): UseMutationResult<void, Error, string> => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (key) => { await api.delete(`/admin/settings/org/${key}`); },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings", "org"] });
      qc.invalidateQueries({ queryKey: ["settings", "resolve"] });
    },
  });
};

// ─── Store Settings ────────────────────────────────────────

export const useStoreSettings = (storeId: string | undefined): UseQueryResult<StoreSettingEntry[], Error> => {
  return useQuery<StoreSettingEntry[], Error>({
    queryKey: ["settings", "store", storeId],
    queryFn: async () => {
      const res: AxiosResponse<StoreSettingEntry[]> = await api.get(`/admin/settings/stores/${storeId}`);
      return res.data;
    },
    enabled: !!storeId,
  });
};

export const useUpsertStoreSetting = (storeId: string): UseMutationResult<StoreSettingEntry, Error, { key: string; value: unknown }> => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data) => {
      const res: AxiosResponse<StoreSettingEntry> = await api.put(`/admin/settings/stores/${storeId}`, data);
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings", "store", storeId] });
      qc.invalidateQueries({ queryKey: ["settings", "resolve"] });
    },
  });
};

export const useDeleteStoreSetting = (storeId: string): UseMutationResult<void, Error, string> => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (key) => { await api.delete(`/admin/settings/stores/${storeId}/${key}`); },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings", "store", storeId] });
      qc.invalidateQueries({ queryKey: ["settings", "resolve"] });
    },
  });
};

// ─── Resolve ───────────────────────────────────────────────

export const useResolveSetting = (
  key: string,
  scope?: { store_id?: string; user_id?: string },
): UseQueryResult<ResolvedSetting, Error> => {
  return useQuery<ResolvedSetting, Error>({
    queryKey: ["settings", "resolve", key, scope],
    queryFn: async () => {
      const params: Record<string, string> = { key };
      if (scope?.store_id) params.store_id = scope.store_id;
      if (scope?.user_id) params.user_id = scope.user_id;
      const res: AxiosResponse<ResolvedSetting> = await api.get("/admin/settings/resolve", { params });
      return res.data;
    },
    enabled: !!key,
  });
};
