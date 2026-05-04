/**
 * Profile hooks — 본인 프로필 (preferred_language 등) 업데이트.
 *
 * 서버는 admin/app 공통 `/api/v1/app/profile` PUT 사용.
 * 인증된 사용자라면 누구나 자신의 프로필을 변경 가능.
 */

import { useMutation, type UseMutationResult } from "@tanstack/react-query";
import type { AxiosResponse } from "axios";
import api from "@/lib/api";
import { useAuthStore } from "@/stores/authStore";
import type { PreferredLanguage } from "@/types";

interface ProfileResponse {
  id: string;
  username: string;
  full_name: string;
  email: string | null;
  role_name: string;
  organization_id: string;
  preferred_language: PreferredLanguage;
}

export const useUpdatePreferredLanguage = (): UseMutationResult<ProfileResponse, Error, PreferredLanguage> => {
  const fetchMe = useAuthStore((s) => s.fetchMe);
  return useMutation<ProfileResponse, Error, PreferredLanguage>({
    mutationFn: async (preferred_language) => {
      const res: AxiosResponse<ProfileResponse> = await api.put("/app/profile", { preferred_language });
      return res.data;
    },
    onSuccess: () => {
      // /me 응답에 preferred_language 포함되므로 user store 동기화
      void fetchMe();
    },
  });
};
