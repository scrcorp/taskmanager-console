/**
 * 알림 선호 (사용자별 in-app/email 토글) hooks.
 *
 * 서버 응답에 카테고리 메타까지 포함되므로 클라이언트는 그대로 렌더만 한다.
 * - GET /admin/profile/alert-preferences → categories + preferences
 * - PUT /admin/profile/alert-preferences → 부분 업데이트
 */
import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
  type UseMutationResult,
} from "@tanstack/react-query";
import api from "@/lib/api";
import { useMutationResult } from "@/lib/mutationResult";

export interface AlertCategoryMeta {
  code: string;
  label: string;
  description: string;
  email_available: boolean;
}

export interface AlertCategoryChannel {
  in_app?: boolean | null;
  email?: boolean | null;
}

export interface AlertPreferencesResponse {
  categories: AlertCategoryMeta[];
  preferences: Record<string, AlertCategoryChannel>;
}

export interface AlertPreferencesUpdate {
  preferences: Record<string, AlertCategoryChannel>;
}

export const useAlertPreferences = (): UseQueryResult<
  AlertPreferencesResponse,
  Error
> => {
  return useQuery<AlertPreferencesResponse, Error>({
    queryKey: ["alert-preferences"],
    queryFn: async () => {
      const res = await api.get<AlertPreferencesResponse>(
        "/admin/profile/alert-preferences",
      );
      return res.data;
    },
  });
};

export const useUpdateAlertPreferences = (): UseMutationResult<
  AlertPreferencesResponse,
  unknown,
  AlertPreferencesUpdate
> => {
  const qc: ReturnType<typeof useQueryClient> = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation({
    mutationFn: async (data: AlertPreferencesUpdate) => {
      const res = await api.put<AlertPreferencesResponse>(
        "/admin/profile/alert-preferences",
        data,
      );
      return res.data;
    },
    onSuccess: (data) => {
      qc.setQueryData(["alert-preferences"], data);
      success("Alert preferences saved.");
    },
    onError: error("Couldn't save alert preferences"),
  });
};
