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
