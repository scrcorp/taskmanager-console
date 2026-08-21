/**
 * 고정 근무(Fixed Schedule) 패턴 훅 — 계약 §4 엔드포인트 1:1.
 *
 * `useSchedules.ts` 와 같은 규약: axios `api` + react-query, 성공/실패 모달은 훅이 띄우고
 * 호출 측은 후처리만. 경로는 기존 스케줄 훅처럼 trailing slash 없이 `/console/schedules/...`.
 *
 * 패턴 변경은 서버가 같은 트랜잭션에서 실 행을 실체화/정리하므로(§3-4/§3-5) 성공 시
 * `["schedules"]`(셀) + `["schedule-roster"]`(행·합계) + `["schedule-history"]` 를 함께 invalidate 한다.
 *
 * 폼 검증 계약 에러(400 PATTERN_BLOCK_OVERLAP / PATTERN_OUTSIDE_AVAILABILITY, 409 PATTERN_OVERLAP_EXISTING)는
 * 폼이 인라인으로 그려야 하므로 `silent` 옵션으로 훅 모달을 끌 수 있다. 그 경우 호출 측이 반드시 표시한다
 * (조용한 실패 금지).
 */

import { useQuery, useMutation, useQueryClient, type UseQueryResult, type UseMutationResult } from "@tanstack/react-query";
import type { AxiosResponse } from "axios";
import api from "@/lib/api";
import { useModal } from "@/components/ui/imperative-modal";
import { parseApiError } from "@/lib/utils";
import { isScheduleWarningConflict } from "@/lib/scheduleCodes";
import type { Schedule } from "@/types";
import type {
  MoveGroupIn,
  OccurrenceActionIn,
  PatternGroupIn,
  PatternGroupOut,
  PatternListFilters,
  PatternValidateOut,
} from "@/types/schedulePattern";

const BASE = "/console/schedules/patterns";

/** 패턴 목록 쿼리키 루트 — 모든 패턴 변경이 이 키를 invalidate 한다. */
export const SCHEDULE_PATTERNS_KEY = "schedule-patterns" as const;

function useErrorToast() {
  const modal = useModal();
  return (action: string) => (err: unknown) => {
    // 경고 확인 대기 409 는 호출 측이 확인 모달 → force 재요청으로 처리한다 (useScheduleWarningGate).
    if (isScheduleWarningConflict(err)) return;
    void modal.alert({ type: "error", title: action, message: parseApiError(err, "Unexpected error") });
  };
}

function useSuccessToast() {
  const modal = useModal();
  return (message: string) => {
    void modal.alert({ type: "success", message });
  };
}

/** 패턴 변경 후 함께 새로고침해야 하는 스케줄 쪽 캐시. */
function useInvalidateScheduleViews() {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: [SCHEDULE_PATTERNS_KEY] });
    qc.invalidateQueries({ queryKey: ["schedules"] });
    qc.invalidateQueries({ queryKey: ["schedule-roster"] });
    qc.invalidateQueries({ queryKey: ["schedule-history"] });
  };
}

type MutationOptions = {
  /** true 면 훅이 성공/실패 모달을 띄우지 않는다 — 호출 측이 인라인으로 표시할 의무. */
  silent?: boolean;
};

// ─── GET /schedules/patterns ─────────────────────────

/** 그룹 단위 목록(현재 유효 + 예정; include_ended 면 종료분 포함). */
export const useSchedulePatterns = (
  filters: PatternListFilters = {},
  options?: { enabled?: boolean },
): UseQueryResult<PatternGroupOut[], Error> => {
  const params: Record<string, string | boolean> = {};
  if (filters.user_id) params.user_id = filters.user_id;
  if (filters.store_id) params.store_id = filters.store_id;
  if (filters.include_ended) params.include_ended = true;
  return useQuery<PatternGroupOut[], Error>({
    queryKey: [SCHEDULE_PATTERNS_KEY, params],
    queryFn: async () => {
      const res: AxiosResponse<PatternGroupOut[]> = await api.get(BASE, { params });
      return res.data;
    },
    enabled: options?.enabled ?? true,
  });
};

// ─── POST /schedules/patterns ────────────────────────

export const useCreatePatternGroup = (options?: MutationOptions): UseMutationResult<PatternGroupOut, Error, PatternGroupIn> => {
  const invalidate = useInvalidateScheduleViews();
  const onErr = useErrorToast();
  const onOk = useSuccessToast();
  return useMutation<PatternGroupOut, Error, PatternGroupIn>({
    mutationFn: async (data) => {
      const res: AxiosResponse<PatternGroupOut> = await api.post(BASE, data);
      return res.data;
    },
    onSuccess: () => {
      invalidate();
      if (!options?.silent) onOk("Fixed schedule saved.");
    },
    onError: options?.silent ? undefined : onErr("Couldn't save fixed schedule"),
  });
};

// ─── POST /schedules/patterns/validate ───────────────

/** 저장 없이 ①②④ 검증. 결과는 호출 측이 그린다 — 모달 없음. */
export const useValidatePatternGroup = (): UseMutationResult<PatternValidateOut, Error, PatternGroupIn> => {
  return useMutation<PatternValidateOut, Error, PatternGroupIn>({
    mutationFn: async (data) => {
      const res: AxiosResponse<PatternValidateOut> = await api.post(`${BASE}/validate`, data);
      return res.data;
    },
  });
};

// ─── PATCH /schedules/patterns/groups/{group_id} ─────

export const useUpdatePatternGroup = (options?: MutationOptions): UseMutationResult<PatternGroupOut, Error, { group_id: string; data: PatternGroupIn }> => {
  const invalidate = useInvalidateScheduleViews();
  const onErr = useErrorToast();
  const onOk = useSuccessToast();
  return useMutation<PatternGroupOut, Error, { group_id: string; data: PatternGroupIn }>({
    mutationFn: async ({ group_id, data }) => {
      const res: AxiosResponse<PatternGroupOut> = await api.patch(`${BASE}/groups/${group_id}`, data);
      return res.data;
    },
    onSuccess: () => {
      invalidate();
      if (!options?.silent) onOk("Fixed schedule updated.");
    },
    onError: options?.silent ? undefined : onErr("Couldn't update fixed schedule"),
  });
};

// ─── POST /schedules/patterns/groups/{group_id}/move ─

export const useMovePatternGroup = (options?: MutationOptions): UseMutationResult<PatternGroupOut, Error, { group_id: string; data: MoveGroupIn }> => {
  const invalidate = useInvalidateScheduleViews();
  const onErr = useErrorToast();
  const onOk = useSuccessToast();
  return useMutation<PatternGroupOut, Error, { group_id: string; data: MoveGroupIn }>({
    mutationFn: async ({ group_id, data }) => {
      const res: AxiosResponse<PatternGroupOut> = await api.post(`${BASE}/groups/${group_id}/move`, data);
      return res.data;
    },
    onSuccess: () => {
      invalidate();
      if (!options?.silent) onOk("Fixed schedule moved.");
    },
    onError: options?.silent ? undefined : onErr("Couldn't move fixed schedule"),
  });
};

// ─── DELETE /schedules/patterns/groups/{group_id} ────

export const useDeletePatternGroup = (options?: MutationOptions): UseMutationResult<void, Error, string> => {
  const invalidate = useInvalidateScheduleViews();
  const onErr = useErrorToast();
  const onOk = useSuccessToast();
  return useMutation<void, Error, string>({
    mutationFn: async (group_id) => { await api.delete(`${BASE}/groups/${group_id}`); },
    onSuccess: () => {
      invalidate();
      if (!options?.silent) onOk("Fixed schedule removed. Past and edited days are kept as one-time schedules.");
    },
    onError: options?.silent ? undefined : onErr("Couldn't remove fixed schedule"),
  });
};

/**
 * "고정 근무 삭제?" confirm + delete mutation 묶음 (useDeleteScheduleFlow 와 같은 모양).
 * @returns true = 사용자가 확인해 mutation 시작 / false = 취소
 */
export function useDeletePatternGroupFlow() {
  const modal = useModal();
  const del = useDeletePatternGroup();
  return async (group_id: string, onDone?: () => void): Promise<boolean> => {
    const ok = await modal.confirm({
      title: "Remove fixed schedule",
      message: "Upcoming days created by this fixed schedule will be removed. Days you already edited and past days stay as one-time schedules.",
      confirmLabel: "Remove",
      variant: "danger",
    });
    if (!ok) return false;
    del.mutate(group_id, { onSuccess: onDone });
    return true;
  };
}

// ─── POST /schedules/patterns/{pattern_id}/occurrences/{date} ─

export interface OccurrenceActionVars {
  pattern_id: string;
  /** 패턴상 날짜 "YYYY-MM-DD" (= virtual id 의 date 부분) */
  date: string;
  data: OccurrenceActionIn;
}

/**
 * virtual 한 칸 → 실 행. edit 는 patch 적용 + overridden, delete 는 soft delete(슬롯 점유).
 * edit 의 경고 409(SCHEDULE_WARNINGS_UNCONFIRMED)는 호출 측이 `useScheduleWarningGate` 로
 * 확인 후 `patch.force=true` 로 재요청한다 — 여기서는 모달을 띄우지 않는다.
 */
export const useOccurrenceAction = (options?: MutationOptions): UseMutationResult<Schedule, Error, OccurrenceActionVars> => {
  const invalidate = useInvalidateScheduleViews();
  const onErr = useErrorToast();
  const onOk = useSuccessToast();
  return useMutation<Schedule, Error, OccurrenceActionVars>({
    mutationFn: async ({ pattern_id, date, data }) => {
      const res: AxiosResponse<Schedule> = await api.post(`${BASE}/${pattern_id}/occurrences/${date}`, data);
      return res.data;
    },
    onSuccess: (_result, vars) => {
      invalidate();
      if (!options?.silent) onOk(vars.data.action === "delete" ? "This day was removed." : "This day was updated.");
    },
    onError: options?.silent ? undefined : onErr("Couldn't update this day"),
  });
};

/**
 * virtual "Delete this day" confirm + occurrence delete 묶음. 복구 UI 는 없다(계약 §5).
 * @returns true = 사용자가 확인해 mutation 시작 / false = 취소
 */
export function useDeleteOccurrenceFlow() {
  const modal = useModal();
  const act = useOccurrenceAction();
  return async (pattern_id: string, date: string, onDone?: () => void): Promise<boolean> => {
    const ok = await modal.confirm({
      title: "Delete this day",
      message: "This day will be removed and won't be re-created by the fixed schedule.",
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (!ok) return false;
    act.mutate({ pattern_id, date, data: { action: "delete" } }, { onSuccess: onDone });
    return true;
  };
}

// ─── POST /schedules/{schedule_id}/revert-to-pattern ─

/** overridden 실 행을 패턴 값으로 되돌린다(`pattern_overridden=false`). deleted 행은 409. */
export const useRevertToPattern = (options?: MutationOptions): UseMutationResult<Schedule, Error, string> => {
  const qc = useQueryClient();
  const invalidate = useInvalidateScheduleViews();
  const onErr = useErrorToast();
  const onOk = useSuccessToast();
  return useMutation<Schedule, Error, string>({
    mutationFn: async (schedule_id) => {
      const res: AxiosResponse<Schedule> = await api.post(`/console/schedules/${schedule_id}/revert-to-pattern`);
      return res.data;
    },
    onSuccess: (updated, schedule_id) => {
      qc.setQueryData(["schedules", schedule_id], updated);
      qc.invalidateQueries({ queryKey: ["schedules", schedule_id, "audit"] });
      invalidate();
      if (!options?.silent) onOk("Reverted to the fixed schedule.");
    },
    onError: options?.silent ? undefined : onErr("Couldn't revert to the fixed schedule"),
  });
};

/**
 * "패턴으로 되돌릴까?" confirm + revert mutation 묶음.
 * @returns true = 사용자가 확인해 mutation 시작 / false = 취소
 */
export function useRevertToPatternFlow() {
  const modal = useModal();
  const revert = useRevertToPattern();
  return async (schedule_id: string, onDone?: () => void): Promise<boolean> => {
    const ok = await modal.confirm({
      title: "Revert to fixed schedule",
      message: "Your changes to this day will be discarded and the fixed schedule's time and role will be restored.",
      confirmLabel: "Revert",
      variant: "danger",
    });
    if (!ok) return false;
    revert.mutate(schedule_id, { onSuccess: onDone });
    return true;
  };
}
