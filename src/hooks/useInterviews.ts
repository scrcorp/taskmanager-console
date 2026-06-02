"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import api from "@/lib/api";
import { useMutationResult } from "@/lib/mutationResult";

export interface InterviewSlot {
  id: string;
  date: string; // YYYY-MM-DD
  start: string; // HH:MM
  end: string;
  demand: number;
  wanters: { application_id: string; candidate_name: string }[];
  confirmed: { application_id: string; candidate_name: string; interviewer_name: string | null } | null;
}

/** org 통합 슬롯 + 수요/확정 (start~end 범위). */
export const useInterviewSlots = (
  range?: { start?: string; end?: string },
): UseQueryResult<{ items: InterviewSlot[] }, Error> =>
  useQuery({
    queryKey: ["hiring", "slots", range?.start, range?.end],
    queryFn: async () => {
      const res = await api.get(`/console/hiring/interview-slots`, {
        params: { ...(range?.start ? { start: range.start } : {}), ...(range?.end ? { end: range.end } : {}) },
      });
      return res.data;
    },
  });

export const useCreateSlots = (): UseMutationResult<
  { created: number },
  Error,
  { date: string; start: string; end: string }[]
> => {
  const qc = useQueryClient();
  return useMutation<{ created: number }, Error, { date: string; start: string; end: string }[]>({
    mutationFn: async (slots) => {
      const res = await api.post(`/console/hiring/interview-slots`, { slots });
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hiring", "slots"] }),
  });
};

export const useDeleteSlot = (): UseMutationResult<{ deleted: boolean }, Error, string> => {
  const qc = useQueryClient();
  const { error } = useMutationResult();
  return useMutation<{ deleted: boolean }, Error, string>({
    mutationFn: async (slotId) => {
      const res = await api.delete(`/console/hiring/interview-slots/${slotId}`);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hiring", "slots"] }),
    onError: error("Couldn't delete slot"),
  });
};

export interface ApplicationInterview {
  application_id: string;
  status: "pending" | "picked" | "confirmed";
  preferences: { id: string; date: string; start: string; end: string }[];
  confirmed: { id: string; date: string; start: string; end: string } | null;
  interviewer_id: string | null;
  interview_at: string | null;
  has_token: boolean;
}

export const useApplicationInterview = (
  applicationId: string | undefined,
): UseQueryResult<ApplicationInterview, Error> =>
  useQuery({
    queryKey: ["hiring", "application-interview", applicationId],
    queryFn: async () => {
      const res = await api.get(`/console/hiring/applications/${applicationId}/interview`);
      return res.data;
    },
    enabled: !!applicationId,
  });

export const useConfirmInterview = (
  applicationId: string,
): UseMutationResult<unknown, Error, { slotId: string; interviewerId?: string }> => {
  const qc = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<unknown, Error, { slotId: string; interviewerId?: string }>({
    mutationFn: async ({ slotId, interviewerId }) => {
      const res = await api.post(`/console/hiring/applications/${applicationId}/interview/confirm`, {
        slot_id: slotId,
        interviewer_id: interviewerId ?? null,
      });
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hiring", "application-interview", applicationId] });
      qc.invalidateQueries({ queryKey: ["hiring", "slots"] });
      qc.invalidateQueries({ queryKey: ["hiring", "inbox"] });
      success("Interview confirmed. Confirmation email sent.");
    },
    onError: error("Couldn't confirm interview"),
  });
};

export const useUpdateInterviewer = (
  applicationId: string,
): UseMutationResult<unknown, Error, string | null> => {
  const qc = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<unknown, Error, string | null>({
    mutationFn: async (interviewerId) => {
      const res = await api.patch(`/console/hiring/applications/${applicationId}/interview/interviewer`, {
        interviewer_id: interviewerId,
      });
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hiring", "application-interview", applicationId] });
      qc.invalidateQueries({ queryKey: ["hiring", "inbox"] });
      success("Interviewer updated.");
    },
    onError: error("Couldn't update interviewer"),
  });
};

export const useCompleteInterview = (
  applicationId: string,
): UseMutationResult<unknown, Error, void> => {
  const qc = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<unknown, Error, void>({
    mutationFn: async () => {
      // 인터뷰 완료 = review 단계로 이동 (post-interview 검수/최종결정)
      const res = await api.patch(`/console/hiring/applications/${applicationId}`, { stage: "review" });
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hiring", "application-interview", applicationId] });
      qc.invalidateQueries({ queryKey: ["hiring", "inbox"] });
      qc.invalidateQueries({ queryKey: ["hiring", "applications"] });
      success("Interview completed — moved to review.");
    },
    onError: error("Couldn't complete interview"),
  });
};

/**
 * 인터뷰 링크 토큰 발급(회전) → raw 토큰 반환.
 * 어드민이 지원자에게 스케줄 링크를 직접 전달할 때 사용 (메일 미수신/분실 대비).
 * 주의: 호출할 때마다 토큰이 회전되어 이전에 발급된 링크(메일 포함)는 무효화된다.
 * 성공 시 결과 모달을 띄우지 않음 — 호출 측에서 클립보드 복사 + 인라인 피드백 처리.
 */
export const useIssueInterviewToken = (
  applicationId: string,
): UseMutationResult<{ token: string }, Error, void> => {
  const qc = useQueryClient();
  const { error } = useMutationResult();
  return useMutation<{ token: string }, Error, void>({
    mutationFn: async () => {
      const res = await api.post(
        `/console/hiring/applications/${applicationId}/interview/issue-token`,
      );
      return res.data;
    },
    onSuccess: () => {
      // has_token 갱신 (이전 토큰 무효화됨)
      qc.invalidateQueries({ queryKey: ["hiring", "application-interview", applicationId] });
    },
    onError: error("Couldn't generate interview link"),
  });
};

export const useCancelInterview = (
  applicationId: string,
): UseMutationResult<unknown, Error, void> => {
  const qc = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<unknown, Error, void>({
    mutationFn: async () => {
      const res = await api.post(`/console/hiring/applications/${applicationId}/interview/cancel`);
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hiring", "application-interview", applicationId] });
      qc.invalidateQueries({ queryKey: ["hiring", "slots"] });
      qc.invalidateQueries({ queryKey: ["hiring", "inbox"] });
      success("Interview confirmation cancelled.");
    },
    onError: error("Couldn't cancel"),
  });
};
