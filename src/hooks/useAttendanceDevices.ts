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
import api, { getErrorCode } from "@/lib/api";
import { useMutationResult } from "@/lib/mutationResult";
import type { AttendanceDevice, AccessCode } from "@/types";

// ─── Attendance Devices ─────────────────────────────────────────────────────

/**
 * 등록된 attendance device 목록 조회. revoke 시 즉시 삭제되므로 모든 row 가 활성.
 */
export const useAttendanceDevices = (): UseQueryResult<
  AttendanceDevice[],
  Error
> => {
  return useQuery<AttendanceDevice[], Error>({
    queryKey: ["attendance-devices"],
    queryFn: async (): Promise<AttendanceDevice[]> => {
      const response: AxiosResponse<AttendanceDevice[]> = await api.get(
        "/console/attendance-devices",
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
        `/console/attendance-devices/${id}`,
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
      await api.delete(`/console/attendance-devices/${id}`);
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
        `/console/access-codes/${serviceKey}`,
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
        `/console/access-codes/${serviceKey}/rotate`,
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

/** Access code 직접 설정 요청 데이터 타입 */
interface SetAccessCodeData {
  serviceKey: string;
  code: string;
}

/**
 * Access code 직접 설정 뮤테이션 (관리자가 값 지정).
 *
 * 서버가 소문자를 대문자로 정규화해 저장하고 source 를 "manual" 로 바꾼다.
 * 409 access_code_taken(타 조직 사용 중)은 전용 메시지 모달 — 나머지는
 * 일반 에러 모달 (payroll 패턴: 모달은 여기서 한 번만).
 */
export const useSetAccessCode = (): UseMutationResult<
  AccessCode,
  Error,
  SetAccessCodeData
> => {
  const queryClient: QueryClient = useQueryClient();
  const { success, error, rawError } = useMutationResult();
  return useMutation<AccessCode, Error, SetAccessCodeData>({
    mutationFn: async ({
      serviceKey,
      code,
    }: SetAccessCodeData): Promise<AccessCode> => {
      const response: AxiosResponse<AccessCode> = await api.put(
        `/console/access-codes/${serviceKey}`,
        { code },
      );
      return response.data;
    },
    onSuccess: (newCode: AccessCode): void => {
      queryClient.setQueryData<AccessCode>(
        ["access-codes", newCode.service_key],
        newCode,
      );
      success("Access code updated.");
    },
    onError: (err: Error): void => {
      if (getErrorCode(err) === "access_code_taken") {
        rawError(
          "This code is already used by another organization. Choose a different code.",
          { title: "Couldn't update access code" },
        );
        return;
      }
      error("Couldn't update access code")(err);
    },
  });
};
