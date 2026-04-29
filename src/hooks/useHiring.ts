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
    },
  });
};

/** primary 사진 변경. */
export const useSetPrimaryPhoto = (
  storeId: string,
): UseMutationResult<void, Error, string> => {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: async (photoId) => {
      await api.patch(`/admin/stores/${storeId}/cover-photos/${photoId}/primary`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hiring", "photos", storeId] });
    },
  });
};

/** 사진 삭제. */
export const useDeleteCoverPhoto = (
  storeId: string,
): UseMutationResult<void, Error, string> => {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: async (photoId) => {
      await api.delete(`/admin/stores/${storeId}/cover-photos/${photoId}`);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hiring", "photos", storeId] });
    },
  });
};

/** 가입 토글. */
export const useSetAcceptingSignups = (
  storeId: string,
): UseMutationResult<{ accepting_signups: boolean }, Error, boolean> => {
  const qc = useQueryClient();
  return useMutation<{ accepting_signups: boolean }, Error, boolean>({
    mutationFn: async (accepting) => {
      const res: AxiosResponse<{ accepting_signups: boolean }> = await api.patch(
        `/admin/stores/${storeId}/accepting-signups`,
        { accepting_signups: accepting },
      );
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["stores"] });
      qc.invalidateQueries({ queryKey: ["stores", storeId] });
    },
  });
};

// ────────────────────────────────────────────────────────────────
// Hiring Form (Builder)
// ────────────────────────────────────────────────────────────────
export type QuestionType = "text" | "number" | "single_choice" | "multi_choice";

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
  accept: AcceptPreset;
  required: boolean;
}

export interface HiringFormConfig {
  welcome_message?: string | null;
  questions: QuestionDef[];
  attachments: AttachmentSlotDef[];
}

export const useHiringForm = (
  storeId: string | undefined,
): UseQueryResult<{ config: HiringFormConfig }, Error> => {
  return useQuery<{ config: HiringFormConfig }, Error>({
    queryKey: ["hiring", "form", storeId],
    queryFn: async () => {
      const res = await api.get(`/admin/hiring/stores/${storeId}/form`);
      return res.data;
    },
    enabled: !!storeId,
  });
};

export const useSaveHiringForm = (
  storeId: string,
): UseMutationResult<{ config: HiringFormConfig }, Error, HiringFormConfig> => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (config: HiringFormConfig) => {
      const res = await api.put(`/admin/hiring/stores/${storeId}/form`, { config });
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["hiring", "form", storeId] });
    },
  });
};

// ────────────────────────────────────────────────────────────────
// Applications
// ────────────────────────────────────────────────────────────────
export type ApplicationStage =
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
  is_blocked: boolean;
  block: { reason: string | null; created_at: string } | null;
}

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
  return useMutation({
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
    },
  });
};

export const useHireApplication = (
  storeId: string,
): UseMutationResult<
  { user_id: string; username: string; application_id: string; stage: string },
  Error,
  { applicationId: string; usernameOverride?: string }
> => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ applicationId, usernameOverride }) => {
      const res = await api.post(
        `/admin/hiring/applications/${applicationId}/hire`,
        { username_override: usernameOverride },
      );
      return res.data;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["hiring", "applications", storeId] });
      qc.invalidateQueries({ queryKey: ["hiring", "application", vars.applicationId] });
      qc.invalidateQueries({ queryKey: ["users"] });
    },
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
  return useMutation({
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
    },
  });
};

export const useUnblockApplication = (
  storeId: string,
): UseMutationResult<{ blocked: boolean }, Error, string> => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (applicationId) => {
      const res = await api.delete(
        `/admin/hiring/applications/${applicationId}/block`,
      );
      return res.data;
    },
    onSuccess: (_data, applicationId) => {
      qc.invalidateQueries({ queryKey: ["hiring", "application", applicationId] });
      qc.invalidateQueries({ queryKey: ["hiring", "applications", storeId] });
    },
  });
};
