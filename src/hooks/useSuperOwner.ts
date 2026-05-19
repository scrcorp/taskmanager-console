/**
 * Super Owner 관련 hook — 정보 조회 + 양도.
 *
 * Super Owner = 조직 관리자 (priority=5). 조직당 1명, 매장 운영 비참여, 알림 비대상.
 * 조직 setup 시 자동 생성 (username=organization.name / password=1234, 첫 로그인 시 강제 변경).
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";

interface SuperOwnerStatus {
  exists: boolean;
  username: string | null;
}

export function useSuperOwnerStatus() {
  return useQuery<SuperOwnerStatus>({
    queryKey: ["super-owner-status"],
    queryFn: async () => {
      const res = await api.get("/console/super-owner/status");
      return res.data;
    },
  });
}

interface TransferSuperOwnerRequest {
  target_user_id: string;
  current_password: string;
}

interface TransferSuperOwnerResponse {
  message: string;
  new_super_owner_user_id: string;
  new_super_owner_username: string;
}

export function useTransferSuperOwner() {
  const queryClient = useQueryClient();
  return useMutation<TransferSuperOwnerResponse, Error, TransferSuperOwnerRequest>({
    mutationFn: async (data) => {
      const res = await api.post("/console/super-owner/transfer", data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["super-owner-status"] });
      queryClient.invalidateQueries({ queryKey: ["me"] });
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });
}

