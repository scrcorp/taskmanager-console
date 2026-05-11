/**
 * 근무 프리셋 React Query 훅.
 *
 * 매장별 근무 프리셋(시작/종료 시간 템플릿)의 CRUD를 제공합니다.
 * 스케줄 생성 시 빠른 시간 입력을 위해 사용됩니다.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { useMutationResult } from "@/lib/mutationResult";
import type { ShiftPreset } from "@/types";

/** 매장별 근무 프리셋 목록 조회 */
export function useShiftPresets(storeId: string) {
  return useQuery<ShiftPreset[]>({
    queryKey: ["shiftPresets", storeId],
    queryFn: () => api.get(`/console/stores/${storeId}/shift-presets`).then((r) => r.data),
    enabled: !!storeId,
  });
}

/** 근무 프리셋 생성 — 근무시간대에 이름, 시작/종료 시간 설정 */
export function useCreateShiftPreset() {
  const qc = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<
    ShiftPreset,
    Error,
    { storeId: string; shift_id: string; name: string; start_time: string; end_time: string; sort_order?: number }
  >({
    mutationFn: (data) =>
      api.post(`/console/stores/${data.storeId}/shift-presets`, {
        shift_id: data.shift_id,
        name: data.name,
        start_time: data.start_time,
        end_time: data.end_time,
        sort_order: data.sort_order ?? 0,
      }).then((r) => r.data),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["shiftPresets", v.storeId] });
      success("Shift preset created.");
    },
    onError: error("Couldn't create shift preset"),
  });
}

/** 근무 프리셋 수정 */
export function useUpdateShiftPreset() {
  const qc = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<
    ShiftPreset,
    Error,
    { id: string; storeId: string; name?: string; start_time?: string; end_time?: string; is_active?: boolean; sort_order?: number }
  >({
    mutationFn: (data) =>
      api.put(`/console/shift-presets/${data.id}`, {
        name: data.name,
        start_time: data.start_time,
        end_time: data.end_time,
        is_active: data.is_active,
        sort_order: data.sort_order,
      }).then((r) => r.data),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["shiftPresets", v.storeId] });
      success("Shift preset updated.");
    },
    onError: error("Couldn't update shift preset"),
  });
}

/** 근무 프리셋 삭제 */
export function useDeleteShiftPreset() {
  const qc = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<unknown, Error, { id: string; storeId: string }>({
    mutationFn: (data) =>
      api.delete(`/console/shift-presets/${data.id}`),
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["shiftPresets", v.storeId] });
      success("Shift preset deleted.");
    },
    onError: error("Couldn't delete shift preset"),
  });
}
