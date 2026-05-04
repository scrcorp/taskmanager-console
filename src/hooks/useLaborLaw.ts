/**
 * 근로기준법 설정 React Query 훅.
 *
 * 매장별 근로기준법 설정(주간 최대 근무시간, 일일 초과근무 기준 등)을
 * 조회하고 생성/수정(upsert)합니다.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { useMutationResult } from "@/lib/mutationResult";
import type { LaborLawSetting } from "@/types";

/** 매장별 근로기준법 설정 조회 — 설정 없으면 null 반환 */
export function useLaborLaw(storeId: string) {
  return useQuery<LaborLawSetting | null>({
    queryKey: ["laborLaw", storeId],
    queryFn: () => api.get(`/admin/stores/${storeId}/labor-law`).then((r) => r.data),
    enabled: !!storeId,
  });
}

/** 근로기준법 설정 생성/수정 (upsert) — 연방/주/매장별 최대 근무시간 설정 */
export function useUpsertLaborLaw() {
  const qc = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<
    LaborLawSetting,
    Error,
    { storeId: string; federal_max_weekly: number; state_max_weekly?: number | null; store_max_weekly?: number | null; overtime_threshold_daily?: number | null }
  >({
    mutationFn: (data) =>
      api.put(`/admin/stores/${data.storeId}/labor-law`, {
        federal_max_weekly: data.federal_max_weekly,
        state_max_weekly: data.state_max_weekly ?? null,
        store_max_weekly: data.store_max_weekly ?? null,
        overtime_threshold_daily: data.overtime_threshold_daily ?? null,
      }).then((r) => r.data),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["laborLaw", v.storeId] });
      success("Labor law settings saved.");
    },
    onError: error("Couldn't save labor law settings"),
  });
}
