/**
 * Attendance Device & Access Code 관련 React Query 훅.
 *
 * 매장 공용 태블릿(Attendance Device) 목록/수정/해제,
 * 서비스별 access code 조회/회전을 위한 훅들.
 */

import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
  type UseMutationResult,
  type QueryClient,
} from "@tanstack/react-query";
import type { AxiosResponse } from "axios";
import api from "@/lib/api";
import { useMutationResult } from "@/lib/mutationResult";
import type { AttendanceDevice, AccessCode } from "@/types";

// ─── Attendance Devices ─────────────────────────────────────────────────────

/**
 * 등록된 attendance device 목록 조회.
 *
 * @param includeRevoked - 해제된 기기 포함 여부
 * @returns 기기 목록 쿼리 결과
 */
export const useAttendanceDevices = (
  includeRevoked: boolean = false,
): UseQueryResult<AttendanceDevice[], Error> => {
  return useQuery<AttendanceDevice[], Error>({
    queryKey: ["attendance-devices", { includeRevoked }],
    queryFn: async (): Promise<AttendanceDevice[]> => {
      const response: AxiosResponse<AttendanceDevice[]> = await api.get(
        "/admin/attendance-devices",
        { params: { include_revoked: includeRevoked } },
      );
      return response.data;
    },
  });
};

/** 기기 이름 수정 요청 데이터 타입 */
interface UpdateDeviceData {
  id: string;
  device_name: string;
}

/**
 * 기기 이름(device_name) 수정 뮤테이션.
 */
export const useUpdateAttendanceDevice = (): UseMutationResult<
  AttendanceDevice,
  Error,
  UpdateDeviceData
> => {
  const queryClient: QueryClient = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<AttendanceDevice, Error, UpdateDeviceData>({
    mutationFn: async ({
      id,
      device_name,
    }: UpdateDeviceData): Promise<AttendanceDevice> => {
      const response: AxiosResponse<AttendanceDevice> = await api.patch(
        `/admin/attendance-devices/${id}`,
        { device_name },
      );
      return response.data;
    },
    onSuccess: (): void => {
      queryClient.invalidateQueries({ queryKey: ["attendance-devices"] });
      success("Device updated.");
    },
    onError: error("Couldn't update device"),
  });
};

/**
 * 기기 해제(revoke) 뮤테이션 — DELETE.
 */
export const useRevokeAttendanceDevice = (): UseMutationResult<
  void,
  Error,
  string
> => {
  const queryClient: QueryClient = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<void, Error, string>({
    mutationFn: async (id: string): Promise<void> => {
      await api.delete(`/admin/attendance-devices/${id}`);
    },
    onSuccess: (): void => {
      queryClient.invalidateQueries({ queryKey: ["attendance-devices"] });
      success("Device revoked.");
    },
    onError: error("Couldn't revoke device"),
  });
};

// ─── Access Codes ───────────────────────────────────────────────────────────

/**
 * 서비스 키별 access code 조회.
 *
 * @param serviceKey - 예: "attendance"
 */
export const useAccessCode = (
  serviceKey: string,
): UseQueryResult<AccessCode, Error> => {
  return useQuery<AccessCode, Error>({
    queryKey: ["access-codes", serviceKey],
    queryFn: async (): Promise<AccessCode> => {
      const response: AxiosResponse<AccessCode> = await api.get(
        `/admin/access-codes/${serviceKey}`,
      );
      return response.data;
    },
    enabled: !!serviceKey,
  });
};

/**
 * Access code 회전(재발급) 뮤테이션.
 */
export const useRotateAccessCode = (): UseMutationResult<
  AccessCode,
  Error,
  string
> => {
  const queryClient: QueryClient = useQueryClient();
  const { success, error } = useMutationResult();
  return useMutation<AccessCode, Error, string>({
    mutationFn: async (serviceKey: string): Promise<AccessCode> => {
      const response: AxiosResponse<AccessCode> = await api.post(
        `/admin/access-codes/${serviceKey}/rotate`,
      );
      return response.data;
    },
    onSuccess: (newCode: AccessCode): void => {
      queryClient.setQueryData<AccessCode>(
        ["access-codes", newCode.service_key],
        newCode,
      );
      success("Regenerated.");
    },
    onError: error("Couldn't rotate access code"),
  });
};
