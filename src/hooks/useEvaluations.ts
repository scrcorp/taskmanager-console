/**
 * 평가 React Query 훅 모음.
 *
 * 평가 템플릿(EvalTemplate)과 평가(Evaluation)의 CRUD를 제공합니다.
 * 템플릿: 평가 기준 항목을 정의하는 양식
 * 평가: 특정 직원에 대한 실제 평가 기록
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
  EvalTemplate,
  EvalTemplateCreate,
  Evaluation,
  EvaluationCreate,
  EvaluationFilters,
  PaginatedResponse,
} from "@/types";

// === 평가 템플릿 훅 ===

/** 평가 템플릿 목록 조회 (페이지네이션) */
export const useEvalTemplates = (
  page: number = 1,
  perPage: number = 20
): UseQueryResult<PaginatedResponse<EvalTemplate>, Error> => {
  return useQuery({
    queryKey: ["eval-templates", page, perPage],
    queryFn: async () => {
      const res: AxiosResponse<PaginatedResponse<EvalTemplate>> = await api.get(
        "/console/evaluations/templates",
        { params: { page, per_page: perPage } }
      );
      return res.data;
    },
  });
};

/** 평가 템플릿 단건 조회 */
export const useEvalTemplate = (
  templateId: string
): UseQueryResult<EvalTemplate, Error> => {
  return useQuery({
    queryKey: ["eval-template", templateId],
    queryFn: async () => {
      const res: AxiosResponse<EvalTemplate> = await api.get(
        `/console/evaluations/templates/${templateId}`
      );
      return res.data;
    },
    enabled: !!templateId,
  });
};

/** 평가 템플릿 생성 */
export const useCreateEvalTemplate = (): UseMutationResult<
  EvalTemplate,
  Error,
  EvalTemplateCreate
> => {
  const qc = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<EvalTemplate, Error, EvalTemplateCreate>({
    mutationFn: async (data: EvalTemplateCreate) => {
      const res: AxiosResponse<EvalTemplate> = await api.post(
        "/console/evaluations/templates",
        data
      );
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["eval-templates"] });
      success("Evaluation template created.");
    },
    onError: error("Couldn't create evaluation template"),
  });
};

/** 평가 템플릿 삭제 */
export const useDeleteEvalTemplate = (): UseMutationResult<
  void,
  Error,
  string
> => {
  const qc = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<void, Error, string>({
    mutationFn: async (templateId: string) => {
      await api.delete(`/console/evaluations/templates/${templateId}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["eval-templates"] });
      success("Evaluation template deleted.");
    },
    onError: error("Couldn't delete evaluation template"),
  });
};

// === 평가 기록 훅 ===

/** 평가 목록 조회 (필터 + 페이지네이션) */
export const useEvaluations = (
  filters: EvaluationFilters = {}
): UseQueryResult<PaginatedResponse<Evaluation>, Error> => {
  return useQuery({
    queryKey: ["evaluations", filters],
    queryFn: async () => {
      const res: AxiosResponse<PaginatedResponse<Evaluation>> = await api.get(
        "/console/evaluations",
        { params: filters }
      );
      return res.data;
    },
  });
};

/** 평가 단건 조회 */
export const useEvaluation = (
  evaluationId: string
): UseQueryResult<Evaluation, Error> => {
  return useQuery({
    queryKey: ["evaluation", evaluationId],
    queryFn: async () => {
      const res: AxiosResponse<Evaluation> = await api.get(
        `/console/evaluations/${evaluationId}`
      );
      return res.data;
    },
    enabled: !!evaluationId,
  });
};

/** 평가 생성 — 평가자가 피평가자에 대한 평가를 시작 */
export const useCreateEvaluation = (): UseMutationResult<
  Evaluation,
  Error,
  EvaluationCreate
> => {
  const qc = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<Evaluation, Error, EvaluationCreate>({
    mutationFn: async (data: EvaluationCreate) => {
      const res: AxiosResponse<Evaluation> = await api.post(
        "/console/evaluations",
        data
      );
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["evaluations"] });
      success("Evaluation created.");
    },
    onError: error("Couldn't create evaluation"),
  });
};

/** 평가 제출 — draft 상태의 평가를 submitted로 변경 */
export const useSubmitEvaluation = (): UseMutationResult<
  Evaluation,
  Error,
  string
> => {
  const qc = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<Evaluation, Error, string>({
    mutationFn: async (evaluationId: string) => {
      const res: AxiosResponse<Evaluation> = await api.post(
        `/console/evaluations/${evaluationId}/submit`
      );
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["evaluations"] });
      success("Submitted.");
    },
    onError: error("Couldn't submit evaluation"),
  });
};
