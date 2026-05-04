"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from "@tanstack/react-query";
import type { AxiosResponse } from "axios";
import api from "@/lib/api";
import { useMutationResult } from "@/lib/mutationResult";

export interface HiringCoverPhoto {
  id: string;
  url: string | null;
  is_primary: boolean;
  uploaded_at: string;
  size: number;
}

/** 매장 표지 사진 목록. */
export const useCoverPhotos = (
  storeId: string | undefined,
): UseQueryResult<HiringCoverPhoto[], Error> => {
  return useQuery<HiringCoverPhoto[], Error>({
    queryKey: ["hiring", "photos", storeId],
    queryFn: async () => {
      const res: AxiosResponse<HiringCoverPhoto[]> = await api.get(
        `/admin/stores/${storeId}/cover-photos`,
      );
      return res.data;
    },
    enabled: !!storeId,
  });
};

/** 사진 업로드 (multipart). */
export const useUploadCoverPhoto = (
  storeId: string,
): UseMutationResult<HiringCoverPhoto, Error, { file: File; setAsPrimary?: boolean }> => {
  const qc = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<HiringCoverPhoto, Error, { file: File; setAsPrimary?: boolean }>({
    mutationFn: async ({ file, setAsPrimary }) => {
      const fd = new FormData();
      fd.append("file", file);
      if (setAsPrimary) fd.append("set_as_primary", "true");
      const res: AxiosResponse<HiringCoverPhoto> = await api.post(
        `/admin/stores/${storeId}/cover-photos`,
        fd,
        { headers: { "Content-Type": "multipart/form-data" } },
      );
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hiring", "photos", storeId] });
      success("Photo uploaded.");
    },
    onError: error("Couldn't upload photo"),
  });
};

/** primary 사진 변경. */
export const useSetPrimaryPhoto = (
  storeId: string,
): UseMutationResult<void, Error, string> => {
  const qc = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<void, Error, string>({
    mutationFn: async (photoId) => {
      await api.patch(`/admin/stores/${storeId}/cover-photos/${photoId}/primary`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hiring", "photos", storeId] });
      success("Primary photo set.");
    },
    onError: error("Couldn't set primary photo"),
  });
};

/** 사진 삭제. */
export const useDeleteCoverPhoto = (
  storeId: string,
): UseMutationResult<void, Error, string> => {
  const qc = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<void, Error, string>({
    mutationFn: async (photoId) => {
      await api.delete(`/admin/stores/${storeId}/cover-photos/${photoId}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hiring", "photos", storeId] });
      success("Photo deleted.");
    },
    onError: error("Couldn't delete photo"),
  });
};

/** 가입 토글. */
export const useSetAcceptingSignups = (
  storeId: string,
): UseMutationResult<{ accepting_signups: boolean }, Error, boolean> => {
  const qc = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<{ accepting_signups: boolean }, Error, boolean>({
    mutationFn: async (accepting) => {
      const res: AxiosResponse<{ accepting_signups: boolean }> = await api.patch(
        `/admin/stores/${storeId}/accepting-signups`,
        { accepting_signups: accepting },
      );
      return res.data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["stores"] });
      qc.invalidateQueries({ queryKey: ["stores", storeId] });
      success(data.accepting_signups ? "Signups enabled." : "Signups disabled.");
    },
    onError: error("Couldn't update signup setting"),
  });
};

// ────────────────────────────────────────────────────────────────
// Hiring Form (Builder)
// ────────────────────────────────────────────────────────────────
export type QuestionType =
  | "short_text"
  | "long_text"
  | "number"
  | "single_choice"
  | "multi_choice";

export type AcceptPreset = "pdf" | "image" | "pdf_or_image";

export interface QuestionDef {
  type: QuestionType;
  id: string;
  label: string;
  required?: boolean;
  placeholder?: string | null;
  options?: string[];
  min?: number | null;
  max?: number | null;
  min_selected?: number;
  max_selected?: number | null;
  max_length?: number | null;
}

export interface AttachmentSlotDef {
  id: string;
  label: string;
  description?: string | null;
  accept: AcceptPreset;
  required: boolean;
}

export interface HiringFormConfig {
  welcome_message?: string | null;
  questions: QuestionDef[];
  attachments: AttachmentSlotDef[];
}

export interface HiringFormResponse {
  published: {
    id: string | null; // null when this is the default V0 fallback
    version: number;
    config: HiringFormConfig;
    updated_at: string | null;
    is_default?: boolean;
  } | null;
  draft: {
    id: string;
    config: HiringFormConfig;
    updated_at: string;
  } | null;
}

export const useHiringForm = (
  storeId: string | undefined,
): UseQueryResult<HiringFormResponse, Error> => {
  return useQuery<HiringFormResponse, Error>({
    queryKey: ["hiring", "form", storeId],
    queryFn: async () => {
      const res = await api.get(`/admin/hiring/stores/${storeId}/form`);
      return res.data;
    },
    enabled: !!storeId,
  });
};

/** Draft 저장 (upsert). 지원자에게는 영향 없음. */
export const useSaveHiringFormDraft = (
  storeId: string,
): UseMutationResult<
  { id: string; config: HiringFormConfig; updated_at: string },
  Error,
  HiringFormConfig
> => {
  const qc = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<
    { id: string; config: HiringFormConfig; updated_at: string },
    Error,
    HiringFormConfig
  >({
    mutationFn: async (config: HiringFormConfig) => {
      const res = await api.put(`/admin/hiring/stores/${storeId}/form`, { config });
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hiring", "form", storeId] });
      success("Draft saved.");
    },
    onError: error("Couldn't save draft"),
  });
};

/** Draft → Published 승격. 새 지원자부터 새 폼이 보임. */
export const usePublishHiringForm = (
  storeId: string,
): UseMutationResult<
  { id: string; version: number; config: HiringFormConfig; updated_at: string },
  Error,
  void
> => {
  const qc = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<
    { id: string; version: number; config: HiringFormConfig; updated_at: string },
    Error,
    void
  >({
    mutationFn: async () => {
      const res = await api.post(`/admin/hiring/stores/${storeId}/form/publish`);
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hiring", "form", storeId] });
      success("Form published.");
    },
    onError: error("Couldn't publish form"),
  });
};

/** Draft 폐기. Published 폼은 영향 없음. */
export const useDiscardHiringFormDraft = (
  storeId: string,
): UseMutationResult<{ discarded: boolean }, Error, void> => {
  const qc = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<{ discarded: boolean }, Error, void>({
    mutationFn: async () => {
      const res = await api.delete(`/admin/hiring/stores/${storeId}/form/draft`);
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hiring", "form", storeId] });
      success("Draft discarded.");
    },
    onError: error("Couldn't discard draft"),
  });
};

// ────────────────────────────────────────────────────────────────
// Applications
// ────────────────────────────────────────────────────────────────
export type ApplicationStage =
  | "pending_form"
  | "new"
  | "reviewing"
  | "interview"
  | "hired"
  | "rejected"
  | "withdrawn";

export interface ApplicationListItem {
  id: string;
  candidate_id: string;
  store_id: string;
  attempt_no: number;
  stage: ApplicationStage;
  score: number | null;
  review_count: number;
  interview_at: string | null;
  notes: string | null;
  submitted_at: string;
  updated_at: string;
  candidate: {
    id: string;
    username: string;
    email: string;
    full_name: string;
    phone: string | null;
    email_verified: boolean;
    promoted_user_id: string | null;
  };
}

export interface ApplicationReview {
  id: string;
  reviewer_id: string;
  reviewer_username: string;
  reviewer_full_name: string;
  reviewer_role_priority: number | null;
  score: number | null;
  comment: string | null;
  created_at: string;
  updated_at: string;
  is_mine: boolean;
}

export interface ApplicationListResponse {
  items: ApplicationListItem[];
  counts: Record<ApplicationStage, number>;
}

export const useApplications = (
  storeId: string | undefined,
  stage?: string,
): UseQueryResult<ApplicationListResponse, Error> => {
  return useQuery({
    queryKey: ["hiring", "applications", storeId, stage ?? "all"],
    queryFn: async () => {
      const res = await api.get(
        `/admin/hiring/stores/${storeId}/applications`,
        { params: stage ? { stage } : undefined },
      );
      return res.data;
    },
    enabled: !!storeId,
  });
};

export interface ApplicationDetail extends ApplicationListItem {
  data: {
    answers: Array<{ question_id: string; label: string; type: string; value: unknown }>;
    attachments: Array<{
      slot_id: string;
      label: string;
      file_key: string;
      file_name: string;
      file_size: number;
      mime_type: string;
    }>;
  };
  form_config: HiringFormConfig | null;
  history: Array<{
    id: string;
    attempt_no: number;
    stage: ApplicationStage;
    submitted_at: string;
  }>;
  audit_log: Array<{
    action: "stage" | "score" | "notes" | "interview_at";
    before: unknown;
    after: unknown;
    by_user_id: string | null;
    by_username: string;
    by_full_name: string;
    at: string;
    note?: string;
  }>;
  is_blocked: boolean;
  block: { reason: string | null; created_at: string } | null;
  reviews: ApplicationReview[];
}

export const useUpsertMyReview = (
  applicationId: string,
): UseMutationResult<
  ApplicationReview,
  Error,
  { score?: number | null; comment?: string | null }
> => {
  const qc = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<
    ApplicationReview,
    Error,
    { score?: number | null; comment?: string | null }
  >({
    mutationFn: async (body) => {
      const res = await api.put(
        `/admin/hiring/applications/${applicationId}/reviews/me`,
        body,
      );
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hiring", "application", applicationId] });
      qc.invalidateQueries({ queryKey: ["hiring", "applications"] });
      success("Review saved.");
    },
    onError: error("Couldn't save review"),
  });
};

export const useDeleteMyReview = (
  applicationId: string,
): UseMutationResult<void, Error, void> => {
  const qc = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<void, Error, void>({
    mutationFn: async () => {
      await api.delete(
        `/admin/hiring/applications/${applicationId}/reviews/me`,
      );
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hiring", "application", applicationId] });
      qc.invalidateQueries({ queryKey: ["hiring", "applications"] });
      success("Review deleted.");
    },
    onError: error("Couldn't delete review"),
  });
};

export const useApplicationDetail = (
  applicationId: string | undefined,
): UseQueryResult<ApplicationDetail, Error> => {
  return useQuery({
    queryKey: ["hiring", "application", applicationId],
    queryFn: async () => {
      const res = await api.get(`/admin/hiring/applications/${applicationId}`);
      return res.data;
    },
    enabled: !!applicationId,
  });
};

export const usePatchApplication = (
  storeId: string,
): UseMutationResult<
  ApplicationListItem,
  Error,
  { applicationId: string; patch: Partial<{ stage: ApplicationStage; score: number; notes: string; interview_at: string }> }
> => {
  const qc = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<
    ApplicationListItem,
    Error,
    { applicationId: string; patch: Partial<{ stage: ApplicationStage; score: number; notes: string; interview_at: string }> }
  >({
    mutationFn: async ({ applicationId, patch }) => {
      const res = await api.patch(
        `/admin/hiring/applications/${applicationId}`,
        patch,
      );
      return res.data;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["hiring", "applications", storeId] });
      qc.invalidateQueries({ queryKey: ["hiring", "application", vars.applicationId] });
      success("Application updated.");
    },
    onError: error("Couldn't update application"),
  });
};

export const useHireApplication = (
  storeId: string,
): UseMutationResult<
  { user_id: string; username: string; application_id: string; stage: string },
  Error,
  { applicationId: string; usernameOverride?: string; userId?: string; clockinPin?: string }
> => {
  const qc = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<
    { user_id: string; username: string; application_id: string; stage: string },
    Error,
    { applicationId: string; usernameOverride?: string; userId?: string; clockinPin?: string }
  >({
    mutationFn: async ({ applicationId, usernameOverride, userId, clockinPin }) => {
      const res = await api.post(
        `/admin/hiring/applications/${applicationId}/hire`,
        { username_override: usernameOverride, user_id: userId, clockin_pin: clockinPin },
      );
      return res.data;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["hiring", "applications", storeId] });
      qc.invalidateQueries({ queryKey: ["hiring", "application", vars.applicationId] });
      qc.invalidateQueries({ queryKey: ["users"] });
      success("Applicant hired.");
    },
    onError: error("Couldn't hire applicant"),
  });
};

export const useUnhireApplication = (
  storeId: string,
): UseMutationResult<
  { application_id: string; stage: string; user_id: string | null; removed_user_store: boolean },
  Error,
  string
> => {
  const qc = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<
    { application_id: string; stage: string; user_id: string | null; removed_user_store: boolean },
    Error,
    string
  >({
    mutationFn: async (applicationId) => {
      const res = await api.post(
        `/admin/hiring/applications/${applicationId}/unhire`,
      );
      return res.data;
    },
    onSuccess: (_data, applicationId) => {
      qc.invalidateQueries({ queryKey: ["hiring", "applications", storeId] });
      qc.invalidateQueries({ queryKey: ["hiring", "application", applicationId] });
      qc.invalidateQueries({ queryKey: ["users"] });
      success("Hire reverted.");
    },
    onError: error("Couldn't revert hire"),
  });
};

export const useBlockApplication = (
  storeId: string,
): UseMutationResult<
  { blocked: boolean; reason?: string | null },
  Error,
  { applicationId: string; reason?: string }
> => {
  const qc = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<
    { blocked: boolean; reason?: string | null },
    Error,
    { applicationId: string; reason?: string }
  >({
    mutationFn: async ({ applicationId, reason }) => {
      const res = await api.post(
        `/admin/hiring/applications/${applicationId}/block`,
        { reason },
      );
      return res.data;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["hiring", "application", vars.applicationId] });
      qc.invalidateQueries({ queryKey: ["hiring", "applications", storeId] });
      success("Applicant blocked.");
    },
    onError: error("Couldn't block applicant"),
  });
};

export const useUnblockApplication = (
  storeId: string,
): UseMutationResult<{ blocked: boolean }, Error, string> => {
  const qc = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<{ blocked: boolean }, Error, string>({
    mutationFn: async (applicationId) => {
      const res = await api.delete(
        `/admin/hiring/applications/${applicationId}/block`,
      );
      return res.data;
    },
    onSuccess: (_data, applicationId) => {
      qc.invalidateQueries({ queryKey: ["hiring", "application", applicationId] });
      qc.invalidateQueries({ queryKey: ["hiring", "applications", storeId] });
      success("Applicant unblocked.");
    },
    onError: error("Couldn't unblock applicant"),
  });
};
