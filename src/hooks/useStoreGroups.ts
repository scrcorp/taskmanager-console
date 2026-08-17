import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
  type UseMutationResult,
  type QueryClient,
} from "@tanstack/react-query";
import type { AxiosResponse } from "axios";
import api from "@/lib/api";
import { useMutationToast } from "@/lib/mutationToast";
import type { StoreGroup } from "@/types";

/**
 * 매장 그룹 목록 조회 훅 -- 서버가 sort_order 순으로 반환합니다.
 *
 * Custom hook to fetch the list of store groups via React Query.
 * The server returns groups ordered by sort_order.
 *
 * @returns 그룹 목록 쿼리 결과 (Store group list query result)
 */
export const useStoreGroups = (): UseQueryResult<StoreGroup[], Error> => {
  return useQuery<StoreGroup[], Error>({
    queryKey: ["store-groups"],
    queryFn: async (): Promise<StoreGroup[]> => {
      const response: AxiosResponse<StoreGroup[]> = await api.get(
        "/console/store-groups",
      );
      return response.data;
    },
  });
};

// ── 편입 미리보기 (Assign preview) — 저장 전 EMPID 충돌 사전 확인 ──
// 서버는 편입 시 empid 를 절대 바꾸지 않으므로(정책 A) 이건 순수 조회.
// 타입은 이 훅 파일이 소유 (src/types 에 올리지 않음 — 이 흐름 전용).

/** 그룹 내 다른 매장에서 그 번호를 이미 쓰는 사람 / Existing holder of a number */
export interface AssignPreviewHolder {
  user_id: string;
  name: string;
  store_id: string;
  store_name: string;
}

/** 번호 충돌 한 건 — 편입 멤버 vs 그룹 내 기존 보유자 / One number conflict */
export interface AssignPreviewConflict {
  empid: number;
  incoming: { user_id: string; name: string };
  holders: AssignPreviewHolder[];
}

/** 같은 사람이 편입 매장과 그룹 내 다른 매장에서 다른 번호 / Same person, different numbers */
export interface AssignPreviewPersonSplit {
  user_id: string;
  name: string;
  incoming_empid: number;
  elsewhere: { store_id: string; store_name: string; empid: number }[];
}

/** 편입 미리보기 응답 (읽기 전용) / Assign-preview response (read-only) */
export interface GroupAssignPreview {
  /** 대상 그룹 채번 모드 (null = 그룹 이탈) / Target group's numbering mode */
  numbering_mode: "group" | "store" | null;
  conflicts: AssignPreviewConflict[];
  person_splits: AssignPreviewPersonSplit[];
  incoming_with_empid: number;
}

/**
 * 편입 미리보기 호출 -- 매장을 그룹에 넣으면 생길 EMPID 충돌을 조회만 합니다.
 * Save 흐름(순차 호출)에서 imperative 하게 쓰므로 훅이 아닌 일반 함수.
 *
 * Read-only assign preview: what EMPID conflicts would appear if the store
 * joined the group. Plain function (not a hook) — the save flow calls it
 * imperatively and sequentially.
 */
export async function previewGroupAssign(
  storeId: string,
  groupId: string | null,
): Promise<GroupAssignPreview> {
  const response: AxiosResponse<GroupAssignPreview> = await api.post(
    "/console/store-groups/assign-preview",
    { store_id: storeId, group_id: groupId },
  );
  return response.data;
}

/** 그룹 생성 요청 데이터 타입 (Store group creation request data type) */
interface CreateStoreGroupData {
  name: string;
  /** 그룹 코드 — 급여/외부 시스템의 법인 표기 (예: "ODG"). EMPID 임포트 자연 매칭 키 */
  code?: string | null;
  numbering_mode?: "group" | "store";
  number_range_start?: number | null;
}

/**
 * 그룹 생성 훅 -- 새 그룹을 생성하고 캐시에 추가합니다.
 *
 * Mutation hook to create a new store group and append it to the cache.
 *
 * @returns 그룹 생성 뮤테이션 결과 (Group creation mutation result)
 */
export const useCreateStoreGroup = (options?: {
  silent?: boolean;
}): UseMutationResult<StoreGroup, Error, CreateStoreGroupData> => {
  const queryClient: QueryClient = useQueryClient();
  const { success, error } = useMutationToast();
  return useMutation<StoreGroup, Error, CreateStoreGroupData>({
    mutationFn: async (data: CreateStoreGroupData): Promise<StoreGroup> => {
      const response: AxiosResponse<StoreGroup> = await api.post(
        "/console/store-groups",
        data,
      );
      return response.data;
    },
    onSuccess: (newGroup: StoreGroup): void => {
      queryClient.setQueryData<StoreGroup[]>(["store-groups"], (old) =>
        old ? [...old, newGroup] : [newGroup],
      );
      if (!options?.silent) success("Group created.");
    },
    onError: options?.silent ? undefined : error("Failed to create group"),
  });
};

/** 그룹 수정 요청 데이터 타입 (Store group update request data type) */
interface UpdateStoreGroupData {
  id: string;
  name?: string;
  /** 그룹 코드 (null = 제거) / Group code, null clears it */
  code?: string | null;
  numbering_mode?: "group" | "store";
  number_range_start?: number | null;
}

/**
 * 그룹 수정 훅 -- 그룹 정보를 수정하고 캐시를 패치합니다.
 * 응답의 duplicate_empids 는 호출 측에서 경고 표시에 사용합니다.
 *
 * Mutation hook to update a store group and patch the cache.
 * The response may carry duplicate_empids for the caller to surface.
 *
 * @returns 그룹 수정 뮤테이션 결과 (Group update mutation result)
 */
export const useUpdateStoreGroup = (options?: {
  silent?: boolean;
}): UseMutationResult<StoreGroup, Error, UpdateStoreGroupData> => {
  const queryClient: QueryClient = useQueryClient();
  const { success, error } = useMutationToast();
  return useMutation<StoreGroup, Error, UpdateStoreGroupData>({
    mutationFn: async ({
      id,
      ...data
    }: UpdateStoreGroupData): Promise<StoreGroup> => {
      const response: AxiosResponse<StoreGroup> = await api.put(
        `/console/store-groups/${id}`,
        data,
      );
      return response.data;
    },
    onSuccess: (updated: StoreGroup, variables: UpdateStoreGroupData): void => {
      queryClient.setQueryData<StoreGroup[]>(["store-groups"], (old) =>
        old?.map((g) => (g.id === variables.id ? updated : g)),
      );
      if (!options?.silent) success("Group updated.");
    },
    onError: options?.silent ? undefined : error("Failed to update group"),
  });
};

/**
 * 그룹 삭제 훅 -- 그룹을 삭제하고 캐시에서 제거합니다.
 * 서버가 소속 매장들을 그룹 해제(Ungrouped)하므로 stores 캐시도 무효화합니다.
 * silent — 일괄 저장(Manage Groups) 등 호출부가 결과 표시를 직접 담당할 때.
 *
 * Mutation hook to delete a store group. The server detaches its stores
 * (they become ungrouped), so the stores caches are invalidated too.
 * With silent, the caller owns success/error feedback (e.g. batched saves).
 *
 * @returns 그룹 삭제 뮤테이션 결과 (Group deletion mutation result)
 */
export const useDeleteStoreGroup = (options?: {
  silent?: boolean;
}): UseMutationResult<void, Error, string> => {
  const queryClient: QueryClient = useQueryClient();
  const { success, error } = useMutationToast();
  return useMutation<void, Error, string>({
    mutationFn: async (id: string): Promise<void> => {
      await api.delete(`/console/store-groups/${id}`);
    },
    onSuccess: (_: void, id: string): void => {
      queryClient.setQueryData<StoreGroup[]>(["store-groups"], (old) =>
        old?.filter((g) => g.id !== id),
      );
      // 소속 매장들의 group_id 가 서버에서 null 로 바뀜 → stores 계열 캐시 재조회
      queryClient.invalidateQueries({ queryKey: ["stores"] });
      if (!options?.silent) success("Group deleted. Its stores moved to Ungrouped.");
    },
    onError: options?.silent ? undefined : error("Failed to delete group"),
  });
};

/**
 * 그룹 순서 변경 훅 -- 드래그로 정렬한 순서를 서버에 일괄 저장합니다.
 * 낙관적으로 캐시를 재정렬하고 실패 시 무효화합니다 (useReorderStores 패턴).
 * silent — 에러 표시를 호출부가 담당 (캐시 재동기화는 항상 수행).
 *
 * Mutation hook to persist a new group display order (drag reorder).
 * Optimistically reorders the cached list; invalidates on failure.
 * With silent, the caller owns error feedback (cache resync always runs).
 *
 * @returns 순서 변경 뮤테이션 결과 (Reorder mutation result)
 */
export const useReorderStoreGroups = (options?: {
  silent?: boolean;
}): UseMutationResult<void, Error, string[]> => {
  const queryClient: QueryClient = useQueryClient();
  const { error } = useMutationToast();
  return useMutation<void, Error, string[]>({
    mutationFn: async (groupIds: string[]): Promise<void> => {
      await api.put("/console/store-groups/reorder", { group_ids: groupIds });
    },
    onMutate: (groupIds: string[]): void => {
      // 낙관적 재정렬 — 요청 순서대로 캐시 즉시 갱신 (sort_order 도 새 인덱스로)
      queryClient.setQueryData<StoreGroup[]>(["store-groups"], (old) => {
        if (!old) return old;
        const byId = new Map(old.map((g) => [g.id, g]));
        return groupIds
          .map((id) => byId.get(id))
          .filter((g): g is StoreGroup => g !== undefined)
          .map((g, index) => ({ ...g, sort_order: index }));
      });
    },
    onError: (err, _vars, _ctx): void => {
      queryClient.invalidateQueries({ queryKey: ["store-groups"] });
      if (!options?.silent) error("Failed to reorder groups")(err);
    },
  });
};
