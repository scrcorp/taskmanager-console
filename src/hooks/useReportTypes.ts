/**
 * Report Types (daily 'period' 종류) React Query 훅.
 *
 * report_types 는 org-default(store_id=null) + store override 행으로 구성된다.
 * - effective=false: 해당 scope 의 raw 관리 행 (store_id 없으면 org-default 행)
 * - effective=true: store 에 실제 적용되는 resolved 목록 (org+store 병합)
 *
 * Collection 호출은 trailing slash 필수 (`/console/report-types/`).
 */
import {
  useQuery,
  useQueries,
  useMutation,
  useQueryClient,
  type UseQueryResult,
  type UseMutationResult,
} from "@tanstack/react-query";
import type { AxiosResponse } from "axios";
import api from "@/lib/api";
import { useMutationResult } from "@/lib/mutationResult";
import type {
  EffectiveReportType,
  ReportType,
  ReportTypeCreate,
  ReportTypeUpdate,
} from "@/types";

const BASE = "/console/report-types/";

/** Raw scope rows (effective=false). store_id 없으면 org-default 행만. */
export const useReportTypes = (
  storeId?: string,
): UseQueryResult<ReportType[], Error> => {
  return useQuery({
    queryKey: ["report-types", storeId ?? "__org__"],
    queryFn: async () => {
      const params: Record<string, string | boolean> = { effective: false };
      if (storeId) params.store_id = storeId;
      const res: AxiosResponse<{ items: ReportType[] }> = await api.get(BASE, {
        params,
      });
      return res.data.items ?? [];
    },
  });
};

/** Resolved effective rows (effective=true). store 에 실제 적용되는 목록. */
export const useEffectiveReportTypes = (
  storeId?: string,
): UseQueryResult<EffectiveReportType[], Error> => {
  return useQuery({
    queryKey: ["report-types-effective", storeId ?? "__org__"],
    queryFn: async () => {
      const params: Record<string, string | boolean> = { effective: true };
      if (storeId) params.store_id = storeId;
      const res: AxiosResponse<{ items: EffectiveReportType[] }> = await api.get(
        BASE,
        { params },
      );
      return res.data.items ?? [];
    },
  });
};

/** Per-store effective lists 병렬 조회. 여러 매장의 resolved 목록을 한 번에.
 *
 * org Report Periods 화면의 cross-store 토글 매트릭스에서 사용한다. 각 결과는
 * useEffectiveReportTypes(storeId) 와 같은 캐시 키를 공유하므로 invalidate 가 함께 적용됨.
 */
export const useEffectiveReportTypesForStores = (
  storeIds: string[],
): {
  storeId: string;
  data: EffectiveReportType[];
  isLoading: boolean;
}[] => {
  const results = useQueries({
    queries: storeIds.map((storeId) => ({
      queryKey: ["report-types-effective", storeId],
      queryFn: async (): Promise<EffectiveReportType[]> => {
        const res: AxiosResponse<{ items: EffectiveReportType[] }> = await api.get(
          BASE,
          { params: { effective: true, store_id: storeId } },
        );
        return res.data.items ?? [];
      },
    })),
  });
  return storeIds.map((storeId, i) => ({
    storeId,
    data: results[i]?.data ?? [],
    isLoading: results[i]?.isLoading ?? false,
  }));
};

const invalidate = (qc: ReturnType<typeof useQueryClient>): void => {
  qc.invalidateQueries({ queryKey: ["report-types"] });
  qc.invalidateQueries({ queryKey: ["report-types-effective"] });
};

/** report_type 생성 (org 또는 store scope). */
export const useCreateReportType = (): UseMutationResult<
  ReportType,
  Error,
  ReportTypeCreate
> => {
  const qc = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<ReportType, Error, ReportTypeCreate>({
    mutationFn: async (data) => {
      const res: AxiosResponse<ReportType> = await api.post(BASE, data);
      return res.data;
    },
    onSuccess: () => {
      invalidate(qc);
      success("Report type saved.");
    },
    onError: error("Couldn't save report type"),
  });
};

/** report_type 수정 (label/active/deadline/sort). */
export const useUpdateReportType = (): UseMutationResult<
  ReportType,
  Error,
  { id: string; data: ReportTypeUpdate }
> => {
  const qc = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<ReportType, Error, { id: string; data: ReportTypeUpdate }>({
    mutationFn: async ({ id, data }) => {
      const res: AxiosResponse<ReportType> = await api.put(
        `/console/report-types/${id}`,
        data,
      );
      return res.data;
    },
    onSuccess: () => {
      invalidate(qc);
      success("Report type updated.");
    },
    onError: error("Couldn't update report type"),
  });
};

/** report_type soft delete. store override 면 org 기본값으로 복귀. */
export const useDeleteReportType = (): UseMutationResult<void, Error, string> => {
  const qc = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<void, Error, string>({
    mutationFn: async (id) => {
      await api.delete(`/console/report-types/${id}`);
    },
    onSuccess: () => {
      invalidate(qc);
      success("Report type removed.");
    },
    onError: error("Couldn't remove report type"),
  });
};

// ── 고급 upsert (org built-in materialize + store override) ──────────
//
// effective 목록은 org-default / store-override / 내장 fallback(id=null) 이 섞여
// 있다. 한 행을 바꿀 때:
//   - 현재 scope 에 실제 row 가 있으면(owned) → PUT
//   - store scope 인데 org 상속이면 → store override row 생성(POST)
//   - org scope 인데 내장 fallback 이면 → 내장 3종을 모두 실제 row 로 materialize
//     (하나만 만들면 나머지 fallback 이 사라지는 서버 resolution 특성 때문)
// 한 mutation 안에서 처리해 결과 모달이 한 번만 뜨도록 한다.

function effToCreateBody(
  e: EffectiveReportType,
  storeId: string | null,
  override: ReportTypeUpdate = {},
): ReportTypeCreate {
  return {
    code: e.code,
    label: override.label ?? e.label,
    store_id: storeId,
    sort_order: override.sort_order ?? e.sort_order,
    is_active: override.is_active ?? e.is_active,
    default_deadline_local_time:
      override.default_deadline_local_time !== undefined
        ? override.default_deadline_local_time
        : e.default_deadline_local_time,
    deadline_day_offset: override.deadline_day_offset ?? e.deadline_day_offset,
  };
}

export interface ApplyReportTypeChangeInput {
  scope: "org" | "store";
  storeId: string | null;
  target: EffectiveReportType;
  change: ReportTypeUpdate;
  effectiveList: EffectiveReportType[];
}

/** effective 행 하나에 변경을 적용 (owned→PUT / 상속→override / 내장→materialize). */
export const useApplyReportTypeChange = (): UseMutationResult<
  void,
  Error,
  ApplyReportTypeChangeInput
> => {
  const qc = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<void, Error, ApplyReportTypeChangeInput>({
    mutationFn: async ({ scope, storeId, target, change, effectiveList }) => {
      const owned = target.scope === scope && !!target.id;
      if (owned) {
        await api.put(`/console/report-types/${target.id}`, change);
        return;
      }
      if (scope === "store") {
        await api.post(BASE, effToCreateBody(target, storeId, change));
        return;
      }
      // org scope, 내장 fallback → 내장 전체 materialize (대상엔 change 적용)
      const fallbacks = effectiveList.filter((e) => e.id == null);
      for (const e of fallbacks) {
        const ov = e.code === target.code ? change : {};
        await api.post(BASE, effToCreateBody(e, null, ov));
      }
    },
    onSuccess: () => {
      invalidate(qc);
      success("Report type updated.");
    },
    onError: error("Couldn't update report type"),
  });
};

export interface AddReportTypeInput {
  scope: "org" | "store";
  storeId: string | null;
  data: ReportTypeCreate;
  effectiveList: EffectiveReportType[];
}

/** 새 report_type 추가 (org scope 면 내장 fallback 먼저 materialize). */
export const useAddReportType = (): UseMutationResult<
  void,
  Error,
  AddReportTypeInput
> => {
  const qc = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<void, Error, AddReportTypeInput>({
    mutationFn: async ({ scope, storeId, data, effectiveList }) => {
      if (scope === "org") {
        const fallbacks = effectiveList.filter((e) => e.id == null);
        for (const e of fallbacks) {
          await api.post(BASE, effToCreateBody(e, null));
        }
      }
      await api.post(BASE, { ...data, store_id: storeId });
    },
    onSuccess: () => {
      invalidate(qc);
      success("Report type added.");
    },
    onError: error("Couldn't add report type"),
  });
};

/** sort_order 일괄 변경 (reorder). */
export const useReorderReportTypes = (): UseMutationResult<
  void,
  Error,
  { id: string; sort_order: number }[]
> => {
  const qc = useQueryClient();
  const { error } = useMutationResult();
  return useMutation<void, Error, { id: string; sort_order: number }[]>({
    mutationFn: async (items) => {
      await api.post(`/console/report-types/reorder`, { items });
    },
    onSuccess: () => invalidate(qc),
    onError: error("Couldn't reorder report types"),
  });
};
