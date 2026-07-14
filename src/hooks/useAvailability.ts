/**
 * Work Availability React Query hooks (console).
 *
 * Backs the availability feature against `/api/v1/console/availability`:
 *  - useAvailabilityBulk(storeId?) — every member's weekly availability, for the
 *    Staff list column. Optionally scoped to a store.
 *  - useStaffAvailability(userId)  — one member's current week + edit history,
 *    for the edit modal.
 *  - useSaveAvailability(userId)   — PUT a member's full week (manager edit).
 *
 * Requires `availability:read` (list/detail) and `availability:manage` (save),
 * enforced server-side. Mutation result modals fire from `useMutationResult`;
 * callers must NOT re-show success/error.
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
  AvailabilityMember,
  AvailabilityDetail,
  AvailabilityDayInput,
  Preset,
} from "@/types";

const KEYS = {
  bulk: (storeId?: string) => ["availability", "bulk", storeId ?? null] as const,
  staff: (userId: string) => ["availability", "staff", userId] as const,
  presets: () => ["availability", "presets"] as const,
};

/**
 * Every member's weekly availability (org-scoped, optionally a single store).
 * Pass `enabled=false` to skip the request when the viewer lacks
 * `availability:read`.
 */
export const useAvailabilityBulk = (
  storeId?: string,
  enabled: boolean = true,
): UseQueryResult<AvailabilityMember[], Error> => {
  return useQuery<AvailabilityMember[], Error>({
    queryKey: KEYS.bulk(storeId),
    queryFn: async () => {
      const res: AxiosResponse<AvailabilityMember[]> = await api.get(
        "/console/availability",
        { params: storeId ? { store_id: storeId } : {} },
      );
      return res.data;
    },
    enabled,
  });
};

/** One member's current week + edit history. Enabled only when `userId` is set. */
export const useStaffAvailability = (
  userId: string | undefined,
  enabled: boolean = true,
): UseQueryResult<AvailabilityDetail, Error> => {
  return useQuery<AvailabilityDetail, Error>({
    queryKey: KEYS.staff(userId ?? ""),
    queryFn: async () => {
      const res: AxiosResponse<AvailabilityDetail> = await api.get(
        `/console/availability/staff/${userId}`,
      );
      return res.data;
    },
    enabled: !!userId && enabled,
  });
};

/** Save (PUT) a member's full weekly availability. */
export const useSaveAvailability = (
  userId: string,
): UseMutationResult<AvailabilityMember, Error, AvailabilityDayInput[]> => {
  const qc = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<AvailabilityMember, Error, AvailabilityDayInput[]>({
    mutationFn: async (days) => {
      const res: AxiosResponse<AvailabilityMember> = await api.put(
        `/console/availability/staff/${userId}`,
        { days },
      );
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["availability", "bulk"] });
      qc.invalidateQueries({ queryKey: KEYS.staff(userId) });
      success("Availability updated.");
    },
    onError: error("Couldn't update availability"),
  });
};

/**
 * Weekly availability presets: built-in system templates + org custom.
 * Requires `availability:read`. Pass `enabled=false` to skip when the viewer
 * can't manage availability (the only consumers are manage-gated surfaces).
 */
export const usePresets = (
  enabled: boolean = true,
): UseQueryResult<Preset[], Error> => {
  return useQuery<Preset[], Error>({
    queryKey: KEYS.presets(),
    queryFn: async () => {
      const res: AxiosResponse<Preset[]> = await api.get(
        "/console/availability/presets",
      );
      return res.data;
    },
    enabled,
  });
};

/** Create an org custom preset from a full week. Requires `availability:manage`. */
export const useCreatePreset = (): UseMutationResult<
  Preset,
  Error,
  { name: string; days: AvailabilityDayInput[] }
> => {
  const qc = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<Preset, Error, { name: string; days: AvailabilityDayInput[] }>({
    mutationFn: async ({ name, days }) => {
      const res: AxiosResponse<Preset> = await api.post(
        "/console/availability/presets",
        { name, days },
      );
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.presets() });
      success("Preset saved.");
    },
    onError: error("Couldn't save preset"),
  });
};

/** Delete an org custom preset. System presets are rejected server-side. */
export const useDeletePreset = (): UseMutationResult<void, Error, string> => {
  const qc = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<void, Error, string>({
    mutationFn: async (presetId) => {
      await api.delete(`/console/availability/presets/${presetId}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.presets() });
      success("Preset deleted.");
    },
    onError: error("Couldn't delete preset"),
  });
};
