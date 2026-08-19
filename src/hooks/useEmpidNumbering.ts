import {
  useMutation,
  useQueryClient,
  type UseMutationResult,
  type QueryClient,
} from "@tanstack/react-query";
import type { AxiosResponse } from "axios";
import api from "@/lib/api";
import { useMutationResult } from "@/lib/mutationResult";
import type {
  EmpidNumberingRecalculateResult,
  EmpidNumberingScope,
  EmpidNumberingUpdateResult,
} from "@/types";

/**
 * EMPID 채번 커서 운영 훅 — 수동 조정(§3-2) · 재계산(§3-3).
 *
 * 커서는 그룹(공유 스코프) 또는 매장(단독 스코프)이 보유한다. 어느 쪽을 고칠지는
 * 서버가 준 `numbering.scope` / `numbering.scope_id` 로 정해진다 — 콘솔은
 * 판정하지 않는다(INV-8).
 *
 * Cursor operations for EMPID numbering: manual adjustment and recalculation.
 * The subject to edit comes from the server's `numbering.scope` / `scope_id`;
 * the console never decides it.
 *
 * Server: PUT/POST /console/store-groups/{id}/numbering[/recalculate]
 *         PUT/POST /console/stores/{id}/numbering[/recalculate]
 * 계약 SoT: docs/99_inbox/2026-08-18 empid 채번 API계약·규칙 §3-2 · §3-3.
 */

/** 커서 주체 — 서버가 준 numbering.scope / scope_id 를 그대로 넘긴다. */
interface NumberingTarget {
  scope: EmpidNumberingScope;
  scope_id: string;
}

/** 커서 수동 조정 요청 데이터 (Cursor adjustment request data) */
export interface UpdateNumberingData extends NumberingTarget {
  next_empid: number;
  /** 사유 필수 — 누락 시 서버가 ERR_REASON_REQUIRED 로 거절한다. */
  reason: string;
}

/** 커서 재계산 요청 데이터 (Cursor recalculation request data) */
export interface RecalculateNumberingData extends NumberingTarget {
  /** false = 미리보기만, true = 적용(이때 reason 필수) */
  apply: boolean;
  reason?: string | null;
}

/** 주체별 커서 엔드포인트 경로 — 단일 리소스라 trailing slash 를 붙이지 않는다. */
const numberingPath = ({ scope, scope_id }: NumberingTarget): string =>
  scope === "group"
    ? `/console/store-groups/${scope_id}/numbering`
    : `/console/stores/${scope_id}/numbering`;

/** 커서가 바뀌면 그룹·매장 목록의 numbering 스냅샷이 낡는다 → 함께 무효화. */
const invalidateNumbering = (queryClient: QueryClient): void => {
  queryClient.invalidateQueries({ queryKey: ["store-groups"] });
  queryClient.invalidateQueries({ queryKey: ["stores"] });
};

/**
 * 커서 수동 조정 훅 -- 다음 발급 번호를 운영자가 직접 지정합니다(사유 필수).
 * 현재보다 낮은 값도 허용되며, 응답의 lowered 로 호출부가 확인 UI 를 띄웁니다.
 *
 * Mutation hook to set the next EMPID cursor by hand (reason required).
 * Lowering is allowed; the response carries `lowered` for the caller's confirm UI.
 *
 * @returns 커서 조정 뮤테이션 결과 (Cursor adjustment mutation result)
 */
export const useUpdateEmpidNumbering = (options?: {
  silent?: boolean;
}): UseMutationResult<EmpidNumberingUpdateResult, Error, UpdateNumberingData> => {
  const queryClient: QueryClient = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<EmpidNumberingUpdateResult, Error, UpdateNumberingData>({
    mutationFn: async ({
      scope,
      scope_id,
      ...data
    }: UpdateNumberingData): Promise<EmpidNumberingUpdateResult> => {
      const response: AxiosResponse<EmpidNumberingUpdateResult> = await api.put(
        numberingPath({ scope, scope_id }),
        data,
      );
      return response.data;
    },
    onSuccess: (result: EmpidNumberingUpdateResult): void => {
      invalidateNumbering(queryClient);
      if (!options?.silent) {
        success(`Next EMPID is now ${result.next_empid}.`);
      }
    },
    onError: options?.silent ? undefined : error("Couldn't change the next EMPID"),
  });
};

/**
 * 커서 재계산 훅 -- 순번(sequence) 번호 기준 권고값을 계산합니다.
 * apply=false 면 미리보기만 하고 커서를 바꾸지 않습니다(적용 시 사유 필수).
 *
 * Mutation hook to recalculate the cursor from in-sequence numbers only.
 * With apply=false nothing is written (preview); applying requires a reason.
 *
 * @returns 재계산 뮤테이션 결과 (Recalculation mutation result)
 */
export const useRecalculateEmpidNumbering = (options?: {
  silent?: boolean;
}): UseMutationResult<
  EmpidNumberingRecalculateResult,
  Error,
  RecalculateNumberingData
> => {
  const queryClient: QueryClient = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<
    EmpidNumberingRecalculateResult,
    Error,
    RecalculateNumberingData
  >({
    mutationFn: async ({
      scope,
      scope_id,
      ...data
    }: RecalculateNumberingData): Promise<EmpidNumberingRecalculateResult> => {
      const response: AxiosResponse<EmpidNumberingRecalculateResult> =
        await api.post(
          `${numberingPath({ scope, scope_id })}/recalculate`,
          data,
        );
      return response.data;
    },
    onSuccess: (result: EmpidNumberingRecalculateResult): void => {
      // 미리보기(applied=false)는 아무것도 안 바꾸므로 캐시를 건드리지 않는다.
      if (!result.applied) return;
      invalidateNumbering(queryClient);
      if (!options?.silent) {
        success(`Next EMPID is now ${result.next_empid}.`);
      }
    },
    onError: options?.silent
      ? undefined
      : error("Couldn't recalculate the next EMPID"),
  });
};
